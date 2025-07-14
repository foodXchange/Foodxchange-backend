// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\src\models\marketplace\SampleRequest.ts

import mongoose, { Schema, Model, Types } from 'mongoose';
import {
  SampleRequestDocument,
  Address,
  ShippingInfo,
  SampleCost,
  SampleFeedback,
  SampleCommunication,
  SampleRequestStatus,
  Priority,
  BusinessType,
  OrderFrequency,
  ShippingMethod,
  PaymentStatus,
  CommunicationSenderType
} from '@/types/marketplace';

// Address Schema
const addressSchema = new Schema<Address>({
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, required: true },
  companyName: { type: String },
  contactPerson: { type: String },
  phone: { type: String },
  additionalInstructions: { type: String }
}, { _id: false });

// Shipping Information Schema
const shippingInfoSchema = new Schema<ShippingInfo>({
  method: { 
    type: String, 
    enum: ['standard', 'express', 'overnight', 'courier'] as ShippingMethod[], 
    default: 'standard' 
  },
  cost: { type: Number, default: 0 },
  estimatedDays: { type: Number, default: 5 },
  carrier: { type: String },
  trackingNumber: { type: String },
  trackingUrl: { type: String },
  shippedDate: { type: Date },
  deliveredDate: { type: Date },
  signedBy: { type: String }
}, { _id: false });

// Sample Cost Schema
const sampleCostSchema = new Schema<SampleCost>({
  amount: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  shippingCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  paymentStatus: { 
    type: String, 
    enum: ['free', 'pending', 'paid', 'refunded'] as PaymentStatus[], 
    default: 'free' 
  },
  paymentMethod: { type: String },
  paymentDate: { type: Date }
}, { _id: false });

// Sample Feedback Schema
const sampleFeedbackSchema = new Schema<SampleFeedback>({
  rating: { type: Number, min: 1, max: 5, required: true },
  qualityRating: { type: Number, min: 1, max: 5, required: true },
  packagingRating: { type: Number, min: 1, max: 5, required: true },
  overallSatisfaction: { type: Number, min: 1, max: 5, required: true },
  comments: { type: String, required: true },
  wouldOrder: { type: Boolean, required: true },
  suggestedImprovements: { type: String },
  submittedAt: { type: Date, required: true }
}, { _id: false });

// Sample Communication Schema
const sampleCommunicationSchema = new Schema<SampleCommunication>({
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderType: { 
    type: String, 
    enum: ['buyer', 'supplier', 'system'] as CommunicationSenderType[], 
    required: true 
  },
  message: { type: String, required: true },
  attachments: [{
    filename: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true }
  }],
  timestamp: { type: Date, default: Date.now },
  isInternal: { type: Boolean, default: false }
}, { _id: false });

