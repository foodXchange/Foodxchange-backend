const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const Request = require('../models/Request');
const RequestLineItem = require('../models/RequestLineItem');
const Company = require('../models/Company');

// Get all RFQs for a buyer
router.get('/', protect, authorize('buyer', 'admin'), async (req, res) => {
  try {
    const user = req.user;
    const { status, category, supplier, limit } = req.query;
    
    // Build query
    let query = {};
    
    // Get buyer's company
    if (user.role === 'buyer' && user.company) {
      query.buyer = user.company;
    }
    
    if (status && status !== 'All') {
      query.status = status;
    }
    
    if (category && category !== 'All') {
      query.category = category;
    }
    
    // Execute query
    const rfqs = await Request.find(query)
      .populate('lineItems')
      .populate('proposals')
      .populate('buyer', 'name')
      .sort({ createdAt: -1 })
      .limit(limit ? parseInt(limit) : 100);
    
    res.json(rfqs);
  } catch (error) {
    console.error('Error fetching RFQs:', error);
    res.status(500).json({ error: 'Failed to fetch RFQs' });
  }
});

// Get single RFQ
router.get('/:id', protect, async (req, res) => {
  try {
    const rfq = await Request.findById(req.params.id)
      .populate('lineItems')
      .populate('proposals')
      .populate('buyer');
    
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }
    
    // Check authorization
    if (req.user.role === 'buyer' && rfq.buyer._id.toString() !== req.user.company.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(rfq);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch RFQ' });
  }
});

// Create new RFQ
router.post('/', protect, authorize('buyer'), async (req, res) => {
  try {
    const {
      requestName,
      category,
      brief,
      kosher,
      kosherType,
      passoverKosher,
      packaging,
      brandingRequirements,
      lineItems,
      status = 'active'
    } = req.body;
    
    // Create RFQ
    const rfq = new Request({
      requestName,
      status,
      buyer: req.user.company,
      category,
      brief,
      kosher,
      kosherType,
      passoverKosher,
      packaging,
      brandingRequirements
    });
    
    await rfq.save();
    
    // Create line items
    if (lineItems && lineItems.length > 0) {
      const createdLineItems = await Promise.all(
        lineItems.map(async (item) => {
          const lineItem = new RequestLineItem({
            request: rfq._id,
            productName: item.productName,
            weight: item.weight,
            weightUnit: item.weightUnit,
            additionalDetails: item.additionalDetails
          });
          await lineItem.save();
          return lineItem._id;
        })
      );
      
      // Update RFQ with line items
      rfq.lineItems = createdLineItems;
      await rfq.save();
    }
    
    // Populate and return
    const populatedRfq = await Request.findById(rfq._id)
      .populate('lineItems')
      .populate('buyer', 'name');
    
    res.status(201).json(populatedRfq);
  } catch (error) {
    console.error('Error creating RFQ:', error);
    res.status(500).json({ error: 'Failed to create RFQ' });
  }
});

// Update RFQ
router.put('/:id', protect, authorize('buyer'), async (req, res) => {
  try {
    const rfq = await Request.findById(req.params.id);
    
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }
    
    // Check ownership
    if (rfq.buyer.toString() !== req.user.company.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'buyer') {
        rfq[key] = req.body[key];
      }
    });
    
    await rfq.save();
    res.json(rfq);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update RFQ' });
  }
});

// Delete RFQ
router.delete('/:id', protect, authorize('buyer', 'admin'), async (req, res) => {
  try {
    const rfq = await Request.findById(req.params.id);
    
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }
    
    // Check ownership
    if (req.user.role === 'buyer' && rfq.buyer.toString() !== req.user.company.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await rfq.remove();
    res.json({ message: 'RFQ deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete RFQ' });
  }
});

module.exports = router;
