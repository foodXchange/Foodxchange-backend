/**
 * Marketplace Order Model
 * Represents orders in the marketplace context
 */

import { Schema, model, Document } from 'mongoose';

export interface IMarketplaceOrder extends Document {
  orderNumber: string;
  buyerId: Schema.Types.ObjectId;
  sellerId: Schema.Types.ObjectId;
  rfqId?: Schema.Types.ObjectId;
  proposalId?: Schema.Types.ObjectId;
  items: Array<{
    productId: Schema.Types.ObjectId;
    productName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    specifications?: Record<string, any>;
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
  delivery: {
    address: {
      street: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
      coordinates?: {
        lat: number;
        lng: number;
      };
    };
    requestedDate: Date;
    estimatedDate?: Date;
    actualDate?: Date;
    method: string;
    carrier?: string;
    trackingNumber?: string;
    cost: number;
    instructions?: string;
  };
  payment: {
    method: 'credit_card' | 'bank_transfer' | 'net_terms' | 'cash' | 'check';
    status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'cancelled';
    terms: string;
    dueDate?: Date;
    paidDate?: Date;
    transactionId?: string;
    paymentIntentId?: string;
    refundAmount?: number;
    refundReason?: string;
  };
  status: 'draft' | 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'returned';
  timeline: {
    created: Date;
    confirmed?: Date;
    processing?: Date;
    shipped?: Date;
    delivered?: Date;
    completed?: Date;
    cancelled?: Date;
  };
  communications: Array<{
    from: Schema.Types.ObjectId;
    message: string;
    timestamp: Date;
    type: 'note' | 'status_update' | 'issue' | 'resolution';
  }>;
  documents: Array<{
    name: string;
    type: 'invoice' | 'receipt' | 'shipping_label' | 'packing_list' | 'certificate' | 'other';
    url: string;
    uploadedAt: Date;
    uploadedBy: Schema.Types.ObjectId;
  }>;
  compliance: {
    requiresCertification: boolean;
    certifications?: Array<{
      type: string;
      documentUrl: string;
      verified: boolean;
      verifiedBy?: Schema.Types.ObjectId;
      verifiedAt?: Date;
    }>;
    haccpRequired: boolean;
    temperatureControlRequired: boolean;
    specialHandling?: string;
  };
  quality: {
    inspectionRequired: boolean;
    inspectionDate?: Date;
    inspectionResults?: string;
    sampleRequested: boolean;
    sampleApproved?: boolean;
    qualityIssues?: Array<{
      issue: string;
      reportedBy: Schema.Types.ObjectId;
      reportedAt: Date;
      resolution?: string;
      resolvedAt?: Date;
    }>;
  };
  review: {
    buyerReview?: {
      rating: number;
      comment: string;
      reviewedAt: Date;
    };
    sellerReview?: {
      rating: number;
      comment: string;
      reviewedAt: Date;
    };
  };
  analytics: {
    source: string;
    conversionPath: string[];
    rfqResponseTime?: number;
    orderProcessingTime?: number;
    deliveryTime?: number;
  };
  notes: string;
  internalNotes: string;
  tenantId?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const marketplaceOrderSchema = new Schema<IMarketplaceOrder>({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  buyerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sellerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rfqId: {
    type: Schema.Types.ObjectId,
    ref: 'RFQ'
  },
  proposalId: {
    type: Schema.Types.ObjectId,
    ref: 'Proposal'
  },
  items: [{
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, required: true, trim: true },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    specifications: { type: Schema.Types.Mixed }
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
  delivery: {
    address: {
      street: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true },
      coordinates: {
        lat: { type: Number, min: -90, max: 90 },
        lng: { type: Number, min: -180, max: 180 }
      }
    },
    requestedDate: { type: Date, required: true },
    estimatedDate: Date,
    actualDate: Date,
    method: { type: String, required: true, trim: true },
    carrier: { type: String, trim: true },
    trackingNumber: { type: String, trim: true },
    cost: { type: Number, default: 0, min: 0 },
    instructions: { type: String, trim: true }
  },
  payment: {
    method: {
      type: String,
      enum: ['credit_card', 'bank_transfer', 'net_terms', 'cash', 'check'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled'],
      default: 'pending'
    },
    terms: { type: String, required: true, trim: true },
    dueDate: Date,
    paidDate: Date,
    transactionId: { type: String, trim: true },
    paymentIntentId: { type: String, trim: true },
    refundAmount: { type: Number, min: 0 },
    refundReason: { type: String, trim: true }
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'returned'],
    default: 'draft'
  },
  timeline: {
    created: { type: Date, default: Date.now },
    confirmed: Date,
    processing: Date,
    shipped: Date,
    delivered: Date,
    completed: Date,
    cancelled: Date
  },
  communications: [{
    from: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: ['note', 'status_update', 'issue', 'resolution'],
      default: 'note'
    }
  }],
  documents: [{
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['invoice', 'receipt', 'shipping_label', 'packing_list', 'certificate', 'other'],
      required: true
    },
    url: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  compliance: {
    requiresCertification: { type: Boolean, default: false },
    certifications: [{
      type: { type: String, required: true, trim: true },
      documentUrl: { type: String, required: true, trim: true },
      verified: { type: Boolean, default: false },
      verifiedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      verifiedAt: Date
    }],
    haccpRequired: { type: Boolean, default: false },
    temperatureControlRequired: { type: Boolean, default: false },
    specialHandling: { type: String, trim: true }
  },
  quality: {
    inspectionRequired: { type: Boolean, default: false },
    inspectionDate: Date,
    inspectionResults: { type: String, trim: true },
    sampleRequested: { type: Boolean, default: false },
    sampleApproved: Boolean,
    qualityIssues: [{
      issue: { type: String, required: true, trim: true },
      reportedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      reportedAt: { type: Date, default: Date.now },
      resolution: { type: String, trim: true },
      resolvedAt: Date
    }]
  },
  review: {
    buyerReview: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, trim: true },
      reviewedAt: { type: Date, default: Date.now }
    },
    sellerReview: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, trim: true },
      reviewedAt: { type: Date, default: Date.now }
    }
  },
  analytics: {
    source: { type: String, trim: true, default: 'marketplace' },
    conversionPath: [{ type: String, trim: true }],
    rfqResponseTime: { type: Number, min: 0 },
    orderProcessingTime: { type: Number, min: 0 },
    deliveryTime: { type: Number, min: 0 }
  },
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
marketplaceOrderSchema.index({ orderNumber: 1 }, { unique: true });
marketplaceOrderSchema.index({ buyerId: 1, status: 1 });
marketplaceOrderSchema.index({ sellerId: 1, status: 1 });
marketplaceOrderSchema.index({ rfqId: 1 });
marketplaceOrderSchema.index({ proposalId: 1 });
marketplaceOrderSchema.index({ status: 1, createdAt: -1 });
marketplaceOrderSchema.index({ tenantId: 1 });
marketplaceOrderSchema.index({ 'delivery.requestedDate': 1 });
marketplaceOrderSchema.index({ 'payment.status': 1 });

