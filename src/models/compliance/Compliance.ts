import mongoose from 'mongoose';

const complianceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  certificationType: {
    type: String,
    required: true,
    enum: [
      'FDA', 'HACCP', 'ISO22000', 'ORGANIC', 'KOSHER', 'HALAL',
      'FAIR_TRADE', 'NON_GMO', 'GLUTEN_FREE', 'BRC', 'SQF', 'OTHER'
    ]
  },
  certificationName: {
    type: String,
    required: true
  },
  certificationBody: {
    type: String,
    required: true
  },
  certificateNumber: {
    type: String,
    unique: true,
    required: true
  },
  issueDate: {
    type: Date,
    required: true
  },
  expiryDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'pending_renewal', 'expired', 'suspended', 'revoked'],
    default: 'active'
  },
  documents: [{
    type: {
      type: String,
      enum: ['certificate', 'audit_report', 'corrective_action', 'other']
    },
    name: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  auditHistory: [{
    auditDate: Date,
    auditor: String,
    result: {
      type: String,
      enum: ['passed', 'passed_with_conditions', 'failed']
    },
    findings: String,
    correctiveActions: [{
      issue: String,
      action: String,
      deadline: Date,
      completed: Boolean
    }]
  }],
  scope: {
    products: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    categories: [String],
    facilities: [{
      name: String,
      address: String,
      covered: Boolean
    }]
  },
  complianceScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  alerts: [{
    type: {
      type: String,
      enum: ['expiry_warning', 'audit_due', 'document_missing', 'non_compliance']
    },
    message: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    }
  }],
  renewalProcess: {
    started: Boolean,
    startedAt: Date,
    steps: [{
      name: String,
      completed: Boolean,
      completedAt: Date
    }],
    estimatedCompletionDate: Date
  }
}, {
  timestamps: true
});

// Calculate compliance score
complianceSchema.methods.calculateComplianceScore = function() {
  let score = 100;

  // Deduct for expired certification
  if (this.status === 'expired') score -= 50;
  if (this.status === 'suspended') score -= 30;

  // Deduct for upcoming expiry
  const daysToExpiry = Math.floor((this.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
  if (daysToExpiry < 30) score -= 20;
  else if (daysToExpiry < 60) score -= 10;

  // Deduct for unresolved alerts
  const unresolvedAlerts = this.alerts.filter(a => !a.resolved);
  score -= unresolvedAlerts.length * 5;

  this.complianceScore = Math.max(0, score);
  return this.complianceScore;
};

export default mongoose.model('Compliance', complianceSchema);
