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
  return db.createTable('sports_games', {
    id: {
      type: 'int',
      unsigned: true,
      primaryKey: true,
      autoIncrement: true
    },
    away_team_id: {
      type: 'int',
      notNull: true,
    },
    home_team_id: {
      type: 'int',
      notNull: true,
    },
    start_time: {
      type: 'timestamp',
      notNull: true
    },
    week: {
      type: 'int'
    },
    sports_league: {
      type: 'SPORTS_LEAGUE',
      notNull: true,
      defaultValue: 'NFL'
    }
  });
};

exports.down = function(db) {
  return db.dropTable('sports_games');
};

exports._meta = {
  "version": 1
};
