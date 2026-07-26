'use strict';

const { scoreFromMargins } = require('./scoring');

function pickEvidence(weekPick, extra = {}) {
  return {
    pick_ids: weekPick.picks.map(pick => pick.id),
    team_ids: weekPick.picks.map(pick => pick.team_id),
    team_short_names: weekPick.teams.map(team => team?.short_name),
    game_ids: weekPick.games.filter(Boolean).map(game => game.id),
    ...extra
  };
}

function teamMatches(team, matcher) {
  if (!team) return false;
  if (matcher.short_name !== undefined) {
    const names = Array.isArray(matcher.short_name) ? matcher.short_name : [matcher.short_name];
    if (!names.includes(team.short_name)) return false;
  }
  if (matcher.tag !== undefined && !team.tags.has(matcher.tag)) return false;
  return true;
}

function requirementsMatchTeams(teams, requirements, context) {
  if (requirements.some(requirement => requirement.match?.same_attribute === 'division')) {
    return teams.length === 2 &&
      Boolean(context.getDivision(teams[0])) &&
      context.getDivision(teams[0]) === context.getDivision(teams[1]);
  }

  const slots = requirements.flatMap(requirement =>
    Array.from({ length: requirement.count || 1 }, () => requirement)
  );
  if (slots.length > teams.length) return false;

  function canAssign(slotIndex, remainingTeams) {
    if (slotIndex === slots.length) return true;
    const requirement = slots[slotIndex];
    return remainingTeams.some((team, teamIndex) => {
      const matches = requirement.any_match
        ? requirement.any_match.some(matcher => teamMatches(team, matcher))
        : teamMatches(team, requirement.match || {});
      if (!matches) return false;
      return canAssign(slotIndex + 1, remainingTeams.filter((_, index) => index !== teamIndex));
    });
  }

  return canAssign(0, teams);
}

function teamCombinationMatches(userId, week, config, context) {
  const weekPick = context.getWeekPick(userId, week);
  return weekPick.picks.length === 2 &&
    !weekPick.isBye &&
    requirementsMatchTeams(weekPick.teams, config.requirements || [], context);
}

function gameTagCombinationMatches(userId, week, config, context) {
  const weekPick = context.getWeekPick(userId, week);
  if (weekPick.picks.length !== 2 || weekPick.isBye || weekPick.games.some(game => !game)) return false;

  if (config.required_tags) {
    if (config.one_pick_per_tag) {
      function canAssign(tagIndex, remainingGames) {
        if (tagIndex === config.required_tags.length) return true;
        return remainingGames.some((game, gameIndex) =>
          context.getGameTags(game).has(config.required_tags[tagIndex]) &&
          canAssign(tagIndex + 1, remainingGames.filter((_, index) => index !== gameIndex))
        );
      }
      return canAssign(0, weekPick.games);
    }
    return config.required_tags.every(tag =>
      weekPick.games.some(game => context.getGameTags(game).has(tag))
    );
  }

  const requiredCount = config.picked_team_count ?? config.picked_team_count_at_least ?? 1;
  const matchingCount = weekPick.games.filter(game => context.getGameTags(game).has(config.tag)).length;
  return matchingCount >= requiredCount;
}

function playerWeekCandidates(context, predicate, evidenceFactory) {
  const candidates = [];
  for (const member of context.members) {
    if (!predicate(member.user_id)) continue;
    candidates.push({
      userId: member.user_id,
      evidence: evidenceFactory(member.user_id)
    });
  }
  return candidates;
}

function evaluateTeamCombination(achievement, context) {
  return playerWeekCandidates(
    context,
    userId => teamCombinationMatches(userId, context.week, achievement.condition_config, context),
    userId => pickEvidence(context.getWeekPick(userId, context.week))
  );
}

function evaluateGameTagCombination(achievement, context) {
  return playerWeekCandidates(
    context,
    userId => gameTagCombinationMatches(userId, context.week, achievement.condition_config, context),
    userId => pickEvidence(context.getWeekPick(userId, context.week), {
      matched_game_tags: achievement.condition_config.required_tags || [achievement.condition_config.tag]
    })
  );
}

