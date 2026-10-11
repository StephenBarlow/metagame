'use strict';

const {
  evaluateAchievement, gameTagCombinationMatches, maximumPossibleScore,
  teamCombinationMatches
} = require('./evaluators');
const {
  candidateWeeks, fixedPick, opportunities, pairKey, possibleResults,
  remainingWeeks, timestamp, unscored, withPick
} = require('./availability-context');

const available = reason => ({ status: 'AVAILABLE', ...(reason ? { reason } : {}) });
const locked = reason => ({ status: 'LOCKED_OUT', reason });

function matchesRecordedPick(achievement, context, member, week) {
  return evaluateAchievement(achievement, { ...context, week })
    .some(candidate => String(candidate.userId) === String(member.user_id));
}

function resultMatches(achievement, context, member, pick, result) {
  const hypothetical = withPick(context, member, pick, result);
  // Individual result evaluators do not depend on other members' picks.
  hypothetical.members = [member];
  return evaluateAchievement(achievement, hypothetical).length > 0;
}

function resultPossible(achievement, context, member, pick) {
  return possibleResults(pick, achievement.condition_config).some(result =>
    resultMatches(achievement, context, member, pick, result));
}

function outcomePossible(pick, outcomes) {
  return possibleResults(pick).some(result => outcomes.includes(result.outcome));
}

function pairAvailability(achievement, context, member, predicate, reason, weeks) {
  for (const week of weeks || candidateWeeks(achievement, context, member)) {
    if (opportunities(context, member, week).pairs.some(pick => predicate(pick, week))) {
      return available(`A qualifying pick remains possible in week ${week}.`);
    }
  }
  return locked(reason);
}

function teamCombinationAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick =>
    teamCombinationMatches(member.user_id, pick.week, achievement.condition_config,
      withPick(context, member, pick)),
  'No remaining legal pair matches the required teams or team tags.');
}

function gameTagAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick =>
    gameTagCombinationMatches(member.user_id, pick.week, achievement.condition_config,
      withPick(context, member, pick)),
  'No remaining legal pair includes enough games with the required tags.');
}

function firstAndLastAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick => {
    const hypothetical = withPick(context, member, pick);
    hypothetical.members = [member];
    return evaluateAchievement(achievement, hypothetical).length > 0;
  }, 'No remaining week allows picking both its uniquely first and last games.');
}

function resultAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick =>
    resultPossible(achievement, context, member, pick),
  'No remaining legal pair can produce the required result or score.');
}

function pickedGameResultAvailability(achievement, context, member) {
  const config = achievement.condition_config;
  return pairAvailability(achievement, context, member, pick => {
    if (pick.games.every(game => !unscored(game))) {
      return resultMatches(achievement, context, member, pick);
    }
    if (config.result === 'tie') {
      return pick.games.some(game => unscored(game) || game.away_team_score === game.home_team_score);
    }
    if (config.result === 'shutout') {
      return pick.games.some(game => unscored(game) || game.away_team_score === 0 || game.home_team_score === 0) &&
        outcomePossible(pick, ['double_win', 'double_loss']);
    }
    return false;
  }, 'No remaining legal pair can include the required game result.');
}

function matchingFinalScoresAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick => {
    if (String(pick.games[0].id) === String(pick.games[1].id)) return false;
    return pick.games.some(unscored) || resultMatches(achievement, context, member, pick);
  }, 'No remaining legal pair can have matching final game scores.');
}

function maximumScoreAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick => {
    const games = context.gamesByWeek.get(pick.week) || [];
    if (games.every(game => !unscored(game))) {
      return resultMatches(achievement, context, member, pick);
    }
    if (pick.games.some(unscored)) return true; // Future football scores have no fixed upper bound.
    const knownMaximum = maximumPossibleScore({
      ...context, week: pick.week,
      gamesByWeek: new Map([[pick.week, games.filter(game => !unscored(game))]])
    });
    return possibleResults(pick).some(result => result.score >= knownMaximum);
  }, 'No remaining legal pair can attain the maximum score for its week.');
}

function favoriteTeamAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick => {
    const favorites = member.favorite_team_id == null
      ? pick.teams.map(team => team.id) : [member.favorite_team_id];
    return favorites.some(id => resultPossible(achievement, context,
      { ...member, favorite_team_id: id }, pick));
  }, 'Your favorite team is no longer available in a pair with the required result.');
}

function favoriteOpponentAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick => {
    const favorites = member.favorite_team_id == null
      ? pick.games.flatMap((game, index) => [...context.teamsById.values()]
        .filter(team => team.short_name !== pick.teams[index].short_name &&
          [game.away_team_short_name, game.home_team_short_name].includes(team.short_name))
        .map(team => team.id))
      : [member.favorite_team_id];
    return favorites.some(id => resultPossible(achievement, context,
      { ...member, favorite_team_id: id }, pick));
  }, 'No available opponent of your favorite team can produce the required result.');
}

function otherFavoritesAvailability(achievement, context, member) {
  const others = context.members.filter(row => String(row.user_id) !== String(member.user_id));
  const knownFavorites = new Set(others.map(row => context.teamsById.get(String(row.favorite_team_id))?.short_name));
  const unsetFavorites = others.filter(row => row.favorite_team_id == null).length;
  return pairAvailability(achievement, context, member, pick => {
    const required = achievement.evaluator === 'otherMembersFavoriteTeamsResult'
      ? pick.teams.map(team => team.short_name)
      : pick.games.map((game, index) => game.away_team_short_name === pick.teams[index].short_name
        ? game.home_team_short_name : game.away_team_short_name);
    // One member with an unset favorite cannot supply two different favorites.
    const missing = new Set(required.filter(team => !knownFavorites.has(team)));
    return missing.size <= unsetFavorites && outcomePossible(pick, [achievement.condition_config.result]);
  }, "No remaining legal pair matches other members' favorite teams and the required result.");
}

function canChoosePair(context, member, week, pick) {
  const key = pairKey(pick);
  return opportunities(context, member, week).pairs.some(option => pairKey(option) === key);
}

function canAvoid(context, member, week, predicate) {
  const options = opportunities(context, member, week);
  return options.canBye || options.pairs.some(pick => !predicate(pick));
}

function matchingGroupAvailability(achievement, context, member) {
  const config = achievement.condition_config;
  const others = context.members.filter(row => String(row.user_id) !== String(member.user_id));
  const required = config.player_count_exact ?? config.other_player_count_at_least + 1;
  if (context.members.length < required) return locked(`This badge requires at least ${required} active league members.`);
  return pairAvailability(achievement, context, member, (pick, week) => {
    if (config.qualifying_outcomes && !outcomePossible(pick, config.qualifying_outcomes)) return false;
    const matching = other => canChoosePair(context, other, week, pick);
    if (others.filter(matching).length < required - 1) return false;
    if (config.player_count_exact !== undefined) {
      const forced = others.filter(other => !canAvoid(context, other, week,
        option => pairKey(option) === pairKey(pick))).length;
      if (forced > required - 1) return false;
    }
    return true;
  }, 'No remaining legal pair can be shared by the required number of players.');
}

function uniqueTeamAvailability(achievement, context, member) {
  const target = achievement.condition_config.team_short_name;
  return pairAvailability(achievement, context, member, (pick, week) =>
    pick.teams.some(team => team.short_name === target) && context.members.every(other =>
      String(other.user_id) === String(member.user_id) || canAvoid(context, other, week,
        option => option.teams.some(team => team.short_name === target))),
  `No remaining week allows you to be the only player picking ${target}.`);
}

function uniqueGamesAvailability(achievement, context, member) {
  const config = achievement.condition_config;
  const weeks = candidateWeeks(achievement, context, member).filter(week => week <= config.maximum_week);
  return pairAvailability(achievement, context, member, (pick, week) => {
    const uniqueGames = pick.games.filter(game => context.members.every(other =>
      String(other.user_id) === String(member.user_id) || canAvoid(context, other, week,
        option => option.games.some(selected => String(selected.id) === String(game.id)))));
    return new Set(uniqueGames.map(game => String(game.id))).size >= config.unique_game_count;
  }, `No qualifying unique-game pick remains through week ${config.maximum_week}.`, weeks);
}

