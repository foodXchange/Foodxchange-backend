/**
 * Marketplace Proposal Model
 * Represents RFQ proposals/bids in the marketplace
 */

import { Schema, model, Document } from 'mongoose';

export interface IMarketplaceProposal extends Document {
  rfqId: Schema.Types.ObjectId;
  sellerId: Schema.Types.ObjectId;
  proposalNumber: string;
  items: Array<{
    rfqItemId: string;
    productName: string;
    category: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    productId?: Schema.Types.ObjectId;
    specifications?: Record<string, any>;
    notes?: string;
    availability: 'in-stock' | 'to-order' | 'seasonal';
    leadTime: number; // in days
  }>;
  pricing: {
    subtotal: number;
    tax: number;
    taxRate: number;
    shipping: number;
    discount: number;
    total: number;
    currency: string;
  };
  terms: {
    paymentTerms: string;
    shippingTerms: string;
    deliveryTime: string;
    warranty?: string;
    returnPolicy?: string;
    priceValidUntil: Date;
    minimumOrder?: {
      quantity: number;
      unit: string;
    };
  };
  delivery: {
    estimatedDate: Date;
    method: string;
    carrier?: string;
    cost: number;
    freeShippingThreshold?: number;
    deliveryOptions: Array<{
      method: string;
      cost: number;
      estimatedDays: number;
      description?: string;
    }>;
  };
  compliance: {
    certifications: Array<{
      type: string;
      name: string;
      issuingBody: string;
      certificateNumber: string;
      expiryDate: Date;
      documentUrl?: string;
      verified: boolean;
    }>;
    qualityStandards: string[];
    haccpCompliant: boolean;
    organicCertified: boolean;
    kosherCertified: boolean;
    halalCertified: boolean;
  };
  attachments: Array<{
    name: string;
    type: 'specification' | 'certificate' | 'sample_image' | 'brochure' | 'other';
    url: string;
    uploadedAt: Date;
    size: number;
    mimeType: string;
  }>;
  status: 'draft' | 'submitted' | 'under_review' | 'clarification_requested' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
  timeline: {
    created: Date;
    submitted?: Date;
    reviewed?: Date;
    accepted?: Date;
    rejected?: Date;
    withdrawn?: Date;
    expired?: Date;
  };
  evaluation: {
    score?: number;
    criteria: Array<{
      name: string;
      weight: number;
      score: number;
      notes?: string;
    }>;
    buyerNotes?: string;
    strengths: string[];
    weaknesses: string[];
    recommendation?: 'accept' | 'reject' | 'negotiate';
  };
  negotiations: Array<{
    fromUserId: Schema.Types.ObjectId;
    message: string;
    proposedChanges?: {
      pricing?: {
        items?: Array<{
          itemId: string;
          newPrice: number;
        }>;
        total?: number;
      };
      terms?: {
        paymentTerms?: string;
        deliveryTime?: string;
      };
      specifications?: Record<string, any>;
    };
    timestamp: Date;
    status: 'pending' | 'accepted' | 'rejected';
  }>;
  analytics: {
    viewCount: number;
    viewDuration: number;
    downloadCount: number;
    responseTime: number; // minutes from RFQ publication
    competitivePosition: 'highest' | 'competitive' | 'lowest';
    winProbability?: number;
  };
  notifications: {
    emailSent: boolean;
    smsSent: boolean;
    pushSent: boolean;
    remindersSent: number;
  };
  validUntil: Date;
  notes: string;
  internalNotes: string;
  tenantId?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const marketplaceProposalSchema = new Schema<IMarketplaceProposal>({
  rfqId: {
    type: Schema.Types.ObjectId,
    ref: 'RFQ',
    required: true
  },
  sellerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  proposalNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  items: [{
    rfqItemId: { type: String, required: true },
    productName: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, required: true, trim: true },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    },
    specifications: { type: Schema.Types.Mixed },
    notes: { type: String, trim: true },
    availability: {
      type: String,
      enum: ['in-stock', 'to-order', 'seasonal'],
      default: 'in-stock'
    },
    leadTime: { type: Number, required: true, min: 0 }
  }],
  pricing: {
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0, max: 1 },
    shipping: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, length: 3, uppercase: true }
  },
  terms: {
    paymentTerms: { type: String, required: true, trim: true },
    shippingTerms: { type: String, required: true, trim: true },
    deliveryTime: { type: String, required: true, trim: true },
    warranty: { type: String, trim: true },
    returnPolicy: { type: String, trim: true },
    priceValidUntil: { type: Date, required: true },
    minimumOrder: {
      quantity: { type: Number, min: 1 },
      unit: { type: String, trim: true }
    }
  },
  delivery: {
    estimatedDate: { type: Date, required: true },
    method: { type: String, required: true, trim: true },
    carrier: { type: String, trim: true },
    cost: { type: Number, default: 0, min: 0 },
    freeShippingThreshold: { type: Number, min: 0 },
    deliveryOptions: [{
      method: { type: String, required: true, trim: true },
      cost: { type: Number, required: true, min: 0 },
      estimatedDays: { type: Number, required: true, min: 1 },
      description: { type: String, trim: true }
    }]
  },
  compliance: {
    certifications: [{
      type: { type: String, required: true, trim: true },
      name: { type: String, required: true, trim: true },
      issuingBody: { type: String, required: true, trim: true },
      certificateNumber: { type: String, required: true, trim: true },
      expiryDate: { type: Date, required: true },
      documentUrl: { type: String, trim: true },
      verified: { type: Boolean, default: false }
    }],
    qualityStandards: [{ type: String, trim: true }],
    haccpCompliant: { type: Boolean, default: false },
    organicCertified: { type: Boolean, default: false },
    kosherCertified: { type: Boolean, default: false },
    halalCertified: { type: Boolean, default: false }
  },
  attachments: [{
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['specification', 'certificate', 'sample_image', 'brochure', 'other'],
      required: true
    },
    url: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, default: Date.now },
    size: { type: Number, required: true, min: 0 },
    mimeType: { type: String, required: true, trim: true }
  }],
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'clarification_requested', 'accepted', 'rejected', 'withdrawn', 'expired'],
    default: 'draft'
  },
  timeline: {
    created: { type: Date, default: Date.now },
    submitted: Date,
    reviewed: Date,
    accepted: Date,
    rejected: Date,
    withdrawn: Date,
    expired: Date
  },
  evaluation: {
    score: { type: Number, min: 0, max: 100 },
    criteria: [{
      name: { type: String, required: true, trim: true },
      weight: { type: Number, required: true, min: 0, max: 1 },
      score: { type: Number, required: true, min: 0, max: 10 },
      notes: { type: String, trim: true }
    }],
    buyerNotes: { type: String, trim: true },
    strengths: [{ type: String, trim: true }],
    weaknesses: [{ type: String, trim: true }],
    recommendation: {
      type: String,
      enum: ['accept', 'reject', 'negotiate']
    }
  },
  negotiations: [{
    fromUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: { type: String, required: true, trim: true },
    proposedChanges: {
      pricing: {
        items: [{
          itemId: { type: String, required: true },
          newPrice: { type: Number, required: true, min: 0 }
        }],
        total: { type: Number, min: 0 }
      },
      terms: {
        paymentTerms: { type: String, trim: true },
        deliveryTime: { type: String, trim: true }
      },
      specifications: { type: Schema.Types.Mixed }
    },
    timestamp: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    }
  }],
  analytics: {
    viewCount: { type: Number, default: 0, min: 0 },
    viewDuration: { type: Number, default: 0, min: 0 },
    downloadCount: { type: Number, default: 0, min: 0 },
    responseTime: { type: Number, min: 0 },
    competitivePosition: {
      type: String,
      enum: ['highest', 'competitive', 'lowest']
    },
    winProbability: { type: Number, min: 0, max: 1 }
  },
  notifications: {
    emailSent: { type: Boolean, default: false },
    smsSent: { type: Boolean, default: false },
    pushSent: { type: Boolean, default: false },
    remindersSent: { type: Number, default: 0, min: 0 }
  },
  validUntil: { type: Date, required: true },
  notes: { type: String, trim: true },
  internalNotes: { type: String, trim: true },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant'
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
marketplaceProposalSchema.index({ proposalNumber: 1 }, { unique: true });
marketplaceProposalSchema.index({ rfqId: 1, sellerId: 1 });
marketplaceProposalSchema.index({ sellerId: 1, status: 1 });
marketplaceProposalSchema.index({ status: 1, createdAt: -1 });
marketplaceProposalSchema.index({ validUntil: 1 });
marketplaceProposalSchema.index({ tenantId: 1 });

