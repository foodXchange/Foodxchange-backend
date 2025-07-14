// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\models\compliance\ComplianceValidation.ts

import mongoose, { Document, Schema, Model } from 'mongoose';

// TypeScript Interfaces
interface ValidationDetail {
  specification: string;
  value: any;
  status: 'PASSED' | 'FAILED' | 'WARNING';
  message?: string;
  isValid: boolean;
}

interface ValidationResult {
  isValid: boolean;
  message: string;
  details: ValidationDetail[];
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

interface ValidatedBy {
  system: boolean;
  expert?: mongoose.Types.ObjectId;
  timestamp: Date;
}

interface ApprovalStatus {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REQUIRES_REVIEW';
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  reviewNotes?: string;
}

// Document Interface
export interface IComplianceValidation extends Document {
  // Product information
  productType: 'cornflakes' | 'snacks' | 'beverages' | 'dairy' | 'meat' | 'seafood' | 'bakery' | 'other';
  productName?: string;
  
  // Specifications being validated
  specifications: Map<string, any>;
  
  // Target market for compliance
  targetMarket: 'US' | 'EU' | 'UK' | 'CA' | 'AU' | 'JP' | 'OTHER';
  
  // Validation results
  validationResult: ValidationResult;
  
  // Risk assessment
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Compliance tags for easy filtering
  complianceTags: Array<'FDA_APPROVED' | 'EU_COMPLIANT' | 'ORGANIC' | 'NON_GMO' | 'ALLERGEN_FREE' | 'KOSHER' | 'HALAL' | 'RECALL_RISK' | 'MANUAL_REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED'>;
  
  // User and project information
  userId?: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  
  // Audit trail
  validatedBy: ValidatedBy;
  
  // Approval workflow
  approvalStatus: ApprovalStatus;
  
  // Timestamps
  timestamp: Date;
  expiresAt: Date;
  
  // Virtuals
  daysUntilExpiration: number | null;
}

// Model Interface
interface IComplianceValidationModel extends Model<IComplianceValidation> {
  getValidationStats(filter?: any): Promise<Array<{
    _id: null;
    total: number;
    valid: number;
    invalid: number;
    critical: number;
  }>>;
  
  getProductTypeStats(days?: number): Promise<Array<{
    _id: string;
    total: number;
    valid: number;
    avgRiskLevel: number;
  }>>;
}

// Schema Definition
const complianceValidationSchema = new Schema<IComplianceValidation>({
  // Product information
  productType: {
    type: String,
    required: true,
    enum: ['cornflakes', 'snacks', 'beverages', 'dairy', 'meat', 'seafood', 'bakery', 'other'],
    index: true
  },
  
  productName: {
    type: String,
    trim: true
  },

  // Specifications being validated
  specifications: {
    type: Map,
    of: Schema.Types.Mixed,
    required: true
  },

  // Target market for compliance
  targetMarket: {
    type: String,
    required: true,
    enum: ['US', 'EU', 'UK', 'CA', 'AU', 'JP', 'OTHER'],
    default: 'US'
  },

  // Validation results
  validationResult: {
    isValid: {
      type: Boolean,
      required: true,
      index: true
    },
    message: {
      type: String,
      required: true
    },
    details: [{
      specification: String,
      value: Schema.Types.Mixed,
      status: {
        type: String,
        enum: ['PASSED', 'FAILED', 'WARNING']
      },
      message: String,
      isValid: Boolean
    }],
    errors: [String],
    warnings: [String],
    recommendations: [String]
  },

  // Risk assessment
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: function(this: IComplianceValidation) {
      if (!this.validationResult.isValid) {
        // Check for critical errors (like cornflake color)
        const hasCriticalError = this.validationResult.errors.some(error => 
          error.includes('CRITICAL') || error.includes('recall')
        );
        return hasCriticalError ? 'CRITICAL' : 'HIGH';
      }
      return this.validationResult.warnings.length > 0 ? 'MEDIUM' : 'LOW';
    }
  },

  // Compliance tags for easy filtering
  complianceTags: [{
    type: String,
    enum: [
      'FDA_APPROVED', 'EU_COMPLIANT', 'ORGANIC', 'NON_GMO', 
      'ALLERGEN_FREE', 'KOSHER', 'HALAL', 'RECALL_RISK',
      'MANUAL_REVIEW_REQUIRED', 'APPROVED', 'REJECTED'
    ]
  }],

  // User and project information
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    index: true
  },

  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'RFQ'
  },

  // Audit trail
  validatedBy: {
    system: {
      type: Boolean,
      default: true
    },
    expert: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },

  // Approval workflow
  approvalStatus: {
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'REQUIRES_REVIEW'],
      default: function(this: IComplianceValidation) {
        return this.validationResult.isValid ? 'APPROVED' : 'REQUIRES_REVIEW';
      }
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    rejectionReason: String,
    reviewNotes: String
  },

  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },

  expiresAt: {
    type: Date,
    default: function() {
      // Validation results expire after 90 days
      return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    },
    index: { expireAfterSeconds: 0 }
  }

}, {
  timestamps: true,
  versionKey: false
});

