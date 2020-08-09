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
  return db.createTable('sports_game_results', {
    sports_game_id: {
      type: 'int',
      unsigned: true,
      primaryKey: true,
      foreignKey: {
        name: 'game_result_game_id_fk',
        table: 'sports_games',
        rules: {
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT'
        },
        mapping: {
          sports_game_id: 'id'
        }
      }
    },
    away_team_score: {
      type: 'int',
      notNull: true,
    },
    home_team_score: {
      type: 'int',
      notNull: true,
    }
  });
};

exports.down = function(db) {
  return db.dropTable('sports_game_results');
};

exports._meta = {
  "version": 1
};
