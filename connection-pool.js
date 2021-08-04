const { URL } = require('url');
const { SQLDataSource } = require('datasource-sql');

const HOUR = 3600;
const MINUTE = 60;

class PGDB extends SQLDataSource {
  async getTeams() {
    const val = await this.knex
      .select('*')
      .from('teams')
      .cache(HOUR);
    return val;
  }

  async getSportsGames() {
    const val = await this.knex
      .select('*')
      .from('sports_games')
      .cache(HOUR);
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
      .cache(MINUTE);
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
      .cache(MINUTE);
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
      .cache(HOUR);
    if (val.length) {
      return val[0];
    }
  }

  async getTeam(shortName, league) {
    const val = await this.knex
      .select('*')
      .from('sports_teams')
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
      .from('sports_teams')
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

  async getPicksForLeague(leagueID) {
    const val = await this.knex
      .select('*')
      .from('picks')
      .where({
        'league_id': leagueID
      })
      .cache(MINUTE);
    return val;
  }


}

exports.DataSource = PGDB;
