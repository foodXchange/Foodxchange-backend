import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import { RFQController } from '../controllers/RFQController';

const router = Router();

// Webhook routes (no authentication required)
router.post('/webhooks/events', RFQController.handleWebhookEvent);
router.post('/webhooks/batch', RFQController.handleBatchWebhookEvents);
router.post('/webhooks/test', RFQController.testWebhook);

// Protected routes
router.use(authenticateToken);

// RFQ routes
router.get('/', RFQController.getAllRFQs);
router.get('/:id', RFQController.getRFQById);
router.get('/:id/matches', RFQController.getRFQMatches);
router.get('/:id/bids', RFQController.getRFQBids);
router.post('/:id/bids', RFQController.submitBid);

// Analytics routes (admin only)
router.get('/analytics/overview', 
  requireRole('admin', 'super_admin'),
  RFQController.getRFQAnalytics
);

export default router;