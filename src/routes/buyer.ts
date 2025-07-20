const router = require('express').Router();

const { protect, authorize } = require('../middleware/auth');
const Product = require('../models/Product');
const Proposal = require('../models/Proposal');
const Request = require('../models/Request');
const RequestLineItem = require('../models/RequestLineItem');

// Get buyer dashboard data
router.get('/dashboard', protect, authorize('buyer'), async (req, res) => {
  try {
    const buyerCompany = req.user.company;

    // Get counts
    const rfqsInProgress = await Request.countDocuments({
      buyer: buyerCompany,
      requestStatus: { $in: ['Draft', 'Pending', 'In Progress'] }
    });

    const samplesAwaiting = await Request.countDocuments({
      buyer: buyerCompany,
      requestStatus: 'Awaiting Sample'
    });

    const offersReceived = await Proposal.countDocuments({
      buyer: buyerCompany,
      status: { $in: ['Submitted', 'Under Review'] }
    });

    // Get recent requests
    const recentRequests = await Request.find({ buyer: buyerCompany })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('assignedTo', 'name');

    res.json({
      stats: {
        rfqsInProgress,
        samplesAwaiting,
        offersReceived,
        shipmentsInTransit: 0 // TODO: Implement when orders model is ready
      },
      recentRequests
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get buyer's RFQs
router.get('/rfqs', protect, authorize('buyer'), async (req, res) => {
  try {
    const { status, category, search, page = 1, limit = 10 } = req.query;
    const buyerCompany = req.user.company;

    const query = { buyer: buyerCompany };

    if (status && status !== 'All') {
      query.requestStatus = status;
    }

    if (category && category !== 'All') {
      query.productCategory = category;
    }

    if (search) {
      query.$or = [
        { requestName: { $regex: search, $options: 'i' } },
        { requestBrief: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const requests = await Request.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('assignedTo', 'name');

    const total = await Request.countDocuments(query);

    // Get line items count for each request
    const requestsWithItems = await Promise.all(
      requests.map(async (request) => {
        const itemCount = await RequestLineItem.countDocuments({ request: request._id });
        return {
          ...request.toObject(),
          itemCount
        };
      })
    );

    res.json({
      requests: requestsWithItems,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new RFQ
router.post('/rfqs', protect, authorize('buyer'), async (req, res) => {
  try {
    const requestData = {
      ...req.body,
      buyer: req.user.company,
      requestId: Math.floor(Math.random() * 10000), // Generate unique ID
      createdBy: req.user._id
    };

    const request = await Request.create(requestData);

    // Create line items if provided
    if (req.body.lineItems && req.body.lineItems.length > 0) {
      const lineItems = req.body.lineItems.map(item => ({
        ...item,
        request: request._id,
        buyerCompany: req.user.company
      }));

      await RequestLineItem.insertMany(lineItems);
    }

    res.status(201).json({ request });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get RFQ details
router.get('/rfqs/:id', protect, authorize('buyer'), async (req, res) => {
  try {
    const request = await Request.findOne({
      _id: req.params.id,
      buyer: req.user.company
    }).populate('assignedTo', 'name email');

    if (!request) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    const lineItems = await RequestLineItem.find({ request: request._id });
    const proposals = await Proposal.find({ request: request._id })
      .populate('supplier', 'name country');

    res.json({
      request,
      lineItems,
      proposals
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get proposals for buyer
router.get('/proposals', protect, authorize('buyer'), async (req, res) => {
  try {
    const { status, rfqId } = req.query;
    const query = { buyer: req.user.company };

    if (status) {
      query.status = status;
    }

    if (rfqId) {
      query.request = rfqId;
    }

    const proposals = await Proposal.find(query)
      .populate('supplier', 'name country certifications')
      .populate('request', 'requestName productCategory')
      .sort({ createdAt: -1 });

    res.json({ proposals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compare proposals
router.get('/proposals/compare', protect, authorize('buyer'), async (req, res) => {
  try {
    const { rfqId } = req.query;

    if (!rfqId) {
      return res.status(400).json({ error: 'RFQ ID is required' });
    }

    const proposals = await Proposal.find({
      request: rfqId,
      buyer: req.user.company,
      status: { $in: ['Submitted', 'Under Review', 'Negotiating'] }
    })
      .populate('supplier', 'name country certifications')
      .populate('products.product');

    res.json({ proposals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
