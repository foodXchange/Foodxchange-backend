const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/auth');
const RFQ = require('../models/RFQ');
const Company = require('../models/Company');
const Proposal = require('../models/Proposal');

// @desc    Get RFQs (filtered by user role)
// @route   GET /api/rfqs
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { status, category, page = 1, limit = 20 } = req.query;
  const user = req.user;
  
  let query = {};
  
  // Filter based on user role
  if (user.role === 'buyer') {
    const company = await Company.findOne({ users: user._id });
    query.buyer = company._id;
  } else if (user.role === 'seller') {
    // Show public RFQs or invited RFQs
    const company = await Company.findOne({ users: user._id });
    query.$or = [
      { visibility: 'public', status: 'active' },
      { targetSuppliers: company._id, status: 'active' }
    ];
  }
  
  if (status) query.status = status;
  if (category) query.category = category;
  
  const rfqs = await RFQ.find(query)
    .populate('buyer', 'name country')
    .populate('createdBy', 'name')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });
    
  const count = await RFQ.countDocuments(query);
  
  res.json({
    rfqs,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    total: count
  });
}));

// @desc    Get single RFQ
// @route   GET /api/rfqs/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const rfq = await RFQ.findById(req.params.id)
    .populate('buyer', 'name email phone country')
    .populate('proposals')
    .populate('targetSuppliers', 'name');
    
  if (!rfq) {
    res.status(404);
    throw new Error('RFQ not found');
  }
  
  // Check access rights
  const userCompany = await Company.findOne({ users: req.user._id });
  const isBuyer = rfq.buyer._id.toString() === userCompany._id.toString();
  const isTargetSupplier = rfq.targetSuppliers.some(s => s._id.toString() === userCompany._id.toString());
  const isPublic = rfq.visibility === 'public';
  
  if (!isBuyer && !isTargetSupplier && !isPublic && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to view this RFQ');
  }
  
  res.json(rfq);
}));

// @desc    Create RFQ
// @route   POST /api/rfqs
// @access  Private/Buyer
router.post('/', protect, asyncHandler(async (req, res) => {
  if (req.user.role !== 'buyer' && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only buyers can create RFQs');
  }
  
  const company = await Company.findOne({ users: req.user._id });
  
  const rfqData = {
    ...req.body,
    buyer: company._id,
    createdBy: req.user._id
  };
  
  const rfq = await RFQ.create(rfqData);
  res.status(201).json(rfq);
}));

// @desc    Update RFQ
// @route   PUT /api/rfqs/:id
// @access  Private/Buyer
router.put('/:id', protect, asyncHandler(async (req, res) => {
  const rfq = await RFQ.findById(req.params.id);
  
  if (!rfq) {
    res.status(404);
    throw new Error('RFQ not found');
  }
  
  // Check ownership
  const company = await Company.findOne({ users: req.user._id });
  if (rfq.buyer.toString() !== company._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to update this RFQ');
  }
  
  const updatedRFQ = await RFQ.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );
  
  res.json(updatedRFQ);
}));

// @desc    Submit proposal to RFQ
// @route   POST /api/rfqs/:id/proposals
// @access  Private/Seller
router.post('/:id/proposals', protect, asyncHandler(async (req, res) => {
  if (req.user.role !== 'seller' && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only sellers can submit proposals');
  }
  
  const rfq = await RFQ.findById(req.params.id);
  
  if (!rfq || rfq.status !== 'active') {
    res.status(404);
    throw new Error('RFQ not found or not active');
  }
  
  const company = await Company.findOne({ users: req.user._id });
  
  // Check if already submitted
  const existingProposal = await Proposal.findOne({
    rfq: rfq._id,
    supplier: company._id
  });
  
  if (existingProposal) {
    res.status(400);
    throw new Error('You have already submitted a proposal for this RFQ');
  }
  
  const proposalData = {
    ...req.body,
    rfq: rfq._id,
    supplier: company._id,
    submittedBy: req.user._id,
    status: 'submitted',
    submittedAt: Date.now()
  };
  
  const proposal = await Proposal.create(proposalData);
  
  // Add proposal to RFQ
  rfq.proposals.push(proposal._id);
  await rfq.save();
  
  res.status(201).json(proposal);
}));

module.exports = router;
