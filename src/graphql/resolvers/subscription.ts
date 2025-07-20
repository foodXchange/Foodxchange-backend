import { AuthenticationError } from 'apollo-server-express';
import { withFilter } from 'graphql-subscriptions';

import { Context } from '../context';
import { pubsub } from '../context';

export const subscriptionResolvers = {
  Subscription: {
    newOrder: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['NEW_ORDER']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Only suppliers should receive new order notifications
          if (context.user.role !== 'SELLER') {
            return false;
          }

          // Check if the order is for this supplier
          return payload.supplierId.toString() === context.user.company.toString();
        }
      )
    },

    orderStatusUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['ORDER_STATUS_UPDATED']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Both buyer and supplier should receive order status updates
          return (
            payload.buyerId.toString() === context.user.company.toString() ||
            payload.supplierId.toString() === context.user.company.toString()
          );
        }
      )
    },

    newRFQPosted: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['NEW_RFQ']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Only sellers should receive RFQ notifications
          if (context.user.role !== 'SELLER') {
            return false;
          }

          // Filter by category if user has specified interests
          if (variables.categoryIds && variables.categoryIds.length > 0) {
            return variables.categoryIds.includes(payload.categoryId.toString());
          }

          return true;
        }
      )
    },

    proposalReceived: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['PROPOSAL_RECEIVED']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Only buyers should receive proposal notifications
          if (context.user.role !== 'BUYER') {
            return false;
          }

          // Check if the proposal is for this buyer's RFQ
          return payload.buyerId.toString() === context.user.company.toString();
        }
      )
    },

    proposalAccepted: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['PROPOSAL_ACCEPTED']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Only suppliers should receive proposal acceptance notifications
          if (context.user.role !== 'SELLER') {
            return false;
          }

          // Check if the proposal belongs to this supplier
          return payload.supplierId.toString() === context.user.company.toString();
        }
      )
    },

    newMessage: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['NEW_MESSAGE']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Check if user is a participant in the conversation
          return payload.conversationParticipants.includes(context.user.id);
        }
      )
    },

    priceAlert: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['PRICE_ALERT']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Only buyers should receive price alerts
          if (context.user.role !== 'BUYER') {
            return false;
          }

          // Check if user has alerts set up for this product/category
          return payload.subscribedUsers.includes(context.user.id);
        }
      )
    },

    inventoryAlert: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['INVENTORY_ALERT']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Only suppliers should receive inventory alerts for their products
          if (context.user.role !== 'SELLER') {
            return false;
          }

          return payload.supplierId.toString() === context.user.company.toString();
        }
      )
    },

    systemNotification: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['SYSTEM_NOTIFICATION']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Check notification targeting
          if (payload.targetRoles && payload.targetRoles.length > 0) {
            return payload.targetRoles.includes(context.user.role);
          }

          if (payload.targetUsers && payload.targetUsers.length > 0) {
            return payload.targetUsers.includes(context.user.id);
          }

          if (payload.targetCompanies && payload.targetCompanies.length > 0) {
            return payload.targetCompanies.includes(context.user.company.toString());
          }

          // If no specific targeting, send to all authenticated users
          return true;
        }
      )
    },

    marketDataUpdate: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['MARKET_DATA_UPDATE']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Filter by categories if specified
          if (variables.categoryIds && variables.categoryIds.length > 0) {
            return variables.categoryIds.some((categoryId: string) =>
              payload.categories.includes(categoryId)
            );
          }

          return true;
        }
      )
    },

    complianceAlert: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['COMPLIANCE_ALERT']),
        (payload: any, variables: any, context: Context) => {
          if (!context.isAuthenticated) {
            throw new AuthenticationError('Not authenticated');
          }

          // Compliance alerts should go to the specific company
          return payload.companyId.toString() === context.user.company.toString();
        }
      )
    }
  }
};
