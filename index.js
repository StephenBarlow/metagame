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
const bunyan = require('bunyan');

// Create a logger instance
const logger = bunyan.createLogger({
    name: 'example-app',
    level: 'info'
});

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

const loggingPlugin = {
  async requestDidStart(requestContext) {
    logger.info(`Processing started for operation ${requestContext.request.operationName}`);
    return {
      async parsingDidStart(requestContext) {
        return async (err) => {
          if (err) {
            logger.error(err);
          }
        }
      },
      async validationDidStart(requestContext) {
        // This end hook is unique in that it can receive an array of errors,
        // which will contain every validation error that occurred.
        return async (errs) => {
          if (errs) {
            errs.forEach(err => logger.error(err));
          }
        }
      },
      async didEncounterErrors(requestContext) {
        logger.error(`Error while executing operation ${requestContext.request.operationName}`);
        logger.error(`Msg: ${requestContext.errors[0].message}`);
        logger.error(`Query String: ${requestContext.request.query}`);
      },
      async executionDidStart(requestContext) {
        return {
          async executionDidEnd(err) {
            logger.info(`Execution completed for operation ${requestContext.request.operationName}`);
            if (err) {
              logger.error(err);
            }
          }
        };
      },
    };
  },
}

async function start() {
  const app = express();
  const httpServer = http.createServer(app);
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

  logger.info('Starting up server...');
  const pg = new PGDB(knexConfig, server.cache);

  await server.start();
  app.disable('x-powered-by');
  app.use('/admin', createAdminRouter({ pg, logger }));
  app.use(
    '/',
    cors(),
    express.json(),
    expressMiddleware(server, {
      context: async () => ({ dataSources: { pg } })
    })
  );

  await new Promise(resolve => httpServer.listen({ port: PORT }, resolve));
  logger.info(`Server ready at http://localhost:${httpServer.address().port}/`);
  return { app, httpServer, pg, server };
}

if (require.main === module) {
  start().catch(err => {
    logger.error(err);
    process.exitCode = 1;
  });
}

exports.start = start;
