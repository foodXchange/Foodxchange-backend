const Proposal = require('../models/Proposal');
const RFQ = require('../models/RFQ');

// Create new proposal
exports.createProposal = async (req, res) => {
  try {
    const proposalData = {
      ...req.body,
      supplier: req.user._id,
      supplierCompany: req.user.company
    };

    const proposal = new Proposal(proposalData);
    await proposal.save();

    // Update RFQ proposal count
    await RFQ.findByIdAndUpdate(req.body.rfq, {
      $inc: { proposalCount: 1 }
    });

    res.status(201).json(proposal);
  } catch (error) {
    console.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
};

// Get proposals for an RFQ
exports.getProposalsByRFQ = async (req, res) => {
  try {
    const rfq = await RFQ.findById(req.params.rfqId);
    
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    // Check if user has access
    if (rfq.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const proposals = await Proposal.find({ rfq: req.params.rfqId })
      .populate('supplier', 'name email')
      .populate('supplierCompany', 'name');

    res.json(proposals);
  } catch (error) {
    console.error('Error fetching proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
};

// Get single proposal
exports.getProposalById = async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id)
      .populate('rfq')
      .populate('supplier', 'name email')
      .populate('supplierCompany', 'name');

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check access
    const rfq = await RFQ.findById(proposal.rfq._id);
    if (proposal.supplier._id.toString() !== req.user._id.toString() && 
        rfq.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(proposal);
  } catch (error) {
    console.error('Error fetching proposal:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
};

// Accept proposal
exports.acceptProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id).populate('rfq');

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check if user owns the RFQ
    const rfq = await RFQ.findById(proposal.rfq._id);
    if (rfq.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    proposal.status = 'accepted';
    await proposal.save();

    // Update RFQ status
    rfq.status = 'completed';
    await rfq.save();

    // TODO: Create order from accepted proposal

    res.json(proposal);
  } catch (error) {
    console.error('Error accepting proposal:', error);
    res.status(500).json({ error: 'Failed to accept proposal' });
  }
};
