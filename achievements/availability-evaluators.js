'use strict';

const patterns = require('./availability-patterns');
const { alreadyAwardedWeek, scheduleIncomplete, unscored } = require('./availability-context');

// Companions are registered by badge key, while shared patterns interpret the
// current database condition_config. They receive (achievement, context, member).
const availabilityRegistry = {
  CAT_PERSON(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  FOR_THE_BIRDS(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  SEVEN_TEN_SPLIT(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  YARRR(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  EMPIRE_STATE_OF_MIND(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  THERE_GO_THAT_HORSE(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  OHIO_BOWL(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  WHAT_IS_THIS_SOCCER(achievement, context, member) {
    return patterns.pickedGameResultAvailability(achievement, context, member);
  },
  FLORIDA_MAN_OR_WOMAN(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  BUFFALO_WINGS(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  BIG_BUST(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  BLUE_COLLAR(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  GET_THE_HORNS(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  DONT_MESS(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  THANKS_I_GUESS(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  LARRY_LEGEND(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  PRESIDENTIAL_PICK(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  DAMN_FINE_PICK(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  BYE_BYE(achievement, context, member) {
    return patterns.byePatternAvailability(achievement, context, member);
  },
  DEEP_PURPLE(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  GOLD_RUSH(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  HEATED_RIVALRY(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  CHEESE_STANDS_ALONE(achievement, context, member) {
    return patterns.uniqueTeamAvailability(achievement, context, member);
  },
  PICKMAS(achievement, context, member) {
    return patterns.gameTagAvailability(achievement, context, member);
  },
  PICKSGIVING(achievement, context, member) {
    return patterns.gameTagAvailability(achievement, context, member);
  },
  GO_WIDE(achievement, context, member) {
    return patterns.firstAndLastAvailability(achievement, context, member);
  },
  SLOW_START(achievement, context, member) {
    return patterns.byePatternAvailability(achievement, context, member);
  },
  LEADER_OF_THE_PACK(achievement, context, member) {
    return patterns.leagueScoresAvailability(achievement, context, member);
  },
  SLOW_FINISH(achievement, context, member) {
    return patterns.byePatternAvailability(achievement, context, member);
  },
  TWINSIES(achievement, context, member) {
    return patterns.leagueScoresAvailability(achievement, context, member);
  },
  TRUE_NONCONFORMIST(achievement, context, member) {
    return patterns.uniqueGamesAvailability(achievement, context, member);
  },
  BARELY_WOULDVE_MATTERED(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  ROAD_WARRIORS(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  HOMEWRECKED(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  ABSOLUTE_DRUBBING(achievement, context, member) {
    return patterns.pickedGameResultAvailability(achievement, context, member);
  },
  WORLD_TRAVELER(achievement, context, member) {
    return patterns.seasonalThresholdAvailability(achievement, context, member);
  },
  MIRROR_IMAGE(achievement, context, member) {
    return patterns.matchingFinalScoresAvailability(achievement, context, member);
  },
  INDECISIVE(achievement, context, member) {
    return patterns.submissionHistoryAvailability(achievement, context, member);
  },
  THE_LONG_GAME(achievement, context, member) {
    return patterns.earlySubmissionAvailability(achievement, context, member);
  },
  OPPOSITION_RESEARCH(achievement, context, member) {
    return patterns.opponentCountAvailability(achievement, context, member);
  },
  BRADY_BUNCH(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  SIX_SEVENNN(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  BROWN_BEAR(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  BIRD_BRAIN(achievement, context, member) {
    return patterns.seasonalThresholdAvailability(achievement, context, member);
  },
  TOXOPLASMOSIS(achievement, context, member) {
    return patterns.seasonalThresholdAvailability(achievement, context, member);
  },
  COUNTRY_AND_WESTERN(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  CALIFORNIA_LOVE(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  LOCAL_MAXIMUM(achievement, context, member) {
    return patterns.maximumScoreAvailability(achievement, context, member);
  },
  FEE_FI_FO_FUM(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  FAMILY_MANNING(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  GOOD_AND_EVIL(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  DESPERADO(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  VATICAN_CITY(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  HIGH_ALTITUDE(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  HOT_STREAK(achievement, context, member) {
    return patterns.resultStreakAvailability(achievement, context, member);
  },
  COLD_STREAK(achievement, context, member) {
    return patterns.resultStreakAvailability(achievement, context, member);
  },
  BUZZER_BEATER(achievement, context, member) {
    return patterns.lateSubmissionAvailability(achievement, context, member);
  },
  SLIM_PICKINGS(achievement, context, member) {
    return patterns.limitedGamesAvailability(achievement, context, member);
  },
  SHEEP(achievement, context, member) {
    return patterns.matchingGroupAvailability(achievement, context, member);
  },
  GREAT_MINDS(achievement, context, member) {
    return patterns.matchingGroupAvailability(achievement, context, member);
  },
  SILVER_LINING(achievement, context, member) {
    return patterns.favoriteTeamAvailability(achievement, context, member);
  },
  BEST_WEEK_EVER(achievement, context, member) {
    return patterns.favoriteTeamAvailability(achievement, context, member);
  },
  ET_TU(achievement, context, member) {
    return patterns.favoriteOpponentAvailability(achievement, context, member);
  },
  ALIGNMENT_OF_INTERESTS(achievement, context, member) {
    return patterns.favoriteOpponentAvailability(achievement, context, member);
  },
  LONE_HOLDOUT(achievement, context, member) {
    return patterns.soleHoldoutAvailability(achievement, context, member);
  },
  WORST_OF_ALL_WORLDS(achievement, context, member) {
    return patterns.favoriteTeamAvailability(achievement, context, member);
  },
  BITTERSWEET_SPLIT(achievement, context, member) {
    return patterns.favoriteTeamAvailability(achievement, context, member);
  },
  GARBAGE_TIME(achievement, context, member) {
    return patterns.resultAvailability(achievement, context, member);
  },
  BAYWATCH(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  THE_ONLY_WINNING_MOVE(achievement, context, member) {
    return patterns.byeOutcomesAvailability(achievement, context, member);
  },
  EXCEPTIONALLY_AVERAGE(achievement, context, member) {
    return patterns.leagueScoresAvailability(achievement, context, member);
  },
  CROWD_PLEASER(achievement, context, member) {
    return patterns.otherFavoritesAvailability(achievement, context, member);
  },
  HAPPY_PICK_YEAR(achievement, context, member) {
    return patterns.gameTagAvailability(achievement, context, member);
  },
  EXPANSION_PACK(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  TIME_LOOP(achievement, context, member) {
    return patterns.previousPairAvailability(achievement, context, member);
  },
  FOMO(achievement, context, member) {
    return patterns.byeOutcomesAvailability(achievement, context, member);
  },
  HEEL_TURN(achievement, context, member) {
    return patterns.otherFavoritesAvailability(achievement, context, member);
  },
  WE_DONT_NEED_NO_STINKING_BADGES(achievement, context, member) {
    return patterns.badgeDroughtAvailability(achievement, context, member);
  },
  KEYSTONE_COMBO(achievement, context, member) {
    return patterns.teamCombinationAvailability(achievement, context, member);
  },
  FOOLS_SELDOM_DIFFER(achievement, context, member) {
    return patterns.matchingGroupAvailability(achievement, context, member);
  }
};

function recordedQualification(achievement, context, member) {
  const weeks = new Set([...context.gamesByWeek.keys(), ...context.picks.map(row => Number(row.week))]);
  for (const week of weeks) {
    if (alreadyAwardedWeek(achievement, context, member, week)) continue;
    if (achievement.evaluation_phase === 'season_finalized' && week !== context.maxScheduledWeek) continue;
    if (['week_finalized', 'season_finalized', 'manual'].includes(achievement.evaluation_phase)) {
      if (week >= context.currentWeek || (context.gamesByWeek.get(week) || []).some(unscored)) continue;
    }
    if (patterns.matchesRecordedPick(achievement, context, member, week)) return week;
  }
  return null;
}

function evaluateAchievementAvailability(achievement, context, member) {
  if (!Object.hasOwn(availabilityRegistry, achievement.key)) {
    return patterns.available('This new badge has no availability evaluator yet.');
  }
  const qualifyingWeek = recordedQualification(achievement, context, member);
  if (qualifyingWeek !== null) {
    return patterns.available(`A recorded pick or result already qualifies in week ${qualifyingWeek}; awarding may still be pending.`);
  }
  const result = availabilityRegistry[achievement.key](achievement, context, member);
  if (!result || !['AVAILABLE', 'LOCKED_OUT'].includes(result.status)) {
    throw new Error(`Invalid availability result for ${achievement.key}.`);
  }
  if (result.status === 'LOCKED_OUT' && scheduleIncomplete(context)) {
    return patterns.available('The schedule is incomplete or has unknown kickoff times; remaining opportunities cannot yet be ruled out.');
  }
  return result;
}

module.exports = { availabilityRegistry, evaluateAchievementAvailability };

