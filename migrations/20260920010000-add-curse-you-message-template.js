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
  await db.runSql(`INSERT INTO message_templates (key, format, active)
    VALUES ('CURSE_YOU', 'Curse you, {subject}', TRUE)
    ON CONFLICT (key) DO NOTHING`);

  await db.runSql(`INSERT INTO message_template_slots
    (template_id, key, position, prompt)
    VALUES (
      (SELECT id FROM message_templates WHERE key = 'CURSE_YOU'),
      'subject',
      0,
      'Player, team, or catalog entry'
    )
    ON CONFLICT (template_id, key) DO NOTHING`);

  for (const valueType of ['league_member', 'team', 'catalog_value']) {
    await db.runSql(`INSERT INTO message_template_slot_value_types
      (template_slot_id, value_type)
      VALUES (
        (
          SELECT slots.id
          FROM message_template_slots slots
          JOIN message_templates templates ON templates.id = slots.template_id
          WHERE templates.key = 'CURSE_YOU' AND slots.key = 'subject'
        ),
        '${valueType}'
      )
      ON CONFLICT (template_slot_id, value_type) DO NOTHING`);
  }
};

exports.down = async function(db) {
  await db.runSql(`DELETE FROM message_template_slot_value_types
    WHERE template_slot_id IN (
      SELECT slots.id
      FROM message_template_slots slots
      JOIN message_templates templates ON templates.id = slots.template_id
      WHERE templates.key = 'CURSE_YOU'
    )`);
  await db.runSql(`DELETE FROM message_template_slots
    WHERE template_id = (SELECT id FROM message_templates WHERE key = 'CURSE_YOU')`);
  await db.runSql(`DELETE FROM message_templates WHERE key = 'CURSE_YOU'`);
};

exports._meta = {
  "version": 1
};
