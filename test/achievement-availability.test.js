'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAvailabilityReport, runAvailabilityReport } = require('../achievements/availability');
const { availabilityRegistry, evaluateAchievementAvailability } = require('../achievements/availability-evaluators');
const { buildEvaluationContext } = require('../achievements/context');
const { parseArguments } = require('../jobs/achievement-availability');
const { opportunities } = require('../achievements/availability-context');

const definitions = new Map(require('../seed_data/achievements.json')
  .map((row, index) => [row.key, { id: index + 1, ...row }]));

test.before(async () => {
  for (const migration of [
    '20260912000000-add-final-achievements',
    '20260919000000-add-more-achievements',
    '20260920020000-add-manual-achievement',
    '20260920030000-add-keystone-combo-achievement',
    '20260920040000-add-fools-rarely-differ-achievement'
  ]) {
    await require(`../migrations/${migration}`).up({
      async runSql(sql) {
        const rows = /\(\s*'([A-Z_]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*NULL,\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'((?:[^']|'')*)'(?:::jsonb)?,\s*(TRUE|FALSE),\s*(TRUE|FALSE)\s*\)/gi;
        for (const match of sql.matchAll(rows)) {
          const [, key, name, description, evaluator, evaluation_phase, scope, config, repeatable, active] = match;
          definitions.set(key, {
            id: definitions.size + 1, key, name: name.replaceAll("''", "'"),
            description: description.replaceAll("''", "'"), evaluator, evaluation_phase, scope,
            condition_config: JSON.parse(config.replaceAll("''", "'")),
            repeatable: repeatable.toUpperCase() === 'TRUE', active: active.toUpperCase() === 'TRUE'
          });
        }
      }
    });
  }
});

function definition(key, overrides = {}) {
  assert.ok(definitions.has(key), key);
  return { ...definitions.get(key), ...overrides };
}

function game(id, week, away, home, options = {}) {
  return {
    id, week, away_team_short_name: away, home_team_short_name: home,
    start_time: new Date(Date.UTC(2026, 9, 12 + (week - 5) * 7)).toISOString(),
    away_team_score: null, home_team_score: null, ...options
  };
}

function scenario({ games = [], selections = [], members = [{ user_id: 10 }],
  teamTags = [], gameTags = [], ...overrides } = {}) {
  const names = [...new Set([
    ...games.flatMap(row => [row.away_team_short_name, row.home_team_short_name]),
    ...selections.flatMap(row => row.teams), ...members.map(row => row.favorite)
  ].filter(name => name && name !== 'BYE'))];
  const teams = names.map((short_name, index) => ({ id: index + 1, short_name }));
  const teamId = name => name === 'BYE' ? -1 : teams.find(team => team.short_name === name).id;
  let pickId = 0;
  return contextFixture({
    ...overrides, games, teams,
    members: members.map(row => ({ ...row, favorite_team_id: row.favorite ? teamId(row.favorite) : row.favorite_team_id })),
    picks: selections.flatMap(row => row.teams.map(name => ({
      id: ++pickId, user_id: row.userId ?? 10, week: row.week,
      team_id: teamId(name), created_at: row.createdAt || '2026-09-01T12:00:00Z',
      invalidated_at: row.invalidatedAt ?? null
    }))),
    teamTags: teamTags.map(row => ({ team_id: teamId(row.team), tag: row.tag })),
    gameTags
  });
}

function availability(key, context, overrides) {
  return evaluateAchievementAvailability(definition(key, overrides), context, context.members[0]);
}

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

test('availability companions cover seeded and subsequent badge definitions', () => {
  assert.deepEqual(Object.keys(availabilityRegistry).sort(), [...definitions.keys()].sort());
});

test('earned non-repeatables are excluded while repeatables remain available', () => {
  const achievements = [
    { id: 1, key: 'CAT_PERSON', repeatable: false },
    { id: 2, key: 'FUTURE_REPEATABLE', repeatable: true },
    { id: 3, key: 'FUTURE_REVOKED', repeatable: false },
    { id: 4, key: 'FUTURE_OTHER', repeatable: false }
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
  const result = evaluateAchievementAvailability({ key: 'FUTURE_BADGE' }, contextFixture(), { user_id: 10 });
  assert.equal(result.status, 'AVAILABLE');
  assert.match(result.reason, /no availability evaluator/);
});

test('availability requires an active league member and valid identifiers', async () => {
  assert.throws(() => buildAvailabilityReport([], contextFixture(), 20), /not an active member/);
  await assert.rejects(runAvailabilityReport(null, { leagueId: 0, userId: 10 }), /leagueId/);
  await assert.rejects(runAvailabilityReport(null, { leagueId: 6, userId: -1 }), /userId/);
  assert.deepEqual(parseArguments(['--league-id=6', '--user-id', '10']), { leagueId: '6', userId: '10' });
  assert.throws(() => parseArguments(['--league-id', '--user-id', '10']), /Missing value/);
});

test('team combinations exclude spent teams but release editable future reservations', () => {
  const games = [game(1, 1, 'TB', 'A'), game(2, 1, 'B', 'C'),
    game(3, 5, 'TB', 'D'), game(4, 5, 'LV', 'E'), game(5, 6, 'TB', 'F'), game(6, 6, 'LV', 'G')];
  assert.equal(availability('YARRR', scenario({ games,
    selections: [{ week: 1, teams: ['TB', 'B'] }]
  })).status, 'LOCKED_OUT');
  assert.equal(availability('YARRR', scenario({ games,
    selections: [{ week: 6, teams: ['TB', 'LV'] }]
  })).status, 'AVAILABLE');
});

test('legal pairs respect opposing teams and the week-18 exception', () => {
  const context = scenario({ games: [game(1, 5, 'TB', 'LV'), game(2, 18, 'TB', 'LV')] });
  assert.equal(opportunities(context, context.members[0], 5).pairs.length, 0);
  assert.equal(opportunities(context, context.members[0], 18).pairs.length, 1);
});

test('already-qualifying picks remain available while awaiting the awarding job', () => {
  const context = scenario({ games: [game(1, 1, 'TB', 'A'), game(2, 1, 'LV', 'B')],
    selections: [{ week: 1, teams: ['TB', 'LV'] }]
  });
  const result = availability('YARRR', context);
  assert.equal(result.status, 'AVAILABLE');
  assert.match(result.reason, /already qualifies in week 1/);
});

test('repeatables do not reuse a qualifying week that already has an active award', () => {
  const context = scenario({ games: [
    game(1, 1, 'TB', 'A', { away_team_score: 50, home_team_score: 0 }),
    game(2, 1, 'LV', 'B', { away_team_score: 20, home_team_score: 0 })
  ], selections: [{ week: 1, teams: ['TB', 'LV'] }],
  awards: [{ user_id: 10, achievement_id: definition('DAMN_FINE_PICK').id, week: 1, invalidated_at: null }] });
  assert.equal(availability('DAMN_FINE_PICK', context).status, 'LOCKED_OUT');
  context.awards[0].invalidated_at = '2026-10-11';
  assert.equal(availability('DAMN_FINE_PICK', context).status, 'AVAILABLE');
});

test('tags, alternative team matches, and division matches use the award predicates', () => {
  const context = scenario({ games: [game(1, 5, 'BUF', 'NE'), game(2, 5, 'NYJ', 'MIA')] });
  assert.equal(availability('EMPIRE_STATE_OF_MIND', context).status, 'AVAILABLE');
  assert.equal(availability('HEATED_RIVALRY', context).status, 'AVAILABLE');
  assert.equal(availability('CAT_PERSON', context).status, 'LOCKED_OUT');
  assert.equal(availability('GET_THE_HORNS', scenario({
    games: [game(1, 5, 'BUF', 'A'), game(2, 5, 'HOU', 'B')],
    teamTags: [{ team: 'BUF', tag: 'horns' }, { team: 'HOU', tag: 'horns' }]
  })).status, 'AVAILABLE');
});

test('calendar tags lock out after their games pass without a qualifying pick', () => {
  const context = scenario({ games: [game(1, 1, 'TB', 'A'), game(2, 5, 'LV', 'B'), game(3, 5, 'C', 'D')],
    gameTags: [{ game_id: 1, tag: 'christmas' }] });
  assert.equal(availability('PICKMAS', context).status, 'LOCKED_OUT');
  context.gameTagsById.set('2', new Set(['christmas']));
  assert.equal(availability('PICKMAS', context).status, 'AVAILABLE');
});

test('Go Wide requires uniquely first and last games that are still pickable', () => {
  const context = scenario({ games: [
    game(1, 5, 'A', 'B', { start_time: '2026-10-12T00:00:00Z' }),
    game(2, 5, 'C', 'D', { start_time: '2026-10-13T00:00:00Z' })
  ] });
  assert.equal(availability('GO_WIDE', context).status, 'AVAILABLE');
  const tied = scenario({ games: [...context.games, game(3, 5, 'E', 'F', { start_time: '2026-10-12T00:00:00Z' })] });
  assert.equal(availability('GO_WIDE', tied).status, 'LOCKED_OUT');
});

test('scoring checks allow unknown final results but reject an immutable failed pick', () => {
  const options = { start_time: '2026-10-11T17:00:00Z' };
  const context = scenario({ games: [game(1, 5, 'TB', 'A', options), game(2, 5, 'LV', 'B', options)],
    selections: [{ week: 5, teams: ['TB', 'LV'] }] });
  for (const key of ['DAMN_FINE_PICK', 'BIG_BUST', 'SEVEN_TEN_SPLIT', 'SIX_SEVENNN', 'LARRY_LEGEND',
    'BARELY_WOULDVE_MATTERED', 'ROAD_WARRIORS', 'WHAT_IS_THIS_SOCCER', 'ABSOLUTE_DRUBBING', 'MIRROR_IMAGE']) {
    assert.equal(availability(key, context).status, 'AVAILABLE', key);
  }
  const final = scenario({ games: [
    game(1, 5, 'TB', 'A', { ...options, away_team_score: 21, home_team_score: 20 }),
    game(2, 5, 'LV', 'B', { ...options, away_team_score: 21, home_team_score: 20 })
  ], selections: [{ week: 5, teams: ['TB', 'LV'] }] });
  assert.equal(availability('DAMN_FINE_PICK', final).status, 'LOCKED_OUT');
  assert.equal(availability('THANKS_I_GUESS', final).status, 'AVAILABLE');
  assert.equal(availability('HOMEWRECKED', context).status, 'LOCKED_OUT');
});

test('known margins constrain exact weekly scores and ties count under existing scoring rules', () => {
  const options = { start_time: '2026-10-11T17:00:00Z' };
  const context = scenario({ games: [
    game(1, 5, 'TB', 'A', { ...options, away_team_score: 50, home_team_score: 0 }),
    game(2, 5, 'LV', 'B', options)
  ], selections: [{ week: 5, teams: ['TB', 'LV'] }] });
  assert.equal(availability('LARRY_LEGEND', context).status, 'LOCKED_OUT');
  assert.equal(availability('DAMN_FINE_PICK', context).status, 'AVAILABLE');
  assert.equal(availability('SEVEN_TEN_SPLIT', context).status, 'LOCKED_OUT');
});

test('favorite-team checks distinguish a spent favorite from its available opponents', () => {
  const context = scenario({ members: [{ user_id: 10, favorite: 'TB' }],
    games: [game(1, 1, 'TB', 'A'), game(2, 1, 'B', 'C'), game(3, 5, 'TB', 'LV'), game(4, 5, 'D', 'E')],
    selections: [{ week: 1, teams: ['TB', 'B'] }] });
  for (const key of ['BEST_WEEK_EVER', 'SILVER_LINING', 'WORST_OF_ALL_WORLDS', 'BITTERSWEET_SPLIT']) {
    assert.equal(availability(key, context).status, 'AVAILABLE', 'The week-1 favorite pick still has pending scores.');
  }
  const scored = scenario({ members: [{ user_id: 10, favorite: 'TB' }], games: [
    game(1, 1, 'TB', 'A', { away_team_score: 10, home_team_score: 20 }),
    game(2, 1, 'B', 'C', { away_team_score: 20, home_team_score: 10 }),
    game(3, 5, 'TB', 'LV'), game(4, 5, 'D', 'E')
  ], selections: [{ week: 1, teams: ['TB', 'B'] }] });
  assert.equal(availability('BEST_WEEK_EVER', scored).status, 'LOCKED_OUT');
  assert.equal(availability('WORST_OF_ALL_WORLDS', scored).status, 'AVAILABLE');
  assert.equal(availability('ET_TU', scored).status, 'AVAILABLE');
});

test('unset favorites remain selectable and other-member favorites need distinct assignments', () => {
  const context = scenario({ games: [game(1, 5, 'A', 'B'), game(2, 5, 'C', 'D')] });
  assert.equal(availability('BEST_WEEK_EVER', context).status, 'AVAILABLE');
  const crowd = { id: 100, key: 'CROWD_PLEASER', evaluator: 'otherMembersFavoriteTeamsResult',
    condition_config: { result: 'double_win' }, evaluation_phase: 'scores_updated' };
  const oneOther = scenario({ games: context.games, members: [{ user_id: 10 }, { user_id: 20 }] });
  assert.equal(evaluateAchievementAvailability(crowd, oneOther, oneOther.members[0]).status, 'LOCKED_OUT');
  const twoOthers = scenario({ games: context.games, members: [{ user_id: 10 }, { user_id: 20 }, { user_id: 30 }] });
  assert.equal(evaluateAchievementAvailability(crowd, twoOthers, twoOthers.members[0]).status, 'AVAILABLE');
});

test('seasonal thresholds require distinct teams, including two international picks', () => {
  const games = [game(1, 5, 'SEA', 'A'), game(2, 5, 'BAL', 'B'), game(3, 6, 'SEA', 'C'), game(4, 6, 'BAL', 'D')];
  const context = scenario({ games, teamTags: [{ team: 'SEA', tag: 'bird' }, { team: 'BAL', tag: 'bird' }] });
  assert.equal(availability('BIRD_BRAIN', context).status, 'LOCKED_OUT');
  const fourBirds = scenario({ games: [...games, game(5, 6, 'ATL', 'E'), game(6, 6, 'PHI', 'F')],
    teamTags: ['SEA', 'BAL', 'ATL', 'PHI'].map(team => ({ team, tag: 'bird' })) });
  assert.equal(availability('BIRD_BRAIN', fourBirds).status, 'AVAILABLE');
  const international = scenario({ games: games.slice(0, 2), gameTags: [{ game_id: 1, tag: 'international' }] });
  assert.equal(availability('WORLD_TRAVELER', international).status, 'LOCKED_OUT');
  international.gameTagsById.set('2', new Set(['international']));
  assert.equal(availability('WORLD_TRAVELER', international).status, 'AVAILABLE');
});

test('opponent thresholds do not double-count divisional rematches', () => {
  const context = scenario({ games: [game(1, 5, 'TB', 'A'), game(2, 5, 'B', 'C'),
    game(3, 6, 'TB', 'A'), game(4, 6, 'D', 'E')
  ] });
  assert.equal(availability('OPPOSITION_RESEARCH', context,
    { condition_config: { opponent_pick_count_at_least: 2 } }).status, 'LOCKED_OUT');
  const more = scenario({ games: [...context.games, game(5, 6, 'TB', 'F')] });
  assert.equal(availability('OPPOSITION_RESEARCH', more,
    { condition_config: { opponent_pick_count_at_least: 2 } }).status, 'AVAILABLE');
});

test('bye patterns honor the two-bye limit and missed season-opening opportunity', () => {
  const context = scenario({ games: [game(1, 5, 'A', 'B'), game(2, 6, 'C', 'D')] });
  assert.equal(availability('SLOW_START', context).status, 'LOCKED_OUT');
  assert.equal(availability('SLOW_FINISH', context).status, 'AVAILABLE');
  assert.equal(availability('BYE_BYE', context).status, 'AVAILABLE');
  const exhausted = scenario({ games: context.games,
    selections: [{ week: 1, teams: ['BYE', 'BYE'] }, { week: 3, teams: ['BYE', 'BYE'] }] });
  assert.equal(availability('BYE_BYE', exhausted).status, 'LOCKED_OUT');
  assert.equal(availability('SLOW_FINISH', exhausted).status, 'LOCKED_OUT');
});

test('submission badges require editable picks and enough lead time', () => {
  const context = scenario({ games: [game(1, 5, 'A', 'B'), game(2, 5, 'C', 'D')] });
  assert.equal(availability('INDECISIVE', context).status, 'AVAILABLE');
  assert.equal(availability('BUZZER_BEATER', context).status, 'AVAILABLE');
  assert.equal(availability('THE_LONG_GAME', context).status, 'LOCKED_OUT');
  const early = scenario({ games: [game(1, 10, 'A', 'B'), game(2, 10, 'C', 'D')] });
  assert.equal(availability('THE_LONG_GAME', early).status, 'AVAILABLE');
  const replaced = scenario({ games: early.games,
    selections: [{ week: 10, teams: ['A', 'C'], invalidatedAt: '2026-10-01' }] });
  assert.equal(availability('THE_LONG_GAME', replaced).status, 'LOCKED_OUT');
  const frozen = scenario({ games: [game(1, 5, 'A', 'B', { start_time: '2026-10-11T17:00:00Z' }), game(2, 5, 'C', 'D')],
    selections: [{ week: 5, teams: ['A', 'C'], createdAt: '2026-10-11T16:00:00Z' }] });
  assert.equal(availability('BUZZER_BEATER', frozen).status, 'LOCKED_OUT');
  assert.equal(availability('INDECISIVE', frozen).status, 'LOCKED_OUT');
});

test('Slim Pickings uses simultaneous kickoff counts and excludes byes', () => {
  const slate = count => scenario({ games: Array.from({ length: count }, (_, index) => game(index + 1, 5, `A${index}`, `B${index}`)) });
  assert.equal(availability('SLIM_PICKINGS', slate(5)).status, 'LOCKED_OUT');
  assert.equal(availability('SLIM_PICKINGS', slate(4)).status, 'AVAILABLE');
  assert.equal(availability('SLIM_PICKINGS', scenario({ games: [game(1, 5, 'A', 'B')] })).status, 'LOCKED_OUT');
});

test('group badges need enough eligible peers and exactly-two badges reject forced triples', () => {
  const games = [game(1, 5, 'A', 'B'), game(2, 5, 'C', 'D')];
  assert.equal(availability('SHEEP', scenario({ games })).status, 'LOCKED_OUT');
  const members = Array.from({ length: 6 }, (_, index) => ({ user_id: 10 + index }));
  assert.equal(availability('SHEEP', scenario({ games, members })).status, 'AVAILABLE');
  const started = games.map(row => ({ ...row, start_time: '2026-10-11T17:00:00Z' }));
  const triple = scenario({ games: started, members: members.slice(0, 3),
    selections: members.slice(0, 3).map(member => ({ userId: member.user_id, week: 5, teams: ['A', 'C'] })) });
  assert.equal(availability('GREAT_MINDS', triple).status, 'LOCKED_OUT');
  assert.equal(availability('FOOLS_SELDOM_DIFFER', triple).status, 'LOCKED_OUT');
});

test('league-wide bye badges retain pending scores but reject an unavoidable contrary result', () => {
  const options = { start_time: '2026-10-11T17:00:00Z' };
  const members = [{ user_id: 10 }, { user_id: 20 }];
  const context = scenario({ games: [game(1, 5, 'A', 'B', options), game(2, 5, 'C', 'D', options)],
    members, selections: [{ userId: 20, week: 5, teams: ['A', 'C'] }] });
  assert.equal(availability('FOMO', context).status, 'AVAILABLE');
  assert.equal(availability('THE_ONLY_WINNING_MOVE', context).status, 'AVAILABLE');
  const final = scenario({ games: [
    game(1, 5, 'A', 'B', { ...options, away_team_score: 20, home_team_score: 10 }),
    game(2, 5, 'C', 'D', { ...options, away_team_score: 20, home_team_score: 10 })
  ], members, selections: [{ userId: 20, week: 5, teams: ['A', 'C'] }] });
  assert.equal(availability('FOMO', final).status, 'AVAILABLE');
  assert.equal(availability('THE_ONLY_WINNING_MOVE', final).status, 'LOCKED_OUT');
});

test('standings badges rule out an exhausted player who cannot catch the leader or reach the average', () => {
  const context = scenario({ games: [
    game(1, 1, 'A', 'B', { away_team_score: 20, home_team_score: 10 }),
    game(2, 1, 'C', 'D', { away_team_score: 10, home_team_score: 20 }),
    game(3, 5, 'A', 'B'), game(4, 5, 'C', 'D')
  ], members: [{ user_id: 10 }, { user_id: 20 }],
  selections: [
    { userId: 10, week: 1, teams: ['A', 'C'] },
    { userId: 10, week: 2, teams: ['B', 'D'] },
    { userId: 20, week: 1, teams: ['A', 'D'] }
  ] });
  assert.equal(availability('LEADER_OF_THE_PACK', context).status, 'LOCKED_OUT');
  assert.equal(availability('TWINSIES', context).status, 'LOCKED_OUT');
  assert.equal(availability('EXCEPTIONALLY_AVERAGE', context).status, 'LOCKED_OUT');
});

test('Time Loop can use an existing prior pair or a possible earlier future pair', () => {
  const members = [{ user_id: 10 }, { user_id: 20 }];
  const games = [game(1, 5, 'A', 'B'), game(2, 5, 'C', 'D')];
  assert.equal(availability('TIME_LOOP', scenario({ games, members })).status, 'LOCKED_OUT');
  const prior = scenario({ games, members, selections: [{ userId: 20, week: 1, teams: ['A', 'C'] }] });
  assert.equal(availability('TIME_LOOP', prior).status, 'AVAILABLE');
  const future = scenario({ games: [...games, game(3, 6, 'A', 'E'), game(4, 6, 'C', 'F')], members });
  assert.equal(availability('TIME_LOOP', future).status, 'AVAILABLE');
});

test('True Nonconformist has a week-15 cutoff and Lone Holdout excludes already-used teams', () => {
  const late = scenario({ currentWeek: 16, week: 16, games: [game(1, 16, 'A', 'B'), game(2, 16, 'C', 'D')] });
  assert.equal(availability('TRUE_NONCONFORMIST', late).status, 'LOCKED_OUT');
  const context = scenario({ games: [game(1, 5, 'A', 'B'), game(2, 5, 'C', 'D')],
    members: [{ user_id: 10 }, { user_id: 20 }] });
  assert.equal(availability('LONE_HOLDOUT', context).status, 'AVAILABLE');
  const solo = scenario({ games: context.games });
  assert.equal(availability('LONE_HOLDOUT', solo).status, 'LOCKED_OUT');
});

test('streaks bridge historical byes without counting them and need enough distinct remaining teams', () => {
  const games = [];
  const selections = [];
  for (let week = 4; week <= 7; week += 1) {
    games.push(game(week * 2, week, `A${week}`, `X${week}`, { away_team_score: 20, home_team_score: 10 }));
    games.push(game(week * 2 + 1, week, `B${week}`, `Y${week}`, { away_team_score: 20, home_team_score: 10 }));
    selections.push({ week, teams: [`A${week}`, `B${week}`] });
  }
  selections.push({ week: 8, teams: ['BYE', 'BYE'] });
  for (let week = 9; week <= 12; week += 1) {
    games.push(game(week * 2, week, `A${week}`, `X${week}`), game(week * 2 + 1, week, `B${week}`, `Y${week}`));
  }
  const context = scenario({ currentWeek: 9, week: 9, asOf: new Date('2026-11-08T18:00:00Z'), games, selections });
  assert.equal(availability('HOT_STREAK', context).status, 'AVAILABLE');
  const short = scenario({ games: [game(1, 5, 'A', 'B'), game(2, 5, 'C', 'D')],
    selections: [{ week: 1, teams: ['BYE', 'BYE'] }] });
  assert.equal(availability('HOT_STREAK', short).status, 'LOCKED_OUT');
  assert.equal(availability('COLD_STREAK', short).status, 'LOCKED_OUT');
});

test('drought requires a full membership window without other active awards', () => {
  const badge = { id: 100, key: 'WE_DONT_NEED_NO_STINKING_BADGES', evaluator: 'badgeDrought',
    condition_config: { week_count: 5 }, evaluation_phase: 'manual' };
  const games = Array.from({ length: 6 }, (_, index) => game(index + 1, index + 1, 'A', 'B'));
  const context = scenario({ games, awards: [{ user_id: 10, achievement_id: 101, week: 3, invalidated_at: null }] });
  assert.equal(evaluateAchievementAvailability(badge, context, context.members[0]).status, 'LOCKED_OUT');
  const revoked = scenario({ games, awards: [{ user_id: 10, achievement_id: 101, week: 3, invalidated_at: '2026-10-01' }] });
  assert.equal(evaluateAchievementAvailability(badge, revoked, revoked.members[0]).status, 'AVAILABLE');
  const joinedLate = scenario({ games, members: [{ user_id: 10, created_at: '2026-10-01T00:00:00Z' }] });
  assert.equal(evaluateAchievementAvailability(badge, joinedLate, joinedLate.members[0]).status, 'LOCKED_OUT');
});

test('all 80 badges accept a remaining-season context and incomplete schedules avoid false lockouts', () => {
  const context = scenario({ games: [game(1, 5, 'TB', 'A'), game(2, 5, 'LV', 'B')],
    members: [{ user_id: 10 }, { user_id: 20 }] });
  for (const achievement of definitions.values()) {
    const result = evaluateAchievementAvailability(achievement, context, context.members[0]);
    assert.ok(['AVAILABLE', 'LOCKED_OUT'].includes(result.status), achievement.key);
    assert.equal(typeof result.reason, 'string', achievement.key);
  }
  const incomplete = scenario({ league: { id: 6, season: 2026, sports_league: 'NFL' }, games: context.games });
  assert.equal(availability('CAT_PERSON', incomplete).status, 'AVAILABLE');
  assert.match(availability('CAT_PERSON', incomplete).reason, /schedule is incomplete/);
});

test('a full NFL-season report evaluates every badge for a populated league', () => {
  const names = Object.keys(require('../achievements/context').NFL_DIVISIONS);
  const games = [];
  for (let week = 1; week <= 18; week += 1) {
    for (let index = 0; index < 16; index += 1) {
      games.push(game(week * 100 + index, week, names[index], names[index + 16], week < 5
        ? { away_team_score: 20, home_team_score: 10 } : {}));
    }
  }
  const members = Array.from({ length: 12 }, (_, index) => ({ user_id: 10 + index, favorite: names[index] }));
  const selections = members.flatMap(member => Array.from({ length: 4 }, (_, index) => ({
    userId: member.user_id, week: index + 1, teams: [names[index * 2], names[index * 2 + 1]]
  })));
  const context = scenario({ league: { id: 6, name: 'Friends', season: 2026, sports_league: 'NFL' },
    games, members, selections });
  const report = buildAvailabilityReport([...definitions.values()], context, 10);
  assert.equal(report.total, 80);
  assert.equal(report.stillAvailable + report.lockedOut + report.notApplicable, 80);
  assert.ok(report.lockedOut > 0);
  assert.ok(report.stillAvailable > 0);
});
