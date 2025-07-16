import { Schema, model } from 'mongoose';
import { IAgentProfile, AgentStatus, AgentTier } from '../interfaces/agent.interface';

const locationSchema = new Schema({
  country: { type: String, required: true },
  state: { type: String },
  city: { type: String },
  address: { type: String },
  coordinates: {
    latitude: { type: Number },
    longitude: { type: Number }
  }
}, { _id: false });

const documentSchema = new Schema({
  type: { type: String, required: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
  verified: { type: Boolean, default: false },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const notificationPreferencesSchema = new Schema({
  whatsapp: { type: Boolean, default: true },
  email: { type: Boolean, default: true },
  sms: { type: Boolean, default: false },
  pushNotifications: { type: Boolean, default: true }
}, { _id: false });

const agentProfileSchema = new Schema<IAgentProfile>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  agentCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  whatsappNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  profilePhoto: {
    type: String
  },
  location: {
    type: locationSchema,
    required: true
  },
  coverageAreas: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one coverage area is required'
    }
  },
  experienceYears: {
    type: Number,
    required: true,
    min: 0,
    max: 50
  },
  industryExperience: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one industry experience is required'
    }
  },
  languages: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one language is required'
    }
  },
  productCategories: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one product category is required'
    }
  },
  status: {
    type: String,
    enum: Object.values(AgentStatus),
    default: AgentStatus.PENDING,
    index: true
  },
  tier: {
    type: String,
    enum: Object.values(AgentTier),
    default: AgentTier.BRONZE,
    index: true
  },
  tierPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  verificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'unverified',
    index: true
  },
  verificationDate: {
    type: Date
  },
  hasBusinessRegistration: {
    type: Boolean,
    default: false
  },
  businessName: {
    type: String,
    trim: true
  },
  businessRegistrationNumber: {
    type: String,
    trim: true
  },
  taxId: {
    type: String,
    trim: true
  },
  existingSupplierConnections: {
    type: Number,
    default: 0,
    min: 0
  },
  existingBuyerConnections: {
    type: Number,
    default: 0,
    min: 0
  },
  networkDescription: {
    type: String,
    maxlength: 1000
  },
  totalLeads: {
    type: Number,
    default: 0,
    min: 0
  },
  convertedLeads: {
    type: Number,
    default: 0,
    min: 0
  },
  conversionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  totalCommissionsEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  totalTransactionValue: {
    type: Number,
    default: 0,
    min: 0
  },
  averageTransactionSize: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  isOnline: {
    type: Boolean,
    default: false,
    index: true
  },
  notificationPreferences: {
    type: notificationPreferencesSchema,
    default: () => ({})
  },
  autoAssignLeads: {
    type: Boolean,
    default: true
  },
  maxLeadsPerDay: {
    type: Number,
    default: 10,
    min: 1,
    max: 50
  },
  documents: [documentSchema]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
agentProfileSchema.index({ status: 1, tier: 1 });
agentProfileSchema.index({ 'location.country': 1, 'location.state': 1, 'location.city': 1 });
agentProfileSchema.index({ productCategories: 1 });
agentProfileSchema.index({ languages: 1 });
agentProfileSchema.index({ coverageAreas: 1 });
agentProfileSchema.index({ conversionRate: -1, totalCommissionsEarned: -1 });
agentProfileSchema.index({ lastActiveAt: -1 });

// Text search index
agentProfileSchema.index({
  firstName: 'text',
  lastName: 'text',
  agentCode: 'text',
  businessName: 'text',
  networkDescription: 'text'
});

// Virtual for full name
agentProfileSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for performance score
agentProfileSchema.virtual('performanceScore').get(function() {
  const conversionWeight = 0.4;
  const experienceWeight = 0.3;
  const networkWeight = 0.2;
  const activityWeight = 0.1;

  const conversionScore = Math.min(this.conversionRate, 100);
  const experienceScore = Math.min((this.experienceYears / 10) * 100, 100);
  const networkScore = Math.min(((this.existingSupplierConnections + this.existingBuyerConnections) / 20) * 100, 100);
  
  // Activity score based on how recently they were active
  const daysSinceActive = Math.floor((Date.now() - this.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24));
  const activityScore = Math.max(100 - (daysSinceActive * 5), 0);

  return Math.round(
    (conversionScore * conversionWeight) +
    (experienceScore * experienceWeight) +
    (networkScore * networkWeight) +
    (activityScore * activityWeight)
  );
});

// Virtual for tier requirements
agentProfileSchema.virtual('tierProgress').get(function() {
  const tierRequirements = {
    [AgentTier.BRONZE]: { leads: 0, points: 0 },
    [AgentTier.SILVER]: { leads: 5, points: 100 },
    [AgentTier.GOLD]: { leads: 20, points: 500 },
    [AgentTier.PLATINUM]: { leads: 50, points: 1500 }
  };

  const currentRequirements = tierRequirements[this.tier];
  const nextTier = this.getNextTier();
  const nextRequirements = nextTier ? tierRequirements[nextTier] : null;

  return {
    currentTier: this.tier,
    currentLeads: this.convertedLeads,
    currentPoints: this.tierPoints,
    nextTier,
    nextTierRequirements: nextRequirements,
    progress: nextRequirements ? {
      leadsProgress: Math.min((this.convertedLeads / nextRequirements.leads) * 100, 100),
      pointsProgress: Math.min((this.tierPoints / nextRequirements.points) * 100, 100)
    } : null
  };
});

