const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = require('graphql');
const { createLoggingPlugin } = require('../logging-plugin');

function requestContext(query, clientIp = '203.0.113.10', forwardedFor = '203.0.113.10, 198.51.100.1') {
  return {
    request: { query },
    operation: parse(query).definitions[0],
    contextValue: { clientIp, forwardedFor }
  };
}

test('the GraphQL logging plugin warns for anonymous operations and records request details', async () => {
  const warnings = [];
  const plugin = createLoggingPlugin({
    info: () => {},
    warn: (fields, message) => warnings.push({ fields, message }),
    error: () => {}
  });
  const context = requestContext('{ currentSeason }');
  const listener = await plugin.requestDidStart(context);

  await listener.willSendResponse(context);

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].message, 'Anonymous GraphQL operation requested');
  assert.deepEqual(warnings[0].fields, {
    event: 'graphql_request',
    operationName: null,
    operationType: 'query',
    clientIp: '203.0.113.10',
    forwardedFor: '203.0.113.10, 198.51.100.1',
    durationMs: warnings[0].fields.durationMs,
    errorCount: 0
  });
  assert.equal(typeof warnings[0].fields.durationMs, 'number');
});

test('the GraphQL logging plugin records named operations at info level', async () => {
  const entries = [];
  const plugin = createLoggingPlugin({
    info: (fields, message) => entries.push({ fields, message }),
    warn: () => {},
    error: () => {}
  });
  const context = requestContext('query CurrentSeason { currentSeason }');
  const listener = await plugin.requestDidStart(context);

  await listener.willSendResponse(context);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].message, 'GraphQL operation requested');
  assert.equal(entries[0].fields.operationName, 'CurrentSeason');
  assert.equal(entries[0].fields.operationType, 'query');
  assert.equal(entries[0].fields.clientIp, '203.0.113.10');
});