function evaluateSeasonalThreshold(achievement, context) {
  const config = achievement.condition_config;
  const matcher = config.base_evaluator === 'teamCombination'
    ? teamCombinationMatches
    : gameTagCombinationMatches;
  if (config.occurrence_unit === 'picked_team') {
    return playerWeekCandidates(
      context,
      userId => matchingTaggedPicks(userId, context.week, config.tag, context).length >= config.minimum_occurrences &&
        matchingTaggedPicks(userId, context.week, config.tag, context).some(match => match.week === context.week),
      userId => ({
        qualifying_picks: matchingTaggedPicks(userId, context.week, config.tag, context),
        occurrence: matchingTaggedPicks(userId, context.week, config.tag, context).length
      })
    );
  }
  return playerWeekCandidates(
    context,
    userId => {
      let occurrences = 0;
      for (let week = 1; week <= context.week; week += 1) {
        if (matcher(userId, week, config, context)) occurrences += 1;
      }
      return occurrences >= config.minimum_occurrences &&
        matcher(userId, context.week, config, context);
    },
    userId => {
      const qualifyingWeeks = [];
      for (let week = 1; week <= context.week; week += 1) {
        if (matcher(userId, week, config, context)) qualifyingWeeks.push(week);
      }
      return pickEvidence(context.getWeekPick(userId, context.week), {
        qualifying_weeks: qualifyingWeeks,
        occurrence: qualifyingWeeks.length
      });
    }
  );
}

function matchingTaggedPicks(userId, throughWeek, tag, context) {
  const matches = [];
  for (let week = 1; week <= throughWeek; week += 1) {
    const weekPick = context.getWeekPick(userId, week);
    weekPick.games.forEach((game, index) => {
      if (game && context.getGameTags(game).has(tag)) {
        matches.push({
          week,
          pick_id: weekPick.picks[index].id,
          game_id: game.id,
          team_short_name: weekPick.teams[index].short_name
        });
      }
    });
  }
  return matches;
}

function evaluateConsecutivePickPattern(achievement, context) {
  const config = achievement.condition_config;
  return playerWeekCandidates(
    context,
    userId => {
      const firstWeek = context.week - config.consecutive_weeks + 1;
      if (firstWeek < 1) return false;
      for (let week = firstWeek; week <= context.week; week += 1) {
        const pick = context.getWeekPick(userId, week);
        if (config.team_short_name === 'BYE' && !pick.isBye) return false;
      }
      return true;
    },
    userId => ({
      weeks: Array.from({ length: config.consecutive_weeks }, (_, index) =>
        context.week - config.consecutive_weeks + 1 + index
      ),
      pick_ids: Array.from({ length: config.consecutive_weeks }, (_, index) =>
        context.getWeekPick(userId, context.week - config.consecutive_weeks + 1 + index).picks.map(pick => pick.id)
      ).flat()
    })
  );
}

function evaluateWeekPickPattern(achievement, context) {
  const config = achievement.condition_config;
  if (context.week !== config.week) return [];
  return playerWeekCandidates(
    context,
    userId => config.team_short_name === 'BYE' && context.getWeekPick(userId, context.week).isBye,
    userId => pickEvidence(context.getWeekPick(userId, context.week))
  );
}

function evaluateUniqueTeamPicker(achievement, context) {
  const target = achievement.condition_config.team_short_name;
  const pickers = context.members.filter(member =>
    context.getWeekPick(member.user_id, context.week).teams.some(team => team?.short_name === target)
  );
  if (pickers.length !== achievement.condition_config.number_of_players) return [];
  return pickers.map(member => ({
    userId: member.user_id,
    evidence: pickEvidence(context.getWeekPick(member.user_id, context.week), {
      team_short_name: target,
      number_of_players: pickers.length
    })
  }));
}

function evaluateUniquePickedGames(achievement, context) {
  if (context.week > achievement.condition_config.maximum_week) return [];
  const gamesPickedByUsers = new Map();
  for (const member of context.members) {
    const gameIds = new Set(context.getWeekPick(member.user_id, context.week).games.filter(Boolean).map(game => game.id));
    for (const gameId of gameIds) {
      const users = gamesPickedByUsers.get(gameId) || new Set();
      users.add(member.user_id);
      gamesPickedByUsers.set(gameId, users);
    }
  }
  return playerWeekCandidates(
    context,
    userId => {
      const uniqueGames = new Set(context.getWeekPick(userId, context.week).games
        .filter(game => game && gamesPickedByUsers.get(game.id)?.size === 1)
        .map(game => game.id));
      return uniqueGames.size >= achievement.condition_config.unique_game_count;
    },
    userId => pickEvidence(context.getWeekPick(userId, context.week), {
      unique_game_ids: [...new Set(context.getWeekPick(userId, context.week).games
        .filter(game => game && gamesPickedByUsers.get(game.id)?.size === 1)
        .map(game => game.id))]
    })
  );
}

