import { Schema, model, Document, Types } from 'mongoose';

export enum SampleWorkflowStage {
  REQUEST = 'request',
  APPROVED = 'approved',
  SHIPPING = 'shipping',
  DELIVERY = 'delivery',
  TESTING = 'testing',
  NEGOTIATION = 'negotiation',
  COMPLIANCE = 'compliance',
  APPROVAL = 'approval',
  CONVERTED = 'converted',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled'
}

export enum SampleStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface IWorkflowStage {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: Date;
  data?: Record<string, any>;
  updatedBy: Types.ObjectId;
  notes?: string;
}

export interface ITemperatureReading {
  timestamp: Date;
  value: number;
  location?: string;
  deviceId?: string;
  zone: 'ambient' | 'refrigerated' | 'frozen';
}

export interface IAIInsights {
  conversionProbability: number;
  qualityScore: number;
  complianceFlags: string[];
  recommendations: string[];
  lastUpdated: Date;
  factors?: {
    positive: string[];
    negative: string[];
  };
  confidence?: number;
}

export interface ITimelineEvent {
  event: string;
  timestamp: Date;
  userId: Types.ObjectId;
  userName: string;
  details: string;
  metadata?: Record<string, any>;
}

export interface IDocumentAnalysis {
  documentType: string;
  confidence: number;
  extractedData: Record<string, any>;
  complianceStatus: 'passed' | 'failed' | 'pending';
  issues?: string[];
}

export interface ISampleTracking extends Document {
  sampleId: string;

  // References
  rfqId?: Types.ObjectId;
  buyerId: Types.ObjectId;
  buyerName: string;
  supplierId: Types.ObjectId;
  supplierName: string;

  // Product details
  product: {
    name: string;
    sku: string;
    category: string;
    specifications: Record<string, any>;
    images: string[];
    estimatedValue?: number;
  };

  // Workflow management
  workflow: {
    currentStage: SampleWorkflowStage;
    stages: Map<string, IWorkflowStage>;
    completedStages: string[];
    nextExpectedStage?: SampleWorkflowStage;
  };

  // Tracking information
  tracking: {
    carrier?: string;
    trackingNumber?: string;
    estimatedDelivery?: Date;
    actualDelivery?: Date;
    temperature?: {
      zone: 'ambient' | 'refrigerated' | 'frozen';
      readings: ITemperatureReading[];
      alerts?: Array<{
        timestamp: Date;
        message: string;
        severity: 'low' | 'medium' | 'high';
      }>;
    };
  };

  // AI-powered insights
  aiInsights: IAIInsights;

  // Quality assessment
  qualityAssessment?: {
    overallScore: number;
    visualInspection: {
      score: number;
      images: string[];
      analysis: Record<string, any>;
    };
    labResults?: Array<{
      testType: string;
      result: string;
      score: number;
      date: Date;
      laboratory: string;
      certificate?: string;
    }>;
    complianceChecks: Array<{
      requirement: string;
      status: 'passed' | 'failed' | 'pending';
      evidence?: string;
      notes?: string;
    }>;
  };

  // Documents and compliance
  documents: Array<{
    type: string;
    name: string;
    url: string;
    uploadedAt: Date;
    uploadedBy: Types.ObjectId;
    analysis?: IDocumentAnalysis;
  }>;

  // Communication and negotiation
  communications: Array<{
    timestamp: Date;
    fromUserId: Types.ObjectId;
    fromUserName: string;
    toUserId: Types.ObjectId;
    toUserName: string;
    type: 'email' | 'message' | 'call' | 'meeting';
    subject?: string;
    content: string;
    attachments?: string[];
  }>;

  negotiation?: {
    priceOffered?: number;
    priceRequested?: number;
    agreedPrice?: number;
    terms?: Record<string, any>;
    status: 'pending' | 'in_progress' | 'agreed' | 'failed';
    history: Array<{
      timestamp: Date;
      userId: Types.ObjectId;
      action: string;
      details: Record<string, any>;
    }>;
  };

  // Timeline for audit trail
  timeline: ITimelineEvent[];

  // Conversion tracking
  conversionData?: {
    convertedAt: Date;
    orderId: Types.ObjectId;
    orderValue: number;
    conversionProbabilityAtStart: number;
    actualFactors: string[];
  };

