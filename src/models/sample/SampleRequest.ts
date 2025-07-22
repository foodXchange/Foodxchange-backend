import mongoose from 'mongoose';

const sampleRequestSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  requestType: {
    type: String,
    enum: ['standard', 'custom', 'bulk'],
    default: 'standard'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'preparing', 'shipped', 'delivered', 'cancelled', 'rejected'],
    default: 'pending'
  },
  quantity: {
    amount: Number,
    unit: String
  },
  purpose: {
    type: String,
    enum: ['quality_testing', 'taste_testing', 'lab_analysis', 'customer_review', 'other'],
    required: true
  },
  specificRequirements: String,
  shippingDetails: {
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    },
    contactPerson: String,
    phone: String,
    preferredCarrier: String,
    shippingMethod: {
      type: String,
      enum: ['standard', 'express', 'overnight', 'cold_chain']
    },
    trackingNumber: String,
    shippedDate: Date,
    estimatedDelivery: Date,
    actualDelivery: Date
  },
  cost: {
    sampleCost: {
      type: Number,
      default: 0
    },
    shippingCost: {
      type: Number,
      default: 0
    },
    totalCost: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    paymentStatus: {
      type: String,
      enum: ['free', 'pending', 'paid', 'refunded'],
      default: 'free'
    }
  },
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    appearance: {
      score: Number,
      comments: String
    },
    taste: {
      score: Number,
      comments: String
    },
    texture: {
      score: Number,
      comments: String
    },
    packaging: {
      score: Number,
      comments: String
    },
    overall: String,
    wouldOrder: Boolean,
    estimatedOrderQuantity: String
  },
  timeline: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String
  }],
  internalNotes: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    note: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    type: {
      type: String,
      enum: ['lab_report', 'photo', 'video', 'document']
    },
    name: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Update timeline on status change
sampleRequestSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date()
    });
  }

  // Calculate total cost
  if (this.isModified('cost.sampleCost') || this.isModified('cost.shippingCost')) {
    this.cost.totalCost = this.cost.sampleCost + this.cost.shippingCost;
  }

  next();
});

export default mongoose.model('SampleRequest', sampleRequestSchema);
