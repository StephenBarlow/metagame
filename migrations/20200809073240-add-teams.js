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
  return db.createTable('teams', {
    id: {
      type: 'int',
      unsigned: true,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: 'string',
      notNull: true
    },
    short_name: {
      type: 'string',
      notNull: true
    },
    sports_league: {
      type: 'SPORTS_LEAGUE',
      notNull: true,
      defaultValue: 'NFL'
    }
  });
};

exports.down = function(db) {
  return db.dropTable('teams');
};

exports._meta = {
  "version": 1
};
