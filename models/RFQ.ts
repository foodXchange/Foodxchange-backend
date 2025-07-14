import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IRFQ extends Document {
  title: string;
  description?: string;
  productType?: string;
  specifications?: Map<string, any>;
  quantity: number;
  unit?: string;
  budget?: number;
  deliveryDate?: Date;
  status: 'draft' | 'active' | 'closed' | 'awarded';
  buyerId: mongoose.Types.ObjectId;
  supplierId?: mongoose.Types.ObjectId;
  createdAt: Date;
  // Compliance fields
  complianceStatus: 'pending' | 'validating' | 'approved' | 'rejected' | 'needs_review';
  complianceScore?: number;
  lastValidated?: Date;
  complianceErrors: string[];
  complianceWarnings: string[];
  requiredCertifications: string[];
  marketCompliance: {
    US: boolean;
    EU: boolean;
    UK: boolean;
  };
}

const rfqSchema = new Schema<IRFQ>({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  productType: {
    type: String,
    trim: true
  },
  specifications: {
    type: Map,
    of: Schema.Types.Mixed
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    trim: true
  },
  budget: {
    type: Number,
    min: 0
  },
  deliveryDate: Date,
  status: {
    type: String,
    enum: ['draft', 'active', 'closed', 'awarded'],
    default: 'draft'
  },
  buyerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supplierId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Compliance fields
  complianceStatus: {
    type: String,
    enum: ['pending', 'validating', 'approved', 'rejected', 'needs_review'],
    default: 'pending'
  },
  complianceScore: {
    type: Number,
    min: 0,
    max: 100
  },
  lastValidated: Date,
  complianceErrors: {
    type: [String],
    default: []
  },
  complianceWarnings: {
    type: [String],
    default: []
  },
  requiredCertifications: {
    type: [String],
    default: []
  },
  marketCompliance: {
    US: { type: Boolean, default: false },
    EU: { type: Boolean, default: false },
    UK: { type: Boolean, default: false }
  }
});

// TypeScript pre-save hook with proper typing
rfqSchema.pre<IRFQ>('save', function(next) {
  if (this.productType === 'cornflakes' && this.specifications?.get('color')) {
    const color = this.specifications.get('color').toLowerCase();
    const rejectedColors = ['dark_brown', 'black', 'purple', 'green', 'blue'];
    
    if (rejectedColors.includes(color)) {
      const err = new Error(`Color "${this.specifications.get('color')}" is invalid for cornflakes. This caused a 9-month project failure.`);
      err.name = 'ValidationError';
      return next(err);
    }
  }
  next();
});

// Model methods
rfqSchema.methods.validateCompliance = async function(): Promise<void> {
  this.lastValidated = new Date();
  await this.save();
};

rfqSchema.methods.updateComplianceScore = async function(score: number): Promise<void> {
  this.complianceScore = score;
  this.complianceStatus = score >= 80 ? 'approved' : 'rejected';
  await this.save();
};

// Static methods
rfqSchema.statics.findByComplianceStatus = function(status: string) {
  return this.find({ complianceStatus: status });
};

rfqSchema.statics.findFailedCompliance = function() {
  return this.find({ 
    $or: [
      { complianceStatus: 'rejected' },
      { complianceScore: { $lt: 80 } }
    ]
  });
};

const RFQ: Model<IRFQ> = mongoose.model<IRFQ>('RFQ', rfqSchema);

export default RFQ;