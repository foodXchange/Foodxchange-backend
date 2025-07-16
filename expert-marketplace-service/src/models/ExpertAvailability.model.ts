import { Schema, model } from 'mongoose';
import { IExpertAvailability } from '../interfaces/expert.interface';

const slotSchema = new Schema({
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  isBooked: { type: Boolean, default: false },
  bookingId: { type: Schema.Types.ObjectId, ref: 'ServiceBooking' }
}, { _id: true });

const expertAvailabilitySchema = new Schema<IExpertAvailability>({
  expertId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertProfile',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  slots: [slotSchema],
  isAvailable: {
    type: Boolean,
    default: true,
    index: true
  },
  reason: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
expertAvailabilitySchema.index({ expertId: 1, date: 1 }, { unique: true });
expertAvailabilitySchema.index({ 'slots.isBooked': 1 });
expertAvailabilitySchema.index({ date: 1, isAvailable: 1 });

// Virtual for available slots count
expertAvailabilitySchema.virtual('availableSlots').get(function() {
  return this.slots.filter(slot => !slot.isBooked).length;
});

// Virtual for booked slots count
expertAvailabilitySchema.virtual('bookedSlots').get(function() {
  return this.slots.filter(slot => slot.isBooked).length;
});

// Virtual for utilization rate
expertAvailabilitySchema.virtual('utilizationRate').get(function() {
  if (this.slots.length === 0) return 0;
  return (this.bookedSlots / this.slots.length) * 100;
});

// Pre-save middleware
expertAvailabilitySchema.pre('save', function(next) {
  // Validate slot times
  for (let i = 0; i < this.slots.length; i++) {
    const slot = this.slots[i];
    
    // Ensure end time is after start time
    if (slot.endTime <= slot.startTime) {
      next(new Error('Slot end time must be after start time'));
      return;
    }

    // Check for overlapping slots
    for (let j = i + 1; j < this.slots.length; j++) {
      const otherSlot = this.slots[j];
      if (
        (slot.startTime >= otherSlot.startTime && slot.startTime < otherSlot.endTime) ||
        (slot.endTime > otherSlot.startTime && slot.endTime <= otherSlot.endTime) ||
        (slot.startTime <= otherSlot.startTime && slot.endTime >= otherSlot.endTime)
      ) {
        next(new Error('Overlapping time slots are not allowed'));
        return;
      }
    }
  }

  // Sort slots by start time
  this.slots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  next();
});

// Method to book a slot
expertAvailabilitySchema.methods.bookSlot = async function(slotId: string, bookingId: string) {
  const slot = this.slots.id(slotId);
  if (!slot) {
    throw new Error('Slot not found');
  }
  if (slot.isBooked) {
    throw new Error('Slot is already booked');
  }

  slot.isBooked = true;
  slot.bookingId = bookingId;
  await this.save();
};

// Method to release a slot
expertAvailabilitySchema.methods.releaseSlot = async function(slotId: string) {
  const slot = this.slots.id(slotId);
  if (!slot) {
    throw new Error('Slot not found');
  }

  slot.isBooked = false;
  slot.bookingId = undefined;
  await this.save();
};

// Method to add slots
expertAvailabilitySchema.methods.addSlots = async function(newSlots: any[]) {
  this.slots.push(...newSlots);
  await this.save();
};

// Static method to find available experts for a time range
expertAvailabilitySchema.statics.findAvailableExperts = async function(
  date: Date,
  startTime: Date,
  endTime: Date
) {
  return this.find({
    date,
    isAvailable: true,
    'slots.isBooked': false,
    'slots.startTime': { $lte: startTime },
    'slots.endTime': { $gte: endTime }
  }).populate('expertId');
};

export const ExpertAvailability = model<IExpertAvailability>('ExpertAvailability', expertAvailabilitySchema);