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

exports.up = async function(db) {
  return await Promise.all([
    db.createTable('users', {
      id: {
        type: 'int',
        unsigned: true,
        primaryKey: true,
        autoIncrement: true
      },
      email: {
        type: 'string',
        unique: true
      }
    }),
    db.createTable('fantasy_leagues', {
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
      },
      name: {
        type: 'string',
        notNull: true
      }
    })
  ]);
};

exports.down = async function(db, callback) {
  return await Promise.all([
    db.dropTable('users'),
    db.dropTable('fantasy_leagues')
  ]);
};

exports._meta = {
  "version": 1
};
