import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';
import { sendEmail } from '../../utils/email';
import { sendSMS } from '../../utils/sms';
import { getServiceBusService, ServiceBusEvent } from '../azure/ServiceBusService';
import { getSignalRService } from '../azure/SignalRService';
import { getRealtimeEventService } from '../realtime/RealtimeEventService';

const logger = new Logger('EventHandlers');

export class EventHandlers {
  private readonly serviceBusService = getServiceBusService();
  private readonly realtimeEventService = getRealtimeEventService();
  private readonly signalRService = getSignalRService();

  /**
   * Initialize event handlers
   */
  async initialize(): Promise<void> {
    try {
      // Initialize service bus
      await this.serviceBusService.initialize();

      // Set up event listeners
      this.setupEventListeners();

      logger.info('Event handlers initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize event handlers:', error);
      throw error;
    }
  }

  /**
   * Set up event listeners for Service Bus events
   */
  private setupEventListeners(): void {
    // Order events
    this.serviceBusService.on('order.created', this.handleOrderCreated.bind(this));
    this.serviceBusService.on('order.updated', this.handleOrderUpdated.bind(this));
    this.serviceBusService.on('order.approved', this.handleOrderApproved.bind(this));
    this.serviceBusService.on('order.rejected', this.handleOrderRejected.bind(this));
    this.serviceBusService.on('order.cancelled', this.handleOrderCancelled.bind(this));
    this.serviceBusService.on('order.shipped', this.handleOrderShipped.bind(this));
    this.serviceBusService.on('order.delivered', this.handleOrderDelivered.bind(this));

    // RFQ events
    this.serviceBusService.on('rfq.created', this.handleRFQCreated.bind(this));
    this.serviceBusService.on('rfq.updated', this.handleRFQUpdated.bind(this));
    this.serviceBusService.on('rfq.quote_received', this.handleRFQQuoteReceived.bind(this));
    this.serviceBusService.on('rfq.closed', this.handleRFQClosed.bind(this));
    this.serviceBusService.on('rfq.awarded', this.handleRFQAwarded.bind(this));

    // Product events
    this.serviceBusService.on('product.created', this.handleProductCreated.bind(this));
    this.serviceBusService.on('product.updated', this.handleProductUpdated.bind(this));
    this.serviceBusService.on('product.deleted', this.handleProductDeleted.bind(this));
    this.serviceBusService.on('product.inventory_low', this.handleProductInventoryLow.bind(this));

    // User events
    this.serviceBusService.on('user.created', this.handleUserCreated.bind(this));
    this.serviceBusService.on('user.updated', this.handleUserUpdated.bind(this));
    this.serviceBusService.on('user.login', this.handleUserLogin.bind(this));
    this.serviceBusService.on('user.logout', this.handleUserLogout.bind(this));

    // Compliance events
    this.serviceBusService.on('compliance.violation', this.handleComplianceViolation.bind(this));
    this.serviceBusService.on('compliance.alert', this.handleComplianceAlert.bind(this));
    this.serviceBusService.on('compliance.check_failed', this.handleComplianceCheckFailed.bind(this));
    this.serviceBusService.on('compliance.certification_expired', this.handleCertificationExpired.bind(this));

    // Notification events
    this.serviceBusService.on('notification.email_sent', this.handleEmailSent.bind(this));
    this.serviceBusService.on('notification.sms_sent', this.handleSMSSent.bind(this));
    this.serviceBusService.on('notification.push_sent', this.handlePushSent.bind(this));

    // Analytics events
    this.serviceBusService.on('analytics.order_placed', this.handleOrderAnalytics.bind(this));
    this.serviceBusService.on('analytics.product_viewed', this.handleProductAnalytics.bind(this));
    this.serviceBusService.on('analytics.user_activity', this.handleUserAnalytics.bind(this));

    // Integration events
    this.serviceBusService.on('integration.erp_sync', this.handleERPSync.bind(this));
    this.serviceBusService.on('integration.payment_processed', this.handlePaymentProcessed.bind(this));
    this.serviceBusService.on('integration.inventory_sync', this.handleInventorySync.bind(this));

    // System events
    this.serviceBusService.on('system.maintenance_started', this.handleMaintenanceStarted.bind(this));
    this.serviceBusService.on('system.maintenance_ended', this.handleMaintenanceEnded.bind(this));
    this.serviceBusService.on('system.backup_completed', this.handleBackupCompleted.bind(this));

    logger.info('Event listeners configured');
  }

