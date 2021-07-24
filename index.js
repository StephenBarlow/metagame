require('dotenv').config()

const { ApolloServer } = require('apollo-server');
const { connectionPool, DataSource } = require('./connection-pool')
const { typeDefs } = require('./schema')
const { resolvers } = require('./resolvers');

const PORT = process.env.PORT || 4000;

let databaseURL = null;
if (process.env.DATABASE_URL) {
  databaseURL = new URL(process.env.DATABASE_URL);
}

let knexConfig = {
  client: "pg",
  version: "13.3"
};

if (databaseURL) {
  knexConfig.connection = {
    user: databaseURL.username,
    host: databaseURL.hostname,
    database: databaseURL.pathname.split('/')[1],
    password: databaseURL.password,
    port: databaseURL.port,
  };
} else {
  knexConfig.connection = {
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT,
    password: ''
  }
  console.log(knexConfig);
}

const pg = new DataSource(knexConfig);

const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: () => ({ pg }),
  plugins: [
    {
      serverWillStart() {
        console.log('Server starting up');
      },
      requestDidStart() {
        console.log('Operation received');
      }
    }
  ]
});

server.listen({
  port: PORT
}).then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});