// Pre-save middleware
marketplaceProposalSchema.pre('save', function(next) {
  // Generate proposal number if not set
  if (!this.proposalNumber) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.proposalNumber = `PROP-${timestamp}-${random}`;
  }

  // Calculate total if not set
  if (this.items && this.items.length > 0) {
    this.pricing.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
    this.pricing.total = this.pricing.subtotal + this.pricing.tax + this.pricing.shipping - this.pricing.discount;
  }

  // Update timeline based on status
  const now = new Date();
  if (this.isModified('status')) {
    switch (this.status) {
      case 'submitted':
        if (!this.timeline.submitted) this.timeline.submitted = now;
        break;
      case 'under_review':
        if (!this.timeline.reviewed) this.timeline.reviewed = now;
        break;
      case 'accepted':
        if (!this.timeline.accepted) this.timeline.accepted = now;
        break;
      case 'rejected':
        if (!this.timeline.rejected) this.timeline.rejected = now;
        break;
      case 'withdrawn':
        if (!this.timeline.withdrawn) this.timeline.withdrawn = now;
        break;
      case 'expired':
        if (!this.timeline.expired) this.timeline.expired = now;
        break;
    }
  }

  next();
});

// Methods
marketplaceProposalSchema.methods.isEditable = function() {
  return ['draft', 'clarification_requested'].includes(this.status);
};

marketplaceProposalSchema.methods.canBeWithdrawn = function() {
  return ['submitted', 'under_review', 'clarification_requested'].includes(this.status);
};

marketplaceProposalSchema.methods.isExpired = function() {
  return new Date() > this.validUntil;
};

marketplaceProposalSchema.methods.addNegotiation = function(fromUserId: any, message: string, proposedChanges?: any) {
  this.negotiations.push({
    fromUserId,
    message,
    proposedChanges,
    timestamp: new Date(),
    status: 'pending'
  });
  return this.save();
};

marketplaceProposalSchema.methods.updateStatus = function(newStatus: string) {
  this.status = newStatus;
  return this.save();
};

// Static methods
marketplaceProposalSchema.statics.findByRFQ = function(rfqId: any, status?: string) {
  const query: any = { rfqId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

marketplaceProposalSchema.statics.findBySeller = function(sellerId: any, status?: string) {
  const query: any = { sellerId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

export const MarketplaceProposal = model<IMarketplaceProposal>('MarketplaceProposal', marketplaceProposalSchema);