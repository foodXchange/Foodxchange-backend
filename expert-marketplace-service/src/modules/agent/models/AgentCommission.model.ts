import { Schema, model } from 'mongoose';
import { IAgentCommission, CommissionStatus, CommissionType } from '../interfaces/agent.interface';

const agentCommissionSchema = new Schema<IAgentCommission>({
  commissionId: {
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
  leadId: {
    type: Schema.Types.ObjectId,
    ref: 'Lead'
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order'
  },
  rfqId: {
    type: Schema.Types.ObjectId,
    ref: 'RFQ'
  },
  type: {
    type: String,
    enum: Object.values(CommissionType),
    required: true,
    index: true
  },
  baseAmount: {
    type: Number,
    required: true,
    min: 0
  },
  commissionRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  commissionAmount: {
    type: Number,
    required: true,
    min: 0
  },
  bonusAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  status: {
    type: String,
    enum: Object.values(CommissionStatus),
    default: CommissionStatus.PENDING,
    required: true,
    index: true
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  paidAt: {
    type: Date,
    index: true
  },
  transactionValue: {
    type: Number,
    required: true,
    min: 0
  },
  transactionDate: {
    type: Date,
    required: true,
    index: true
  },
  tierMultiplier: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 1
  },
  performanceBonus: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'digital_wallet', 'check']
  },
  paymentReference: {
    type: String
  },
  paymentNotes: {
    type: String,
    maxlength: 1000
  },
  disputeReason: {
    type: String,
    maxlength: 1000
  },
  disputeDate: {
    type: Date
  },
  disputeResolution: {
    type: String,
    maxlength: 1000
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
agentCommissionSchema.index({ agentId: 1, status: 1 });
agentCommissionSchema.index({ status: 1, paidAt: -1 });
agentCommissionSchema.index({ transactionDate: -1 });
agentCommissionSchema.index({ type: 1, createdAt: -1 });
agentCommissionSchema.index({ agentId: 1, type: 1, transactionDate: -1 });

// Virtual for is overdue
agentCommissionSchema.virtual('isOverdue').get(function() {
  if (this.status !== CommissionStatus.APPROVED) return false;
  
  // Consider approved commissions overdue after 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  return this.approvedAt && this.approvedAt < thirtyDaysAgo && !this.paidAt;
});

// Virtual for days pending payment
agentCommissionSchema.virtual('daysPendingPayment').get(function() {
  if (this.status !== CommissionStatus.APPROVED || this.paidAt) return 0;
  
  const referenceDate = this.approvedAt || this.createdAt;
  const diffTime = Math.abs(new Date().getTime() - referenceDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for effective rate (including bonuses and multipliers)
agentCommissionSchema.virtual('effectiveRate').get(function() {
  if (this.transactionValue === 0) return 0;
  return (this.totalAmount / this.transactionValue) * 100;
});

// Pre-save middleware
agentCommissionSchema.pre('save', function(next) {
  // Generate commission ID if not exists
  if (!this.commissionId) {
    const agentCode = this.agentId.toString().slice(-4);
    const timestamp = Date.now().toString().slice(-8);
    const typeCode = this.type.substring(0, 2).toUpperCase();
    this.commissionId = `CM${typeCode}${agentCode}${timestamp}`;
  }

  // Calculate total amount
  this.totalAmount = this.commissionAmount + (this.bonusAmount || 0) + (this.performanceBonus || 0);

  // Set paid date when status changes to paid
  if (this.isModified('status') && this.status === CommissionStatus.PAID && !this.paidAt) {
    this.paidAt = new Date();
  }

  // Set approved date when status changes to approved
  if (this.isModified('status') && this.status === CommissionStatus.APPROVED && !this.approvedAt) {
    this.approvedAt = new Date();
  }

  next();
});

// Method to approve commission
agentCommissionSchema.methods.approve = async function(approvedBy: string, notes?: string) {
  this.status = CommissionStatus.APPROVED;
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  
  if (notes) {
    this.paymentNotes = notes;
  }

  await this.save();
  
  // TODO: Trigger notification to agent
  console.log(`Commission ${this.commissionId} approved for agent ${this.agentId}`);
};

// Method to mark as paid
agentCommissionSchema.methods.markAsPaid = async function(
  paymentMethod: 'bank_transfer' | 'digital_wallet' | 'check',
  paymentReference: string,
  notes?: string
) {
  this.status = CommissionStatus.PAID;
  this.paidAt = new Date();
  this.paymentMethod = paymentMethod;
  this.paymentReference = paymentReference;
  
  if (notes) {
    this.paymentNotes = notes;
  }

  await this.save();
  
  // TODO: Trigger payment notification to agent
  console.log(`Commission ${this.commissionId} paid to agent ${this.agentId}`);
};

// Method to dispute commission
agentCommissionSchema.methods.dispute = async function(reason: string) {
  this.status = CommissionStatus.DISPUTED;
  this.disputeReason = reason;
  this.disputeDate = new Date();

  await this.save();
  
  // TODO: Trigger dispute notification to management
  console.log(`Commission ${this.commissionId} disputed: ${reason}`);
};

// Method to resolve dispute
agentCommissionSchema.methods.resolveDispute = async function(
  resolution: string,
  newStatus: CommissionStatus = CommissionStatus.APPROVED
) {
  this.disputeResolution = resolution;
  this.status = newStatus;

  await this.save();
  
  console.log(`Commission ${this.commissionId} dispute resolved: ${resolution}`);
};

// Static method to calculate commission
agentCommissionSchema.statics.calculateCommission = function(
  transactionValue: number,
  baseRate: number,
  tierMultiplier: number = 1,
  bonusAmount: number = 0
) {
  const commissionAmount = (transactionValue * baseRate) / 100;
  const adjustedCommission = commissionAmount * tierMultiplier;
  const totalAmount = adjustedCommission + bonusAmount;

  return {
    baseAmount: transactionValue,
    commissionRate: baseRate,
    commissionAmount: adjustedCommission,
    bonusAmount,
    totalAmount,
    tierMultiplier,
    effectiveRate: (totalAmount / transactionValue) * 100
  };
};

// Static method to get agent commission summary
agentCommissionSchema.statics.getAgentCommissionSummary = async function(
  agentId: string,
  startDate?: Date,
  endDate?: Date
) {
  const matchQuery: any = { agentId };
  
  if (startDate && endDate) {
    matchQuery.transactionDate = { $gte: startDate, $lte: endDate };
  }

  const pipeline = [
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        avgAmount: { $avg: '$totalAmount' },
        avgRate: { $avg: '$commissionRate' }
      }
    }
  ];

  const statusSummary = await this.aggregate(pipeline);
  
  // Get total summary
  const totalPipeline = [
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalCommissions: { $sum: 1 },
        totalEarnings: { $sum: '$totalAmount' },
        pendingAmount: {
          $sum: {
            $cond: [
              { $eq: ['$status', CommissionStatus.PENDING] },
              '$totalAmount',
              0
            ]
          }
        },
        approvedAmount: {
          $sum: {
            $cond: [
              { $eq: ['$status', CommissionStatus.APPROVED] },
              '$totalAmount',
              0
            ]
          }
        },
        paidAmount: {
          $sum: {
            $cond: [
              { $eq: ['$status', CommissionStatus.PAID] },
              '$totalAmount',
              0
            ]
          }
        },
        avgTransactionValue: { $avg: '$transactionValue' },
        avgCommissionRate: { $avg: '$commissionRate' }
      }
    }
  ];

  const totalSummary = await this.aggregate(totalPipeline);

  return {
    byStatus: statusSummary.reduce((acc, item) => {
      acc[item._id] = {
        count: item.count,
        totalAmount: item.totalAmount,
        avgAmount: item.avgAmount,
        avgRate: item.avgRate
      };
      return acc;
    }, {} as Record<string, any>),
    total: totalSummary[0] || {
      totalCommissions: 0,
      totalEarnings: 0,
      pendingAmount: 0,
      approvedAmount: 0,
      paidAmount: 0,
      avgTransactionValue: 0,
      avgCommissionRate: 0
    }
  };
};

// Static method to get overdue commissions
agentCommissionSchema.statics.getOverdueCommissions = function(daysOverdue: number = 30) {
  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - daysOverdue);

  return this.find({
    status: CommissionStatus.APPROVED,
    approvedAt: { $lte: overdueDate },
    paidAt: { $exists: false }
  }).populate('agentId', 'firstName lastName agentCode email');
};

// Static method to process pending commissions
agentCommissionSchema.statics.processPendingCommissions = async function() {
  const pendingCommissions = await this.find({
    status: CommissionStatus.PENDING
  }).populate('leadId orderId rfqId');

  for (const commission of pendingCommissions) {
    // Auto-approve commissions under certain threshold
    if (commission.totalAmount <= 1000) { // $1000 threshold
      await commission.approve('system', 'Auto-approved: under threshold');
    }
  }

  return pendingCommissions.length;
};

export const AgentCommission = model<IAgentCommission>('AgentCommission', agentCommissionSchema);