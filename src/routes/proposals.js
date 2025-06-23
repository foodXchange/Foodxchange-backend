const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const Proposal = require('../models/Proposal');
const Request = require('../models/Request');

// Get proposals for an RFQ
router.get('/rfq/:rfqId', protect, async (req, res) => {
  try {
    const rfq = await Request.findById(req.params.rfqId);
    
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }
    
    // Check authorization
    if (req.user.role === 'buyer' && rfq.buyer.toString() !== req.user.company.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const proposals = await Proposal.find({ request: req.params.rfqId })
      .populate('supplier', 'name country')
      .populate('products.product');
    
    res.json(proposals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// Create proposal (supplier only)
router.post('/', protect, authorize('supplier'), async (req, res) => {
  try {
    const proposalData = {
      ...req.body,
      supplier: req.user.company,
      status: 'submitted'
    };
    
    const proposal = new Proposal(proposalData);
    await proposal.save();
    
    // Update RFQ with proposal
    await Request.findByIdAndUpdate(proposal.request, {
      $push: { proposals: proposal._id }
    });
    
    res.status(201).json(proposal);
  } catch (error) {
    console.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// Update proposal status
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const proposal = await Proposal.findById(req.params.id)
      .populate('request');
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    // Check authorization
    if (req.user.role === 'buyer' && 
        proposal.request.buyer.toString() !== req.user.company.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    proposal.status = status;
    await proposal.save();
    
    res.json(proposal);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update proposal' });
  }
});

module.exports = router;
