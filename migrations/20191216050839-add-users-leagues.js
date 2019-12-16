'use strict';

var dbm;
var type;
var seed;
var async = require('async');

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function(db, callback) {
  async.series([
    db.createTable.bind(db, 'users', {
      id: {
        type: 'int',
        unsigned: true,
        primaryKey: true,
        autoIncrement: true
      },
      email: {
        type: 'string'
      }
    }),
    db.createTable.bind(db, 'fantasy-leagues', {
      id: {
        type: 'int',
        unsigned: true,
        primaryKey: true,
        autoIncrement: true
      },
      owner_id: {
        type: 'int',
        unsigned: true,
        notNull: true
      }
    })
  ], callback);
};

exports.down = function(db) {
  async.series([
    db.dropTable.bind(db, 'users'),
    db.dropTable.bind(db, 'fantasy-leagues')
  ], callback);
};

exports._meta = {
  "version": 1
};
