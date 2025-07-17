import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RFQBidDocument = RFQBid & Document;

export enum BidStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  SHORTLISTED = 'shortlisted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

@Schema({ timestamps: true })
export class RFQBid {
  @Prop({ type: String, required: true })
  rfqId: string;

  @Prop({ type: Types.ObjectId, ref: 'ExpertProfile', required: true })
  expertId: Types.ObjectId;

  @Prop({
    type: {
      amount: { type: Number, required: true },
      currency: { type: String, required: true },
      breakdown: [{
        item: { type: String, required: true },
        cost: { type: Number, required: true },
        description: { type: String, required: true }
      }]
    },
    required: true
  })
  proposedBudget: {
    amount: number;
    currency: string;
    breakdown: Array<{
      item: string;
      cost: number;
      description: string;
    }>;
  };

  @Prop({
    type: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      milestones: [{
        name: { type: String, required: true },
        deadline: { type: Date, required: true },
        deliverables: [{ type: String }],
        cost: { type: Number, required: true }
      }]
    },
    required: true
  })
  proposedTimeline: {
    startDate: Date;
    endDate: Date;
    milestones: Array<{
      name: string;
      deadline: Date;
      deliverables: string[];
      cost: number;
    }>;
  };

  @Prop({ type: String, required: true })
  coverLetter: string;

  @Prop({ type: String, required: true })
  approach: string;

  @Prop({ type: [String] })
  attachments: string[];

  @Prop({ type: [String] })
  portfolioItems: string[];

  @Prop({
    type: {
      teamSize: Number,
      teamMembers: [{
        name: String,
        role: String,
        experience: String,
        linkedIn: String,
      }],
    },
  })
  proposedTeam: {
    teamSize?: number;
    teamMembers?: Array<{
      name: string;
      role: string;
      experience: string;
      linkedIn?: string;
    }>;
  };

  @Prop({ type: [String] })
  deliverables: string[];

  @Prop({
    type: {
      guarantee: String,
      supportPeriod: Number,
      revisionsIncluded: Number,
      additionalServices: [String],
    },
  })
  terms: {
    guarantee?: string;
    supportPeriod?: number;
    revisionsIncluded?: number;
    additionalServices?: string[];
  };

  @Prop({
    type: String,
    enum: Object.values(BidStatus),
    default: BidStatus.DRAFT,
  })
  status: BidStatus;

  @Prop({ type: Number })
  score: number;

  @Prop({
    type: {
      budgetScore: Number,
      timelineScore: Number,
      experienceScore: Number,
      proposalScore: Number,
      overallScore: Number,
    },
  })
  evaluation: {
    budgetScore?: number;
    timelineScore?: number;
    experienceScore?: number;
    proposalScore?: number;
    overallScore?: number;
  };

  @Prop({ type: Date })
  submittedAt: Date;

  @Prop({ type: Date })
  reviewedAt: Date;

  @Prop({ type: String })
  reviewedBy: string;

  @Prop({ type: String })
  reviewComments: string;

  @Prop({ type: String })
  rejectionReason: string;

  @Prop({ type: Map, of: Object })
  metadata: Map<string, any>;
}

export const RFQBidSchema = SchemaFactory.createForClass(RFQBid);