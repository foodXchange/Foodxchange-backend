import { AuthenticationError, UserInputError } from 'apollo-server-express';

import { RFQ } from '../../models/RFQ';
import { Context } from '../context';
import { pubsub } from '../context';

export const rfqResolvers = {
  Query: {
    rfq: async (_: any, { id }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      return context.dataloaders.rfqLoader.load(id);
    },

    rfqs: async (_: any, args: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      const { filter, first = 20, after } = args;
      const query: any = {};

      if (filter) {
        if (filter.categoryId) query.category = filter.categoryId;
        if (filter.status) query.status = filter.status;
        if (filter.buyerId) query.buyer = filter.buyerId;
        if (filter.active) {
          query.expiresAt = { $gt: new Date() };
          query.status = 'ACTIVE';
        }
      }

      // For sellers, show all RFQs; for buyers, show only their own
      if (context.user.role === 'BUYER') {
        query.buyer = context.user.company;
      }

      if (after) {
        const cursor = Buffer.from(after, 'base64').toString('ascii');
        query._id = { $lt: cursor };
      }

      const rfqs = await RFQ.find(query)
        .populate('buyer')
        .populate('category')
        .sort('-createdAt')
        .limit(first + 1)
        .lean();

      const hasMore = rfqs.length > first;
      if (hasMore) rfqs.pop();

      return {
        edges: rfqs.map(rfq => ({
          node: rfq,
          cursor: Buffer.from(rfq._id.toString()).toString('base64')
        })),
        pageInfo: {
          hasNextPage: hasMore,
          hasPreviousPage: false,
          totalCount: await RFQ.countDocuments(query)
        }
      };
    },

    myRFQs: async (_: any, __: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'BUYER') {
        throw new AuthenticationError('Not authorized');
      }

      return RFQ.find({ buyer: context.user.company })
        .populate('buyer')
        .populate('category')
        .sort('-createdAt')
        .lean();
    }
  },

  Mutation: {
    createRFQ: async (_: any, { input }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'BUYER') {
        throw new AuthenticationError('Not authorized');
      }

      const rfq = new RFQ({
        ...input,
        buyer: context.user.company,
        status: 'ACTIVE'
      });

      await rfq.save();
      await rfq.populate(['buyer', 'category']);

      // Notify sellers
      pubsub.publish('NEW_RFQ', {
        newRFQPosted: rfq,
        categoryId: rfq.category
      });

      return rfq;
    },

    updateRFQ: async (_: any, { id, input }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'BUYER') {
        throw new AuthenticationError('Not authorized');
      }

      const rfq = await RFQ.findById(id);
      if (!rfq) {
        throw new UserInputError('RFQ not found');
      }

      if (rfq.buyer.toString() !== context.user.company.toString()) {
        throw new AuthenticationError('Not authorized to update this RFQ');
      }

      Object.assign(rfq, input);
      await rfq.save();

      return rfq.populate(['buyer', 'category']);
    },

    cancelRFQ: async (_: any, { id }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'BUYER') {
        throw new AuthenticationError('Not authorized');
      }

      const rfq = await RFQ.findById(id);
      if (!rfq) {
        throw new UserInputError('RFQ not found');
      }

      if (rfq.buyer.toString() !== context.user.company.toString()) {
        throw new AuthenticationError('Not authorized to cancel this RFQ');
      }

      rfq.status = 'CANCELLED';
      await rfq.save();

      return true;
    }
  },

  RFQ: {
    buyer: async (rfq: any, _: any, context: Context) => {
      if (rfq.buyer?._id) return rfq.buyer;
      return context.dataloaders.companyLoader.load(rfq.buyer);
    },

    category: async (rfq: any, _: any, context: Context) => {
      if (rfq.category?._id) return rfq.category;
      return context.dataloaders.categoryLoader.load(rfq.category);
    },

    proposals: async (rfq: any, _: any, context: Context) => {
      return context.dataloaders.proposalsByRFQLoader.load(rfq._id);
    }
  }
};
