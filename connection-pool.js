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

  async getUser(email) {
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

  async getLeagues(userEmail) {
    const val = await this.knex
      .select('*')
      .from('fantasy_leagues')
      .cache(MINUTE);
    return val;
  }

  async getLeague(leagueID) {
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
}

exports.DataSource = PGDB;
