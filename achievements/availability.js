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

function buildLeagueAvailabilityReport(achievements, context) {
  const concluded = Boolean(context.currentSeason && String(context.league.season) !== context.currentSeason);
  const reports = context.members.map(member => buildAvailabilityReport(achievements, context, member.user_id));
  const earnedInLeague = new Set(context.awards.filter(award => award.invalidated_at == null)
    .map(award => String(award.achievement_id)));
  const badges = achievements.map((achievement, index) => {
    const players = reports.map(report => ({
      userId: report.userId,
      displayName: report.displayName,
      ...report.badges[index]
    }));
    const count = status => players.filter(player => player.status === status).length;
    const availablePlayers = count('AVAILABLE');
    // An empty roster or a concluded league is not evidence of a badge lockout.
    const unavailable = !concluded && players.length > 0 && availablePlayers === 0 && count('NOT_APPLICABLE') === 0;
    return {
      id: achievement.id,
      key: achievement.key,
      name: achievement.name,
      repeatable: achievement.repeatable,
      earnedInLeague: earnedInLeague.has(String(achievement.id)),
      availablePlayers,
      earnedPlayers: players.filter(player => player.earned).length,
      lockedOutPlayers: count('LOCKED_OUT'),
      unavailableToEveryone: unavailable,
      lockouts: players.filter(player => player.status === 'LOCKED_OUT').map(player => ({
        userId: player.userId,
        displayName: player.displayName,
        reason: player.reason
      }))
    };
  });
  const unavailableBadges = badges.filter(badge => badge.unavailableToEveryone);
  return {
    leagueId: context.league.id,
    leagueName: context.league.name,
    season: context.league.season,
    currentWeek: context.currentWeek,
    revealedWeek: context.revealedWeek,
    asOf: context.asOf.toISOString(),
    provisional: true,
    concluded,
    memberCount: reports.length,
    total: badges.length,
    stillAvailable: badges.filter(badge => badge.availablePlayers > 0).length,
    unavailableToEveryone: unavailableBadges.length,
    unearnedAndUnavailable: unavailableBadges.filter(badge => !badge.earnedInLeague).length,
    unavailableBadges
  };
}

async function runAvailabilityReport(db, options) {
  const leagueId = Number(options.leagueId);
  const userId = Number(options.userId);
  if (!Number.isInteger(leagueId) || leagueId < 1) throw new Error('leagueId must be a positive integer.');
  if (options.allPlayers && options.userId !== undefined) throw new Error('Use either --all-players or --user-id, not both.');
  if (!options.allPlayers && (!Number.isInteger(userId) || userId < 1)) throw new Error('userId must be a positive integer.');

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
    return options.allPlayers
      ? buildLeagueAvailabilityReport(achievements, context)
      : buildAvailabilityReport(achievements, context, userId);
  });
}

module.exports = { buildAvailabilityReport, buildLeagueAvailabilityReport, runAvailabilityReport };
