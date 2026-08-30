const crypto = require('crypto');
const knex = require('knex');

const HOUR = 3600;
const MINUTE = 60;
const NOTHING = 1;
const MAX_WEEK = 19;

class PGDB {
  constructor(knexConfig, cache) {
    this.cache = cache;
    this.db = knex(process.env.DEBUG
      ? { ...knexConfig, debug: true }
      : knexConfig);
    this.knex = this.db;
  }

  cacheKeyFor(query) {
    return crypto
      .createHash('sha1')
      .update(query.toString())
      .digest('base64');
  }

  async invalidateQueries(queries) {
    const keys = new Set(queries.map(query => this.cacheKeyFor(query)));
    await Promise.all([...keys].map(key => this.cache.delete(key)));
  }

  async cacheQuery(query, ttl = 5) {
    const cacheKey = this.cacheKeyFor(query);
    const entry = await this.cache.get(cacheKey);

    if (entry) {
      return JSON.parse(entry);
    }

    const rows = await query;
    if (rows) {
      await this.cache.set(cacheKey, JSON.stringify(rows), { ttl });
    }

    return rows;
  }

  picksForLeagueQuery(leagueID, leagueConcluded = false, revealedWeek = parseInt(process.env.REVEALED_WEEK)) {
    return this.knex
      .select('*')
      .from('picks')
      .where({
        'league_id': leagueID,
        'invalidated_at': null
      })
      .whereRaw('week <= ?', (leagueConcluded ? [MAX_WEEK] : [revealedWeek]));
  }

  currentPickQuery(leagueID, userID, week) {
    return this.knex
      .select('*')
      .from('picks')
      .where({
        'user_id': userID,
        'league_id': leagueID,
        'week': week,
        'invalidated_at': null
      });
  }

  picksForMemberQuery(userID, leagueID) {
    return this.knex
      .select('*')
      .from('picks')
      .where({
        'user_id': userID,
        'league_id': leagueID,
        'invalidated_at': null
      });
  }

  sportsGamesQuery(season) {
    return this.knex
      .select('*')
      .from('sports_games')
      .where({
        'season': season
      });
  }

  sportsGamesForWeekQuery(season, week) {
    return this.knex
      .select('*')
      .from('sports_games')
      .where({
        'season': season,
        'week': week
      });
  }

  userByEmailQuery(email) {
    return this.knex
      .select('*')
      .from('users')
      .where({
        'email': email
      })
      .limit(1);
  }

  userByIdQuery(id) {
    return this.knex
      .select('*')
      .from('users')
      .where({ id })
      .limit(1);
  }

  userDisplayNameForLeagueQuery(userID, leagueID) {
    return this.knex
      .select('display_name')
      .from('memberships')
      .innerJoin('fantasy_leagues', 'fantasy_leagues.id', 'memberships.league_id')
      .where({
        'memberships.user_id': userID,
        'fantasy_leagues.id': leagueID
      })
      .limit(1);
  }

  membershipQuery(userID, leagueID) {
    return this.knex
      .select('*')
      .from('memberships')
      .where({
        user_id: userID,
        league_id: leagueID,
        revoked_at: null
      })
      .limit(1);
  }

  allLeaguesQuery() {
    return this.knex
      .select('*')
      .from('fantasy_leagues');
  }

  leaguesForUserQuery(userID) {
    return this.knex
      .select('*')
      .from('fantasy_leagues')
      .innerJoin('memberships', 'fantasy_leagues.id', 'memberships.league_id')
      .where({
        'memberships.user_id': userID
      });
  }

  leagueByIdQuery(leagueID) {
    return this.knex
      .select('*')
      .from('fantasy_leagues')
      .where({
        'id': leagueID
      });
  }

  leagueMembersQuery(leagueID) {
    return this.knex
      .select('*')
      .from('users')
      .innerJoin('memberships', 'users.id', 'memberships.user_id')
      .where({
        'memberships.league_id': leagueID
      });
  }

