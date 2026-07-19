const assert = require('node:assert/strict');
const test = require('node:test');

const { PGDB } = require('../connection-pool');

const knexConfig = {
  client: 'pg',
  connection: {}
};

test('cacheQuery stores and reuses query results with the requested TTL', async (t) => {
  const entries = new Map();
  const cacheWrites = [];
  const cache = {
    get: async (key) => entries.get(key),
    set: async (key, value, options) => {
      entries.set(key, value);
      cacheWrites.push({ key, value, options });
    },
    delete: async (key) => entries.delete(key)
  };
  const db = new PGDB(knexConfig, cache);
  t.after(() => db.knex.destroy());

  let executions = 0;
  const rows = [{ id: 1, name: 'Buffalo Bills' }];
  const query = () => ({
    toString: () => 'select * from "teams"',
    then: (resolve, reject) => {
      executions += 1;
      return Promise.resolve(rows).then(resolve, reject);
    }
  });

  assert.deepEqual(await db.cacheQuery(query(), 60), rows);
  assert.deepEqual(await db.cacheQuery(query(), 60), rows);
  assert.equal(executions, 1);
  assert.equal(cacheWrites.length, 1);
  assert.deepEqual(cacheWrites[0].options, { ttl: 60 });
});

test('read methods build valid PostgreSQL queries without executing them', async (t) => {
  const db = new PGDB(knexConfig, {
    get: async () => undefined,
    set: async () => {},
    delete: async () => {}
  });
  t.after(() => db.knex.destroy());

  const queries = [];
  db.cacheQuery = async (query, ttl) => {
    queries.push({ ...query.toSQL(), ttl });
    return [];
  };

  await db.getTeams();
  await db.getSportsGames(2026);
  await db.getSportsGamesForWeek(2026, 1);
  await db.getUserByEmail('test@example.com');
  await db.getUserById(1);
  await db.getUserDisplayNameForLeague(1, 1);
  await db.getAllLeagues();
  await db.getLeaguesForUser(1);
  await db.getLeagueById(1);
  await db.getTeam('BUF', 'NFL');
  await db.getTeamById(1);
  await db.getLeagueOwner(1, 1);
  await db.getLeagueMembers(1);
  await db.getPicksForLeague(1, true);
  await db.getCurrentPick(1, 1, 1);
  await db.getPicksForMember(1, 1);

  assert.equal(queries.length, 16);
  assert.ok(queries.every(({ method }) => method === 'select'));
  assert.ok(queries.every(({ sql }) => sql.startsWith('select')));
});

test('pick cache invalidation deletes each affected query once', async (t) => {
  const originalRevealedWeek = process.env.REVEALED_WEEK;
  process.env.REVEALED_WEEK = '6';
  t.after(() => {
    if (originalRevealedWeek === undefined) {
      delete process.env.REVEALED_WEEK;
    } else {
      process.env.REVEALED_WEEK = originalRevealedWeek;
    }
  });

  const deletedKeys = [];
  const db = new PGDB(knexConfig, {
    get: async () => undefined,
    set: async () => {},
    delete: async (key) => deletedKeys.push(key)
  });
  t.after(() => db.knex.destroy());

  const affectedPicks = [
    { league_id: 1, user_id: 2, week: 3 },
    { league_id: 1, user_id: 2, week: 3 },
    { league_id: 1, user_id: 4, week: 3 }
  ];
  await db.invalidatePickCache(affectedPicks);

  const expectedKeys = [
    db.picksForLeagueQuery(1),
    db.picksForLeagueQuery(1, true),
    db.picksForMemberQuery(2, 1),
    db.picksForMemberQuery(4, 1),
    db.currentPickQuery(1, 2, 3),
    db.currentPickQuery(1, 4, 3)
  ].map(query => db.cacheKeyFor(query));

  assert.deepEqual(new Set(deletedKeys), new Set(expectedKeys));
  assert.equal(deletedKeys.length, expectedKeys.length);
});
