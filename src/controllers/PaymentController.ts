import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { auditFinancial, logAudit } from '../middleware/audit';
import { Payment } from '../models/Payment';
import { paymentService, PaymentProcessingRequest } from '../services/payment/PaymentService';

interface PaymentRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    companyId: string;
  };
}

export class PaymentController {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('PaymentController');
  }

  /**
   * Process a new payment
   */
  async processPayment(req: PaymentRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const paymentRequest: PaymentProcessingRequest = {
        ...req.body,
        customer: {
          id: userId,
          email: req.user?.email || req.body.customer?.email,
          name: req.body.customer?.name,
          phone: req.body.customer?.phone
        }
      };

      const result = await paymentService.processPayment(paymentRequest);

      // Log audit event
      await logAudit(
        req,
        'payment_processed',
        'financial',
        { type: 'payment', id: result.payment?._id.toString() },
        result.success ? 'success' : 'failure',
        {
          amount: paymentRequest.amount,
          currency: paymentRequest.currency,
          paymentMethod: paymentRequest.paymentMethod.type,
          orderId: paymentRequest.orderId
        }
      );

      if (result.requiresAction) {
        res.status(202).json({
          success: true,
          data: {
            payment: result.payment,
            requiresAction: result.requiresAction
          }
        });
        return;
      }

      res.status(result.success ? 201 : 400).json({
        success: result.success,
        data: result.payment,
        error: result.error
      });
    } catch (error) {
      this.logger.error('Failed to process payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PAYMENT_PROCESSING_ERROR',
          message: 'Failed to process payment'
        }
      });
    }
  }

  /**
   * Get payment details
   */
  async getPayment(req: PaymentRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const payment = await paymentService.getPaymentDetails(id);

      if (!payment) {
        res.status(404).json({
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: 'Payment not found'
          }
        });
        return;
      }

      // Check permissions
      const userId = req.user?.id;
      if (req.user?.role !== 'admin' &&
          payment.buyerId.toString() !== userId &&
          payment.sellerId.toString() !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access to this payment is denied'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: payment
      });
    } catch (error) {
      this.logger.error('Failed to get payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_PAYMENT_ERROR',
          message: 'Failed to retrieve payment'
        }
      });
    }
  }

  /**
   * Get payments for a user
   */
  async getUserPayments(req: PaymentRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { role = 'buyer', page = 1, limit = 20 } = req.query;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const payments = await paymentService.getPaymentsByUser(
        userId,
        role as 'buyer' | 'seller'
      );

      // Apply pagination
      const start = (Number(page) - 1) * Number(limit);
      const paginatedPayments = payments.slice(start, start + Number(limit));

      res.json({
        success: true,
        data: {
          payments: paginatedPayments,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: payments.length,
            pages: Math.ceil(payments.length / Number(limit))
          }
        }
      });
    } catch (error) {
      this.logger.error('Failed to get user payments:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_USER_PAYMENTS_ERROR',
          message: 'Failed to retrieve user payments'
        }
      });
    }
  }

  /**
   * Get payments for an order
   */
  async getOrderPayments(req: PaymentRequest, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      const payments = await paymentService.getPaymentsByOrder(orderId);

      // Check if user has access to this order
      const userId = req.user?.id;
      if (req.user?.role !== 'admin' && payments.length > 0) {
        const hasAccess = payments.some(payment =>
          payment.buyerId.toString() === userId ||
          payment.sellerId.toString() === userId
        );

        if (!hasAccess) {
          res.status(403).json({
            success: false,
            error: {
              code: 'ACCESS_DENIED',
              message: 'Access to these payments is denied'
            }
          });
          return;
        }
      }

      res.json({
        success: true,
        data: payments
      });
    } catch (error) {
      this.logger.error('Failed to get order payments:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_ORDER_PAYMENTS_ERROR',
          message: 'Failed to retrieve order payments'
        }
      });
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(req: PaymentRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      // Validate refund request
      if (!amount || amount <= 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AMOUNT',
            message: 'Refund amount must be greater than 0'
          }
        });
        return;
      }

      if (!reason || reason.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'REASON_REQUIRED',
            message: 'Refund reason is required'
          }
        });
        return;
      }

      const result = await paymentService.refundPayment(id, amount, reason, userId);

      // Log audit event
      await logAudit(
        req,
        'payment_refunded',
        'financial',
        { type: 'payment', id },
        result.success ? 'success' : 'failure',
        {
          amount,
          reason,
          refundedBy: userId
        }
      );

      res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result.payment,
        error: result.error
      });
    } catch (error) {
      this.logger.error('Failed to refund payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REFUND_ERROR',
          message: 'Failed to process refund'
        }
      });
    }
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(req: PaymentRequest, res: Response): Promise<void> {
    try {
      // Check admin permissions
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Only administrators can access payment statistics'
          }
        });
        return;
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const stats = await paymentService.getPaymentStatistics(start, end);

      res.json({
        success: true,
        data: {
          ...stats,
          dateRange: { start, end }
        }
      });
    } catch (error) {
      this.logger.error('Failed to get payment statistics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_STATS_ERROR',
          message: 'Failed to retrieve payment statistics'
        }
      });
    }
  }

  /**
   * Handle payment webhooks
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { provider } = req.params;
      const signature = req.get('stripe-signature') || req.get('paypal-transmission-sig') || '';
      const payload = req.body;

      await paymentService.handleWebhook(provider, payload, signature);

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      this.logger.error(`Failed to handle ${req.params.provider} webhook:`, error);
      res.status(400).json({
        success: false,
        error: {
          code: 'WEBHOOK_ERROR',
          message: 'Failed to process webhook'
        }
      });
    }
  }

  /**
   * Confirm payment (for payments requiring action)
   */
  async confirmPayment(req: PaymentRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { paymentMethodId, clientSecret } = req.body;

      const payment = await Payment.findById(id);
      if (!payment) {
        res.status(404).json({
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: 'Payment not found'
          }
        });
        return;
      }

      // Implementation would confirm the payment with the gateway
      // This is a simplified version
      payment.status = 'completed';
      payment.completedAt = new Date();
      await payment.save();

      await logAudit(
        req,
        'payment_confirmed',
        'financial',
        { type: 'payment', id },
        'success',
        { paymentMethodId }
      );

      res.json({
        success: true,
        data: payment
      });
    } catch (error) {
      this.logger.error('Failed to confirm payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CONFIRM_PAYMENT_ERROR',
          message: 'Failed to confirm payment'
        }
      });
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(req: PaymentRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id;

      const payment = await Payment.findById(id);
      if (!payment) {
        res.status(404).json({
          success: false,
          error: {
            code: 'PAYMENT_NOT_FOUND',
            message: 'Payment not found'
          }
        });
        return;
      }

      // Check permissions
      if (req.user?.role !== 'admin' &&
          payment.buyerId.toString() !== userId &&
          payment.sellerId.toString() !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access denied'
          }
        });
        return;
      }

      if (payment.status !== 'pending' && payment.status !== 'processing') {
        res.status(400).json({
          success: false,
          error: {
            code: 'CANNOT_CANCEL',
            message: 'Payment cannot be cancelled in current status'
          }
        });
        return;
      }

      payment.status = 'failed';
      payment.failureReason = reason || 'Cancelled by user';
      await payment.addTimelineEvent('payment_cancelled', reason);

      await logAudit(
        req,
        'payment_cancelled',
        'financial',
        { type: 'payment', id },
        'success',
        { reason, cancelledBy: userId }
      );

      res.json({
        success: true,
        data: payment
      });
    } catch (error) {
      this.logger.error('Failed to cancel payment:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CANCEL_PAYMENT_ERROR',
          message: 'Failed to cancel payment'
        }
      });
    }
  }
}

export const paymentController = new PaymentController();
