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
      'WE_DONT_NEED_NO_STINKING_BADGES',
      'We Don''t Need No Stinking Badges',
      'Go five full weeks without earning a badge (except this one).',
      NULL,
      'badgeDrought',
      'manual',
      'player_season',
      '{"week_count":5}'::jsonb,
      FALSE,
      TRUE
    )
    ON CONFLICT (key) DO NOTHING`);
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key = 'WE_DONT_NEED_NO_STINKING_BADGES'");
};

exports._meta = {
  "version": 1
};
