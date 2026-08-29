'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildEvaluationContext } = require('../achievements/context');
const { evaluateAchievement, maximumPossibleScore } = require('../achievements/evaluators');
const { calculatePickTwoResult } = require('../achievements/scoring');
const { parseArguments } = require('../jobs/evaluate-achievements');
const { integerOrFallback, MODES } = require('../achievements/engine');
const { effectiveLeagueWeek } = require('../resolvers');
const { achievementEvaluationCommand, createRenderOneOffJob } = require('../render-one-off-jobs');
const { achievementJobsForWeekSettings } = require('../admin');
const achievementDefinitions = require('../seed_data/achievements.json');

function contextFixture(overrides = {}) {
  return buildEvaluationContext({
    league: { id: 1, season: 2026, sports_league: 'NFL' },
    week: overrides.week || 1,
    members: overrides.members || [{ user_id: 10, display_name: 'Player' }],
    picks: overrides.picks || [],
    teams: overrides.teams || [],
    teamTags: overrides.teamTags || [],
    games: overrides.games || [],
    gameTags: overrides.gameTags || []
  });
}

test('Pick Two scoring matches the client double-win, double-loss, split, and bye rules', () => {
  const weekPick = margins => ({
    picks: [{ id: 1 }, { id: 2 }],
    teams: [{ short_name: 'A' }, { short_name: 'B' }],
    games: [
      { id: 1, away_team_short_name: 'A', home_team_short_name: 'X', away_team_score: 20 + margins[0], home_team_score: 20 },
      { id: 2, away_team_short_name: 'B', home_team_short_name: 'Y', away_team_score: 20 + margins[1], home_team_score: 20 }
    ],
    isBye: false
  });

  assert.deepEqual(calculatePickTwoResult(weekPick([7, 3])).score, 10);
  assert.deepEqual(calculatePickTwoResult(weekPick([-4, -9])), {
    complete: true,
    isBye: false,
    outcome: 'double_loss',
    score: 9,
    margins: [-4, -9],
    gameIds: [1, 2]
  });
  assert.equal(calculatePickTwoResult(weekPick([7, -3])).outcome, 'split');
  assert.equal(calculatePickTwoResult({
    picks: [{ id: 1 }, { id: 2 }],
    teams: [{ short_name: 'BYE' }, { short_name: 'BYE' }],
    games: [null, null],
    isBye: true
  }).outcome, 'bye');
});

test('teamCombination supports choosing any two distinct teams from an option set', () => {
  const context = contextFixture({
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, invalidated_at: null },
      { id: 2, user_id: 10, team_id: 2, week: 1, invalidated_at: null }
    ],
    teams: [
      { id: 1, short_name: 'IND', sports_league: 'NFL' },
      { id: 2, short_name: 'NO', sports_league: 'NFL' }
    ]
  });
  const matches = evaluateAchievement({
    key: 'FAMILY_MANNING',
    evaluator: 'teamCombination',
    condition_config: {
      requirements: [{
        any_match: [{ short_name: 'IND' }, { short_name: 'NYG' }, { short_name: 'NO' }],
        count: 2
      }]
    }
  }, context);
  assert.equal(matches.length, 1);
});

test('California Love accepts any distinct pair of 49ers, Rams, and Chargers', () => {
  const context = contextFixture({
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, invalidated_at: null },
      { id: 2, user_id: 10, team_id: 2, week: 1, invalidated_at: null }
    ],
    teams: [
      { id: 1, short_name: 'LAR', sports_league: 'NFL' },
      { id: 2, short_name: 'LAC', sports_league: 'NFL' }
    ]
  });
  const matches = evaluateAchievement({
    key: 'CALIFORNIA_LOVE',
    evaluator: 'teamCombination',
    condition_config: {
      requirements: [{
        any_match: [{ short_name: 'SF' }, { short_name: 'LAR' }, { short_name: 'LAC' }],
        count: 2
      }]
    }
  }, context);
  assert.equal(matches.length, 1);
});

