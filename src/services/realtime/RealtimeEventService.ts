import { EventEmitter } from 'events';

import { Logger } from '../../core/logging/logger';
import { Order } from '../../models/Order';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';
import { getSignalRService, SignalRService } from '../azure/SignalRService';

const logger = new Logger('RealtimeEventService');

export interface RealtimeEvent {
  type: string;
  userId?: string;
  tenantId: string;
  data: any;
  timestamp: Date;
}

export class RealtimeEventService extends EventEmitter {
  private readonly signalRService: SignalRService;
  private isInitialized = false;

  constructor() {
    super();
    this.signalRService = getSignalRService();
  }

  /**
   * Initialize the real-time event service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Set up event listeners
      this.setupEventListeners();

      // Test SignalR connection
      await this.signalRService.healthCheck();

      this.isInitialized = true;
      logger.info('RealtimeEventService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize RealtimeEventService:', error);
      throw error;
    }
  }

  /**
   * Set up event listeners for various system events
   */
  private setupEventListeners(): void {
    // Order events
    this.on('order:created', this.handleOrderCreated.bind(this));
    this.on('order:updated', this.handleOrderUpdated.bind(this));
    this.on('order:approved', this.handleOrderApproved.bind(this));
    this.on('order:rejected', this.handleOrderRejected.bind(this));
    this.on('order:shipped', this.handleOrderShipped.bind(this));
    this.on('order:delivered', this.handleOrderDelivered.bind(this));
    this.on('order:cancelled', this.handleOrderCancelled.bind(this));

    // RFQ events
    this.on('rfq:created', this.handleRFQCreated.bind(this));
    this.on('rfq:updated', this.handleRFQUpdated.bind(this));
    this.on('rfq:quote_received', this.handleRFQQuoteReceived.bind(this));
    this.on('rfq:closed', this.handleRFQClosed.bind(this));
    this.on('rfq:awarded', this.handleRFQAwarded.bind(this));

    // Shipment events
    this.on('shipment:created', this.handleShipmentCreated.bind(this));
    this.on('shipment:updated', this.handleShipmentUpdated.bind(this));
    this.on('shipment:delivered', this.handleShipmentDelivered.bind(this));

    // Chat events
    this.on('chat:message', this.handleChatMessage.bind(this));
    this.on('chat:typing', this.handleChatTyping.bind(this));

    // Compliance events
    this.on('compliance:alert', this.handleComplianceAlert.bind(this));
    this.on('compliance:check_failed', this.handleComplianceCheckFailed.bind(this));

    // System events
    this.on('system:notification', this.handleSystemNotification.bind(this));
    this.on('system:maintenance', this.handleSystemMaintenance.bind(this));

    logger.info('Event listeners configured');
  }

  /**
   * Emit order created event
   */
  async emitOrderCreated(orderId: string, buyerId: string, supplierId: string, tenantId: string, orderData: any): Promise<void> {
    const event: RealtimeEvent = {
      type: 'order:created',
      tenantId,
      data: {
        orderId,
        buyerId,
        supplierId,
        orderNumber: orderData.orderNumber,
        totalAmount: orderData.totalAmount,
        currency: orderData.currency,
        status: orderData.status
      },
      timestamp: new Date()
    };

    this.emit('order:created', event);
  }

  /**
   * Emit order status update event
   */
  async emitOrderStatusUpdate(orderId: string, oldStatus: string, newStatus: string, userId: string, tenantId: string): Promise<void> {
    const event: RealtimeEvent = {
      type: 'order:updated',
      userId,
      tenantId,
      data: {
        orderId,
        oldStatus,
        newStatus,
        updatedBy: userId
      },
      timestamp: new Date()
    };

    this.emit('order:updated', event);
  }

  /**
   * Emit RFQ created event
   */
  async emitRFQCreated(rfqId: string, buyerId: string, tenantId: string, rfqData: any): Promise<void> {
    const event: RealtimeEvent = {
      type: 'rfq:created',
      userId: buyerId,
      tenantId,
      data: {
        rfqId,
        title: rfqData.title,
        submissionDeadline: rfqData.submissionDeadline,
        status: rfqData.status
      },
      timestamp: new Date()
    };

    this.emit('rfq:created', event);
  }

  /**
   * Emit RFQ quote received event
   */
  async emitRFQQuoteReceived(rfqId: string, supplierId: string, buyerId: string, tenantId: string, quoteData: any): Promise<void> {
    const event: RealtimeEvent = {
      type: 'rfq:quote_received',
      userId: buyerId,
      tenantId,
      data: {
        rfqId,
        supplierId,
        quoteAmount: quoteData.totalAmount,
        currency: quoteData.currency,
        validUntil: quoteData.validUntil
      },
      timestamp: new Date()
    };

    this.emit('rfq:quote_received', event);
  }

