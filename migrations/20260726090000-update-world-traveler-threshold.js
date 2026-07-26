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
  return db.runSql(`UPDATE achievements
    SET description = 'Twice this season, pick a team from a game that''s played outside the United States.',
        evaluator = 'seasonalThreshold',
        evaluation_phase = 'pick_locked',
        scope = 'player_season',
        condition_config = '{"base_evaluator":"gameTagCombination","minimum_occurrences":2,"occurrence_unit":"picked_team","tag":"international","picked_team_count_at_least":1}'::jsonb
    WHERE key = 'WORLD_TRAVELER'`);
};

exports.down = function(db) {
  return db.runSql(`UPDATE achievements
    SET description = 'Pick a team from a game that''s played outside the United States.',
        evaluator = 'gameTagCombination',
        evaluation_phase = 'pick_locked',
        scope = 'player_week',
        condition_config = '{"tag":"international","picked_team_count_at_least":1}'::jsonb
    WHERE key = 'WORLD_TRAVELER'`);
};

exports._meta = {
  "version": 1
};
