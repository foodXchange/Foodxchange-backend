import mongoose, { Document, Schema } from 'mongoose';

export interface IPayment extends Document {
  orderId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'partially_refunded' | 'disputed';
  paymentMethod: {
    type: 'credit_card' | 'debit_card' | 'bank_transfer' | 'wire_transfer' | 'ach' | 'paypal' | 'stripe' | 'crypto';
    provider?: string;
    last4?: string;
    brand?: string;
    bankName?: string;
    accountType?: string;
    walletAddress?: string;
  };
  transactionId?: string;
  gatewayResponse?: {
    id: string;
    status: string;
    message?: string;
    raw?: any;
  };
  fees: {
    platform: number;
    gateway: number;
    total: number;
  };
  netAmount: number;
  refunds?: Array<{
    amount: number;
    reason: string;
    requestedAt: Date;
    processedAt?: Date;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    transactionId?: string;
  }>;
  dispute?: {
    reason: string;
    amount: number;
    status: 'open' | 'under_review' | 'resolved' | 'lost';
    evidence?: Array<{
      type: string;
      url: string;
      description?: string;
      uploadedAt: Date;
    }>;
    createdAt: Date;
    resolvedAt?: Date;
    outcome?: string;
  };
  metadata?: {
    invoiceNumber?: string;
    purchaseOrder?: string;
    taxId?: string;
    notes?: string;
    customFields?: Record<string, any>;
  };
  billing?: {
    name: string;
    email: string;
    phone?: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
    taxId?: string;
  };
  shipping?: {
    name: string;
    phone?: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
    method?: string;
    trackingNumber?: string;
  };
  timeline: Array<{
    event: string;
    timestamp: Date;
    description?: string;
    metadata?: any;
  }>;
  compliance: {
    amlChecked?: boolean;
    sanctionsChecked?: boolean;
    riskScore?: number;
    kycVerified?: boolean;
    pciCompliant?: boolean;
  };
  retryCount?: number;
  lastRetryAt?: Date;
  scheduledFor?: Date;
  expiresAt?: Date;
  completedAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>({
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  buyerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sellerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR']
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded', 'disputed'],
    default: 'pending',
    index: true
  },
  paymentMethod: {
    type: {
      type: String,
      required: true,
      enum: ['credit_card', 'debit_card', 'bank_transfer', 'wire_transfer', 'ach', 'paypal', 'stripe', 'crypto']
    },
    provider: String,
    last4: String,
    brand: String,
    bankName: String,
    accountType: String,
    walletAddress: String
  },
  transactionId: {
    type: String,
    sparse: true,
    index: true
  },
  gatewayResponse: {
    id: String,
    status: String,
    message: String,
    raw: Schema.Types.Mixed
  },
  fees: {
    platform: {
      type: Number,
      default: 0
    },
    gateway: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      default: 0
    }
  },
  netAmount: {
    type: Number,
    required: true
  },
  refunds: [{
    amount: {
      type: Number,
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    transactionId: String
  }],
  dispute: {
    reason: String,
    amount: Number,
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'lost']
    },
    evidence: [{
      type: String,
      url: String,
      description: String,
      uploadedAt: Date
    }],
    createdAt: Date,
    resolvedAt: Date,
    outcome: String
  },
  metadata: {
    invoiceNumber: String,
    purchaseOrder: String,
    taxId: String,
    notes: String,
    customFields: Schema.Types.Mixed
  },
  billing: {
    name: String,
    email: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    taxId: String
  },
  shipping: {
    name: String,
    phone: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    method: String,
    trackingNumber: String
  },
  timeline: [{
    event: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    description: String,
    metadata: Schema.Types.Mixed
  }],
  compliance: {
    amlChecked: {
      type: Boolean,
      default: false
    },
    sanctionsChecked: {
      type: Boolean,
      default: false
    },
    riskScore: Number,
    kycVerified: {
      type: Boolean,
      default: false
    },
    pciCompliant: {
      type: Boolean,
      default: true
    }
  },
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: Date,
  scheduledFor: Date,
  expiresAt: Date,
  completedAt: Date,
  failureReason: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ buyerId: 1, status: 1 });
