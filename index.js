require('dotenv').config()

const { ApolloServer } = require('apollo-server');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault
} = require ('apollo-server-core');
const { connectionPool, DataSource } = require('./connection-pool');
const { typeDefs } = require('./schema');
const { resolvers } = require('./resolvers');


const PORT = process.env.PORT || 4000;

let knexConfig = {
  client: "pg",
  version: "13.3"
};

if (process.env.DATABASE_URL) {
  knexConfig.connection = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  };
} else {
  knexConfig.connection = {
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT,
    password: ''
  }
}

const pg = new DataSource(knexConfig);

const server = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers }),
  dataSources: () => ({ pg }),
  plugins: [
    process.env.NODE_ENV === "production"
      ? ApolloServerPluginLandingPageProductionDefault({
          footer: false,
        })
      : ApolloServerPluginLandingPageLocalDefault({ embed: true })
  ],
  cache: "bounded"
});

server.listen({
  port: PORT
}).then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});
