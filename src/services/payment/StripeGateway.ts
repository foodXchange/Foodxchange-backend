import Stripe from 'stripe';

import { PaymentGateway, PaymentRequest, PaymentResponse, RefundRequest, RefundResponse } from './PaymentGateway';

export class StripeGateway extends PaymentGateway {
  private readonly stripe: Stripe;

  constructor(config: { secretKey: string; publishableKey: string; webhookSecret: string }) {
    super(config);
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2023-10-16',
      typescript: true
    });
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      this.validateAmount(request.amount);
      this.validateCurrency(request.currency);

      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: request.amount,
        currency: request.currency.toLowerCase(),
        payment_method_data: this.buildPaymentMethodData(request.paymentMethod),
        confirm: true,
        description: request.description,
        statement_descriptor: request.statementDescriptor?.substring(0, 22),
        metadata: request.metadata || {},
        receipt_email: request.customer.email
      };

      // Add billing details if provided
      if (request.billing) {
        paymentIntentParams.shipping = {
          name: request.customer.name,
          address: {
            line1: request.billing.address.line1,
            line2: request.billing.address.line2 || null,
            city: request.billing.address.city,
            state: request.billing.address.state || null,
            postal_code: request.billing.address.postalCode,
            country: request.billing.address.country
          }
        };
      }

      const paymentIntent = await this.stripe.paymentIntents.create(paymentIntentParams);

      return this.mapStripeResponse(paymentIntent);
    } catch (error) {
      this.logger.error('Stripe payment failed:', error);
      return {
        success: false,
        status: 'failed',
        amount: request.amount,
        currency: request.currency,
        error: this.formatStripeError(error)
      };
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: request.transactionId,
        amount: request.amount,
        reason: this.mapRefundReason(request.reason),
        metadata: request.metadata || {}
      });

      return {
        success: true,
        refundId: refund.id,
        status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
        amount: refund.amount,
        currency: refund.currency.toUpperCase()
      };
    } catch (error) {
      this.logger.error('Stripe refund failed:', error);
      return {
        success: false,
        status: 'failed',
        amount: request.amount,
        currency: 'USD',
        error: this.formatStripeError(error)
      };
    }
  }

  async getTransaction(transactionId: string): Promise<any> {
    try {
      return await this.stripe.paymentIntents.retrieve(transactionId);
    } catch (error) {
      this.logger.error('Failed to retrieve Stripe transaction:', error);
      throw error;
    }
  }

  async createCustomer(customer: any): Promise<any> {
    try {
      return await this.stripe.customers.create({
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        metadata: customer.metadata || {}
      });
    } catch (error) {
      this.logger.error('Failed to create Stripe customer:', error);
      throw error;
    }
  }

  async updateCustomer(customerId: string, updates: any): Promise<any> {
    try {
      return await this.stripe.customers.update(customerId, updates);
    } catch (error) {
      this.logger.error('Failed to update Stripe customer:', error);
      throw error;
    }
  }

  async deleteCustomer(customerId: string): Promise<void> {
    try {
      await this.stripe.customers.del(customerId);
    } catch (error) {
      this.logger.error('Failed to delete Stripe customer:', error);
      throw error;
    }
  }

  async listPaymentMethods(customerId: string): Promise<any[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card'
      });
      return paymentMethods.data;
    } catch (error) {
      this.logger.error('Failed to list Stripe payment methods:', error);
      throw error;
    }
  }

  async attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<any> {
    try {
      return await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });
    } catch (error) {
      this.logger.error('Failed to attach Stripe payment method:', error);
      throw error;
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    try {
      await this.stripe.paymentMethods.detach(paymentMethodId);
    } catch (error) {
      this.logger.error('Failed to detach Stripe payment method:', error);
      throw error;
    }
  }

  async createPaymentIntent(amount: number, currency: string, options: any = {}): Promise<any> {
    try {
      return await this.stripe.paymentIntents.create({
        amount,
        currency: currency.toLowerCase(),
        ...options
      });
    } catch (error) {
      this.logger.error('Failed to create Stripe payment intent:', error);
      throw error;
    }
  }

  async confirmPaymentIntent(paymentIntentId: string, paymentMethod?: any): Promise<any> {
    try {
      const params: any = {};
      if (paymentMethod) {
        params.payment_method = paymentMethod;
      }
      return await this.stripe.paymentIntents.confirm(paymentIntentId, params);
    } catch (error) {
      this.logger.error('Failed to confirm Stripe payment intent:', error);
      throw error;
    }
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<any> {
    try {
      return await this.stripe.paymentIntents.cancel(paymentIntentId);
    } catch (error) {
      this.logger.error('Failed to cancel Stripe payment intent:', error);
      throw error;
    }
  }

  verifyWebhookSignature(payload: any, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(payload, signature, this.config.webhookSecret);
      return true;
    } catch (error) {
      this.logger.error('Invalid Stripe webhook signature:', error);
      return false;
    }
  }

  async handleWebhook(event: any): Promise<void> {
    try {
      const { type, data } = event;

      switch (type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(data.object);
          break;
        case 'charge.dispute.created':
          await this.handleDisputeCreated(data.object);
          break;
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(data.object);
          break;
        default:
          this.logger.info(`Unhandled Stripe webhook event: ${type}`);
      }
    } catch (error) {
      this.logger.error('Error handling Stripe webhook:', error);
      throw error;
    }
  }

  private buildPaymentMethodData(paymentMethod: any): Stripe.PaymentIntentCreateParams.PaymentMethodData {
    switch (paymentMethod.type) {
      case 'credit_card':
      case 'debit_card':
        return {
          type: 'card',
          card: {
            number: this.sanitizeCardNumber(paymentMethod.cardNumber),
            exp_month: parseInt(paymentMethod.expiryMonth),
            exp_year: parseInt(paymentMethod.expiryYear),
            cvc: paymentMethod.cvv
          }
        };
      case 'bank_transfer':
        return {
          type: 'us_bank_account',
          us_bank_account: {
            routing_number: paymentMethod.routingNumber,
            account_number: paymentMethod.bankAccount,
            account_holder_type: 'individual',
            account_type: 'checking'
          }
        };
      default:
        throw new Error(`Unsupported payment method type: ${paymentMethod.type}`);
    }
  }

  private mapStripeResponse(paymentIntent: Stripe.PaymentIntent): PaymentResponse {
    const response: PaymentResponse = {
      success: paymentIntent.status === 'succeeded',
      transactionId: paymentIntent.id,
      status: this.mapStripeStatus(paymentIntent.status),
      amount: paymentIntent.amount,
      currency: paymentIntent.currency.toUpperCase(),
      gatewayResponse: paymentIntent
    };

    if (paymentIntent.status === 'requires_action') {
      response.requiresAction = {
        type: '3ds_authentication',
        clientSecret: paymentIntent.client_secret || undefined
      };
    }

    return response;
  }

  private mapStripeStatus(status: string): 'succeeded' | 'pending' | 'failed' | 'requires_action' {
    switch (status) {
      case 'succeeded':
        return 'succeeded';
      case 'processing':
      case 'requires_capture':
        return 'pending';
      case 'requires_action':
      case 'requires_confirmation':
        return 'requires_action';
      case 'canceled':
      case 'requires_payment_method':
        return 'failed';
      default:
        return 'pending';
    }
  }

  private mapRefundReason(reason: string): Stripe.RefundCreateParams.Reason {
    const reasonMap: Record<string, Stripe.RefundCreateParams.Reason> = {
      'duplicate': 'duplicate',
      'fraudulent': 'fraudulent',
      'requested_by_customer': 'requested_by_customer'
    };
    return reasonMap[reason] || 'requested_by_customer';
  }

  private formatStripeError(error: any): { code: string; message: string; declineCode?: string } {
    if (error.type === 'StripeCardError') {
      return {
        code: error.code || 'card_error',
        message: error.message,
        declineCode: error.decline_code
      };
    }
    return this.formatError(error);
  }

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    this.logger.info(`Payment succeeded: ${paymentIntent.id}`);
    // Implementation would update payment status in database
  }

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    this.logger.warn(`Payment failed: ${paymentIntent.id}`);
    // Implementation would update payment status in database
  }

  private async handleDisputeCreated(charge: Stripe.Charge): Promise<void> {
    this.logger.warn(`Dispute created for charge: ${charge.id}`);
    // Implementation would handle dispute process
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    this.logger.info(`Invoice payment succeeded: ${invoice.id}`);
    // Implementation would handle invoice payment
  }
}
