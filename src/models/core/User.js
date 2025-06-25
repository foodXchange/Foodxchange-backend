const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Authentication
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: String,
  tempPassword: String,
  mustChangePassword: { type: Boolean, default: true },
  
  // Personal Information
  profile: {
    firstName: String,
    lastName: String,
    fullName: String, // Computed or provided
    jobTitle: String,
    department: String,
    avatar: String // Azure CDN URL
  },
  
  // Contact Information
  contact: {
    phone: String,
    mobile: String,
    officePhone: String,
    workEmail: String, // Different from login email if needed
    linkedIn: String,
    timezone: { type: String, default: 'UTC' }
  },
  
  // Role & Permissions
  role: { 
    type: String, 
    enum: ['buyer', 'supplier', 'admin', 'agent', 'contractor', 'super_admin'],
    required: true,
    index: true
  },
  permissions: [{
    module: String, // 'products', 'orders', 'rfqs', etc.
    actions: [String] // 'read', 'write', 'delete', 'approve'
  }],
  
  // Company Association
  company: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company',
    required: true,
    index: true
  },
  
  // User Preferences
  preferences: {
    language: { type: String, default: 'en' },
    currency: { type: String, default: 'USD' },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true }
    },
    dashboard: {
      layout: String,
      widgets: [String],
      defaultView: String
    }
  },
  
  // Security & Sessions
  security: {
    lastLogin: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    passwordChangedAt: Date,
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: String,
    sessions: [{
      token: String,
      createdAt: Date,
      lastUsed: Date,
      userAgent: String,
      ipAddress: String,
      isActive: Boolean
    }]
  },
  
  // Activity Tracking
  activity: {
    lastActivityAt: Date,
    loginCount: { type: Number, default: 0 },
    pageViews: { type: Number, default: 0 },
    actionsPerformed: { type: Number, default: 0 }
  },
  
  // Status & Verification
  status: {
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationExpires: Date
  },
  
  // Original Data Preservation
  originalData: {
    contactId: String,
    supplierContactId: String,
    buyerContactId: String,
    source: String,
    importedAt: Date,
    rawData: mongoose.Schema.Types.Mixed
  },
  
  // Comments & Notes
  comments: [{
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['note', 'issue', 'feedback'] },
    isInternal: Boolean,
    createdAt: { type: Date, default: Date.now }
  }]
}, { 
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.tempPassword;
      delete ret.security.twoFactorSecret;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  if (this.profile?.fullName) return this.profile.fullName;
  return `${this.profile?.firstName || ''} ${this.profile?.lastName || ''}`.trim();
});

// Virtual for account locked status
userSchema.virtual('isLocked').get(function() {
  return !!(this.security?.lockUntil && this.security.lockUntil > Date.now());
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') && !this.isModified('tempPassword')) return next();
  
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 12);
    this.security.passwordChangedAt = new Date();
  }
  
  if (this.isModified('tempPassword') && this.tempPassword) {
    this.tempPassword = await bcrypt.hash(this.tempPassword, 12);
  }
  
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Compare temporary password method
userSchema.methods.compareTempPassword = async function(candidatePassword) {
  if (!this.tempPassword) return false;
  return await bcrypt.compare(candidatePassword, this.tempPassword);
};

// Increment login attempts
userSchema.methods.incLoginAttempts = function() {
  if (this.security.lockUntil && this.security.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'security.loginAttempts': 1, 'security.lockUntil': 1 }
    });
  }
  
  const updates = { $inc: { 'security.loginAttempts': 1 } };
  
  if (this.security.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { 'security.lockUntil': Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Update last activity
userSchema.methods.updateActivity = function() {
  return this.updateOne({
    'activity.lastActivityAt': new Date(),
    $inc: { 'activity.actionsPerformed': 1 }
  });
};

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1, 'status.isActive': 1 });
userSchema.index({ company: 1 });
userSchema.index({ 'originalData.contactId': 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
