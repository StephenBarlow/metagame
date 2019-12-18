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
    db.addColumn('fantasy_leagues', 'sports_league', {
      type: 'SPORTS_LEAGUE',
      notNull: true,
      defaultValue: 'NFL'
    }),
    db.addColumn('fantasy_leagues', 'game_mode', {
      type: 'GAME_MODE',
      notNull: true
    })
  ]);
};

exports.down = async function(db) {
  return await Promise.all([
    db.removeColumn('fantasy_leagues', 'sports_league'),
    db.removeColumn('fantasy_leagues', 'game_mode')
  ]);
};

exports._meta = {
  "version": 1
};
