import { Module } from '@nestjs/common';
import { RFQWebhookController } from './controllers/rfq-webhook.controller';
import { RFQService } from './services/rfq.service';
import { RFQMatchingService } from './services/rfq-matching.service';
import { RFQBiddingService } from './services/rfq-bidding.service';
import { RFQEventProcessor } from './processors/rfq-event.processor';
import { RFQAnalyticsService } from './services/rfq-analytics.service';
import { MongooseModule } from '@nestjs/mongoose';
import { RFQ, RFQSchema } from './models/rfq.model';
import { RFQBid, RFQBidSchema } from './models/rfq-bid.model';
import { RFQMatch, RFQMatchSchema } from './models/rfq-match.model';
import { ExpertProfileModule } from '../expert-profile/expert-profile.module';
import { NotificationModule } from '../notification/notification.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RFQ.name, schema: RFQSchema },
      { name: RFQBid.name, schema: RFQBidSchema },
      { name: RFQMatch.name, schema: RFQMatchSchema },
    ]),
    ExpertProfileModule,
    NotificationModule,
    CacheModule,
  ],
  controllers: [RFQWebhookController],
  providers: [
    RFQService,
    RFQMatchingService,
    RFQBiddingService,
    RFQEventProcessor,
    RFQAnalyticsService,
  ],
  exports: [RFQService, RFQMatchingService, RFQBiddingService],
})
export class RFQModule {}