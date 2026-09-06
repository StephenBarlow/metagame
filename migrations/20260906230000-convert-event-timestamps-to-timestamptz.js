'use strict';

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

// These columns record events, not local wall-clock times. Existing values
// were written with PostgreSQL sessions configured for UTC, so preserve them
// by explicitly interpreting the legacy timezone-less values as UTC.
const eventTimestampColumns = [
  ['achievement_awards', 'awarded_at'],
  ['achievements', 'created_at'],
  ['achievements', 'updated_at'],
  ['league_achievements', 'enabled_at'],
  ['memberships', 'created_at'],
  ['memberships', 'revoked_at'],
  ['message_template_slots', 'created_at'],
  ['message_template_slots', 'updated_at'],
  ['message_templates', 'created_at'],
  ['message_templates', 'updated_at'],
  ['message_values', 'created_at'],
  ['message_values', 'updated_at'],
  ['messages', 'created_at'],
  ['messages', 'invalidated_at'],
  ['picks', 'created_at'],
  ['picks', 'invalidated_at']
];

function convertColumns(db, targetType, conversionExpression) {
  return eventTimestampColumns.reduce(
    (promise, [table, column]) => promise.then(() => db.runSql(
      `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${targetType} USING ${column} ${conversionExpression}`
    )),
    Promise.resolve()
  );
}

exports.up = function(db) {
  return convertColumns(db, 'timestamp with time zone', "AT TIME ZONE 'UTC'");
};

exports.down = function(db) {
  return convertColumns(db, 'timestamp without time zone', "AT TIME ZONE 'UTC'");
};

exports._meta = {
  "version": 1
};
