const SampleRequest = require('../models/SampleRequest');
const RFQ = require('../models/RFQ');
const Proposal = require('../models/Proposal');

// Request a sample
const requestSample = async (req, res) => {
  try {
    const { rfqId, proposalId, supplierId, productDetails, notes } = req.body;
    const userId = req.user._id;
    
    // Verify RFQ ownership
    const rfq = await RFQ.findOne({ rfqId, buyer: userId });
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }
    
    // Create sample request
    const sampleRequest = new SampleRequest({
      rfq: rfq._id,
      proposal: proposalId,
      buyer: userId,
      supplier: supplierId,
      product: productDetails,
      notes,
      status: 'requested'
    });
    
    await sampleRequest.save();
    
    // TODO: Send notification to supplier
    
    res.status(201).json({
      message: 'Sample requested successfully',
      sampleRequest
    });
  } catch (error) {
    console.error('Request sample error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get all sample requests for buyer
const getBuyerSamples = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, supplier, product } = req.query;
    
    let query = { buyer: userId };
    
    if (status && status !== 'All') {
      query.status = status.toLowerCase().replace(' ', '_');
    }
    
    if (supplier && supplier !== 'All') {
      query.supplier = supplier;
    }
    
    const samples = await SampleRequest.find(query)
      .populate('rfq', 'rfqId title')
      .populate('supplier', 'name')
      .populate('proposal', 'proposalId')
      .sort('-createdAt');
    
    res.json(samples);
  } catch (error) {
    console.error('Get buyer samples error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Update sample status
const updateSampleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingInfo } = req.body;
    const userId = req.user._id;
    
    const sample = await SampleRequest.findOne({ 
      requestId: id, 
      buyer: userId 
    });
    
    if (!sample) {
      return res.status(404).json({ error: 'Sample request not found' });
    }
    
    sample.status = status;
    if (trackingInfo) {
      sample.shipping = { ...sample.shipping, ...trackingInfo };
    }
    
    await sample.save();
    
    res.json({
      message: 'Sample status updated successfully',
      sample
    });
  } catch (error) {
    console.error('Update sample status error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Review sample
const reviewSample = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comments, decision } = req.body;
    const userId = req.user._id;
    
    const sample = await SampleRequest.findOne({ 
      requestId: id, 
      buyer: userId 
    });
    
    if (!sample) {
      return res.status(404).json({ error: 'Sample request not found' });
    }
    
    sample.review = {
      rating,
      comments,
      decision,
      reviewedBy: userId,
      reviewedAt: new Date()
    };
    sample.status = 'reviewed';
    
    await sample.save();
    
    res.json({
      message: 'Sample reviewed successfully',
      sample
    });
  } catch (error) {
    console.error('Review sample error:', error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  requestSample,
  getBuyerSamples,
  updateSampleStatus,
  reviewSample
};
