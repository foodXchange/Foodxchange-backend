import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  period: {
    start: Date,
    end: Date,
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
      required: true
    }
  },
  metrics: {
    // Activity Metrics
    totalInquiries: { type: Number, default: 0 },
    inquiriesReceived: { type: Number, default: 0 },
    inquiriesSent: { type: Number, default: 0 },
    inquiriesConverted: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },

    // Product Metrics
    productsViewed: { type: Number, default: 0 },
    productsListed: { type: Number, default: 0 },
    productsSold: { type: Number, default: 0 },
    topViewedProducts: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      views: Number
    }],

    // Meeting Metrics
    meetingsScheduled: { type: Number, default: 0 },
    meetingsCompleted: { type: Number, default: 0 },
    meetingsCancelled: { type: Number, default: 0 },
    avgMeetingDuration: { type: Number, default: 0 },
    meetingSuccessRate: { type: Number, default: 0 },

    // Response Metrics
    avgResponseTime: { type: Number, default: 0 }, // in hours
    responseRate: { type: Number, default: 0 },

    // Financial Metrics
    totalRevenue: { type: Number, default: 0 },
    avgDealSize: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },

    // Category Performance
    categoryPerformance: [{
      category: String,
      inquiries: Number,
      conversion: Number,
      revenue: Number
    }],

    // Geographic Distribution
    geographicData: [{
      country: String,
      inquiries: Number,
      orders: Number,
      revenue: Number
    }]
  },
  insights: [{
    type: {
      type: String,
      enum: ['opportunity', 'warning', 'trend', 'recommendation']
    },
    title: String,
    description: String,
    impact: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    actionable: Boolean,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  comparisons: {
    previousPeriod: {
      inquiriesChange: Number,
      conversionChange: Number,
      revenueChange: Number
    },
    industryAverage: {
      conversionRate: Number,
      responseTime: Number,
      dealSize: Number
    },
    ranking: {
      overall: Number,
      category: Number,
      responseTime: Number
    }
  }
}, {
  timestamps: true
});

// Calculate conversion rate
analyticsSchema.pre('save', function(next) {
  if (this.metrics.totalInquiries > 0) {
    this.metrics.conversionRate = (this.metrics.inquiriesConverted / this.metrics.totalInquiries) * 100;
  }
  next();
});

// Generate insights based on metrics
analyticsSchema.methods.generateInsights = function() {
  const insights = [];

  // Check conversion rate
  if (this.metrics.conversionRate < 20) {
    insights.push({
      type: 'warning',
      title: 'Low Conversion Rate',
      description: 'Your conversion rate is below industry average. Consider improving product descriptions and response times.',
      impact: 'high',
      actionable: true
    });
  }

  // Check response time
  if (this.metrics.avgResponseTime > 24) {
    insights.push({
      type: 'recommendation',
      title: 'Improve Response Time',
      description: 'Faster responses lead to higher conversion. Try to respond within 4 hours.',
      impact: 'medium',
      actionable: true
    });
  }

  // Growth opportunities
  const topCategory = this.metrics.categoryPerformance.sort((a, b) => b.revenue - a.revenue)[0];
  if (topCategory) {
    insights.push({
      type: 'opportunity',
      title: 'Focus on Top Category',
      description: `${topCategory.category} shows strong performance. Consider expanding inventory.`,
      impact: 'high',
      actionable: true
    });
  }

  this.insights = insights;
  return insights;
};

export default mongoose.model('Analytics', analyticsSchema);
