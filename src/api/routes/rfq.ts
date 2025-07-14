import { Router } from 'express';
import {
  createRFQ,
  getRFQs,
  getRFQ,
  updateRFQ,
  submitProposal,
  acceptProposal,
  closeRFQ
} from '../../controllers/rfq.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', getRFQs);
router.get('/:id', getRFQ);

// Protected routes
router.post('/', authenticate, createRFQ);
router.put('/:id', authenticate, updateRFQ);
router.post('/:id/proposal', authenticate, submitProposal);
router.put('/:id/accept-proposal/:proposalId', authenticate, acceptProposal);
router.put('/:id/close', authenticate, closeRFQ);

export default router;