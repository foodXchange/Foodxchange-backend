import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { AuthenticationError, ForbiddenError } from 'apollo-server-express';
import { defaultFieldResolver, GraphQLSchema } from 'graphql';

export function authDirectiveTransformer(schema: GraphQLSchema, directiveName: string) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const authDirective = getDirective(schema, fieldConfig, directiveName)?.[0];

      if (authDirective) {
        const { requires } = authDirective;
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context, info) {
          // Check if user is authenticated
          if (!context.isAuthenticated || !context.user) {
            throw new AuthenticationError('You must be logged in to access this resource');
          }

          // Check role if specified
          if (requires) {
            const userRole = context.user.role;

            // Check if user has required role
            if (Array.isArray(requires)) {
              if (!requires.includes(userRole)) {
                throw new ForbiddenError(`You need one of the following roles: ${requires.join(', ')}`);
              }
            } else if (userRole !== requires) {
              throw new ForbiddenError(`You need ${requires} role to access this resource`);
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

export default authDirectiveTransformer;