  /**
   * Emit shipment tracking update
   */
  async emitShipmentUpdate(orderId: string, shipmentId: string, trackingData: any, userId: string, tenantId: string): Promise<void> {
    const event: RealtimeEvent = {
      type: 'shipment:updated',
      userId,
      tenantId,
      data: {
        orderId,
        shipmentId,
        status: trackingData.status,
        location: trackingData.location,
        description: trackingData.description,
        timestamp: trackingData.timestamp
      },
      timestamp: new Date()
    };

    this.emit('shipment:updated', event);
  }

  /**
   * Emit chat message
   */
  async emitChatMessage(fromUserId: string, toUserId: string, tenantId: string, message: string, metadata?: any): Promise<void> {
    const event: RealtimeEvent = {
      type: 'chat:message',
      userId: toUserId,
      tenantId,
      data: {
        fromUserId,
        toUserId,
        message,
        metadata
      },
      timestamp: new Date()
    };

    this.emit('chat:message', event);
  }

  /**
   * Emit compliance alert
   */
  async emitComplianceAlert(alertType: string, severity: 'low' | 'medium' | 'high' | 'critical', userId: string, tenantId: string, data: any): Promise<void> {
    const event: RealtimeEvent = {
      type: 'compliance:alert',
      userId,
      tenantId,
      data: {
        alertType,
        severity,
        ...data
      },
      timestamp: new Date()
    };

    this.emit('compliance:alert', event);
  }

  /**
   * Event Handlers
   */

  private async handleOrderCreated(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, buyerId, supplierId, orderNumber, totalAmount, currency } = event.data;

      // Send notification to buyer
      await this.signalRService.sendOrderUpdate(orderId, 'created', buyerId, event.tenantId, {
        message: `Order ${orderNumber} created successfully`,
        totalAmount,
        currency
      });

      // Send notification to supplier
      await this.signalRService.sendOrderUpdate(orderId, 'created', supplierId, event.tenantId, {
        message: `New order ${orderNumber} received`,
        totalAmount,
        currency
      });

      // Broadcast to tenant group
      await this.signalRService.sendToGroup(`tenant_${event.tenantId}`, 'order_created', {
        orderId,
        orderNumber,
        totalAmount,
        currency
      });

