require('dotenv').config()

const { ApolloServer } = require('apollo-server');
const { connectionPool } = require('./connection-pool')
const { typeDefs } = require('./schema')
const { resolvers } = require('./resolvers');

const server = new ApolloServer({
  typeDefs,
  resolvers,
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

server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});
