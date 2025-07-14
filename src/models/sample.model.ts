import { Schema, model, Document, Types } from 'mongoose';

export enum SampleWorkflowStage {
  REQUESTED = 'requested',
  APPROVED = 'approved',
  PRODUCTION = 'production',
  QUALITY_CHECK = 'quality_check',
  PACKED = 'packed',
  SHIPPED = 'shipped',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  RECEIVED = 'received',
  UNDER_REVIEW = 'under_review',
  TESTED = 'tested',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled'
}

export enum SamplePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface ITimelineEvent {
  stage: SampleWorkflowStage;
  timestamp: Date;
  performedBy: Types.ObjectId;
  performedByName: string;
  notes?: string;
  location?: string;
  attachments?: string[];
  metadata?: Record<string, any>;
}

export interface IAIInsights {
  qualityScore?: number;
  predictedDeliveryDate?: Date;
  riskAssessment?: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
  };
  recommendations?: string[];
  analysisTimestamp?: Date;
}

export interface IQualityMetrics {
  appearance?: number;
  texture?: number;
  aroma?: number;
  taste?: number;
  packaging?: number;
  overallScore?: number;
  comments?: string;
  images?: string[];
}

export interface ISample extends Document {
  sampleId: string;
  product: Types.ObjectId;
  productName: string;
  supplier: Types.ObjectId;
  supplierName: string;
  buyer: Types.ObjectId;
  buyerName: string;
  requestedBy: Types.ObjectId;
  requestedByName: string;
  
  // Workflow
  currentStage: SampleWorkflowStage;
  priority: SamplePriority;
  timeline: ITimelineEvent[];
  
  // Sample Details
  quantity: number;
  unit: string;
  batchNumber?: string;
  productionDate?: Date;
  expiryDate?: Date;
  
  // Tracking
  trackingNumber?: string;
  carrier?: string;
  estimatedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  
  // Quality & Testing
  qualityMetrics?: IQualityMetrics;
  labTestResults?: {
    testType: string;
    result: string;
    date: Date;
    laboratory: string;
    certificate?: string;
  }[];
  
  // AI Insights
  aiInsights?: IAIInsights;
  
  // Documents
  documents: {
    type: string;
    name: string;
    url: string;
    uploadedAt: Date;
    uploadedBy: Types.ObjectId;
  }[];
  
  // Additional Info
  specialInstructions?: string;
  internalNotes?: string;
  tags?: string[];
  
  // Compliance
  complianceCertificates?: {
    type: string;
    number: string;
    issueDate: Date;
    expiryDate: Date;
    issuingAuthority: string;
    document?: string;
  }[];
  
  // Timestamps
  requestedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const TimelineEventSchema = new Schema<ITimelineEvent>({
  stage: {
    type: String,
    enum: Object.values(SampleWorkflowStage),
    required: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  performedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  performedByName: {
    type: String,
    required: true
  },
  notes: String,
  location: String,
  attachments: [String],
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  }
}, { _id: false });

const AIInsightsSchema = new Schema<IAIInsights>({
  qualityScore: {
    type: Number,
    min: 0,
    max: 100
  },
  predictedDeliveryDate: Date,
  riskAssessment: {
    level: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    factors: [String]
  },
  recommendations: [String],
  analysisTimestamp: Date
}, { _id: false });

const QualityMetricsSchema = new Schema<IQualityMetrics>({
  appearance: { type: Number, min: 0, max: 10 },
  texture: { type: Number, min: 0, max: 10 },
  aroma: { type: Number, min: 0, max: 10 },
  taste: { type: Number, min: 0, max: 10 },
  packaging: { type: Number, min: 0, max: 10 },
  overallScore: { type: Number, min: 0, max: 10 },
  comments: String,
  images: [String]
}, { _id: false });

const SampleSchema = new Schema<ISample>({
  sampleId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  productName: {
    type: String,
    required: true
  },
  supplier: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  supplierName: {
    type: String,
    required: true
  },
  buyer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  buyerName: {
    type: String,
    required: true
  },
  requestedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestedByName: {
    type: String,
    required: true
  },
  
  currentStage: {
    type: String,
    enum: Object.values(SampleWorkflowStage),
    default: SampleWorkflowStage.REQUESTED,
    required: true,
    index: true
  },
  priority: {
    type: String,
    enum: Object.values(SamplePriority),
    default: SamplePriority.MEDIUM,
    required: true
  },
  timeline: {
    type: [TimelineEventSchema],
    default: []
  },
  
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true
  },
  batchNumber: String,
  productionDate: Date,
  expiryDate: Date,
  
  trackingNumber: {
    type: String,
    index: true
  },
  carrier: String,
  estimatedDeliveryDate: Date,
  actualDeliveryDate: Date,
  
  qualityMetrics: QualityMetricsSchema,
  labTestResults: [{
    testType: { type: String, required: true },
    result: { type: String, required: true },
    date: { type: Date, required: true },
    laboratory: { type: String, required: true },
    certificate: String
  }],
  
  aiInsights: AIInsightsSchema,
  
  documents: [{
    type: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  }],
  
  specialInstructions: String,
  internalNotes: String,
  tags: [String],
  
  complianceCertificates: [{
    type: { type: String, required: true },
    number: { type: String, required: true },
    issueDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    issuingAuthority: { type: String, required: true },
    document: String
  }],
  
  requestedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  completedAt: Date,
  cancelledAt: Date
}, {
  timestamps: true,
  collection: 'samples'
});