  // Sample specifications
  sampleSpecs: {
    quantity: number;
    unit: string;
    expiryDate?: Date;
    batchNumber?: string;
    productionDate?: Date;
    specialRequirements?: string[];
  };

  // Status tracking
  status: SampleStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';

  // Timestamps
  requestedAt: Date;
  approvedAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;

  // Metadata
  tags?: string[];
  internalNotes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const WorkflowStageSchema = new Schema<IWorkflowStage>({
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending'
  },
  timestamp: { type: Date, default: Date.now },
  data: { type: Map, of: Schema.Types.Mixed },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  notes: String
}, { _id: false });

const TemperatureReadingSchema = new Schema<ITemperatureReading>({
  timestamp: { type: Date, required: true },
  value: { type: Number, required: true },
  location: String,
  deviceId: String,
  zone: {
    type: String,
    enum: ['ambient', 'refrigerated', 'frozen'],
    required: true
  }
}, { _id: false });

const AIInsightsSchema = new Schema<IAIInsights>({
  conversionProbability: { type: Number, min: 0, max: 1, default: 0.5 },
  qualityScore: { type: Number, min: 0, max: 10, default: 0 },
  complianceFlags: { type: [String], default: [] },
  recommendations: { type: [String], default: [] },
  lastUpdated: { type: Date, default: Date.now },
  factors: {
    positive: { type: [String], default: [] },
    negative: { type: [String], default: [] }
  },
  confidence: { type: Number, min: 0, max: 1 }
}, { _id: false });

const TimelineEventSchema = new Schema<ITimelineEvent>({
  event: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  details: { type: String, required: true },
  metadata: { type: Map, of: Schema.Types.Mixed }
}, { _id: false });

