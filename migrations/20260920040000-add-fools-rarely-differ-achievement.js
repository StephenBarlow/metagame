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
      'FOOLS_SELDOM_DIFFER',
      'Fools Seldom Differ',
      'Split by picking the same teams as exactly one other player.',
      NULL,
      'matchingPickGroup',
      'scores_updated',
      'league_week',
      '{"player_count_exact":2,"qualifying_outcomes":["split"]}'::jsonb,
      FALSE,
      TRUE
    )
    ON CONFLICT (key) DO NOTHING`);
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key = 'FOOLS_SELDOM_DIFFER'");
};

exports._meta = {
  "version": 1
};
