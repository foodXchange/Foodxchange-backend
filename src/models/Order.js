const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },
  poNumber: {
    type: String,
    unique: true,
    required: true
  },
  rfq: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ'
  },
  proposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal',
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
  status: {
    type: String,
    enum: ['draft', 'confirmed', 'in_production', 'shipped', 'in_transit', 'delivered', 'completed', 'cancelled'],
    default: 'draft'
  },
  orderDetails: {
    products: [{
      productName: String,
      quantity: Number,
      unit: String,
      unitPrice: Number,
      totalPrice: Number
    }],
    totalAmount: Number,
    currency: { type: String, default: 'USD' }
  },
  shipping: {
    incoterm: String,
    method: String,
    originPort: String,
    destinationPort: String,
    estimatedDeparture: Date,
    estimatedArrival: Date,
    actualDeparture: Date,
    actualArrival: Date
  },
  payment: {
    terms: String,
    method: String,
    dueDate: Date,
    status: { 
      type: String, 
      enum: ['pending', 'partial', 'paid', 'overdue'],
      default: 'pending'
    }
  },
  documents: [{
    name: String,
    type: { 
      type: String,
      enum: ['po', 'invoice', 'packing_list', 'bol', 'coa', 'other']
    },
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  shipments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipment'
  }],
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-generate Order ID and PO Number
orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await this.constructor.countDocuments();
    if (!this.orderId) {
      this.orderId = `ORD-${String(count + 1).padStart(5, '0')}`;
    }
    if (!this.poNumber) {
      this.poNumber = `PO-${String(count + 1).padStart(5, '0')}`;
    }
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Order', orderSchema);
