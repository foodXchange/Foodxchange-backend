import { Router } from 'express';
import multer from 'multer';
import { AgentController } from '../controllers/AgentController';
import { 
  authenticateToken,
  requireRole,
  optionalAuth
} from '../../../middleware/auth.middleware';
import {
  sanitizeInput,
  preventSQLInjection,
  preventXSS,
  validationSchemas,
  handleValidationErrors,
  advancedRateLimit,
  secureFileUpload
} from '../../../middleware/security.middleware';
import { UserRole } from '../../../interfaces/auth.interface';
import { body, query, param } from 'express-validator';
import { config } from '../../../config';

const router = Router();
const agentController = new AgentController();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.fileUpload.maxSizeMB * 1024 * 1024,
    files: 5
  }
});

// Rate limiting configurations
const authRateLimit = advancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  keyGenerator: (req) => `agent_auth:${req.ip}`
});

const generalRateLimit = advancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  keyGenerator: (req) => `agent:${req.user?.agentId || req.ip}`
});

const messageRateLimit = advancedRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 200, // Allow more messages per hour
  keyGenerator: (req) => `agent_messages:${req.user?.agentId || req.ip}`
});

// Apply security middleware to all routes
router.use(sanitizeInput);
router.use(preventSQLInjection);
router.use(preventXSS);

