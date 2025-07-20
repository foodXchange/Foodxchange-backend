import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import { GraphQLUpload } from 'graphql-upload';
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