  achievementAwardsForLeagueQuery(leagueID) {
    return this.knex('achievement_awards')
      .select([
        'achievement_awards.id as award_id',
        'achievement_awards.league_id',
        'achievement_awards.user_id',
        'achievement_awards.week',
        'achievement_awards.awarded_at',
        'achievements.id as achievement_id',
        'achievements.key as achievement_key',
        'achievements.name as achievement_name',
        'achievements.description as achievement_description',
        'achievements.icon_id as achievement_icon_id'
      ])
      .innerJoin('achievements', 'achievements.id', 'achievement_awards.achievement_id')
      .where('achievement_awards.league_id', leagueID)
      .orderBy('achievement_awards.week', 'desc')
      .orderBy('achievement_awards.awarded_at', 'desc')
      .orderBy('achievement_awards.id', 'desc');
  }

  messageTemplatesQuery(templateIDs, activeOnly = true) {
    const query = this.knex('message_templates as templates')
      .select([
        'templates.id as template_id',
        'templates.key as template_key',
        'templates.format as template_format',
        'templates.active as template_active',
        'slots.id as slot_id',
        'slots.key as slot_key',
        'slots.position as slot_position',
        'slots.prompt as slot_prompt',
        'slot_types.value_type as slot_value_type'
      ])
      .leftJoin('message_template_slots as slots', 'slots.template_id', 'templates.id')
      .leftJoin('message_template_slot_value_types as slot_types', 'slot_types.template_slot_id', 'slots.id')
      .orderBy('templates.id')
      .orderBy('slots.position')
      .orderBy('slot_types.value_type');

    if (activeOnly) query.where('templates.active', true);
    if (templateIDs) query.whereIn('templates.id', templateIDs);
    return query;
  }

  messageValuesQuery(kind) {
    const query = this.knex('message_values')
      .select('*')
      .where({ active: true })
      .orderBy('text');
    if (kind) query.where('kind', kind);
    return query;
  }

  messageValueByIdQuery(messageValueID) {
    return this.knex('message_values')
      .select('*')
      .where({ id: messageValueID, active: true })
      .limit(1);
  }

  leagueMessagesQuery(leagueID, week) {
    const query = this.knex('messages')
      .select([
        'messages.id as message_id',
        'messages.league_id',
        'messages.week',
        'messages.template_id',
        'messages.author_membership_id',
        'messages.created_at',
        'authors.user_id as author_user_id',
        'authors.display_name as author_display_name',
        'users.email as author_email',
        'users.limited as author_limited'
      ])
      .innerJoin('memberships as authors', 'authors.id', 'messages.author_membership_id')
      .innerJoin('users', 'users.id', 'authors.user_id')
      .where({
        'messages.league_id': leagueID,
        'messages.invalidated_at': null
      })
      .orderBy('messages.created_at', 'desc')
      .orderBy('messages.id', 'desc');

    if (week !== null && week !== undefined) query.where('messages.week', week);
    return query;
  }

  messageSelectionsQuery(messageIDs) {
    return this.knex('message_selections as selections')
      .select([
        'selections.id as selection_id',
        'selections.message_id',
        'selections.template_slot_id',
        'selections.message_value_id',
        'selections.league_membership_id',
        'selections.team_id',
        'slots.position as slot_position',
        'values.key as message_value_key',
        'values.kind as message_value_kind',
        'values.text as message_value_text',
        'selected_members.user_id as selected_user_id',
        'selected_members.league_id as selected_user_league_id',
        'selected_members.display_name as selected_user_display_name',
        'selected_users.email as selected_user_email',
        'teams.name as team_name',
        'teams.short_name as team_short_name',
        'teams.sports_league as team_sports_league'
      ])
      .innerJoin('message_template_slots as slots', 'slots.id', 'selections.template_slot_id')
      .leftJoin('message_values as values', 'values.id', 'selections.message_value_id')
      .leftJoin('memberships as selected_members', 'selected_members.id', 'selections.league_membership_id')
      .leftJoin('users as selected_users', 'selected_users.id', 'selected_members.user_id')
      .leftJoin('teams', 'teams.id', 'selections.team_id')
      .whereIn('selections.message_id', messageIDs)
      .orderBy('selections.message_id')
      .orderBy('slots.position');
  }

