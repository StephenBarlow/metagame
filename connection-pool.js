const { URL } = require('url');
const { SQLDataSource } = require('datasource-sql');

const HOUR = 3600;
const MINUTE = 60;
const NOTHING = 1;
const MAX_WEEK = 19;

class PGDB extends SQLDataSource {
  async getTeams() {
    const val = await this.knex
      .select('*')
      .from('teams')
      .cache(HOUR);
    return val;
  }

  async getSportsGames(season) {
    const val = await this.knex
      .select('*')
      .from('sports_games')
      .where({
        'season': season
      })
      .cache(MINUTE);
    return val;
  }

  async getSportsGamesForWeek(season, week) {
    const val = await this.knex
      .select('*')
      .from('sports_games')
      .where({
        'season': season,
        'week': week
      })
      .cache(MINUTE);
    return val;
  }

  async getUserByEmail(email) {
    const val = await this.knex
      .select('*')
      .from('users')
      .where({
        'email': email
      })
      .limit(1)
      .cache(HOUR);
    if (val.length) {
      return val[0];
    }
  }

  async getUserById(id) {
    const val = await this.knex
      .select('*')
      .from('users')
      .where({
        'id': id
      })
      .limit(1)
      .cache(HOUR);
    if (val.length) {
      return val[0];
    }
  }

  async getUserDisplayNameForLeague(userID, leagueID) {
    const val = await this.knex
      .select('display_name')
      .from('memberships')
      .innerJoin('fantasy_leagues', 'fantasy_leagues.id', 'memberships.league_id')
      .where({
        'memberships.user_id': userID,
        'fantasy_leagues.id': leagueID
      })
      .limit(1)
      .cache(MINUTE);
    if (val.length) {
      return val[0];
    }
  }

  async getAllLeagues() {
    const val = await this.knex
      .select('*')
      .from('fantasy_leagues')
      .cache(MINUTE);
    return val;
  }

  async getLeaguesForUser(userID) {
    const val = await this.knex
      .select('*')
      .from('fantasy_leagues')
      .innerJoin('memberships', 'fantasy_leagues.id', 'memberships.league_id')
      .where({
        'memberships.user_id': userID
      })
      .cache(MINUTE);
    return val;
  }

  async getLeagueById(leagueID) {
    const val = await this.knex
      .select('*')
      .from('fantasy_leagues')
      .where({
        'id': leagueID
      })
      .cache(MINUTE);
    if (val.length) {
      return val[0];
    }
  }

  async getTeam(shortName, league) {
    const val = await this.knex
      .select('*')
      .from('teams')
      .where({
        short_name: shortName,
        sports_league: league
      })
      .limit(1)
      .cache(HOUR);
    if (val.length) {
      return val[0];
    }
  }

  async getTeamById(teamID) {
    const val = await this.knex
      .select('*')
      .from('teams')
      .where({
        id: teamID
      })
      .limit(1)
      .cache(HOUR);
    if (val.length) {
      return val[0];
    }
  }

  async getLeagueOwner(leagueId, ownerId) {
    const val = await this.knex
      .select('*')
      .from('users')
      .innerJoin('memberships', 'users.id', 'memberships.user_id')
      .where({
        'memberships.league_id': leagueId,
        'users.id': ownerId
      })
      .limit(1)
      .cache(MINUTE);
    if (val.length) {
      return val[0];
    }
  }

  async getLeagueMembers(leagueID) {
    const val = await this.knex
      .select('*')
      .from('users')
      .innerJoin('memberships', 'users.id', 'memberships.user_id')
      .where({
        'memberships.league_id': leagueID
      })
      .cache(MINUTE);
    return val;
  }

  async getPicksForLeague(leagueID, leagueConcluded = false) {
    const val = await this.knex
      .select('*')
      .from('picks')
      .where({
        'league_id': leagueID,
        'invalidated_at': null
      })
      .whereRaw('week <= ?', (leagueConcluded ? [MAX_WEEK] : [parseInt(process.env.REVEALED_WEEK)] ))
      .cache(MINUTE);
    return val;
  }

  async getCurrentPick(leagueID, userID, week) {
    const val = await this.knex
      .select('*')
      .from('picks')
      .where({
        'user_id': userID,
        'league_id': leagueID,
        'week': week,
        'invalidated_at': null
      })
      .cache(NOTHING);
    return val;
  }

  async getPicksForMember(userID, leagueID) {
    const val = await this.knex
      .select('*')
      .from('picks')
      .where({
        'user_id': userID,
        'league_id': leagueID,
        'invalidated_at': null
      })
      .cache(MINUTE);
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

    return responseRows;
  }
}

exports.DataSource = PGDB;