const SampleTrackingSchema = new Schema<ISampleTracking>({
  sampleId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },

  rfqId: { type: Schema.Types.ObjectId, ref: 'RFQ' },
  buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  buyerName: { type: String, required: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  supplierName: { type: String, required: true },

  product: {
    name: { type: String, required: true },
    sku: { type: String, required: true },
    category: { type: String, required: true },
    specifications: { type: Map, of: Schema.Types.Mixed, default: {} },
    images: { type: [String], default: [] },
    estimatedValue: Number
  },

  workflow: {
    currentStage: {
      type: String,
      enum: Object.values(SampleWorkflowStage),
      default: SampleWorkflowStage.REQUEST,
      index: true
    },
    stages: {
      type: Map,
      of: WorkflowStageSchema,
      default: () => new Map()
    },
    completedStages: { type: [String], default: [] },
    nextExpectedStage: {
      type: String,
      enum: Object.values(SampleWorkflowStage)
    }
  },

  tracking: {
    carrier: String,
    trackingNumber: { type: String, index: true },
    estimatedDelivery: Date,
    actualDelivery: Date,
    temperature: {
      zone: {
        type: String,
        enum: ['ambient', 'refrigerated', 'frozen']
      },
      readings: { type: [TemperatureReadingSchema], default: [] },
      alerts: [{
        timestamp: Date,
        message: String,
        severity: { type: String, enum: ['low', 'medium', 'high'] }
      }]
    }
  },

  aiInsights: {
    type: AIInsightsSchema,
    required: true,
    default: () => ({})
  },

  qualityAssessment: {
    overallScore: { type: Number, min: 0, max: 10 },
    visualInspection: {
      score: { type: Number, min: 0, max: 10 },
      images: [String],
      analysis: { type: Map, of: Schema.Types.Mixed }
    },
    labResults: [{
      testType: { type: String, required: true },
      result: { type: String, required: true },
      score: { type: Number, min: 0, max: 10 },
      date: { type: Date, required: true },
      laboratory: { type: String, required: true },
      certificate: String
    }],
    complianceChecks: [{
      requirement: { type: String, required: true },
      status: { type: String, enum: ['passed', 'failed', 'pending'], required: true },
      evidence: String,
      notes: String
    }]
  },

  documents: [{
    type: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    analysis: {
      documentType: String,
      confidence: Number,
      extractedData: { type: Map, of: Schema.Types.Mixed },
      complianceStatus: { type: String, enum: ['passed', 'failed', 'pending'] },
      issues: [String]
    }
  }],

  communications: [{
    timestamp: { type: Date, default: Date.now },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fromUserName: { type: String, required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUserName: { type: String, required: true },
    type: { type: String, enum: ['email', 'message', 'call', 'meeting'], required: true },
    subject: String,
    content: { type: String, required: true },
    attachments: [String]
  }],

  negotiation: {
    priceOffered: Number,
    priceRequested: Number,
    agreedPrice: Number,
    terms: { type: Map, of: Schema.Types.Mixed },
    status: { type: String, enum: ['pending', 'in_progress', 'agreed', 'failed'], default: 'pending' },
    history: [{
      timestamp: { type: Date, default: Date.now },
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      action: { type: String, required: true },
      details: { type: Map, of: Schema.Types.Mixed, required: true }
    }]
  },

  timeline: {
    type: [TimelineEventSchema],
    default: []
  },

  conversionData: {
    convertedAt: Date,
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderValue: Number,
    conversionProbabilityAtStart: Number,
    actualFactors: [String]
  },

  sampleSpecs: {
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    expiryDate: Date,
    batchNumber: String,
    productionDate: Date,
    specialRequirements: [String]
  },

  status: {
    type: String,
    enum: Object.values(SampleStatus),
    default: SampleStatus.ACTIVE,
    index: true
  },

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  requestedAt: { type: Date, default: Date.now, required: true },
  approvedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  completedAt: Date,
  cancelledAt: Date,

  tags: [String],
  internalNotes: String
}, {
  timestamps: true,
  collection: 'sampleTracking'
});

// Indexes for performance
SampleTrackingSchema.index({ 'workflow.currentStage': 1, createdAt: -1 });
SampleTrackingSchema.index({ buyerId: 1, status: 1 });
SampleTrackingSchema.index({ supplierId: 1, status: 1 });
SampleTrackingSchema.index({ 'tracking.trackingNumber': 1 });
SampleTrackingSchema.index({ requestedAt: -1 });
SampleTrackingSchema.index({ tags: 1 });

// Virtual properties
SampleTrackingSchema.virtual('isOverdue').get(function() {
  if (!this.tracking.estimatedDelivery) return false;
  return Date.now() > this.tracking.estimatedDelivery.getTime() &&
         this.workflow.currentStage !== SampleWorkflowStage.CONVERTED &&
         this.status === SampleStatus.ACTIVE;
});

SampleTrackingSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.requestedAt.getTime()) / (1000 * 60 * 60 * 24));
});

SampleTrackingSchema.virtual('progressPercentage').get(function() {
  const totalStages = Object.values(SampleWorkflowStage).length - 2; // Exclude REJECTED and CANCELLED
  const completedCount = this.workflow.completedStages.length;
  return Math.round((completedCount / totalStages) * 100);
});

// Methods
SampleTrackingSchema.methods.addTimelineEvent = async function(
  event: string,
  userId: Types.ObjectId,
  userName: string,
  details: string,
  metadata?: Record<string, any>
): Promise<ISampleTracking> {
  this.timeline.push({
    event,
    timestamp: new Date(),
    userId,
    userName,
    details,
    metadata
  });
  return this.save();
};

SampleTrackingSchema.methods.updateWorkflowStage = async function(
  stage: SampleWorkflowStage,
  userId: Types.ObjectId,
  data?: Record<string, any>,
  notes?: string
): Promise<ISampleTracking> {
  // Update current stage
  const previousStage = this.workflow.currentStage;
  this.workflow.currentStage = stage;

  // Mark previous stage as completed if not already
  if (previousStage && !this.workflow.completedStages.includes(previousStage)) {
    this.workflow.completedStages.push(previousStage);
  }

  // Update stage details
  this.workflow.stages.set(stage, {
    status: 'in_progress',
    timestamp: new Date(),
    data: data || {},
    updatedBy: userId,
    notes
  });

  // Add timeline event
  await this.addTimelineEvent(
    `Stage updated to ${stage}`,
    userId,
    'System', // This should be replaced with actual user name
    `Workflow stage changed from ${previousStage} to ${stage}`,
    { previousStage, newStage: stage, data }
  );

  // Update stage-specific timestamps
  switch (stage) {
    case SampleWorkflowStage.APPROVED:
      this.approvedAt = new Date();
      break;
    case SampleWorkflowStage.SHIPPING:
      this.shippedAt = new Date();
      break;
    case SampleWorkflowStage.DELIVERY:
      this.deliveredAt = new Date();
      break;
    case SampleWorkflowStage.CONVERTED:
      this.completedAt = new Date();
      this.status = SampleStatus.COMPLETED;
      break;
    case SampleWorkflowStage.REJECTED:
    case SampleWorkflowStage.CANCELLED:
      this.cancelledAt = new Date();
      this.status = SampleStatus.CANCELLED;
      break;
  }

  return this.save();
};

