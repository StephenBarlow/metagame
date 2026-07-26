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
    VALUES
      ('DESPERADO', 'Desperado', 'Pick the Cowboys and Eagles in the same week.', NULL,
        'teamCombination', 'pick_locked', 'player_week',
        '{"requirements":[{"match":{"short_name":"DAL"},"count":1},{"match":{"short_name":"PHI"},"count":1}]}', FALSE, TRUE),
      ('VATICAN_CITY', 'Vatican City', 'Pick the Cardinals and Saints in the same week.', NULL,
        'teamCombination', 'pick_locked', 'player_week',
        '{"requirements":[{"match":{"short_name":"ARI"},"count":1},{"match":{"short_name":"NO"},"count":1}]}', FALSE, TRUE),
      ('HIGH_ALTITUDE', 'High Altitude', 'Pick the Broncos and Jets in the same week.', NULL,
        'teamCombination', 'pick_locked', 'player_week',
        '{"requirements":[{"match":{"short_name":"DEN"},"count":1},{"match":{"short_name":"NYJ"},"count":1}]}', FALSE, TRUE),
      ('HOT_STREAK', 'Hot Streak', 'Score points for eight consecutive weeks (ignoring byes).', NULL,
        'resultStreak', 'week_finalized', 'player_season',
        '{"qualifying_results":["double_win","double_loss"],"consecutive_weeks":8,"ignore_bye_weeks":true}', FALSE, TRUE),
      ('COLD_STREAK', 'Cold Streak', 'Split for eight consecutive weeks (ignoring byes).', NULL,
        'resultStreak', 'week_finalized', 'player_season',
        '{"qualifying_results":["split"],"consecutive_weeks":8,"ignore_bye_weeks":true}', FALSE, TRUE)
    ON CONFLICT (key) DO NOTHING`);
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key IN ('DESPERADO', 'VATICAN_CITY', 'HIGH_ALTITUDE', 'HOT_STREAK', 'COLD_STREAK')");
};

exports._meta = {
  "version": 1
};
