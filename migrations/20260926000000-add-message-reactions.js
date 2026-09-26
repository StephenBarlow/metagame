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
  return db.runSql(`CREATE TABLE message_reactions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reaction_type VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    invalidated_at TIMESTAMP WITH TIME ZONE
  )`)
    .then(() => db.addForeignKey(
      'message_reactions',
      'messages',
      'message_reactions_message_id_fk',
      { message_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.addForeignKey(
      'message_reactions',
      'users',
      'message_reactions_user_id_fk',
      { user_id: 'id' },
      { onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
    ))
    .then(() => db.runSql(
      "ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_type_check CHECK (reaction_type IN ('upvote', 'downvote'))"
    ))
    .then(() => db.runSql(
      'CREATE UNIQUE INDEX message_reactions_message_user_idx ON message_reactions (message_id, user_id)'
    ))
    .then(() => db.runSql(
      'CREATE INDEX message_reactions_active_message_idx ON message_reactions (message_id, reaction_type) WHERE invalidated_at IS NULL'
    ));
};

exports.down = function(db) {
  return db.runSql('DROP INDEX IF EXISTS message_reactions_active_message_idx')
    .then(() => db.runSql('DROP INDEX IF EXISTS message_reactions_message_user_idx'))
    .then(() => db.dropTable('message_reactions'));
};

exports._meta = {
  "version": 1
};
