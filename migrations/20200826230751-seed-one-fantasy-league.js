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
  await db.insert('users', [
    'email'
  ], [
    'test@example.com'
  ]);
  
  await db.insert('fantasy_leagues', [
    'owner_id', 'name', 'game_mode'
  ], [
    1, 'Pick 2 2020', 'PICK_TWO'
  ]);

  await db.insert('memberships', [
    'user_id', 'league_id', 'display_name'
  ], [
    1, 1, 'Test User'
  ]);

  return null;
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
