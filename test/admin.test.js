const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const { createAdminRouter, parseBasicAuthorization, parseScheduleCsv } = require('../admin');

function authorization(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function withServer(app, callback) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function testApp(password) {
  const app = express();
  app.use('/admin', createAdminRouter({
    pg: { knex: () => { throw new Error('Database should not be queried'); } },
    logger: { error: () => {} },
    auth: { username: 'commissioner', password }
  }));
  return app;
}

test('basic authorization parser preserves colons in passwords', () => {
  assert.deepEqual(parseBasicAuthorization(authorization('admin', 'one:two')), {
    username: 'admin',
    password: 'one:two'
  });
});

test('schedule CSV parsing validates and normalizes games without writing', async () => {
  const db = table => {
    assert.equal(table, 'teams');
    return {
      select: async () => [{ short_name: 'BUF' }, { short_name: 'NYJ' }]
    };
  };
  const parsed = await parseScheduleCsv(
    db,
    '2026',
    'week,start_time,away_team_short_name,home_team_short_name\n1,2026-09-10T20:20:00-04:00,buf,nyj'
  );

  assert.equal(parsed.season, 2026);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].error, undefined);
  assert.equal(parsed.rows[0].game.away_team_short_name, 'BUF');
  assert.equal(parsed.rows[0].game.home_team_short_name, 'NYJ');
  assert.equal(parsed.rows[0].game.start_time.toISOString(), '2026-09-11T00:20:00.000Z');
});

test('schedule CSV parsing reports invalid rows', async () => {
  const db = () => ({ select: async () => [{ short_name: 'BUF' }] });
  const parsed = await parseScheduleCsv(db, '2026', '1,not-a-date,BUF,MIA');
  assert.match(parsed.rows[0].error, /(timestamp|timezone)/);
  assert.equal(parsed.rows[0].game, null);
});

test('schedule CSV requires an explicit timezone', async () => {
  const db = () => ({ select: async () => [{ short_name: 'BUF' }, { short_name: 'NYJ' }] });
  const parsed = await parseScheduleCsv(db, '2026', '1,2026-09-10T20:20:00,BUF,NYJ');
  assert.match(parsed.rows[0].error, /timezone/);
});

test('admin routes reject missing and incorrect credentials', async () => {
  await withServer(testApp('secret'), async baseURL => {
    const missing = await fetch(`${baseURL}/admin/`, { redirect: 'manual' });
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get('www-authenticate'), /^Basic /);

    const incorrect = await fetch(`${baseURL}/admin/`, {
      headers: { authorization: authorization('commissioner', 'wrong') },
      redirect: 'manual'
    });
    assert.equal(incorrect.status, 401);
  });
});

test('admin routes are disabled when no password is configured', async () => {
  await withServer(testApp(''), async baseURL => {
    const response = await fetch(`${baseURL}/admin/`, { redirect: 'manual' });
    assert.equal(response.status, 503);
  });
});

test('valid admin credentials reach the protected router', async () => {
  await withServer(testApp('secret'), async baseURL => {
    const response = await fetch(`${baseURL}/admin/`, {
      headers: { authorization: authorization('commissioner', 'secret') },
      redirect: 'manual'
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/games');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('admin POST requests reject a foreign Origin', async () => {
  await withServer(testApp('secret'), async baseURL => {
    const response = await fetch(`${baseURL}/admin/not-a-route`, {
      method: 'POST',
      headers: {
        authorization: authorization('commissioner', 'secret'),
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://attacker.example'
      },
      body: ''
    });
    assert.equal(response.status, 403);
  });
});
