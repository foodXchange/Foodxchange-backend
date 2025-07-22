import { Request, Response } from 'express';
import { PubSub } from 'graphql-subscriptions';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';

// Conditional import for RedisPubSub
let RedisPubSub: any;
try {
  RedisPubSub = require('graphql-redis-subscriptions').RedisPubSub;
} catch (e) {
  // Package not installed, will use default PubSub
}

import { Logger } from '../core/logging/logger';
import { User } from '../models/User';

import { createDataLoaders } from './dataloaders';


const logger = new Logger('GraphQLContext');

// Create PubSub instance
const createPubSub = (): PubSub => {
  if (process.env.NODE_ENV === 'production' && RedisPubSub) {
    // Use Redis PubSub for production (scalable) if available
    const options = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times: number) => Math.min(times * 50, 2000)
    };

    return new RedisPubSub({
      publisher: new Redis(options),
      subscriber: new Redis(options)
    });
  }

  // Use in-memory PubSub for development
  return new PubSub();
};

export const pubsub = createPubSub();

export interface Context {
  req: Request;
  res: Response;
  user: any | null;
  isAuthenticated: boolean;
  dataloaders: ReturnType<typeof createDataLoaders>;
  pubsub: PubSub;
}

export async function createContext({ req, res, connection }: any): Promise<Context> {
  // For subscriptions
  if (connection) {
    return {
      req: {} as Request,
      res: {} as Response,
      user: connection.context.user,
      isAuthenticated: !!connection.context.user,
      dataloaders: createDataLoaders(),
      pubsub
    };
  }

  // For queries and mutations
  let user = null;
  let isAuthenticated = false;

  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
        user = await User.findById(decoded.userId || decoded.id)
          .populate('company')
          .lean();

        if (user) {
          isAuthenticated = true;
          // Add user to request for other middleware
          (req).user = user;
        }
      }
    }
  } catch (error) {
    // Invalid token, continue without authentication
    logger.debug('Invalid token in GraphQL context', error);
  }

  return {
    req,
    res,
    user,
    isAuthenticated,
    dataloaders: createDataLoaders(),
    pubsub
  };
}

// Subscription connection params
export async function onConnect(connectionParams: any, websocket: any, context: any) {
  logger.info('Client connected to GraphQL subscriptions');

  if (connectionParams.authToken) {
    try {
      const decoded = jwt.verify(
        connectionParams.authToken,
        process.env.JWT_SECRET || 'secret'
      ) as any;

      return User.findById(decoded.userId || decoded.id)
        .populate('company')
        .lean()
        .then(user => {
          if (user) {
            return { user };
          }
          throw new Error('User not found');
        });
    } catch (error) {
      throw new Error('Invalid auth token');
    }
  }

  throw new Error('Missing auth token');
}

export function onDisconnect(websocket: any, context: any) {
  logger.info('Client disconnected from GraphQL subscriptions');
}