  leagueOwnerQuery(leagueID, ownerID) {
    return this.knex
      .select('*')
      .from('users')
      .innerJoin('memberships', 'users.id', 'memberships.user_id')
      .where({
        'memberships.league_id': leagueID,
        'users.id': ownerID
      })
      .limit(1);
  }

  async invalidatePickCache(picks) {
    const leagueIDs = new Set();
    const members = new Map();
    const currentPicks = new Map();

    for (const pick of picks) {
      leagueIDs.add(pick.league_id);
      members.set(`${pick.user_id}:${pick.league_id}`, pick);
      currentPicks.set(`${pick.user_id}:${pick.league_id}:${pick.week}`, pick);
    }

    const queries = [];
    const leagueSettings = await this.knex('fantasy_leagues')
      .select(['id', 'revealed_week'])
      .whereIn('id', [...leagueIDs]);
    const revealedWeeks = new Map(leagueSettings.map(league => [league.id, league.revealed_week]));
    for (const leagueID of leagueIDs) {
      queries.push(this.picksForLeagueQuery(leagueID, false, revealedWeeks.get(leagueID) ?? parseInt(process.env.REVEALED_WEEK)));
      queries.push(this.picksForLeagueQuery(leagueID, true));
    }
    for (const { user_id: userID, league_id: leagueID } of members.values()) {
      queries.push(this.picksForMemberQuery(userID, leagueID));
    }
    for (const { user_id: userID, league_id: leagueID, week } of currentPicks.values()) {
      queries.push(this.currentPickQuery(leagueID, userID, week));
    }

    await this.invalidateQueries(queries);
  }

  async invalidateSportsGameCache(games) {
    const queries = [];

    for (const game of games) {
      if (!game) continue;
      const seasons = new Set([game.season, String(game.season), Number(game.season)]);
      const weeks = new Set([game.week, String(game.week), Number(game.week)]);
      for (const season of seasons) {
        queries.push(this.sportsGamesQuery(season));
        for (const week of weeks) {
          queries.push(this.sportsGamesForWeekQuery(season, week));
        }
      }
    }

    await this.invalidateQueries(queries);
  }

  async invalidateUserCache(email, userID) {
    const queries = [this.userByEmailQuery(email)];
    if (userID) {
      queries.push(this.userByIdQuery(userID));
      const memberships = await this.knex('memberships')
        .select('league_id')
        .where({ user_id: userID });
      for (const membership of memberships) {
        queries.push(this.leagueMembersQuery(membership.league_id));
      }
    }
    await this.invalidateQueries(queries);
  }

  async invalidateLeagueCache(leagueID) {
    await this.invalidateQueries([
      this.allLeaguesQuery(),
      this.leagueByIdQuery(leagueID)
    ]);
  }

  async invalidateLeaguePicksCache(leagueID) {
    const league = await this.knex('fantasy_leagues')
      .select(['revealed_week'])
      .where({ id: leagueID })
      .first();
    await this.invalidateQueries([
      this.picksForLeagueQuery(leagueID, false, league?.revealed_week ?? parseInt(process.env.REVEALED_WEEK)),
      this.picksForLeagueQuery(leagueID, true)
    ]);
  }

  async invalidateMembershipCache(userID, leagueID, ownerID) {
    const queries = [
      this.leagueMembersQuery(leagueID),
      this.leaguesForUserQuery(userID),
      this.userDisplayNameForLeagueQuery(userID, leagueID),
      this.membershipQuery(userID, leagueID)
    ];
    if (String(userID) === String(ownerID)) {
      queries.push(this.leagueOwnerQuery(leagueID, ownerID));
    }
    await this.invalidateQueries(queries);
  }