SampleTrackingSchema.methods.addTemperatureReading = async function(
  reading: ITemperatureReading
): Promise<ISampleTracking> {
  if (!this.tracking.temperature) {
    this.tracking.temperature = {
      zone: reading.zone,
      readings: [],
      alerts: []
    };
  }

  this.tracking.temperature.readings.push(reading);

  // Check for temperature violations (example thresholds)
  const thresholds = {
    refrigerated: { min: 2, max: 8 },
    frozen: { min: -25, max: -15 },
    ambient: { min: 15, max: 25 }
  };

  const threshold = thresholds[reading.zone];
  if (threshold && (reading.value < threshold.min || reading.value > threshold.max)) {
    this.tracking.temperature.alerts = this.tracking.temperature.alerts || [];
    this.tracking.temperature.alerts.push({
      timestamp: new Date(),
      message: `Temperature ${reading.value}°C outside acceptable range for ${reading.zone} storage`,
      severity: Math.abs(reading.value - ((threshold.min + threshold.max) / 2)) > 5 ? 'high' : 'medium'
    });
  }

  return this.save();
};

SampleTrackingSchema.methods.updateAIInsights = async function(insights: Partial<IAIInsights>): Promise<ISampleTracking> {
  this.aiInsights = {
    ...this.aiInsights,
    ...insights,
    lastUpdated: new Date()
  };
  return this.save();
};

// Pre-save middleware
SampleTrackingSchema.pre('save', function(next) {
  // Generate sampleId if not present
  if (!this.sampleId && this.isNew) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    this.sampleId = `SMPL-${year}${month}-${random}`;
  }

  // Initialize workflow stages if new
  if (this.isNew && this.workflow.stages.size === 0) {
    this.workflow.stages.set(SampleWorkflowStage.REQUEST, {
      status: 'completed',
      timestamp: new Date(),
      updatedBy: this.buyerId,
      data: { initialRequest: true }
    });
    this.workflow.completedStages = [SampleWorkflowStage.REQUEST];
  }

  // Add initial timeline event if new
  if (this.isNew && this.timeline.length === 0) {
    this.timeline.push({
      event: 'Sample request created',
      timestamp: new Date(),
      userId: this.buyerId,
      userName: this.buyerName,
      details: `Sample request created for ${this.product.name}`
    });
  }

  next();
});

// Static methods
SampleTrackingSchema.statics.findByStage = function(stage: SampleWorkflowStage) {
  return this.find({ 'workflow.currentStage': stage, status: SampleStatus.ACTIVE })
    .sort('-requestedAt');
};

SampleTrackingSchema.statics.findOverdue = function() {
  return this.find({
    'tracking.estimatedDelivery': { $lt: new Date() },
    status: SampleStatus.ACTIVE,
    'workflow.currentStage': {
      $nin: [SampleWorkflowStage.CONVERTED, SampleWorkflowStage.REJECTED, SampleWorkflowStage.CANCELLED]
    }
  });
};

SampleTrackingSchema.statics.getAnalytics = function(filters: Record<string, any> = {}) {
  return this.aggregate([
    { $match: { ...filters } },
    {
      $group: {
        _id: '$workflow.currentStage',
        count: { $sum: 1 },
        avgConversionProbability: { $avg: '$aiInsights.conversionProbability' },
        avgQualityScore: { $avg: '$aiInsights.qualityScore' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

export const SampleTracking = model<ISampleTracking>('SampleTracking', SampleTrackingSchema);
export default SampleTracking;
