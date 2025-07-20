import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import { ApolloError } from 'apollo-server-express';
import { defaultFieldResolver, GraphQLField } from 'graphql';

import { rateLimitingService } from '../../services/security/RateLimitingService';

export class RateLimitDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field;
    const { max, window } = this.args;

    field.resolve = async function (...args) {
      const [, , context, info] = args;

      // Generate rate limit key
      const userId = context.user?.id || context.req.ip;
      const fieldName = `${info.parentType.name}.${info.fieldName}`;
      const key = `graphql:${fieldName}:${userId}`;

      // Convert window string to milliseconds
      const windowMs = parseWindow(window);

      // Check rate limit
      const { allowed, info: limitInfo } = await rateLimitingService.checkRateLimit(key, {
        windowMs,
        maxRequests: max
      });

      if (!allowed) {
        throw new ApolloError(
          `Too many requests. Please retry after ${limitInfo.retryAfter} seconds`,
          'RATE_LIMIT_EXCEEDED',
          {
            limit: limitInfo.limit,
            remaining: limitInfo.remaining,
            resetTime: limitInfo.resetTime
          }
        );
      }

      return resolve.apply(this, args);
    };
  }
}

function parseWindow(window: string): number {
  const match = window.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid window format: ${window}`);
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`Invalid time unit: ${unit}`);
  }
}
