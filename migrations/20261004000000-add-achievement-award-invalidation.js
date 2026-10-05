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
  return db.runSql('ALTER TABLE achievement_awards ADD COLUMN invalidated_at TIMESTAMP WITH TIME ZONE')
    .then(() => db.runSql(
      'CREATE INDEX achievement_awards_active_league_id_idx ON achievement_awards (league_id) WHERE invalidated_at IS NULL'
    ));
};

exports.down = function(db) {
  return db.runSql('DROP INDEX IF EXISTS achievement_awards_active_league_id_idx')
    .then(() => db.runSql('ALTER TABLE achievement_awards DROP COLUMN invalidated_at'));
};

exports._meta = {
  "version": 1
};
