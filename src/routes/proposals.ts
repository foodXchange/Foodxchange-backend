import express from 'express';
import proposalController from '../controllers/proposalController';
import auth from '../middleware/auth';

const router = express.Router();

router.post('/', auth, proposalController.createProposal);
router.get('/rfq/:rfqId', auth, proposalController.getProposalsByRFQ);
router.get('/:id', auth, proposalController.getProposalById);
router.put('/:id/accept', auth, proposalController.acceptProposal);

export default router;
