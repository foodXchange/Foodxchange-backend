import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
// GraphQL Upload placeholder - install graphql-upload package if needed
const GraphQLUpload = null;
import { merge } from 'lodash';

// Import resolvers
import { analyticsResolvers } from './analytics';
import { authResolvers } from './auth';
import { categoryResolvers } from './category';
import { companyResolvers } from './company';
import { orderResolvers } from './order';
import { productResolvers } from './product';
import { proposalResolvers } from './proposal';
import { rfqResolvers } from './rfq';
import { subscriptionResolvers } from './subscription';
import { userResolvers } from './user';

// Merge all resolvers
export const resolvers = merge(
  {
    // Scalar resolvers
    Date: DateTimeResolver,
    JSON: JSONResolver,
    Upload: GraphQLUpload
  },
  authResolvers,
  userResolvers,
  productResolvers,
  companyResolvers,
  categoryResolvers,
  rfqResolvers,
  proposalResolvers,
  orderResolvers,
  analyticsResolvers,
  subscriptionResolvers
);
