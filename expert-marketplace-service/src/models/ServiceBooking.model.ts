import { Schema, model } from 'mongoose';
import { IServiceBooking } from '../interfaces/expert.interface';

const serviceBookingSchema = new Schema<IServiceBooking>({
  serviceId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertService',
    required: true,
    index: true
  },
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
  collaborationId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertCollaboration'
  },
  scheduledDate: {
    type: Date,
    required: true,
    index: true
  },
  duration: {
    type: Number,
    required: true,
    min: 15,
    max: 480 // 8 hours max
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'],
    default: 'pending',
    index: true
  },
  meetingUrl: {
    type: String
  },
  notes: {
    type: String,
    maxlength: 1000
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  cancellationReason: {
    type: String,
    maxlength: 500
  },
  cancelledBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
serviceBookingSchema.index({ scheduledDate: 1, status: 1 });
serviceBookingSchema.index({ expertId: 1, scheduledDate: 1 });
serviceBookingSchema.index({ clientId: 1, scheduledDate: 1 });
serviceBookingSchema.index({ status: 1, reminderSent: 1 });

// Virtual for end time
serviceBookingSchema.virtual('endTime').get(function() {
  return new Date(this.scheduledDate.getTime() + this.duration * 60000);
});

// Virtual for is upcoming
serviceBookingSchema.virtual('isUpcoming').get(function() {
  return this.scheduledDate > new Date() && this.status === 'confirmed';
});

// Virtual for is past due
serviceBookingSchema.virtual('isPastDue').get(function() {
  return this.scheduledDate < new Date() && this.status === 'confirmed';
});

// Pre-save middleware
serviceBookingSchema.pre('save', function(next) {
  // Validate scheduled date is in the future for new bookings
  if (this.isNew && this.scheduledDate <= new Date()) {
    next(new Error('Scheduled date must be in the future'));
    return;
  }

  // Set completed date when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }

  // Set cancelled date when status changes to cancelled
  if (this.isModified('status') && this.status === 'cancelled' && !this.cancelledAt) {
    this.cancelledAt = new Date();
  }

  next();
});

// Method to confirm booking
serviceBookingSchema.methods.confirm = async function(meetingUrl?: string) {
  this.status = 'confirmed';
  if (meetingUrl) {
    this.meetingUrl = meetingUrl;
  }
  await this.save();
};

// Method to cancel booking
serviceBookingSchema.methods.cancel = async function(reason: string, cancelledBy: string) {
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledBy = cancelledBy;
  this.cancelledAt = new Date();
  await this.save();
};

// Method to mark as completed
serviceBookingSchema.methods.complete = async function() {
  this.status = 'completed';
  this.completedAt = new Date();
  await this.save();
};

// Method to mark as no show
serviceBookingSchema.methods.markNoShow = async function() {
  this.status = 'no_show';
  await this.save();
};

// Method to send reminder
serviceBookingSchema.methods.markReminderSent = async function() {
  this.reminderSent = true;
  await this.save();
};

// Static method to find bookings needing reminders
serviceBookingSchema.statics.findBookingsNeedingReminders = async function(hoursBeforeBooking: number = 24) {
  const reminderTime = new Date();
  reminderTime.setHours(reminderTime.getHours() + hoursBeforeBooking);

  return this.find({
    status: 'confirmed',
    reminderSent: false,
    scheduledDate: {
      $gte: new Date(),
      $lte: reminderTime
    }
  }).populate('expertId clientId serviceId');
};

// Static method to find and update past due bookings
serviceBookingSchema.statics.updatePastDueBookings = async function() {
  const now = new Date();
  
  // Find confirmed bookings that are past their scheduled time
  const pastDueBookings = await this.find({
    status: 'confirmed',
    scheduledDate: { $lt: now }
  });

  // Update them to no_show if they're more than 30 minutes past due
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60000);
  
  for (const booking of pastDueBookings) {
    if (booking.endTime < thirtyMinutesAgo) {
      booking.status = 'no_show';
      await booking.save();
    }
  }

  return pastDueBookings.length;
};

export const ServiceBooking = model<IServiceBooking>('ServiceBooking', serviceBookingSchema);