test('Empire State of Mind accepts a Bills pairing with either New York team', () => {
  const context = contextFixture({
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, invalidated_at: null },
      { id: 2, user_id: 10, team_id: 2, week: 1, invalidated_at: null }
    ],
    teams: [
      { id: 1, short_name: 'BUF', sports_league: 'NFL' },
      { id: 2, short_name: 'NYJ', sports_league: 'NFL' }
    ]
  });
  const matches = evaluateAchievement({
    key: 'EMPIRE_STATE_OF_MIND',
    evaluator: 'teamCombination',
    condition_config: {
      requirements: [{
        any_match: [{ short_name: 'BUF' }, { short_name: 'NYG' }, { short_name: 'NYJ' }],
        count: 2
      }]
    }
  }, context);
  assert.equal(matches.length, 1);
});

test('a picked-team seasonal threshold counts two tagged picks, including in different weeks', () => {
  const teams = [
    { id: 1, short_name: 'A', sports_league: 'NFL' },
    { id: 2, short_name: 'B', sports_league: 'NFL' },
    { id: 3, short_name: 'C', sports_league: 'NFL' },
    { id: 4, short_name: 'D', sports_league: 'NFL' }
  ];
  const games = [
    { id: 1, week: 1, away_team_short_name: 'A', home_team_short_name: 'B' },
    { id: 2, week: 1, away_team_short_name: 'C', home_team_short_name: 'D' },
    { id: 3, week: 2, away_team_short_name: 'A', home_team_short_name: 'C' },
    { id: 4, week: 2, away_team_short_name: 'B', home_team_short_name: 'D' }
  ];
  const context = contextFixture({
    week: 2,
    teams,
    games,
    gameTags: [{ game_id: 1, tag: 'international' }, { game_id: 3, tag: 'international' }],
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, invalidated_at: null },
      { id: 2, user_id: 10, team_id: 3, week: 1, invalidated_at: null },
      { id: 3, user_id: 10, team_id: 1, week: 2, invalidated_at: null },
      { id: 4, user_id: 10, team_id: 2, week: 2, invalidated_at: null }
    ]
  });
  const matches = evaluateAchievement({
    key: 'WORLD_TRAVELER',
    evaluator: 'seasonalThreshold',
    condition_config: {
      base_evaluator: 'gameTagCombination',
      minimum_occurrences: 2,
      occurrence_unit: 'picked_team',
      tag: 'international'
    }
  }, context);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].evidence.occurrence, 2);
});

test('result streaks neither count nor break on a bye week', () => {
  const teams = [
    { id: 1, short_name: 'A', sports_league: 'NFL' },
    { id: 2, short_name: 'B', sports_league: 'NFL' },
    { id: 3, short_name: 'C', sports_league: 'NFL' },
    { id: 4, short_name: 'D', sports_league: 'NFL' }
  ];
  const games = [
    { id: 1, week: 1, away_team_short_name: 'A', home_team_short_name: 'X', away_team_score: 27, home_team_score: 20 },
    { id: 2, week: 1, away_team_short_name: 'B', home_team_short_name: 'Y', away_team_score: 24, home_team_score: 20 },
    { id: 3, week: 3, away_team_short_name: 'C', home_team_short_name: 'X', away_team_score: 17, home_team_score: 21 },
    { id: 4, week: 3, away_team_short_name: 'D', home_team_short_name: 'Y', away_team_score: 10, home_team_score: 20 }
  ];
  const context = contextFixture({
    week: 3,
    teams,
    games,
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, invalidated_at: null },
      { id: 2, user_id: 10, team_id: 2, week: 1, invalidated_at: null },
      { id: 3, user_id: 10, team_id: -1, week: 2, invalidated_at: null },
      { id: 4, user_id: 10, team_id: -1, week: 2, invalidated_at: null },
      { id: 5, user_id: 10, team_id: 3, week: 3, invalidated_at: null },
      { id: 6, user_id: 10, team_id: 4, week: 3, invalidated_at: null }
    ]
  });
  const matches = evaluateAchievement({
    key: 'HOT_STREAK',
    evaluator: 'resultStreak',
    condition_config: {
      qualifying_results: ['double_win', 'double_loss'],
      consecutive_weeks: 2,
      ignore_bye_weeks: true
    }
  }, context);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].evidence.qualifying_weeks, [1, 3]);
});

