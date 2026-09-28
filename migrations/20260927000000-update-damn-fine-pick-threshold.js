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
    SET description = 'Score 50 points or more in a single week.',
        condition_config = '{"total_score_at_least":50}'::jsonb
    WHERE key = 'DAMN_FINE_PICK'`);
};

exports.down = function(db) {
  return db.runSql(`UPDATE achievements
    SET description = 'Score 60 points or more in a single week.',
        condition_config = '{"total_score_at_least":60}'::jsonb
    WHERE key = 'DAMN_FINE_PICK'`);
};

exports._meta = {
  "version": 1
};
