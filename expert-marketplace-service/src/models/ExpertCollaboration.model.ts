import { Schema, model } from 'mongoose';
import { IExpertCollaboration } from '../interfaces/expert.interface';

const milestoneSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  dueDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'submitted', 'approved', 'rejected'],
    default: 'pending'
  },
  completedAt: { type: Date }
}, { _id: true });

const timeTrackingSchema = new Schema({
  date: { type: Date, required: true },
  hours: { type: Number, required: true, min: 0, max: 24 },
  description: { type: String, required: true },
  approved: { type: Boolean, default: false }
}, { _id: true });

const documentSchema = new Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, required: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const expertCollaborationSchema = new Schema<IExpertCollaboration>({
  expertId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertProfile',
    required: true,
    index: true
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  serviceId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertService'
  },
  rfqId: {
    type: Schema.Types.ObjectId,
    ref: 'RFQ'
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'disputed'],
    default: 'requested',
    index: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date
  },
  actualEndDate: {
    type: Date
  },
  budget: {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'USD' },
    type: { type: String, enum: ['fixed', 'hourly'], required: true }
  },
  milestones: [milestoneSchema],
  timeTracking: [timeTrackingSchema],
  totalHoursWorked: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  platformFee: {
    type: Number,
    default: 0,
    min: 0
  },
  messages: [{
    type: Schema.Types.ObjectId,
    ref: 'Message'
  }],
  documents: [documentSchema],
  review: {
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  disputeReason: {
    type: String
  },
  disputeResolution: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
expertCollaborationSchema.index({ status: 1, startDate: -1 });
expertCollaborationSchema.index({ 'milestones.status': 1 });
expertCollaborationSchema.index({ 'milestones.dueDate': 1 });
expertCollaborationSchema.index({ createdAt: -1 });

// Virtual for progress percentage
expertCollaborationSchema.virtual('progressPercentage').get(function() {
  if (!this.milestones || this.milestones.length === 0) {
    return 0;
  }
  
  const completedMilestones = this.milestones.filter(m => 
    m.status === 'approved'
  ).length;
  
  return Math.round((completedMilestones / this.milestones.length) * 100);
});

// Virtual for remaining budget
expertCollaborationSchema.virtual('remainingBudget').get(function() {
  if (this.budget.type === 'fixed') {
    return this.budget.amount - this.totalAmountPaid;
  }
  return null; // Not applicable for hourly
});

// Virtual for approved hours
expertCollaborationSchema.virtual('approvedHours').get(function() {
  return this.timeTracking
    .filter(t => t.approved)
    .reduce((sum, t) => sum + t.hours, 0);
});

// Pre-save middleware
expertCollaborationSchema.pre('save', function(next) {
  // Calculate total hours worked
  if (this.isModified('timeTracking')) {
    this.totalHoursWorked = this.timeTracking.reduce((sum, t) => sum + t.hours, 0);
  }

  // Validate dates
  if (this.endDate && this.startDate > this.endDate) {
    next(new Error('End date must be after start date'));
    return;
  }

  // Auto-update status based on milestones
  if (this.milestones && this.milestones.length > 0) {
    const allApproved = this.milestones.every(m => m.status === 'approved');
    if (allApproved && this.status === 'in_progress') {
      this.status = 'completed';
      this.actualEndDate = new Date();
    }
  }

  next();
});

// Method to calculate platform fee
expertCollaborationSchema.methods.calculatePlatformFee = function(amount: number, feePercentage: number) {
  return amount * (feePercentage / 100);
};

// Method to add time tracking entry
expertCollaborationSchema.methods.addTimeEntry = async function(
  date: Date, 
  hours: number, 
  description: string
) {
  this.timeTracking.push({
    date,
    hours,
    description,
    approved: false
  });
  
  await this.save();
};

// Method to approve time entry
expertCollaborationSchema.methods.approveTimeEntry = async function(entryId: string) {
  const entry = this.timeTracking.id(entryId);
  if (entry) {
    entry.approved = true;
    await this.save();
  }
};

export const ExpertCollaboration = model<IExpertCollaboration>('ExpertCollaboration', expertCollaborationSchema);