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

  picksForLeagueQuery(leagueID, leagueConcluded = false) {
    return this.knex
      .select('*')
      .from('picks')
      .where({
        'league_id': leagueID,
        'invalidated_at': null
      })
      .whereRaw('week <= ?', (leagueConcluded ? [MAX_WEEK] : [parseInt(process.env.REVEALED_WEEK)] ));
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
    for (const leagueID of leagueIDs) {
      queries.push(this.picksForLeagueQuery(leagueID));
      queries.push(this.picksForLeagueQuery(leagueID, true));
    }
    for (const { user_id: userID, league_id: leagueID } of members.values()) {
      queries.push(this.picksForMemberQuery(userID, leagueID));
    }
    for (const { user_id: userID, league_id: leagueID, week } of currentPicks.values()) {
      queries.push(this.currentPickQuery(leagueID, userID, week));
    }

    await Promise.all(queries.map(query => this.cache.delete(this.cacheKeyFor(query))));
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
      this.knex
        .select('*')
        .from('sports_games')
        .where({
          'season': season
        }),
      MINUTE
    );
    return val;
  }

  async getSportsGamesForWeek(season, week) {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('sports_games')
        .where({
          'season': season,
          'week': week
        }),
      MINUTE
    );
    return val;
  }

  async getUserByEmail(email) {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('users')
        .where({
          'email': email
        })
        .limit(1),
      HOUR
    );
    if (val.length) {
      return val[0];
    }
  }

  async getUserById(id) {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('users')
        .where({
          'id': id
        })
        .limit(1),
      HOUR
    );
    if (val.length) {
      return val[0];
    }
  }

  async getUserDisplayNameForLeague(userID, leagueID) {
    const val = await this.cacheQuery(
      this.knex
        .select('display_name')
        .from('memberships')
        .innerJoin('fantasy_leagues', 'fantasy_leagues.id', 'memberships.league_id')
        .where({
          'memberships.user_id': userID,
          'fantasy_leagues.id': leagueID
        })
        .limit(1),
      MINUTE
    );
    if (val.length) {
      return val[0];
    }
  }

  async getAllLeagues() {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('fantasy_leagues'),
      MINUTE
    );
    return val;
  }

  async getLeaguesForUser(userID) {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('fantasy_leagues')
        .innerJoin('memberships', 'fantasy_leagues.id', 'memberships.league_id')
        .where({
          'memberships.user_id': userID
        }),
      MINUTE
    );
    return val;
  }

  async getLeagueById(leagueID) {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('fantasy_leagues')
        .where({
          'id': leagueID
        }),
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
      this.knex
        .select('*')
        .from('users')
        .innerJoin('memberships', 'users.id', 'memberships.user_id')
        .where({
          'memberships.league_id': leagueId,
          'users.id': ownerId
        })
        .limit(1),
      MINUTE
    );
    if (val.length) {
      return val[0];
    }
  }

  async getLeagueMembers(leagueID) {
    const val = await this.cacheQuery(
      this.knex
        .select('*')
        .from('users')
        .innerJoin('memberships', 'users.id', 'memberships.user_id')
        .where({
          'memberships.league_id': leagueID
        }),
      MINUTE
    );
    return val;
  }

  async getPicksForLeague(leagueID, leagueConcluded = false) {
    const val = await this.cacheQuery(
      this.picksForLeagueQuery(leagueID, leagueConcluded),
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
