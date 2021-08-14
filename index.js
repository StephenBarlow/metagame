require('dotenv').config()

const { ApolloServer } = require('apollo-server');
const { connectionPool, DataSource } = require('./connection-pool');
const { ApolloServerPluginLandingPageGraphQLPlayground } = require('apollo-server-core');
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
  typeDefs,
  resolvers,
  dataSources: () => ({ pg }),
  plugins: [
    {
      serverWillStart() {
        console.log('Server starting up');
      }
    },
    ApolloServerPluginLandingPageGraphQLPlayground({
      settings: {
        'some.setting': true,
        'general.betaUpdates': false,
        'editor.theme': 'dark',
        'editor.cursorShape': 'line',
        'editor.reuseHeaders': true,
        'tracing.hideTracingResponse': true,
        'queryPlan.hideQueryPlanResponse': true,
        'editor.fontSize': 18,
        'editor.fontFamily': `'Consolas', 'Inconsolata', 'Droid Sans Mono', 'Monaco', monospace`,
        'request.credentials': 'omit',
      }
    })
  ]
});

server.listen({
  port: PORT
}).then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});
