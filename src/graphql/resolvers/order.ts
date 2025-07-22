import { AuthenticationError, UserInputError, ApolloError } from 'apollo-server-express';

import { Logger } from '../../core/logging/logger';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { Context } from '../context';
import { pubsub } from '../context';

const logger = new Logger('OrderResolvers');

export const orderResolvers = {
  Query: {
    order: async (_: any, { id }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      const order = await Order.findById(id)
        .populate('buyer')
        .populate('supplier')
        .populate('items.product')
        .lean();

      if (!order) {
        throw new UserInputError('Order not found');
      }

      // Check access rights
      if (
        context.user.company.toString() !== order.buyer.toString() &&
        context.user.company.toString() !== order.supplier.toString()
      ) {
        throw new AuthenticationError('Not authorized to view this order');
      }

      return order;
    },

    orders: async (_: any, { filter, first = 20, after }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      const query: any = {};

      // Role-based filtering
      if (context.user.role === 'BUYER') {
        query.buyer = context.user.company;
      } else if (context.user.role === 'SELLER') {
        query.supplier = context.user.company;
      }

      if (filter) {
        if (filter.status) query.status = filter.status;
        if (filter.startDate && filter.endDate) {
          query.createdAt = {
            $gte: new Date(filter.startDate),
            $lte: new Date(filter.endDate)
          };
        }
      }

      if (after) {
        const cursor = Buffer.from(after, 'base64').toString('ascii');
        query._id = { $lt: cursor };
      }

      const orders = await Order.find(query)
        .populate('buyer')
        .populate('supplier')
        .populate('items.product')
        .sort('-createdAt')
        .limit(first + 1)
        .lean();

      const hasMore = orders.length > first;
      if (hasMore) orders.pop();

      return {
        edges: orders.map(order => ({
          node: order,
          cursor: Buffer.from(order._id.toString()).toString('base64')
        })),
        pageInfo: {
          hasNextPage: hasMore,
          hasPreviousPage: false,
          totalCount: await Order.countDocuments(query)
        }
      };
    },

    myOrders: async (_: any, { status }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      const query: any = {};

      if (context.user.role === 'BUYER') {
        query.buyer = context.user.company;
      } else if (context.user.role === 'SELLER') {
        query.supplier = context.user.company;
      }

      if (status) query.status = status;

      return Order.find(query)
        .populate('buyer')
        .populate('supplier')
        .populate('items.product')
        .sort('-createdAt')
        .lean();
    }
  },

  Mutation: {
    createOrder: async (_: any, { input }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'BUYER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const { items, supplierId, shippingAddress, paymentMethod } = input;

        // Validate products and calculate totals
        let subtotal = 0;
        const validatedItems = [];

        for (const item of items) {
          const product = await Product.findById(item.productId);
          if (!product) {
            throw new UserInputError(`Product ${item.productId} not found`);
          }

          if (product.supplier.toString() !== supplierId) {
            throw new UserInputError('All products must be from the same supplier');
          }

          if (product.status !== 'active') {
            throw new UserInputError(`Product ${product.name} is not available`);
          }

          const itemTotal = product.price.amount * item.quantity;
          subtotal += itemTotal;

          validatedItems.push({
            product: product._id,
            quantity: item.quantity,
            price: product.price.amount,
            total: itemTotal
          });
        }

        const tax = subtotal * 0.1; // 10% tax
        const shipping = 50; // Fixed shipping cost
        const total = subtotal + tax + shipping;

        // Create order
        const order = new Order({
          buyer: context.user.company,
          supplier: supplierId,
          items: validatedItems,
          subtotal,
          tax,
          shipping,
          total,
          status: 'PENDING',
          shippingAddress,
          paymentMethod,
          paymentStatus: 'PENDING'
        });

        await order.save();
        await order.populate(['buyer', 'supplier', 'items.product']);

        // Notify supplier
        pubsub.publish('NEW_ORDER', {
          newOrder: order,
          supplierId
        });

        logger.info('Order created', {
          orderId: order._id,
          userId: context.user.id,
          total
        });

        return order;
      } catch (error) {
        logger.error('Failed to create order', error);
        throw error;
      }
    },

    updateOrderStatus: async (_: any, { id, status }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      try {
        const order = await Order.findById(id);
        if (!order) {
          throw new UserInputError('Order not found');
        }

        // Check authorization based on role and status
        if (context.user.role === 'BUYER') {
          if (order.buyer.toString() !== context.user.company.toString()) {
            throw new AuthenticationError('Not authorized');
          }
          // Buyers can only cancel pending orders or confirm delivered orders
          if (status === 'CANCELLED' && order.status !== 'pending_approval') {
            throw new UserInputError('Can only cancel pending orders');
          }
          if (status === 'DELIVERED' && order.status !== 'shipped') {
            throw new UserInputError('Can only confirm delivery of shipped orders');
          }
        } else if (context.user.role === 'SELLER') {
          if (order.supplier.toString() !== context.user.company.toString()) {
            throw new AuthenticationError('Not authorized');
          }
          // Sellers can confirm, ship, or cancel orders
          if (!['CONFIRMED', 'SHIPPED', 'CANCELLED'].includes(status)) {
            throw new UserInputError('Invalid status for seller');
          }
        } else {
          throw new AuthenticationError('Not authorized');
        }

        const oldStatus = order.status;
        order.status = status;

        // Add status history
        if (!order.statusHistory) {
          order.statusHistory = [];
        }
        order.statusHistory.push({
          status,
          timestamp: new Date(),
          updatedBy: context.user.id
        });

        await order.save();

        // Publish status update
        pubsub.publish('ORDER_STATUS_UPDATED', {
          orderStatusUpdated: order,
          buyerId: order.buyer,
          supplierId: order.supplier
        });

        logger.info('Order status updated', {
          orderId: id,
          oldStatus,
          newStatus: status,
          userId: context.user.id
        });

        return order.populate(['buyer', 'supplier', 'items.product']);
      } catch (error) {
        logger.error('Failed to update order status', error);
        throw error;
      }
    },

    cancelOrder: async (_: any, { id, reason }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      try {
        const order = await Order.findById(id);
        if (!order) {
          throw new UserInputError('Order not found');
        }

        // Check authorization
        if (
          order.buyer.toString() !== context.user.company.toString() &&
          order.supplier.toString() !== context.user.company.toString()
        ) {
          throw new AuthenticationError('Not authorized');
        }

        if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
          throw new UserInputError(`Cannot cancel order with status: ${  order.status}`);
        }

        order.status = 'cancelled';
        order.cancellationReason = reason;
        order.cancelledBy = context.user.id;
        order.cancelledAt = new Date();

        await order.save();

        logger.info('Order cancelled', {
          orderId: id,
          userId: context.user.id,
          reason
        });

        return true;
      } catch (error) {
        logger.error('Failed to cancel order', error);
        throw error;
      }
    }
  },

  Order: {
    buyer: async (order: any, _: any, context: Context) => {
      if (order.buyer?._id) return order.buyer;
      return context.dataloaders.companyLoader.load(order.buyer);
    },

    supplier: async (order: any, _: any, context: Context) => {
      if (order.supplier?._id) return order.supplier;
      return context.dataloaders.companyLoader.load(order.supplier);
    },

    items: async (order: any) => {
      return order.items.map((item: any) => ({
        ...item,
        product: item.product
      }));
    }
  },

  OrderItem: {
    product: async (item: any, _: any, context: Context) => {
      if (item.product?._id) return item.product;
      return context.dataloaders.productLoader.load(item.product);
    }
  }
};
