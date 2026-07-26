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
  return Promise.all([
    db.addColumn('fantasy_leagues', 'current_week', {
      type: 'int'
    }),
    db.addColumn('fantasy_leagues', 'revealed_week', {
      type: 'int'
    })
  ]);
};

exports.down = function(db) {
  return Promise.all([
    db.removeColumn('fantasy_leagues', 'current_week'),
    db.removeColumn('fantasy_leagues', 'revealed_week')
  ]);
};

exports._meta = {
  "version": 1
};
