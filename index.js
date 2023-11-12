require('dotenv').config()

const { ApolloServer } = require('apollo-server');
const {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault
} = require ('apollo-server-core');
const { connectionPool, DataSource } = require('./connection-pool');
const { typeDefs } = require('./schema');
const { resolvers } = require('./resolvers');
const bunyan = require('bunyan');

// Create a logger instance
const logger = bunyan.createLogger({
    name: 'metagame',
    level: 'info'
});

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

const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: () => ({ pg }),
  plugins: [
    loggingPlugin,
    process.env.NODE_ENV === "production"
      ? ApolloServerPluginLandingPageProductionDefault({
          footer: false,
        })
      : ApolloServerPluginLandingPageLocalDefault({ embed: true })
  ],
  cache: "bounded",
  introspection: true
});

server.listen({
  port: PORT
}).then(({ url }) => {
  logger.info(`Server ready at ${url}`);
});
