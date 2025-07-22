import mongoose, { Document, Schema } from 'mongoose';

export interface IRFQ extends Document {
  // Basic Information
  rfqNumber: string;
  title: string;
  description: string;
  category: string;
  tags: string[];

  // Buyer Information
  buyer: mongoose.Types.ObjectId;
  buyerCompany: mongoose.Types.ObjectId;
  tenantId: string;

  // Product Requirements
  items: Array<{
    productId?: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    sku?: string;
    quantity: number;
    unit: string;
    targetPrice?: number;
    specifications?: string;
    requiredCertifications?: string[];
    preferredBrands?: string[];
  }>;

  // Delivery Requirements
  deliveryLocation: {
    address: string;
    city: string;
    state?: string;
    country: string;
    postalCode: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };

  deliveryTerms: {
    incoterm: string;
    preferredShippingMethod?: string;
    specialInstructions?: string;
  };

  deliverySchedule: {
    type: 'one-time' | 'recurring' | 'flexible';
    requestedDate?: Date;
    earliestDate?: Date;
    latestDate?: Date;
    frequency?: {
      interval: 'daily' | 'weekly' | 'monthly';
      count: number;
    };
  };

  // Payment Terms
  paymentTerms: {
    method: 'net30' | 'net60' | 'net90' | 'cod' | 'prepaid' | 'custom';
    customTerms?: string;
    currency: string;
  };

  // RFQ Timeline
  issuedDate: Date;
  dueDate: Date;
  validUntil: Date;
  expiresAt?: Date; // Alias for validUntil for backward compatibility

  // Status and State
  status: 'draft' | 'published' | 'closed' | 'awarded' | 'cancelled' | 'expired';
  visibility: 'public' | 'private' | 'invited';
  invitedSuppliers?: mongoose.Types.ObjectId[];

  // Quote Management
  quotes: Array<{
    _id?: mongoose.Types.ObjectId;
    supplier: mongoose.Types.ObjectId;
    submittedAt: Date;
    status: 'pending' | 'submitted' | 'revised' | 'accepted' | 'rejected' | 'withdrawn';
    totalAmount: number;
    currency: string;
    validUntil: Date;
    items: Array<{
      itemIndex: number;
      price: number;
      quantity: number;
      leadTime: number;
      notes?: string;
    }>;
    attachments?: Array<{
      name: string;
      url: string;
      type: string;
      uploadedAt: Date;
    }>;
    terms?: string;
    notes?: string;
    score?: number;
    ranking?: number;
  }>;

  // Selection Criteria
  selectionCriteria: {
    priceWeight: number;
    qualityWeight: number;
    deliveryWeight: number;
    paymentTermsWeight: number;
    certificationWeight: number;
    sustainabilityWeight: number;
  };

  // Award Information
  awardedTo?: mongoose.Types.ObjectId;
  awardedQuote?: mongoose.Types.ObjectId;
  awardedDate?: Date;
  awardReason?: string;

  // Compliance Requirements
  compliance: {
    requiredCertifications: string[];
    requiredDocuments: string[];
    qualityStandards?: string[];
    sustainabilityRequirements?: string[];
    packagingRequirements?: string[];
  };

  // Additional Requirements
  additionalRequirements: {
    sampleRequired: boolean;
    siteVisitRequired: boolean;
    insuranceRequired: boolean;
    minimumRating?: number;
    preferredSuppliers?: mongoose.Types.ObjectId[];
    excludedSuppliers?: mongoose.Types.ObjectId[];
  };

  // Attachments
  attachments: Array<{
    name: string;
    url: string;
    type: string;
    size: number;
    uploadedAt: Date;
    uploadedBy: mongoose.Types.ObjectId;
  }>;

  // Activity Log
  activityLog: Array<{
    action: string;
    performedBy: mongoose.Types.ObjectId;
    timestamp: Date;
    details?: any;
  }>;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  version: number;

  // Virtual fields
  isActive: boolean;
  quoteCount: number;
  daysRemaining: number;

  // Methods
  canSubmitQuote(supplierId: string): boolean;
  submitQuote(quote: any): Promise<void>;
  evaluateQuotes(): Promise<void>;
  awardToSupplier(supplierId: string, quoteId: string): Promise<void>;
  cancelRFQ(reason: string): Promise<void>;
  extendDeadline(newDate: Date): Promise<void>;
  addActivityLog(action: string, userId: string, details?: any): Promise<void>;
}

