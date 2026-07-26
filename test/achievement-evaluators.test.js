'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildEvaluationContext } = require('../achievements/context');
const { evaluateAchievement, maximumPossibleScore } = require('../achievements/evaluators');
const { calculatePickTwoResult } = require('../achievements/scoring');
const { parseArguments } = require('../jobs/evaluate-achievements');
const { integerOrFallback } = require('../achievements/engine');
const { effectiveLeagueWeek } = require('../resolvers');
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
