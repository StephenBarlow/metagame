'use strict';

var fs = require('fs');
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
  const achievements = JSON.parse(fs.readFileSync('./seed_data/achievements.json'));

  for (const achievement of achievements) {
    await db.insert('achievements', [
      'key',
      'name',
      'description',
      'image_url',
      'evaluator',
      'evaluation_phase',
      'scope',
      'condition_config',
      'repeatable',
      'active'
    ], [
      achievement.key,
      achievement.name,
      achievement.description,
      achievement.image_url,
      achievement.evaluator,
      achievement.evaluation_phase,
      achievement.scope,
      JSON.stringify(achievement.condition_config),
      achievement.repeatable,
      achievement.active
    ]);
  }

  return null;
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
