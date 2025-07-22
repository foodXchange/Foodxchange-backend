import mongoose from 'mongoose';

const agentCommissionSchema = new mongoose.Schema({
  commissionId: {
    type: String,
    unique: true,
    required: true
  },

  // Agent Reference
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },

  // Commission Type
  type: {
    type: String,
    enum: ['base_commission', 'tier_bonus', 'new_supplier_bonus', 'new_buyer_bonus',
      'first_deal_bonus', 'monthly_target_bonus', 'recurring_commission',
      'performance_bonus', 'referral_bonus', 'seasonal_bonus', 'penalty'],
    required: true
  },

  // Source Transaction
  source: {
    type: {
      type: String,
      enum: ['order', 'deal', 'lead', 'referral', 'milestone', 'adjustment', 'penalty'],
      required: true
    },
    sourceId: mongoose.Schema.Types.ObjectId,
    sourceModel: {
      type: String,
      enum: ['Order', 'AgentLead', 'Agent', 'Company']
    },
    referenceNumber: String,
    description: String
  },

  // Related Entities
  relatedEntities: {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentLead' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    buyerCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    supplierContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    parentCommissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentCommission' }
  },

  // Financial Details
  financial: {
    // Base amounts
    dealValue: {
      amount: { type: Number, required: true },
      currency: { type: String, default: 'USD' }
    },

    // Commission calculation
    commission: {
      rate: { type: Number, required: true, min: 0, max: 100 }, // percentage
      baseAmount: { type: Number, required: true },
      bonusAmount: { type: Number, default: 0 },
      penaltyAmount: { type: Number, default: 0 },
      totalAmount: { type: Number, required: true },
      currency: { type: String, default: 'USD' }
    },

    // Additional charges/deductions
    adjustments: [{
      type: {
        type: String,
        enum: ['bonus', 'penalty', 'adjustment', 'tax', 'fee', 'chargeback']
      },
      amount: Number,
      description: String,
      reason: String,
      appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      appliedAt: Date
    }],

    // Tax information
    tax: {
      taxable: { type: Boolean, default: true },
      taxRate: { type: Number, default: 0 },
      taxAmount: { type: Number, default: 0 },
      taxType: String, // income, sales, etc.
      taxJurisdiction: String
    },

    // Net amount after adjustments
    netAmount: { type: Number, required: true },

    // Exchange rate (if different from base currency)
    exchangeRate: {
      rate: { type: Number, default: 1 },
      baseCurrency: String,
      targetCurrency: String,
      rateDate: Date
    }
  },

  // Calculation Details
  calculation: {
    method: {
      type: String,
      enum: ['percentage', 'fixed_amount', 'tiered', 'hybrid'],
      default: 'percentage'
    },

    // Tier-based calculation
    tier: {
      current: String, // bronze, silver, gold, platinum
      multiplier: { type: Number, default: 1.0 },
      bonusEarned: { type: Number, default: 0 }
    },

    // Performance metrics affecting commission
    performance: {
      responseTime: Number, // minutes
      closeRate: Number, // percentage
      customerSatisfaction: Number, // 1-5 scale
      qualityScore: Number, // 1-100
      performanceMultiplier: { type: Number, default: 1.0 }
    },

    // Recurring commission details
    recurring: {
      isRecurring: { type: Boolean, default: false },
      frequency: String, // monthly, quarterly, annual
      remainingPayments: Number,
      originalAmount: Number,
      nextPaymentDate: Date,
      expiresAt: Date
    },

    // Calculation breakdown
    breakdown: {
      baseCalculation: String,
      bonusCalculation: String,
      adjustmentCalculation: String,
      finalCalculation: String,
      notes: String
    },

    // Approval workflow
    approval: {
      required: { type: Boolean, default: false },
      threshold: Number, // auto-approve below this amount
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
      approvalNotes: String,
      rejectionReason: String
    }
  },

  // Status and Lifecycle
  status: {
    type: String,
    enum: ['calculated', 'pending_approval', 'approved', 'rejected', 'paid', 'disputed', 'cancelled', 'expired'],
    default: 'calculated'
  },

  lifecycle: {
    calculatedAt: { type: Date, default: Date.now },
    approvedAt: Date,
    rejectedAt: Date,
    paidAt: Date,
    cancelledAt: Date,

    // Status history
    statusHistory: [{
      status: String,
      changedAt: { type: Date, default: Date.now },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      notes: String
    }]
  },

  // Payment Processing
  payment: {
    method: {
      type: String,
      enum: ['bank_transfer', 'check', 'paypal', 'stripe', 'wire_transfer', 'cryptocurrency'],
      default: 'bank_transfer'
    },

    // Payment details
    paymentDetails: {
      accountNumber: String,
      routingNumber: String,
      accountName: String,
      bankName: String,
      paypalEmail: String,
      stripePaymentId: String,
      checkNumber: String,
      wireReference: String
    },

    // Processing information
    processing: {
      batchId: String,
      processedAt: Date,
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      transactionId: String,
      confirmationNumber: String,
      processingFee: Number,
      exchangeRate: Number,
      actualAmountPaid: Number
    },

    // Payment schedule
    schedule: {
      scheduledDate: Date,
      dueDate: Date,
      paymentCycle: String, // weekly, bi-weekly, monthly
      paymentWindow: String, // 1-15, 16-31, etc.
      minimumThreshold: Number,
      nextPaymentDate: Date
    },

    // Dispute handling
    dispute: {
      disputed: { type: Boolean, default: false },
      disputeReason: String,
      disputedAt: Date,
      disputedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolution: String,
      resolvedAt: Date,
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  },

  // Period Information
  period: {
    type: {
      type: String,
      enum: ['immediate', 'daily', 'weekly', 'monthly', 'quarterly', 'annual'],
      default: 'monthly'
    },
    startDate: Date,
    endDate: Date,
    dueDate: Date,
    periodNumber: Number, // week number, month number, etc.
    fiscalYear: Number,
    fiscalQuarter: Number
  },

  // Quality and Compliance
  compliance: {
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Compliance checks
    checks: [{
      type: String, // tax_compliance, contract_compliance, etc.
      status: String,
      checkedAt: Date,
      checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      result: String,
      notes: String
    }],

    // Documentation
    documentation: [{
      type: String, // invoice, receipt, contract, etc.
      url: String,
      uploadedAt: Date,
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],

    // Audit trail
    auditTrail: [{
      action: String,
      performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      performedAt: { type: Date, default: Date.now },
      details: String,
      ipAddress: String,
      userAgent: String
    }]
  },

  // Analytics and Reporting
  analytics: {
    // Performance metrics
    metrics: {
      timeToEarn: Number, // days from lead to commission
      leadConversionValue: Number,
      customerLifetimeValue: Number,
      profitMargin: Number,
      competitorAnalysis: String
    },

    // Reporting categories
    reporting: {
      category: String,
      subcategory: String,
      region: String,
      territory: String,
      productLine: String,
      customerSegment: String,
      marketSegment: String
    },

    // Seasonal patterns
    seasonality: {
      season: String,
      monthlyPattern: String,
      weeklyPattern: String,
      holidayImpact: String
    }
  },

  // Notifications
  notifications: {
    sent: [{
      type: String, // calculation, approval, payment, dispute
      recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      sentAt: Date,
      method: String, // email, sms, push, whatsapp
      status: String,
      response: String
    }],

    scheduled: [{
      type: String,
      scheduledFor: Date,
      recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      method: String,
      message: String
    }]
  },

  // Metadata
  metadata: {
    version: { type: Number, default: 1 },
    source: String,
    batchId: String,
    correlationId: String,
    tags: [String],
    notes: String,
    internalNotes: String,

    // System information
    createdBySystem: { type: Boolean, default: true },
    calculationEngine: String,
    calculationVersion: String,
    dataSource: String
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,

  // System fields
  archived: { type: Boolean, default: false },
  archivedAt: Date,
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to generate commission ID
agentCommissionSchema.pre('save', function(next) {
  if (this.isNew && !this.commissionId) {
    const timestamp = Date.now().toString().slice(-6);
    this.commissionId = `COM-${timestamp}`;
  }

  // Calculate net amount
  if (this.financial.commission.totalAmount !== undefined) {
    this.financial.netAmount = this.financial.commission.totalAmount -
                               this.financial.commission.penaltyAmount +
                               this.financial.commission.bonusAmount;
  }

  next();
});

// Virtual for commission age
agentCommissionSchema.virtual('commissionAge').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60 * 60 * 24)); // days
});

