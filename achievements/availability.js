'use strict';

const { buildEvaluationContext } = require('./context');
const { enabledAchievements, integerOrFallback, loadEvaluationData } = require('./engine');
const { evaluateAchievementAvailability } = require('./availability-evaluators');

function buildAvailabilityReport(achievements, context, userId) {
  const member = context.members.find(row => String(row.user_id) === String(userId));
  if (!member) throw new Error(`User ${userId} is not an active member of league ${context.league.id}.`);

  const earnedIds = new Set(context.awards
    .filter(award => String(award.user_id) === String(userId) && award.invalidated_at == null)
    .map(award => String(award.achievement_id)));
  const concluded = Boolean(context.currentSeason && String(context.league.season) !== context.currentSeason);
  const badges = achievements.map(achievement => {
    const earned = earnedIds.has(String(achievement.id));
    let availability;
    if (earned && !achievement.repeatable) {
      availability = { status: 'EARNED', reason: 'Already earned in this league.' };
    } else if (concluded) {
      availability = { status: 'NOT_APPLICABLE', reason: 'This league is concluded.' };
    } else {
      availability = evaluateAchievementAvailability(achievement, context, member);
    }
    return {
      id: achievement.id,
      key: achievement.key,
      name: achievement.name,
      repeatable: achievement.repeatable,
      earned,
      ...availability
    };
  });

  return {
    leagueId: context.league.id,
    leagueName: context.league.name,
    season: context.league.season,
    userId: member.user_id,
    displayName: member.display_name,
    currentWeek: context.currentWeek,
    revealedWeek: context.revealedWeek,
    asOf: context.asOf.toISOString(),
    provisional: true,
    total: badges.length,
    earned: badges.filter(badge => badge.earned).length,
    stillAvailable: badges.filter(badge => badge.status === 'AVAILABLE').length,
    lockedOut: badges.filter(badge => badge.status === 'LOCKED_OUT').length,
    notApplicable: badges.filter(badge => badge.status === 'NOT_APPLICABLE').length,
    badges
  };
}

async function runAvailabilityReport(db, options) {
  const leagueId = Number(options.leagueId);
  const userId = Number(options.userId);
  if (!Number.isInteger(leagueId) || leagueId < 1) throw new Error('leagueId must be a positive integer.');
  if (!Number.isInteger(userId) || userId < 1) throw new Error('userId must be a positive integer.');

  return db.transaction(async trx => {
    // Enforce read-only access and evaluate a consistent snapshot of the league.
    await trx.raw('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const league = await trx('fantasy_leagues').where({ id: leagueId }).first();
    if (!league) throw new Error(`League ${leagueId} was not found.`);

    const currentWeek = integerOrFallback(league.current_week,
      integerOrFallback(options.currentWeek ?? process.env.CURRENT_WEEK, 1));
    const revealedWeek = integerOrFallback(league.revealed_week,
      integerOrFallback(options.revealedWeek ?? process.env.REVEALED_WEEK, 0));
    const [achievements, data] = await Promise.all([
      enabledAchievements(trx, leagueId),
      loadEvaluationData(trx, league, currentWeek, { includeAwards: true })
    ]);
    const context = buildEvaluationContext({
      ...data,
      currentWeek,
      revealedWeek,
      currentSeason: String(options.currentSeason ?? process.env.CURRENT_SEASON ?? ''),
      asOf: new Date()
    });
    return buildAvailabilityReport(achievements, context, userId);
  });
}

module.exports = { buildAvailabilityReport, runAvailabilityReport };
