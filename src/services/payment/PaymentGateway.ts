import { Logger } from '../../core/logging/logger';

export interface PaymentRequest {
  amount: number;
  currency: string;
  paymentMethod: {
    type: string;
    token?: string;
    cardNumber?: string;
    expiryMonth?: string;
    expiryYear?: string;
    cvv?: string;
    bankAccount?: string;
    routingNumber?: string;
  };
  customer: {
    id?: string;
    email: string;
    name: string;
    phone?: string;
  };
  billing?: {
    address: {
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
  };
  metadata?: Record<string, any>;
  description?: string;
  statementDescriptor?: string;
  idempotencyKey?: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  status: 'succeeded' | 'pending' | 'failed' | 'requires_action';
  amount: number;
  currency: string;
  gatewayResponse?: any;
  error?: {
    code: string;
    message: string;
    declineCode?: string;
  };
  requiresAction?: {
    type: '3ds_authentication' | 'bank_approval' | 'otp_verification';
    clientSecret?: string;
    redirectUrl?: string;
  };
}

export interface RefundRequest {
  transactionId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, any>;
}

export interface RefundResponse {
  success: boolean;
  refundId?: string;
  status: 'succeeded' | 'pending' | 'failed';
  amount: number;
  currency: string;
  error?: {
    code: string;
    message: string;
  };
}

export abstract class PaymentGateway {
  protected logger: Logger;
  protected config: any;

  constructor(config: any) {
    this.logger = new Logger(`PaymentGateway:${this.constructor.name}`);
    this.config = config;
  }

  abstract processPayment(request: PaymentRequest): Promise<PaymentResponse>;
  abstract refundPayment(request: RefundRequest): Promise<RefundResponse>;
  abstract getTransaction(transactionId: string): Promise<any>;
  abstract createCustomer(customer: any): Promise<any>;
  abstract updateCustomer(customerId: string, updates: any): Promise<any>;
  abstract deleteCustomer(customerId: string): Promise<void>;
  abstract listPaymentMethods(customerId: string): Promise<any[]>;
  abstract attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<any>;
  abstract detachPaymentMethod(paymentMethodId: string): Promise<void>;
  abstract createPaymentIntent(amount: number, currency: string, options?: any): Promise<any>;
  abstract confirmPaymentIntent(paymentIntentId: string, paymentMethod?: any): Promise<any>;
  abstract cancelPaymentIntent(paymentIntentId: string): Promise<any>;

  // Webhook handling
  abstract verifyWebhookSignature(payload: any, signature: string): boolean;
  abstract handleWebhook(event: any): Promise<void>;

  // Common validation methods
  protected validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    if (!Number.isInteger(amount)) {
      throw new Error('Amount must be in smallest currency unit (e.g., cents)');
    }
  }

  protected validateCurrency(currency: string): void {
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR'];
    if (!supportedCurrencies.includes(currency.toUpperCase())) {
      throw new Error(`Unsupported currency: ${currency}`);
    }
  }

  protected sanitizeCardNumber(cardNumber: string): string {
    return cardNumber.replace(/\s/g, '').replace(/-/g, '');
  }

  protected maskCardNumber(cardNumber: string): string {
    const sanitized = this.sanitizeCardNumber(cardNumber);
    const last4 = sanitized.slice(-4);
    return `****${last4}`;
  }

  protected formatError(error: any): { code: string; message: string } {
    return {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred'
    };
  }
}
