import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  action: string;
  category: 'auth' | 'data' | 'system' | 'security' | 'compliance' | 'financial' | 'api';
  severity: 'info' | 'warning' | 'error' | 'critical';
  userId?: mongoose.Types.ObjectId;
  userEmail?: string;
  userRole?: string;
  companyId?: mongoose.Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;
  resource: {
    type: string;
    id?: string;
    name?: string;
    collection?: string;
  };
  changes?: {
    before?: any;
    after?: any;
    fields?: string[];
    diff?: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
  };
  result: 'success' | 'failure' | 'partial';
  errorDetails?: {
    code?: string;
    message?: string;
    stack?: string;
    details?: any;
  };
  metadata?: {
    requestId?: string;
    sessionId?: string;
    apiKey?: string;
    method?: string;
    path?: string;
    query?: any;
    body?: any;
    headers?: any;
    responseStatus?: number;
    responseTime?: number;
    version?: string;
    environment?: string;
    service?: string;
    custom?: Record<string, any>;
  };
  correlationId?: string;
  parentId?: string;
  duration?: number;
  archived?: boolean;
  retentionDate?: Date;
  tags?: string[];
  compliance?: {
    regulations?: string[];
    dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
    personalData?: boolean;
    financialData?: boolean;
    healthData?: boolean;
  };
  location?: {
    country?: string;
    region?: string;
    city?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  device?: {
    type?: string;
    os?: string;
    browser?: string;
    version?: string;
  };
  risk?: {
    score?: number;
    level?: 'low' | 'medium' | 'high' | 'critical';
    factors?: string[];
  };
  timestamp: Date;

  // Methods
  calculateRiskScore(): number;
}

const AuditLogSchema = new Schema<IAuditLog>({
  action: {
    type: String,
    required: true,
    index: true,
    maxlength: 200
  },
  category: {
    type: String,
    required: true,
    enum: ['auth', 'data', 'system', 'security', 'compliance', 'financial', 'api'],
    index: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['info', 'warning', 'error', 'critical'],
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  userEmail: {
    type: String,
    index: true
  },
  userRole: String,
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    index: true
  },
  ipAddress: {
    type: String,
    index: true
  },
  userAgent: String,
  resource: {
    type: {
      type: String,
      required: true,
      index: true
    },
    id: {
      type: String,
      index: true
    },
    name: String,
    collection: String
  },
  changes: {
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    fields: [String],
    diff: [{
      field: String,
      oldValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed
    }]
  },
  result: {
    type: String,
    required: true,
    enum: ['success', 'failure', 'partial'],
    index: true
  },
  errorDetails: {
    code: String,
    message: String,
    stack: String,
    details: Schema.Types.Mixed
  },
  metadata: {
    requestId: String,
    sessionId: String,
    apiKey: String,
    method: String,
    path: String,
    query: Schema.Types.Mixed,
    body: Schema.Types.Mixed,
    headers: Schema.Types.Mixed,
    responseStatus: Number,
    responseTime: Number,
    version: String,
    environment: String,
    service: String,
    custom: Schema.Types.Mixed
  },
  correlationId: {
    type: String,
    index: true
  },
  parentId: String,
  duration: Number,
  archived: {
    type: Boolean,
    default: false,
    index: true
  },
  retentionDate: {
    type: Date,
    index: true
  },
  tags: {
    type: [String],
    index: true
  },
  compliance: {
    regulations: [String],
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted']
    },
    personalData: Boolean,
    financialData: Boolean,
    healthData: Boolean
  },
  location: {
    country: String,
    region: String,
    city: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  device: {
    type: String,
    os: String,
    browser: String,
    version: String
  },
  risk: {
    score: {
      type: Number,
      min: 0,
      max: 100
    },
    level: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    factors: [String]
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ category: 1, timestamp: -1 });
AuditLogSchema.index({ severity: 1, timestamp: -1 });
AuditLogSchema.index({ 'resource.type': 1, 'resource.id': 1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ companyId: 1, timestamp: -1 });
AuditLogSchema.index({ result: 1, timestamp: -1 });
AuditLogSchema.index({ 'compliance.regulations': 1 });
AuditLogSchema.index({ 'risk.level': 1 });

// Compound indexes for common queries
AuditLogSchema.index({ category: 1, severity: 1, timestamp: -1 });
AuditLogSchema.index({ userId: 1, action: 1, timestamp: -1 });
AuditLogSchema.index({ companyId: 1, category: 1, timestamp: -1 });

// Text index for searching
AuditLogSchema.index({
  action: 'text',
  'resource.name': 'text',
  'errorDetails.message': 'text',
  tags: 'text'
});

// TTL index for automatic deletion based on retention date
AuditLogSchema.index({ retentionDate: 1 }, { expireAfterSeconds: 0 });

// Virtual properties
AuditLogSchema.virtual('isHighRisk').get(function() {
  return this.risk?.level === 'high' || this.risk?.level === 'critical';
});

AuditLogSchema.virtual('isCompliance').get(function() {
  return this.category === 'compliance' ||
         (this.compliance?.regulations && this.compliance.regulations.length > 0);
});

AuditLogSchema.virtual('hasPersonalData').get(function() {
  return this.compliance?.personalData ||
         this.compliance?.healthData ||
         this.compliance?.dataClassification === 'confidential' ||
         this.compliance?.dataClassification === 'restricted';
});

// Methods
AuditLogSchema.methods.anonymize = function() {
  this.userId = undefined;
  this.userEmail = 'anonymized@example.com';
  this.ipAddress = '0.0.0.0';
  this.location = undefined;
  this.device = undefined;
  if (this.metadata) {
    delete this.metadata.headers;
    delete this.metadata.body;
    delete this.metadata.query;
  }
  if (this.changes) {
    this.changes.before = undefined;
    this.changes.after = undefined;
  }
  return this.save();
};

AuditLogSchema.methods.archive = function() {
  this.archived = true;
  return this.save();
};

AuditLogSchema.methods.setRetention = function(days: number) {
  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() + days);
  this.retentionDate = retentionDate;
  return this.save();
};

