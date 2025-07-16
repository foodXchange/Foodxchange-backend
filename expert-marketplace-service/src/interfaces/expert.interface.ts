import { Document, Types } from 'mongoose';

export enum ExpertStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected'
}

export enum ExpertiseLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  EXPIRED = 'expired'
}

export interface IExpertise {
  category: string;
  subcategories: string[];
  level: ExpertiseLevel;
  yearsOfExperience: number;
  certifications?: string[];
}

export interface IAvailabilitySlot {
  dayOfWeek: number; // 0-6 (Sunday to Saturday)
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  timezone: string;
}

export interface IExpertProfile extends Document {
  userId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  profilePhoto?: string;
  bio: string;
  headline: string;
  status: ExpertStatus;
  verificationStatus: VerificationStatus;
  verificationDate?: Date;
  verificationExpiryDate?: Date;
  expertise: IExpertise[];
  languages: string[];
  location: {
    country: string;
    state?: string;
    city?: string;
    timezone: string;
  };
  hourlyRate: {
    min: number;
    max: number;
    currency: string;
  };
  availability: IAvailabilitySlot[];
  responseTime: number; // in hours
  completedProjects: number;
  totalEarnings: number;
  rating: {
    average: number;
    count: number;
  };
  documents: {
    type: string;
    name: string;
    url: string;
    uploadedAt: Date;
    verified: boolean;
  }[];
  linkedinUrl?: string;
  websiteUrl?: string;
  isActive: boolean;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExpertService extends Document {
  expertId: Types.ObjectId;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  deliverables: string[];
  duration: {
    min: number;
    max: number;
    unit: 'hours' | 'days' | 'weeks' | 'months';
  };
  pricing: {
    type: 'fixed' | 'hourly' | 'custom';
    fixedPrice?: number;
    hourlyRate?: number;
    currency: string;
  };
  tags: string[];
  requirements: string[];
  isActive: boolean;
  viewCount: number;
  bookingCount: number;
  rating: {
    average: number;
    count: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IExpertCollaboration extends Document {
  expertId: Types.ObjectId;
  clientId: Types.ObjectId;
  serviceId?: Types.ObjectId;
  rfqId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  title: string;
  description: string;
  status: 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
  startDate: Date;
  endDate?: Date;
  actualEndDate?: Date;
  budget: {
    amount: number;
    currency: string;
    type: 'fixed' | 'hourly';
  };
  milestones: {
    title: string;
    description: string;
    amount: number;
    dueDate: Date;
    status: 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected';
    completedAt?: Date;
  }[];
  timeTracking: {
    date: Date;
    hours: number;
    description: string;
    approved: boolean;
  }[];
  totalHoursWorked: number;
  totalAmountPaid: number;
  platformFee: number;
  messages: Types.ObjectId[]; // References to message documents
  documents: {
    name: string;
    url: string;
    uploadedBy: Types.ObjectId;
    uploadedAt: Date;
  }[];
  review?: {
    rating: number;
    comment: string;
    reviewedAt: Date;
    reviewedBy: Types.ObjectId;
  };
  disputeReason?: string;
  disputeResolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExpertReview extends Document {
  expertId: Types.ObjectId;
  clientId: Types.ObjectId;
  collaborationId: Types.ObjectId;
  serviceId?: Types.ObjectId;
  rating: number; // 1-5
  comment: string;
  aspects: {
    expertise: number;
    communication: number;
    timeliness: number;
    value: number;
  };
  wouldRecommend: boolean;
  isVerifiedPurchase: boolean;
  response?: {
    comment: string;
    respondedAt: Date;
  };
  helpfulVotes: number;
  reportCount: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExpertAvailability extends Document {
  expertId: Types.ObjectId;
  date: Date;
  slots: {
    startTime: Date;
    endTime: Date;
    isBooked: boolean;
    bookingId?: Types.ObjectId;
  }[];
  isAvailable: boolean;
  reason?: string; // For unavailability
  createdAt: Date;
  updatedAt: Date;
}

export interface IServiceBooking extends Document {
  serviceId: Types.ObjectId;
  expertId: Types.ObjectId;
  clientId: Types.ObjectId;
  collaborationId?: Types.ObjectId;
  scheduledDate: Date;
  duration: number; // in minutes
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  meetingUrl?: string;
  notes?: string;
  reminderSent: boolean;
  cancellationReason?: string;
  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkspaceDocument extends Document {
  collaborationId: Types.ObjectId;
  name: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: Types.ObjectId;
  version: number;
  parentId?: Types.ObjectId; // For versioning
  tags: string[];
  permissions: {
    userId: Types.ObjectId;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }[];
  lastAccessedBy: {
    userId: Types.ObjectId;
    accessedAt: Date;
  }[];
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExpertPayment extends Document {
  expertId: Types.ObjectId;
  collaborationId: Types.ObjectId;
  clientId: Types.ObjectId;
  amount: number;
  currency: string;
  platformFee: number;
  netAmount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  paymentMethod: 'stripe' | 'bank_transfer' | 'paypal';
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  bankDetails?: {
    accountNumber: string;
    routingNumber: string;
    bankName: string;
  };
  invoiceNumber: string;
  invoiceUrl?: string;
  dueDate: Date;
  paidAt?: Date;
  failureReason?: string;
  refundAmount?: number;
  refundReason?: string;
  refundedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}