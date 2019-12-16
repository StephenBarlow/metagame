const connectionPool = require('./connection-pool')

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
};

exports.resolvers = resolvers;
