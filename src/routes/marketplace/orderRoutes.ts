import express from 'express';

import { OrderController } from '../../controllers/OrderController';
import { asyncHandler } from '../../core/errors';
import { validateApiKey } from '../../middleware/apiKeyAuth';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createCustomRateLimiter } from '../../middleware/rateLimiter';
import { enforceTenantIsolation } from '../../middleware/tenantIsolation';

const router = express.Router();
const orderController = new OrderController();

// Rate limiter for order operations
const orderRateLimiter = createCustomRateLimiter('orders', 60, 100); // 100 requests per hour

// Apply middleware to all routes
router.use(requireAuth);
router.use(enforceTenantIsolation);
router.use(orderRateLimiter);

/**
 * @route POST /api/v1/orders
 * @desc Create a new order
 * @access Private
 */
router.post('/',
  authorize(['buyer', 'admin', 'manager']),
  asyncHandler(orderController.createOrder.bind(orderController))
);

/**
 * @route GET /api/v1/orders
 * @desc Get orders with filtering and pagination
 * @access Private
 */
router.get('/',
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  asyncHandler(orderController.getOrders.bind(orderController))
);

/**
 * @route GET /api/v1/orders/analytics
 * @desc Get order analytics
 * @access Private
 */
router.get('/analytics',
  authorize(['admin', 'manager']),
  asyncHandler(orderController.getOrderAnalytics.bind(orderController))
);

/**
 * @route GET /api/v1/orders/:id
 * @desc Get order by ID
 * @access Private
 */
router.get('/:id',
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  asyncHandler(orderController.getOrderById.bind(orderController))
);

/**
 * @route PUT /api/v1/orders/:id
 * @desc Update order
 * @access Private
 */
router.put('/:id',
  authorize(['buyer', 'admin', 'manager']),
  asyncHandler(orderController.updateOrder.bind(orderController))
);

/**
 * @route POST /api/v1/orders/:id/approve
 * @desc Process order approval
 * @access Private
 */
router.post('/:id/approve',
  authorize(['manager', 'director', 'ceo', 'admin']),
  asyncHandler(orderController.processApproval.bind(orderController))
);

/**
 * @route DELETE /api/v1/orders/:id
 * @desc Cancel order
 * @access Private
 */
router.delete('/:id',
  authorize(['buyer', 'admin', 'manager']),
  asyncHandler(orderController.cancelOrder.bind(orderController))
);

/**
 * @route POST /api/v1/orders/:id/shipments
 * @desc Add shipment to order
 * @access Private
 */
router.post('/:id/shipments',
  authorize(['supplier', 'admin', 'manager']),
  asyncHandler(orderController.addShipment.bind(orderController))
);

/**
 * @route PUT /api/v1/orders/:id/shipments/:shipmentId/tracking
 * @desc Update shipment tracking
 * @access Private
 */
router.put('/:id/shipments/:shipmentId/tracking',
  authorize(['supplier', 'admin', 'manager']),
  asyncHandler(orderController.updateShipmentTracking.bind(orderController))
);

// Export router
export default router;
