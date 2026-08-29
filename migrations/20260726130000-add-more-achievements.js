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
      ('BUZZER_BEATER', 'Buzzer Beater', 'Submit a pick within 5 minutes of one of your teams starting their game.', NULL,
        'latePickSubmission', 'pick_locked', 'player_week',
        '{"minutes_before_game_at_most":5}', FALSE, TRUE),
      ('SLIM_PICKINGS', 'Slim Pickings', 'Submit a pick when fewer than five games remain available to pick from.', NULL,
        'limitedGameAvailability', 'week_finalized', 'player_week',
        '{"remaining_game_count_below":5}', FALSE, TRUE),
      ('SHEEP', 'Sheep', 'Submit the exact same non-BYE picks as at least five other players.', NULL,
        'matchingPickGroup', 'pick_locked', 'league_week',
        '{"other_player_count_at_least":5}', FALSE, TRUE),
      ('CALIFORNIA_LOVE', 'California Love', 'Pick any two of the 49ers, Rams, and Chargers in a single week.', NULL,
        'teamCombination', 'pick_locked', 'player_week',
        '{"requirements":[{"any_match":[{"short_name":"SF"},{"short_name":"LAR"},{"short_name":"LAC"}],"count":2}]}', FALSE, TRUE),
      ('WORST_OF_ALL_WORLDS', 'Worst of All Worlds', 'Split when picking your favorite team because they lost.', NULL,
        'favoriteTeamResult', 'week_finalized', 'player_week',
        '{"result":"split","favorite_team_result":"loss"}', FALSE, TRUE),
      ('BITTERSWEET_SPLIT', 'Bittersweet Split', 'Split when picking your favorite team because they won.', NULL,
        'favoriteTeamResult', 'week_finalized', 'player_week',
        '{"result":"split","favorite_team_result":"win"}', FALSE, TRUE)
    ON CONFLICT (key) DO NOTHING`)
    .then(() => db.runSql(`UPDATE achievements
      SET description = 'Pick any two of the Bills, Giants, and Jets in the same week.',
          condition_config = '{"requirements":[{"any_match":[{"short_name":"BUF"},{"short_name":"NYG"},{"short_name":"NYJ"}],"count":2}]}'::jsonb
      WHERE key = 'EMPIRE_STATE_OF_MIND'`));
};

exports.down = function(db) {
  return db.runSql("DELETE FROM achievements WHERE key IN ('BUZZER_BEATER', 'SLIM_PICKINGS', 'SHEEP', 'CALIFORNIA_LOVE', 'WORST_OF_ALL_WORLDS', 'BITTERSWEET_SPLIT')")
    .then(() => db.runSql(`UPDATE achievements
      SET description = 'Pick the Giants and Jets in the same week.',
          condition_config = '{"requirements":[{"match":{"short_name":"NYG"},"count":1},{"match":{"short_name":"NYJ"},"count":1}]}'::jsonb
      WHERE key = 'EMPIRE_STATE_OF_MIND'`));
};

exports._meta = {
  "version": 1
};
