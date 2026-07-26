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
      ('SILVER_LINING', 'Silver Lining', 'Achieve a double-loss with your favorite team.', NULL,
        'favoriteTeamResult', 'week_finalized', 'player_week',
        '{"result":"double_loss"}', FALSE, TRUE),
      ('BEST_WEEK_EVER', 'Best Week Ever', 'Achieve a double-win with your favorite team.', NULL,
        'favoriteTeamResult', 'week_finalized', 'player_week',
        '{"result":"double_win"}', FALSE, TRUE)
    ON CONFLICT (key) DO NOTHING`);
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key IN ('SILVER_LINING', 'BEST_WEEK_EVER')");
};

exports._meta = {
  "version": 1
};
