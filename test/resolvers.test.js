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
