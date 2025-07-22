import mongoose from 'mongoose';

const sampleRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    unique: true,
    required: true
  },
  rfq: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ',
    required: true
  },
  proposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  product: {
    name: String,
    specifications: String
  },
  status: {
    type: String,
    enum: ['requested', 'preparing', 'sent', 'in_transit', 'delivered', 'reviewed', 'rejected'],
    default: 'requested'
  },
  shipping: {
    method: String,
    carrier: String,
    trackingNumber: String,
    sentDate: Date,
    expectedDelivery: Date,
    actualDelivery: Date
  },
  review: {
    rating: { type: Number, min: 1, max: 5 },
    comments: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    decision: { type: String, enum: ['approved', 'rejected', 'pending'] }
  },
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
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

// Auto-generate Request ID
sampleRequestSchema.pre('save', async function(next) {
  if (this.isNew && !this.requestId) {
    const count = await (this.constructor as any).countDocuments();
    this.requestId = `SMPL-${String(count + 1).padStart(5, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('SampleRequest', sampleRequestSchema);