      logger.info('Order created event handled', { orderId, orderNumber });
    } catch (error) {
      logger.error('Error handling order created event:', error);
    }
  }

  private async handleOrderUpdated(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, oldStatus, newStatus, updatedBy } = event.data;

      // Get order details
      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send notification to relevant parties
      const users = [order.buyer, order.supplier];
      for (const user of users) {
        await this.signalRService.sendOrderUpdate(orderId, newStatus, user._id.toString(), event.tenantId, {
          message: `Order ${order.orderNumber} status changed from ${oldStatus} to ${newStatus}`,
          oldStatus,
          newStatus
        });
      }

      logger.info('Order updated event handled', { orderId, oldStatus, newStatus });
    } catch (error) {
      logger.error('Error handling order updated event:', error);
    }
  }

  private async handleOrderApproved(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, approver, comments } = event.data;

      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send notification to buyer and supplier
      const users = [order.buyer, order.supplier];
      for (const user of users) {
        await this.signalRService.sendOrderUpdate(orderId, 'approved', user._id.toString(), event.tenantId, {
          message: `Order ${order.orderNumber} has been approved`,
          approver,
          comments
        });
      }

      logger.info('Order approved event handled', { orderId });
    } catch (error) {
      logger.error('Error handling order approved event:', error);
    }
  }

  private async handleOrderRejected(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, rejector, comments } = event.data;

      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send notification to buyer and supplier
      const users = [order.buyer, order.supplier];
      for (const user of users) {
        await this.signalRService.sendOrderUpdate(orderId, 'rejected', user._id.toString(), event.tenantId, {
          message: `Order ${order.orderNumber} has been rejected`,
          rejector,
          comments
        });
      }

      logger.info('Order rejected event handled', { orderId });
    } catch (error) {
      logger.error('Error handling order rejected event:', error);
    }
  }

  private async handleOrderShipped(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, shipmentId, carrier, trackingNumber } = event.data;

      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send notification to buyer
      await this.signalRService.sendOrderUpdate(orderId, 'shipped', order.buyer._id.toString(), event.tenantId, {
        message: `Order ${order.orderNumber} has been shipped`,
        shipmentId,
        carrier,
        trackingNumber
      });

      logger.info('Order shipped event handled', { orderId, shipmentId });
    } catch (error) {
      logger.error('Error handling order shipped event:', error);
    }
  }

  private async handleOrderDelivered(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, deliveryDate } = event.data;

      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send notification to buyer and supplier
      const users = [order.buyer, order.supplier];
      for (const user of users) {
        await this.signalRService.sendOrderUpdate(orderId, 'delivered', user._id.toString(), event.tenantId, {
          message: `Order ${order.orderNumber} has been delivered`,
          deliveryDate
        });
      }

      logger.info('Order delivered event handled', { orderId });
    } catch (error) {
      logger.error('Error handling order delivered event:', error);
    }
  }

  private async handleOrderCancelled(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, reason } = event.data;

      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send notification to buyer and supplier
      const users = [order.buyer, order.supplier];
      for (const user of users) {
        await this.signalRService.sendOrderUpdate(orderId, 'cancelled', user._id.toString(), event.tenantId, {
          message: `Order ${order.orderNumber} has been cancelled`,
          reason
        });
      }

      logger.info('Order cancelled event handled', { orderId });
    } catch (error) {
      logger.error('Error handling order cancelled event:', error);
    }
  }

  private async handleRFQCreated(event: RealtimeEvent): Promise<void> {
    try {
      const { rfqId, title, submissionDeadline } = event.data;

      // Broadcast to all suppliers in tenant
      await this.signalRService.sendToGroup(`tenant_${event.tenantId}`, 'rfq_created', {
        rfqId,
        title,
        submissionDeadline,
        message: `New RFQ available: ${title}`
      });

      logger.info('RFQ created event handled', { rfqId, title });
    } catch (error) {
      logger.error('Error handling RFQ created event:', error);
    }
  }

  private async handleRFQUpdated(event: RealtimeEvent): Promise<void> {
    try {
      const { rfqId, status } = event.data;

      const rfq = await RFQ.findById(rfqId);
      if (!rfq) return;

      // Send notification to buyer
      await this.signalRService.sendRFQUpdate(rfqId, status, rfq.buyer.toString(), event.tenantId, {
        message: `RFQ ${rfq.title} status updated to ${status}`
      });

      logger.info('RFQ updated event handled', { rfqId, status });
    } catch (error) {
      logger.error('Error handling RFQ updated event:', error);
    }
  }

  private async handleRFQQuoteReceived(event: RealtimeEvent): Promise<void> {
    try {
      const { rfqId, supplierId, quoteAmount, currency } = event.data;

      const rfq = await RFQ.findById(rfqId);
      if (!rfq) return;

      // Send notification to buyer
      await this.signalRService.sendRFQUpdate(rfqId, 'quote_received', rfq.buyer.toString(), event.tenantId, {
        message: `New quote received for RFQ ${rfq.title}`,
        supplierId,
        quoteAmount,
        currency
      });

      logger.info('RFQ quote received event handled', { rfqId, supplierId });
    } catch (error) {
      logger.error('Error handling RFQ quote received event:', error);
    }
  }

  private async handleRFQClosed(event: RealtimeEvent): Promise<void> {
    try {
      const { rfqId } = event.data;

      const rfq = await RFQ.findById(rfqId);
      if (!rfq) return;

      // Notify all suppliers who submitted quotes
      for (const quote of rfq.quotes) {
        await this.signalRService.sendRFQUpdate(rfqId, 'closed', quote.supplier.toString(), event.tenantId, {
          message: `RFQ ${rfq.title} has been closed`
        });
      }

      logger.info('RFQ closed event handled', { rfqId });
    } catch (error) {
      logger.error('Error handling RFQ closed event:', error);
    }
  }

  private async handleRFQAwarded(event: RealtimeEvent): Promise<void> {
    try {
      const { rfqId, winningSupplierId } = event.data;

      const rfq = await RFQ.findById(rfqId);
      if (!rfq) return;

      // Notify winning supplier
      await this.signalRService.sendRFQUpdate(rfqId, 'awarded', winningSupplierId, event.tenantId, {
        message: `Congratulations! You won the RFQ ${rfq.title}`,
        isWinner: true
      });

      // Notify other suppliers
      for (const quote of rfq.quotes) {
        if (quote.supplier.toString() !== winningSupplierId) {
          await this.signalRService.sendRFQUpdate(rfqId, 'awarded', quote.supplier.toString(), event.tenantId, {
            message: `RFQ ${rfq.title} has been awarded to another supplier`,
            isWinner: false
          });
        }
      }

      logger.info('RFQ awarded event handled', { rfqId, winningSupplierId });
    } catch (error) {
      logger.error('Error handling RFQ awarded event:', error);
    }
  }

  private async handleShipmentCreated(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, shipmentId, carrier, trackingNumber } = event.data;

      const order = await Order.findById(orderId);
      if (!order) return;

      await this.signalRService.sendShipmentUpdate(orderId, shipmentId, {
        status: 'created',
        carrier,
        trackingNumber,
        message: 'Shipment created'
      }, order.buyer.toString(), event.tenantId);

      logger.info('Shipment created event handled', { orderId, shipmentId });
    } catch (error) {
      logger.error('Error handling shipment created event:', error);
    }
  }

  private async handleShipmentUpdated(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, shipmentId, status, location, description } = event.data;

      const order = await Order.findById(orderId);
      if (!order) return;

      await this.signalRService.sendShipmentUpdate(orderId, shipmentId, {
        status,
        location,
        description
      }, order.buyer.toString(), event.tenantId);

      logger.info('Shipment updated event handled', { orderId, shipmentId, status });
    } catch (error) {
      logger.error('Error handling shipment updated event:', error);
    }
  }

  private async handleShipmentDelivered(event: RealtimeEvent): Promise<void> {
    try {
      const { orderId, shipmentId, deliveryDate } = event.data;

      const order = await Order.findById(orderId);
      if (!order) return;

      await this.signalRService.sendShipmentUpdate(orderId, shipmentId, {
        status: 'delivered',
        deliveryDate,
        message: 'Package delivered successfully'
      }, order.buyer.toString(), event.tenantId);

      logger.info('Shipment delivered event handled', { orderId, shipmentId });
    } catch (error) {
      logger.error('Error handling shipment delivered event:', error);
    }
  }

  private async handleChatMessage(event: RealtimeEvent): Promise<void> {
    try {
      const { fromUserId, toUserId, message, metadata } = event.data;

      await this.signalRService.sendChatMessage(fromUserId, toUserId, event.tenantId, message, metadata);

      logger.info('Chat message event handled', { fromUserId, toUserId });
    } catch (error) {
      logger.error('Error handling chat message event:', error);
    }
  }

  private async handleChatTyping(event: RealtimeEvent): Promise<void> {
    try {
      const { fromUserId, toUserId, isTyping } = event.data;

      await this.signalRService.sendToUser(toUserId, 'typing_indicator', {
        fromUserId,
        isTyping
      });

      logger.debug('Chat typing event handled', { fromUserId, toUserId, isTyping });
    } catch (error) {
      logger.error('Error handling chat typing event:', error);
    }
  }

  private async handleComplianceAlert(event: RealtimeEvent): Promise<void> {
    try {
      const { alertType, severity, ...data } = event.data;

      await this.signalRService.sendComplianceAlert(alertType, severity, event.userId, event.tenantId, data);

      logger.info('Compliance alert event handled', { alertType, severity });
    } catch (error) {
      logger.error('Error handling compliance alert event:', error);
    }
  }

  private async handleComplianceCheckFailed(event: RealtimeEvent): Promise<void> {
    try {
      const { checkType, failureReason, orderId } = event.data;

      await this.signalRService.sendComplianceAlert('check_failed', 'high', event.userId, event.tenantId, {
        checkType,
        failureReason,
        orderId,
        message: `Compliance check failed: ${failureReason}`
      });

      logger.info('Compliance check failed event handled', { checkType, orderId });
    } catch (error) {
      logger.error('Error handling compliance check failed event:', error);
    }
  }

  private async handleSystemNotification(event: RealtimeEvent): Promise<void> {
    try {
      const { title, message } = event.data;

      await this.signalRService.sendSystemNotification(title, message, event.tenantId, event.userId);

      logger.info('System notification event handled', { title });
    } catch (error) {
      logger.error('Error handling system notification event:', error);
    }
  }

  private async handleSystemMaintenance(event: RealtimeEvent): Promise<void> {
    try {
      const { maintenanceType, startTime, endTime, message } = event.data;

      await this.signalRService.sendToGroup(`tenant_${event.tenantId}`, 'system_maintenance', {
        maintenanceType,
        startTime,
        endTime,
        message
      });

      logger.info('System maintenance event handled', { maintenanceType });
    } catch (error) {
      logger.error('Error handling system maintenance event:', error);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.removeAllListeners();
    logger.info('RealtimeEventService cleaned up');
  }
}

// Singleton instance
let realtimeEventService: RealtimeEventService;

export const getRealtimeEventService = (): RealtimeEventService => {
  if (!realtimeEventService) {
    realtimeEventService = new RealtimeEventService();
  }
  return realtimeEventService;
};

export default getRealtimeEventService();
