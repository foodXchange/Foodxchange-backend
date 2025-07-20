import { Router } from 'express';

import {
  createOrderFromRFQ,
  getOrders,
  getOrder,
  updateOrderStatus,
  addShipmentTracking,
  getOrderAnalytics
} from '../../controllers/order.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// All routes are protected
router.use(authenticate);

// Order routes
router.post('/from-rfq', createOrderFromRFQ);
router.get('/', getOrders);
router.get('/analytics', getOrderAnalytics);
router.get('/:id', getOrder);
router.put('/:id/status', updateOrderStatus);
router.post('/:id/shipment', addShipmentTracking);

export default router;
