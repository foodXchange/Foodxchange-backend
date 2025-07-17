import { Injectable, Logger } from '@nestjs/common';
import { RFQWebhookEventDto, RFQEventType } from '../dto/rfq-webhook-event.dto';
import { RFQService } from '../services/rfq.service';
import { RFQMatchingService } from '../services/rfq-matching.service';
import { RFQBiddingService } from '../services/rfq-bidding.service';
import { NotificationService } from '../../notification/services/notification.service';
import { CacheService } from '../../cache/services/cache.service';

@Injectable()
export class RFQEventProcessor {
  private readonly logger = new Logger(RFQEventProcessor.name);

  constructor(
    private readonly rfqService: RFQService,
    private readonly matchingService: RFQMatchingService,
    private readonly biddingService: RFQBiddingService,
    private readonly notificationService: NotificationService,
    private readonly cacheService: CacheService,
  ) {}

  async processEvent(event: RFQWebhookEventDto): Promise<any> {
    this.logger.log(`Processing event: ${event.eventType} for RFQ: ${event.rfqId}`);

    try {
      switch (event.eventType) {
        case RFQEventType.RFQ_CREATED:
          return await this.handleRFQCreated(event);
        
        case RFQEventType.RFQ_UPDATED:
          return await this.handleRFQUpdated(event);
        
        case RFQEventType.RFQ_PUBLISHED:
          return await this.handleRFQPublished(event);
        
        case RFQEventType.RFQ_CANCELLED:
          return await this.handleRFQCancelled(event);
        
        case RFQEventType.RFQ_CLOSED:
          return await this.handleRFQClosed(event);
        
        case RFQEventType.RFQ_AWARDED:
          return await this.handleRFQAwarded(event);
        
        case RFQEventType.RFQ_EXPIRED:
          return await this.handleRFQExpired(event);
        
        case RFQEventType.BID_SUBMITTED:
          return await this.handleBidSubmitted(event);
        
        case RFQEventType.BID_UPDATED:
          return await this.handleBidUpdated(event);
        
        case RFQEventType.BID_WITHDRAWN:
          return await this.handleBidWithdrawn(event);
        
        case RFQEventType.BID_ACCEPTED:
          return await this.handleBidAccepted(event);
        
        case RFQEventType.BID_REJECTED:
          return await this.handleBidRejected(event);
        
        default:
          this.logger.warn(`Unknown event type: ${event.eventType}`);
          return { processed: false, reason: 'Unknown event type' };
      }
    } catch (error) {
      this.logger.error(
        `Error processing event ${event.eventType}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async handleRFQCreated(event: RFQWebhookEventDto) {
    const { data } = event;
    
    // Create RFQ in our system
    const rfq = await this.rfqService.createFromWebhook(data);
    
    // Clear any cached RFQ lists
    await this.cacheService.del('rfq:list:*');
    
    return { 
      processed: true, 
      rfqId: rfq.rfqId,
      status: 'created',
    };
  }

  private async handleRFQUpdated(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    
    // Update RFQ in our system
    const rfq = await this.rfqService.updateFromWebhook(rfqId, data);
    
    // Clear cached data
    await this.cacheService.del(`rfq:${rfqId}`);
    await this.cacheService.del('rfq:list:*');
    
    return { 
      processed: true, 
      rfqId: rfq.rfqId,
      status: 'updated',
    };
  }

  private async handleRFQPublished(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    
    // Update RFQ status
    const rfq = await this.rfqService.updateStatus(rfqId, 'published');
    
    // Start matching process
    const matches = await this.matchingService.findMatchesForRFQ(rfqId);
    
    // Send notifications to matched experts
    for (const match of matches) {
      await this.notificationService.sendRFQMatchNotification(match);
    }
    
    // Clear caches
    await this.cacheService.del(`rfq:${rfqId}`);
    await this.cacheService.del('rfq:list:*');
    
    return { 
      processed: true, 
      rfqId: rfq.rfqId,
      status: 'published',
      matchedExperts: matches.length,
    };
  }

  private async handleRFQCancelled(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    
    // Update RFQ status
    const rfq = await this.rfqService.updateStatus(rfqId, 'cancelled');
    
    // Cancel all pending bids
    await this.biddingService.cancelAllBidsForRFQ(rfqId);
    
    // Notify all interested experts
    await this.notificationService.sendRFQCancelledNotifications(rfqId);
    
    // Clear caches
    await this.cacheService.del(`rfq:${rfqId}`);
    await this.cacheService.del('rfq:list:*');
    
    return { 
      processed: true, 
      rfqId: rfq.rfqId,
      status: 'cancelled',
    };
  }

  private async handleRFQClosed(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    
    // Update RFQ status
    const rfq = await this.rfqService.updateStatus(rfqId, 'closed');
    
    // Finalize all bids
    await this.biddingService.finalizeBidsForRFQ(rfqId);
    
    // Clear caches
    await this.cacheService.del(`rfq:${rfqId}`);
    await this.cacheService.del('rfq:list:*');
    
    return { 
      processed: true, 
      rfqId: rfq.rfqId,
      status: 'closed',
    };
  }

  private async handleRFQAwarded(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    const { expertId, bidId } = data;
    
    // Update RFQ with selected expert
    const rfq = await this.rfqService.awardRFQ(rfqId, expertId, bidId);
    
    // Accept the winning bid
    await this.biddingService.acceptBid(bidId);
    
    // Reject other bids
    await this.biddingService.rejectOtherBids(rfqId, bidId);
    
    // Send notifications
    await this.notificationService.sendRFQAwardedNotification(rfqId, expertId);
    
    // Clear caches
    await this.cacheService.del(`rfq:${rfqId}`);
    await this.cacheService.del('rfq:list:*');
    
    return { 
      processed: true, 
      rfqId: rfq.rfqId,
      status: 'awarded',
      awardedTo: expertId,
    };
  }

  private async handleRFQExpired(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    
    // Update RFQ status
    const rfq = await this.rfqService.updateStatus(rfqId, 'expired');
    
    // Expire all pending bids
    await this.biddingService.expireBidsForRFQ(rfqId);
    
    // Clear caches
    await this.cacheService.del(`rfq:${rfqId}`);
    await this.cacheService.del('rfq:list:*');
    
    return { 
      processed: true, 
      rfqId: rfq.rfqId,
      status: 'expired',
    };
  }

  private async handleBidSubmitted(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    const { bidId, expertId } = data;
    
    // Update RFQ analytics
    await this.rfqService.updateAnalytics(rfqId, {
      totalBids: { $inc: 1 },
    });
    
    // Send notification to buyer
    await this.notificationService.sendNewBidNotification(rfqId, bidId);
    
    // Clear caches
    await this.cacheService.del(`rfq:${rfqId}`);
    await this.cacheService.del(`bids:rfq:${rfqId}`);
    
    return { 
      processed: true, 
      rfqId,
      bidId,
      status: 'bid_submitted',
    };
  }

  private async handleBidUpdated(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    const { bidId } = data;
    
    // Clear caches
    await this.cacheService.del(`bid:${bidId}`);
    await this.cacheService.del(`bids:rfq:${rfqId}`);
    
    return { 
      processed: true, 
      rfqId,
      bidId,
      status: 'bid_updated',
    };
  }

  private async handleBidWithdrawn(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    const { bidId } = data;
    
    // Update RFQ analytics
    await this.rfqService.updateAnalytics(rfqId, {
      totalBids: { $inc: -1 },
    });
    
    // Clear caches
    await this.cacheService.del(`bid:${bidId}`);
    await this.cacheService.del(`bids:rfq:${rfqId}`);
    
    return { 
      processed: true, 
      rfqId,
      bidId,
      status: 'bid_withdrawn',
    };
  }

  private async handleBidAccepted(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    const { bidId, expertId } = data;
    
    // Send notification to expert
    await this.notificationService.sendBidAcceptedNotification(bidId, expertId);
    
    // Clear caches
    await this.cacheService.del(`bid:${bidId}`);
    await this.cacheService.del(`bids:rfq:${rfqId}`);
    
    return { 
      processed: true, 
      rfqId,
      bidId,
      status: 'bid_accepted',
    };
  }

  private async handleBidRejected(event: RFQWebhookEventDto) {
    const { rfqId, data } = event;
    const { bidId, expertId, reason } = data;
    
    // Send notification to expert
    await this.notificationService.sendBidRejectedNotification(bidId, expertId, reason);
    
    // Clear caches
    await this.cacheService.del(`bid:${bidId}`);
    await this.cacheService.del(`bids:rfq:${rfqId}`);
    
    return { 
      processed: true, 
      rfqId,
      bidId,
      status: 'bid_rejected',
    };
  }
}