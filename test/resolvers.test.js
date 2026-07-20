const assert = require('node:assert/strict');
const test = require('node:test');

const { ApolloServer } = require('@apollo/server');
const { typeDefs } = require('../schema');
const { resolvers } = require('../resolvers');

test('sportsGames returns the same ISO timestamp for database and cached values', async (t) => {
  const startsAt = '2026-09-10T00:00:00.000Z';
  let databaseValue = new Date(startsAt);
  const server = new ApolloServer({ typeDefs, resolvers });
  t.after(() => server.stop());

  const contextValue = {
    dataSources: {
      pg: {
        getSportsGames: async () => [{
          id: 1,
          sports_league: 'NFL',
          start_time: databaseValue,
          week: 1,
          away_team_short_name: 'BUF',
          home_team_short_name: 'NYJ',
          away_team_score: null,
          home_team_score: null
        }],
        getTeams: async () => [
          { id: 1, name: 'Buffalo Bills', short_name: 'BUF', sports_league: 'NFL' },
          { id: 2, name: 'New York Jets', short_name: 'NYJ', sports_league: 'NFL' }
        ]
      }
    }
  };
  const operation = {
    query: 'query Games($season: String) { sportsGames(season: $season) { startsAt } }',
    variables: { season: '2026' }
  };

  const databaseResponse = await server.executeOperation(operation, { contextValue });
  databaseValue = startsAt;
  const cacheResponse = await server.executeOperation(operation, { contextValue });

  assert.equal(databaseResponse.body.kind, 'single');
  assert.equal(cacheResponse.body.kind, 'single');
  assert.equal(databaseResponse.body.singleResult.data.sportsGames[0].startsAt, startsAt);
  assert.equal(cacheResponse.body.singleResult.data.sportsGames[0].startsAt, startsAt);
});

test('submitPick rejects an identical active Pick 2 submission', async () => {
  const originalSeason = process.env.CURRENT_SEASON;
  process.env.CURRENT_SEASON = '2026';

  let submitted = false;
  const pg = {
    getLeagueById: async () => ({ game_mode: 'PICK_TWO' }),
    getSportsGamesForWeek: async () => [
      { id: 1, start_time: '2099-09-10T20:20:00.000Z', away_team_short_name: 'BUF', home_team_short_name: 'NYJ' },
      { id: 2, start_time: '2099-09-10T20:20:00.000Z', away_team_short_name: 'MIA', home_team_short_name: 'NE' }
    ],
    getTeams: async () => [
      { id: 1, short_name: 'BUF' },
      { id: 2, short_name: 'MIA' }
    ],
    getPicksForMember: async () => [
      { team_id: 1, week: 1 },
      { team_id: 2, week: 1 }
    ],
    submitPicks: async () => { submitted = true; }
  };

  const context = { dataSources: { pg }, errorMessage: undefined };
  const result = await resolvers.Mutation.submitPick(null, {
    request: { userID: '7', leagueID: '9', teamIDs: ['2', '1'], week: 1 }
  }, context);

  assert.equal(submitted, false);
  assert.deepEqual(result, {
    pick: null,
    errors: [{ code: 'ERR_INVALID_INPUT', message: 'The submitted pick matches your existing pick.' }]
  });
  process.env.CURRENT_SEASON = originalSeason;
});
