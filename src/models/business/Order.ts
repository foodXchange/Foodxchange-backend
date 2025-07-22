import mongoose from 'mongoose';
const { Decimal128 } = mongoose.Types;

const orderSchema = new mongoose.Schema({
  // Dual ID System
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  legacyId: { type: String, unique: true, sparse: true },
  orderNumber: { type: String, unique: true, required: true },
  purchaseOrderNumber: String,

  // Parties
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },

  // Origin (if from RFQ/Proposal)
  originatedFrom: {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
    proposal: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' }
  },

  // Order Items
  items: [{
    lineNumber: Number,
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productSnapshot: {
      name: String,
      description: String,
      specifications: mongoose.Schema.Types.Mixed,
      supplierProductCode: String
    },

    // Quantities
    quantity: {
      ordered: { type: Number, required: true },
      confirmed: Number,
      shipped: Number,
      delivered: Number,
      rejected: Number,
      unit: String
    },

    // Packaging
    packaging: {
      unitsPerCarton: Number,
      cartonsOrdered: Number,
      cartonsShipped: Number
    },

    // Pricing
    pricing: {
      unitPrice: { type: Decimal128, required: true },
      cartonPrice: Decimal128,
      totalPrice: { type: Decimal128, required: true },
      currency: { type: String, default: 'USD' },
      discount: {
        amount: Decimal128,
        percentage: Number,
        reason: String
      }
    },

    // Product Details
    specifications: [{
      attribute: String,
      value: String,
      verified: Boolean
    }],

    // Compliance
    compliance: {
      certificates: [String],
      inspections: [{
        type: String,
        result: String,
        date: Date,
        inspector: String,
        documents: [String]
      }]
    },

    // Status
    status: {
      stage: {
        type: String,
        enum: ['pending', 'confirmed', 'production', 'ready', 'shipped', 'delivered', 'completed'],
        default: 'pending'
      },
      notes: String,
      lastUpdated: Date
    }
  }],

  // Order Summary
  summary: {
    totalItems: Number,
    totalQuantity: Number,
    totalCartons: Number,
    pricing: {
      subtotal: { type: Decimal128, required: true },
      taxes: {
        amount: Decimal128,
        rate: Number,
        breakdown: [{
          type: String,
          rate: Number,
          amount: Decimal128
        }]
      },
      shipping: {
        amount: Decimal128,
        method: String,
        carrier: String
      },
      fees: [{
        type: String,
        description: String,
        amount: Decimal128
      }],
      discounts: [{
        type: String,
        description: String,
        amount: Decimal128
      }],
      total: { type: Decimal128, required: true },
      currency: { type: String, default: 'USD' }
    }
  },

  // Delivery Information
  delivery: {
    address: {
      contactName: String,
      company: String,
      street: String,
      street2: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
      phone: String,
      email: String
    },
    schedule: {
      requestedDate: Date,
      confirmedDate: Date,
      estimatedShipDate: Date,
      actualShipDate: Date,
      estimatedDeliveryDate: Date,
      actualDeliveryDate: Date
    },
    method: {
      type: String,
      carrier: String,
      service: String,
      trackingNumber: String,
      trackingUrl: String
    },
    specialInstructions: String,
    requirements: {
      appointmentRequired: Boolean,
      temperatureControlled: Boolean,
      signatureRequired: Boolean,
      liftGateRequired: Boolean
    }
  },

  // Payment Information
  payment: {
    terms: {
      type: String,
      enum: ['NET15', 'NET30', 'NET60', 'COD', 'Prepaid', 'LC'],
      default: 'NET30'
    },
    customTerms: String,
    method: String,
    dueDate: Date,
    status: {
      stage: {
        type: String,
        enum: ['pending', 'partial', 'paid', 'overdue', 'cancelled'],
        default: 'pending'
      },
      paidAmount: Decimal128,
      paidDate: Date,
      remainingAmount: Decimal128
    },
    invoices: [{
      invoiceNumber: String,
      amount: Decimal128,
      issueDate: Date,
      dueDate: Date,
      status: String,
      documentUrl: String // Azure URL
    }]
  },

  // Shipping & Logistics
  shipping: [{
    shipmentId: String,
    shipmentNumber: String,
    containerNumber: String,
    containerSize: String,
    vesselName: String,
    voyageNumber: String,

    // Quantities
    quantities: {
      cartons: Number,
      units: Number,
      weight: Number
    },

    // Dates
    schedule: {
      loadingDate: Date,
      departureDate: Date,
      estimatedArrival: Date,
      actualArrival: Date
    },

    // Documentation
    documents: [{
      type: { type: String, enum: ['bill_of_lading', 'packing_list', 'invoice', 'certificate'] },
      url: String, // Azure URL
      uploadedAt: Date
    }],

    // Status
    status: String,
    trackingUpdates: [{
      timestamp: Date,
      location: String,
      status: String,
      description: String
    }]
  }],

  // Status & Workflow
  status: {
    stage: {
      type: String,
      enum: [
        'draft', 'pending_confirmation', 'confirmed', 'in_production',
        'ready_to_ship', 'shipped', 'in_transit', 'delivered',
        'completed', 'cancelled', 'on_hold'
      ],
      default: 'draft',
      index: true
    },
    substatus: String,
    lastUpdated: Date,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },

  // Timeline & History
  timeline: [{
    stage: String,
    timestamp: { type: Date, default: Date.now },
    description: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isAutomatic: Boolean,
    metadata: mongoose.Schema.Types.Mixed
  }],

  // Quality Control
  quality: {
    inspections: [{
      type: { type: String, enum: ['incoming', 'pre_ship', 'random', 'complaint'] },
      date: Date,
      inspector: String,
      result: { type: String, enum: ['pass', 'fail', 'conditional'] },
      notes: String,
      documents: [String], // Azure URLs
      correctionRequired: Boolean,
      followUpDate: Date
    }],

    // Issues & Complaints
    issues: [{
      type: String,
      description: String,
      severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
      reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reportedAt: { type: Date, default: Date.now },
      status: { type: String, enum: ['open', 'investigating', 'resolved', 'closed'] },
      resolution: String,
      resolvedAt: Date,
      documents: [String]
    }]
  },

  // Financial Tracking
  financial: {
    commissions: [{
      agent: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
      rate: Decimal128,
      amount: Decimal128,
      status: { type: String, enum: ['pending', 'calculated', 'paid'] },
      paidDate: Date
    }],
    costs: [{
      type: String,
      description: String,
      amount: Decimal128,
      currency: String,
      supplier: String
    }],
    profitMargin: {
      amount: Decimal128,
      percentage: Number
    }
  },

  // Communications
  communications: [{
    type: { type: String, enum: ['email', 'call', 'meeting', 'system'] },
    direction: { type: String, enum: ['inbound', 'outbound', 'internal'] },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    subject: String,
    content: String,
    attachments: [String],
    timestamp: { type: Date, default: Date.now },
    isImportant: Boolean
  }],

  // Documents & Media
  documents: [{
    name: String,
    type: {
      type: String,
      enum: [
        'purchase_order', 'invoice', 'packing_list', 'bill_of_lading',
        'certificate', 'inspection_report', 'customs_docs', 'insurance',
        'contract', 'amendment', 'other'
      ]
    },
    url: String, // Azure Blob Storage URL
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
    isLatest: { type: Boolean, default: true }
  }],

  // Analytics & Metrics
  analytics: {
    leadTime: {
      orderToShip: Number, // days
      shipToDeliver: Number, // days
      totalCycle: Number // days
    },
    performance: {
      onTimeDelivery: Boolean,
      qualityScore: Number,
      communicationScore: Number,
      overallScore: Number
    },
    costs: {
      totalCost: Decimal128,
      costPerUnit: Decimal128,
      shippingCost: Decimal128,
      additionalCosts: Decimal128
    }
  },

  // Comments & Notes
  comments: [{
    type: { type: String, enum: ['note', 'issue', 'milestone', 'feedback'] },
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isInternal: Boolean,
    isImportant: Boolean,
    tags: [String],
    attachments: [String],
    createdAt: { type: Date, default: Date.now }
  }],

  // System Fields
  metadata: {
    source: String, // 'manual', 'rfq', 'recurring', 'api'
    environment: String, // 'production', 'staging', 'test'
    version: { type: Number, default: 1 },
    locks: [{
      lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      lockedAt: Date,
      reason: String
    }]
  },

  // Original Data Preservation
  originalData: {
    orderId: String,
    source: String,
    importedAt: Date,
    rawData: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(doc, ret) {
      // Convert Decimal128 fields for JSON output
      const convertDecimal = (obj) => {
        if (obj && typeof obj === 'object') {
          Object.keys(obj).forEach(key => {
            if (obj[key]?.constructor && obj[key].constructor.name === 'Decimal128') {
              obj[key] = parseFloat(obj[key].toString());
            } else if (typeof obj[key] === 'object') {
              convertDecimal(obj[key]);
            }
          });
        }
      };
      convertDecimal(ret);
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes for performance
orderSchema.index({ buyer: 1, supplier: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ 'status.stage': 1, createdAt: -1 });
orderSchema.index({ 'delivery.schedule.requestedDate': 1 });
orderSchema.index({ 'payment.dueDate': 1 });
orderSchema.index({ legacyId: 1 }, { sparse: true });

// Virtual for order age
orderSchema.virtual('ageInDays').get(function(this: any) {
  return Math.floor((new Date().getTime() - new Date(this.createdAt).getTime()) / (1000 * 60 * 60 * 24));
});

// Virtual for delivery status
orderSchema.virtual('deliveryStatus').get(function() {
  const now = new Date();
  const requested = this.delivery?.schedule?.requestedDate;

  if (!requested) return 'no_date';
  if (this.delivery?.schedule?.actualDeliveryDate) return 'delivered';
  if (now > requested) return 'overdue';
  if (Math.abs(now - requested) <= 7 * 24 * 60 * 60 * 1000) return 'due_soon';
  return 'on_track';
});

// Pre-save middleware
orderSchema.pre('save', function(next) {
  // Generate order number if not exists
  if (this.isNew && !this.orderNumber) {
    this.orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
  }

  // Update status timestamp
  if (this.isModified('status.stage')) {
    this.status.lastUpdated = new Date();

    // Add to timeline
    this.timeline.push({
      stage: this.status.stage,
      timestamp: new Date(),
      description: `Order status changed to ${this.status.stage}`,
      isAutomatic: true
    });
  }

  next();
});

export default mongoose.model('Order', orderSchema);
