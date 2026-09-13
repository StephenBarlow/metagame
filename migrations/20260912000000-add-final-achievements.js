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
      ('GARBAGE_TIME', 'Garbage Time', 'Score 30 or more points with a double-loss.', NULL,
        'scorePattern', 'week_finalized', 'player_week',
        '{"pattern":"double_loss","total_score_at_least":30}', TRUE, TRUE),
      ('BAYWATCH', 'Baywatch', 'Pick the Bucs and Packers in the same week.', NULL,
        'teamCombination', 'pick_locked', 'player_week',
        '{"requirements":[{"match":{"short_name":"TB"},"count":1},{"match":{"short_name":"GB"},"count":1}]}', FALSE, TRUE),
      ('THE_ONLY_WINNING_MOVE', 'The Only Winning Move', 'Take a bye in a week where every non-BYE pick results in a split.', NULL,
        'onlyWinningMove', 'week_finalized', 'league_week',
        '{}', FALSE, TRUE),
      ('EXCEPTIONALLY_AVERAGE', 'Exceptionally Average', 'End a week with a total score less than one point from the league average (week 2 or later).', NULL,
        'nearAverageScore', 'week_finalized', 'league_week',
        '{"minimum_week":2,"difference_from_average_below":1}', FALSE, TRUE),
      ('CROWD_PLEASER', 'Crowd Pleaser', 'Achieve a double win with two teams that are favorite teams of other league members.', NULL,
        'otherMembersFavoriteTeamsResult', 'week_finalized', 'league_week',
        '{"result":"double_win"}', FALSE, TRUE)
    ON CONFLICT (key) DO NOTHING`);
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key IN ('GARBAGE_TIME', 'BAYWATCH', 'THE_ONLY_WINNING_MOVE', 'EXCEPTIONALLY_AVERAGE', 'CROWD_PLEASER')");
};

exports._meta = {
  "version": 1
};