function evaluatePickSubmissionHistory(achievement, context) {
  const required = achievement.condition_config.unique_non_bye_team_count_at_least;
  return playerWeekCandidates(
    context,
    userId => new Set(context.getHistory(userId, context.week)
      .filter(pick => Number(pick.team_id) !== -1)
      .map(pick => String(pick.team_id))).size >= required,
    userId => ({
      pick_ids: context.getHistory(userId, context.week).map(pick => pick.id),
      unique_non_bye_team_ids: [...new Set(context.getHistory(userId, context.week)
        .filter(pick => Number(pick.team_id) !== -1)
        .map(pick => pick.team_id))]
    })
  );
}

function evaluateUnchangedEarlyPick(achievement, context) {
  const config = achievement.condition_config;
  return playerWeekCandidates(
    context,
    userId => {
      const weekPick = context.getWeekPick(userId, context.week);
      if (weekPick.picks.length !== 2) return false;
      const history = context.getHistory(userId, context.week);
      if (history.some(pick => pick.invalidated_at !== null)) return false;
      const firstGameTime = Math.min(...(context.gamesByWeek.get(context.week) || [])
        .map(game => new Date(game.start_time).getTime()));
      const submittedAt = Math.max(...weekPick.picks.map(pick => new Date(pick.created_at).getTime()));
      return Number.isFinite(firstGameTime) &&
        firstGameTime - submittedAt >= config.weeks_in_advance_at_least * 7 * 24 * 60 * 60 * 1000;
    },
    userId => pickEvidence(context.getWeekPick(userId, context.week), {
      submitted_at: context.getWeekPick(userId, context.week).picks[0]?.created_at,
      weeks_in_advance_at_least: config.weeks_in_advance_at_least
    })
  );
}

function evaluateOpponentPickCount(achievement, context) {
  const threshold = achievement.condition_config.opponent_pick_count_at_least;
  return playerWeekCandidates(
    context,
    userId => {
      const counts = opponentCounts(userId, context);
      return Math.max(0, ...counts.values()) >= threshold;
    },
    userId => {
      const counts = opponentCounts(userId, context);
      const [opponent, count] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
      return { opponent_short_name: opponent, opponent_pick_count: count };
    }
  );
}

function opponentCounts(userId, context) {
  const counts = new Map();
  for (let week = 1; week <= context.week; week += 1) {
    const weekPick = context.getWeekPick(userId, week);
    weekPick.teams.forEach((team, index) => {
      const game = weekPick.games[index];
      if (!team || !game) return;
      const opponent = game.away_team_short_name === team.short_name
        ? game.home_team_short_name
        : game.away_team_short_name;
      counts.set(opponent, (counts.get(opponent) || 0) + 1);
    });
  }
  return counts;
}

function completedResultCandidates(achievement, context, predicate, extraEvidence = () => ({})) {
  return playerWeekCandidates(
    context,
    userId => {
      const result = context.getWeekResult(userId, context.week);
      return result.complete && !result.isBye && predicate(result, context.getWeekPick(userId, context.week), userId);
    },
    userId => {
      const result = context.getWeekResult(userId, context.week);
      return pickEvidence(context.getWeekPick(userId, context.week), {
        outcome: result.outcome,
        score: result.score,
        margins: result.margins,
        ...extraEvidence(result, context.getWeekPick(userId, context.week), userId)
      });
    }
  );
}

function evaluateScoreMargins(achievement, context) {
  const config = achievement.condition_config;
  return completedResultCandidates(achievement, context, result => {
    if (config.result && result.outcome !== config.result) return false;
    if (config.pattern && result.outcome !== config.pattern) return false;
    const absoluteMargins = result.margins.map(Math.abs);
    if (config.margins && [...absoluteMargins].sort((a, b) => a - b).join(',') !== [...config.margins].sort((a, b) => a - b).join(',')) return false;
    if (config.combined_absolute_margin_at_most !== undefined &&
        absoluteMargins.reduce((sum, margin) => sum + margin, 0) > config.combined_absolute_margin_at_most) return false;
    return true;
  });
}

