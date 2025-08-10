'use strict';

const fs = require('fs');
const parse = require('csv-parse/lib/sync')

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
  const games = parse(fs.readFileSync('./seed_data/nfl_2025.csv'));

  for (const game of games) {
    await db.insert('sports_games', [
      'season',
      'week',
      'start_time',
      'away_team_short_name',
      'home_team_short_name'
    ], [
      2025,
      game[0],
      game[1],
      game[2],
      game[3]
    ]);
  }

  return null;
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