// Indexes for performance
SampleSchema.index({ currentStage: 1, createdAt: -1 });
SampleSchema.index({ supplier: 1, currentStage: 1 });
SampleSchema.index({ buyer: 1, currentStage: 1 });
SampleSchema.index({ 'timeline.timestamp': -1 });
SampleSchema.index({ tags: 1 });

// Virtual for age
SampleSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.requestedAt.getTime()) / (1000 * 60 * 60 * 24));
});

// Virtual for isOverdue
SampleSchema.virtual('isOverdue').get(function() {
  if (!this.estimatedDeliveryDate) return false;
  return Date.now() > this.estimatedDeliveryDate.getTime() && 
         this.currentStage !== SampleWorkflowStage.COMPLETED &&
         this.currentStage !== SampleWorkflowStage.CANCELLED;
});

// Methods
SampleSchema.methods.addTimelineEvent = function(event: Partial<ITimelineEvent>) {
  this.timeline.push({
    stage: event.stage || this.currentStage,
    timestamp: event.timestamp || new Date(),
    performedBy: event.performedBy!,
    performedByName: event.performedByName!,
    notes: event.notes,
    location: event.location,
    attachments: event.attachments,
    metadata: event.metadata
  });
  return this.save();
};

SampleSchema.methods.updateStage = async function(
  newStage: SampleWorkflowStage, 
  userId: Types.ObjectId, 
  userName: string, 
  notes?: string
) {
  const previousStage = this.currentStage;
  this.currentStage = newStage;
  
  // Add to timeline
  await this.addTimelineEvent({
    stage: newStage,
    performedBy: userId,
    performedByName: userName,
    notes: notes || `Stage updated from ${previousStage} to ${newStage}`,
    metadata: { previousStage }
  });
  
  // Update completion/cancellation dates
  if (newStage === SampleWorkflowStage.COMPLETED) {
    this.completedAt = new Date();
  } else if (newStage === SampleWorkflowStage.CANCELLED) {
    this.cancelledAt = new Date();
  }
  
  return this.save();
};

// Pre-save middleware
SampleSchema.pre('save', function(next) {
  // Generate sampleId if not present
  if (!this.sampleId && this.isNew) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 5).toUpperCase();
    this.sampleId = `SMP-${year}${month}-${random}`;
  }
  
  // Add initial timeline event if new
  if (this.isNew && this.timeline.length === 0) {
    this.timeline.push({
      stage: SampleWorkflowStage.REQUESTED,
      timestamp: new Date(),
      performedBy: this.requestedBy,
      performedByName: this.requestedByName,
      notes: 'Sample request created'
    } as ITimelineEvent);
  }
  
  next();
});

// Static methods
SampleSchema.statics.findByStage = function(stage: SampleWorkflowStage) {
  return this.find({ currentStage: stage }).sort('-createdAt');
};

SampleSchema.statics.findOverdue = function() {
  return this.find({
    estimatedDeliveryDate: { $lt: new Date() },
    currentStage: { 
      $nin: [SampleWorkflowStage.COMPLETED, SampleWorkflowStage.CANCELLED] 
    }
  });
};

export const Sample = model<ISample>('Sample', SampleSchema);