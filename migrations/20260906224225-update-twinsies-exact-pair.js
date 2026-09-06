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
    SET description = 'End any week after week 3 with a nonzero total score shared by exactly one other player.'
    WHERE key = 'TWINSIES'`);
};

exports.down = function(db) {
  return db.runSql(`UPDATE achievements
    SET description = 'End any week after week 3 with the same total nonzero score as another player.'
    WHERE key = 'TWINSIES'`);
};

exports._meta = {
  "version": 1
};
