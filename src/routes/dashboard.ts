const router = require('express').Router();

const { protect } = require('../middleware/auth');
const Company = require('../models/Company');
const Product = require('../models/Product');
const Proposal = require('../models/Proposal');
const Request = require('../models/Request');

// Get dashboard stats
router.get('/stats', protect, async (req, res) => {
  try {
    const userCompany = req.user.company;

    if (req.user.role === 'buyer') {
      const stats = {
        rfqsInProgress: await Request.countDocuments({
          buyer: userCompany,
          status: { $in: ['active', 'pending'] }
        }),
        samplesAwaiting: await Proposal.countDocuments({
          request: { $in: await Request.find({ buyer: userCompany }).distinct('_id') },
          status: 'sample_sent'
        }),
        offersReceived: await Proposal.countDocuments({
          request: { $in: await Request.find({ buyer: userCompany }).distinct('_id') },
          status: { $in: ['submitted', 'in_review'] }
        }),
        shipmentsInTransit: 0 // To be implemented with Order model
      };

      res.json(stats);
    } else if (req.user.role === 'supplier') {
      const stats = {
        activeRFQs: await Request.countDocuments({ status: 'active' }),
        proposalsSubmitted: await Proposal.countDocuments({ supplier: userCompany }),
        productsListed: await Product.countDocuments({ supplier: userCompany }),
        ordersInProgress: 0 // To be implemented
      };

      res.json(stats);
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get timeline/activity feed
router.get('/timeline', protect, async (req, res) => {
  try {
    const timeline = [];
    const userCompany = req.user.company;

    // Get recent RFQs
    const recentRFQs = await Request.find({ buyer: userCompany })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('buyer', 'name');

    recentRFQs.forEach(rfq => {
      timeline.push({
        icon: '📋',
        message: `RFQ created for ${rfq.requestName}`,
        date: new Date(rfq.createdAt).toLocaleDateString()
      });
    });

    // Get recent proposals
    const recentProposals = await Proposal.find({
      request: { $in: await Request.find({ buyer: userCompany }).distinct('_id') }
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('supplier', 'name');

    recentProposals.forEach(proposal => {
      timeline.push({
        icon: '📨',
        message: `Offer submitted by ${proposal.supplier.name}`,
        date: new Date(proposal.createdAt).toLocaleDateString()
      });
    });

    // Sort by date
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(timeline.slice(0, 10));
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

module.exports = router;
