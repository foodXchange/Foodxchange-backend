const express = require('express');
const router = express.Router();
const {
  agentOnboarding,
  getAgentProfile,
  updateAgentProfile,
  verifyAgent,
  getAgentDashboard,
  getAvailableLeads,
  acceptLead,
  declineLead,
  getAgentCommissions
} = require('../controllers/agentController');
const { protect, authorize } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
  }
  next();
};

// Agent onboarding
router.post('/onboard', 
  protect,
  authorize('agent'),
  [
    body('step').isIn(['personal_info', 'professional_info', 'expertise', 'territory', 'verification', 'banking', 'training']),
    body('data').isObject()
  ],
  validate,
  agentOnboarding
);

// Get agent profile
router.get('/profile', 
  protect,
  authorize('agent'),
  getAgentProfile
);

// Update agent profile
router.put('/profile', 
  protect,
  authorize('agent'),
  [
    body('section').isIn(['personal_info', 'professional_info', 'expertise', 'territory', 'communication', 'banking']),
    body('data').isObject()
  ],
  validate,
  updateAgentProfile
);

// Verify agent (admin only)
router.post('/verify', 
  protect,
  authorize('admin'),
  [
    body('agentId').isMongoId(),
    body('verificationType').isIn(['identity', 'business', 'background']),
    body('status').isIn(['pending', 'verified', 'rejected'])
  ],
  validate,
  verifyAgent
);

// Get agent dashboard
router.get('/dashboard', 
  protect,
  authorize('agent'),
  [
    query('period').optional().isIn(['week', 'month', 'quarter', 'year'])
  ],
  validate,
  getAgentDashboard
);

// Get available leads
router.get('/leads', 
  protect,
  authorize('agent'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('category').optional().isMongoId(),
    query('urgency').optional().isIn(['low', 'medium', 'high', 'urgent']),
    query('sort').optional().isIn(['createdAt', 'leadInfo.estimatedValue.amount', 'leadInfo.urgency'])
  ],
  validate,
  getAvailableLeads
);

// Accept a lead
router.post('/leads/:leadId/accept', 
  protect,
  authorize('agent'),
  [
    param('leadId').isMongoId()
  ],
  validate,
  acceptLead
);

// Decline a lead
router.post('/leads/:leadId/decline', 
  protect,
  authorize('agent'),
  [
    param('leadId').isMongoId(),
    body('reason').notEmpty().isLength({ min: 10, max: 500 })
  ],
  validate,
  declineLead
);

// Get agent commissions
router.get('/commissions', 
  protect,
  authorize('agent'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['calculated', 'pending_approval', 'approved', 'rejected', 'paid', 'disputed', 'cancelled']),
    query('type').optional().isIn(['base_commission', 'tier_bonus', 'new_supplier_bonus', 'new_buyer_bonus', 'first_deal_bonus', 'monthly_target_bonus', 'recurring_commission']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ],
  validate,
  getAgentCommissions
);

module.exports = router;