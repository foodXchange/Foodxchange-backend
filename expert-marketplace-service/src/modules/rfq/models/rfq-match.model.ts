import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RFQMatchDocument = RFQMatch & Document;

export enum MatchStatus {
  PENDING = 'pending',
  NOTIFIED = 'notified',
  VIEWED = 'viewed',
  INTERESTED = 'interested',
  NOT_INTERESTED = 'not_interested',
  BID_SUBMITTED = 'bid_submitted',
}

export enum MatchType {
  AUTO_MATCHED = 'auto_matched',
  MANUAL_MATCHED = 'manual_matched',
  EXPERT_APPLIED = 'expert_applied',
  BUYER_INVITED = 'buyer_invited',
}

@Schema({ timestamps: true })
export class RFQMatch {
  @Prop({ type: String, required: true })
  rfqId: string;

  @Prop({ type: Types.ObjectId, ref: 'ExpertProfile', required: true })
  expertId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(MatchType),
    required: true,
  })
  matchType: MatchType;

  @Prop({ type: Number, required: true })
  matchScore: number;

  @Prop({
    type: {
      categoryMatch: Number,
      locationMatch: Number,
      budgetMatch: Number,
      timelineMatch: Number,
      skillsMatch: Number,
      experienceMatch: Number,
      ratingMatch: Number,
      availabilityMatch: Number,
    },
    required: true,
  })
  scoreBreakdown: {
    categoryMatch: number;
    locationMatch: number;
    budgetMatch: number;
    timelineMatch: number;
    skillsMatch: number;
    experienceMatch: number;
    ratingMatch: number;
    availabilityMatch: number;
  };

  @Prop({ type: [String] })
  matchReasons: string[];

  @Prop({
    type: String,
    enum: Object.values(MatchStatus),
    default: MatchStatus.PENDING,
  })
  status: MatchStatus;

  @Prop({ type: Date })
  notifiedAt: Date;

  @Prop({ type: Date })
  viewedAt: Date;

  @Prop({ type: Date })
  respondedAt: Date;

  @Prop({ type: String })
  response: string;

  @Prop({ type: Types.ObjectId, ref: 'RFQBid' })
  bidId: Types.ObjectId;

  @Prop({
    type: {
      emailSent: Boolean,
      smsSent: Boolean,
      pushSent: Boolean,
      inAppSent: Boolean,
    },
  })
  notifications: {
    emailSent?: boolean;
    smsSent?: boolean;
    pushSent?: boolean;
    inAppSent?: boolean;
  };

  @Prop({ type: Map, of: Object })
  metadata: Map<string, any>;
}

export const RFQMatchSchema = SchemaFactory.createForClass(RFQMatch);