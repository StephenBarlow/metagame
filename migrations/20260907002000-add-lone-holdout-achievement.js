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
  return db.runSql(`INSERT INTO achievements
    (key, name, description, icon_id, evaluator, evaluation_phase, scope, condition_config, repeatable, active)
    VALUES (
      'LONE_HOLDOUT',
      'Lone Holdout',
      'Be the only player who hasn''t picked a particular team yet this season.',
      NULL,
      'soleUnpickedTeam',
      'week_finalized',
      'league_week',
      '{}',
      FALSE,
      TRUE
    )`);
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key = 'LONE_HOLDOUT'");
};

exports._meta = {
  "version": 1
};