// Sample Request Schema
const sampleRequestSchema = new Schema<SampleRequestDocument>({
  // Request Identification
  requestNumber: { 
    type: String, 
    unique: true, 
    required: true 
  },
  
  // Related Entities
  productId: { 
    type: Schema.Types.ObjectId, 
    ref: 'ProductEnhanced', 
    required: true 
  },
  buyerId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  supplierId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  companyId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Company', 
    required: true 
  },
  
  // Request Status
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'preparing', 'shipped', 'delivered', 'completed', 'cancelled'] as SampleRequestStatus[], 
    default: 'pending' 
  },
  
  // Request Details
  sampleQuantity: { type: String, required: true },
  intendedUse: { type: String, required: true },
  estimatedVolume: { type: String, required: true },
  timeframe: { type: String, required: true },
  additionalNotes: { type: String },
  
  // Business Information
  businessType: {
    type: String,
    enum: ['retailer', 'distributor', 'manufacturer', 'restaurant', 'catering', 'export', 'other'] as BusinessType[],
    required: true
  },
  targetMarket: { type: String },
  expectedOrderFrequency: {
    type: String,
    enum: ['weekly', 'monthly', 'quarterly', 'annually', 'one-time'] as OrderFrequency[]
  },
  
  // Shipping Information
  shippingAddress: { type: addressSchema, required: true },
  shippingInfo: shippingInfoSchema,
  
  // Sample Details
  sampleSpecs: {
    packaging: { type: String },
    labeling: { type: String },
    specialRequirements: { type: String },
    storageInstructions: { type: String }
  },
  
  // Evaluation and Feedback
  evaluationCriteria: [{ type: String }],
  evaluationDeadline: { type: Date },
  feedback: sampleFeedbackSchema,
  
  // Communication Thread
  communications: [sampleCommunicationSchema],
  
  // Cost and Payment
  sampleCost: sampleCostSchema,
  
  // Compliance and Documentation
  regulatoryRequirements: [{ type: String }],
  requiredDocuments: [{
    name: { type: String },
    status: { type: String, enum: ['pending', 'provided', 'approved'] },
    url: { type: String },
    uploadedAt: { type: Date }
  }],
  
  // Follow-up Actions
  followUpActions: [{
    action: { type: String },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    dueDate: { type: Date },
    status: { type: String, enum: ['pending', 'completed', 'overdue'], default: 'pending' },
    completedAt: { type: Date },
    notes: { type: String }
  }],
  
  // Analytics and Performance
  responseTime: { type: Number }, // Hours from request to approval
  deliveryTime: { type: Number }, // Days from approval to delivery
  conversionToOrder: { type: Boolean, default: false },
  orderValue: { type: Number },
  
  // Important Dates
  requestDate: { type: Date, default: Date.now },
  approvedDate: { type: Date },
  rejectedDate: { type: Date },
  shippedDate: { type: Date },
  deliveredDate: { type: Date },
  completedDate: { type: Date },
  
  // Metadata
  priority: { 
    type: String, 
    enum: ['low', 'normal', 'high', 'urgent'] as Priority[], 
    default: 'normal' 
  },
  tags: [{ type: String }],
  internalNotes: { type: String }
}, {
  timestamps: true
});

// Indexes for performance
sampleRequestSchema.index({ requestNumber: 1 });
sampleRequestSchema.index({ productId: 1, buyerId: 1 });
sampleRequestSchema.index({ supplierId: 1, status: 1 });
sampleRequestSchema.index({ status: 1, createdAt: -1 });
sampleRequestSchema.index({ 'shippingInfo.trackingNumber': 1 });
sampleRequestSchema.index({ requestDate: -1 });

