require('dotenv').config()

const { ApolloServer } = require('apollo-server');
const { connectionPool } = require('./connection-pool')
const { typeDefs } = require('./schema')
const { resolvers } = require('./resolvers');

const PORT = process.env.PORT || 4000;

const server = new ApolloServer({
  typeDefs,
  resolvers,
  engine: {
    reportSchema: true,
    variant: 'current'
  },
  context: async () => ({
    db: await connectionPool.connect()
  }),
  plugins: [
    {
      serverWillStart() {
        console.log('Server starting up');
      },
      requestDidStart() {
        console.log('Operation received');

        return {

          // Close the database connection when all resolvers are done
          willSendResponse({ context }) {
            context.db.release();
          }
        }
      }
    }
  ]
});

server.listen({
  port: PORT
}).then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});
