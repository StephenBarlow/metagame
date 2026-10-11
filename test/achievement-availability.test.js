'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAvailabilityReport, runAvailabilityReport } = require('../achievements/availability');
const { availabilityRegistry, evaluateAchievementAvailability } = require('../achievements/availability-evaluators');
const { buildEvaluationContext } = require('../achievements/context');
const { parseArguments } = require('../jobs/achievement-availability');

function contextFixture(overrides = {}) {
  return buildEvaluationContext({
    league: { id: 6, name: 'Friends', season: 2026 },
    week: 5,
    currentWeek: 5,
    revealedWeek: 5,
    currentSeason: '2026',
    asOf: new Date('2026-10-11T18:00:00Z'),
    members: [{ user_id: 10, display_name: 'Player' }],
    picks: [], teams: [], teamTags: [], games: [], gameTags: [], awards: [],
    ...overrides
  });
}

test('availability companions cover seeded and subsequent badge definitions', async () => {
  const keys = new Set(require('../seed_data/achievements.json').map(row => row.key));
  for (const migration of [
    '20260912000000-add-final-achievements',
    '20260919000000-add-more-achievements',
    '20260920020000-add-manual-achievement',
    '20260920030000-add-keystone-combo-achievement',
    '20260920040000-add-fools-rarely-differ-achievement'
  ]) {
    await require(`../migrations/${migration}`).up({
      async runSql(sql) {
        for (const match of sql.matchAll(/\(\s*'([A-Z_]+)'/g)) keys.add(match[1]);
      }
    });
  }
  assert.deepEqual(Object.keys(availabilityRegistry).sort(), [...keys].sort());
});

test('earned non-repeatables are excluded while repeatables remain available', () => {
  const achievements = [
    { id: 1, key: 'CAT_PERSON', repeatable: false },
    { id: 2, key: 'SEVEN_TEN_SPLIT', repeatable: true },
    { id: 3, key: 'YARRR', repeatable: false },
    { id: 4, key: 'FOR_THE_BIRDS', repeatable: false }
  ];
  const context = contextFixture({ awards: [
    { achievement_id: 1, user_id: 10, invalidated_at: null },
    { achievement_id: 2, user_id: 10, invalidated_at: null },
    { achievement_id: 2, user_id: 10, invalidated_at: null },
    { achievement_id: 3, user_id: 10, invalidated_at: '2026-10-10' },
    { achievement_id: 4, user_id: 20, invalidated_at: null }
  ] });
  const report = buildAvailabilityReport(achievements, context, '10');
  assert.equal(report.earned, 2);
  assert.equal(report.stillAvailable, 3);
  assert.equal(report.lockedOut, 0);
  assert.equal(report.provisional, true);
  assert.deepEqual(report.badges.map(row => row.status), ['EARNED', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE']);
  assert.equal(report.badges[1].earned, true);
});

test('concluded leagues retain earned badges but have none still available', () => {
  const context = contextFixture({ currentSeason: '2027', awards: [
    { achievement_id: 1, user_id: 10, invalidated_at: null }
  ] });
  const report = buildAvailabilityReport([
    { id: 1, key: 'CAT_PERSON', repeatable: false },
    { id: 2, key: 'SEVEN_TEN_SPLIT', repeatable: true }
  ], context, 10);
  assert.equal(report.earned, 1);
  assert.equal(report.stillAvailable, 0);
  assert.equal(report.notApplicable, 1);
});

test('unknown future badges conservatively default to AVAILABLE', () => {
  assert.deepEqual(evaluateAchievementAvailability({ key: 'FUTURE_BADGE' }, contextFixture(), { user_id: 10 }),
    { status: 'AVAILABLE' });
});

test('availability requires an active league member and valid identifiers', async () => {
  assert.throws(() => buildAvailabilityReport([], contextFixture(), 20), /not an active member/);
  await assert.rejects(runAvailabilityReport(null, { leagueId: 0, userId: 10 }), /leagueId/);
  await assert.rejects(runAvailabilityReport(null, { leagueId: 6, userId: -1 }), /userId/);
  assert.deepEqual(parseArguments(['--league-id=6', '--user-id', '10']), { leagueId: '6', userId: '10' });
  assert.throws(() => parseArguments(['--league-id', '--user-id', '10']), /Missing value/);
});
