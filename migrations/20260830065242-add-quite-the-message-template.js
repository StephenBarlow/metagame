'use strict';

var dbm;
var type;
var seed;

const template = {
  key: 'QUITE_THE',
  format: 'Quite the {adjective} {catalog_item} by {subject}',
  slots: [
    {
      key: 'adjective',
      position: 0,
      valueTypes: ['adjective'],
      prompt: 'Adjective'
    },
    {
      key: 'catalog_item',
      position: 1,
      valueTypes: ['catalog_value'],
      prompt: 'Catalog entry'
    },
    {
      key: 'subject',
      position: 2,
      valueTypes: ['league_member', 'team'],
      prompt: 'Player or team'
    }
  ]
};

const sqlString = value => `'${String(value).replaceAll("'", "''")}'`;

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
    VALUES (${sqlString(template.key)}, ${sqlString(template.format)}, TRUE)
    ON CONFLICT (key) DO NOTHING`);

  for (const slot of template.slots) {
    await db.runSql(`INSERT INTO message_template_slots
      (template_id, key, position, prompt)
      VALUES (
        (SELECT id FROM message_templates WHERE key = ${sqlString(template.key)}),
        ${sqlString(slot.key)},
        ${Number(slot.position)},
        ${sqlString(slot.prompt)}
      )
      ON CONFLICT (template_id, key) DO NOTHING`);

    for (const valueType of slot.valueTypes) {
      await db.runSql(`INSERT INTO message_template_slot_value_types
        (template_slot_id, value_type)
        VALUES (
          (
            SELECT slots.id
            FROM message_template_slots slots
            JOIN message_templates templates ON templates.id = slots.template_id
            WHERE templates.key = ${sqlString(template.key)}
              AND slots.key = ${sqlString(slot.key)}
          ),
          ${sqlString(valueType)}
        )
        ON CONFLICT (template_slot_id, value_type) DO NOTHING`);
    }
  }
};

exports.down = async function(db) {
  await db.runSql(`DELETE FROM message_template_slot_value_types
    WHERE template_slot_id IN (
      SELECT slots.id
      FROM message_template_slots slots
      JOIN message_templates templates ON templates.id = slots.template_id
      WHERE templates.key = ${sqlString(template.key)}
    )`);
  await db.runSql(`DELETE FROM message_template_slots
    WHERE template_id = (SELECT id FROM message_templates WHERE key = ${sqlString(template.key)})`);
  await db.runSql(`DELETE FROM message_templates WHERE key = ${sqlString(template.key)}`);
};

exports._meta = {
  "version": 1
};