function previousPairAvailability(achievement, context, member) {
  const others = context.members.filter(row => String(row.user_id) !== String(member.user_id));
  return pairAvailability(achievement, context, member, (pick, week) => {
    for (let previous = 1; previous < week; previous += 1) {
      if (others.some(other => {
        if (pairKey(context.getWeekPick(other.user_id, previous)) === pairKey(pick)) return true;
        return previous >= context.currentWeek && canChoosePair(context, other, previous, pick);
      })) return true;
    }
    return false;
  }, "No remaining legal pair can match another player's pick from an earlier week.");
}

function soleHoldoutAvailability(achievement, context, member) {
  const others = context.members.filter(row => String(row.user_id) !== String(member.user_id));
  if (!others.length) return locked('This badge requires another active league member.');
  for (const week of remainingWeeks(context)) {
    for (const team of context.teamsById.values()) {
      if (Number(team.id) === -1) continue;
      const hasPicked = (player, throughWeek) => context.picks.some(row =>
        row.invalidated_at === null && String(row.user_id) === String(player.user_id) &&
        String(row.team_id) === String(team.id) && Number(row.week) <= throughWeek &&
        fixedPick(context, player, Number(row.week)));
      if (hasPicked(member, week)) continue;
      if (others.every(other => hasPicked(other, week) || remainingWeeks(context)
        .filter(candidate => candidate <= week).some(candidate =>
          opportunities(context, other, candidate).pairs.some(pick =>
            pick.teams.some(selected => String(selected.id) === String(team.id)))))) {
        return available(`You could still be the sole holdout for ${team.short_name}.`);
      }
    }
  }
  return locked('No team remains that you can leave unpicked while every other active member picks it.');
}

function seasonalThresholdAvailability(achievement, context, member) {
  const config = achievement.condition_config;
  const pickedTeamUnit = config.occurrence_unit === 'picked_team';
  const contribution = pick => {
    if (pickedTeamUnit) return pick.games.filter(game => context.getGameTags(game).has(config.tag)).length;
    const hypothetical = withPick(context, member, pick);
    const matcher = config.base_evaluator === 'teamCombination' ? teamCombinationMatches : gameTagCombinationMatches;
    return matcher(member.user_id, pick.week, config, hypothetical) ? 1 : 0;
  };
  let earnedOccurrences = 0;
  for (let week = 1; week < context.currentWeek; week += 1) {
    const pick = context.getWeekPick(member.user_id, week);
    if (pick.picks.length === 2 && !pick.isBye && pick.games.every(Boolean)) earnedOccurrences += contribution(pick);
  }
  const needed = config.minimum_occurrences - earnedOccurrences;
  const choices = remainingWeeks(context).map(week => opportunities(context, member, week).pairs
    .map(pick => ({ pick, count: contribution(pick) })).filter(option => option.count > 0));
  const distinctTeams = new Set(choices.flatMap(options => options.flatMap(option =>
    option.pick.teams.map(team => String(team.id)))));
  if (!pickedTeamUnit && Math.floor(distinctTeams.size / 2) < Math.max(1, needed)) {
    return locked('Too few distinct qualifying teams remain to reach the seasonal threshold.');
  }

  // Find enough occurrences using disjoint teams and at most one pair per week.
  // This avoids counting the same remaining cat/bird or international team twice.
  function canReach(index, deficit, used) {
    if (deficit <= 0) return true;
    if (choices.slice(index).reduce((sum, options) => sum + Math.max(0, ...options.map(row => row.count)), 0) < deficit) return false;
    for (let next = index; next < choices.length; next += 1) {
      for (const option of choices[next]) {
        const ids = option.pick.teams.map(team => String(team.id));
        if (ids.some(id => used.has(id))) continue;
        if (canReach(next + 1, deficit - option.count, new Set([...used, ...ids]))) return true;
      }
    }
    return false;
  }
  return canReach(0, Math.max(1, needed), new Set())
    ? available('Enough distinct qualifying picks remain to reach the seasonal threshold.')
    : locked('Too few distinct qualifying teams and weeks remain to reach the seasonal threshold.');
}

