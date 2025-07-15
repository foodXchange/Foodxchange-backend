const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: { 
    type: String, 
    unique: true, 
    required: true 
  },
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
  supplier: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', 
    required: true 
  },
  supplierContact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rfq: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'RFQ' 
  }, // Optional, if order came from RFQ
  proposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ'
  }, // Reference to specific proposal if from RFQ
  
  // Agent tracking
  facilitatedByAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  },
  agentLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AgentLead'
  },
  agentCommissionPaid: { type: Boolean, default: false },
  agentCommissionAmount: Number,
  
  items: [{
    itemId: { type: String, required: true },
    product: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product' 
    },
    name: { type: String, required: true },
    description: String,
    sku: String,
    category: String,
    
    quantity: { 
      type: Number, 
      required: true,
      min: 1
    },
    unit: { type: String, required: true },
    
    pricing: {
      unitPrice: { type: Number, required: true },
      totalPrice: { type: Number, required: true },
      currency: { type: String, default: 'USD' },
      discount: {
        amount: Number,
        percentage: Number,
        reason: String
      }
    },
    
    specifications: [{
      attribute: String,
      value: String,
      verified: Boolean
    }],
    
    compliance: {
      certifications: [String],
      documents: [String],
      verified: Boolean,
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      verifiedAt: Date
    }
  }],
  
  pricing: {
    subtotal: { type: Number, required: true },
    taxes: {
      amount: Number,
      rate: Number,
      breakdown: [{
        type: String, // VAT, Sales Tax, etc.
        rate: Number,
        amount: Number
      }]
    },
    shipping: {
      amount: Number,
      method: String,
      carrier: String
    },
    fees: [{
      type: String,
      description: String,
      amount: Number
    }],
    discounts: [{
      type: String,
      description: String,
      amount: Number
    }],
    total: { type: Number, required: true },
    currency: { type: String, default: 'USD' }
  },
  
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
    requestedDate: Date,
    confirmedDate: Date,
    shippedDate: Date,
    deliveredDate: Date,
    
    method: {
      type: String,
      enum: ['ground', 'air', 'sea', 'express', 'pickup', 'custom']
    },
    carrier: String,
    service: String, // Next day, 2-day, standard, etc.
    
    tracking: {
      number: String,
      url: String,
      updates: [{
        status: String,
        location: String,
        timestamp: Date,
        description: String
      }]
    },
    
    instructions: String,
    appointmentRequired: Boolean,
    
    temperature: {
      controlled: Boolean,
      range: {
        min: Number,
        max: Number,
        unit: { type: String, enum: ['F', 'C'], default: 'F' }
      }
    }
  },
  
  payment: {
    terms: {
      type: String,
      enum: ['NET15', 'NET30', 'NET60', 'COD', 'Prepaid', 'LC', 'Custom'],
      default: 'NET30'
    },
    customTerms: String,
    
    method: {
      type: String,
      enum: ['bank_transfer', 'credit_card', 'check', 'letter_of_credit', 'escrow']
    },
    
    dueDate: Date,
    paidDate: Date,
    
    invoices: [{
      invoiceNumber: String,
      amount: Number,
      issueDate: Date,
      dueDate: Date,
      status: {
        type: String,
        enum: ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'],
        default: 'draft'
      },
      url: String
    }],
    
    transactions: [{
      transactionId: String,
      amount: Number,
      date: Date,
      method: String,
      reference: String,
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
      }
    }],
    
    status: {
      type: String,
      enum: ['pending', 'partial', 'paid', 'overdue', 'refunded'],
      default: 'pending'
    }
  },
  
  status: {
    type: String,
    enum: [
      'pending_confirmation', 'confirmed', 'processing', 
      'ready_to_ship', 'shipped', 'in_transit', 'delivered', 
      'completed', 'cancelled', 'returned'
    ],
    default: 'pending_confirmation'
  },
  
  timeline: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    notes: String,
    updatedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    automatic: { type: Boolean, default: false },
    notificationSent: { type: Boolean, default: false }
  }],
  
  documents: [{
    name: String,
    type: { 
      type: String, 
      enum: [
        'purchase_order', 'invoice', 'receipt', 'packing_slip',
        'bill_of_lading', 'certificate', 'contract', 'insurance',
        'customs_docs', 'quality_report', 'other'
      ]
    },
    url: String,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    size: Number,
    verified: Boolean
  }],
  
  quality: {
    inspections: [{
      type: { 
        type: String,
        enum: ['incoming', 'pre_ship', 'random', 'complaint']
      },
      date: Date,
      inspector: String,
      result: {
        type: String,
        enum: ['passed', 'failed', 'conditional']
      },
      notes: String,
      documents: [String],
      correctionRequired: Boolean
    }],
    complaints: [{
      type: String,
      description: String,
      reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reportedAt: { type: Date, default: Date.now },
      resolution: String,
      resolvedAt: Date,
      status: {
        type: String,
        enum: ['open', 'investigating', 'resolved', 'closed']
      }
    }]
  },
  
  compliance: {
    certifications: [{
      name: String,
      number: String,
      authority: String,
      validUntil: Date,
      document: String,
      verified: Boolean
    }],
    regulatoryApprovals: [String],
    customsInfo: {
      hsCode: String,
      countryOfOrigin: String,
      declarationValue: Number,
      documents: [String]
    }
  },
  
  communication: [{
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subject: String,
    message: String,
    timestamp: { type: Date, default: Date.now },
    attachments: [String],
    type: {
      type: String,
      enum: ['general', 'issue', 'update', 'request']
    }
  }],
  
  cancellation: {
    reason: String,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    penalty: {
      amount: Number,
      reason: String
    },
    refund: {
      amount: Number,
      processedAt: Date,
      transactionId: String
    }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to generate order number
orderSchema.pre('save', function(next) {
  if (this.isNew && !this.orderNumber) {
    const timestamp = Date.now().toString().slice(-6);
    this.orderNumber = `ORD-${timestamp}`;
  }
  next();
});

// Virtual for order age
orderSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60 * 60 * 24));
});

// Indexes
orderSchema.index({ buyer: 1, status: 1 });
orderSchema.index({ supplier: 1, status: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ 'delivery.requestedDate': 1 });
orderSchema.index({ 'payment.dueDate': 1 });

module.exports = mongoose.model('Order', orderSchema);
