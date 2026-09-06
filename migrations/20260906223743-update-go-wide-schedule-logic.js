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
    SET description = 'In a single week, pick teams from the uniquely earliest and latest-starting games.',
        evaluator = 'firstAndLastGame',
        condition_config = '{}'::jsonb
    WHERE key = 'GO_WIDE'`);
};

exports.down = function(db) {
  return db.runSql(`UPDATE achievements
    SET description = 'In a single week, pick teams from the first Thursday game and the last Monday game.',
        evaluator = 'gameTagCombination',
        condition_config = '{"required_tags":["thursday","monday"],"one_pick_per_tag":true}'::jsonb
    WHERE key = 'GO_WIDE'`);
};

exports._meta = {
  "version": 1
};
