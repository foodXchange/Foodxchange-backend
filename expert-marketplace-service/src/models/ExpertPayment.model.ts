import { Schema, model } from 'mongoose';
import { IExpertPayment } from '../interfaces/expert.interface';

const bankDetailsSchema = new Schema({
  accountNumber: { type: String, required: true },
  routingNumber: { type: String, required: true },
  bankName: { type: String, required: true }
}, { _id: false });

const expertPaymentSchema = new Schema<IExpertPayment>({
  expertId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertProfile',
    required: true,
    index: true
  },
  collaborationId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertCollaboration',
    required: true,
    index: true
  },
  clientId: {
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
    default: 'USD'
  },
  platformFee: {
    type: Number,
    required: true,
    min: 0
  },
  netAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending',
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'bank_transfer', 'paypal'],
    required: true
  },
  stripePaymentIntentId: {
    type: String,
    index: true,
    sparse: true
  },
  stripeTransferId: {
    type: String,
    index: true,
    sparse: true
  },
  bankDetails: bankDetailsSchema,
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  invoiceUrl: {
    type: String
  },
  dueDate: {
    type: Date,
    required: true,
    index: true
  },
  paidAt: {
    type: Date,
    index: true
  },
  failureReason: {
    type: String,
    maxlength: 500
  },
  refundAmount: {
    type: Number,
    min: 0
  },
  refundReason: {
    type: String,
    maxlength: 500
  },
  refundedAt: {
    type: Date
  },
  metadata: {
    type: Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
expertPaymentSchema.index({ status: 1, dueDate: 1 });
expertPaymentSchema.index({ expertId: 1, status: 1 });
expertPaymentSchema.index({ paidAt: -1 });
expertPaymentSchema.index({ createdAt: -1 });

// Virtual for is overdue
expertPaymentSchema.virtual('isOverdue').get(function() {
  return this.status === 'pending' && this.dueDate < new Date();
});

// Virtual for days overdue
expertPaymentSchema.virtual('daysOverdue').get(function() {
  if (!this.isOverdue) return 0;
  const diffTime = Math.abs(new Date().getTime() - this.dueDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for payment processing time
expertPaymentSchema.virtual('processingTime').get(function() {
  if (!this.paidAt || !this.createdAt) return null;
  const diffTime = this.paidAt.getTime() - this.createdAt.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // in days
});

// Pre-save middleware
expertPaymentSchema.pre('save', function(next) {
  // Calculate net amount
  if (this.isModified('amount') || this.isModified('platformFee')) {
    this.netAmount = this.amount - this.platformFee;
  }

  // Validate net amount
  if (this.netAmount < 0) {
    next(new Error('Net amount cannot be negative'));
    return;
  }

  // Set paid date when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.paidAt) {
    this.paidAt = new Date();
  }

  // Set refunded date when status changes to refunded
  if (this.isModified('status') && this.status === 'refunded' && !this.refundedAt) {
    this.refundedAt = new Date();
  }

  next();
});

// Method to process payment
expertPaymentSchema.methods.processPayment = async function() {
  this.status = 'processing';
  await this.save();
};

// Method to mark as completed
expertPaymentSchema.methods.markAsCompleted = async function(
  transactionId?: string,
  invoiceUrl?: string
) {
  this.status = 'completed';
  this.paidAt = new Date();
  
  if (transactionId) {
    if (this.paymentMethod === 'stripe') {
      this.stripeTransferId = transactionId;
    }
  }
  
  if (invoiceUrl) {
    this.invoiceUrl = invoiceUrl;
  }
  
  await this.save();
};

// Method to mark as failed
expertPaymentSchema.methods.markAsFailed = async function(reason: string) {
  this.status = 'failed';
  this.failureReason = reason;
  await this.save();
};

// Method to process refund
expertPaymentSchema.methods.processRefund = async function(
  amount: number,
  reason: string
) {
  if (amount > this.netAmount) {
    throw new Error('Refund amount cannot exceed net amount');
  }

  this.status = 'refunded';
  this.refundAmount = amount;
  this.refundReason = reason;
  this.refundedAt = new Date();
  
  await this.save();
};

// Static method to generate invoice number
expertPaymentSchema.statics.generateInvoiceNumber = async function(): Promise<string> {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  // Find the last invoice number for this month
  const lastInvoice = await this.findOne({
    invoiceNumber: new RegExp(`^INV-${year}${month}-`)
  }).sort({ invoiceNumber: -1 });

  let sequence = 1;
  if (lastInvoice) {
    const parts = lastInvoice.invoiceNumber.split('-');
    sequence = parseInt(parts[2]) + 1;
  }

  return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

// Static method to calculate platform earnings
expertPaymentSchema.statics.calculatePlatformEarnings = async function(
  startDate: Date,
  endDate: Date
) {
  const result = await this.aggregate([
    {
      $match: {
        status: 'completed',
        paidAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalPlatformFees: { $sum: '$platformFee' },
        totalNetPayouts: { $sum: '$netAmount' },
        paymentCount: { $sum: 1 }
      }
    }
  ]);

  return result[0] || {
    totalRevenue: 0,
    totalPlatformFees: 0,
    totalNetPayouts: 0,
    paymentCount: 0
  };
};

// Static method to get expert earnings summary
expertPaymentSchema.statics.getExpertEarnings = async function(
  expertId: string,
  startDate?: Date,
  endDate?: Date
) {
  const match: any = {
    expertId,
    status: 'completed'
  };

  if (startDate && endDate) {
    match.paidAt = { $gte: startDate, $lte: endDate };
  }

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$netAmount' },
        totalPlatformFees: { $sum: '$platformFee' },
        paymentCount: { $sum: 1 },
        avgPaymentAmount: { $avg: '$netAmount' }
      }
    }
  ]);

  return result[0] || {
    totalEarnings: 0,
    totalPlatformFees: 0,
    paymentCount: 0,
    avgPaymentAmount: 0
  };
};

export const ExpertPayment = model<IExpertPayment>('ExpertPayment', expertPaymentSchema);