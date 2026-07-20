const assert = require('node:assert/strict');
const test = require('node:test');

test('Express serves GraphQL and the protected admin site together', async (t) => {
  process.env.PORT = '0';
  process.env.CURRENT_SEASON = '2026';
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'test-password';

  const { start } = require('../index');
  const running = await start();
  t.after(async () => {
    await running.server.stop();
    await running.pg.knex.destroy();
  });

  const port = running.httpServer.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  const graphQLResponse = await fetch(baseURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'query TestServer { currentSeason }', operationName: 'TestServer' })
  });
  assert.equal(graphQLResponse.status, 200);
  assert.deepEqual(await graphQLResponse.json(), { data: { currentSeason: '2026' } });

  const adminResponse = await fetch(`${baseURL}/admin/`, { redirect: 'manual' });
  assert.equal(adminResponse.status, 401);
  assert.match(adminResponse.headers.get('www-authenticate'), /^Basic /);
});