const rfqSchema = new Schema<IRFQ>({
  // Basic Information
  rfqNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  title: {
    type: String,
    required: [true, 'RFQ title is required'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'RFQ description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  category: {
    type: String,
    required: true,
    enum: ['beverages', 'dairy', 'meat', 'seafood', 'produce', 'packaged_foods', 'bakery', 'frozen', 'organic', 'ingredients', 'other']
  },
  tags: [String],

  // Buyer Information
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyerCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },

  // Product Requirements
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    sku: String,
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1']
    },
    unit: {
      type: String,
      required: true
    },
    targetPrice: {
      type: Number,
      min: 0
    },
    specifications: String,
    requiredCertifications: [String],
    preferredBrands: [String]
  }],

  // Delivery Requirements
  deliveryLocation: {
    address: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: String,
    country: {
      type: String,
      required: true
    },
    postalCode: {
      type: String,
      required: true
    },
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  deliveryTerms: {
    incoterm: {
      type: String,
      required: true,
      enum: ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']
    },
    preferredShippingMethod: String,
    specialInstructions: String
  },

  deliverySchedule: {
    type: {
      type: String,
      enum: ['one-time', 'recurring', 'flexible'],
      default: 'one-time'
    },
    requestedDate: Date,
    earliestDate: Date,
    latestDate: Date,
    frequency: {
      interval: {
        type: String,
        enum: ['daily', 'weekly', 'monthly']
      },
      count: Number
    }
  },

  // Payment Terms
  paymentTerms: {
    method: {
      type: String,
      enum: ['net30', 'net60', 'net90', 'cod', 'prepaid', 'custom'],
      default: 'net30'
    },
    customTerms: String,
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    }
  },

  // RFQ Timeline
  issuedDate: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required'],
    validate: {
      validator(this: IRFQ, value: Date) {
        return value > this.issuedDate;
      },
      message: 'Due date must be after issued date'
    }
  },
  validUntil: {
    type: Date,
    required: [true, 'Valid until date is required'],
    validate: {
      validator(this: IRFQ, value: Date) {
        return value >= this.dueDate;
      },
      message: 'Valid until date must be after or equal to due date'
    }
  },

  // Status and State
  status: {
    type: String,
    enum: ['draft', 'published', 'closed', 'awarded', 'cancelled', 'expired'],
    default: 'draft'
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'invited'],
    default: 'public'
  },
  invitedSuppliers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  }],

  // Quote Management
  quotes: [{
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'submitted', 'revised', 'accepted', 'rejected', 'withdrawn'],
      default: 'submitted'
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      required: true,
      uppercase: true
    },
    validUntil: {
      type: Date,
      required: true
    },
    items: [{
      itemIndex: {
        type: Number,
        required: true
      },
      price: {
        type: Number,
        required: true,
        min: 0
      },
      quantity: {
        type: Number,
        required: true,
        min: 1
      },
      leadTime: {
        type: Number,
        required: true,
        min: 0
      },
      notes: String
    }],
    attachments: [{
      name: String,
      url: String,
      type: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    terms: String,
    notes: String,
    score: Number,
    ranking: Number
  }],

  // Selection Criteria
  selectionCriteria: {
    priceWeight: {
      type: Number,
      default: 40,
      min: 0,
      max: 100
    },
    qualityWeight: {
      type: Number,
      default: 25,
      min: 0,
      max: 100
    },
    deliveryWeight: {
      type: Number,
      default: 20,
      min: 0,
      max: 100
    },
    paymentTermsWeight: {
      type: Number,
      default: 5,
      min: 0,
      max: 100
    },
    certificationWeight: {
      type: Number,
      default: 5,
      min: 0,
      max: 100
    },
    sustainabilityWeight: {
      type: Number,
      default: 5,
      min: 0,
      max: 100
    }
  },

  // Award Information
  awardedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  awardedQuote: {
    type: mongoose.Schema.Types.ObjectId
  },
  awardedDate: Date,
  awardReason: String,

  // Compliance Requirements
  compliance: {
    requiredCertifications: [String],
    requiredDocuments: [String],
    qualityStandards: [String],
    sustainabilityRequirements: [String],
    packagingRequirements: [String]
  },

  // Additional Requirements
  additionalRequirements: {
    sampleRequired: {
      type: Boolean,
      default: false
    },
    siteVisitRequired: {
      type: Boolean,
      default: false
    },
    insuranceRequired: {
      type: Boolean,
      default: false
    },
    minimumRating: {
      type: Number,
      min: 0,
      max: 5
    },
    preferredSuppliers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company'
    }],
    excludedSuppliers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company'
    }]
  },

  // Attachments
  attachments: [{
    name: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],

  // Activity Log
  activityLog: [{
    action: {
      type: String,
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: mongoose.Schema.Types.Mixed
  }],

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
rfqSchema.index({ tenantId: 1, status: 1, dueDate: -1 });
rfqSchema.index({ buyerCompany: 1, status: 1 });
rfqSchema.index({ 'quotes.supplier': 1 });
rfqSchema.index({ category: 1, status: 1 });
rfqSchema.index({ dueDate: 1, status: 1 });
rfqSchema.index({ rfqNumber: 1 });

// Virtual fields
rfqSchema.virtual('isActive').get(function() {
  return this.status === 'published' && new Date() <= this.dueDate;
});

rfqSchema.virtual('quoteCount').get(function() {
  return this.quotes.filter(q => q.status === 'submitted').length;
});

rfqSchema.virtual('daysRemaining').get(function() {
  if (this.status !== 'published') return 0;
  const now = new Date();
  const diff = this.dueDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// Virtual field for backward compatibility
rfqSchema.virtual('expiresAt').get(function() {
  return this.validUntil;
});

// Pre-save middleware
rfqSchema.pre('save', async function(next) {
  // Generate RFQ number if not exists
  if (!this.rfqNumber) {
    const count = await mongoose.model('RFQ').countDocuments({ tenantId: this.tenantId });
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    this.rfqNumber = `RFQ-${year}${month}-${(count + 1).toString().padStart(5, '0')}`;
  }

  // Validate selection criteria weights
  const totalWeight = Object.values(this.selectionCriteria).reduce((sum, weight) => sum + weight, 0);
  if (totalWeight !== 100) {
    throw new Error('Selection criteria weights must sum to 100');
  }

  // Auto-expire RFQs
  if (this.status === 'published' && new Date() > this.dueDate) {
    this.status = 'expired';
  }

  next();
});

// Methods
rfqSchema.methods.canSubmitQuote = function(supplierId: string): boolean {
  // Check if RFQ is active
  if (!this.isActive) return false;

  // Check visibility
  if (this.visibility === 'private') return false;

  if (this.visibility === 'invited') {
    return this.invitedSuppliers.some((id: any) => id.toString() === supplierId);
  }

  // Check if supplier is excluded
  if (this.additionalRequirements.excludedSuppliers?.some((id: any) => id.toString() === supplierId)) {
    return false;
  }

  // Check if already submitted
  const existingQuote = this.quotes.find((q: any) =>
    q.supplier.toString() === supplierId && q.status !== 'withdrawn'
  );

  return !existingQuote;
};

rfqSchema.methods.submitQuote = async function(quote: any): Promise<void> {
  if (!this.canSubmitQuote(quote.supplier)) {
    throw new Error('Cannot submit quote for this RFQ');
  }

  this.quotes.push(quote);
  await this.addActivityLog('quote_submitted', quote.supplier, { quoteId: quote._id });
  await this.save();
};

rfqSchema.methods.evaluateQuotes = async function(): Promise<void> {
  // Score and rank quotes based on selection criteria
  const quotes = this.quotes.filter((q: any) => q.status === 'submitted');

  quotes.forEach((quote: any) => {
    let score = 0;

    // Price scoring (lower is better)
    const prices = quotes.map((q: any) => q.totalAmount);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceScore = maxPrice > minPrice ?
      ((maxPrice - quote.totalAmount) / (maxPrice - minPrice)) * 100 : 100;
    score += (priceScore * this.selectionCriteria.priceWeight) / 100;

    // Other criteria would be scored here...

    quote.score = Math.round(score * 100) / 100;
  });

  // Rank quotes
  quotes.sort((a: any, b: any) => b.score - a.score);
  quotes.forEach((quote: any, index: number) => {
    quote.ranking = index + 1;
  });

  await this.save();
};

rfqSchema.methods.awardToSupplier = async function(
  supplierId: string,
  quoteId: string
): Promise<void> {
  const quote = this.quotes.find((q: any) =>
    q._id.toString() === quoteId && q.supplier.toString() === supplierId
  );

  if (!quote) {
    throw new Error('Quote not found');
  }

  this.status = 'awarded';
  this.awardedTo = supplierId as any;
  this.awardedQuote = quoteId as any;
  this.awardedDate = new Date();

  // Update quote statuses
  this.quotes.forEach((q: any) => {
    if (q._id.toString() === quoteId) {
      q.status = 'accepted';
    } else if (q.status === 'submitted') {
      q.status = 'rejected';
    }
  });

  await this.addActivityLog('rfq_awarded', supplierId, {
    quoteId,
    amount: quote.totalAmount
  });
  await this.save();
};

rfqSchema.methods.cancelRFQ = async function(reason: string): Promise<void> {
  if (['awarded', 'cancelled'].includes(this.status)) {
    throw new Error('Cannot cancel RFQ in current status');
  }

  this.status = 'cancelled';
  await this.addActivityLog('rfq_cancelled', this.createdBy, { reason });
  await this.save();
};

rfqSchema.methods.extendDeadline = async function(newDate: Date): Promise<void> {
  if (this.status !== 'published') {
    throw new Error('Can only extend deadline for published RFQs');
  }

  if (newDate <= this.dueDate) {
    throw new Error('New deadline must be after current deadline');
  }

  const oldDate = this.dueDate;
  this.dueDate = newDate;

  await this.addActivityLog('deadline_extended', this.createdBy, {
    oldDate,
    newDate
  });
  await this.save();
};

rfqSchema.methods.addActivityLog = async function(
  action: string,
  userId: string,
  details?: any
): Promise<void> {
  this.activityLog.push({
    action,
    performedBy: userId as any,
    timestamp: new Date(),
    details
  });
};

export const RFQ = mongoose.model<IRFQ>('RFQ', rfqSchema);
export default RFQ;
