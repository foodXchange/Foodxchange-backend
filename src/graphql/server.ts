import { createServer } from 'http';

import { makeExecutableSchema } from '@graphql-tools/schema';
import { ApolloServer } from 'apollo-server-express';
import express from 'express';
import { execute, subscribe } from 'graphql';
import { SubscriptionServer } from 'subscriptions-transport-ws';

import { Logger } from '../core/logging/logger';

import { createContext } from './context';
import authDirective from './directives/authDirective';
import rateLimitDirective from './directives/rateLimitDirective';
import { resolvers } from './resolvers';
import { typeDefs } from './schema/typeDefs';


const logger = new Logger('GraphQLServer');

export class GraphQLServerManager {
  private apolloServer?: ApolloServer;
  private httpServer?: any;
  private subscriptionServer?: SubscriptionServer;

  async createServer(app: express.Application) {
    try {
      // Create executable schema with directives
      let schema = makeExecutableSchema({
        typeDefs,
        resolvers
      });

      // Apply directives
      schema = authDirective(schema, 'auth');
      schema = rateLimitDirective(schema, 'rateLimit');

      // Create Apollo Server
      this.apolloServer = new ApolloServer({
        schema,
        context: createContext,
        introspection: process.env.NODE_ENV !== 'production',
        playground: process.env.NODE_ENV !== 'production',
        uploads: {
          maxFileSize: 10000000, // 10MB
          maxFiles: 10
        },
        formatError: (error) => {
          logger.error('GraphQL Error', error);

          // Don't expose internal errors in production
          if (process.env.NODE_ENV === 'production') {
            // Only return safe error messages
            if (error.message.includes('Not authenticated') ||
                error.message.includes('Not authorized') ||
                error.message.includes('validation failed')) {
              return error;
            }
            return new Error('Internal server error');
          }

          return error;
        },
        formatResponse: (response, requestContext) => {
          // Log slow queries
          if (requestContext.request.query) {
            const executionTime = Date.now() - ((requestContext.request as any).startTime || Date.now());
            if (executionTime > 1000) { // Log queries taking more than 1 second
              logger.warn('Slow GraphQL query', {
                query: requestContext.request.query,
                variables: requestContext.request.variables,
                executionTime: `${executionTime}ms`
              });
            }
          }

          return response;
        },
        plugins: [
          {
            requestDidStart() {
              return Promise.resolve({
                didResolveOperation(requestContext) {
                  (requestContext.request as any).startTime = Date.now();
                },
                willSendResponse(requestContext) {
                  const executionTime = Date.now() - ((requestContext.request as any).startTime || Date.now());

                  // Log all operations
                  logger.info('GraphQL Operation', {
                    operationName: requestContext.request.operationName,
                    executionTime: `${executionTime}ms`,
                    userId: requestContext.context.user?.id,
                    userRole: requestContext.context.user?.role
                  });
                }
              });
            }
          }
        ]
      });

      // Apply middleware to Express app
      this.apolloServer.applyMiddleware({
        app,
        path: '/graphql',
        cors: {
          origin: process.env.FRONTEND_URL || 'http://localhost:3000',
          credentials: true
        }
      });

      // Create HTTP server for subscriptions
      this.httpServer = createServer(app);

      // Set up subscriptions
      this.subscriptionServer = SubscriptionServer.create(
        {
          schema,
          execute,
          subscribe,
          onConnect: async (connectionParams: any, webSocket: any) => {
            try {
              // Extract token from connection params
              const token = connectionParams.Authorization || connectionParams.authorization;

              if (!token) {
                throw new Error('Missing auth token');
              }

              // Create context for subscription
              const context = await createContext({
                req: { headers: { authorization: token } }
              } as any);

              if (!context.isAuthenticated) {
                throw new Error('Invalid token');
              }

              logger.info('WebSocket connection established', {
                userId: context.user?.id,
                userRole: context.user?.role
              });

              return context;
            } catch (error) {
              logger.error('WebSocket connection failed', error);
              throw error;
            }
          },
          onDisconnect: (webSocket: any, context: any) => {
            logger.info('WebSocket connection closed', {
              userId: context?.user?.id
            });
          }
        },
        {
          server: this.httpServer,
          path: '/graphql'
        }
      );

      logger.info('GraphQL server configured successfully', {
        path: '/graphql',
        introspection: process.env.NODE_ENV !== 'production',
        playground: process.env.NODE_ENV !== 'production'
      });

      return this.httpServer;

    } catch (error) {
      logger.error('Failed to create GraphQL server', error);
      throw error;
    }
  }

  async start(port: number = 4000) {
    if (!this.httpServer) {
      throw new Error('Server not created. Call createServer() first.');
    }

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(port, (error: any) => {
        if (error) {
          logger.error('Failed to start GraphQL server', error);
          reject(error);
        } else {
          logger.info('GraphQL server started', {
            port,
            graphqlPath: '/graphql',
            subscriptionsPath: '/graphql'
          });
          resolve(this.httpServer);
        }
      });
    });
  }

  async stop() {
    try {
      if (this.subscriptionServer) {
        this.subscriptionServer.close();
        logger.info('Subscription server stopped');
      }

      if (this.apolloServer) {
        await this.apolloServer.stop();
        logger.info('Apollo server stopped');
      }

      if (this.httpServer) {
        await new Promise((resolve) => {
          this.httpServer!.close(resolve);
        });
        logger.info('HTTP server stopped');
      }
    } catch (error) {
      logger.error('Error stopping GraphQL server', error);
      throw error;
    }
  }

  getApolloServer() {
    return this.apolloServer;
  }

  getHttpServer() {
    return this.httpServer;
  }
}