test('favorite-team result achievements require the favorite team and the configured outcome', () => {
  const context = contextFixture({
    members: [
      { user_id: 10, display_name: 'Favorite set', favorite_team_id: 1 },
      { user_id: 11, display_name: 'Favorite unset', favorite_team_id: null }
    ],
    teams: [
      { id: 1, short_name: 'A', sports_league: 'NFL' },
      { id: 2, short_name: 'B', sports_league: 'NFL' },
      { id: 3, short_name: 'C', sports_league: 'NFL' },
      { id: 4, short_name: 'D', sports_league: 'NFL' }
    ],
    games: [
      { id: 1, week: 1, away_team_short_name: 'A', home_team_short_name: 'C', away_team_score: 21, home_team_score: 14 },
      { id: 2, week: 1, away_team_short_name: 'B', home_team_short_name: 'D', away_team_score: 17, home_team_score: 10 }
    ],
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, invalidated_at: null },
      { id: 2, user_id: 10, team_id: 2, week: 1, invalidated_at: null },
      { id: 3, user_id: 11, team_id: 3, week: 1, invalidated_at: null },
      { id: 4, user_id: 11, team_id: 4, week: 1, invalidated_at: null }
    ]
  });

  const bestWeekEver = evaluateAchievement({
    key: 'BEST_WEEK_EVER',
    evaluator: 'favoriteTeamResult',
    condition_config: { result: 'double_win' }
  }, context);
  const silverLining = evaluateAchievement({
    key: 'SILVER_LINING',
    evaluator: 'favoriteTeamResult',
    condition_config: { result: 'double_loss' }
  }, context);

  assert.equal(bestWeekEver.length, 1);
  assert.equal(bestWeekEver[0].userId, 10);
  assert.equal(bestWeekEver[0].evidence.favorite_team_id, 1);
  assert.equal(silverLining.length, 0);
});

test('Worst of All Worlds requires the favorite team to be the losing side of a split', () => {
  const context = contextFixture({
    members: [{ user_id: 10, display_name: 'Favorite set', favorite_team_id: 1 }],
    teams: [
      { id: 1, short_name: 'A', sports_league: 'NFL' },
      { id: 2, short_name: 'B', sports_league: 'NFL' }
    ],
    games: [
      { id: 1, week: 1, away_team_short_name: 'A', home_team_short_name: 'C', away_team_score: 14, home_team_score: 21 },
      { id: 2, week: 1, away_team_short_name: 'B', home_team_short_name: 'D', away_team_score: 24, home_team_score: 17 }
    ],
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, invalidated_at: null },
      { id: 2, user_id: 10, team_id: 2, week: 1, invalidated_at: null }
    ]
  });
  const matches = evaluateAchievement({
    key: 'WORST_OF_ALL_WORLDS',
    evaluator: 'favoriteTeamResult',
    condition_config: { result: 'split', favorite_team_result: 'loss' }
  }, context);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].evidence.favorite_team_margin, -7);
});

test('Bittersweet Split requires the favorite team to be the winning side of a split', () => {
  const context = contextFixture({
    members: [{ user_id: 10, display_name: 'Favorite set', favorite_team_id: 1 }],
    teams: [
      { id: 1, short_name: 'A', sports_league: 'NFL' },
      { id: 2, short_name: 'B', sports_league: 'NFL' }
    ],
    games: [
      { id: 1, week: 1, away_team_short_name: 'A', home_team_short_name: 'C', away_team_score: 21, home_team_score: 14 },
      { id: 2, week: 1, away_team_short_name: 'B', home_team_short_name: 'D', away_team_score: 17, home_team_score: 24 }
    ],
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, invalidated_at: null },
      { id: 2, user_id: 10, team_id: 2, week: 1, invalidated_at: null }
    ]
  });
  const matches = evaluateAchievement({
    key: 'BITTERSWEET_SPLIT',
    evaluator: 'favoriteTeamResult',
    condition_config: { result: 'split', favorite_team_result: 'win' }
  }, context);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].evidence.favorite_team_margin, 7);
});

