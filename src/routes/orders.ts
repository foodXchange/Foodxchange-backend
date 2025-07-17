import express from 'express';
import { OrderController } from '../controllers/OrderController';
import { authMiddleware } from '../middleware/auth';
import { enforceTenantIsolation } from '../middleware/tenantIsolation';
import { validateApiKey } from '../middleware/apiKeyAuth';
import { createCustomRateLimiter } from '../middleware/rateLimiter';
import { authorize } from '../middleware/authorize';

const router = express.Router();
const orderController = new OrderController();

// Rate limiter for order operations
const orderRateLimiter = createCustomRateLimiter('orders', 60, 100); // 100 requests per hour

// Apply middleware to all routes
router.use(authMiddleware);
router.use(enforceTenantIsolation);
router.use(orderRateLimiter);

/**
 * @route POST /api/orders
 * @desc Create a new order
 * @access Private
 */
router.post('/', 
  authorize(['buyer', 'admin', 'manager']),
  orderController.createOrder
);

/**
 * @route GET /api/orders
 * @desc Get orders with filtering and pagination
 * @access Private
 */
router.get('/', 
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  orderController.getOrders
);

/**
 * @route GET /api/orders/analytics
 * @desc Get order analytics
 * @access Private
 */
router.get('/analytics', 
  authorize(['admin', 'manager']),
  orderController.getOrderAnalytics
);

/**
 * @route GET /api/orders/:id
 * @desc Get order by ID
 * @access Private
 */
router.get('/:id', 
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  orderController.getOrderById
);

/**
 * @route PUT /api/orders/:id
 * @desc Update order
 * @access Private
 */
router.put('/:id', 
  authorize(['buyer', 'admin', 'manager']),
  orderController.updateOrder
);

/**
 * @route POST /api/orders/:id/approve
 * @desc Process order approval
 * @access Private
 */
router.post('/:id/approve', 
  authorize(['manager', 'director', 'ceo', 'admin']),
  orderController.processApproval
);

/**
 * @route DELETE /api/orders/:id
 * @desc Cancel order
 * @access Private
 */
router.delete('/:id', 
  authorize(['buyer', 'admin', 'manager']),
  orderController.cancelOrder
);

/**
 * @route POST /api/orders/:id/shipments
 * @desc Add shipment to order
 * @access Private
 */
router.post('/:id/shipments', 
  authorize(['supplier', 'admin', 'manager']),
  orderController.addShipment
);

/**
 * @route PUT /api/orders/:id/shipments/:shipmentId/tracking
 * @desc Update shipment tracking
 * @access Private
 */
router.put('/:id/shipments/:shipmentId/tracking', 
  authorize(['supplier', 'admin', 'manager']),
  orderController.updateShipmentTracking
);

// Export router
export default router;