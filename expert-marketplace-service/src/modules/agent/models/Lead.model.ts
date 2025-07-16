import { Schema, model } from 'mongoose';
import { ILead, LeadStatus, LeadType, LeadSource } from '../interfaces/agent.interface';

const locationSchema = new Schema({
  country: { type: String, required: true },
  state: { type: String },
  city: { type: String }
}, { _id: false });

const interactionHistorySchema = new Schema({
  date: { type: Date, required: true, default: Date.now },
  type: {
    type: String,
    enum: ['call', 'whatsapp', 'email', 'meeting', 'note'],
    required: true
  },
  description: { type: String, required: true },
  outcome: { type: String },
  nextAction: { type: String }
}, { _id: true });

const reassignmentHistorySchema = new Schema({
  fromAgent: { type: Schema.Types.ObjectId, ref: 'AgentProfile', required: true },
  toAgent: { type: Schema.Types.ObjectId, ref: 'AgentProfile', required: true },
  reason: { type: String, required: true },
  date: { type: Date, required: true, default: Date.now }
}, { _id: false });

const leadSchema = new Schema<ILead>({
  leadId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'AgentProfile',
    required: true,
    index: true
  },
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  companyName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  contactPerson: {
    type: String,
    required: true,
    trim: true
  },
  contactEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  contactPhone: {
    type: String,
    required: true,
    trim: true
  },
  whatsappNumber: {
    type: String,
    trim: true,
    index: true
  },
  leadType: {
    type: String,
    enum: Object.values(LeadType),
    required: true,
    index: true
  },
  productCategories: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one product category is required'
    },
    index: true
  },
  estimatedTransactionVolume: {
    type: Number,
    min: 0
  },
  estimatedTransactionValue: {
    type: Number,
    min: 0
  },
  urgency: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    required: true,
    default: 'medium',
    index: true
  },
  location: {
    type: locationSchema,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(LeadStatus),
    default: LeadStatus.NEW,
    required: true,
    index: true
  },
  source: {
    type: String,
    enum: Object.values(LeadSource),
    required: true,
    index: true
  },
  sourceDetails: {
    type: String,
    maxlength: 500
  },
  priority: {
    type: Number,
    min: 1,
    max: 5,
    default: 3,
    index: true
  },
  temperature: {
    type: String,
    enum: ['cold', 'warm', 'hot'],
    default: 'cold',
    index: true
  },
  lastContactDate: {
    type: Date,
    index: true
  },
  nextFollowUpDate: {
    type: Date,
    index: true
  },
  expectedCloseDate: {
    type: Date,
    index: true
  },
  actualCloseDate: {
    type: Date
  },
  interactionCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastInteractionType: {
    type: String,
    enum: ['whatsapp', 'phone', 'email', 'meeting']
  },
  convertedToRFQ: {
    type: Schema.Types.ObjectId,
    ref: 'RFQ'
  },
  convertedToOrder: {
    type: Schema.Types.ObjectId,
    ref: 'Order'
  },
  finalTransactionValue: {
    type: Number,
    min: 0
  },
  notes: {
    type: String,
    maxlength: 2000,
    default: ''
  },
  interactionHistory: [interactionHistorySchema],
  assignedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  assignmentReason: {
    type: String,
    maxlength: 500
  },
  reassignmentHistory: [reassignmentHistorySchema]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
leadSchema.index({ agentId: 1, status: 1 });
leadSchema.index({ status: 1, priority: -1, assignedAt: -1 });
leadSchema.index({ nextFollowUpDate: 1, status: 1 });
leadSchema.index({ 'location.country': 1, 'location.state': 1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ temperature: 1, urgency: 1 });
leadSchema.index({ estimatedTransactionValue: -1 });

// Text search index
leadSchema.index({
  companyName: 'text',
  contactPerson: 'text',
  notes: 'text'
});

// Compound indexes for common queries
leadSchema.index({ agentId: 1, status: 1, nextFollowUpDate: 1 });
leadSchema.index({ status: 1, temperature: 1, priority: -1 });

