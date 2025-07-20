import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import { AuthenticationError, ForbiddenError } from 'apollo-server-express';
import { defaultFieldResolver, GraphQLField } from 'graphql';

export class AuthDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field;
    const { requires } = this.args;

    field.resolve = async function (...args) {
      const [, , context] = args;

      // Check if user is authenticated
      if (!context.isAuthenticated || !context.user) {
        throw new AuthenticationError('You must be logged in to access this resource');
      }

      // Check role if specified
      if (requires) {
        const userRole = context.user.role;

        // Admin can access everything
        if (userRole === 'ADMIN') {
          return resolve.apply(this, args);
        }

        // Check if user has required role
        if (userRole !== requires) {
          throw new ForbiddenError(`You need ${requires} role to access this resource`);
        }
      }

      return resolve.apply(this, args);
    };
  }
}
