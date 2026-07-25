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
  return db.createTable('sports_team_tags', {
    id: {
      type: 'int',
      unsigned: true,
      primaryKey: true,
      autoIncrement: true
    },
    team_id: {
      type: 'int',
      notNull: true
    },
    tag: {
      type: 'string',
      notNull: true
    }
  })
    .then(() => db.runSql(
      'CREATE UNIQUE INDEX sports_team_tags_team_id_tag_idx ON sports_team_tags (team_id, tag)'
    ))
    .then(() => db.runSql(
      'CREATE INDEX sports_team_tags_tag_idx ON sports_team_tags (tag)'
    ))
    .then(() => db.createTable('sports_game_tags', {
      id: {
        type: 'int',
        unsigned: true,
        primaryKey: true,
        autoIncrement: true
      },
      game_id: {
        type: 'int',
        notNull: true
      },
      tag: {
        type: 'string',
        notNull: true
      }
    }))
    .then(() => db.runSql(
      'CREATE UNIQUE INDEX sports_game_tags_game_id_tag_idx ON sports_game_tags (game_id, tag)'
    ))
    .then(() => db.runSql(
      'CREATE INDEX sports_game_tags_tag_idx ON sports_game_tags (tag)'
    ));
};

exports.down = function(db) {
  return db.runSql('DROP INDEX IF EXISTS sports_game_tags_tag_idx')
    .then(() => db.runSql('DROP INDEX IF EXISTS sports_game_tags_game_id_tag_idx'))
    .then(() => db.dropTable('sports_game_tags'))
    .then(() => db.runSql('DROP INDEX IF EXISTS sports_team_tags_tag_idx'))
    .then(() => db.runSql('DROP INDEX IF EXISTS sports_team_tags_team_id_tag_idx'))
    .then(() => db.dropTable('sports_team_tags'));
};

exports._meta = {
  "version": 1
};
