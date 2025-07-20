import axios, { AxiosInstance } from 'axios';

import { PaymentGateway, PaymentRequest, PaymentResponse, RefundRequest, RefundResponse } from './PaymentGateway';

export class PayPalGateway extends PaymentGateway {
  private readonly client: AxiosInstance;
  private accessToken?: string;
  private tokenExpiresAt?: Date;

  constructor(config: { clientId: string; clientSecret: string; sandbox?: boolean; webhookId?: string }) {
    super(config);

    const baseURL = config.sandbox
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      this.validateAmount(request.amount);
      this.validateCurrency(request.currency);

      await this.ensureAccessToken();

      // Create PayPal order
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: request.currency,
            value: (request.amount / 100).toFixed(2) // Convert from cents
          },
          description: request.description,
          custom_id: request.metadata?.orderId,
          invoice_id: request.metadata?.invoiceId
        }],
        payer: {
          email_address: request.customer.email,
          name: {
            given_name: request.customer.name.split(' ')[0],
            surname: request.customer.name.split(' ').slice(1).join(' ')
          }
        },
        application_context: {
          return_url: request.metadata?.returnUrl,
          cancel_url: request.metadata?.cancelUrl,
          brand_name: 'FoodXchange',
          landing_page: 'BILLING',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW'
        }
      };

      const response = await this.client.post('/v2/checkout/orders', orderData, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });

      const order = response.data;

      // For immediate capture, we need to capture the order
      if (request.paymentMethod.token) {
        const captureResponse = await this.captureOrder(order.id);
        return this.mapPayPalResponse(captureResponse, request.amount, request.currency);
      }

      // Return approval URL for redirect flow
      const approvalUrl = order.links.find((link: any) => link.rel === 'approve')?.href;

      return {
        success: true,
        transactionId: order.id,
        status: 'requires_action',
        amount: request.amount,
        currency: request.currency,
        gatewayResponse: order,
        requiresAction: {
          type: 'bank_approval',
          redirectUrl: approvalUrl
        }
      };
    } catch (error) {
      this.logger.error('PayPal payment failed:', error);
      return {
        success: false,
        status: 'failed',
        amount: request.amount,
        currency: request.currency,
        error: this.formatPayPalError(error)
      };
    }
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    try {
      await this.ensureAccessToken();

      const refundData = {
        amount: {
          currency_code: 'USD', // This should be extracted from the original transaction
          value: (request.amount / 100).toFixed(2)
        },
        note_to_payer: request.reason
      };

      const response = await this.client.post(
        `/v2/payments/captures/${request.transactionId}/refund`,
        refundData,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );

      const refund = response.data;

      return {
        success: true,
        refundId: refund.id,
        status: refund.status === 'COMPLETED' ? 'succeeded' : 'pending',
        amount: Math.round(parseFloat(refund.amount.value) * 100),
        currency: refund.amount.currency_code
      };
    } catch (error) {
      this.logger.error('PayPal refund failed:', error);
      return {
        success: false,
        status: 'failed',
        amount: request.amount,
        currency: 'USD',
        error: this.formatPayPalError(error)
      };
    }
  }

  async getTransaction(transactionId: string): Promise<any> {
    try {
      await this.ensureAccessToken();
      const response = await this.client.get(`/v2/checkout/orders/${transactionId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to retrieve PayPal transaction:', error);
      throw error;
    }
  }

  async createCustomer(customer: any): Promise<any> {
    // PayPal doesn't have a direct customer creation API like Stripe
    // Customer information is typically passed with each transaction
    return {
      id: `paypal_customer_${Date.now()}`,
      email: customer.email,
      name: customer.name,
      phone: customer.phone
    };
  }

  async updateCustomer(customerId: string, updates: any): Promise<any> {
    // PayPal customer updates would be handled differently
    return { customerId, updates };
  }

  async deleteCustomer(customerId: string): Promise<void> {
    // PayPal doesn't require customer deletion
    this.logger.info(`PayPal customer deletion requested: ${customerId}`);
  }

  async listPaymentMethods(customerId: string): Promise<any[]> {
    // PayPal handles payment methods differently
    return [];
  }

  async attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<any> {
    // PayPal doesn't use attached payment methods like Stripe
    return { customerId, paymentMethodId };
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    // PayPal doesn't use detached payment methods
    this.logger.info(`PayPal payment method detachment requested: ${paymentMethodId}`);
  }

  async createPaymentIntent(amount: number, currency: string, options: any = {}): Promise<any> {
    // PayPal uses orders instead of payment intents
    return this.processPayment({
      amount,
      currency,
      paymentMethod: { type: 'paypal' },
      customer: options.customer || { email: '', name: '' },
      ...options
    });
  }

  async confirmPaymentIntent(paymentIntentId: string, paymentMethod?: any): Promise<any> {
    return this.captureOrder(paymentIntentId);
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<any> {
    // PayPal orders expire automatically, but we can implement cancellation
    this.logger.info(`PayPal order cancellation requested: ${paymentIntentId}`);
    return { id: paymentIntentId, status: 'CANCELLED' };
  }

  verifyWebhookSignature(payload: any, signature: string): boolean {
    try {
      // PayPal webhook verification would be implemented here
      // This is a simplified version
      return true;
    } catch (error) {
      this.logger.error('Invalid PayPal webhook signature:', error);
      return false;
    }
  }

  async handleWebhook(event: any): Promise<void> {
    try {
      const { event_type, resource } = event;

      switch (event_type) {
        case 'PAYMENT.CAPTURE.COMPLETED':
          await this.handlePaymentCompleted(resource);
          break;
        case 'PAYMENT.CAPTURE.DENIED':
          await this.handlePaymentDenied(resource);
          break;
        case 'CUSTOMER.DISPUTE.CREATED':
          await this.handleDisputeCreated(resource);
          break;
        default:
          this.logger.info(`Unhandled PayPal webhook event: ${event_type}`);
      }
    } catch (error) {
      this.logger.error('Error handling PayPal webhook:', error);
      throw error;
    }
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return;
    }

    try {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const response = await this.client.post('/v1/oauth2/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = new Date(Date.now() + (response.data.expires_in * 1000) - 60000); // 1 minute buffer
    } catch (error) {
      this.logger.error('Failed to get PayPal access token:', error);
      throw error;
    }
  }

  private async captureOrder(orderId: string): Promise<any> {
    await this.ensureAccessToken();

    const response = await this.client.post(
      `/v2/checkout/orders/${orderId}/capture`,
      {},
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );

    return response.data;
  }

  private mapPayPalResponse(captureResponse: any, amount: number, currency: string): PaymentResponse {
    const capture = captureResponse.purchase_units[0].payments.captures[0];

    return {
      success: capture.status === 'COMPLETED',
      transactionId: capture.id,
      status: capture.status === 'COMPLETED' ? 'succeeded' : 'pending',
      amount,
      currency,
      gatewayResponse: captureResponse
    };
  }

  private formatPayPalError(error: any): { code: string; message: string } {
    if (error.response?.data?.details) {
      const detail = error.response.data.details[0];
      return {
        code: detail.issue || 'PAYPAL_ERROR',
        message: detail.description || error.message
      };
    }
    return this.formatError(error);
  }

  private async handlePaymentCompleted(resource: any): Promise<void> {
    this.logger.info(`PayPal payment completed: ${resource.id}`);
    // Implementation would update payment status in database
  }

  private async handlePaymentDenied(resource: any): Promise<void> {
    this.logger.warn(`PayPal payment denied: ${resource.id}`);
    // Implementation would update payment status in database
  }

  private async handleDisputeCreated(resource: any): Promise<void> {
    this.logger.warn(`PayPal dispute created: ${resource.dispute_id}`);
    // Implementation would handle dispute process
  }
}