test('Buzzer Beater uses only the active pick and requires submission within five minutes before a picked game', () => {
  const context = contextFixture({
    members: [
      { user_id: 10, display_name: 'Buzzer beater' },
      { user_id: 11, display_name: 'Changed pick' }
    ],
    teams: [
      { id: 1, short_name: 'A', sports_league: 'NFL' },
      { id: 2, short_name: 'B', sports_league: 'NFL' },
      { id: 3, short_name: 'C', sports_league: 'NFL' },
      { id: 4, short_name: 'D', sports_league: 'NFL' }
    ],
    games: [
      { id: 1, week: 1, away_team_short_name: 'A', home_team_short_name: 'C', start_time: '2026-09-10T20:00:00.000Z' },
      { id: 2, week: 1, away_team_short_name: 'B', home_team_short_name: 'D', start_time: '2026-09-10T22:00:00.000Z' }
    ],
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, created_at: '2026-09-10T19:56:00.000Z', invalidated_at: null },
      { id: 2, user_id: 10, team_id: 2, week: 1, created_at: '2026-09-10T19:56:00.000Z', invalidated_at: null },
      { id: 3, user_id: 11, team_id: 1, week: 1, created_at: '2026-09-10T19:56:00.000Z', invalidated_at: '2026-09-10T19:57:00.000Z' },
      { id: 4, user_id: 11, team_id: 2, week: 1, created_at: '2026-09-10T19:56:00.000Z', invalidated_at: '2026-09-10T19:57:00.000Z' },
      { id: 5, user_id: 11, team_id: 1, week: 1, created_at: '2026-09-10T19:00:00.000Z', invalidated_at: null },
      { id: 6, user_id: 11, team_id: 2, week: 1, created_at: '2026-09-10T19:00:00.000Z', invalidated_at: null }
    ]
  });

  const matches = evaluateAchievement({
    key: 'BUZZER_BEATER',
    evaluator: 'latePickSubmission',
    condition_config: { minutes_before_game_at_most: 5 }
  }, context);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].userId, 10);
  assert.deepEqual(matches[0].evidence.qualifying_picks.map(pick => pick.pick_id), [1]);
});

test('Slim Pickings counts games still unstarted when the final active pick was submitted', () => {
  const games = [
    { id: 1, week: 1, away_team_short_name: 'A', home_team_short_name: 'C', start_time: '2026-09-10T16:00:00.000Z' },
    { id: 2, week: 1, away_team_short_name: 'B', home_team_short_name: 'D', start_time: '2026-09-10T17:00:00.000Z' },
    { id: 3, week: 1, away_team_short_name: 'E', home_team_short_name: 'F', start_time: '2026-09-10T18:00:00.000Z' },
    { id: 4, week: 1, away_team_short_name: 'G', home_team_short_name: 'H', start_time: '2026-09-10T19:00:00.000Z' },
    { id: 5, week: 1, away_team_short_name: 'I', home_team_short_name: 'J', start_time: '2026-09-10T20:00:00.000Z' },
    { id: 6, week: 1, away_team_short_name: 'K', home_team_short_name: 'L', start_time: '2026-09-10T21:00:00.000Z' }
  ];
  const context = contextFixture({
    members: [
      { user_id: 10, display_name: 'Late picker' },
      { user_id: 11, display_name: 'Replaced late pick' }
    ],
    teams: [
      { id: 1, short_name: 'A', sports_league: 'NFL' },
      { id: 2, short_name: 'B', sports_league: 'NFL' }
    ],
    games,
    picks: [
      { id: 1, user_id: 10, team_id: 1, week: 1, created_at: '2026-09-10T17:30:00.000Z', invalidated_at: null },
      { id: 2, user_id: 10, team_id: 2, week: 1, created_at: '2026-09-10T17:30:00.000Z', invalidated_at: null },
      { id: 3, user_id: 11, team_id: 1, week: 1, created_at: '2026-09-10T17:30:00.000Z', invalidated_at: '2026-09-10T17:31:00.000Z' },
      { id: 4, user_id: 11, team_id: 2, week: 1, created_at: '2026-09-10T17:30:00.000Z', invalidated_at: '2026-09-10T17:31:00.000Z' },
      { id: 5, user_id: 11, team_id: 1, week: 1, created_at: '2026-09-10T15:30:00.000Z', invalidated_at: null },
      { id: 6, user_id: 11, team_id: 2, week: 1, created_at: '2026-09-10T15:30:00.000Z', invalidated_at: null }
    ]
  });

  const matches = evaluateAchievement({
    key: 'SLIM_PICKINGS',
    evaluator: 'limitedGameAvailability',
    condition_config: { remaining_game_count_below: 5 }
  }, context);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].userId, 10);
  assert.equal(matches[0].evidence.remaining_game_count, 4);
  assert.deepEqual(matches[0].evidence.remaining_game_ids, [3, 4, 5, 6]);
});

