import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'buyer' | 'seller' | 'admin' | 'contractor' | 'agent';
  avatar?: string;
  bio?: string;
  
  // Company and verification
  company?: mongoose.Types.ObjectId;
  companyVerified: boolean;
  isEmailVerified: boolean;
  emailVerifiedAt?: Date;
  
  // Progressive profiling
  onboardingStep: 'email-verification' | 'company-details' | 'profile-completion' | 'completed';
  profileCompletionPercentage: number;
  
  // Security and authentication
  accountStatus: 'active' | 'inactive' | 'locked' | 'suspended';
  failedLoginAttempts: number;
  lastFailedLoginAt?: Date;
  accountLockedAt?: Date;
  lastLoginAt?: Date;
  loginCount: number;
  refreshToken?: string;
  tokenVersion?: number;
  
  // Multi-tenant and Azure B2C fields
  azureB2CId?: string;
  azureB2CTenantId?: string;
  displayName?: string;
  authProvider?: 'local' | 'azure-b2c' | 'google' | 'microsoft';
  emailVerified?: boolean;
  
  // Password reset
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  
  // Verification documents
  verificationDocuments: Array<{
    type: string;
    url: string;
    uploadedAt: Date;
    verified: boolean;
  }>;
  
  // Preferences
  preferences: {
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
    language: string;
    timezone: string;
  };
  
  // Terms acceptance
  acceptedTermsAt?: Date;
  termsVersion?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  calculateProfileCompletion(): number;
  getNextOnboardingStep(): string;
  isAccountLocked(): boolean;
  fullName: string;
}

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  phone: {
    type: String,
    trim: true,
    match: [/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number']
  },
  role: {
    type: String,
    enum: {
      values: ['buyer', 'seller', 'admin', 'contractor', 'agent'],
      message: 'Role must be one of: buyer, seller, admin, contractor, agent'
    },
    required: [true, 'Role is required']
  },
  avatar: {
    type: String,
    match: [/^https?:\/\//, 'Avatar must be a valid URL']
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },
  
  // Company and verification
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  companyVerified: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerifiedAt: Date,
  
  // Progressive profiling
  onboardingStep: {
    type: String,
    enum: ['email-verification', 'company-details', 'profile-completion', 'completed'],
    default: 'email-verification'
  },
  profileCompletionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Security and authentication
  accountStatus: {
    type: String,
    enum: ['active', 'inactive', 'locked', 'suspended'],
    default: 'active'
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
    min: 0
  },
  lastFailedLoginAt: Date,
  accountLockedAt: Date,
  lastLoginAt: Date,
  loginCount: {
    type: Number,
    default: 0,
    min: 0
  },
  refreshToken: String,
  tokenVersion: {
    type: Number,
    default: 0
  },
  
  // Multi-tenant and Azure B2C fields
  azureB2CId: String,
  azureB2CTenantId: String,
  displayName: String,
  authProvider: {
    type: String,
    enum: ['local', 'azure-b2c', 'google', 'microsoft'],
    default: 'local'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  
  // Password reset
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Verification documents
  verificationDocuments: [{
    type: {
      type: String,
      required: true,
      enum: ['business_license', 'tax_certificate', 'insurance', 'certification', 'other']
    },
    url: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    verified: {
      type: Boolean,
      default: false
    }
  }],
  
  // Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    },
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' }
  },
  
  // Terms acceptance
  acceptedTermsAt: Date,
  termsVersion: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ accountStatus: 1 });
userSchema.index({ company: 1 });
userSchema.index({ lastLoginAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Update profile completion percentage before saving
userSchema.pre('save', function(next) {
  this.profileCompletionPercentage = this.calculateProfileCompletion();
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Calculate profile completion percentage
userSchema.methods.calculateProfileCompletion = function(): number {
  const fields = [
    'firstName', 'lastName', 'email', 'phone', 'bio', 'avatar',
    'company', 'isEmailVerified', 'companyVerified'
  ];
  
  let completed = 0;
  const total = fields.length;
  
  fields.forEach(field => {
    if (this[field]) {
      completed++;
    }
  });
  
  return Math.round((completed / total) * 100);
};

// Get next onboarding step
userSchema.methods.getNextOnboardingStep = function(): string {
  if (!this.isEmailVerified) return 'email-verification';
  if (!this.company) return 'company-details';
  if (this.profileCompletionPercentage < 80) return 'profile-completion';
  return 'completed';
};

// Check if account is locked
userSchema.methods.isAccountLocked = function(): boolean {
  return this.accountStatus === 'locked' || 
         (this.accountLockedAt && this.accountLockedAt > new Date());
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.refreshToken;
  delete user.passwordResetToken;
  return user;
};

export const User = mongoose.model<IUser>('User', userSchema);
