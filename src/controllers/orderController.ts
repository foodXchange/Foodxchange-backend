import { Request, Response } from 'express';
import mongoose from 'mongoose';

import { ValidationError, AuthorizationError, NotFoundError, ConflictError } from '../core/errors';
import { Logger } from '../core/logging/logger';
import { Company } from '../models/Company';
import { Order, IOrder } from '../models/Order';
import { Product } from '../models/Product';
import { RFQ } from '../models/RFQ';
import { User } from '../models/User';
import { publishToServiceBus, getServiceBusService } from '../services/azure/ServiceBusService';
import { getRealtimeEventService } from '../services/realtime/RealtimeEventService';
import { sendEmail } from '../utils/email';
import { sendSMS } from '../utils/sms';
import { validateOrderData, validateOrderUpdateData } from '../utils/validation';


const logger = new Logger('OrderController');

export class OrderController {
  private readonly realtimeEventService = getRealtimeEventService();
  private readonly serviceBusService = getServiceBusService();
  /**
   * Create a new order
   */
  async createOrder(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = validateOrderData(req.body);
      if (error) {
        throw new ValidationError(error.details.map(d => d.message).join(', '));
      }

      const orderData = value;
      orderData.tenantId = req.tenantId;
      orderData.createdBy = req.userId;

      // Validate companies belong to tenant
      const [buyerCompany, supplierCompany] = await Promise.all([
        Company.findOne({ _id: orderData.buyerCompany, tenantId: req.tenantId }),
        Company.findOne({ _id: orderData.supplierCompany, tenantId: req.tenantId })
      ]);

      if (!buyerCompany || !supplierCompany) {
        throw new ValidationError('Invalid company references');
      }

      // Validate products exist
      if (orderData.items && orderData.items.length > 0) {
        const productIds = orderData.items
          .filter(item => item.productId)
          .map(item => item.productId);

        if (productIds.length > 0) {
          const products = await Product.find({
            _id: { $in: productIds },
            tenantId: req.tenantId
          });

          if (products.length !== productIds.length) {
            throw new ValidationError('One or more products not found');
          }
        }
      }

      // Check if order requires approval
      const requiresApproval = orderData.totalAmount > (req.tenantContext?.limits.orderApprovalThreshold || 10000);
      if (requiresApproval) {
        orderData.approvalRequired = true;
        orderData.status = 'pending_approval';
      }

      const order = new Order(orderData);
      await order.save();

      // Set up approval chain if required
      if (requiresApproval) {
        await this.setupApprovalChain(order, req.tenantId);
      }

      // Log activity
      await order.addActivityLog('order_created', req.userId, {
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount
      });

      // Send notifications asynchronously (non-blocking)
      this.sendOrderNotifications(order, 'created').catch(error => {
        logger.error('Failed to send order notifications:', error);
      });

      // Emit real-time event
      await this.realtimeEventService.emitOrderCreated(
        order._id.toString(),
        order.buyer.toString(),
        order.supplier.toString(),
        req.tenantId,
        order
      );

      // Publish to Service Bus
      await this.serviceBusService.sendOrderEvent('created', order._id.toString(), req.tenantId, req.userId, {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        currency: order.currency,
        buyerId: order.buyer.toString(),
        supplierId: order.supplier.toString(),
        buyerCompany: buyerCompany.name,
        supplierCompany: supplierCompany.name
      });

      res.status(201).json({
        success: true,
        data: order,
        message: 'Order created successfully'
      });
    } catch (error) {
      logger.error('Create order error:', error);

      if (error instanceof ValidationError || error instanceof AuthorizationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Get orders with filtering and pagination
   */
  async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        buyerCompany,
        supplierCompany,
        minAmount,
        maxAmount,
        startDate,
        endDate,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const filter: any = { tenantId: req.tenantId };

      // Status filter
      if (status) {
        filter.status = status;
      }

      // Company filters
      if (buyerCompany) {
        filter.buyerCompany = buyerCompany;
      }
      if (supplierCompany) {
        filter.supplierCompany = supplierCompany;
      }

      // Amount range filter
      if (minAmount || maxAmount) {
        filter.totalAmount = {};
        if (minAmount) filter.totalAmount.$gte = parseFloat(minAmount as string);
        if (maxAmount) filter.totalAmount.$lte = parseFloat(maxAmount as string);
      }

      // Date range filter
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate as string);
        if (endDate) filter.createdAt.$lte = new Date(endDate as string);
      }

