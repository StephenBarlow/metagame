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
  return db.createTable('achievements', {
    id: {
      type: 'int',
      unsigned: true,
      primaryKey: true,
      autoIncrement: true
    },
    key: {
      type: 'string',
      notNull: true,
      unique: true
    },
    name: {
      type: 'string',
      notNull: true
    },
    description: {
      type: 'text',
      notNull: true
    },
    image_url: {
      type: 'string'
    },
    evaluator: {
      type: 'string',
      notNull: true
    },
    evaluation_phase: {
      type: 'string',
      notNull: true
    },
    scope: {
      type: 'string',
      notNull: true
    },
    condition_config: {
      type: 'jsonb',
      notNull: true,
      defaultValue: '{}'
    },
    repeatable: {
      type: 'boolean',
      notNull: true,
      defaultValue: false
    },
    active: {
      type: 'boolean',
      notNull: true,
      defaultValue: true
    },
    created_at: {
      type: 'timestamp',
      defaultValue: new String('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: 'timestamp',
      defaultValue: new String('CURRENT_TIMESTAMP')
    }
  })
    .then(() => db.createTable('league_achievements', {
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
      achievement_id: {
        type: 'int',
        notNull: true
      },
      active: {
        type: 'boolean',
        notNull: true,
        defaultValue: true
      },
      enabled_at: {
        type: 'timestamp',
        defaultValue: new String('CURRENT_TIMESTAMP')
      }
    }))
    .then(() => db.runSql(
      'CREATE UNIQUE INDEX league_achievements_league_id_achievement_id_idx ON league_achievements (league_id, achievement_id)'
    ))
    .then(() => db.createTable('achievement_awards', {
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
      achievement_id: {
        type: 'int',
        notNull: true
      },
      user_id: {
        type: 'int',
        notNull: true
      },
      week: {
        type: 'int',
        notNull: true
      },
      award_key: {
        type: 'string',
        notNull: true
      },
      awarded_at: {
        type: 'timestamp',
        defaultValue: new String('CURRENT_TIMESTAMP')
      },
      evidence: {
        type: 'jsonb',
        notNull: true,
        defaultValue: '{}'
      }
    }))
    .then(() => db.runSql(
      'CREATE UNIQUE INDEX achievement_awards_identity_idx ON achievement_awards (league_id, achievement_id, user_id, award_key)'
    ))
    .then(() => db.runSql(
      'CREATE INDEX achievement_awards_user_id_idx ON achievement_awards (user_id)'
    ))
    .then(() => db.runSql(
      'CREATE INDEX achievement_awards_league_id_idx ON achievement_awards (league_id)'
    ));
};

exports.down = function(db) {
  return db.runSql('DROP INDEX IF EXISTS achievement_awards_league_id_idx')
    .then(() => db.runSql('DROP INDEX IF EXISTS achievement_awards_user_id_idx'))
    .then(() => db.runSql('DROP INDEX IF EXISTS achievement_awards_identity_idx'))
    .then(() => db.dropTable('achievement_awards'))
    .then(() => db.runSql('DROP INDEX IF EXISTS league_achievements_league_id_achievement_id_idx'))
    .then(() => db.dropTable('league_achievements'))
    .then(() => db.dropTable('achievements'));
};

exports._meta = {
  "version": 1
};