function opponentCountAvailability(achievement, context, member) {
  const threshold = achievement.condition_config.opponent_pick_count_at_least;
  const previousCounts = new Map();
  for (let week = 1; week < context.currentWeek; week += 1) {
    const pick = context.getWeekPick(member.user_id, week);
    pick.teams.forEach((team, index) => {
      const game = pick.games[index];
      if (!team || !game) return;
      const opponent = game.away_team_short_name === team.short_name ? game.home_team_short_name : game.away_team_short_name;
      previousCounts.set(opponent, (previousCounts.get(opponent) || 0) + 1);
    });
  }
  for (const opponent of context.teamsById.values()) {
    const choices = remainingWeeks(context).map(week => new Set(opportunities(context, member, week).pairs.flatMap(pick =>
      pick.teams.filter((team, index) => team.short_name !== opponent.short_name &&
        [pick.games[index].away_team_short_name, pick.games[index].home_team_short_name].includes(opponent.short_name))
        .map(team => String(team.id)))));
    // Maximum matching between future weeks and distinct opponent teams.
    // A divisional rematch cannot contribute the same picked team twice.
    const assigned = new Map();
    function assign(week, visited) {
      for (const teamId of choices[week]) {
        if (visited.has(teamId)) continue;
        visited.add(teamId);
        if (!assigned.has(teamId) || assign(assigned.get(teamId), visited)) {
          assigned.set(teamId, week);
          return true;
        }
      }
      return false;
    }
    choices.forEach((_, week) => assign(week, new Set()));
    if ((previousCounts.get(opponent.short_name) || 0) + assigned.size >= threshold) {
      return available(`You could still pick opponents of ${opponent.short_name} ${threshold} times.`);
    }
  }
  return locked('No team has enough distinct pickable opponents left to reach the required count.');
}

function byePatternAvailability(achievement, context, member) {
  const config = achievement.condition_config;
  const count = config.consecutive_weeks || 1;
  const endings = achievement.evaluator === 'weekPickPattern' ? [config.week]
    : achievement.evaluator === 'finalWeekPickPattern' ? [context.maxScheduledWeek]
      : remainingWeeks(context);
  for (const end of endings) {
    if (end < context.currentWeek || end - count + 1 < 1) continue;
    let futureByes = 0;
    let possible = true;
    for (let week = end - count + 1; week <= end; week += 1) {
      const options = opportunities(context, member, week);
      if (week < context.currentWeek) {
        if (!options.actual.isBye) possible = false;
      } else {
        if (!options.canBye) possible = false;
        futureByes += 1;
      }
    }
    const budget = opportunities(context, member, Math.max(context.currentWeek, end)).byesRemaining;
    if (possible && futureByes <= budget) return available(`The required bye pattern remains possible through week ${end}.`);
  }
  return locked('The required bye weeks have passed, are fixed as non-bye picks, or exceed your remaining bye allowance.');
}

function submissionHistoryAvailability(achievement, context, member) {
  const required = achievement.condition_config.unique_non_bye_team_count_at_least;
  for (const week of remainingWeeks(context)) {
    const options = opportunities(context, member, week);
    if (options.fixed) continue;
    const teams = new Set(context.getHistory(member.user_id, week)
      .filter(row => Number(row.team_id) !== -1).map(row => String(row.team_id)));
    for (const pick of options.pairs) for (const team of pick.teams) teams.add(String(team.id));
    if (options.pairs.length && teams.size >= required) {
      return available(`Enough teams remain to submit ${required} unique teams in week ${week}.`);
    }
  }
  return locked('No editable week has enough teams to reach the submission-history threshold.');
}

function earlySubmissionAvailability(achievement, context, member) {
  const leadTime = achievement.condition_config.weeks_in_advance_at_least * 7 * 24 * 60 * 60 * 1000;
  for (const week of remainingWeeks(context)) {
    if (context.getHistory(member.user_id, week).length) continue;
    const starts = (context.gamesByWeek.get(week) || []).map(game => timestamp(game.start_time));
    const options = opportunities(context, member, week);
    if (Math.min(...starts) - timestamp(context.asOf) >= leadTime && (options.pairs.length || options.canBye)) {
      return available(`An unchanged early pick can still be submitted for week ${week}.`);
    }
  }
  return locked('No untouched week remains far enough in advance to submit a qualifying pick.');
}

function lateSubmissionAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick =>
    !opportunities(context, member, pick.week).fixed &&
      Math.min(...pick.games.map(game => timestamp(game.start_time))) >= timestamp(context.asOf),
  'No editable non-bye pick remains that can be submitted near kickoff.');
}