  /**
   * Order Event Handlers
   */
  private async handleOrderCreated(event: ServiceBusEvent): Promise<void> {
    try {
      const { orderId, buyerId, supplierId, orderNumber, totalAmount, currency } = event.data;

      // Send welcome email to both parties
      const [buyer, supplier] = await Promise.all([
        User.findById(buyerId),
        User.findById(supplierId)
      ]);

      if (buyer?.email) {
        await sendEmail({
          to: buyer.email,
          subject: `Order ${orderNumber} Created Successfully`,
          template: 'order_created_buyer',
          data: { orderNumber, totalAmount, currency }
        });
      }

      if (supplier?.email) {
        await sendEmail({
          to: supplier.email,
          subject: `New Order Received - ${orderNumber}`,
          template: 'order_created_supplier',
          data: { orderNumber, totalAmount, currency }
        });
      }

      // Send analytics event
      await this.serviceBusService.sendAnalyticsEvent('order_placed', orderId, 'order', event.tenantId, event.userId, {
        orderNumber,
        totalAmount,
        currency,
        buyerId,
        supplierId
      });

      logger.info('Order created event processed', { orderId, orderNumber });
    } catch (error) {
      logger.error('Error processing order created event:', error);
    }
  }

  private async handleOrderUpdated(event: ServiceBusEvent): Promise<void> {
    try {
      const { orderId, oldStatus, newStatus } = event.data;

      // Send real-time update
      await this.realtimeEventService.emitOrderStatusUpdate(orderId, oldStatus, newStatus, event.userId, event.tenantId);

      // Send analytics event
      await this.serviceBusService.sendAnalyticsEvent('order_status_changed', orderId, 'order', event.tenantId, event.userId, {
        oldStatus,
        newStatus
      });

      logger.info('Order updated event processed', { orderId, oldStatus, newStatus });
    } catch (error) {
      logger.error('Error processing order updated event:', error);
    }
  }

  private async handleOrderApproved(event: ServiceBusEvent): Promise<void> {
    try {
      const { orderId, approver, comments } = event.data;

      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send notification to buyer and supplier
      const notifications = [
        { userId: order.buyer._id, role: 'buyer' },
        { userId: order.supplier._id, role: 'supplier' }
      ];

      for (const notification of notifications) {
        await this.signalRService.sendNotification({
          type: 'order_update',
          userId: notification.userId.toString(),
          tenantId: event.tenantId,
          data: {
            orderId,
            orderNumber: order.orderNumber,
            status: 'approved',
            approver,
            comments,
            message: `Order ${order.orderNumber} has been approved`
          },
          timestamp: new Date()
        });
      }

      logger.info('Order approved event processed', { orderId, approver });
    } catch (error) {
      logger.error('Error processing order approved event:', error);
    }
  }

  private async handleOrderRejected(event: ServiceBusEvent): Promise<void> {
    try {
      const { orderId, rejector, comments } = event.data;

      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send notification to buyer and supplier
      const notifications = [
        { userId: order.buyer._id, role: 'buyer' },
        { userId: order.supplier._id, role: 'supplier' }
      ];

      for (const notification of notifications) {
        await this.signalRService.sendNotification({
          type: 'order_update',
          userId: notification.userId.toString(),
          tenantId: event.tenantId,
          data: {
            orderId,
            orderNumber: order.orderNumber,
            status: 'rejected',
            rejector,
            comments,
            message: `Order ${order.orderNumber} has been rejected`
          },
          timestamp: new Date()
        });
      }

      logger.info('Order rejected event processed', { orderId, rejector });
    } catch (error) {
      logger.error('Error processing order rejected event:', error);
    }
  }

  private async handleOrderCancelled(event: ServiceBusEvent): Promise<void> {
    try {
      const { orderId, reason } = event.data;

      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send cancellation notifications
      const [buyer, supplier] = await Promise.all([
        User.findById(order.buyer),
        User.findById(order.supplier)
      ]);

      if (buyer?.email) {
        await sendEmail({
          to: buyer.email,
          subject: `Order ${order.orderNumber} Cancelled`,
          template: 'order_cancelled',
          data: { orderNumber: order.orderNumber, reason }
        });
      }

      if (supplier?.email) {
        await sendEmail({
          to: supplier.email,
          subject: `Order ${order.orderNumber} Cancelled`,
          template: 'order_cancelled',
          data: { orderNumber: order.orderNumber, reason }
        });
      }

      logger.info('Order cancelled event processed', { orderId, reason });
    } catch (error) {
      logger.error('Error processing order cancelled event:', error);
    }
  }