// Virtual for payment status
agentCommissionSchema.virtual('paymentStatus').get(function() {
  if (this.status === 'paid') return 'paid';
  if (this.status === 'cancelled') return 'cancelled';
  if (this.payment.dispute.disputed) return 'disputed';
  if (this.status === 'approved' && this.payment.schedule.dueDate) {
    return new Date() > this.payment.schedule.dueDate ? 'overdue' : 'pending';
  }
  return 'pending';
});

// Virtual for effective rate
agentCommissionSchema.virtual('effectiveRate').get(function() {
  if (this.financial.dealValue.amount === 0) return 0;
  return (this.financial.netAmount / this.financial.dealValue.amount) * 100;
});

// Static method to calculate total commissions for agent
agentCommissionSchema.statics.getTotalCommissions = function(agentId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        agentId: new mongoose.Types.ObjectId(agentId),
        status: 'paid',
        'lifecycle.paidAt': {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$financial.netAmount' },
        totalDeals: { $sum: 1 },
        averageCommission: { $avg: '$financial.netAmount' },
        totalDealValue: { $sum: '$financial.dealValue.amount' }
      }
    }
  ]);
};

// Static method to get commission summary by type
agentCommissionSchema.statics.getCommissionSummary = function(agentId, period) {
  return this.aggregate([
    {
      $match: {
        agentId: new mongoose.Types.ObjectId(agentId),
        'period.type': period
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$financial.netAmount' },
        averageAmount: { $avg: '$financial.netAmount' },
        pendingAmount: {
          $sum: {
            $cond: [
              { $in: ['$status', ['calculated', 'pending_approval', 'approved']] },
              '$financial.netAmount',
              0
            ]
          }
        },
        paidAmount: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'paid'] },
              '$financial.netAmount',
              0
            ]
          }
        }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
};

