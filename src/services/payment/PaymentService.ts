import { EventEmitter } from 'events';

import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/monitoring/metrics';
import { logAudit } from '../../middleware/audit';
import { Payment, IPayment } from '../../models/Payment';

import { PaymentGateway, PaymentRequest, PaymentResponse, RefundRequest } from './PaymentGateway';
import { PayPalGateway } from './PayPalGateway';
import { StripeGateway } from './StripeGateway';


export interface PaymentProcessingRequest {
  orderId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  paymentMethod: {
    type: 'credit_card' | 'debit_card' | 'bank_transfer' | 'paypal' | 'stripe';
    token?: string;
    cardNumber?: string;
    expiryMonth?: string;
    expiryYear?: string;
    cvv?: string;
    last4?: string;
    brand?: string;
  };
  customer: {
    id: string;
    email: string;
    name: string;
    phone?: string;
  };
  billing?: {
    name: string;
    email: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
  };
  metadata?: {
    invoiceNumber?: string;
    purchaseOrder?: string;
    description?: string;
    [key: string]: any;
  };
}

export interface PaymentResult {
  success: boolean;
  payment?: IPayment;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  requiresAction?: {
    type: string;
    redirectUrl?: string;
    clientSecret?: string;
  };
}

export class PaymentService extends EventEmitter {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly gateways: Map<string, PaymentGateway>;
  private readonly defaultGateway: string;

  constructor() {
    super();
    this.logger = new Logger('PaymentService');
    this.metrics = new MetricsService();
    this.gateways = new Map();
    this.defaultGateway = 'stripe';

    this.initializeGateways();
  }

  private initializeGateways(): void {
    try {
      // Initialize Stripe
      if (process.env.STRIPE_SECRET_KEY) {
        const stripeGateway = new StripeGateway({
          secretKey: process.env.STRIPE_SECRET_KEY,
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
        });
        this.gateways.set('stripe', stripeGateway);
        this.gateways.set('credit_card', stripeGateway);
        this.gateways.set('debit_card', stripeGateway);
      }

      // Initialize PayPal
      if (process.env.PAYPAL_CLIENT_ID) {
        const paypalGateway = new PayPalGateway({
          clientId: process.env.PAYPAL_CLIENT_ID,
          clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
          sandbox: process.env.NODE_ENV !== 'production',
          webhookId: process.env.PAYPAL_WEBHOOK_ID
        });
        this.gateways.set('paypal', paypalGateway);
      }

      this.logger.info(`Payment gateways initialized: ${Array.from(this.gateways.keys()).join(', ')}`);
    } catch (error) {
      this.logger.error('Failed to initialize payment gateways:', error);
    }
  }

  async processPayment(request: PaymentProcessingRequest): Promise<PaymentResult> {
    const startTime = Date.now();

    try {
      // Validate request
      this.validatePaymentRequest(request);

      // Create payment record
      const payment = await this.createPaymentRecord(request);

      // Get appropriate gateway
      const gateway = this.getGateway(request.paymentMethod.type);
      if (!gateway) {
        throw new Error(`No gateway available for payment method: ${request.paymentMethod.type}`);
      }

      // Process payment through gateway
      const gatewayRequest: PaymentRequest = {
        amount: request.amount,
        currency: request.currency,
        paymentMethod: request.paymentMethod,
        customer: request.customer,
        billing: request.billing,
        metadata: request.metadata,
        description: `Payment for order ${request.orderId}`,
        statementDescriptor: 'FOODXCHANGE'
      };

      const gatewayResponse = await gateway.processPayment(gatewayRequest);

      // Update payment record with gateway response
      await this.updatePaymentWithResponse(payment, gatewayResponse);

      // Record metrics
      const duration = Date.now() - startTime;
      this.metrics.increment('payments_processed');
      this.metrics.recordTimer('payment_processing_duration', duration);

      if (gatewayResponse.success) {
        this.metrics.increment('payments_successful');
        this.emit('payment_completed', { payment, gatewayResponse });
      } else {
        this.metrics.increment('payments_failed');
        this.emit('payment_failed', { payment, gatewayResponse });
      }

      return {
        success: gatewayResponse.success,
        payment,
        error: gatewayResponse.error,
        requiresAction: gatewayResponse.requiresAction
      };

    } catch (error) {
      this.logger.error('Payment processing failed:', error);
      this.metrics.increment('payments_error');

      return {
        success: false,
        error: {
          code: 'PAYMENT_PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Payment processing failed',
          details: error
        }
      };
    }
  }