PaymentSchema.index({ sellerId: 1, status: 1 });
PaymentSchema.index({ 'paymentMethod.type': 1 });
PaymentSchema.index({ completedAt: -1 });
PaymentSchema.index({ 'dispute.status': 1 }, { sparse: true });

// Virtual for total refunded amount
PaymentSchema.virtual('totalRefunded').get(function() {
  if (!this.refunds || this.refunds.length === 0) return 0;

  return this.refunds
    .filter(refund => refund.status === 'completed')
    .reduce((total, refund) => total + refund.amount, 0);
});

// Virtual for refundable amount
PaymentSchema.virtual('refundableAmount').get(function() {
  if (this.status !== 'completed') return 0;
  return this.amount - this.totalRefunded;
});

// Methods
PaymentSchema.methods.addTimelineEvent = function(event: string, description?: string, metadata?: any) {
  this.timeline.push({
    event,
    timestamp: new Date(),
    description,
    metadata
  });
  return this.save();
};

PaymentSchema.methods.canRefund = function(amount?: number): boolean {
  if (this.status !== 'completed') return false;
  const refundAmount = amount || this.amount;
  return refundAmount <= this.refundableAmount;
};

PaymentSchema.methods.initiateRefund = async function(amount: number, reason: string) {
  if (!this.canRefund(amount)) {
    throw new Error('Cannot refund this amount');
  }

  this.refunds = this.refunds || [];
  this.refunds.push({
    amount,
    reason,
    requestedAt: new Date(),
    status: 'pending'
  });

  await this.addTimelineEvent('refund_initiated', `Refund of ${amount} ${this.currency} requested: ${reason}`);

  return this.save();
};

PaymentSchema.methods.completeRefund = async function(refundIndex: number, transactionId: string) {
  if (!this.refunds?.[refundIndex]) {
    throw new Error('Refund not found');
  }

  this.refunds[refundIndex].status = 'completed';
  this.refunds[refundIndex].processedAt = new Date();
  this.refunds[refundIndex].transactionId = transactionId;

  const {totalRefunded} = this;
  if (totalRefunded >= this.amount) {
    this.status = 'refunded';
  } else {
    this.status = 'partially_refunded';
  }

  await this.addTimelineEvent('refund_completed', `Refund of ${this.refunds[refundIndex].amount} ${this.currency} completed`);

  return this.save();
};

PaymentSchema.methods.calculateFees = function(platformRate = 0.029, flatFee = 0.30) {
  this.fees.gateway = this.amount * platformRate + flatFee;
  this.fees.platform = this.amount * 0.02; // 2% platform fee
  this.fees.total = this.fees.gateway + this.fees.platform;
  this.netAmount = this.amount - this.fees.total;
  return this;
};

// Statics
PaymentSchema.statics.findByOrder = function(orderId: string) {
  return this.findOne({ orderId });
};

PaymentSchema.statics.findPendingPayments = function(olderThan?: Date) {
  const query: any = { status: 'pending' };
  if (olderThan) {
    query.createdAt = { $lt: olderThan };
  }
  return this.find(query).sort({ createdAt: 1 });
};

PaymentSchema.statics.getRevenueStats = async function(startDate: Date, endDate: Date) {
  return this.aggregate([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalFees: { $sum: '$fees.total' },
        netRevenue: { $sum: '$netAmount' },
        transactionCount: { $sum: 1 },
        avgTransactionValue: { $avg: '$amount' }
      }
    }
  ]);
};

PaymentSchema.statics.getPaymentMethodStats = async function() {
  return this.aggregate([
    {
      $match: { status: 'completed' }
    },
    {
      $group: {
        _id: '$paymentMethod.type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
};

// Pre-save middleware
PaymentSchema.pre('save', function(next) {
  // Calculate net amount if not set
  if (this.isModified('amount') || this.isModified('fees')) {
    this.netAmount = this.amount - this.fees.total;
  }

  // Add creation event to timeline
  if (this.isNew) {
    this.timeline = [{
      event: 'payment_created',
      timestamp: new Date(),
      description: `Payment of ${this.amount} ${this.currency} created`
    }];
  }

  next();
});

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
