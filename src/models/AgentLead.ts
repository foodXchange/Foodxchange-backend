const mongoose = require('mongoose');

const agentLeadSchema = new mongoose.Schema({
  leadNumber: {
    type: String,
    unique: true,
    required: true
  },

  // Lead Source
  source: {
    type: {
      type: String,
      enum: ['rfq', 'sample_request', 'supplier_inquiry', 'buyer_inquiry', 'manual'],
      required: true
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'source.sourceModel'
    },
    sourceModel: {
      type: String,
      enum: ['RFQ', 'SampleRequest', 'Request', 'Product']
    }
  },

  // Lead Details
  leadInfo: {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    subcategory: String,
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    estimatedValue: {
      amount: Number,
      currency: { type: String, default: 'USD' }
    },
    requirements: {
      quantity: Number,
      unit: String,
      specifications: [String],
      deliveryDate: Date,
      deliveryLocation: {
        city: String,
        state: String,
        country: String,
        coordinates: {
          lat: Number,
          lng: Number
        }
      }
    }
  },

  // Buyer Information
  buyer: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    contact: {
      name: String,
      email: String,
      phone: String,
      position: String
    },
    profile: {
      isNewCustomer: { type: Boolean, default: false },
      previousOrders: { type: Number, default: 0 },
      averageOrderValue: { type: Number, default: 0 },
      paymentHistory: {
        type: String,
        enum: ['excellent', 'good', 'fair', 'poor'],
        default: 'good'
      },
      preferredPaymentTerms: String
    }
  },

  // Agent Assignment
  assignment: {
    method: {
      type: String,
      enum: ['auto_match', 'manual', 'invitation', 'self_service'],
      default: 'auto_match'
    },
    assignedAgents: [{
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: true
      },
      assignedAt: { type: Date, default: Date.now },
      assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      priority: {
        type: String,
        enum: ['primary', 'secondary', 'backup'],
        default: 'primary'
      },
      matchScore: { type: Number, min: 0, max: 100 },
      matchReasons: [String],
      offerExpiresAt: Date,
      status: {
        type: String,
        enum: ['offered', 'accepted', 'declined', 'expired'],
        default: 'offered'
      },
      response: {
        respondedAt: Date,
        responseTime: Number, // minutes
        declineReason: String
      }
    }],
    activeAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent'
    },
    acceptedAt: Date,
    protectedUntil: Date // 30-day exclusivity period
  },

  // Lead Status and Tracking
  status: {
    type: String,
    enum: ['pending', 'assigned', 'accepted', 'in_progress', 'quoted', 'negotiating', 'closed_won', 'closed_lost', 'expired', 'cancelled'],
    default: 'pending'
  },

  workflow: {
    currentStep: {
      type: String,
      enum: ['lead_review', 'supplier_research', 'initial_contact', 'proposal_preparation', 'negotiation', 'closing', 'follow_up'],
      default: 'lead_review'
    },
    completedSteps: [String],
    nextAction: String,
    dueDate: Date
  },

  // Lead Interaction Timeline
  interactions: [{
    type: {
      type: String,
      enum: ['call', 'email', 'whatsapp', 'meeting', 'site_visit', 'proposal', 'negotiation', 'note'],
      required: true
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true
    },
    participants: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      role: String, // agent, buyer, supplier
      name: String
    }],
    subject: String,
    description: String,
    outcome: String,
    nextSteps: [String],
    attachments: [String],
    duration: Number, // minutes
    scheduledFor: Date,
    completedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // Supplier Matching and Proposals
  suppliers: [{
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    contact: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
      email: String,
      phone: String
    },
    matchScore: { type: Number, min: 0, max: 100 },
    matchReasons: [String],
    status: {
      type: String,
      enum: ['identified', 'contacted', 'interested', 'quoted', 'declined', 'selected'],
      default: 'identified'
    },
    contactedAt: Date,
    responseTime: Number, // hours

    // Proposal Details
    proposal: {
      submittedAt: Date,
      pricing: {
        unitPrice: Number,
        totalPrice: Number,
        currency: { type: String, default: 'USD' },
        validUntil: Date,
        terms: String
      },
      delivery: {
        leadTime: Number,
        leadTimeUnit: String,
        location: String,
        cost: Number
      },
      specifications: [{
        attribute: String,
        value: String,
        compliance: Boolean
      }],
      samples: {
        available: Boolean,
        cost: Number,
        deliveryTime: String
      },
      documents: [String],
      notes: String
    },

    // Evaluation
    evaluation: {
      scores: [{
        criteria: String,
        score: Number,
        weight: Number
      }],
      totalScore: Number,
      ranking: Number,
      pros: [String],
      cons: [String],
      recommendation: String
    }
  }],

  // Commission and Financial Details
  financial: {
    estimatedCommission: {
      amount: Number,
      currency: { type: String, default: 'USD' },
      rate: Number,
      calculation: String
    },
    actualCommission: {
      amount: Number,
      currency: { type: String, default: 'USD' },
      rate: Number,
      calculation: String
    },
    dealValue: {
      amount: Number,
      currency: { type: String, default: 'USD' }
    },
    paymentTerms: String,
    invoiceDetails: {
      invoiceNumber: String,
      invoiceDate: Date,
      dueDate: Date,
      paidDate: Date,
      amount: Number
    }
  },

  // Performance Metrics
  metrics: {
    responseTime: {
      firstResponse: Number, // minutes
      averageResponse: Number // minutes
    },
    timeToClose: Number, // hours
    touchPoints: { type: Number, default: 0 },
    emailsSent: { type: Number, default: 0 },
    callsMade: { type: Number, default: 0 },
    meetingsHeld: { type: Number, default: 0 },
    proposalsGenerated: { type: Number, default: 0 },
    conversionProbability: { type: Number, min: 0, max: 100 }
  },

  // Lead Scoring and AI Insights
  scoring: {
    leadScore: { type: Number, min: 0, max: 100 },
    qualityScore: { type: Number, min: 0, max: 100 },
    urgencyScore: { type: Number, min: 0, max: 100 },
    valueScore: { type: Number, min: 0, max: 100 },
    competitionLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    winProbability: { type: Number, min: 0, max: 100 },
    aiInsights: {
      recommendations: [String],
      riskFactors: [String],
      opportunityFactors: [String],
      nextBestAction: String,
      similarLeads: [{
        leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentLead' },
        similarity: Number,
        outcome: String
      }]
    }
  },

  // Compliance and Quality
  compliance: {
    requiredCertifications: [String],
    complianceCheck: {
      status: {
        type: String,
        enum: ['pending', 'passed', 'failed', 'requires_attention'],
        default: 'pending'
      },
      checkedAt: Date,
      checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      issues: [String],
      notes: String
    }
  },

  // Feedback and Quality Control
  feedback: {
    buyerFeedback: {
      rating: { type: Number, min: 1, max: 5 },
      comments: String,
      submittedAt: Date,
      wouldRecommend: Boolean
    },
    supplierFeedback: {
      rating: { type: Number, min: 1, max: 5 },
      comments: String,
      submittedAt: Date,
      wouldWorkAgain: Boolean
    },
    agentSelfAssessment: {
      difficulty: { type: Number, min: 1, max: 5 },
      satisfaction: { type: Number, min: 1, max: 5 },
      learnings: String,
      improvements: String
    }
  },

  // Timestamps and Tracking
  deadlines: {
    responseDeadline: Date,
    proposalDeadline: Date,
    decisionDeadline: Date,
    deliveryDeadline: Date
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt: Date,

  // System Fields
  version: { type: Number, default: 1 },
  archived: { type: Boolean, default: false },
  archivedAt: Date,

  // Tags and Categories
  tags: [String],
  internalNotes: [String]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to generate lead number
agentLeadSchema.pre('save', function(next) {
  if (this.isNew && !this.leadNumber) {
    const timestamp = Date.now().toString().slice(-6);
    this.leadNumber = `AL-${timestamp}`;
  }
  next();
});

// Virtual for time remaining
agentLeadSchema.virtual('timeRemaining').get(function() {
  const deadline = this.deadlines.responseDeadline || this.deadlines.proposalDeadline;
  if (deadline) {
    const now = new Date();
    const diff = deadline - now;
    return diff > 0 ? diff : 0;
  }
  return 0;
});

// Virtual for lead age
agentLeadSchema.virtual('leadAge').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60 * 60 * 24)); // days
});