// Pre-save middleware
marketplaceOrderSchema.pre('save', function(next) {
  // Generate order number if not set
  if (!this.orderNumber) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.orderNumber = `ORD-${timestamp}-${random}`;
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
      case 'confirmed':
        if (!this.timeline.confirmed) this.timeline.confirmed = now;
        break;
      case 'processing':
        if (!this.timeline.processing) this.timeline.processing = now;
        break;
      case 'shipped':
        if (!this.timeline.shipped) this.timeline.shipped = now;
        break;
      case 'delivered':
        if (!this.timeline.delivered) this.timeline.delivered = now;
        break;
      case 'completed':
        if (!this.timeline.completed) this.timeline.completed = now;
        break;
      case 'cancelled':
        if (!this.timeline.cancelled) this.timeline.cancelled = now;
        break;
    }
  }

  next();
});

// Methods
marketplaceOrderSchema.methods.canBeCancelled = function() {
  return ['draft', 'pending', 'confirmed'].includes(this.status);
};

marketplaceOrderSchema.methods.addCommunication = function(fromUserId: any, message: string, type = 'note') {
  this.communications.push({
    from: fromUserId,
    message,
    type,
    timestamp: new Date()
  });
  return this.save();
};

marketplaceOrderSchema.methods.updateStatus = function(newStatus: string) {
  this.status = newStatus;
  return this.save();
};

// Static methods
marketplaceOrderSchema.statics.findByBuyer = function(buyerId: any, status?: string) {
  const query: any = { buyerId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

marketplaceOrderSchema.statics.findBySeller = function(sellerId: any, status?: string) {
  const query: any = { sellerId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

export const MarketplaceOrder = model<IMarketplaceOrder>('MarketplaceOrder', marketplaceOrderSchema);