import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsObject,
  IsOptional,
  IsUUID,
  IsDateString,
} from 'class-validator';

export enum RFQEventType {
  RFQ_CREATED = 'rfq.created',
  RFQ_UPDATED = 'rfq.updated',
  RFQ_PUBLISHED = 'rfq.published',
  RFQ_CANCELLED = 'rfq.cancelled',
  RFQ_CLOSED = 'rfq.closed',
  RFQ_AWARDED = 'rfq.awarded',
  RFQ_EXPIRED = 'rfq.expired',
  BID_SUBMITTED = 'bid.submitted',
  BID_UPDATED = 'bid.updated',
  BID_WITHDRAWN = 'bid.withdrawn',
  BID_ACCEPTED = 'bid.accepted',
  BID_REJECTED = 'bid.rejected',
}

export class RFQWebhookEventDto {
  @ApiProperty({ description: 'Unique event ID' })
  @IsUUID()
  @IsNotEmpty()
  eventId: string;

  @ApiProperty({
    description: 'Event type',
    enum: RFQEventType,
  })
  @IsEnum(RFQEventType)
  @IsNotEmpty()
  eventType: RFQEventType;

  @ApiProperty({ description: 'Timestamp when event occurred' })
  @IsDateString()
  @IsNotEmpty()
  timestamp: string;

  @ApiProperty({ description: 'RFQ ID associated with the event' })
  @IsString()
  @IsNotEmpty()
  rfqId: string;

  @ApiProperty({ description: 'Event payload data' })
  @IsObject()
  @IsNotEmpty()
  data: any;

  @ApiProperty({ description: 'User who triggered the event', required: false })
  @IsString()
  @IsOptional()
  triggeredBy?: string;

  @ApiProperty({ description: 'Additional metadata', required: false })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}