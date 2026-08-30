const assert = require('node:assert/strict');
const test = require('node:test');

const { ApolloServer } = require('@apollo/server');
const { typeDefs } = require('../schema');
const { resolvers } = require('../resolvers');

test('sportsGames returns the same ISO timestamp for database and cached values', async (t) => {
  const startsAt = '2026-09-10T00:00:00.000Z';
  let databaseValue = new Date(startsAt);
  const server = new ApolloServer({ typeDefs, resolvers });
  t.after(() => server.stop());

  const contextValue = {
    dataSources: {
      pg: {
        getSportsGames: async () => [{
          id: 1,
          sports_league: 'NFL',
          start_time: databaseValue,
          week: 1,
          away_team_short_name: 'BUF',
          home_team_short_name: 'NYJ',
          away_team_score: null,
          home_team_score: null
        }],
        getTeams: async () => [
          { id: 1, name: 'Buffalo Bills', short_name: 'BUF', sports_league: 'NFL' },
          { id: 2, name: 'New York Jets', short_name: 'NYJ', sports_league: 'NFL' }
        ]
      }
    }
  };
  const operation = {
    query: 'query Games($season: String) { sportsGames(season: $season) { startsAt } }',
    variables: { season: '2026' }
  };

  const databaseResponse = await server.executeOperation(operation, { contextValue });
  databaseValue = startsAt;
  const cacheResponse = await server.executeOperation(operation, { contextValue });

  assert.equal(databaseResponse.body.kind, 'single');
  assert.equal(cacheResponse.body.kind, 'single');
  assert.equal(databaseResponse.body.singleResult.data.sportsGames[0].startsAt, startsAt);
  assert.equal(cacheResponse.body.singleResult.data.sportsGames[0].startsAt, startsAt);
});

test('submitPick rejects an identical active Pick 2 submission', async () => {
  const originalSeason = process.env.CURRENT_SEASON;
  process.env.CURRENT_SEASON = '2026';

  let submitted = false;
  const pg = {
    getLeagueById: async () => ({ game_mode: 'PICK_TWO' }),
    getSportsGamesForWeek: async () => [
      { id: 1, start_time: '2099-09-10T20:20:00.000Z', away_team_short_name: 'BUF', home_team_short_name: 'NYJ' },
      { id: 2, start_time: '2099-09-10T20:20:00.000Z', away_team_short_name: 'MIA', home_team_short_name: 'NE' }
    ],
    getTeams: async () => [
      { id: 1, short_name: 'BUF' },
      { id: 2, short_name: 'MIA' }
    ],
    getPicksForMember: async () => [
      { team_id: 1, week: 1 },
      { team_id: 2, week: 1 }
    ],
    submitPicks: async () => { submitted = true; }
  };

  const context = { dataSources: { pg }, errorMessage: undefined };
  const result = await resolvers.Mutation.submitPick(null, {
    request: { userID: '7', leagueID: '9', teamIDs: ['2', '1'], week: 1 }
  }, context);

  assert.equal(submitted, false);
  assert.deepEqual(result, {
    pick: null,
    errors: [{ code: 'ERR_INVALID_INPUT', message: 'The submitted pick matches your existing pick.' }]
  });
  process.env.CURRENT_SEASON = originalSeason;
});

test('setFavoriteTeam stores a member\'s first valid league team choice', async (t) => {
  const server = new ApolloServer({ typeDefs, resolvers });
  t.after(() => server.stop());
  let stored;
  const contextValue = {
    dataSources: {
      pg: {
        getLeagueById: async () => ({ id: 2, owner_id: 9, sports_league: 'NFL' }),
        getTeamById: async () => ({ id: 3, name: 'Buffalo Bills', short_name: 'BUF', sports_league: 'NFL' }),
        getMembership: async () => ({ user_id: 1, league_id: 2, favorite_team_id: null }),
        setMembershipFavoriteTeam: async (...args) => {
          stored = args;
          return { user_id: 1, league_id: 2, favorite_team_id: 3 };
        }
      }
    }
  };

  const response = await server.executeOperation({
    query: `mutation SetFavoriteTeam($request: SetFavoriteTeamRequest!) {
      setFavoriteTeam(request: $request) {
        favoriteTeam { id name shortName }
        errors { code message }
      }
    }`,
    variables: { request: { userID: '1', leagueID: '2', teamID: '3' } }
  }, { contextValue });

  assert.equal(response.body.kind, 'single');
  assert.deepEqual(JSON.parse(JSON.stringify(response.body.singleResult.data.setFavoriteTeam)), {
    favoriteTeam: { id: '3', name: 'Buffalo Bills', shortName: 'BUF' },
    errors: []
  });
  assert.deepEqual(stored, [1, 2, 3, 9]);
});

