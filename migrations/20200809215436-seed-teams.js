'use strict';

const fs = require('fs');

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
  const teams = JSON.parse(fs.readFileSync('./seed_data/nfl-teams.json'));

  for (const team of teams) {
    await db.insert('teams', [
      'name', 'short_name'
    ], [
      team.name, team.shortname
    ]);
  }

  return null;
};

exports.down = function(db) {
  return db.runSql("delete from teams where sports_league = 'NFL'");
};

exports._meta = {
  "version": 1
};
