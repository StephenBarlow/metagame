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
  return db.createTable('memberships', {
    id: {
      type: 'int',
      unsigned: true,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: 'string',
      notNull: true
    },
    league_id: {
      type: 'string',
      notNull: true
    },
    display_name: {
      type: 'string',
      notNull: true
    },
    created_at: {
      type: 'timestamp',
      defaultValue: new String('CURRENT_TIMESTAMP')
    },
    revoked_at: {
      type: 'timestamp'
    }
  });
};

exports.down = function(db) {
  return db.dropTable('memberships');
};

exports._meta = {
  "version": 1
};