// Validation schemas specific to agents
const agentRegistrationValidation = [
  body('firstName').trim().isLength({ min: 2, max: 50 }).escape(),
  body('lastName').trim().isLength({ min: 2, max: 50 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('phone').isMobilePhone('any'),
  body('whatsappNumber').isMobilePhone('any'),
  body('country').isString().trim().isLength({ min: 2, max: 50 }),
  body('experienceYears').isInt({ min: 0, max: 50 }),
  body('industryExperience').isArray({ min: 1 }),
  body('productCategories').isArray({ min: 1 }),
  body('languages').isArray({ min: 1 }),
  body('existingSupplierConnections').isInt({ min: 0 }),
  body('existingBuyerConnections').isInt({ min: 0 }),
  body('termsAccepted').isBoolean().equals('true'),
  body('commissionAgreementAccepted').isBoolean().equals('true')
];

const leadCreationValidation = [
  body('companyName').trim().isLength({ min: 2, max: 100 }).escape(),
  body('contactPerson').trim().isLength({ min: 2, max: 100 }).escape(),
  body('contactPhone').isMobilePhone('any'),
  body('leadType').isIn(['buyer', 'supplier', 'both']),
  body('productCategories').isArray({ min: 1 }),
  body('urgency').isIn(['low', 'medium', 'high', 'urgent']),
  body('source').isIn(['referral', 'cold_outreach', 'event', 'website', 'social_media', 'existing_network']),
  body('location.country').isString().trim().isLength({ min: 2 })
];

// Public routes (no authentication required)

/**
 * @route   POST /api/v1/agents/register
 * @desc    Register new agent
 * @access  Public
 */
router.post('/register',
  authRateLimit,
  agentRegistrationValidation,
  handleValidationErrors,
  agentController.registerAgent
);

/**
 * @route   POST /api/v1/agents/webhook/whatsapp
 * @desc    WhatsApp webhook endpoint
 * @access  Public (but verified)
 */
router.post('/webhook/whatsapp',
  agentController.handleWhatsAppWebhook
);

/**
 * @route   GET /api/v1/agents/webhook/whatsapp
 * @desc    WhatsApp webhook verification
 * @access  Public
 */
router.get('/webhook/whatsapp',
  agentController.handleWhatsAppWebhook
);

// Protected routes (authentication required)

/**
 * @route   GET /api/v1/agents/dashboard
 * @desc    Get agent dashboard data
 * @access  Private (Agent)
 */
router.get('/dashboard',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  agentController.getDashboard
);

/**
 * @route   GET /api/v1/agents/profile/:agentId?
 * @desc    Get agent profile (own or public view)
 * @access  Private (Agent) / Public with auth
 */
router.get('/profile/:agentId?',
  optionalAuth,
  generalRateLimit,
  [
    param('agentId').optional().isMongoId()
  ],
  handleValidationErrors,
  agentController.getProfile
);

/**
 * @route   PUT /api/v1/agents/profile
 * @desc    Update agent profile
 * @access  Private (Agent)
 */
router.put('/profile',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  [
    body('firstName').optional().trim().isLength({ min: 2, max: 50 }).escape(),
    body('lastName').optional().trim().isLength({ min: 2, max: 50 }).escape(),
    body('phone').optional().isMobilePhone('any'),
    body('productCategories').optional().isArray(),
    body('coverageAreas').optional().isArray(),
    body('maxLeadsPerDay').optional().isInt({ min: 1, max: 50 })
  ],
  handleValidationErrors,
  agentController.updateProfile
);

/**
 * @route   POST /api/v1/agents/documents
 * @desc    Upload agent verification documents
 * @access  Private (Agent)
 */
router.post('/documents',
  authenticateToken,
  requireRole(UserRole.AGENT),
  authRateLimit,
  upload.array('documents', 5),
  secureFileUpload({
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  }),
  agentController.uploadDocuments
);

// Lead Management Routes

/**
 * @route   POST /api/v1/agents/leads
 * @desc    Create new lead
 * @access  Private (Agent)
 */
router.post('/leads',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  leadCreationValidation,
  handleValidationErrors,
  agentController.createLead
);

/**
 * @route   GET /api/v1/agents/leads
 * @desc    Get agent leads with filtering
 * @access  Private (Agent)
 */
router.get('/leads',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  [
    query('status').optional().isIn(['new', 'contacted', 'qualified', 'negotiating', 'proposal_sent', 'won', 'lost', 'dormant']),
    query('temperature').optional().isIn(['cold', 'warm', 'hot']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 })
  ],
  handleValidationErrors,
  agentController.getLeads
);

/**
 * @route   PUT /api/v1/agents/leads/:leadId/status
 * @desc    Update lead status
 * @access  Private (Agent)
 */
router.put('/leads/:leadId/status',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  [
    param('leadId').isMongoId(),
    body('status').isIn(['new', 'contacted', 'qualified', 'negotiating', 'proposal_sent', 'won', 'lost', 'dormant']),
    body('notes').optional().isString().isLength({ max: 1000 }),
    body('nextFollowUpDate').optional().isISO8601()
  ],
  handleValidationErrors,
  agentController.updateLeadStatus
);

/**
 * @route   POST /api/v1/agents/leads/:leadId/interactions
 * @desc    Add interaction to lead
 * @access  Private (Agent)
 */
router.post('/leads/:leadId/interactions',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  [
    param('leadId').isMongoId(),
    body('type').isIn(['call', 'whatsapp', 'email', 'meeting', 'note']),
    body('description').isString().isLength({ min: 5, max: 1000 }),
    body('outcome').optional().isString().isLength({ max: 500 }),
    body('nextAction').optional().isString().isLength({ max: 500 })
  ],
  handleValidationErrors,
  agentController.addLeadInteraction
);

// Analytics Routes

/**
 * @route   GET /api/v1/agents/analytics
 * @desc    Get agent analytics
 * @access  Private (Agent)
 */
router.get('/analytics',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  [
    query('period').optional().isIn(['7d', '30d', '90d', '1y'])
  ],
  handleValidationErrors,
  agentController.getAnalytics
);

// WhatsApp Message Routes

/**
 * @route   POST /api/v1/agents/whatsapp/send
 * @desc    Send WhatsApp text message
 * @access  Private (Agent)
 */
router.post('/whatsapp/send',
  authenticateToken,
  requireRole(UserRole.AGENT),
  messageRateLimit,
  [
    body('to').isMobilePhone('any'),
    body('message').isString().isLength({ min: 1, max: 4096 }),
    body('leadId').optional().isMongoId()
  ],
  handleValidationErrors,
  agentController.sendWhatsAppMessage
);

/**
 * @route   POST /api/v1/agents/whatsapp/template
 * @desc    Send WhatsApp template message
 * @access  Private (Agent)
 */
router.post('/whatsapp/template',
  authenticateToken,
  requireRole(UserRole.AGENT),
  messageRateLimit,
  [
    body('to').isMobilePhone('any'),
    body('templateName').isString().isLength({ min: 1, max: 100 }),
    body('parameters').optional().isArray(),
    body('leadId').optional().isMongoId()
  ],
  handleValidationErrors,
  agentController.sendTemplateMessage
);

/**
 * @route   POST /api/v1/agents/whatsapp/bulk
 * @desc    Send bulk WhatsApp messages
 * @access  Private (Agent)
 */
router.post('/whatsapp/bulk',
  authenticateToken,
  requireRole(UserRole.AGENT),
  messageRateLimit,
  [
    body('contacts').isArray({ min: 1, max: 100 }),
    body('contacts.*.phone').isMobilePhone('any'),
    body('contacts.*.leadId').optional().isMongoId(),
    body('contacts.*.name').optional().isString(),
    body('message').isString().isLength({ min: 1, max: 4096 }),
    body('campaignId').optional().isString()
  ],
  handleValidationErrors,
  agentController.sendBulkMessages
);

/**
 * @route   GET /api/v1/agents/whatsapp/templates
 * @desc    Get WhatsApp message templates
 * @access  Private (Agent)
 */
router.get('/whatsapp/templates',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  agentController.getMessageTemplates
);

/**
 * @route   GET /api/v1/agents/whatsapp/analytics
 * @desc    Get WhatsApp message analytics
 * @access  Private (Agent)
 */
router.get('/whatsapp/analytics',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  [
    query('days').optional().isInt({ min: 1, max: 365 })
  ],
  handleValidationErrors,
  agentController.getMessageAnalytics
);

// Commission Routes

/**
 * @route   GET /api/v1/agents/commissions
 * @desc    Get agent commissions
 * @access  Private (Agent)
 */
router.get('/commissions',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  [
    query('status').optional().isIn(['pending', 'approved', 'paid', 'disputed', 'cancelled']),
    query('type').optional().isIn(['transaction', 'subscription', 'bonus', 'referral']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 })
  ],
  handleValidationErrors,
  agentController.getCommissions
);

/**
 * @route   GET /api/v1/agents/commissions/summary
 * @desc    Get commission summary
 * @access  Private (Agent)
 */
router.get('/commissions/summary',
  authenticateToken,
  requireRole(UserRole.AGENT),
  generalRateLimit,
  [
    query('period').optional().isIn(['7d', '30d', '90d', '1y'])
  ],
  handleValidationErrors,
  agentController.getCommissionSummary
);

export default router;