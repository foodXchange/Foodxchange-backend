const mongoose = require('mongoose');

const rfqItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  productName: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  unit: {
    type: String,
    required: true,
    enum: ['kg', 'ton', 'liter', 'unit', 'box', 'pallet']
  },
  packaging: String,
  targetPrice: Number,
  notes: String
});

const rfqSchema = new mongoose.Schema({
  rfqNumber: {
    type: String,
    unique: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyerCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  items: [rfqItemSchema],
  deliveryDate: {
    type: Date,
    required: true
  },
  deliveryAddress: {
    type: String,
    required: true
  },
  requirements: {
    kosher: Boolean,
    organic: Boolean,
    nonGMO: Boolean,
    customRequirement: String
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'evaluating', 'closed', 'completed'],
    default: 'draft'
  },
  proposalCount: {
    type: Number,
    default: 0
  },
  matchedSuppliers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate RFQ number before saving
rfqSchema.pre('save', async function(next) {
  if (!this.rfqNumber) {
    const count = await this.constructor.countDocuments();
    this.rfqNumber = `RFQ-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Update timestamp
rfqSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const RFQ = mongoose.model('RFQ', rfqSchema);
module.exports = RFQ;
