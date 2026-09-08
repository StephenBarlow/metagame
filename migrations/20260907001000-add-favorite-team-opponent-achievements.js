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
      ('ET_TU', 'Et Tu?', 'Achieve a double-win by picking the opponent of your favorite team.', NULL,
        'favoriteTeamOpponentResult', 'week_finalized', 'player_week',
        '{"result":"double_win"}', FALSE, TRUE),
      ('ALIGNMENT_OF_INTERESTS', 'Alignment of Interests', 'Achieve a double-loss by picking the opponent of your favorite team.', NULL,
        'favoriteTeamOpponentResult', 'week_finalized', 'player_week',
        '{"result":"double_loss"}', FALSE, TRUE)`);
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key IN ('ET_TU', 'ALIGNMENT_OF_INTERESTS')");
};

exports._meta = {
  "version": 1
};