test('setFavoriteTeam rejects a replacement choice', async (t) => {
  const server = new ApolloServer({ typeDefs, resolvers });
  t.after(() => server.stop());
  let called = false;
  const response = await server.executeOperation({
    query: `mutation {
      setFavoriteTeam(request: { userID: 1, leagueID: 2, teamID: 3 }) {
        favoriteTeam { id }
        errors { code message }
      }
    }`
  }, {
    contextValue: {
      dataSources: {
        pg: {
          getLeagueById: async () => ({ id: 2, sports_league: 'NFL' }),
          getTeamById: async () => ({ id: 3, sports_league: 'NFL' }),
          getMembership: async () => ({ favorite_team_id: 4 }),
          setMembershipFavoriteTeam: async () => { called = true; }
        }
      }
    }
  });

  assert.equal(response.body.kind, 'single');
  assert.equal(response.body.singleResult.data.setFavoriteTeam.favoriteTeam, null);
  assert.deepEqual(JSON.parse(JSON.stringify(response.body.singleResult.data.setFavoriteTeam.errors)), [{
    code: 'ERR_INVALID_INPUT',
    message: 'A favorite team has already been selected for this league.'
  }]);
  assert.equal(called, false);
});

test('league achievement awards include the recipient, unlock week, and full achievement definition', async (t) => {
  const originalSeason = process.env.CURRENT_SEASON;
  process.env.CURRENT_SEASON = '2026';
  t.after(() => { process.env.CURRENT_SEASON = originalSeason; });

  const server = new ApolloServer({ typeDefs, resolvers });
  t.after(() => server.stop());
  const response = await server.executeOperation({
    query: `query LeagueAwards($leagueID: ID!, $userID: ID!) {
      league(leagueID: $leagueID) {
        achievementAwards {
          id
          week
          awardedAt
          user { id displayName(leagueID: $userID) }
          achievement { id key name description iconId }
        }
      }
    }`,
    variables: { leagueID: '2', userID: '1' }
  }, {
    contextValue: {
      dataSources: {
        pg: {
          getLeagueById: async () => ({ id: 2, name: 'Test League', season: '2026', game_mode: 'PICK_TWO', owner_id: 1 }),
          getLeagueMembers: async () => [{ user_id: 1, league_id: 2, email: 'test@example.com', display_name: 'Player' }],
          getTeams: async () => [],
          getPicksForLeague: async () => [],
          getAchievementAwardsForLeague: async () => [{
            award_id: 7,
            user_id: 1,
            league_id: 2,
            week: 4,
            awarded_at: '2026-10-01T00:00:00.000Z',
            achievement_id: 3,
            achievement_key: 'BEST_WEEK_EVER',
            achievement_name: 'Best Week Ever',
            achievement_description: 'Achieve a double-win with your favorite team.',
            achievement_icon_id: 'tabler:trophy'
          }]
        }
      }
    }
  });

  assert.equal(response.body.kind, 'single');
  assert.deepEqual(JSON.parse(JSON.stringify(response.body.singleResult.data.league.achievementAwards)), [{
    id: '7',
    week: 4,
    awardedAt: '2026-10-01T00:00:00.000Z',
    user: { id: '1', displayName: 'Player' },
    achievement: {
      id: '3',
      key: 'BEST_WEEK_EVER',
      name: 'Best Week Ever',
      description: 'Achieve a double-win with your favorite team.',
      iconId: 'tabler:trophy'
    }
  }]);
});

