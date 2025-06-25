const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  eventType: {
    type: String,
    enum: ['page_view', 'product_view', 'inquiry_sent', 'sample_requested', 
           'meeting_scheduled', 'order_placed', 'search', 'filter_applied'],
    required: true
  },
  eventData: {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    searchQuery: String,
    filters: mongoose.Schema.Types.Mixed,
    value: Number,
    metadata: mongoose.Schema.Types.Mixed
  },
  sessionId: String,
  ipAddress: String,
  userAgent: String,
  referrer: String,
  timestamp: { type: Date, default: Date.now }
});

const performanceMetricSchema = new mongoose.Schema({
  entity: {
    type: { type: String, enum: ['supplier', 'product', 'category'], required: true },
    id: { type: mongoose.Schema.Types.ObjectId, required: true }
  },
  period: {
    type: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    date: { type: Date, required: true }
  },
  metrics: {
    views: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    samples: { type: Number, default: 0 },
    meetings: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    avgResponseTime: { type: Number, default: 0 },
    rating: { type: Number, default: 0 }
  },
  trends: {
    viewsChange: Number,
    inquiriesChange: Number,
    revenueChange: Number,
    rankChange: Number
  },
  calculatedAt: { type: Date, default: Date.now }
});

const trendingProductSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  category: String,
  period: { type: Date, required: true },
  metrics: {
    searchVolume: Number,
    viewGrowth: Number,
    inquiryGrowth: Number,
    conversionRate: Number
  },
  score: { type: Number, required: true }, // Calculated trending score
  rank: Number,
  tags: [String],
  calculatedAt: { type: Date, default: Date.now }
});

// Indexes for efficient querying
analyticsEventSchema.index({ user: 1, timestamp: -1 });
analyticsEventSchema.index({ eventType: 1, timestamp: -1 });
performanceMetricSchema.index({ 'entity.type': 1, 'entity.id': 1, 'period.date': -1 });
trendingProductSchema.index({ period: -1, score: -1 });

const AnalyticsEvent = mongoose.model('AnalyticsEvent', analyticsEventSchema);
const PerformanceMetric = mongoose.model('PerformanceMetric', performanceMetricSchema);
const TrendingProduct = mongoose.model('TrendingProduct', trendingProductSchema);

module.exports = { AnalyticsEvent, PerformanceMetric, TrendingProduct };
