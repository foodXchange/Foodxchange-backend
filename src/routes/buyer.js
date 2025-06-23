const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const rfqController = require('../controllers/rfqController');
const sampleController = require('../controllers/sampleController');
const orderController = require('../controllers/orderController');
const proposalController = require('../controllers/proposalController');

// All routes require authentication and buyer role
router.use(protect);
router.use(authorize('buyer', 'admin'));

// RFQ Routes
router.post('/rfqs', rfqController.createRFQ);
router.get('/rfqs', rfqController.getBuyerRFQs);
router.get('/rfqs/stats', rfqController.getRFQStats);
router.get('/rfqs/:id', rfqController.getRFQById);
router.put('/rfqs/:id', rfqController.updateRFQ);
router.post('/rfqs/:id/invite', rfqController.inviteSuppliers);

// Sample Routes
router.post('/samples/request', sampleController.requestSample);
router.get('/samples', sampleController.getBuyerSamples);
router.put('/samples/:id/status', sampleController.updateSampleStatus);
router.post('/samples/:id/review', sampleController.reviewSample);

// Order Routes
router.post('/orders', orderController.createOrder);
router.get('/orders', orderController.getBuyerOrders);
router.get('/orders/stats', orderController.getOrderStats);
router.get('/orders/:id', orderController.getOrderById);
router.put('/orders/:id/status', orderController.updateOrderStatus);
router.post('/orders/:id/documents', orderController.uploadOrderDocument);

// Proposal Routes (for viewing/comparing)
router.get('/proposals', proposalController.getBuyerProposals);
router.get('/proposals/compare/:rfqId', proposalController.compareProposals);
router.post('/proposals/:proposalId/select', proposalController.selectProposal);

module.exports = router;