  private async handleOrderShipped(event: ServiceBusEvent): Promise<void> {
    try {
      const { orderId, shipmentId, carrier, trackingNumber } = event.data;

      const order = await Order.findById(orderId).populate('buyer');
      if (!order) return;

      // Send shipping notification
      const buyer = await User.findById(order.buyer);
      if (buyer?.email) {
        await sendEmail({
          to: buyer.email,
          subject: `Order ${order.orderNumber} Shipped`,
          template: 'order_shipped',
          data: {
            orderNumber: order.orderNumber,
            carrier,
            trackingNumber,
            shipmentId
          }
        });
      }

      // Send SMS if high-value order
      if (order.totalAmount > 10000 && buyer?.phone) {
        await sendSMS({
          to: buyer.phone,
          message: `Your order ${order.orderNumber} has been shipped via ${carrier}. Track: ${trackingNumber}`
        });
      }

      logger.info('Order shipped event processed', { orderId, carrier, trackingNumber });
    } catch (error) {
      logger.error('Error processing order shipped event:', error);
    }
  }

  private async handleOrderDelivered(event: ServiceBusEvent): Promise<void> {
    try {
      const { orderId, deliveryDate } = event.data;

      const order = await Order.findById(orderId).populate('buyer supplier');
      if (!order) return;

      // Send delivery confirmation
      const [buyer, supplier] = await Promise.all([
        User.findById(order.buyer),
        User.findById(order.supplier)
      ]);

      if (buyer?.email) {
        await sendEmail({
          to: buyer.email,
          subject: `Order ${order.orderNumber} Delivered`,
          template: 'order_delivered',
          data: { orderNumber: order.orderNumber, deliveryDate }
        });
      }

      if (supplier?.email) {
        await sendEmail({
          to: supplier.email,
          subject: `Order ${order.orderNumber} Delivered Successfully`,
          template: 'order_delivered_supplier',
          data: { orderNumber: order.orderNumber, deliveryDate }
        });
      }

      // Send analytics event
      await this.serviceBusService.sendAnalyticsEvent('order_delivered', orderId, 'order', event.tenantId, event.userId, {
        orderNumber: order.orderNumber,
        deliveryDate,
        totalAmount: order.totalAmount
      });

      logger.info('Order delivered event processed', { orderId, deliveryDate });
    } catch (error) {
      logger.error('Error processing order delivered event:', error);
    }
  }

  /**
   * RFQ Event Handlers
   */
  private async handleRFQCreated(event: ServiceBusEvent): Promise<void> {
    try {
      const { rfqId, title, submissionDeadline } = event.data;

      // Notify potential suppliers
      const suppliers = await User.find({
        tenantId: event.tenantId,
        role: 'supplier',
        isActive: true
      });

      for (const supplier of suppliers) {
        if (supplier.email) {
          await sendEmail({
            to: supplier.email,
            subject: `New RFQ Available: ${title}`,
            template: 'rfq_created',
            data: { rfqId, title, submissionDeadline }
          });
        }
      }

      logger.info('RFQ created event processed', { rfqId, title });
    } catch (error) {
      logger.error('Error processing RFQ created event:', error);
    }
  }

  private async handleRFQQuoteReceived(event: ServiceBusEvent): Promise<void> {
    try {
      const { rfqId, supplierId, quoteAmount, currency } = event.data;

      const rfq = await RFQ.findById(rfqId).populate('buyer');
      if (!rfq) return;

      // Notify buyer
      const buyer = await User.findById(rfq.buyer);
      if (buyer?.email) {
        await sendEmail({
          to: buyer.email,
          subject: `New Quote Received for RFQ: ${rfq.title}`,
          template: 'rfq_quote_received',
          data: {
            rfqTitle: rfq.title,
            quoteAmount,
            currency,
            rfqId
          }
        });
      }

      // Send real-time notification
      await this.signalRService.sendNotification({
        type: 'rfq_update',
        userId: rfq.buyer.toString(),
        tenantId: event.tenantId,
        data: {
          rfqId,
          rfqTitle: rfq.title,
          supplierId,
          quoteAmount,
          currency,
          message: `New quote received for RFQ ${rfq.title}`
        },
        timestamp: new Date()
      });

      logger.info('RFQ quote received event processed', { rfqId, supplierId, quoteAmount });
    } catch (error) {
      logger.error('Error processing RFQ quote received event:', error);
    }
  }

