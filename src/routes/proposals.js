const express = require('express');
const router = express.Router();
const proposalController = require('../controllers/proposalController');
const auth = require('../middleware/auth');

router.post('/', auth, proposalController.createProposal);
router.get('/rfq/:rfqId', auth, proposalController.getProposalsByRFQ);
router.get('/:id', auth, proposalController.getProposalById);
router.put('/:id/accept', auth, proposalController.acceptProposal);

module.exports = router;
