'use strict';

var dbm;
var type;
var seed;

// Keep this list in this migration until it is merged, so additional template
// ideas can be deployed together without changing the initial seed migration.
const messageTemplates = [
  {
    key: 'ITS_ALL_UP_TO',
    format: "It's all up to {subject}",
    slots: [
      {
        key: 'subject',
        position: 0,
        valueTypes: ['league_member', 'team'],
        prompt: 'Player or team'
      }
    ]
  },
  {
    key: 'LETS_GO',
    format: "Let's go, {subject}!",
    slots: [
      {
        key: 'subject',
        position: 0,
        valueTypes: ['league_member', 'team', 'catalog_value'],
        prompt: 'Player, team, or catalog entry'
      }
    ]
  },
  {
    key: 'ROOTING_AGAINST',
    format: 'Rooting against {subject}.',
    slots: [
      {
        key: 'subject',
        position: 0,
        valueTypes: ['league_member', 'team', 'catalog_value'],
        prompt: 'Player, team, or catalog entry'
      }
    ]
  }
];

const sqlString = value => `'${String(value).replaceAll("'", "''")}'`;
const sqlList = values => values.map(sqlString).join(', ');

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
  for (const template of messageTemplates) {
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
  }
};

exports.down = async function(db) {
  const templateKeys = messageTemplates.map(template => template.key);
  await db.runSql(`DELETE FROM message_template_slot_value_types
    WHERE template_slot_id IN (
      SELECT slots.id
      FROM message_template_slots slots
      JOIN message_templates templates ON templates.id = slots.template_id
      WHERE templates.key IN (${sqlList(templateKeys)})
    )`);
  await db.runSql(`DELETE FROM message_template_slots
    WHERE template_id IN (
      SELECT id FROM message_templates WHERE key IN (${sqlList(templateKeys)})
    )`);
  await db.runSql(`DELETE FROM message_templates
    WHERE key IN (${sqlList(templateKeys)})`);
};

exports._meta = {
  "version": 1
};
