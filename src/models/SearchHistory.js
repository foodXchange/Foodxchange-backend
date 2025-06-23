// models/SearchHistory.js
const mongoose = require('mongoose');

const searchHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  sessionId: String,
  query: {
    type: String,
    required: true
  },
  filters: {
    category: String,
    certifications: [String],
    priceRange: {
      min: Number,
      max: Number
    },
    location: {
      lat: Number,
      lon: Number,
      radius: Number
    },
    supplier: String,
    availability: {
      inStock: Boolean,
      maxLeadTime: Number
    }
  },
  searchType: {
    type: String,
    enum: ['product', 'supplier', 'project'],
    default: 'product'
  },
  resultCount: {
    type: Number,
    default: 0
  },
  clickedResults: [{
    itemId: String,
    itemType: String,
    position: Number,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  device: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'unknown'],
    default: 'unknown'
  },
  duration: Number // Search duration in ms
}, {
  timestamps: true
});

// Indexes for analytics
searchHistorySchema.index({ createdAt: -1 });
searchHistorySchema.index({ userId: 1, createdAt: -1 });
searchHistorySchema.index({ query: 'text' });

module.exports = mongoose.model('SearchHistory', searchHistorySchema);

// ===================================

// models/SavedSearch.js
const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  searchParams: {
    query: String,
    category: String,
    subcategory: String,
    certifications: [String],
    priceRange: {
      min: Number,
      max: Number
    },
    location: {
      lat: Number,
      lon: Number,
      radius: Number
    },
    supplier: String,
    availability: {
      inStock: Boolean,
      maxLeadTime: Number
    },
    customFilters: mongoose.Schema.Types.Mixed
  },
  notifications: {
    enabled: {
      type: Boolean,
      default: true
    },
    frequency: {
      type: String,
      enum: ['instant', 'daily', 'weekly', 'monthly'],
      default: 'daily'
    },
    lastNotified: Date,
    criteria: {
      newMatches: { type: Boolean, default: true },
      priceDrops: { type: Boolean, default: true },
      backInStock: { type: Boolean, default: false }
    }
  },
  stats: {
    lastRun: Date,
    lastResultCount: Number,
    totalNotificationsSent: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for user's saved searches
savedSearchSchema.index({ userId: 1, isActive: 1 });
savedSearchSchema.index({ 'notifications.enabled': 1, 'notifications.frequency': 1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);

// ===================================

// models/SearchIndex.js
const mongoose = require('mongoose');

const searchIndexSchema = new mongoose.Schema({
  indexName: {
    type: String,
    required: true,
    unique: true
  },
  documentType: {
    type: String,
    enum: ['product', 'supplier', 'project'],
    required: true
  },
  lastIndexed: {
    type: Date,
    default: Date.now
  },
  documentCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['idle', 'indexing', 'error', 'completed'],
    default: 'idle'
  },
  settings: {
    autoIndex: {
      type: Boolean,
      default: true
    },
    indexInterval: {
      type: Number,
      default: 3600000 // 1 hour in ms
    },
    batchSize: {
      type: Number,
      default: 100
    }
  },
  lastError: {
    message: String,
    timestamp: Date,
    documentId: String
  },
  stats: {
    totalIndexed: {
      type: Number,
      default: 0
    },
    totalErrors: {
      type: Number,
      default: 0
    },
    averageIndexTime: Number
  }
}, {
  timestamps: true
});

// Methods
searchIndexSchema.methods.updateStatus = function(status, error = null) {
  this.status = status;
  if (error) {
    this.lastError = {
      message: error.message,
      timestamp: new Date(),
      documentId: error.documentId
    };
    this.stats.totalErrors++;
  }
  return this.save();
};

searchIndexSchema.methods.recordIndexing = function(count, duration) {
  this.lastIndexed = new Date();
  this.documentCount = count;
  this.stats.totalIndexed += count;
  
  // Calculate average index time
  if (this.stats.averageIndexTime) {
    this.stats.averageIndexTime = (this.stats.averageIndexTime + duration) / 2;
  } else {
    this.stats.averageIndexTime = duration;
  }
  
  return this.save();
};

module.exports = mongoose.model('SearchIndex', searchIndexSchema);