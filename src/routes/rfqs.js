const express = require('express');
const router = express.Router();
const rfqController = require('../controllers/rfqController');
const auth = require('../middleware/auth');

// Buyer routes
router.post('/', auth, rfqController.createRFQ);
router.get('/', auth, rfqController.getBuyerRFQs);
router.get('/:id', auth, rfqController.getRFQById);
router.put('/:id/status', auth, rfqController.updateRFQStatus);

// Supplier routes
router.get('/supplier/available', auth, rfqController.getSupplierRFQs);

module.exports = router;
