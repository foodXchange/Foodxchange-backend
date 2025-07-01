const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  ipAddress: String,
  userAgent: String,
  isActive: { 
    type: Boolean, 
    default: true 
  },
  lastActive: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true 
});

userSessionSchema.index({ userId: 1, lastActive: -1 });
userSessionSchema.index({ lastActive: -1 });

module.exports = mongoose.model('UserSession', userSessionSchema);
