const mongoose = require('mongoose');

const rfqSchema = new mongoose.Schema({
  rfqId: {
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
  title: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'active', 'offer_received', 'sample_sent', 'finalized', 'cancelled'],
    default: 'draft'
  },
  productInfo: {
    name: { type: String, required: true },
    category: { type: String, required: true },
    quantity: { type: Number, required: true },
    quantityUnit: { type: String, required: true },
    specifications: { type: String }
  },
  packaging: {
    unitsPerCarton: Number,
    shelfLifeMonths: Number,
    packagingType: String
  },
  shipping: {
    incoterm: { type: String, default: 'FOB' },
    destinationCountry: { type: String, required: true },
    destinationCity: { type: String, required: true },
    preferredShippingMethod: { 
      type: String, 
      enum: ['sea', 'air', 'land'],
      default: 'sea'
    },
    deliveryDate: Date
  },
  certifications: {
    kosher: { type: Boolean, default: false },
    organic: { type: Boolean, default: false },
    vegan: { type: Boolean, default: false },
    halal: { type: Boolean, default: false },
    other: [String]
  },
  notes: String,
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  invitedSuppliers: [{
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    invitedAt: { type: Date, default: Date.now },
    status: { 
      type: String, 
      enum: ['invited', 'viewed', 'responded', 'declined'],
      default: 'invited'
    }
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

// Auto-generate RFQ ID
rfqSchema.pre('save', async function(next) {
  if (this.isNew && !this.rfqId) {
    const count = await this.constructor.countDocuments();
    this.rfqId = `RFQ-${String(count + 1).padStart(5, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('RFQ', rfqSchema);