test('Sheep awards each player sharing the same active non-BYE pair with five others', () => {
  const members = Array.from({ length: 7 }, (_, index) => ({
    user_id: index + 1,
    display_name: `Player ${index + 1}`
  }));
  const picks = members.flatMap((member, index) => {
    const teamIds = index < 6 ? [1, 2] : [-1, -1];
    return teamIds.map((team_id, pickIndex) => ({
      id: member.user_id * 10 + pickIndex,
      user_id: member.user_id,
      team_id,
      week: 1,
      invalidated_at: null
    }));
  });
  const context = contextFixture({
    members,
    teams: [
      { id: 1, short_name: 'A', sports_league: 'NFL' },
      { id: 2, short_name: 'B', sports_league: 'NFL' }
    ],
    picks
  });

  const matches = evaluateAchievement({
    key: 'SHEEP',
    evaluator: 'matchingPickGroup',
    condition_config: { other_player_count_at_least: 5 }
  }, context);

  assert.deepEqual(matches.map(match => match.userId), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(matches[0].evidence.matching_user_ids, [2, 3, 4, 5, 6]);
  assert.equal(matches[0].evidence.matching_player_count, 6);
});

test('maximum possible score considers all teams, not only player availability', () => {
  const context = contextFixture({
    games: [
      { id: 1, week: 1, away_team_short_name: 'A', home_team_short_name: 'B', away_team_score: 20, home_team_score: 10 },
      { id: 2, week: 1, away_team_short_name: 'C', home_team_short_name: 'D', away_team_score: 14, home_team_score: 7 }
    ]
  });
  assert.equal(maximumPossibleScore(context), 17);
});

test('one-off job arguments support both Render-friendly value forms', () => {
  assert.deepEqual(
    parseArguments(['pick-locked', '--league-id=4', '--week', '7', '--dry-run']),
    { mode: 'pick-locked', leagueId: '4', week: '7', dryRun: true }
  );
});

test('a finalized-week run reconciles locked-pick awards too', () => {
  assert.deepEqual(MODES['week-finalized'], ['pick_locked', 'week_finalized']);
});

test('Render job requests use a constrained achievement command', async () => {
  assert.equal(
    achievementEvaluationCommand('week-finalized', 42, 7),
    'bun run achievements:evaluate -- week-finalized --league-id 42 --week 7'
  );
  let request;
  const job = await createRenderOneOffJob('echo test', {
    apiKey: 'test-key',
    serviceId: 'srv-test',
    planId: 'plan-srv-006',
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ id: 'job-test' }) };
    }
  });
  assert.equal(job.id, 'job-test');
  assert.equal(request.url, 'https://api.render.com/v1/services/srv-test/jobs');
  assert.deepEqual(JSON.parse(request.options.body), {
    startCommand: 'echo test',
    planId: 'plan-srv-006'
  });
});

test('week setting advances launch the reveal and final reconciliation jobs', () => {
  assert.deepEqual(
    achievementJobsForWeekSettings(7, 7, 8, 8),
    [
      { mode: 'pick-locked', week: 8 },
      { mode: 'week-finalized', week: 7 }
    ]
  );
  assert.deepEqual(achievementJobsForWeekSettings(8, 8, 8, 8), []);
});

test('nullable league week values fall back instead of becoming zero', () => {
  const originalCurrentWeek = process.env.CURRENT_WEEK;
  process.env.CURRENT_WEEK = '6';
  try {
    assert.equal(integerOrFallback(null, 6), 6);
    assert.equal(effectiveLeagueWeek({ current_week: null }, 'current_week', 'CURRENT_WEEK', 1), 6);
    assert.equal(effectiveLeagueWeek({ current_week: 4 }, 'current_week', 'CURRENT_WEEK', 1), 4);
  } finally {
    if (originalCurrentWeek === undefined) delete process.env.CURRENT_WEEK;
    else process.env.CURRENT_WEEK = originalCurrentWeek;
  }
});

test('every seeded achievement has an evaluator that accepts its configuration', () => {
  const context = contextFixture({ week: 18, members: [] });
  for (const achievement of achievementDefinitions) {
    assert.doesNotThrow(
      () => evaluateAchievement(achievement, context),
      `${achievement.key} should have a usable evaluator`
    );
  }
});
