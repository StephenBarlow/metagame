'use strict';

function scoreFromMargins(firstMargin, secondMargin) {
  if (firstMargin >= 0 && secondMargin >= 0) {
    return {
      outcome: 'double_win',
      score: firstMargin + secondMargin
    };
  }
  if (firstMargin <= 0 && secondMargin <= 0) {
    return {
      outcome: 'double_loss',
      score: Math.max(Math.abs(firstMargin), Math.abs(secondMargin))
    };
  }
  return {
    outcome: 'split',
    score: 0
  };
}

function pickedTeamMargin(game, teamShortName) {
  if (!game || game.away_team_score === null || game.home_team_score === null) return null;
  if (game.away_team_short_name === teamShortName) {
    return game.away_team_score - game.home_team_score;
  }
  if (game.home_team_short_name === teamShortName) {
    return game.home_team_score - game.away_team_score;
  }
  return null;
}

function calculatePickTwoResult(weekPick) {
  if (!weekPick || weekPick.picks.length !== 2) {
    return { complete: false, outcome: 'unknown', score: null };
  }
  if (weekPick.isBye) {
    return { complete: true, isBye: true, outcome: 'bye', score: 0, margins: [] };
  }
  if (weekPick.games.some(game => !game || game.away_team_score === null || game.home_team_score === null)) {
    return { complete: false, outcome: 'unknown', score: null };
  }

  const margins = weekPick.teams.map((team, index) => pickedTeamMargin(weekPick.games[index], team.short_name));
  if (margins.some(margin => margin === null)) {
    return { complete: false, outcome: 'unknown', score: null };
  }

  return {
    complete: true,
    isBye: false,
    ...scoreFromMargins(margins[0], margins[1]),
    margins,
    gameIds: weekPick.games.map(game => game.id)
  };
}

module.exports = {
  calculatePickTwoResult,
  pickedTeamMargin,
  scoreFromMargins
};