  private async handleRFQClosed(event: ServiceBusEvent): Promise<void> {
    try {
      const { rfqId } = event.data;

      const rfq = await RFQ.findById(rfqId);
      if (!rfq) return;

      // Notify all suppliers who submitted quotes
      for (const quote of rfq.quotes) {
        const supplier = await User.findById(quote.supplier);
        if (supplier?.email) {
          await sendEmail({
            to: supplier.email,
            subject: `RFQ Closed: ${rfq.title}`,
            template: 'rfq_closed',
            data: { rfqTitle: rfq.title, rfqId }
          });
        }
      }

      logger.info('RFQ closed event processed', { rfqId });
    } catch (error) {
      logger.error('Error processing RFQ closed event:', error);
    }
  }

  private async handleRFQAwarded(event: ServiceBusEvent): Promise<void> {
    try {
      const { rfqId, winningSupplierId, awardAmount } = event.data;

      const rfq = await RFQ.findById(rfqId);
      if (!rfq) return;

      // Notify winning supplier
      const winningSupplier = await User.findById(winningSupplierId);
      if (winningSupplier?.email) {
        await sendEmail({
          to: winningSupplier.email,
          subject: `Congratulations! You won the RFQ: ${rfq.title}`,
          template: 'rfq_won',
          data: {
            rfqTitle: rfq.title,
            awardAmount,
            currency: rfq.currency,
            rfqId
          }
        });
      }

      // Notify other suppliers
      for (const quote of rfq.quotes) {
        if (quote.supplier.toString() !== winningSupplierId) {
          const supplier = await User.findById(quote.supplier);
          if (supplier?.email) {
            await sendEmail({
              to: supplier.email,
              subject: `RFQ Update: ${rfq.title}`,
              template: 'rfq_not_won',
              data: { rfqTitle: rfq.title, rfqId }
            });
          }
        }
      }

      logger.info('RFQ awarded event processed', { rfqId, winningSupplierId, awardAmount });
    } catch (error) {
      logger.error('Error processing RFQ awarded event:', error);
    }
  }

  /**
   * Compliance Event Handlers
   */
  private async handleComplianceViolation(event: ServiceBusEvent): Promise<void> {
    try {
      const { violationType, severity, orderId, description } = event.data;

      // Send compliance alert
      await this.signalRService.sendComplianceAlert(
        violationType,
        severity,
        event.userId,
        event.tenantId,
        { orderId, description }
      );

      // Send email to compliance officers
      const complianceOfficers = await User.find({
        tenantId: event.tenantId,
        role: { $in: ['admin', 'compliance'] }
      });

      for (const officer of complianceOfficers) {
        if (officer.email) {
          await sendEmail({
            to: officer.email,
            subject: `Compliance Violation: ${violationType}`,
            template: 'compliance_violation',
            data: {
              violationType,
              severity,
              orderId,
              description
            }
          });
        }
      }

      logger.warn('Compliance violation event processed', { violationType, severity, orderId });
    } catch (error) {
      logger.error('Error processing compliance violation event:', error);
    }
  }

  private async handleComplianceAlert(event: ServiceBusEvent): Promise<void> {
    try {
      const { alertType, severity, message } = event.data;

      // Send system notification
      await this.signalRService.sendSystemNotification(
        `Compliance Alert: ${alertType}`,
        message,
        event.tenantId,
        event.userId
      );

      logger.info('Compliance alert event processed', { alertType, severity });
    } catch (error) {
      logger.error('Error processing compliance alert event:', error);
    }
  }

  /**
   * System Event Handlers
   */
  private async handleMaintenanceStarted(event: ServiceBusEvent): Promise<void> {
    try {
      const { maintenanceType, startTime, estimatedDuration } = event.data;

      // Broadcast maintenance notification
      await this.signalRService.sendToGroup(
        `tenant_${event.tenantId}`,
        'system_maintenance',
        {
          type: 'maintenance_started',
          maintenanceType,
          startTime,
          estimatedDuration,
          message: `System maintenance has started: ${maintenanceType}`
        }
      );

      logger.info('Maintenance started event processed', { maintenanceType, startTime });
    } catch (error) {
      logger.error('Error processing maintenance started event:', error);
    }
  }

