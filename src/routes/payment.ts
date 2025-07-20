import { Router } from 'express';
import { body, param, query } from 'express-validator';

import { paymentController } from '../controllers/PaymentController';
import { auditFinancial } from '../middleware/audit';
import { authenticateToken, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// Apply authentication to all routes except webhooks
router.use(async (req, res, next) => {
  if (req.path.includes('/webhook/')) {
    return next();
  }
  return authenticateToken(req, res, next);
});

// Validation rules
const processPaymentValidation = [
  body('orderId')
    .isString()
    .withMessage('Order ID is required'),

  body('buyerId')
    .isMongoId()
    .withMessage('Valid buyer ID is required'),

  body('sellerId')
    .isMongoId()
    .withMessage('Valid seller ID is required'),

  body('amount')
    .isInt({ min: 1 })
    .withMessage('Amount must be a positive integer (in cents)'),

  body('currency')
    .isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR'])
    .withMessage('Invalid currency'),

  body('paymentMethod.type')
    .isIn(['credit_card', 'debit_card', 'bank_transfer', 'paypal', 'stripe'])
    .withMessage('Invalid payment method type'),

  body('customer.email')
    .isEmail()
    .withMessage('Valid customer email is required'),

  body('customer.name')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Customer name is required'),

  body('billing.address.line1')
    .optional()
    .isString()
    .withMessage('Billing address line 1 must be a string'),

  body('billing.address.city')
    .optional()
    .isString()
    .withMessage('Billing city must be a string'),

  body('billing.address.country')
    .optional()
    .isString()
    .isLength({ min: 2, max: 2 })
    .withMessage('Country must be a 2-letter code')
];

const refundPaymentValidation = [
  param('id')
    .isMongoId()
    .withMessage('Valid payment ID is required'),

  body('amount')
    .isInt({ min: 1 })
    .withMessage('Refund amount must be a positive integer (in cents)'),

  body('reason')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Refund reason is required and must be under 500 characters')
];

const confirmPaymentValidation = [
  param('id')
    .isMongoId()
    .withMessage('Valid payment ID is required'),

  body('paymentMethodId')
    .optional()
    .isString()
    .withMessage('Payment method ID must be a string'),

  body('clientSecret')
    .optional()
    .isString()
    .withMessage('Client secret must be a string')
];

const cancelPaymentValidation = [
  param('id')
    .isMongoId()
    .withMessage('Valid payment ID is required'),

  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Cancellation reason must be under 500 characters')
];

const getPaymentsValidation = [
  query('role')
    .optional()
    .isIn(['buyer', 'seller'])
    .withMessage('Role must be either buyer or seller'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const getStatsValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
];

// Payment processing routes
router.post('/process',
  validateRequest(processPaymentValidation),
  auditFinancial('payment_initiated', 'payment'),
  paymentController.processPayment
);

router.post('/:id/confirm',
  validateRequest(confirmPaymentValidation),
  auditFinancial('payment_confirmation_attempted', 'payment'),
  paymentController.confirmPayment
);

router.post('/:id/cancel',
  validateRequest(cancelPaymentValidation),
  auditFinancial('payment_cancellation_attempted', 'payment'),
  paymentController.cancelPayment
);

// Refund routes
router.post('/:id/refund',
  authorize('admin', 'seller'), // Only sellers and admins can initiate refunds
  validateRequest(refundPaymentValidation),
  auditFinancial('refund_initiated', 'payment'),
  paymentController.refundPayment
);

// Query routes
router.get('/user',
  validateRequest(getPaymentsValidation),
  paymentController.getUserPayments
);

router.get('/order/:orderId',
  param('orderId').isString().withMessage('Order ID is required'),
  paymentController.getOrderPayments
);

router.get('/stats',
  authorize('admin'),
  validateRequest(getStatsValidation),
  paymentController.getPaymentStats
);

router.get('/:id',
  param('id').isMongoId().withMessage('Valid payment ID is required'),
  paymentController.getPayment
);

// Webhook routes (no authentication required)
router.post('/webhook/:provider',
  param('provider').isIn(['stripe', 'paypal']).withMessage('Invalid webhook provider'),
  paymentController.handleWebhook
);

// Health check
router.get('/health', (req, res) => {
  res.json({
    message: 'Payment service is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      process: 'POST /api/payments/process',
      confirm: 'POST /api/payments/:id/confirm',
      cancel: 'POST /api/payments/:id/cancel',
      refund: 'POST /api/payments/:id/refund',
      getPayment: 'GET /api/payments/:id',
      getUserPayments: 'GET /api/payments/user',
      getOrderPayments: 'GET /api/payments/order/:orderId',
      getStats: 'GET /api/payments/stats',
      webhook: 'POST /api/payments/webhook/:provider'
    }
  });
});

export default router;
