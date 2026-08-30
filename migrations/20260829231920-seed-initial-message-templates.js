'use strict';

var dbm;
var type;
var seed;

// Keep this migration data-only. We can build the initial catalog here before
// the migration is deployed, without coupling the seed to application code.
const messageValues = [
  { key: 'DOUBLE_LOSS', text: 'double-loss' },
  { key: 'DOUBLE_WIN', text: 'double-win' },
  { key: 'SPLIT', text: 'split' },
  { key: 'TRAP_GAME', text: 'trap game' },
  { key: 'LATE_PICK', text: 'late pick' },
  { key: 'HUBRIS', text: 'hubris' },
  { key: 'GENIUS_PICK', text: 'genius pick' },
  { key: 'ABYSMAL_PICK', text: 'abysmal pick' },
  { key: 'BYE_WEEK', text: 'bye week' },
  { key: 'UPSET', text: 'upset' },
  { key: 'BLOWOUT', text: 'blowout' },
  { key: 'NAIL_BITER', text: 'nail-biter' },
  { key: 'MIRACLE', text: 'miracle' },
  { key: 'CHAOS', text: 'chaos' },
  { key: 'COMEBACK', text: 'comeback' },
  { key: 'COIN_FLIP', text: 'coin flip' },
  { key: 'HEAT_CHECK', text: 'heat check' },
  { key: 'HAIL_MARY', text: 'hail mary' },
  { key: 'HEARTBREAK', text: 'heartbreak' },
  { key: 'REDEMPTION', text: 'redemption' },
  { key: 'CURSE', text: 'curse' }
];

const messageAdjectives = [
  { key: 'INCREDIBLE', text: 'incredible' },
  { key: 'TERRIBLE', text: 'terrible' },
  { key: 'CURSED', text: 'cursed' },
  { key: 'DELUSIONAL', text: 'delusional' },
  { key: 'UNHINGED', text: 'unhinged' },
  { key: 'THE_WORST', text: 'the worst' },
  { key: 'THE_BEST', text: 'the best' },
  { key: 'HISTORIC', text: 'historic' }
];

const allMessageValues = [
  ...messageValues.map(value => ({ ...value, kind: 'catalog_value' })),
  ...messageAdjectives.map(value => ({ ...value, kind: 'adjective' }))
];

const messageTemplates = [
  {
    key: 'ADJECTIVE_PICK',
    format: '{adjective} pick, {player}!',
    slots: [
      {
        key: 'adjective',
        position: 0,
        valueTypes: ['adjective'],
        prompt: 'Adjective'
      },
      {
        key: 'player',
        position: 1,
        valueTypes: ['league_member'],
        prompt: 'Player'
      }
    ]
  },
  {
    key: 'BETRAYED_BY',
    format: 'Betrayed by {subject}.',
    slots: [
      {
        key: 'subject',
        position: 0,
        valueTypes: ['team', 'catalog_value'],
        prompt: 'Team or catalog entry'
      }
    ]
  },
  {
    key: 'ALAS',
    format: 'Alas, {subject}.',
    slots: [
      {
        key: 'subject',
        position: 0,
        valueTypes: ['league_member', 'team', 'catalog_value'],
        prompt: 'Player, team, or outcome'
      }
    ]
  },
  {
    key: 'BEHOLD',
    format: 'Behold, {subject}!',
    slots: [
      {
        key: 'subject',
        position: 0,
        valueTypes: ['league_member', 'team', 'catalog_value'],
        prompt: 'Player, team, or outcome'
      }
    ]
  },
  {
    key: 'VISIONS_OF',
    format: 'Visions of {catalog_item}.',
    slots: [
      {
        key: 'catalog_item',
        position: 0,
        valueTypes: ['catalog_value'],
        prompt: 'Feeling'
      }
    ]
  },
  {
    key: 'THINKING_ABOUT_THOSE',
    format: "I'm thinking about those {team}.",
    slots: [
      {
        key: 'team',
        position: 0,
        valueTypes: ['team'],
        prompt: 'Team'
      }
    ]
  },
  {
    key: 'PRAISE_THE',
    format: 'Praise the {subject}!',
    slots: [
      {
        key: 'subject',
        position: 0,
        valueTypes: ['team', 'catalog_value'],
        prompt: 'Team or catalog entry'
      }
    ]
  },
  {
    key: 'WELL_PLAYED',
    format: 'Well played, {player}',
    slots: [
      {
        key: 'player',
        position: 0,
        valueTypes: ['league_member'],
        prompt: 'Player'
      }
    ]
  },
  {
    key: 'MY_NEMESIS',
    format: "Well if it isn't my nemesis: {subject}",
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
    key: 'SUBJECT_ADJECTIVE',
    format: '{subject}? {adjective}!',
    slots: [
      {
        key: 'subject',
        position: 0,
        valueTypes: ['league_member', 'team', 'catalog_value'],
        prompt: 'Player, team, or catalog entry'
      },
      {
        key: 'adjective',
        position: 1,
        valueTypes: ['adjective'],
        prompt: 'Adjective'
      }
    ]
  },
  {
    key: 'THIS_WEEK_IS',
    format: 'This week is {adjective}.',
    slots: [
      {
        key: 'adjective',
        position: 0,
        valueTypes: ['adjective'],
        prompt: 'Adjective'
      }
    ]
  },
  {
    key: 'FEELIN',
    format: "Feelin' {adjective}.",
    slots: [
      {
        key: 'adjective',
        position: 0,
        valueTypes: ['adjective'],
        prompt: 'Adjective'
      }
    ]
  },
  {
    key: 'CLASSIC',
    format: 'Classic {subject}.',
    slots: [
      {
        key: 'subject',
        position: 0,
        valueTypes: ['team', 'league_member'],
        prompt: 'Team or player'
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
  if (messageTemplates.length === 0) {
    throw new Error('Add the initial message templates before running this migration.');
  }

  for (const value of allMessageValues) {
    await db.runSql(`INSERT INTO message_values (key, kind, text, active)
      VALUES (${sqlString(value.key)}, ${sqlString(value.kind)}, ${sqlString(value.text)}, ${value.active === false ? 'FALSE' : 'TRUE'})
      ON CONFLICT (key) DO NOTHING`);
  }

  for (const template of messageTemplates) {
    await db.runSql(`INSERT INTO message_templates (key, format, active)
      VALUES (${sqlString(template.key)}, ${sqlString(template.format)}, ${template.active === false ? 'FALSE' : 'TRUE'})
      ON CONFLICT (key) DO NOTHING`);

    for (const slot of template.slots) {
      await db.runSql(`INSERT INTO message_template_slots
        (template_id, key, position, prompt)
        VALUES (
          (SELECT id FROM message_templates WHERE key = ${sqlString(template.key)}),
          ${sqlString(slot.key)},
          ${Number(slot.position)},
          ${slot.prompt == null ? 'NULL' : sqlString(slot.prompt)}
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
  const valueKeys = allMessageValues.map(value => value.key);

  if (templateKeys.length > 0) {
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
  }

  if (valueKeys.length > 0) {
    await db.runSql(`DELETE FROM message_values
      WHERE key IN (${sqlList(valueKeys)})`);
  }
};

exports._meta = {
  "version": 1
};