function limitedGamesAvailability(achievement, context, member) {
  return pairAvailability(achievement, context, member, pick => {
    if (opportunities(context, member, pick.week).fixed) return false;
    const latestSubmission = Math.min(...pick.games.map(game => timestamp(game.start_time))) - 1;
    if (latestSubmission < timestamp(context.asOf)) return false;
    const remaining = (context.gamesByWeek.get(pick.week) || []).filter(game => timestamp(game.start_time) > latestSubmission);
    return remaining.length < achievement.condition_config.remaining_game_count_below;
  }, 'No editable legal pair can be submitted with fewer than the required number of games remaining.');
}

function byeOutcomesAvailability(achievement, context, member) {
  const outcomes = achievement.condition_config.qualifying_outcomes || ['split'];
  const weeks = new Set(remainingWeeks(context));
  for (const week of context.gamesByWeek.keys()) {
    if (context.getWeekPick(member.user_id, week).isBye &&
        (context.gamesByWeek.get(week) || []).some(unscored)) weeks.add(week);
  }
  for (const week of weeks) {
    if (!opportunities(context, member, week).canBye) continue;
    const others = context.members.filter(row => String(row.user_id) !== String(member.user_id));
    const blocked = others.some(other => {
      const options = opportunities(context, other, week);
      return options.fixed && options.pairs.length && !options.pairs.some(pick => outcomePossible(pick, outcomes));
    });
    const qualifying = others.some(other => opportunities(context, other, week).pairs
      .some(pick => outcomePossible(pick, outcomes)));
    if (!blocked && qualifying) return available(`A bye with the required league outcomes remains possible in week ${week}.`);
  }
  return locked('No remaining bye opportunity can coincide with the required non-bye league outcomes.');
}

function leagueScoresAvailability(achievement, context, member) {
  const minimumWeek = achievement.condition_config.minimum_week || 1;
  if (achievement.evaluator === 'matchingWeeklyScore' && context.members.length < 2) {
    return locked('This badge requires another active league member.');
  }
  const weeks = new Set(remainingWeeks(context));
  for (const [week, games] of context.gamesByWeek) if (games.some(unscored)) weeks.add(Number(week));
  for (const week of [...weeks].filter(candidate => candidate >= minimumWeek)) {
    const maximum = maximumReachableScore(context, member, week);
    const otherMinimums = context.members.filter(player => String(player.user_id) !== String(member.user_id))
      .map(player => minimumFixedScore(context, player, week));
    if (achievement.evaluator === 'overallStanding' && maximum <= Math.max(-Infinity, ...otherMinimums)) continue;
    if (achievement.evaluator === 'matchingWeeklyScore' && achievement.condition_config.score_must_be_nonzero && maximum === 0) continue;
    if (achievement.evaluator === 'nearAverageScore' &&
        otherMinimums.reduce((sum, score) => sum + score, 0) - maximum * otherMinimums.length >=
          achievement.condition_config.difference_from_average_below * context.members.length) continue;
    // Future scores and other players' choices remain uncertain. If any legal
    // pick can still change a cumulative score, conservatively retain the badge.
    if (context.members.some(player => opportunities(context, player, week).pairs
      .some(pick => pick.games.some(unscored)))) {
      return available(`Future league scores can still satisfy this badge in week ${week}.`);
    }
    if (context.members.some(player => {
      const options = opportunities(context, player, week);
      return !options.fixed && options.pairs.length && (options.pairs.length > 1 || options.canBye);
    })) return available(`Other players' editable picks can still change the standings in week ${week}.`);
    if (matchesRecordedPick(achievement, context, member, week)) return available(`The current standings qualify in week ${week}.`);
    for (const pick of opportunities(context, member, week).pairs) {
      if (evaluateAchievement(achievement, withPick(context, member, pick))
        .some(candidate => String(candidate.userId) === String(member.user_id))) {
        return available(`A remaining pick can still produce qualifying standings in week ${week}.`);
      }
    }
  }
  return locked('No remaining week can produce qualifying league standings.');
}

function minimumFixedScore(context, member, throughWeek) {
  let score = 0;
  for (let week = 1; week <= throughWeek; week += 1) {
    if (!fixedPick(context, member, week)) continue;
    const result = context.getWeekResult(member.user_id, week);
    if (result.complete) score += result.score;
  }
  return score;
}