// Method to get next tier
agentProfileSchema.methods.getNextTier = function(): AgentTier | null {
  const tierOrder = [AgentTier.BRONZE, AgentTier.SILVER, AgentTier.GOLD, AgentTier.PLATINUM];
  const currentIndex = tierOrder.indexOf(this.tier);
  return currentIndex < tierOrder.length - 1 ? tierOrder[currentIndex + 1] : null;
};

// Method to check tier eligibility
agentProfileSchema.methods.checkTierEligibility = function(): AgentTier | null {
  const tierRequirements = {
    [AgentTier.SILVER]: { leads: 5, points: 100 },
    [AgentTier.GOLD]: { leads: 20, points: 500 },
    [AgentTier.PLATINUM]: { leads: 50, points: 1500 }
  };

  for (const [tier, requirements] of Object.entries(tierRequirements)) {
    if (this.convertedLeads >= requirements.leads && this.tierPoints >= requirements.points) {
      if (tier > this.tier) {
        return tier as AgentTier;
      }
    }
  }

  return null;
};

// Method to update performance metrics
agentProfileSchema.methods.updatePerformanceMetrics = async function() {
  if (this.totalLeads > 0) {
    this.conversionRate = (this.convertedLeads / this.totalLeads) * 100;
  }

  if (this.convertedLeads > 0) {
    this.averageTransactionSize = this.totalTransactionValue / this.convertedLeads;
  }

  // Check for tier promotion
  const eligibleTier = this.checkTierEligibility();
  if (eligibleTier && eligibleTier !== this.tier) {
    this.tier = eligibleTier;
  }

  await this.save();
};

// Method to add tier points
agentProfileSchema.methods.addTierPoints = async function(points: number, reason: string) {
  this.tierPoints += points;
  
  // Check for tier promotion
  const eligibleTier = this.checkTierEligibility();
  if (eligibleTier && eligibleTier !== this.tier) {
    this.tier = eligibleTier;
  }

  await this.save();
  
  // Log the points addition (would integrate with audit system)
  console.log(`Agent ${this.agentCode} earned ${points} points for: ${reason}`);
};

// Pre-save middleware
agentProfileSchema.pre('save', function(next) {
  // Generate agent code if not exists
  if (!this.agentCode) {
    const locationCode = this.location.country.substring(0, 2).toUpperCase();
    const nameCode = (this.firstName.substring(0, 2) + this.lastName.substring(0, 2)).toUpperCase();
    const timestamp = Date.now().toString().slice(-4);
    this.agentCode = `${locationCode}${nameCode}${timestamp}`;
  }

  // Update verification status based on documents
  if (this.documents.length > 0 && this.verificationStatus === 'unverified') {
    this.verificationStatus = 'pending';
  }

  next();
});

// Static method to generate agent code
agentProfileSchema.statics.generateAgentCode = async function(
  firstName: string, 
  lastName: string, 
  country: string
): Promise<string> {
  const locationCode = country.substring(0, 2).toUpperCase();
  const nameCode = (firstName.substring(0, 2) + lastName.substring(0, 2)).toUpperCase();
  let attempts = 0;
  
  while (attempts < 10) {
    const timestamp = Date.now().toString().slice(-4);
    const code = `${locationCode}${nameCode}${timestamp}`;
    
    const existing = await this.findOne({ agentCode: code });
    if (!existing) {
      return code;
    }
    
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 10)); // Wait 10ms
  }
  
  // Fallback with random number
  const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${locationCode}${nameCode}${randomSuffix}`;
};

// Static method to find agents by coverage area
agentProfileSchema.statics.findByCoverageArea = function(area: string) {
  return this.find({
    coverageAreas: { $in: [area] },
    status: AgentStatus.ACTIVE,
    verificationStatus: 'verified'
  }).sort({ performanceScore: -1, conversionRate: -1 });
};

// Static method to find available agents for lead assignment
agentProfileSchema.statics.findAvailableForLeadAssignment = async function(criteria: {
  productCategory?: string;
  location?: string;
  maxLeadsPerAgent?: number;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pipeline = [
    {
      $match: {
        status: AgentStatus.ACTIVE,
        verificationStatus: 'verified',
        autoAssignLeads: true,
        ...(criteria.productCategory && { productCategories: criteria.productCategory }),
        ...(criteria.location && { coverageAreas: criteria.location })
      }
    },
    {
      $lookup: {
        from: 'leads',
        let: { agentId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$agentId', '$$agentId'] },
              assignedAt: { $gte: today },
              status: { $nin: ['won', 'lost'] }
            }
          }
        ],
        as: 'todayLeads'
      }
    },
    {
      $addFields: {
        todayLeadCount: { $size: '$todayLeads' },
        availableCapacity: { $subtract: ['$maxLeadsPerDay', { $size: '$todayLeads' }] }
      }
    },
    {
      $match: {
        availableCapacity: { $gt: 0 }
      }
    },
    {
      $sort: {
        tier: -1,
        conversionRate: -1,
        performanceScore: -1
      }
    }
  ];

  return this.aggregate(pipeline);
};

export const AgentProfile = model<IAgentProfile>('AgentProfile', agentProfileSchema);