const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
  provider: { 
    type: String, 
    enum: ['openai', 'azure', 'anthropic'], 
    required: true 
  },
  service: String, // gpt-4, gpt-3.5-turbo, claude-3, etc
  cost: { 
    type: Number, 
    default: 0 
  },
  tokens: { 
    type: Number, 
    default: 0 
  },
  feature: String, // rfq_generation, supplier_matching, etc
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  error: String,
  responseTime: Number
}, { 
  timestamps: true 
});

aiUsageSchema.index({ provider: 1, createdAt: -1 });
aiUsageSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AIUsage', aiUsageSchema);