      // Search filter
      if (search) {
        filter.$or = [
          { orderNumber: { $regex: search, $options: 'i' } },
          { purchaseOrderNumber: { $regex: search, $options: 'i' } },
          { 'items.name': { $regex: search, $options: 'i' } },
          { 'items.sku': { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const sortDirection = sortOrder === 'desc' ? -1 : 1;

      const [orders, total] = await Promise.all([
        Order.find(filter)
          .populate('buyer', 'name email')
          .populate('supplier', 'name email')
          .populate('buyerCompany', 'name')
          .populate('supplierCompany', 'name')
          .populate('createdBy', 'name email')
          .sort({ [sortBy as string]: sortDirection })
          .skip(skip)
          .limit(parseInt(limit as string))
          .lean(),
        Order.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          orders,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string))
          }
        }
      });
    } catch (error) {
      logger.error('Get orders error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const order = await Order.findOne({ _id: id, tenantId: req.tenantId })
        .populate('buyer', 'name email phone')
        .populate('supplier', 'name email phone')
        .populate('buyerCompany', 'name address')
        .populate('supplierCompany', 'name address')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('approvalChain.approver', 'name email role')
        .populate('activityLog.performedBy', 'name email');

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      res.json({
        success: true,
        data: order
      });
    } catch (error) {
      logger.error('Get order by ID error:', error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Update order
   */
  async updateOrder(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { error, value } = validateOrderUpdateData(req.body);

      if (error) {
        throw new ValidationError(error.details.map(d => d.message).join(', '));
      }

      const order = await Order.findOne({ _id: id, tenantId: req.tenantId });
      if (!order) {
        throw new NotFoundError('Order not found');
      }

      // Check if order can be modified
      if (!order.canBeModified()) {
        throw new ConflictError('Order cannot be modified in current status');
      }

      const updateData = value;
      updateData.updatedBy = req.userId;

      // Update order
      Object.assign(order, updateData);
      await order.save();

      // Log activity
      await order.addActivityLog('order_updated', req.userId, {
        updatedFields: Object.keys(updateData)
      });

      // Send notifications
      await this.sendOrderNotifications(order, 'updated');

      // Emit real-time event for order update
      await this.realtimeEventService.emitOrderStatusUpdate(
        order._id.toString(),
        'updated',
        order.status,
        req.userId,
        req.tenantId
      );

      res.json({
        success: true,
        data: order,
        message: 'Order updated successfully'
      });
    } catch (error) {
      logger.error('Update order error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ConflictError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Process order approval
   */
  async processApproval(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { decision, comments } = req.body;

      if (!['approved', 'rejected'].includes(decision)) {
        throw new ValidationError('Invalid decision. Must be approved or rejected');
      }

      const order = await Order.findOne({ _id: id, tenantId: req.tenantId });
      if (!order) {
        throw new NotFoundError('Order not found');
      }

      // Check if user can approve this order
      const canApprove = order.approvalChain.some(approval =>
        approval.approver.toString() === req.userId && approval.status === 'pending'
      );

      if (!canApprove) {
        throw new AuthorizationError('You are not authorized to approve this order');
      }

      await order.processApproval(req.userId, decision, comments);

      // Send notifications
      await this.sendOrderNotifications(order, `approval_${decision}`);

      // Emit real-time event for approval
      if (decision === 'approved') {
        await this.realtimeEventService.emit('order:approved', {
          type: 'order:approved',
          tenantId: req.tenantId,
          data: { orderId: order._id.toString(), approver: req.userId, comments }
        });
      } else {
        await this.realtimeEventService.emit('order:rejected', {
          type: 'order:rejected',
          tenantId: req.tenantId,
          data: { orderId: order._id.toString(), rejector: req.userId, comments }
        });
      }

      // Publish to Service Bus
      await publishToServiceBus('order-events', {
        event: `order_${decision}`,
        orderId: order._id,
        tenantId: req.tenantId,
        data: {
          orderNumber: order.orderNumber,
          approver: req.userId,
          comments
        }
      });

      res.json({
        success: true,
        data: order,
        message: `Order ${decision} successfully`
      });
    } catch (error) {
      logger.error('Process approval error:', error);

      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const order = await Order.findOne({ _id: id, tenantId: req.tenantId });
      if (!order) {
        throw new NotFoundError('Order not found');
      }

      if (!order.canBeCancelled) {
        throw new ConflictError('Order cannot be cancelled in current status');
      }

      await order.updateStatus('cancelled', req.userId);

      // Log cancellation reason
      await order.addActivityLog('order_cancelled', req.userId, { reason });

      // Send notifications
      await this.sendOrderNotifications(order, 'cancelled');

      // Emit real-time event for cancellation
      await this.realtimeEventService.emit('order:cancelled', {
        type: 'order:cancelled',
        tenantId: req.tenantId,
        data: { orderId: order._id.toString(), reason }
      });

      res.json({
        success: true,
        data: order,
        message: 'Order cancelled successfully'
      });
    } catch (error) {
      logger.error('Cancel order error:', error);

      if (error instanceof NotFoundError || error instanceof ConflictError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Add shipment to order
   */
  async addShipment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const shipmentData = req.body;

      const order = await Order.findOne({ _id: id, tenantId: req.tenantId });
      if (!order) {
        throw new NotFoundError('Order not found');
      }

      if (!['approved', 'confirmed', 'processing'].includes(order.status)) {
        throw new ConflictError('Cannot add shipment to order in current status');
      }

      // Generate shipment number
      const shipmentCount = order.shipments.length;
      shipmentData.shipmentNumber = `${order.orderNumber}-SH${(shipmentCount + 1).toString().padStart(3, '0')}`;

      await order.addShipment(shipmentData);

      // Log activity
      await order.addActivityLog('shipment_added', req.userId, {
        shipmentNumber: shipmentData.shipmentNumber,
        carrier: shipmentData.carrier
      });

      // Send notifications
      await this.sendOrderNotifications(order, 'shipment_created');

      // Emit real-time event for shipment creation
      await this.realtimeEventService.emit('shipment:created', {
        type: 'shipment:created',
        tenantId: req.tenantId,
        data: {
          orderId: order._id.toString(),
          shipmentId: order.shipments[order.shipments.length - 1]._id.toString(),
          carrier: shipmentData.carrier,
          trackingNumber: shipmentData.trackingNumber
        }
      });

      res.json({
        success: true,
        data: order,
        message: 'Shipment added successfully'
      });
    } catch (error) {
      logger.error('Add shipment error:', error);

      if (error instanceof NotFoundError || error instanceof ConflictError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Update shipment tracking
   */
  async updateShipmentTracking(req: Request, res: Response): Promise<void> {
    try {
      const { id, shipmentId } = req.params;
      const trackingData = req.body;

      const order = await Order.findOne({ _id: id, tenantId: req.tenantId });
      if (!order) {
        throw new NotFoundError('Order not found');
      }

      await order.updateShipmentTracking(shipmentId, trackingData);

      // Log activity
      await order.addActivityLog('shipment_tracking_updated', req.userId, {
        shipmentId,
        status: trackingData.status
      });

      // Emit real-time event for shipment tracking update
      await this.realtimeEventService.emitShipmentUpdate(
        order._id.toString(),
        shipmentId,
        trackingData,
        req.userId,
        req.tenantId
      );

      res.json({
        success: true,
        data: order,
        message: 'Shipment tracking updated successfully'
      });
    } catch (error) {
      logger.error('Update shipment tracking error:', error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Get order analytics
   */
  async getOrderAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;

      const dateFilter: any = { tenantId: req.tenantId };
      if (startDate || endDate) {
        dateFilter.createdAt = {};
        if (startDate) dateFilter.createdAt.$gte = new Date(startDate as string);
        if (endDate) dateFilter.createdAt.$lte = new Date(endDate as string);
      }

      const [
        totalOrders,
        totalValue,
        statusBreakdown,
        averageOrderValue,
        topBuyers,
        topSuppliers
      ] = await Promise.all([
        Order.countDocuments(dateFilter),
        Order.aggregate([
          { $match: dateFilter },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]),
        Order.aggregate([
          { $match: dateFilter },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        Order.aggregate([
          { $match: dateFilter },
          { $group: { _id: null, avg: { $avg: '$totalAmount' } } }
        ]),
        Order.aggregate([
          { $match: dateFilter },
          { $group: { _id: '$buyerCompany', count: { $sum: 1 }, value: { $sum: '$totalAmount' } } },
          { $sort: { value: -1 } },
          { $limit: 10 },
          { $lookup: { from: 'companies', localField: '_id', foreignField: '_id', as: 'company' } }
        ]),
        Order.aggregate([
          { $match: dateFilter },
          { $group: { _id: '$supplierCompany', count: { $sum: 1 }, value: { $sum: '$totalAmount' } } },
          { $sort: { value: -1 } },
          { $limit: 10 },
          { $lookup: { from: 'companies', localField: '_id', foreignField: '_id', as: 'company' } }
        ])
      ]);

      res.json({
        success: true,
        data: {
          totalOrders,
          totalValue: totalValue[0]?.total || 0,
          averageOrderValue: averageOrderValue[0]?.avg || 0,
          statusBreakdown,
          topBuyers,
          topSuppliers
        }
      });
    } catch (error) {
      logger.error('Get order analytics error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Setup approval chain for order
   */
  private async setupApprovalChain(order: IOrder, tenantId: string): Promise<void> {
    // Get company approval settings
    const buyerCompany = await Company.findById(order.buyerCompany);
    if (!buyerCompany) return;

    const approvalThresholds = buyerCompany.settings?.approvalThresholds || [
      { amount: 5000, role: 'manager' },
      { amount: 25000, role: 'director' },
      { amount: 100000, role: 'ceo' }
    ];

    // Get all required roles that meet the threshold
    const requiredRoles = approvalThresholds
      .filter(threshold => order.totalAmount >= threshold.amount)
      .map(threshold => threshold.role);

    if (requiredRoles.length === 0) return;

    // Fetch all approvers in one query
    const approvers = await User.find({
      companyId: order.buyerCompany,
      role: { $in: requiredRoles },
      tenantId
    });

    // Create a map for quick lookup
    const approversByRole = new Map();
    approvers.forEach(approver => {
      approversByRole.set(approver.role, approver);
    });

    // Add approvers to chain in order
    let approvalOrder = 1;
    for (const threshold of approvalThresholds) {
      if (order.totalAmount >= threshold.amount) {
        const approver = approversByRole.get(threshold.role);
        if (approver) {
          await order.addToApprovalChain(approver._id.toString(), threshold.role, approvalOrder++);
        }
      }
    }
  }

  /**
   * Send order notifications
   */
  private async sendOrderNotifications(order: IOrder, event: string): Promise<void> {
    try {
      const [buyer, supplier] = await Promise.all([
        User.findById(order.buyer),
        User.findById(order.supplier)
      ]);

      const emailData = {
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        currency: order.currency,
        status: order.status,
        event
      };

      // Send email notifications
      if (buyer?.email) {
        await sendEmail({
          to: buyer.email,
          subject: `Order ${order.orderNumber} - ${event.replace('_', ' ')}`,
          template: 'order_notification',
          data: emailData
        });
      }

      if (supplier?.email) {
        await sendEmail({
          to: supplier.email,
          subject: `Order ${order.orderNumber} - ${event.replace('_', ' ')}`,
          template: 'order_notification',
          data: emailData
        });
      }

      // Send SMS for critical events
      if (['approved', 'cancelled', 'shipped'].includes(event)) {
        if (buyer?.phone) {
          await sendSMS({
            to: buyer.phone,
            message: `Order ${order.orderNumber} has been ${event}. Total: ${order.currency} ${order.totalAmount}`
          });
        }
      }
    } catch (error) {
      logger.error('Failed to send order notifications:', error);
    }
  }
}

export default new OrderController();
