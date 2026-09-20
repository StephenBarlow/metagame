'use strict';

var dbm;
var type;
var seed;

const achievementKeys = [
  'ABSOLUTE_DRUBBING',
  'ALIGNMENT_OF_INTERESTS',
  'BARELY_WOULDVE_MATTERED',
  'BEST_WEEK_EVER',
  'BIG_BUST',
  'BITTERSWEET_SPLIT',
  'COLD_STREAK',
  'CROWD_PLEASER',
  'DAMN_FINE_PICK',
  'ET_TU',
  'GARBAGE_TIME',
  'GREAT_MINDS',
  'HEEL_TURN',
  'HOMEWRECKED',
  'HOT_STREAK',
  'LARRY_LEGEND',
  'MIRROR_IMAGE',
  'ROAD_WARRIORS',
  'SEVEN_TEN_SPLIT',
  'SILVER_LINING',
  'SIX_SEVENNN',
  'SLIM_PICKINGS',
  'THANKS_I_GUESS',
  'WHAT_IS_THIS_SOCCER',
  'WORST_OF_ALL_WORLDS'
];

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
  return db.runSql(`UPDATE achievements
    SET evaluation_phase = 'scores_updated'
    WHERE key IN (${achievementKeys.map(key => `'${key}'`).join(', ')})`);
};

exports.down = function(db) {
  return db.runSql(`UPDATE achievements
    SET evaluation_phase = 'week_finalized'
    WHERE key IN (${achievementKeys.map(key => `'${key}'`).join(', ')})`);
};

exports._meta = {
  "version": 1
};
