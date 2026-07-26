'use strict';

const { buildEvaluationContext } = require('./context');
const { evaluateAchievement } = require('./evaluators');

const MODES = {
  'pick-locked': ['pick_locked'],
  'week-finalized': ['pick_locked', 'week_finalized']
};

function integerOrFallback(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parseConditionConfig(achievement) {
  return {
    ...achievement,
    condition_config: typeof achievement.condition_config === 'string'
      ? JSON.parse(achievement.condition_config)
      : achievement.condition_config
  };
}

async function enabledAchievements(db, leagueId) {
  const associations = await db('league_achievements')
    .select(['achievement_id', 'active'])
    .where({ league_id: leagueId });

  let query = db('achievements').select('*').where({ active: true });
  if (associations.length) {
    const enabledIds = associations.filter(row => row.active).map(row => row.achievement_id);
    if (!enabledIds.length) return [];
    query = query.whereIn('id', enabledIds);
  }
  return (await query.orderBy('key')).map(parseConditionConfig);
}

async function loadEvaluationData(db, league, week) {
  const [members, picks, teams, teamTags, games, gameTags] = await Promise.all([
    db('memberships')
      .select(['user_id', 'display_name', 'favorite_team_id'])
      .where({ league_id: league.id, revoked_at: null }),
    db('picks').select('*').where({ league_id: league.id }),
    db('teams').select('*').where({ sports_league: league.sports_league }),
    db('sports_team_tags').select(['team_id', 'tag']),
    db('sports_games').select('*').where({
      season: league.season,
      sports_league: league.sports_league
    }),
    db('sports_game_tags')
      .select(['sports_game_tags.game_id', 'sports_game_tags.tag'])
      .innerJoin('sports_games', 'sports_games.id', 'sports_game_tags.game_id')
      .where({
        'sports_games.season': league.season,
        'sports_games.sports_league': league.sports_league
      })
  ]);
  return { league, week, members, picks, teams, teamTags, games, gameTags };
}

function validateRunWindow(mode, week, currentWeek, revealedWeek) {
  if (!Number.isInteger(week) || week < 1) throw new Error('The target week must be a positive integer.');
  if (mode === 'pick-locked' && week > revealedWeek) {
    throw new Error(`Week ${week} is not locked; this league's revealed week is ${revealedWeek}.`);
  }
  if (mode === 'week-finalized' && week >= currentWeek) {
    throw new Error(`Week ${week} is not finalized; this league's current week is ${currentWeek}.`);
  }
}

function assertFinalScores(context) {
  const incompleteGames = (context.gamesByWeek.get(context.week) || [])
    .filter(game => game.away_team_score === null || game.home_team_score === null);
  if (incompleteGames.length) {
    throw new Error(`Week ${context.week} has ${incompleteGames.length} game(s) without final scores.`);
  }
}

function awardKey(achievement, league) {
  return achievement.repeatable
    ? `week:${league.week}`
    : `season:${league.season}`;
}

async function insertAwards(db, league, mode, context, matches, dryRun) {
  const proposed = matches.map(({ achievement, candidate }) => ({
    league_id: league.id,
    achievement_id: achievement.id,
    user_id: candidate.userId,
    week: context.week,
    award_key: awardKey(achievement, { season: league.season, week: context.week }),
    evidence: {
      mode,
      achievement_key: achievement.key,
      evaluated_week: context.week,
      ...candidate.evidence
    }
  }));

  const existing = proposed.length
    ? await db('achievement_awards')
      .select(['achievement_id', 'user_id', 'award_key'])
      .where({ league_id: league.id })
      .whereIn('achievement_id', [...new Set(proposed.map(row => row.achievement_id))])
    : [];
  const existingKeys = new Set(existing.map(row =>
    `${row.achievement_id}:${row.user_id}:${row.award_key}`
  ));
  const newAwards = proposed.filter(row =>
    !existingKeys.has(`${row.achievement_id}:${row.user_id}:${row.award_key}`)
  );

  if (dryRun || !newAwards.length) {
    return { proposed, created: [], alreadyPresent: proposed.length - newAwards.length };
  }

  const created = await db('achievement_awards')
    .insert(newAwards.map(row => ({ ...row, evidence: JSON.stringify(row.evidence) })))
    .onConflict(['league_id', 'achievement_id', 'user_id', 'award_key'])
    .ignore()
    .returning(['id', 'achievement_id', 'user_id', 'week', 'award_key']);

  return {
    proposed,
    created,
    alreadyPresent: proposed.length - created.length
  };
}

async function runAchievementJob(db, options) {
  const mode = options.mode;
  if (!MODES[mode]) throw new Error(`Unknown mode "${mode}". Use pick-locked or week-finalized.`);
  const leagueId = Number(options.leagueId);
  if (!Number.isInteger(leagueId) || leagueId < 1) throw new Error('leagueId must be a positive integer.');

  return db.transaction(async trx => {
    const league = await trx('fantasy_leagues').where({ id: leagueId }).first();
    if (!league) throw new Error(`League ${leagueId} was not found.`);

    const currentSeason = String(options.currentSeason ?? process.env.CURRENT_SEASON ?? '');
    if (currentSeason && String(league.season) !== currentSeason) {
      return {
        mode,
        leagueId,
        leagueName: league.name,
        skipped: true,
        reason: `League season ${league.season} is concluded; current season is ${currentSeason}.`
      };
    }

    const currentWeek = integerOrFallback(league.current_week,
      integerOrFallback(options.currentWeek ?? process.env.CURRENT_WEEK, 1));
    const revealedWeek = integerOrFallback(league.revealed_week,
      integerOrFallback(options.revealedWeek ?? process.env.REVEALED_WEEK, 0));
    const week = options.week === undefined
      ? (mode === 'pick-locked' ? revealedWeek : currentWeek - 1)
      : Number(options.week);
    validateRunWindow(mode, week, currentWeek, revealedWeek);

    const [achievements, evaluationData] = await Promise.all([
      enabledAchievements(trx, league.id),
      loadEvaluationData(trx, league, week)
    ]);
    const context = buildEvaluationContext(evaluationData);
    if (mode === 'week-finalized') assertFinalScores(context);

    const phases = new Set(MODES[mode]);
    if (mode === 'week-finalized' && week === context.maxScheduledWeek) {
      phases.add('season_finalized');
    }
    const applicableAchievements = achievements.filter(achievement =>
      phases.has(achievement.evaluation_phase)
    );

    const matches = [];
    for (const achievement of applicableAchievements) {
      const candidates = evaluateAchievement(achievement, context);
      const seenUsers = new Set();
      for (const candidate of candidates) {
        if (seenUsers.has(String(candidate.userId))) continue;
        seenUsers.add(String(candidate.userId));
        matches.push({ achievement, candidate });
      }
    }

    const awardResult = await insertAwards(trx, league, mode, context, matches, Boolean(options.dryRun));
    const achievementById = new Map(achievements.map(achievement => [achievement.id, achievement]));
    const created = awardResult.created.map(row => ({
      ...row,
      achievementKey: achievementById.get(row.achievement_id)?.key
    }));

    return {
      mode,
      leagueId: league.id,
      leagueName: league.name,
      season: league.season,
      week,
      currentWeek,
      revealedWeek,
      dryRun: Boolean(options.dryRun),
      evaluatedAchievements: applicableAchievements.length,
      matchedAwards: awardResult.proposed.length,
      createdAwards: created.length,
      alreadyPresent: awardResult.alreadyPresent,
      wouldCreate: options.dryRun ? awardResult.proposed.length - awardResult.alreadyPresent : 0,
      created
    };
  });
}

module.exports = {
  MODES,
  enabledAchievements,
  integerOrFallback,
  runAchievementJob,
  validateRunWindow
};