// Indexes for performance
complianceValidationSchema.index({ productType: 1, targetMarket: 1 });
complianceValidationSchema.index({ 'validationResult.isValid': 1, timestamp: -1 });
complianceValidationSchema.index({ riskLevel: 1, timestamp: -1 });
complianceValidationSchema.index({ complianceTags: 1 });

// Virtual for days until expiration
complianceValidationSchema.virtual('daysUntilExpiration').get(function(this: IComplianceValidation) {
  if (!this.expiresAt) return null;
  const diffTime = this.expiresAt.getTime() - new Date().getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to set compliance tags
complianceValidationSchema.pre<IComplianceValidation>('save', function(next) {
  // Auto-set compliance tags based on validation results
  const tags: string[] = [];

  if (this.validationResult.isValid) {
    tags.push('APPROVED');
  } else {
    tags.push('REJECTED');
    
    // Check for recall risk
    const hasRecallRisk = this.validationResult.errors.some(error => 
      error.toLowerCase().includes('recall') || 
      error.toLowerCase().includes('critical')
    );
    
    if (hasRecallRisk) {
      tags.push('RECALL_RISK');
    }
  }

  // Check for manual review requirements
  if (this.validationResult.warnings.length > 0 || 
      this.validationResult.recommendations.some(rec => rec.includes('manual review'))) {
    tags.push('MANUAL_REVIEW_REQUIRED');
  }

  // Set allergen-related tags
  if (this.specifications.get('allergens')) {
    const allergens = this.specifications.get('allergens');
    if (Array.isArray(allergens) && allergens.length === 0) {
      tags.push('ALLERGEN_FREE');
    }
  }

  this.complianceTags = [...new Set(tags)] as any; // Remove duplicates
  next();
});

// Static methods
complianceValidationSchema.statics.getValidationStats = function(filter = {}) {
  return this.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        valid: { $sum: { $cond: ['$validationResult.isValid', 1, 0] } },
        invalid: { $sum: { $cond: ['$validationResult.isValid', 0, 1] } },
        critical: { $sum: { $cond: [{ $eq: ['$riskLevel', 'CRITICAL'] }, 1, 0] } }
      }
    }
  ]);
};

complianceValidationSchema.statics.getProductTypeStats = function(days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    { $match: { timestamp: { $gte: startDate } } },
    {
      $group: {
        _id: '$productType',
        total: { $sum: 1 },
        valid: { $sum: { $cond: ['$validationResult.isValid', 1, 0] } },
        avgRiskLevel: { $avg: { 
          $switch: {
            branches: [
              { case: { $eq: ['$riskLevel', 'LOW'] }, then: 1 },
              { case: { $eq: ['$riskLevel', 'MEDIUM'] }, then: 2 },
              { case: { $eq: ['$riskLevel', 'HIGH'] }, then: 3 },
              { case: { $eq: ['$riskLevel', 'CRITICAL'] }, then: 4 }
            ],
            default: 1
          }
        }}
      }
    },
    { $sort: { total: -1 } }
  ]);
};

// Create and export the model
export const ComplianceValidation = mongoose.model<IComplianceValidation, IComplianceValidationModel>(
  'ComplianceValidation', 
  complianceValidationSchema
);