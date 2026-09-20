'use strict';

var dbm;
var type;
var seed;

const teamShortNames = ['LAR', 'MIN', 'HOU', 'BUF'];

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
  await db.runSql(`INSERT INTO sports_team_tags (team_id, tag)
    SELECT id, 'horns'
    FROM teams
    WHERE sports_league = 'NFL' AND short_name IN (${teamShortNames.map(name => `'${name}'`).join(', ')})
    ON CONFLICT (team_id, tag) DO NOTHING`);
  await db.runSql(`UPDATE achievements
    SET description = 'Pick any two of the Rams, Vikings, Texans, and Bills in the same week.',
        condition_config = '{"requirements":[{"match":{"tag":"horns"},"count":2}]}'::jsonb
    WHERE key = 'GET_THE_HORNS'`);
};

exports.down = async function(db) {
  await db.runSql(`UPDATE achievements
    SET description = 'Pick the Rams and Vikings in the same week.',
        condition_config = '{"requirements":[{"match":{"short_name":"LAR"},"count":1},{"match":{"short_name":"MIN"},"count":1}]}'::jsonb
    WHERE key = 'GET_THE_HORNS'`);
  await db.runSql(`DELETE FROM sports_team_tags
    WHERE tag = 'horns'
      AND team_id IN (
        SELECT id FROM teams
        WHERE sports_league = 'NFL' AND short_name IN (${teamShortNames.map(name => `'${name}'`).join(', ')})
      )`);
};

exports._meta = {
  "version": 1
};
