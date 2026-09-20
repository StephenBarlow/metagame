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
      'KEYSTONE_COMBO',
      'Keystone Combo',
      'Pick the Eagles and Steelers in the same week.',
      NULL,
      'teamCombination',
      'pick_locked',
      'player_week',
      '{"requirements":[{"match":{"short_name":"PHI"},"count":1},{"match":{"short_name":"PIT"},"count":1}]}'::jsonb,
      FALSE,
      TRUE
    )
    ON CONFLICT (key) DO NOTHING`);
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key = 'KEYSTONE_COMBO'");
};

exports._meta = {
  "version": 1
};
