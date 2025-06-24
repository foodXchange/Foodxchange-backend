const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  rfq: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ'
  },
  proposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    name: String,
    quantity: {
      type: Number,
      required: true
    },
    unit: String,
    unitPrice: {
      type: Number,
      required: true
    },
    totalPrice: Number,
    specifications: String
  }],
  pricing: {
    subtotal: Number,
    taxes: Number,
    shipping: Number,
    otherCharges: [{
      description: String,
      amount: Number
    }],
    total: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  payment: {
    terms: String,
    method: String,
    status: {
      type: String,
      enum: ['pending', 'partial', 'paid', 'overdue'],
      default: 'pending'
    },
    dueDate: Date,
    paidAmount: {
      type: Number,
      default: 0
    },
    transactions: [{
      amount: Number,
      date: Date,
      reference: String,
      method: String
    }]
  },
  delivery: {
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    },
    contactPerson: {
      name: String,
      phone: String,
      email: String
    },
    scheduledDate: Date,
    actualDate: Date,
    trackingNumber: String,
    carrier: String,
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'returned'],
      default: 'pending'
    }
  },
  status: {
    type: String,
    enum: ['draft', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'],
    default: 'draft'
  },
  documents: [{
    type: {
      type: String,
      enum: ['invoice', 'po', 'packing_list', 'bol', 'certificate', 'other']
    },
    name: String,
    url: String,
    uploadedAt: Date
  }],
  notes: String,
  timeline: [{
    status: String,
    date: Date,
    notes: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }]
}, {
  timestamps: true
});

// Auto-generate order number
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const count = await this.constructor.countDocuments();
    this.orderNumber = `ORD-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Calculate totals
orderSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    const subtotal = this.items.reduce((sum, item) => {
      item.totalPrice = item.quantity * item.unitPrice;
      return sum + item.totalPrice;
    }, 0);
    
    this.pricing.subtotal = subtotal;
    
    const otherChargesTotal = this.pricing.otherCharges?.reduce((sum, charge) => sum + charge.amount, 0) || 0;
    
    this.pricing.total = subtotal + 
                        (this.pricing.taxes || 0) + 
                        (this.pricing.shipping || 0) + 
                        otherChargesTotal;
  }
  next();
});

// Indexes
orderSchema.index({ buyer: 1, status: 1 });
orderSchema.index({ supplier: 1, status: 1 });
orderSchema.index({ orderNumber: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
