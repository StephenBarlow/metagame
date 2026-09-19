'use strict';

var dbm;
var type;
var seed;

// Keep the remaining in-season additions together here until this batch is merged.
const achievements = [
  {
    key: 'HAPPY_PICK_YEAR',
    name: 'Happy Pick Year!',
    description: "Pick a team from a New Year's game.",
    evaluator: 'gameTagCombination',
    evaluationPhase: 'pick_locked',
    scope: 'player_week',
    conditionConfig: { tag: 'new_years', picked_team_count: 1 },
    repeatable: false
  },
  {
    key: 'EXPANSION_PACK',
    name: 'Expansion Pack',
    description: 'In a single week, pick two teams that joined the league after 1994.',
    evaluator: 'teamCombination',
    evaluationPhase: 'pick_locked',
    scope: 'player_week',
    conditionConfig: { requirements: [{ match: { tag: 'expansion' }, count: 2 }] },
    repeatable: false
  },
  {
    key: 'TIME_LOOP',
    name: 'Time Loop!',
    description: 'Pick the exact same pair of teams that another player picked in a previous week.',
    evaluator: 'previousWeekMatchingPair',
    evaluationPhase: 'pick_locked',
    scope: 'player_week',
    conditionConfig: {},
    repeatable: false
  },
  {
    key: 'FOMO',
    name: 'FOMO',
    description: 'Take a bye in a week when every non-BYE pick scored.',
    evaluator: 'byeWhenAllNonByeResults',
    evaluationPhase: 'week_finalized',
    scope: 'league_week',
    conditionConfig: { qualifying_outcomes: ['double_win', 'double_loss'] },
    repeatable: false
  },
  {
    key: 'HEEL_TURN',
    name: 'Heel Turn',
    description: "Achieve a double-win by picking two opponents of other players' favorite teams.",
    evaluator: 'otherMembersFavoriteTeamOpponentsResult',
    evaluationPhase: 'week_finalized',
    scope: 'league_week',
    conditionConfig: { result: 'double_win' },
    repeatable: false
  }
];

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
  for (const achievement of achievements) {
    await db.runSql(`INSERT INTO achievements
      (key, name, description, icon_id, evaluator, evaluation_phase, scope, condition_config, repeatable, active)
      VALUES (
        ${sqlString(achievement.key)},
        ${sqlString(achievement.name)},
        ${sqlString(achievement.description)},
        NULL,
        ${sqlString(achievement.evaluator)},
        ${sqlString(achievement.evaluationPhase)},
        ${sqlString(achievement.scope)},
        ${sqlString(JSON.stringify(achievement.conditionConfig))}::jsonb,
        ${achievement.repeatable},
        TRUE
      )
      ON CONFLICT (key) DO NOTHING`);
  }
};

exports.down = function(db) {
  return db.runSql(`DELETE FROM achievements
    WHERE key IN (${achievements.map(achievement => sqlString(achievement.key)).join(', ')})`);
};

exports._meta = {
  "version": 1
};