// Pre-save middleware to generate request number
sampleRequestSchema.pre('save', async function(this: SampleRequestDocument, next) {
  if (this.isNew && !this.requestNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Count existing requests for today
    const todayStart = new Date(year, date.getMonth(), date.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    
    const count = await (this.constructor as SampleRequestModel).countDocuments({
      createdAt: { $gte: todayStart, $lt: todayEnd }
    });
    
    const sequence = String(count + 1).padStart(4, '0');
    this.requestNumber = `SR-${year}${month}${day}-${sequence}`;
  }
  
  this.updatedAt = new Date();
  next();
});

// Instance methods
sampleRequestSchema.methods.updateStatus = function(
  this: SampleRequestDocument,
  newStatus: SampleRequestStatus, 
  userId: string, 
  notes?: string
): Promise<SampleRequestDocument> {
  const oldStatus = this.status;
  this.status = newStatus;
  
  // Set appropriate dates based on status
  const now = new Date();
  switch (newStatus) {
    case 'approved':
      this.approvedDate = now;
      if (this.requestDate) {
        this.responseTime = Math.round((now.getTime() - this.requestDate.getTime()) / (1000 * 60 * 60)); // hours
      }
      break;
    case 'rejected':
      this.rejectedDate = now;
      break;
    case 'shipped':
      this.shippedDate = now;
      break;
    case 'delivered':
      this.deliveredDate = now;
      if (this.shippedDate) {
        this.deliveryTime = Math.round((now.getTime() - this.shippedDate.getTime()) / (1000 * 60 * 60 * 24)); // days
      }
      break;
    case 'completed':
      this.completedDate = now;
      break;
  }
  
  // Add communication entry for status change
  this.communications.push({
    senderId: new Types.ObjectId(userId),
    senderType: 'system',
    message: `Status changed from ${oldStatus} to ${newStatus}${notes ? ': ' + notes : ''}`,
    timestamp: now,
    isInternal: false
  });
  
  return this.save();
};

sampleRequestSchema.methods.addCommunication = function(
  this: SampleRequestDocument,
  senderId: string, 
  senderType: CommunicationSenderType, 
  message: string, 
  attachments: any[] = []
): Promise<SampleRequestDocument> {
  this.communications.push({
    senderId: new Types.ObjectId(senderId),
    senderType,
    message,
    attachments,
    timestamp: new Date(),
    isInternal: false
  });
  
  return this.save();
};

sampleRequestSchema.methods.submitFeedback = function(
  this: SampleRequestDocument,
  feedbackData: Partial<SampleFeedback>
): Promise<SampleRequestDocument> {
  this.feedback = {
    ...feedbackData as SampleFeedback,
    submittedAt: new Date()
  };
  
  this.status = 'completed';
  this.completedDate = new Date();
  
  return this.save();
};

sampleRequestSchema.methods.updateShipping = function(
  this: SampleRequestDocument,
  shippingData: Partial<ShippingInfo>
): Promise<SampleRequestDocument> {
  this.shippingInfo = { ...this.shippingInfo, ...shippingData } as ShippingInfo;
  
  if (shippingData.trackingNumber && this.status === 'preparing') {
    this.status = 'shipped';
    this.shippedDate = new Date();
  }
  
  return this.save();
};

// Static methods interface
interface SampleRequestModel extends Model<SampleRequestDocument> {
  findBySupplier(supplierId: string, status?: SampleRequestStatus): Promise<SampleRequestDocument[]>;
  findByBuyer(buyerId: string, status?: SampleRequestStatus): Promise<SampleRequestDocument[]>;
  getPendingRequests(supplierId?: string): Promise<SampleRequestDocument[]>;
  getPerformanceMetrics(supplierId: string, dateRange?: { start?: string; end?: string }): Promise<any[]>;
}

// Static methods
sampleRequestSchema.statics.findBySupplier = function(
  this: SampleRequestModel,
  supplierId: string, 
  status?: SampleRequestStatus
): Promise<SampleRequestDocument[]> {
  const query: any = { supplierId };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('productId', 'name category images')
    .populate('buyerId', 'name email company')
    .sort({ createdAt: -1 });
};

sampleRequestSchema.statics.findByBuyer = function(
  this: SampleRequestModel,
  buyerId: string, 
  status?: SampleRequestStatus
): Promise<SampleRequestDocument[]> {
  const query: any = { buyerId };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('productId', 'name category images supplier')
    .populate('supplierId', 'name email company')
    .sort({ createdAt: -1 });
};

sampleRequestSchema.statics.getPendingRequests = function(
  this: SampleRequestModel,
  supplierId?: string
): Promise<SampleRequestDocument[]> {
  const query: any = { status: 'pending' };
  if (supplierId) query.supplierId = supplierId;
  
  return this.find(query)
    .populate('productId', 'name category')
    .populate('buyerId', 'name email company')
    .sort({ priority: -1, createdAt: 1 });
};

sampleRequestSchema.statics.getPerformanceMetrics = function(
  this: SampleRequestModel,
  supplierId: string, 
  dateRange: { start?: string; end?: string } = {}
): Promise<any[]> {
  const matchQuery: any = { supplierId };
  
  if (dateRange.start || dateRange.end) {
    matchQuery.createdAt = {};
    if (dateRange.start) matchQuery.createdAt.$gte = new Date(dateRange.start);
    if (dateRange.end) matchQuery.createdAt.$lte = new Date(dateRange.end);
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        approvedRequests: { 
          $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } 
        },
        completedRequests: { 
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } 
        },
        averageResponseTime: { $avg: '$responseTime' },
        averageDeliveryTime: { $avg: '$deliveryTime' },
        conversionRate: { 
          $avg: { $cond: ['$conversionToOrder', 1, 0] } 
        }
      }
    }
  ]);
};

// Create and export the model
const SampleRequest = mongoose.model<SampleRequestDocument, SampleRequestModel>('SampleRequest', sampleRequestSchema);

export default SampleRequest;
export { SampleRequest, SampleRequestModel };