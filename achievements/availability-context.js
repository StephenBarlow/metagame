'use strict';

const { calculatePickTwoResult, scoreFromMargins } = require('./scoring');

// These are the existing Pick Two rules: two BYE rows per bye, four total,
// and picking both sides of a game is allowed only in week 18.
const BYE_ROW_LIMIT = 4;
const FINAL_WEEK = 18;
const caches = new WeakMap();

function timestamp(value) {
  return value == null ? NaN : new Date(value).getTime();
}

function cache(context) {
  if (!caches.has(context)) caches.set(context, new Map());
  return caches.get(context);
}

function fixedPick(context, member, week) {
  const pick = context.getWeekPick(member.user_id, week);
  return week < context.currentWeek || pick.games.some(game =>
    game && timestamp(game.start_time) < timestamp(context.asOf));
}

function remainingWeeks(context) {
  return [...context.gamesByWeek.keys()].map(Number)
    .filter(week => week >= context.currentWeek).sort((a, b) => a - b);
}

function scheduleIncomplete(context) {
  // NFL schedules have 18 regular-season weeks. Do not infer that a partial
  // schedule is the end of the season or that a TBD kickoff has already passed.
  return (context.league.sports_league === 'NFL' &&
    Array.from({ length: FINAL_WEEK }, (_, index) => index + 1)
      .some(week => !context.gamesByWeek.has(week))) ||
    context.games.some(game => !Number.isFinite(timestamp(game.start_time)));
}

function pairKey(pick) {
  return pick.picks.length === 2 && !pick.isBye
    ? pick.picks.map(row => String(row.team_id)).sort().join(':')
    : null;
}

function makePick(context, member, week, teams, games) {
  return {
    userId: member.user_id, week, teams, games, isBye: false,
    picks: teams.map(team => ({
      id: `availability:${week}:${team.id}`, user_id: member.user_id,
      team_id: team.id, week, created_at: context.asOf, invalidated_at: null
    }))
  };
}

function opportunities(context, member, week) {
  const memo = cache(context);
  const key = `${member.user_id}:${week}`;
  if (memo.has(key)) return memo.get(key);

  const actual = context.getWeekPick(member.user_id, week);
  const fixed = fixedPick(context, member, week);
  const used = new Set();
  let byeRows = 0;
  for (const otherWeek of new Set(context.picks.filter(row =>
    String(row.user_id) === String(member.user_id) && row.invalidated_at === null
  ).map(row => Number(row.week)))) {
    if (otherWeek === week || !fixedPick(context, member, otherWeek)) continue;
    for (const pick of context.getWeekPick(member.user_id, otherWeek).picks) {
      if (Number(pick.team_id) === -1) byeRows += 1;
      else used.add(String(pick.team_id));
    }
  }

  let pairs = [];
  if (fixed) {
    if (actual.picks.length === 2 && !actual.isBye &&
        actual.teams.every(Boolean) && actual.games.every(Boolean)) pairs = [actual];
  } else {
    const choices = [...context.teamsById.values()].flatMap(team => {
      if (Number(team.id) === -1 || used.has(String(team.id))) return [];
      const game = context.gameByWeekAndTeam.get(`${week}:${team.short_name}`);
      if (!game || timestamp(game.start_time) < timestamp(context.asOf)) return [];
      return [{ team, game }];
    });
    for (let first = 0; first < choices.length; first += 1) {
      for (let second = first + 1; second < choices.length; second += 1) {
        const a = choices[first];
        const b = choices[second];
        if (week !== FINAL_WEEK && String(a.game.id) === String(b.game.id)) continue;
        pairs.push(makePick(context, member, week, [a.team, b.team], [a.game, b.game]));
      }
    }
  }
  const result = {
    actual, fixed, pairs,
    canBye: fixed ? actual.isBye : byeRows < BYE_ROW_LIMIT,
    byesRemaining: Math.max(0, Math.floor((BYE_ROW_LIMIT - byeRows) / 2))
  };
  memo.set(key, result);
  return result;
}

function unscored(game) {
  return !game || game.away_team_score == null || game.home_team_score == null;
}

function candidateWeeks(achievement, context, member) {
  const weeks = new Set(remainingWeeks(context));
  // Retain past picks with outstanding final scores, even if the commissioner
  // has advanced the current week before recording their scores.
  for (const week of context.gamesByWeek.keys()) {
    const pick = context.getWeekPick(member.user_id, week);
    if (pick.picks.length === 2 && !pick.isBye && pick.games.some(unscored)) weeks.add(Number(week));
  }
  return [...weeks].filter(week => !alreadyAwardedWeek(achievement, context, member, week))
    .sort((a, b) => a - b);
}

function alreadyAwardedWeek(achievement, context, member, week) {
  return achievement.repeatable && context.awards.some(award =>
    award.invalidated_at == null && String(award.user_id) === String(member.user_id) &&
    String(award.achievement_id) === String(achievement.id) && Number(award.week) === week);
}

function withPick(context, member, pick, result) {
  return {
    ...context, week: pick.week,
    getWeekPick(userId, week) {
      return String(userId) === String(member.user_id) && week === pick.week
        ? pick : context.getWeekPick(userId, week);
    },
    getWeekResult(userId, week) {
      return String(userId) === String(member.user_id) && week === pick.week
        ? result || calculatePickTwoResult(pick) : context.getWeekResult(userId, week);
    }
  };
}

function possibleResults(pick, config = {}) {
  const actual = calculatePickTwoResult(pick);
  if (actual.complete) return [actual];

  // Existing badges constrain margins, totals, or outcomes. Include their
  // boundary values and complements of known margins rather than predicting
  // football scores or imposing an arbitrary maximum score.
  const values = new Set([0, 1]);
  for (const value of [config.total_score, config.total_score_at_least,
    config.total_score_at_most, config.one_team_score_at_least,
    config.combined_absolute_margin_at_most, ...(config.margins || [])]) {
    if (Number.isFinite(value)) values.add(Math.abs(value));
  }
  const known = pick.teams.map((team, index) => {
    const game = pick.games[index];
    if (unscored(game)) return null;
    return game.away_team_short_name === team.short_name
      ? game.away_team_score - game.home_team_score
      : game.home_team_score - game.away_team_score;
  });
  for (const margin of known.filter(value => value !== null)) {
    for (const value of [...values]) values.add(Math.abs(value - Math.abs(margin)));
  }
  const unknown = [...new Set([...values].flatMap(value => [value, -value]))];
  const results = [];
  for (const first of known[0] === null ? unknown : [known[0]]) {
    for (const second of known[1] === null ? unknown : [known[1]]) {
      // The two sides of the same game have opposite margins.
      if (String(pick.games[0].id) === String(pick.games[1].id) && first !== -second) continue;
      results.push({
        complete: true, isBye: false, ...scoreFromMargins(first, second),
        margins: [first, second], gameIds: pick.games.map(game => game.id)
      });
    }
  }
  return results;
}

module.exports = {
  alreadyAwardedWeek, candidateWeeks, fixedPick, opportunities, pairKey,
  possibleResults, remainingWeeks, scheduleIncomplete, timestamp, unscored, withPick
};
