'use strict';

const { calculatePickTwoResult } = require('./scoring');

const NFL_DIVISIONS = {
  ARI: 'NFC_WEST', ATL: 'NFC_SOUTH', BAL: 'AFC_NORTH', BUF: 'AFC_EAST',
  CAR: 'NFC_SOUTH', CHI: 'NFC_NORTH', CIN: 'AFC_NORTH', CLE: 'AFC_NORTH',
  DAL: 'NFC_EAST', DEN: 'AFC_WEST', DET: 'NFC_NORTH', GB: 'NFC_NORTH',
  HOU: 'AFC_SOUTH', IND: 'AFC_SOUTH', JAX: 'AFC_SOUTH', KC: 'AFC_WEST',
  LAC: 'AFC_WEST', LAR: 'NFC_WEST', LV: 'AFC_WEST', MIA: 'AFC_EAST',
  MIN: 'NFC_NORTH', NE: 'AFC_EAST', NO: 'NFC_SOUTH', NYG: 'NFC_EAST',
  NYJ: 'AFC_EAST', PHI: 'NFC_EAST', PIT: 'AFC_NORTH', SEA: 'NFC_WEST',
  SF: 'NFC_WEST', TB: 'NFC_SOUTH', TEN: 'AFC_SOUTH', WAS: 'NFC_EAST'
};

function key(...parts) {
  return parts.join(':');
}

function buildEvaluationContext(data) {
  const teamsById = new Map(data.teams.map(team => [String(team.id), {
    ...team,
    tags: new Set()
  }]));
  for (const row of data.teamTags) {
    teamsById.get(String(row.team_id))?.tags.add(row.tag);
  }

  const gameTagsById = new Map();
  for (const row of data.gameTags) {
    const tags = gameTagsById.get(String(row.game_id)) || new Set();
    tags.add(row.tag);
    gameTagsById.set(String(row.game_id), tags);
  }

  const gamesByWeek = new Map();
  const gameByWeekAndTeam = new Map();
  for (const game of data.games) {
    const weekGames = gamesByWeek.get(game.week) || [];
    weekGames.push(game);
    gamesByWeek.set(game.week, weekGames);
    gameByWeekAndTeam.set(key(game.week, game.away_team_short_name), game);
    gameByWeekAndTeam.set(key(game.week, game.home_team_short_name), game);
  }

  const activePicksByUserWeek = new Map();
  const allPicksByUserWeek = new Map();
  for (const pick of data.picks) {
    const pickKey = key(pick.user_id, pick.week);
    const history = allPicksByUserWeek.get(pickKey) || [];
    history.push(pick);
    allPicksByUserWeek.set(pickKey, history);
    if (pick.invalidated_at === null) {
      const active = activePicksByUserWeek.get(pickKey) || [];
      active.push(pick);
      activePicksByUserWeek.set(pickKey, active);
    }
  }

  const context = {
    ...data,
    teamsById,
    gamesByWeek,
    gameByWeekAndTeam,
    gameTagsById,
    activePicksByUserWeek,
    allPicksByUserWeek,
    maxScheduledWeek: Math.max(0, ...data.games.map(game => Number(game.week) || 0)),

    getWeekPick(userId, week) {
      const picks = activePicksByUserWeek.get(key(userId, week)) || [];
      const teams = picks.map(pick => {
        if (Number(pick.team_id) === -1) {
          return { id: -1, short_name: 'BYE', name: 'Bye', tags: new Set() };
        }
        return teamsById.get(String(pick.team_id));
      });
      const games = teams.map(team => team?.short_name === 'BYE'
        ? null
        : gameByWeekAndTeam.get(key(week, team?.short_name)));
      return {
        userId,
        week,
        picks,
        teams,
        games,
        isBye: picks.length === 2 && picks.every(pick => Number(pick.team_id) === -1)
      };
    },

    getWeekResult(userId, week) {
      return calculatePickTwoResult(this.getWeekPick(userId, week));
    },

    getGameTags(game) {
      return gameTagsById.get(String(game?.id)) || new Set();
    },

    getDivision(team) {
      return NFL_DIVISIONS[team?.short_name];
    },

    getHistory(userId, week) {
      return allPicksByUserWeek.get(key(userId, week)) || [];
    }
  };

  return context;
}

module.exports = {
  NFL_DIVISIONS,
  buildEvaluationContext
};