// Virtual for days in pipeline
leadSchema.virtual('daysInPipeline').get(function() {
  const startDate = this.assignedAt;
  const endDate = this.actualCloseDate || new Date();
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
leadSchema.virtual('isOverdue').get(function() {
  return this.nextFollowUpDate && this.nextFollowUpDate < new Date() && 
         !['won', 'lost'].includes(this.status);
});

// Virtual for lead score
leadSchema.virtual('leadScore').get(function() {
  let score = 0;

  // Base score from estimated value
  if (this.estimatedTransactionValue) {
    score += Math.min(this.estimatedTransactionValue / 1000, 50);
  }

  // Urgency scoring
  const urgencyScores = { urgent: 30, high: 20, medium: 10, low: 5 };
  score += urgencyScores[this.urgency] || 0;

  // Temperature scoring
  const temperatureScores = { hot: 30, warm: 20, cold: 10 };
  score += temperatureScores[this.temperature] || 0;

  // Interaction frequency scoring
  if (this.interactionCount > 0) {
    score += Math.min(this.interactionCount * 2, 20);
  }

  // Recency scoring (more recent = higher score)
  if (this.lastContactDate) {
    const daysSinceContact = Math.floor((Date.now() - this.lastContactDate.getTime()) / (1000 * 60 * 60 * 24));
    score += Math.max(20 - daysSinceContact, 0);
  }

  return Math.min(Math.round(score), 100);
});

// Virtual for conversion probability
leadSchema.virtual('conversionProbability').get(function() {
  let probability = 0.1; // Base 10% chance

  // Status-based probability
  const statusProbabilities = {
    [LeadStatus.NEW]: 0.1,
    [LeadStatus.CONTACTED]: 0.15,
    [LeadStatus.QUALIFIED]: 0.3,
    [LeadStatus.NEGOTIATING]: 0.6,
    [LeadStatus.PROPOSAL_SENT]: 0.7,
    [LeadStatus.WON]: 1.0,
    [LeadStatus.LOST]: 0.0,
    [LeadStatus.DORMANT]: 0.05
  };

  probability = statusProbabilities[this.status] || 0.1;

  // Temperature adjustment
  const temperatureMultipliers = { hot: 1.5, warm: 1.2, cold: 0.8 };
  probability *= temperatureMultipliers[this.temperature] || 1;

  // Interaction frequency adjustment
  if (this.interactionCount > 5) {
    probability *= 1.3;
  } else if (this.interactionCount > 2) {
    probability *= 1.1;
  }

  // Time decay (leads get less likely to convert over time)
  const daysOld = this.daysInPipeline;
  if (daysOld > 90) {
    probability *= 0.5;
  } else if (daysOld > 30) {
    probability *= 0.8;
  }

  return Math.min(Math.round(probability * 100), 100);
});

// Method to update interaction
leadSchema.methods.addInteraction = async function(
  type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'note',
  description: string,
  outcome?: string,
  nextAction?: string
) {
  this.interactionHistory.push({
    date: new Date(),
    type,
    description,
    outcome,
    nextAction
  });

  this.interactionCount += 1;
  this.lastContactDate = new Date();
  this.lastInteractionType = type === 'note' ? this.lastInteractionType : type;

  // Auto-update temperature based on interaction
  if (type === 'meeting' || (outcome && outcome.toLowerCase().includes('interested'))) {
    this.temperature = 'hot';
  } else if (this.interactionCount > 3) {
    this.temperature = 'warm';
  }

  await this.save();
};

// Method to update status
leadSchema.methods.updateStatus = async function(
  newStatus: LeadStatus,
  reason?: string,
  nextFollowUpDate?: Date
) {
  const oldStatus = this.status;
  this.status = newStatus;

  // Set close date for final statuses
  if ([LeadStatus.WON, LeadStatus.LOST].includes(newStatus)) {
    this.actualCloseDate = new Date();
  }

  // Update next follow-up date
  if (nextFollowUpDate) {
    this.nextFollowUpDate = nextFollowUpDate;
  }

  // Add status change to interaction history
  await this.addInteraction('note', `Status changed from ${oldStatus} to ${newStatus}`, reason);

  await this.save();
};

// Method to reassign lead
leadSchema.methods.reassignTo = async function(
  newAgentId: string,
  reason: string,
  reassignedBy?: string
) {
  const oldAgentId = this.agentId;
  
  this.reassignmentHistory.push({
    fromAgent: oldAgentId,
    toAgent: newAgentId,
    reason,
    date: new Date()
  });

  this.agentId = newAgentId;
  this.assignedAt = new Date();
  this.assignedBy = reassignedBy;

  await this.addInteraction('note', `Lead reassigned: ${reason}`);
  await this.save();
};

// Method to convert to RFQ
leadSchema.methods.convertToRFQ = async function(rfqId: string, transactionValue?: number) {
  this.convertedToRFQ = rfqId;
  this.status = LeadStatus.WON;
  this.actualCloseDate = new Date();
  
  if (transactionValue) {
    this.finalTransactionValue = transactionValue;
  }

  await this.addInteraction('note', `Lead converted to RFQ: ${rfqId}`);
  await this.save();
};

// Pre-save middleware
leadSchema.pre('save', function(next) {
  // Generate lead ID if not exists
  if (!this.leadId) {
    const agentCode = this.agentId.toString().slice(-4);
    const timestamp = Date.now().toString().slice(-6);
    this.leadId = `LD${agentCode}${timestamp}`;
  }

  // Auto-set WhatsApp number to phone if not provided
  if (!this.whatsappNumber && this.contactPhone) {
    this.whatsappNumber = this.contactPhone;
  }

  // Auto-update temperature based on estimated value
  if (this.estimatedTransactionValue) {
    if (this.estimatedTransactionValue > 100000) {
      this.temperature = 'hot';
    } else if (this.estimatedTransactionValue > 50000) {
      this.temperature = 'warm';
    }
  }

  next();
});

// Static method to generate lead ID
leadSchema.statics.generateLeadId = function(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `LD${timestamp}${random}`;
};

// Static method to get leads requiring follow-up
leadSchema.statics.getLeadsRequiringFollowUp = function() {
  return this.find({
    nextFollowUpDate: { $lte: new Date() },
    status: { $nin: [LeadStatus.WON, LeadStatus.LOST] }
  }).populate('agentId', 'firstName lastName whatsappNumber');
};

// Static method to get stale leads
leadSchema.statics.getStaleLeads = function(daysThreshold: number = 30) {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

  return this.find({
    lastContactDate: { $lt: thresholdDate },
    status: { $nin: [LeadStatus.WON, LeadStatus.LOST, LeadStatus.DORMANT] }
  }).populate('agentId', 'firstName lastName');
};

// Static method for lead analytics
leadSchema.statics.getLeadAnalytics = async function(agentId?: string, startDate?: Date, endDate?: Date) {
  const matchQuery: any = {};
  
  if (agentId) {
    matchQuery.agentId = agentId;
  }
  
  if (startDate && endDate) {
    matchQuery.createdAt = { $gte: startDate, $lte: endDate };
  }

  const pipeline = [
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalLeads: { $sum: 1 },
        newLeads: {
          $sum: { $cond: [{ $eq: ['$status', LeadStatus.NEW] }, 1, 0] }
        },
        contactedLeads: {
          $sum: { $cond: [{ $eq: ['$status', LeadStatus.CONTACTED] }, 1, 0] }
        },
        qualifiedLeads: {
          $sum: { $cond: [{ $eq: ['$status', LeadStatus.QUALIFIED] }, 1, 0] }
        },
        wonLeads: {
          $sum: { $cond: [{ $eq: ['$status', LeadStatus.WON] }, 1, 0] }
        },
        lostLeads: {
          $sum: { $cond: [{ $eq: ['$status', LeadStatus.LOST] }, 1, 0] }
        },
        totalValue: { $sum: '$finalTransactionValue' },
        avgLeadScore: { $avg: '$leadScore' },
        avgDaysInPipeline: { $avg: '$daysInPipeline' }
      }
    },
    {
      $addFields: {
        conversionRate: {
          $cond: [
            { $gt: ['$totalLeads', 0] },
            { $multiply: [{ $divide: ['$wonLeads', '$totalLeads'] }, 100] },
            0
          ]
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalLeads: 0,
    newLeads: 0,
    contactedLeads: 0,
    qualifiedLeads: 0,
    wonLeads: 0,
    lostLeads: 0,
    totalValue: 0,
    avgLeadScore: 0,
    avgDaysInPipeline: 0,
    conversionRate: 0
  };
};

// Static method to get leads requiring follow-up
leadSchema.statics.getLeadsRequiringFollowUp = async function() {
  const today = new Date();
  
  return this.find({
    nextFollowUpDate: { $lte: today },
    status: { $nin: [LeadStatus.WON, LeadStatus.LOST, LeadStatus.DORMANT] }
  }).populate('agentId', 'firstName lastName agentCode');
};

export const Lead = model<ILead>('Lead', leadSchema);