function evaluatePickedGameResult(achievement, context) {
  const config = achievement.condition_config;
  return completedResultCandidates(achievement, context, (result, weekPick) => {
    if (config.result === 'tie') {
      return weekPick.games.some(game => game.away_team_score === game.home_team_score);
    }
    if (config.result === 'shutout') {
      return result.outcome !== 'split' &&
        weekPick.games.some(game => game.away_team_score === 0 || game.home_team_score === 0);
    }
    return false;
  });
}

function evaluateScorePattern(achievement, context) {
  const config = achievement.condition_config;
  return completedResultCandidates(achievement, context, result => {
    if (result.outcome !== config.pattern) return false;
    if (config.one_team_score_at_least !== undefined &&
        Math.max(...result.margins.map(Math.abs)) < config.one_team_score_at_least) return false;
    if (config.total_score_at_most !== undefined && result.score > config.total_score_at_most) return false;
    return true;
  });
}

function evaluateWeeklyScore(achievement, context) {
  const config = achievement.condition_config;
  return completedResultCandidates(achievement, context, result => {
    if (config.total_score !== undefined && result.score !== config.total_score) return false;
    if (config.total_score_at_least !== undefined && result.score < config.total_score_at_least) return false;
    return true;
  });
}

function evaluateVenueAndResult(achievement, context) {
  const config = achievement.condition_config;
  return completedResultCandidates(achievement, context, (result, weekPick) =>
    result.outcome === config.result &&
    weekPick.teams.every((team, index) =>
      weekPick.games[index][`${config.venue}_team_short_name`] === team.short_name
    )
  );
}

function evaluateFavoriteTeamResult(achievement, context) {
  const config = achievement.condition_config;
  return playerWeekCandidates(
    context,
    userId => {
      const member = context.members.find(row => String(row.user_id) === String(userId));
      if (member?.favorite_team_id === null || member?.favorite_team_id === undefined) return false;

      const result = context.getWeekResult(userId, context.week);
      const weekPick = context.getWeekPick(userId, context.week);
      return result.complete && !result.isBye &&
        result.outcome === config.result &&
        weekPick.picks.some(pick => String(pick.team_id) === String(member.favorite_team_id));
    },
    userId => {
      const member = context.members.find(row => String(row.user_id) === String(userId));
      const result = context.getWeekResult(userId, context.week);
      return pickEvidence(context.getWeekPick(userId, context.week), {
        favorite_team_id: member.favorite_team_id,
        outcome: result.outcome,
        score: result.score,
        margins: result.margins
      });
    }
  );
}

function evaluateMatchingFinalScores(achievement, context) {
  return completedResultCandidates(achievement, context, (result, weekPick) => {
    if (weekPick.games[0].id === weekPick.games[1].id) return false;
    const first = [weekPick.games[0].away_team_score, weekPick.games[0].home_team_score].sort((a, b) => a - b);
    const second = [weekPick.games[1].away_team_score, weekPick.games[1].home_team_score].sort((a, b) => a - b);
    return first[0] === second[0] && first[1] === second[1];
  });
}

function cumulativeScore(userId, throughWeek, context) {
  let score = 0;
  for (let week = 1; week <= throughWeek; week += 1) {
    const result = context.getWeekResult(userId, week);
    if (result.complete && !result.isBye) score += result.score;
  }
  return score;
}

function evaluateOverallStanding(achievement, context) {
  const standings = context.members.map(member => ({
    userId: member.user_id,
    score: cumulativeScore(member.user_id, context.week, context)
  })).sort((a, b) => b.score - a.score);
  if (!standings.length || standings.filter(row => row.score === standings[0].score).length !== 1) return [];
  return [{
    userId: standings[0].userId,
    evidence: { rank: 1, cumulative_score: standings[0].score, week: context.week }
  }];
}

