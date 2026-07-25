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
  const achievements = [
    {
      key: 'BIRD_BRAIN',
      name: 'Bird Brain',
      description: 'For the second time in a season, pick two teams with bird mascots.',
      evaluator: 'seasonalThreshold',
      evaluationPhase: 'pick_locked',
      scope: 'player_season',
      conditionConfig: {
        base_evaluator: 'teamCombination',
        minimum_occurrences: 2,
        requirements: [{ match: { tag: 'bird' }, count: 2 }]
      }
    },
    {
      key: 'TOXOPLASMOSIS',
      name: 'Toxoplasmosis',
      description: 'For the second time in a season, pick two teams with cat mascots.',
      evaluator: 'seasonalThreshold',
      evaluationPhase: 'pick_locked',
      scope: 'player_season',
      conditionConfig: {
        base_evaluator: 'teamCombination',
        minimum_occurrences: 2,
        requirements: [{ match: { tag: 'cat' }, count: 2 }]
      }
    },
    {
      key: 'COUNTRY_AND_WESTERN',
      name: 'Country and Western',
      description: 'Pick the Titans and Cowboys in the same week.',
      evaluator: 'teamCombination',
      conditionConfig: { requirements: [{ match: { short_name: 'TEN' }, count: 1 }, { match: { short_name: 'DAL' }, count: 1 }] }
    },
    {
      key: 'LOCAL_MAXIMUM',
      name: 'Local Maximum',
      description: 'Score the highest possible number of points in a given week.',
      evaluator: 'maximumPossibleScore',
      evaluationPhase: 'week_finalized',
      conditionConfig: { is_maximum_possible_score: true }
    },
    {
      key: 'FEE_FI_FO_FUM',
      name: 'Fee-fi-fo-fum',
      description: 'Pick the Giants and Titans in the same week.',
      evaluator: 'teamCombination',
      conditionConfig: { requirements: [{ match: { short_name: 'NYG' }, count: 1 }, { match: { short_name: 'TEN' }, count: 1 }] }
    },
    {
      key: 'FAMILY_MANNING',
      name: 'Family Manning',
      description: 'In a single week, pick any two of the Colts, Giants, and Saints.',
      evaluator: 'teamCombination',
      conditionConfig: { requirements: [{ any_match: [{ short_name: 'IND' }, { short_name: 'NYG' }, { short_name: 'NO' }], count: 2 }] }
    },
    {
      key: 'GOOD_AND_EVIL',
      name: 'Good and Evil',
      description: 'Pick the Saints and Raiders in the same week.',
      evaluator: 'teamCombination',
      conditionConfig: { requirements: [{ match: { short_name: 'NO' }, count: 1 }, { match: { short_name: 'LV' }, count: 1 }] }
    }
  ];

  const sqlString = value => `'${String(value).replaceAll("'", "''")}'`;
  for (const achievement of achievements) {
    await db.runSql(`INSERT INTO achievements
      (key, name, description, icon_id, evaluator, evaluation_phase, scope, condition_config, repeatable, active)
      VALUES (${sqlString(achievement.key)}, ${sqlString(achievement.name)}, ${sqlString(achievement.description)}, NULL,
        ${sqlString(achievement.evaluator)}, ${sqlString(achievement.evaluationPhase || 'pick_locked')},
        ${sqlString(achievement.scope || 'player_week')}, ${sqlString(JSON.stringify(achievement.conditionConfig))}::jsonb, FALSE, TRUE)
      ON CONFLICT (key) DO NOTHING`);
  }
};

exports.down = async function(db) {
  await db.runSql("DELETE FROM achievements WHERE key IN ('BIRD_BRAIN', 'TOXOPLASMOSIS', 'COUNTRY_AND_WESTERN', 'LOCAL_MAXIMUM', 'FEE_FI_FO_FUM', 'FAMILY_MANNING', 'GOOD_AND_EVIL')");
};

exports._meta = {
  "version": 1
};
