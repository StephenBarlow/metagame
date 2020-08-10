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
  return db.createTable('picks', {
    id: {
      type: 'int',
      unsigned: true,
      primaryKey: true,
      autoIncrement: true
    },
    league_id: {
      type: 'int',
      notNull: true
    },
    user_id: {
      type: 'int',
      notNull: true
    },
    team_id: {
      type: 'int',
      notNull: true
    },
    week: {
      type: 'int'
    },
    created_at: {
      type: 'timestamp',
      defaultValue: new String('CURRENT_TIMESTAMP')
    },
    invalidated_at: {
      type: 'timestamp'
    }
  });
};

exports.down = function(db) {
  return db.dropTable('picks');
};

exports._meta = {
  "version": 1
};