function evaluateMatchingWeeklyScore(achievement, context) {
  const config = achievement.condition_config;
  if (context.week < config.minimum_week) return [];
  const scores = context.members.map(member => ({
    userId: member.user_id,
    score: cumulativeScore(member.user_id, context.week, context)
  }));
  return scores.filter(row =>
    (!config.score_must_be_nonzero || row.score !== 0) &&
    scores.some(other => other.userId !== row.userId && other.score === row.score)
  ).map(row => ({
    userId: row.userId,
    evidence: {
      cumulative_score: row.score,
      matching_user_ids: scores.filter(other => other.userId !== row.userId && other.score === row.score).map(other => other.userId)
    }
  }));
}

function maximumPossibleScore(context) {
  const choices = (context.gamesByWeek.get(context.week) || []).flatMap(game => [
    { game, team: game.away_team_short_name, margin: game.away_team_score - game.home_team_score },
    { game, team: game.home_team_short_name, margin: game.home_team_score - game.away_team_score }
  ]);
  let maximum = 0;
  for (let first = 0; first < choices.length; first += 1) {
    for (let second = first + 1; second < choices.length; second += 1) {
      if (choices[first].game.id === choices[second].game.id) continue;
      maximum = Math.max(maximum, scoreFromMargins(choices[first].margin, choices[second].margin).score);
    }
  }
  return maximum;
}

function evaluateMaximumPossibleScore(achievement, context) {
  const maximum = maximumPossibleScore(context);
  return completedResultCandidates(
    achievement,
    context,
    result => result.score === maximum,
    () => ({ maximum_possible_score: maximum })
  );
}

function evaluateResultStreak(achievement, context) {
  const config = achievement.condition_config;
  return playerWeekCandidates(
    context,
    userId => resultStreak(userId, context, config).length >= config.consecutive_weeks,
    userId => ({ qualifying_weeks: resultStreak(userId, context, config) })
  );
}

function resultStreak(userId, context, config) {
  let streak = [];
  for (let week = 1; week <= context.week; week += 1) {
    const result = context.getWeekResult(userId, week);
    if (result.isBye && config.ignore_bye_weeks) continue;
    if (!result.complete || !config.qualifying_results.includes(result.outcome)) {
      streak = [];
      continue;
    }
    streak.push(week);
  }
  return streak;
}

function evaluateFinalWeekPickPattern(achievement, context) {
  if (context.week !== context.maxScheduledWeek) return [];
  const config = achievement.condition_config;
  return playerWeekCandidates(
    context,
    userId => config.team_short_name === 'BYE' && context.getWeekPick(userId, context.week).isBye,
    userId => pickEvidence(context.getWeekPick(userId, context.week))
  );
}

const evaluatorRegistry = {
  teamCombination: evaluateTeamCombination,
  gameTagCombination: evaluateGameTagCombination,
  seasonalThreshold: evaluateSeasonalThreshold,
  consecutivePickPattern: evaluateConsecutivePickPattern,
  weekPickPattern: evaluateWeekPickPattern,
  uniqueTeamPicker: evaluateUniqueTeamPicker,
  uniquePickedGames: evaluateUniquePickedGames,
  pickSubmissionHistory: evaluatePickSubmissionHistory,
  unchangedEarlyPick: evaluateUnchangedEarlyPick,
  opponentPickCount: evaluateOpponentPickCount,
  scoreMargins: evaluateScoreMargins,
  pickedGameResult: evaluatePickedGameResult,
  scorePattern: evaluateScorePattern,
  weeklyScore: evaluateWeeklyScore,
  venueAndResult: evaluateVenueAndResult,
  favoriteTeamResult: evaluateFavoriteTeamResult,
  matchingFinalScores: evaluateMatchingFinalScores,
  overallStanding: evaluateOverallStanding,
  matchingWeeklyScore: evaluateMatchingWeeklyScore,
  maximumPossibleScore: evaluateMaximumPossibleScore,
  resultStreak: evaluateResultStreak,
  finalWeekPickPattern: evaluateFinalWeekPickPattern
};

function evaluateAchievement(achievement, context) {
  const evaluator = evaluatorRegistry[achievement.evaluator];
  if (!evaluator) throw new Error(`No evaluator is registered for ${achievement.key} (${achievement.evaluator}).`);
  return evaluator(achievement, context);
}

module.exports = {
  evaluateAchievement,
  evaluatorRegistry,
  gameTagCombinationMatches,
  maximumPossibleScore,
  requirementsMatchTeams,
  teamCombinationMatches
};