AuditLogSchema.methods.calculateRiskScore = function(): number {
  let score = 0;

  // Severity-based scoring
  switch (this.severity) {
    case 'critical': score += 40; break;
    case 'error': score += 30; break;
    case 'warning': score += 20; break;
    case 'info': score += 10; break;
  }

  // Result-based scoring
  if (this.result === 'failure') score += 20;
  else if (this.result === 'partial') score += 10;

  // Category-based scoring
  if (this.category === 'security') score += 20;
  else if (this.category === 'financial') score += 15;
  else if (this.category === 'compliance') score += 15;

  // Compliance-based scoring
  if (this.compliance?.personalData) score += 10;
  if (this.compliance?.financialData) score += 10;
  if (this.compliance?.healthData) score += 15;

  return Math.min(100, score);
};

// Statics
AuditLogSchema.statics.findByUser = function(userId: string, options?: any) {
  return this.find({ userId }).sort({ timestamp: -1 }).limit(options?.limit || 100);
};

AuditLogSchema.statics.findByCompany = function(companyId: string, options?: any) {
  return this.find({ companyId }).sort({ timestamp: -1 }).limit(options?.limit || 100);
};

AuditLogSchema.statics.findCriticalEvents = function(since?: Date) {
  const query: any = { severity: 'critical' };
  if (since) query.timestamp = { $gte: since };
  return this.find(query).sort({ timestamp: -1 });
};

AuditLogSchema.statics.findSecurityEvents = function(since?: Date) {
  const query: any = { category: 'security' };
  if (since) query.timestamp = { $gte: since };
  return this.find(query).sort({ timestamp: -1 });
};

AuditLogSchema.statics.findComplianceEvents = function(regulations?: string[]) {
  const query: any = { category: 'compliance' };
  if (regulations) query['compliance.regulations'] = { $in: regulations };
  return this.find(query).sort({ timestamp: -1 });
};

AuditLogSchema.statics.getStatsByCategory = async function(dateRange?: { start: Date; end: Date }) {
  const match: any = {};
  if (dateRange) {
    match.timestamp = { $gte: dateRange.start, $lte: dateRange.end };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        criticalCount: {
          $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
        },
        failureCount: {
          $sum: { $cond: [{ $eq: ['$result', 'failure'] }, 1, 0] }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Pre-save middleware
AuditLogSchema.pre('save', function(next) {
  // Calculate risk score if not set
  if (!this.risk?.score && this.isNew) {
    this.risk = {
      score: this.calculateRiskScore(),
      level: 'low'
    };

    if (this.risk.score >= 75) this.risk.level = 'critical';
    else if (this.risk.score >= 50) this.risk.level = 'high';
    else if (this.risk.score >= 25) this.risk.level = 'medium';
  }

  // Set retention date if not set
  if (!this.retentionDate) {
    const retentionDays = this.category === 'compliance' ? 2555 : // 7 years
      this.category === 'financial' ? 2555 :
        this.category === 'security' ? 365 :
          90; // Default 90 days

    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + retentionDays);
    this.retentionDate = retentionDate;
  }

  next();
});

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
