const mongoose = require('mongoose');

const matchingProfileSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  preferences: {
    categories: [String],
    certifications: [String],
    priceRange: {
      min: Number,
      max: Number
    },
    moq: {
      min: Number,
      max: Number
    },
    leadTime: {
      type: String,
      enum: ['immediate', '1week', '2weeks', '1month', 'flexible']
    },
    regions: [String],
    qualityScore: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  history: {
    totalOrders: { type: Number, default: 0 },
    avgOrderValue: { type: Number, default: 0 },
    preferredSuppliers: [{
      supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      orderCount: Number,
      avgRating: Number
    }]
  },
  matchingWeights: {
    price: { type: Number, default: 30 },
    quality: { type: Number, default: 25 },
    delivery: { type: Number, default: 20 },
    certifications: { type: Number, default: 15 },
    communication: { type: Number, default: 10 }
  },
  lastUpdated: { type: Date, default: Date.now }
});

const matchResultSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  matchScore: { type: Number, required: true },
  factors: {
    priceMatch: Number,
    qualityMatch: Number,
    certificationMatch: Number,
    locationMatch: Number,
    capacityMatch: Number
  },
  status: {
    type: String,
    enum: ['new', 'viewed', 'contacted', 'negotiating', 'closed_won', 'closed_lost'],
    default: 'new'
  },
  createdAt: { type: Date, default: Date.now }
});

const MatchingProfile = mongoose.model('MatchingProfile', matchingProfileSchema);
const MatchResult = mongoose.model('MatchResult', matchResultSchema);

module.exports = { MatchingProfile, MatchResult };