test('message composer data exposes active templates, typed slots, and separate value catalogs', async (t) => {
  const server = new ApolloServer({ typeDefs, resolvers });
  t.after(() => server.stop());
  const templateRows = [
    {
      template_id: 1,
      template_key: 'SUBJECT_ADJECTIVE',
      template_format: '{subject}? {adjective}!',
      slot_id: 10,
      slot_key: 'subject',
      slot_position: 0,
      slot_prompt: 'Player, team, or catalog entry',
      slot_value_type: 'catalog_value'
    },
    {
      template_id: 1,
      template_key: 'SUBJECT_ADJECTIVE',
      template_format: '{subject}? {adjective}!',
      slot_id: 10,
      slot_key: 'subject',
      slot_position: 0,
      slot_prompt: 'Player, team, or catalog entry',
      slot_value_type: 'league_member'
    },
    {
      template_id: 1,
      template_key: 'SUBJECT_ADJECTIVE',
      template_format: '{subject}? {adjective}!',
      slot_id: 11,
      slot_key: 'adjective',
      slot_position: 1,
      slot_prompt: 'Adjective',
      slot_value_type: 'adjective'
    }
  ];
  const requestedKinds = [];
  const response = await server.executeOperation({
    query: `query Composer {
      messageTemplates {
        id
        key
        format
        slots { id key position prompt valueTypes }
      }
      catalog: messageValues(kind: CATALOG_VALUE) { id key text kind }
      adjectives: messageValues(kind: ADJECTIVE) { id key text kind }
    }`
  }, {
    contextValue: {
      dataSources: {
        pg: {
          getMessageTemplates: async () => templateRows,
          getMessageValues: async kind => {
            requestedKinds.push(kind);
            return kind === 'adjective'
              ? [{ id: 3, key: 'INCREDIBLE', text: 'incredible', kind }]
              : [{ id: 2, key: 'CHAOS', text: 'chaos', kind }];
          }
        }
      }
    }
  });

  assert.equal(response.body.kind, 'single');
  assert.deepEqual(requestedKinds.sort(), ['adjective', 'catalog_value']);
  assert.deepEqual(JSON.parse(JSON.stringify(response.body.singleResult.data)), {
    messageTemplates: [{
      id: '1',
      key: 'SUBJECT_ADJECTIVE',
      format: '{subject}? {adjective}!',
      slots: [
        {
          id: '10',
          key: 'subject',
          position: 0,
          prompt: 'Player, team, or catalog entry',
          valueTypes: ['CATALOG_VALUE', 'LEAGUE_MEMBER']
        },
        {
          id: '11',
          key: 'adjective',
          position: 1,
          prompt: 'Adjective',
          valueTypes: ['ADJECTIVE']
        }
      ]
    }],
    catalog: [{ id: '2', key: 'CHAOS', text: 'chaos', kind: 'CATALOG_VALUE' }],
    adjectives: [{ id: '3', key: 'INCREDIBLE', text: 'incredible', kind: 'ADJECTIVE' }]
  });
});

