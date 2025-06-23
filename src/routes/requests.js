const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');

// Request schema
const requestSchema = new mongoose.Schema({
  requestId: String,
  requestNumber: String,
  buyerId: String,
  buyerName: String,
  title: String,
  description: String,
  status: String,
  createdDate: Date,
  requiredDate: Date,
  deliveryLocation: String,
  totalItems: Number,
  totalProposals: Number,
  items: [{
    productName: String,
    quantity: Number,
    unit: String,
    specifications: String
  }]
});

const Request = mongoose.model('Request', requestSchema);

// Get all requests
router.get('/', auth, async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdDate: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single request
router.get('/:id', auth, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update request status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const request = await Request.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json(request);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Create new RFQ
router.post('/', auth, async (req, res) => {
  try {
    const request = new Request({
      ...req.body,
      requestNumber: 'RFQ-' + Date.now().toString().slice(-6),
      buyerId: req.userId,
      status: 'draft',
      createdDate: new Date(),
      totalItems: req.body.items?.length || 0,
      totalProposals: 0
    });
    
    await request.save();
    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
