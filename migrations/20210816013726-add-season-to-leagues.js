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

exports.up = async function(db) {
  return await Promise.all([
    db.addColumn('fantasy_leagues', 'season', {
      type: 'string',
      notNull: true,
      defaultValue: '2021'
    })
  ]);
};

exports.down = async function(db) {
  return await Promise.all([
    db.removeColumn('fantasy_leagues', 'season')
  ]);
};

exports._meta = {
  "version": 1
};