// Indexes for efficient queries
agentCommissionSchema.index({ commissionId: 1 });
agentCommissionSchema.index({ agentId: 1, createdAt: -1 });
agentCommissionSchema.index({ type: 1, agentId: 1 });
agentCommissionSchema.index({ status: 1 });
agentCommissionSchema.index({ 'source.type': 1, 'source.sourceId': 1 });
agentCommissionSchema.index({ 'relatedEntities.leadId': 1 });
agentCommissionSchema.index({ 'relatedEntities.orderId': 1 });
agentCommissionSchema.index({ 'relatedEntities.buyerId': 1 });
agentCommissionSchema.index({ 'relatedEntities.supplierId': 1 });
agentCommissionSchema.index({ 'lifecycle.calculatedAt': 1 });
agentCommissionSchema.index({ 'lifecycle.paidAt': 1 });
agentCommissionSchema.index({ 'payment.schedule.dueDate': 1 });
agentCommissionSchema.index({ 'payment.processing.batchId': 1 });
agentCommissionSchema.index({ 'period.type': 1, 'period.startDate': 1 });
agentCommissionSchema.index({ 'period.fiscalYear': 1, 'period.fiscalQuarter': 1 });

// Compound indexes for reporting
agentCommissionSchema.index({ agentId: 1, type: 1, status: 1 });
agentCommissionSchema.index({ agentId: 1, 'period.type': 1, 'lifecycle.calculatedAt': 1 });
agentCommissionSchema.index({ status: 1, 'payment.schedule.dueDate': 1 });

export default mongoose.model('AgentCommission', agentCommissionSchema);
