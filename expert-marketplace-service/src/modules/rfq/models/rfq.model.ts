import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RFQDocument = RFQ & Document;

export enum RFQStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  MATCHED = 'matched',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum RFQPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Schema({ timestamps: true })
export class RFQ {
  @Prop({ type: String, required: true, unique: true })
  rfqId: string;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  description: string;

  @Prop({ type: String, required: true })
  buyerId: string;

  @Prop({ type: String, required: true })
  buyerName: string;

  @Prop({ type: String })
  buyerEmail: string;

  @Prop({ type: String })
  buyerPhone: string;

  @Prop({ type: [String], required: true })
  categories: string[];

  @Prop({ type: [String] })
  tags: string[];

  @Prop({
    type: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
      currency: { type: String, required: true }
    },
    required: true
  })
  budget: {
    min: number;
    max: number;
    currency: string;
  };

  @Prop({
    type: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      milestones: [{
        name: { type: String, required: true },
        deadline: { type: Date, required: true },
        description: { type: String, required: true }
      }]
    },
    required: true
  })
  timeline: {
    startDate: Date;
    endDate: Date;
    milestones: Array<{
      name: string;
      deadline: Date;
      description: string;
    }>;
  };

  @Prop({
    type: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },
  })
  location: {
    street?: string;
    city: string;
    state: string;
    country: string;
    postalCode?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };

  @Prop({ type: [String] })
  attachments: string[];

  @Prop({
    type: {
      minRating: Number,
      requiredCertifications: [String],
      requiredExperience: Number,
      preferredLanguages: [String],
      specificSkills: [String],
    },
  })
  requirements: {
    minRating?: number;
    requiredCertifications?: string[];
    requiredExperience?: number;
    preferredLanguages?: string[];
    specificSkills?: string[];
  };

  @Prop({
    type: String,
    enum: Object.values(RFQStatus),
    default: RFQStatus.DRAFT,
  })
  status: RFQStatus;

  @Prop({
    type: String,
    enum: Object.values(RFQPriority),
    default: RFQPriority.MEDIUM,
  })
  priority: RFQPriority;

  @Prop({ type: [Types.ObjectId], ref: 'ExpertProfile' })
  matchedExperts: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'ExpertProfile' })
  selectedExpert: Types.ObjectId;

  @Prop({ type: Map, of: Object })
  metadata: Map<string, any>;

  @Prop({
    type: {
      totalBids: { type: Number, default: 0 },
      averageBidAmount: { type: Number, default: 0 },
      viewCount: { type: Number, default: 0 },
      lastViewedAt: { type: Date }
    },
    default: () => ({
      totalBids: 0,
      averageBidAmount: 0,
      viewCount: 0
    })
  })
  analytics: {
    totalBids: number;
    averageBidAmount: number;
    viewCount: number;
    lastViewedAt?: Date;
  };

  @Prop({ type: Date })
  publishedAt: Date;

  @Prop({ type: Date })
  closedAt: Date;
}

export const RFQSchema = SchemaFactory.createForClass(RFQ);