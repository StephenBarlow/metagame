'use strict';

function createLoggingPlugin(logger) {
  return {
    async requestDidStart() {
      const startedAt = Date.now();
      return {
        async willSendResponse(responseContext) {
          const operation = responseContext.operation;
          const operationName = operation?.name?.value ?? null;
          const fields = {
            event: 'graphql_request',
            operationName,
            operationType: operation?.operation ?? null,
            clientIp: responseContext.contextValue?.clientIp ?? null,
            forwardedFor: responseContext.contextValue?.forwardedFor ?? null,
            durationMs: Date.now() - startedAt,
            errorCount: responseContext.errors?.length ?? 0
          };

          if (operation && !operationName) {
            logger.warn(fields, 'Anonymous GraphQL operation requested');
          } else {
            logger.info(fields, 'GraphQL operation requested');
          }
        }
      };
    }
  };
}

module.exports = { createLoggingPlugin };