  async refundPayment(paymentId: string, amount: number, reason: string, requestedBy: string): Promise<PaymentResult> {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (!payment.canRefund(amount)) {
        throw new Error('Cannot refund this amount');
      }

      // Initialize refund in database
      await payment.initiateRefund(amount, reason);

      // Get gateway and process refund
      const gateway = this.getGateway(payment.paymentMethod.type);
      if (!gateway || !payment.transactionId) {
        throw new Error('Cannot process refund - gateway or transaction ID not available');
      }

      const refundRequest: RefundRequest = {
        transactionId: payment.transactionId,
        amount,
        reason,
        metadata: {
          paymentId: payment._id.toString(),
          requestedBy
        }
      };

      const refundResponse = await gateway.refundPayment(refundRequest);

      if (refundResponse.success) {
        // Complete refund in database
        const refundIndex = payment.refunds.length - 1;
        await payment.completeRefund(refundIndex, refundResponse.refundId);

        this.metrics.increment('refunds_successful');
        this.emit('refund_completed', { payment, refundResponse });
      } else {
        this.metrics.increment('refunds_failed');
        this.emit('refund_failed', { payment, refundResponse });
      }

      return {
        success: refundResponse.success,
        payment,
        error: refundResponse.error ? {
          code: refundResponse.error.code,
          message: refundResponse.error.message
        } : undefined
      };

    } catch (error) {
      this.logger.error('Refund processing failed:', error);
      this.metrics.increment('refunds_error');

      return {
        success: false,
        error: {
          code: 'REFUND_PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Refund processing failed'
        }
      };
    }
  }

  async getPaymentDetails(paymentId: string): Promise<IPayment | null> {
    try {
      return await Payment.findById(paymentId)
        .populate('buyerId', 'firstName lastName email')
        .populate('sellerId', 'firstName lastName email')
        .populate('orderId');
    } catch (error) {
      this.logger.error('Failed to get payment details:', error);
      throw error;
    }
  }

  async getPaymentsByOrder(orderId: string): Promise<IPayment[]> {
    try {
      return await Payment.find({ orderId })
        .sort({ createdAt: -1 });
    } catch (error) {
      this.logger.error('Failed to get payments by order:', error);
      throw error;
    }
  }

  async getPaymentsByUser(userId: string, role: 'buyer' | 'seller'): Promise<IPayment[]> {
    try {
      const field = role === 'buyer' ? 'buyerId' : 'sellerId';
      return await Payment.find({ [field]: userId })
        .sort({ createdAt: -1 })
        .limit(100);
    } catch (error) {
      this.logger.error('Failed to get payments by user:', error);
      throw error;
    }
  }

  async getPaymentStatistics(startDate: Date, endDate: Date): Promise<any> {
    try {
      const [revenueStats, methodStats] = await Promise.all([
        Payment.getRevenueStats(startDate, endDate),
        Payment.getPaymentMethodStats()
      ]);

      return {
        revenue: revenueStats[0] || {
          totalRevenue: 0,
          totalFees: 0,
          netRevenue: 0,
          transactionCount: 0,
          avgTransactionValue: 0
        },
        paymentMethods: methodStats
      };
    } catch (error) {
      this.logger.error('Failed to get payment statistics:', error);
      throw error;
    }
  }

  async handleWebhook(provider: string, payload: any, signature: string): Promise<void> {
    try {
      const gateway = this.gateways.get(provider);
      if (!gateway) {
        throw new Error(`No gateway found for provider: ${provider}`);
      }

      // Verify webhook signature
      if (!gateway.verifyWebhookSignature(payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      // Handle webhook event
      await gateway.handleWebhook(payload);

      this.metrics.increment(`webhook_${provider}_processed`);
      this.logger.info(`Webhook processed successfully for ${provider}`);

    } catch (error) {
      this.logger.error(`Failed to handle ${provider} webhook:`, error);
      this.metrics.increment(`webhook_${provider}_error`);
      throw error;
    }
  }

  async retryFailedPayments(): Promise<void> {
    try {
      const failedPayments = await Payment.findPendingPayments(
        new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
      );

      for (const payment of failedPayments) {
        if (payment.retryCount < 3) {
          await this.retryPayment(payment);
        }
      }

      this.logger.info(`Retry process completed for ${failedPayments.length} payments`);
    } catch (error) {
      this.logger.error('Failed to retry payments:', error);
    }
  }

  private validatePaymentRequest(request: PaymentProcessingRequest): void {
    if (!request.orderId || !request.buyerId || !request.sellerId) {
      throw new Error('Order ID, buyer ID, and seller ID are required');
    }

    if (!request.amount || request.amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (!request.currency) {
      throw new Error('Currency is required');
    }

    if (!request.paymentMethod?.type) {
      throw new Error('Payment method type is required');
    }

    if (!request.customer?.email || !request.customer?.name) {
      throw new Error('Customer email and name are required');
    }
  }

  private async createPaymentRecord(request: PaymentProcessingRequest): Promise<IPayment> {
    const payment = new Payment({
      orderId: request.orderId,
      buyerId: request.buyerId,
      sellerId: request.sellerId,
      amount: request.amount,
      currency: request.currency,
      status: 'pending',
      paymentMethod: {
        type: request.paymentMethod.type,
        last4: request.paymentMethod.last4,
        brand: request.paymentMethod.brand
      },
      billing: request.billing,
      metadata: request.metadata,
      compliance: {
        pciCompliant: true
      }
    });

    // Calculate fees
    payment.calculateFees();

    await payment.save();
    return payment;
  }

  private async updatePaymentWithResponse(payment: IPayment, response: PaymentResponse): Promise<void> {
    payment.transactionId = response.transactionId;
    payment.status = this.mapResponseStatus(response.status);
    payment.gatewayResponse = {
      id: response.transactionId || '',
      status: response.status,
      message: response.error?.message
    };

    if (response.success && response.status === 'succeeded') {
      payment.completedAt = new Date();
    }

    if (response.error) {
      payment.failureReason = response.error.message;
    }

    await payment.addTimelineEvent(
      response.success ? 'payment_processed' : 'payment_failed',
      response.error?.message
    );
  }

  private mapResponseStatus(status: string): IPayment['status'] {
    switch (status) {
      case 'succeeded':
        return 'completed';
      case 'pending':
      case 'requires_action':
        return 'processing';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  private getGateway(paymentMethodType: string): PaymentGateway | undefined {
    return this.gateways.get(paymentMethodType) || this.gateways.get(this.defaultGateway);
  }

  private async retryPayment(payment: IPayment): Promise<void> {
    try {
      payment.retryCount = (payment.retryCount || 0) + 1;
      payment.lastRetryAt = new Date();
      await payment.save();

      // Implementation would retry the payment
      this.logger.info(`Retrying payment ${payment._id}, attempt ${payment.retryCount}`);
    } catch (error) {
      this.logger.error(`Failed to retry payment ${payment._id}:`, error);
    }
  }
}

export const paymentService = new PaymentService();
