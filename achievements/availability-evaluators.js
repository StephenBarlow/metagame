'use strict';

// Every function receives (achievement, context, member), where:
// - achievement includes the current database condition_config and repeatable flag;
// - context includes all league picks, games, tags, awards, currentWeek,
//   revealedWeek, and asOf;
// - member is the active membership row for the requested user.
// Return { status: 'AVAILABLE' | 'LOCKED_OUT', reason?: string }.
// These are conservative placeholders; none currently checks badge-specific rules.
function available() {
  return { status: 'AVAILABLE' };
}

const availabilityRegistry = {
  CAT_PERSON(achievement, context, member) {
    return available();
  },
  FOR_THE_BIRDS(achievement, context, member) {
    return available();
  },
  SEVEN_TEN_SPLIT(achievement, context, member) {
    return available();
  },
  YARRR(achievement, context, member) {
    return available();
  },
  EMPIRE_STATE_OF_MIND(achievement, context, member) {
    return available();
  },
  THERE_GO_THAT_HORSE(achievement, context, member) {
    return available();
  },
  OHIO_BOWL(achievement, context, member) {
    return available();
  },
  WHAT_IS_THIS_SOCCER(achievement, context, member) {
    return available();
  },
  FLORIDA_MAN_OR_WOMAN(achievement, context, member) {
    return available();
  },
  BUFFALO_WINGS(achievement, context, member) {
    return available();
  },
  BIG_BUST(achievement, context, member) {
    return available();
  },
  BLUE_COLLAR(achievement, context, member) {
    return available();
  },
  GET_THE_HORNS(achievement, context, member) {
    return available();
  },
  DONT_MESS(achievement, context, member) {
    return available();
  },
  THANKS_I_GUESS(achievement, context, member) {
    return available();
  },
  LARRY_LEGEND(achievement, context, member) {
    return available();
  },
  PRESIDENTIAL_PICK(achievement, context, member) {
    return available();
  },
  DAMN_FINE_PICK(achievement, context, member) {
    return available();
  },
  BYE_BYE(achievement, context, member) {
    return available();
  },
  DEEP_PURPLE(achievement, context, member) {
    return available();
  },
  GOLD_RUSH(achievement, context, member) {
    return available();
  },
  HEATED_RIVALRY(achievement, context, member) {
    return available();
  },
  CHEESE_STANDS_ALONE(achievement, context, member) {
    return available();
  },
  PICKMAS(achievement, context, member) {
    return available();
  },
  PICKSGIVING(achievement, context, member) {
    return available();
  },
  GO_WIDE(achievement, context, member) {
    return available();
  },
  SLOW_START(achievement, context, member) {
    return available();
  },
  LEADER_OF_THE_PACK(achievement, context, member) {
    return available();
  },
  SLOW_FINISH(achievement, context, member) {
    return available();
  },
  TWINSIES(achievement, context, member) {
    return available();
  },
  TRUE_NONCONFORMIST(achievement, context, member) {
    return available();
  },
  BARELY_WOULDVE_MATTERED(achievement, context, member) {
    return available();
  },
  ROAD_WARRIORS(achievement, context, member) {
    return available();
  },
  HOMEWRECKED(achievement, context, member) {
    return available();
  },
  ABSOLUTE_DRUBBING(achievement, context, member) {
    return available();
  },
  WORLD_TRAVELER(achievement, context, member) {
    return available();
  },
  MIRROR_IMAGE(achievement, context, member) {
    return available();
  },
  INDECISIVE(achievement, context, member) {
    return available();
  },
  THE_LONG_GAME(achievement, context, member) {
    return available();
  },
  OPPOSITION_RESEARCH(achievement, context, member) {
    return available();
  },
  BRADY_BUNCH(achievement, context, member) {
    return available();
  },
  SIX_SEVENNN(achievement, context, member) {
    return available();
  },
  BROWN_BEAR(achievement, context, member) {
    return available();
  },
  BIRD_BRAIN(achievement, context, member) {
    return available();
  },
  TOXOPLASMOSIS(achievement, context, member) {
    return available();
  },
  COUNTRY_AND_WESTERN(achievement, context, member) {
    return available();
  },
  CALIFORNIA_LOVE(achievement, context, member) {
    return available();
  },
  LOCAL_MAXIMUM(achievement, context, member) {
    return available();
  },
  FEE_FI_FO_FUM(achievement, context, member) {
    return available();
  },
  FAMILY_MANNING(achievement, context, member) {
    return available();
  },
  GOOD_AND_EVIL(achievement, context, member) {
    return available();
  },
  DESPERADO(achievement, context, member) {
    return available();
  },
  VATICAN_CITY(achievement, context, member) {
    return available();
  },
  HIGH_ALTITUDE(achievement, context, member) {
    return available();
  },
  HOT_STREAK(achievement, context, member) {
    return available();
  },
  COLD_STREAK(achievement, context, member) {
    return available();
  },
  BUZZER_BEATER(achievement, context, member) {
    return available();
  },
  SLIM_PICKINGS(achievement, context, member) {
    return available();
  },
  SHEEP(achievement, context, member) {
    return available();
  },
  GREAT_MINDS(achievement, context, member) {
    return available();
  },
  SILVER_LINING(achievement, context, member) {
    return available();
  },
  BEST_WEEK_EVER(achievement, context, member) {
    return available();
  },
  ET_TU(achievement, context, member) {
    return available();
  },
  ALIGNMENT_OF_INTERESTS(achievement, context, member) {
    return available();
  },
  LONE_HOLDOUT(achievement, context, member) {
    return available();
  },
  WORST_OF_ALL_WORLDS(achievement, context, member) {
    return available();
  },
  BITTERSWEET_SPLIT(achievement, context, member) {
    return available();
  },
  GARBAGE_TIME(achievement, context, member) {
    return available();
  },
  BAYWATCH(achievement, context, member) {
    return available();
  },
  THE_ONLY_WINNING_MOVE(achievement, context, member) {
    return available();
  },
  EXCEPTIONALLY_AVERAGE(achievement, context, member) {
    return available();
  },
  CROWD_PLEASER(achievement, context, member) {
    return available();
  },
  HAPPY_PICK_YEAR(achievement, context, member) {
    return available();
  },
  EXPANSION_PACK(achievement, context, member) {
    return available();
  },
  TIME_LOOP(achievement, context, member) {
    return available();
  },
  FOMO(achievement, context, member) {
    return available();
  },
  HEEL_TURN(achievement, context, member) {
    return available();
  },
  WE_DONT_NEED_NO_STINKING_BADGES(achievement, context, member) {
    return available();
  },
  KEYSTONE_COMBO(achievement, context, member) {
    return available();
  },
  FOOLS_SELDOM_DIFFER(achievement, context, member) {
    return available();
  }
};

function evaluateAchievementAvailability(achievement, context, member) {
  // Newly added badges also remain available until their companion is implemented.
  if (!Object.hasOwn(availabilityRegistry, achievement.key)) return available();
  const result = availabilityRegistry[achievement.key](achievement, context, member);
  if (!result || !['AVAILABLE', 'LOCKED_OUT'].includes(result.status)) {
    throw new Error(`Invalid availability result for ${achievement.key}.`);
  }
  return result;
}

module.exports = { availabilityRegistry, evaluateAchievementAvailability };

