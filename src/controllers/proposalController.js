const Proposal = require('../models/Proposal');
const RFQ = require('../models/RFQ');

// Get all proposals for buyer's RFQs
const getBuyerProposals = async (req, res) => {
  try {
    const userId = req.user._id;
    const { rfqId, status } = req.query;
    
    // First get all RFQs for this buyer
    let rfqQuery = { buyer: userId };
    if (rfqId) {
      rfqQuery.rfqId = rfqId;
    }
    
    const buyerRFQs = await RFQ.find(rfqQuery).select('_id');
    const rfqIds = buyerRFQs.map(rfq => rfq._id);
    
    // Now get all proposals for these RFQs
    let proposalQuery = { rfq: { $in: rfqIds } };
    if (status && status !== 'All') {
      proposalQuery.status = status.toLowerCase().replace(' ', '_');
    }
    
    const proposals = await Proposal.find(proposalQuery)
      .populate('rfq', 'rfqId title productInfo')
      .populate('supplier', 'name country certifications')
      .sort('-createdAt');
    
    res.json(proposals);
  } catch (error) {
    console.error('Get buyer proposals error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Compare proposals for an RFQ
const compareProposals = async (req, res) => {
  try {
    const { rfqId } = req.params;
    const userId = req.user._id;
    
    // Verify RFQ ownership
    const rfq = await RFQ.findOne({ rfqId, buyer: userId });
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }
    
    // Get all proposals for this RFQ
    const proposals = await Proposal.find({ 
      rfq: rfq._id,
      status: { $in: ['submitted', 'under_review', 'selected'] }
    })
      .populate('supplier', 'name country certifications')
      .sort('pricing.unitPrice');
    
    // Format for comparison
    const comparison = proposals.map(proposal => ({
      proposalId: proposal.proposalId,
      supplier: proposal.supplier,
      pricing: proposal.pricing,
      terms: proposal.terms,
      certifications: proposal.productDetails.certifications,
      sampleStatus: proposal.sampleInfo,
      status: proposal.status,
      score: calculateProposalScore(proposal)
    }));
    
    res.json({
      rfq: {
        rfqId: rfq.rfqId,
        title: rfq.title,
        productInfo: rfq.productInfo
      },
      proposals: comparison
    });
  } catch (error) {
    console.error('Compare proposals error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Select a proposal
const selectProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const userId = req.user._id;
    
    // Get proposal and verify ownership through RFQ
    const proposal = await Proposal.findById(proposalId).populate('rfq');
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    if (proposal.rfq.buyer.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Update proposal status
    proposal.status = 'selected';
    await proposal.save();
    
    // Update other proposals for this RFQ to rejected
    await Proposal.updateMany(
      { 
        rfq: proposal.rfq._id,
        _id: { $ne: proposalId },
        status: { $nin: ['selected', 'draft'] }
      },
      { status: 'rejected' }
    );
    
    // Update RFQ status
    await RFQ.findByIdAndUpdate(proposal.rfq._id, { status: 'offer_received' });
    
    res.json({
      message: 'Proposal selected successfully',
      proposal
    });
  } catch (error) {
    console.error('Select proposal error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Helper function to calculate proposal score
function calculateProposalScore(proposal) {
  let score = 0;
  
  // Price score (lower is better)
  score += 100 - (proposal.pricing.unitPrice * 10);
  
  // Lead time score (shorter is better)
  score += 100 - (proposal.terms.leadTimeDays * 2);
  
  // Certification score
  const certs = proposal.productDetails.certifications;
  if (certs.kosher) score += 10;
  if (certs.organic) score += 10;
  if (certs.vegan) score += 5;
  if (certs.halal) score += 5;
  
  // Sample availability
  if (proposal.sampleInfo.available) score += 20;
  if (proposal.sampleInfo.sent) score += 10;
  
  return Math.max(0, Math.min(100, score));
}

module.exports = {
  getBuyerProposals,
  compareProposals,
  selectProposal
};