  private async handleMaintenanceEnded(event: ServiceBusEvent): Promise<void> {
    try {
      const { maintenanceType, endTime } = event.data;

      // Broadcast maintenance completion
      await this.signalRService.sendToGroup(
        `tenant_${event.tenantId}`,
        'system_maintenance',
        {
          type: 'maintenance_ended',
          maintenanceType,
          endTime,
          message: `System maintenance completed: ${maintenanceType}`
        }
      );

      logger.info('Maintenance ended event processed', { maintenanceType, endTime });
    } catch (error) {
      logger.error('Error processing maintenance ended event:', error);
    }
  }

  /**
   * Placeholder handlers for other events
   */
  private async handleProductCreated(event: ServiceBusEvent): Promise<void> {
    logger.info('Product created event processed', { productId: event.entityId });
  }

  private async handleProductUpdated(event: ServiceBusEvent): Promise<void> {
    logger.info('Product updated event processed', { productId: event.entityId });
  }

  private async handleProductDeleted(event: ServiceBusEvent): Promise<void> {
    logger.info('Product deleted event processed', { productId: event.entityId });
  }

  private async handleProductInventoryLow(event: ServiceBusEvent): Promise<void> {
    logger.warn('Product inventory low event processed', { productId: event.entityId });
  }

  private async handleUserCreated(event: ServiceBusEvent): Promise<void> {
    logger.info('User created event processed', { userId: event.entityId });
  }

  private async handleUserUpdated(event: ServiceBusEvent): Promise<void> {
    logger.info('User updated event processed', { userId: event.entityId });
  }

  private async handleUserLogin(event: ServiceBusEvent): Promise<void> {
    logger.info('User login event processed', { userId: event.entityId });
  }

  private async handleUserLogout(event: ServiceBusEvent): Promise<void> {
    logger.info('User logout event processed', { userId: event.entityId });
  }

  private async handleComplianceCheckFailed(event: ServiceBusEvent): Promise<void> {
    logger.warn('Compliance check failed event processed', { entityId: event.entityId });
  }

  private async handleCertificationExpired(event: ServiceBusEvent): Promise<void> {
    logger.warn('Certification expired event processed', { entityId: event.entityId });
  }

  private async handleEmailSent(event: ServiceBusEvent): Promise<void> {
    logger.info('Email sent event processed', { notificationId: event.entityId });
  }

  private async handleSMSSent(event: ServiceBusEvent): Promise<void> {
    logger.info('SMS sent event processed', { notificationId: event.entityId });
  }

  private async handlePushSent(event: ServiceBusEvent): Promise<void> {
    logger.info('Push notification sent event processed', { notificationId: event.entityId });
  }

  private async handleOrderAnalytics(event: ServiceBusEvent): Promise<void> {
    logger.info('Order analytics event processed', { orderId: event.entityId });
  }

  private async handleProductAnalytics(event: ServiceBusEvent): Promise<void> {
    logger.info('Product analytics event processed', { productId: event.entityId });
  }

  private async handleUserAnalytics(event: ServiceBusEvent): Promise<void> {
    logger.info('User analytics event processed', { userId: event.entityId });
  }

  private async handleERPSync(event: ServiceBusEvent): Promise<void> {
    logger.info('ERP sync event processed', { entityId: event.entityId });
  }

  private async handlePaymentProcessed(event: ServiceBusEvent): Promise<void> {
    logger.info('Payment processed event processed', { paymentId: event.entityId });
  }

  private async handleInventorySync(event: ServiceBusEvent): Promise<void> {
    logger.info('Inventory sync event processed', { entityId: event.entityId });
  }

  private async handleRFQUpdated(event: ServiceBusEvent): Promise<void> {
    logger.info('RFQ updated event processed', { rfqId: event.entityId });
  }

  private async handleBackupCompleted(event: ServiceBusEvent): Promise<void> {
    logger.info('Backup completed event processed', { entityId: event.entityId });
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.serviceBusService.close();
    logger.info('Event handlers cleaned up');
  }
}

// Singleton instance
let eventHandlers: EventHandlers;

export const getEventHandlers = (): EventHandlers => {
  if (!eventHandlers) {
    eventHandlers = new EventHandlers();
  }
  return eventHandlers;
};

export default getEventHandlers();
