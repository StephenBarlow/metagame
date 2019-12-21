const { connectionPool } = require('./connection-pool')

const PG_UNIQUE_VIOLATION = '23505';
const GQL_UNKNOWN_ERROR = 'ERR_UNKNOWN'
const GQL_UNIQUE_VIOLATION = 'ERR_DUPLICATE';

let resolvers = {
  Query: {
    sportsGames(parent, args, context, info) {
      (async () => {
        const client = await connectionPool.connect();
        try {
          const res = await  client.query('SELECT * FROM users WHERE id = $1', [1]);
          console.log(res.rows[0]);
        } finally {
          client.release();
        }
      })().catch(err => console.log(err.stack))
    }
  },
  Mutation: {
    async createFantasyLeague(parent, args, context, info) {
      const client = await connectionPool.connect();
      try {
        await client.query('BEGIN');

        const { ownerID, name, gameMode } = args.request;
        const leagueResponse = await client.query('INSERT INTO "fantasy_leagues"(owner_id, name, game_mode) VALUES ($1, $2, $3) returning *', [ownerID, name, gameMode]);

        const createdLeague = leagueResponse.rows[0];

        const membershipResponse = await client.query('INSERT INTO memberships (user_id, league_id) VALUES ($1, $2) returning *', [ownerID, createdLeague.id]);

        await client.query('COMMIT');

        return {
          league: {
            id: createdLeague.id,
            name: createdLeague.name,
            owner: createdLeague.owner_id,
            members: [],
            gameMode: createdLeague.game_mode
          }
        };
      } catch(error) {
        console.log('uh ohhhh');
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    },

    async createUser(parent, args, context, info) {
      const client = await connectionPool.connect();
      try {
        const { email } = args.request;
        const res = await client.query('INSERT INTO "users"(email) VALUES ($1) returning *', [email]);

        const createdUser = res.rows[0];

        return {
          user: {
            id: createdUser.id,
            email: createdUser.email
          }
        };
      } catch (error) {
        let gqlError = {
          code: GQL_UNKNOWN_ERROR,
          message: 'An unkonwn error occurred'
        }

        const errorCode = error.code;

        if (errorCode == PG_UNIQUE_VIOLATION) {
          gqlError.code = GQL_UNIQUE_VIOLATION;
          gqlError.message = 'A user with that email address already exists.'
        }

        return {
          errors: [gqlError]
        };

      } finally {
        client.release();
      }
    },

    async addUserToFantasyLeague(parent, args, context, info) {
      const client = await connectionPool.connect();
      try {
        const { userID, leagueID } = args.request;

        const res = await client.query('INSERT INTO memberships(user_id, league_id) VALUES ($1, $2) returning *', [userID, leagueID]);

        const createdUser = res.rows[0];

        return {
          league: null
        };
      } catch (error) {
        let gqlError = {
          code: GQL_UNKNOWN_ERROR,
          message: 'An unkonwn error occurred'
        }

        const errorCode = error.code;

        // This currently can't happen because there is no uniqueness constraint
        // on this table included in existing migrations.
        if (errorCode == PG_UNIQUE_VIOLATION) {
          gqlError.code = GQL_UNIQUE_VIOLATION;
          gqlError.message = 'That user is already a member of the specified league.'
        }

        return {
          errors: [gqlError]
        };
      } finally {
        client.release();
      }
    }
  }
};

exports.resolvers = resolvers;