  async getTeams() {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('teams'),
      HOUR
    );
    return val;
  }

  async getSportsGames(season) {
    const val = await this.cacheQuery(
      this.sportsGamesQuery(season),
      MINUTE
    );
    return val;
  }

  async getSportsGamesForWeek(season, week) {
    const val = await this.cacheQuery(
      this.sportsGamesForWeekQuery(season, week),
      MINUTE
    );
    return val;
  }

  async getUserByEmail(email) {
    const val = await this.cacheQuery(
      this.userByEmailQuery(email),
      HOUR
    );
    if (val.length) {
      return val[0];
    }
  }

  async getUserById(id) {
    const val = await this.cacheQuery(
      this.userByIdQuery(id),
      HOUR
    );
    if (val.length) {
      return val[0];
    }
  }

  async getUserDisplayNameForLeague(userID, leagueID) {
    const val = await this.cacheQuery(
      this.userDisplayNameForLeagueQuery(userID, leagueID),
      MINUTE
    );
    if (val.length) {
      return val[0];
    }
  }

  async getMembership(userID, leagueID) {
    const val = await this.cacheQuery(
      this.membershipQuery(userID, leagueID),
      MINUTE
    );
    if (val.length) return val[0];
  }

  async setMembershipFavoriteTeam(userID, leagueID, teamID, ownerID) {
    const updated = await this.knex('memberships')
      .where({ user_id: userID, league_id: leagueID, revoked_at: null })
      .whereNull('favorite_team_id')
      .update({ favorite_team_id: teamID })
      .returning('*');
    if (!updated.length) return null;
    await this.invalidateMembershipCache(userID, leagueID, ownerID);
    return updated[0];
  }

  async getAllLeagues() {
    const val = await this.cacheQuery(
      this.allLeaguesQuery(),
      MINUTE
    );
    return val;
  }

  async getLeaguesForUser(userID) {
    const val = await this.cacheQuery(
      this.leaguesForUserQuery(userID),
      MINUTE
    );
    return val;
  }

  async getLeagueById(leagueID) {
    const val = await this.cacheQuery(
      this.leagueByIdQuery(leagueID),
      MINUTE
    );
    if (val.length) {
      return val[0];
    }
  }

  async getTeam(shortName, league) {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('teams')
        .where({
          short_name: shortName,
          sports_league: league
        })
        .limit(1),
      HOUR
    );
    if (val.length) {
      return val[0];
    }
  }

  async getTeamById(teamID) {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('teams')
        .where({
          id: teamID
        })
        .limit(1),
      HOUR
    );
    if (val.length) {
      return val[0];
    }
  }

  async getLeagueOwner(leagueId, ownerId) {
    const val = await this.cacheQuery(
      this.leagueOwnerQuery(leagueId, ownerId),
      MINUTE
    );
    if (val.length) {
      return val[0];
    }
  }

  async getLeagueMembers(leagueID) {
    const val = await this.cacheQuery(
      this.leagueMembersQuery(leagueID),
      MINUTE
    );
    return val;
  }

  async getAchievementAwardsForLeague(leagueID) {
    // Award rows are written by the one-off evaluator outside this process, so
    // deliberately do not cache this query here.
    return this.achievementAwardsForLeagueQuery(leagueID);
  }

  async getMessageTemplates() {
    return this.cacheQuery(this.messageTemplatesQuery(null, true), MINUTE);
  }

  async getMessageTemplateById(templateID) {
    return this.messageTemplatesQuery([templateID], true);
  }

  async invalidateMessageTemplateCache() {
    await this.invalidateQueries([this.messageTemplatesQuery(null, true)]);
  }

  async invalidateMessageValueCache(messageValueID) {
    const queries = [
      this.messageValuesQuery(),
      this.messageValuesQuery('catalog_value'),
      this.messageValuesQuery('adjective')
    ];
    if (messageValueID) queries.push(this.messageValueByIdQuery(messageValueID));
    await this.invalidateQueries(queries);
  }

  async getMessageTemplatesByIds(templateIDs) {
    if (!templateIDs.length) return [];
    return this.messageTemplatesQuery(templateIDs, false);
  }

  async getMessageValues(kind) {
    return this.cacheQuery(this.messageValuesQuery(kind), MINUTE);
  }

  async getMessageValueById(messageValueID) {
    const rows = await this.cacheQuery(
      this.messageValueByIdQuery(messageValueID),
      MINUTE
    );
    return rows[0];
  }

  async getLeagueMessages(leagueID, week) {
    return this.leagueMessagesQuery(leagueID, week);
  }

  async getMessageSelections(messageIDs) {
    if (!messageIDs.length) return [];
    return this.messageSelectionsQuery(messageIDs);
  }

  async getPicksForLeague(leagueID, leagueConcluded = false, revealedWeek) {
    const val = await this.cacheQuery(
      this.picksForLeagueQuery(leagueID, leagueConcluded, revealedWeek),
      MINUTE
    );
    return val;
  }

  async getCurrentPick(leagueID, userID, week) {
    const val = await this.cacheQuery(
      this.currentPickQuery(leagueID, userID, week),
      NOTHING
    );
    return val;
  }

  async getPicksForMember(userID, leagueID) {
    const val = await this.cacheQuery(
      this.picksForMemberQuery(userID, leagueID),
      NOTHING
    );
    return val;
  }

  async submitPicks(userID, leagueID, teamIDs, week) {
    let responseRows = [];
    const knex = this.knex;

    // DB transaction
    await knex.transaction(async function(trx) {
      // First, invalidate any previous picks
      // for the current week
      await knex('picks')
        .where({
          'invalidated_at': null,
          'week': week,
          'user_id': userID,
          'league_id': leagueID
        })
        .update({
          'invalidated_at': trx.raw('CURRENT_TIMESTAMP')
        })
        .transacting(trx);

      // Then, insert the new picks
      for (const teamID of teamIDs) {
        const result =  await knex('picks')
          .insert({
            'league_id': leagueID,
            'user_id': userID,
            'team_id': teamID,
            'week': week
          })
          .transacting(trx)
          .returning('*');
        responseRows.push(result[0]);
      }
    })

    await this.invalidatePickCache(responseRows);
    return responseRows;
  }

  async submitMessage(message, selections) {
    return this.knex.transaction(async trx => {
      const insertedMessages = await trx('messages')
        .insert({
          league_id: message.leagueID,
          week: message.week,
          author_membership_id: message.authorMembershipID,
          template_id: message.templateID,
          rendered_text: message.renderedText
        })
        .returning('*');
      const insertedMessage = insertedMessages[0];

      await trx('message_selections').insert(selections.map(selection => ({
        message_id: insertedMessage.id,
        template_slot_id: selection.templateSlotID,
        message_value_id: selection.messageValueID ?? null,
        league_membership_id: selection.leagueMembershipID ?? null,
        team_id: selection.teamID ?? null
      })));

      return insertedMessage;
    });
  }

  async invalidateMessages(messageIDs) {
    return this.knex('messages')
      .whereIn('id', messageIDs)
      .whereNull('invalidated_at')
      .update({
        invalidated_at: this.knex.raw('CURRENT_TIMESTAMP')
      })
      .returning(['id']);
  }

  async invalidatePicks(pickIDs) {
    const knex = this.knex;
    const invalidatedPicks = await knex('picks')
      .whereIn('id', pickIDs)
      .update({
        'invalidated_at': knex.raw('CURRENT_TIMESTAMP')
      })
      .returning(['league_id', 'user_id', 'week']);

    await this.invalidatePickCache(invalidatedPicks);
  }
}

exports.PGDB = PGDB;
