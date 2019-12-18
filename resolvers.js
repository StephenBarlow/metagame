const { connectionPool } = require('./connection-pool')

let resolvers = {
  Query: {
    sportsGames(parent, args, context, info) {
      (async () => {
        const client = await connectionPool.connect();
        try {
          const res = await client.query('SELECT * FROM users WHERE id = $1', [1]);
          console.log(res.rows[0]);
        } finally {
          client.release();
        }
      })().catch(err => console.log(err.stack))
    }
  },
  Mutation: {
    createFantasyLeague(parent, args, context, info) {
      (async () => {
        const client = await connectionPool.connect();
        try {
          const { ownerID, name, gameMode } = args.request;
          const res = await client.query('INSERT INTO "fantasy_leagues"(owner_id, name, game_mode) VALUES ($1, $2, $3)', [ownerID, name, gameMode]);
        } finally {
          client.release();
        }
      })().catch(err => console.log(err.stack))
    }
  }
};

exports.resolvers = resolvers;
