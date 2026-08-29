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
  return db.createTable('message_templates', {
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
    format: {
      type: 'text',
      notNull: true
    },
    active: {
      type: 'boolean',
      notNull: true,
      defaultValue: true
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      defaultValue: new String('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      defaultValue: new String('CURRENT_TIMESTAMP')
    }
  })
    .then(() => db.createTable('message_values', {
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
      kind: {
        type: 'string',
        notNull: true,
        defaultValue: 'catalog_value'
      },
      text: {
        type: 'text',
        notNull: true
      },
      active: {
        type: 'boolean',
        notNull: true,
        defaultValue: true
      },
      created_at: {
        type: 'timestamp',
        notNull: true,
        defaultValue: new String('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: 'timestamp',
        notNull: true,
        defaultValue: new String('CURRENT_TIMESTAMP')
      }
    }))
    .then(() => db.runSql(
      "ALTER TABLE message_values ADD CONSTRAINT message_values_kind_check CHECK (kind IN ('catalog_value', 'adjective'))"
    ))
    .then(() => db.createTable('message_template_slots', {
      id: {
        type: 'int',
        unsigned: true,
        primaryKey: true,
        autoIncrement: true
      },
      template_id: {
        type: 'int',
        notNull: true
      },
      key: {
        type: 'string',
        notNull: true
      },
      position: {
        type: 'int',
        notNull: true
      },
      prompt: {
        type: 'string'
      },
      created_at: {
        type: 'timestamp',
        notNull: true,
        defaultValue: new String('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: 'timestamp',
        notNull: true,
        defaultValue: new String('CURRENT_TIMESTAMP')
      }
    }))
    .then(() => db.addForeignKey(
      'message_template_slots',
      'message_templates',
      'message_template_slots_template_id_fk',
      { template_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.runSql(
      'ALTER TABLE message_template_slots ADD CONSTRAINT message_template_slots_position_check CHECK (position >= 0)'
    ))
    .then(() => db.runSql(
      'CREATE UNIQUE INDEX message_template_slots_template_key_idx ON message_template_slots (template_id, key)'
    ))
    .then(() => db.runSql(
      'CREATE UNIQUE INDEX message_template_slots_template_position_idx ON message_template_slots (template_id, position)'
    ))
    .then(() => db.createTable('message_template_slot_value_types', {
      id: {
        type: 'int',
        unsigned: true,
        primaryKey: true,
        autoIncrement: true
      },
      template_slot_id: {
        type: 'int',
        notNull: true
      },
      value_type: {
        type: 'string',
        notNull: true
      }
    }))
    .then(() => db.addForeignKey(
      'message_template_slot_value_types',
      'message_template_slots',
      'message_template_slot_value_types_template_slot_id_fk',
      { template_slot_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.runSql(
      "ALTER TABLE message_template_slot_value_types ADD CONSTRAINT message_template_slot_value_types_value_type_check CHECK (value_type IN ('catalog_value', 'adjective', 'league_member', 'team'))"
    ))
    .then(() => db.runSql(
      'CREATE UNIQUE INDEX message_template_slot_value_types_slot_type_idx ON message_template_slot_value_types (template_slot_id, value_type)'
    ))
    .then(() => db.createTable('messages', {
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
      week: {
        type: 'int',
        notNull: true
      },
      author_membership_id: {
        type: 'int',
        notNull: true
      },
      template_id: {
        type: 'int',
        notNull: true
      },
      rendered_text: {
        type: 'text',
        notNull: true
      },
      created_at: {
        type: 'timestamp',
        notNull: true,
        defaultValue: new String('CURRENT_TIMESTAMP')
      },
      invalidated_at: {
        type: 'timestamp'
      }
    }))
    .then(() => db.addForeignKey(
      'messages',
      'fantasy_leagues',
      'messages_league_id_fk',
      { league_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.addForeignKey(
      'messages',
      'memberships',
      'messages_author_membership_id_fk',
      { author_membership_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.addForeignKey(
      'messages',
      'message_templates',
      'messages_template_id_fk',
      { template_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.runSql(
      'ALTER TABLE messages ADD CONSTRAINT messages_week_check CHECK (week >= 0)'
    ))
    .then(() => db.runSql(
      'CREATE INDEX messages_league_week_created_at_idx ON messages (league_id, week, created_at)'
    ))
    .then(() => db.runSql(
      'CREATE INDEX messages_author_membership_id_idx ON messages (author_membership_id)'
    ))
    .then(() => db.createTable('message_selections', {
      id: {
        type: 'int',
        unsigned: true,
        primaryKey: true,
        autoIncrement: true
      },
      message_id: {
        type: 'int',
        notNull: true
      },
      template_slot_id: {
        type: 'int',
        notNull: true
      },
      message_value_id: {
        type: 'int'
      },
      league_membership_id: {
        type: 'int'
      },
      team_id: {
        type: 'int'
      }
    }))
    .then(() => db.addForeignKey(
      'message_selections',
      'messages',
      'message_selections_message_id_fk',
      { message_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.addForeignKey(
      'message_selections',
      'message_template_slots',
      'message_selections_template_slot_id_fk',
      { template_slot_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.addForeignKey(
      'message_selections',
      'message_values',
      'message_selections_message_value_id_fk',
      { message_value_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.addForeignKey(
      'message_selections',
      'memberships',
      'message_selections_league_membership_id_fk',
      { league_membership_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.addForeignKey(
      'message_selections',
      'teams',
      'message_selections_team_id_fk',
      { team_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.runSql(
      'ALTER TABLE message_selections ADD CONSTRAINT message_selections_exactly_one_value_check CHECK (num_nonnulls(message_value_id, league_membership_id, team_id) = 1)'
    ))
    .then(() => db.runSql(
      'CREATE UNIQUE INDEX message_selections_message_slot_idx ON message_selections (message_id, template_slot_id)'
    ))
    .then(() => db.runSql(
      'CREATE INDEX message_selections_message_value_id_idx ON message_selections (message_value_id) WHERE message_value_id IS NOT NULL'
    ))
    .then(() => db.runSql(
      'CREATE INDEX message_selections_league_membership_id_idx ON message_selections (league_membership_id) WHERE league_membership_id IS NOT NULL'
    ))
    .then(() => db.runSql(
      'CREATE INDEX message_selections_team_id_idx ON message_selections (team_id) WHERE team_id IS NOT NULL'
    ));
};

exports.down = function(db) {
  return db.runSql('DROP INDEX IF EXISTS message_selections_team_id_idx')
    .then(() => db.runSql('DROP INDEX IF EXISTS message_selections_league_membership_id_idx'))
    .then(() => db.runSql('DROP INDEX IF EXISTS message_selections_message_value_id_idx'))
    .then(() => db.runSql('DROP INDEX IF EXISTS message_selections_message_slot_idx'))
    .then(() => db.dropTable('message_selections'))
    .then(() => db.runSql('DROP INDEX IF EXISTS messages_author_membership_id_idx'))
    .then(() => db.runSql('DROP INDEX IF EXISTS messages_league_week_created_at_idx'))
    .then(() => db.dropTable('messages'))
    .then(() => db.runSql('DROP INDEX IF EXISTS message_template_slot_value_types_slot_type_idx'))
    .then(() => db.dropTable('message_template_slot_value_types'))
    .then(() => db.runSql('DROP INDEX IF EXISTS message_template_slots_template_position_idx'))
    .then(() => db.runSql('DROP INDEX IF EXISTS message_template_slots_template_key_idx'))
    .then(() => db.dropTable('message_template_slots'))
    .then(() => db.dropTable('message_values'))
    .then(() => db.dropTable('message_templates'));
};

exports._meta = {
  "version": 1
};
