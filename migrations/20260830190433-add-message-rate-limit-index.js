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

exports.up = function(db) {
  return db.runSql(
    'CREATE INDEX messages_author_week_created_at_idx ON messages (author_membership_id, week, created_at DESC)'
  );
};

exports.down = function(db) {
  return db.runSql('DROP INDEX messages_author_week_created_at_idx');
};

exports._meta = {
  "version": 1
};
