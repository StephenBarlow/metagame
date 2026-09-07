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
      'GREAT_MINDS',
      'Great Minds',
      'Be one of exactly two players to make the same scoring pick in a week.',
      NULL,
      'matchingPickGroup',
      'week_finalized',
      'league_week',
      '{"player_count_exact":2,"qualifying_outcomes":["double_win","double_loss"]}',
      FALSE,
      TRUE
    )`);
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key = 'GREAT_MINDS'");
};

exports._meta = {
  "version": 1
};
