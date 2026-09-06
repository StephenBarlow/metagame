require('dotenv').config()

const http = require('http');
const cors = require('cors');
const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const { expressMiddleware } = require('@as-integrations/express5');
const {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault
} = require('@apollo/server/plugin/landingPage/default');
const { PGDB } = require('./connection-pool');
const { createAdminRouter } = require('./admin');
const { typeDefs } = require('./schema');
const { resolvers } = require('./resolvers');
const { createLoggingPlugin } = require('./logging-plugin');

const PORT = process.env.PORT || 4000;

let knexConfig = {
  client: "pg",
  pool: {
    min: 0,
    max: 3
  }
};

if (process.env.DATABASE_URL) {
  knexConfig.connection = {
    connectionString: process.env.DATABASE_URL + "?application_name=metagame",
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

const loggingPlugin = createLoggingPlugin(console);

async function start() {
  const app = express();
  // Render sits between this service and public clients. Revisit if the
  // deployment gains another proxy, such as a CDN.
  app.set('trust proxy', 1);
  const httpServer = http.createServer(app);
  httpServer.once('close', () => console.info('HTTP server stopped.'));
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [
      loggingPlugin,
      ApolloServerPluginDrainHttpServer({ httpServer }),
      process.env.NODE_ENV === "production"
        ? ApolloServerPluginLandingPageProductionDefault({
            footer: false,
          })
        : ApolloServerPluginLandingPageLocalDefault({ embed: true })
    ],
    cache: "bounded",
    introspection: true
  });

  console.info('Application starting.');
  const pg = new PGDB(knexConfig, server.cache);

  await server.start();
  console.info('GraphQL server started.');
  app.disable('x-powered-by');
  app.use('/admin', createAdminRouter({ pg, logger: console }));
  app.use(
    '/',
    cors(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => ({
        dataSources: { pg },
        clientIp: req.ip
      })
    })
  );

  await new Promise(resolve => httpServer.listen({ port: PORT }, resolve));
  console.info(`HTTP server listening at http://localhost:${httpServer.address().port}/`);
  return { app, httpServer, pg, server };
}

if (require.main === module) {
  start().catch(err => {
    console.error('Application failed to start.', err);
    process.exitCode = 1;
  });
}

exports.start = start;
