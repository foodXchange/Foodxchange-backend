import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { defaultFieldResolver, GraphQLSchema } from 'graphql';
import { GraphQLError } from 'graphql';

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimitDirectiveTransformer(schema: GraphQLSchema, directiveName: string) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const rateLimitDirective = getDirective(schema, fieldConfig, directiveName)?.[0];

      if (rateLimitDirective) {
        const { limit = 10, duration = 60 } = rateLimitDirective;
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context, info) {
          const userId = context.user?.id || context.ip || 'anonymous';
          const key = `${userId}:${info.fieldName}`;
          const now = Date.now();
          const windowDuration = duration * 1000; // Convert to milliseconds

          const record = rateLimitStore.get(key);

          if (!record || now > record.resetTime) {
            // New window
            rateLimitStore.set(key, {
              count: 1,
              resetTime: now + windowDuration
            });
          } else if (record.count >= limit) {
            // Rate limit exceeded
            const resetIn = Math.ceil((record.resetTime - now) / 1000);
            throw new GraphQLError(
              `Rate limit exceeded. Try again in ${resetIn} seconds.`,
              {
                extensions: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  resetIn
                }
              }
            );
          } else {
            // Increment count
            record.count++;
          }

          // Clean up old entries periodically
          if (Math.random() < 0.01) { // 1% chance
            for (const [k, v] of rateLimitStore.entries()) {
              if (now > v.resetTime) {
                rateLimitStore.delete(k);
              }
            }
          }

          // Call original resolver
          return resolve(source, args, context, info);
        };

        return fieldConfig;
      }
    }
  });
}

export default rateLimitDirectiveTransformer;