test('submitMessage validates and stores typed selections while returning structured content', async (t) => {
  const originalSeason = process.env.CURRENT_SEASON;
  process.env.CURRENT_SEASON = '2026';
  t.after(() => { process.env.CURRENT_SEASON = originalSeason; });
  const server = new ApolloServer({ typeDefs, resolvers });
  t.after(() => server.stop());
  let stored;
  const response = await server.executeOperation({
    query: `mutation SubmitMessage($request: SubmitMessageRequest!, $leagueID: ID!) {
      submitMessage(request: $request) {
        message {
          id
          week
          createdAt
          author { id displayName(leagueID: $leagueID) }
          template { id key format }
          selections {
            slot { id key position }
            value {
              __typename
              ... on MessageValue { id key text kind }
              ... on User { id displayName(leagueID: $leagueID) }
            }
          }
        }
        errors { code message }
      }
    }`,
    variables: {
      leagueID: '2',
      request: {
        userID: '1',
        leagueID: '2',
        week: 4,
        templateID: '7',
        selections: [
          { slotID: '70', valueType: 'ADJECTIVE', valueID: '8' },
          { slotID: '71', valueType: 'LEAGUE_MEMBER', valueID: '3' }
        ]
      }
    }
  }, {
    contextValue: {
      dataSources: {
        pg: {
          getLeagueById: async () => ({ id: 2, season: '2026', current_week: 4, sports_league: 'NFL' }),
          getMembership: async userID => userID === 1
            ? { id: 11, user_id: 1, league_id: 2, display_name: 'Author' }
            : { id: 13, user_id: 3, league_id: 2, display_name: 'Rival' },
          getUserById: async userID => ({ id: userID, email: `${userID}@example.com` }),
          getMessageTemplateById: async () => [
            {
              template_id: 7,
              template_key: 'ADJECTIVE_PICK',
              template_format: '{adjective} pick, {player}!',
              slot_id: 70,
              slot_key: 'adjective',
              slot_position: 0,
              slot_prompt: 'Adjective',
              slot_value_type: 'adjective'
            },
            {
              template_id: 7,
              template_key: 'ADJECTIVE_PICK',
              template_format: '{adjective} pick, {player}!',
              slot_id: 71,
              slot_key: 'player',
              slot_position: 1,
              slot_prompt: 'Player',
              slot_value_type: 'league_member'
            }
          ],
          getMessageValueById: async () => ({ id: 8, key: 'INCREDIBLE', text: 'incredible', kind: 'adjective' }),
          submitMessage: async (message, selections) => {
            stored = { message, selections };
            return { id: 20, week: 4, created_at: '2026-09-20T12:00:00.000Z' };
          }
        }
      }
    }
  });

  assert.equal(response.body.kind, 'single');
  assert.deepEqual(stored, {
    message: {
      leagueID: 2,
      week: 4,
      authorMembershipID: 11,
      templateID: 7,
      renderedText: 'incredible pick, Rival!'
    },
    selections: [
      { templateSlotID: 70, messageValueID: 8, leagueMembershipID: undefined, teamID: undefined },
      { templateSlotID: 71, messageValueID: undefined, leagueMembershipID: 13, teamID: undefined }
    ]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(response.body.singleResult.data.submitMessage)), {
    message: {
      id: '20',
      week: 4,
      createdAt: '2026-09-20T12:00:00.000Z',
      author: { id: '1', displayName: 'Author' },
      template: { id: '7', key: 'ADJECTIVE_PICK', format: '{adjective} pick, {player}!' },
      selections: [
        {
          slot: { id: '70', key: 'adjective', position: 0 },
          value: { __typename: 'MessageValue', id: '8', key: 'INCREDIBLE', text: 'incredible', kind: 'ADJECTIVE' }
        },
        {
          slot: { id: '71', key: 'player', position: 1 },
          value: { __typename: 'User', id: '3', displayName: 'Rival' }
        }
      ]
    },
    errors: []
  });
});

test('league messages are readable regardless of revealed week and expose current templates with selections', async () => {
  const originalSeason = process.env.CURRENT_SEASON;
  process.env.CURRENT_SEASON = '2026';
  let requestedVisibility;
  const messages = await resolvers.FantasyLeague.messages({
    id: 2,
    season: '2026',
    revealedWeek: 0
  }, { week: 3 }, {
    dataSources: {
      pg: {
        getLeagueMessages: async (leagueID, week) => {
          requestedVisibility = { leagueID, week };
          return [{
            message_id: 9,
            league_id: 2,
            week: 3,
            template_id: 4,
            created_at: '2026-09-10T12:00:00.000Z',
            author_user_id: 1,
            author_display_name: 'Author',
            author_email: 'author@example.com'
          }];
        },
        getMessageSelections: async () => [{
          message_id: 9,
          template_slot_id: 40,
          message_value_id: 12,
          message_value_key: 'CHAOS',
          message_value_kind: 'catalog_value',
          message_value_text: 'chaos',
          league_membership_id: null,
          team_id: null
        }],
        getMessageTemplatesByIds: async () => [{
          template_id: 4,
          template_key: 'BEHOLD',
          template_format: 'Behold, {subject}!',
          slot_id: 40,
          slot_key: 'subject',
          slot_position: 0,
          slot_prompt: 'Player, team, or outcome',
          slot_value_type: 'catalog_value'
        }]
      }
    }
  });
  process.env.CURRENT_SEASON = originalSeason;

  assert.deepEqual(requestedVisibility, { leagueID: 2, week: 3 });
  assert.equal(messages[0].template.format, 'Behold, {subject}!');
  assert.equal(messages[0].selections[0].value.text, 'chaos');
});