function maximumReachableScore(context, member, throughWeek) {
  let score = 0;
  for (let week = 1; week <= throughWeek; week += 1) {
    const options = opportunities(context, member, week);
    let maximum = 0;
    for (const pick of options.pairs) {
      if (pick.games.some(unscored) && String(pick.games[0].id) !== String(pick.games[1].id)) return Infinity;
      maximum = Math.max(maximum, ...possibleResults(pick).map(result => result.score));
    }
    score += maximum;
  }
  return score;
}

function resultStreakAvailability(achievement, context, member) {
  const config = achievement.condition_config;
  let streak = 0;
  for (let week = 1; week < context.currentWeek; week += 1) {
    const result = context.getWeekResult(member.user_id, week);
    if (result.isBye && config.ignore_bye_weeks) continue;
    if (result.complete && config.qualifying_results.includes(result.outcome)) streak += 1;
    else if (!result.complete && opportunities(context, member, week).pairs
      .some(pick => outcomePossible(pick, config.qualifying_results))) streak += 1;
    else streak = 0;
  }
  const required = config.consecutive_weeks;
  const weeks = remainingWeeks(context);
  const teamIds = new Set(weeks.flatMap(week => opportunities(context, member, week).pairs
    .flatMap(pick => pick.teams.map(team => String(team.id)))));
  const maximumNonByeWeeks = Math.floor(teamIds.size / 2);
  // Keep possible streak lengths and bye use. A bye bridges a streak without
  // adding to it; an unavoidable contrary result resets it.
  let states = [{ streak, byes: 0, nonByes: 0 }];
  const byeBudget = weeks.length ? opportunities(context, member, weeks[0]).byesRemaining : 0;
  for (const week of weeks) {
    const options = opportunities(context, member, week);
    const qualifying = options.pairs.some(pick => outcomePossible(pick, config.qualifying_results));
    const next = [];
    for (const state of states) {
      if (qualifying && state.nonByes < maximumNonByeWeeks) {
        if (state.streak + 1 >= required) return available(`The streak could still reach ${required} non-bye weeks by week ${week}.`);
        next.push({ ...state, streak: state.streak + 1, nonByes: state.nonByes + 1 });
      }
      if (config.ignore_bye_weeks && options.canBye && state.byes < byeBudget) {
        next.push({ ...state, byes: state.byes + 1 });
      }
      next.push({ ...state, streak: 0 });
    }
    states = [...new Map(next.map(state => [`${state.streak}:${state.byes}:${state.nonByes}`, state])).values()];
  }
  return locked(`Too few qualifying non-bye weeks or distinct teams remain to complete a ${required}-week streak.`);
}

function badgeDroughtAvailability(achievement, context, member) {
  const count = Number(achievement.condition_config.week_count ?? 5);
  for (const end of [...context.gamesByWeek.keys()].map(Number).sort((a, b) => a - b)) {
    const first = end - count + 1;
    if (first < 1) continue;
    const firstStart = Math.min(...(context.gamesByWeek.get(first) || []).map(game => timestamp(game.start_time)));
    if (Number.isFinite(timestamp(member.created_at)) && timestamp(member.created_at) > firstStart) continue;
    if (!context.awards.some(award => award.invalidated_at == null &&
      String(award.user_id) === String(member.user_id) && String(award.achievement_id) !== String(achievement.id) &&
      Number(award.week) >= first && Number(award.week) <= end)) {
      return available(`A ${count}-week badge-free window remains possible through week ${end}.`);
    }
  }
  return locked('No full badge-free window remains after your membership began and your other awards.');
}

module.exports = {
  available, locked, matchesRecordedPick,
  teamCombinationAvailability, gameTagAvailability, firstAndLastAvailability,
  resultAvailability, pickedGameResultAvailability, matchingFinalScoresAvailability,
  maximumScoreAvailability, favoriteTeamAvailability, favoriteOpponentAvailability,
  otherFavoritesAvailability, matchingGroupAvailability, uniqueTeamAvailability,
  uniqueGamesAvailability, previousPairAvailability, soleHoldoutAvailability,
  seasonalThresholdAvailability, opponentCountAvailability, byePatternAvailability,
  submissionHistoryAvailability, earlySubmissionAvailability, lateSubmissionAvailability,
  limitedGamesAvailability, byeOutcomesAvailability, leagueScoresAvailability,
  resultStreakAvailability, badgeDroughtAvailability
};