// Virtual for active agent info
agentLeadSchema.virtual('activeAgentInfo', {
  ref: 'Agent',
  localField: 'assignment.activeAgent',
  foreignField: '_id',
  justOne: true
});

// Indexes for efficient queries
agentLeadSchema.index({ leadNumber: 1 });
agentLeadSchema.index({ 'source.type': 1, 'source.sourceId': 1 });
agentLeadSchema.index({ 'buyer.userId': 1 });
agentLeadSchema.index({ 'buyer.company': 1 });
agentLeadSchema.index({ 'assignment.assignedAgents.agentId': 1 });
agentLeadSchema.index({ 'assignment.activeAgent': 1 });
agentLeadSchema.index({ status: 1 });
agentLeadSchema.index({ 'leadInfo.category': 1 });
agentLeadSchema.index({ 'leadInfo.urgency': 1 });
agentLeadSchema.index({ createdAt: 1 });
agentLeadSchema.index({ 'deadlines.responseDeadline': 1 });
agentLeadSchema.index({ 'deadlines.proposalDeadline': 1 });
agentLeadSchema.index({ 'scoring.leadScore': 1 });
agentLeadSchema.index({ 'scoring.winProbability': 1 });
agentLeadSchema.index({ 'leadInfo.requirements.deliveryLocation.coordinates': '2dsphere' });

// Text search index
agentLeadSchema.index({
  'leadInfo.title': 'text',
  'leadInfo.description': 'text',
  'leadInfo.requirements.specifications': 'text'
});

// Compound indexes for lead matching
agentLeadSchema.index({ 'leadInfo.category': 1, status: 1, 'leadInfo.urgency': 1 });
agentLeadSchema.index({ 'assignment.assignedAgents.status': 1, 'assignment.assignedAgents.assignedAt': 1 });

module.exports = mongoose.model('AgentLead', agentLeadSchema);
export default mongoose.model('AgentLead', agentLeadSchema);
