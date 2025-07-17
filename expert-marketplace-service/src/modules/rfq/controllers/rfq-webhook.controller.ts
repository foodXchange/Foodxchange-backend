import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { RFQEventProcessor } from '../processors/rfq-event.processor';
import { WebhookSignatureGuard } from '../guards/webhook-signature.guard';
import { RFQWebhookEventDto } from '../dto/rfq-webhook-event.dto';

@ApiTags('RFQ Webhooks')
@Controller('webhooks/rfq')
@UseGuards(WebhookSignatureGuard)
export class RFQWebhookController {
  private readonly logger = new Logger(RFQWebhookController.name);

  constructor(private readonly rfqEventProcessor: RFQEventProcessor) {}

  @Post('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle RFQ webhook events' })
  @ApiHeader({
    name: 'x-webhook-signature',
    description: 'HMAC SHA256 signature of the request body',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid webhook payload',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid webhook signature',
  })
  async handleRFQEvent(
    @Body() event: RFQWebhookEventDto,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
  ) {
    this.logger.log(`Received RFQ webhook event: ${event.eventType}`);

    try {
      // Validate timestamp to prevent replay attacks
      const eventTimestamp = parseInt(timestamp, 10);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const timeDiff = currentTimestamp - eventTimestamp;

      if (timeDiff > 300) {
        // 5 minutes
        throw new BadRequestException('Webhook timestamp is too old');
      }

      // Process the event
      const result = await this.rfqEventProcessor.processEvent(event);

      this.logger.log(
        `Successfully processed RFQ webhook event: ${event.eventType}`,
      );

      return {
        success: true,
        eventId: event.eventId,
        processedAt: new Date().toISOString(),
        result,
      };
    } catch (error) {
      this.logger.error(
        `Error processing RFQ webhook event: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle batch RFQ webhook events' })
  @ApiResponse({
    status: 200,
    description: 'Batch webhook processed successfully',
  })
  async handleBatchRFQEvents(
    @Body() events: RFQWebhookEventDto[],
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
  ) {
    this.logger.log(`Received batch RFQ webhook with ${events.length} events`);

    const results = await Promise.allSettled(
      events.map((event) => this.rfqEventProcessor.processEvent(event)),
    );

    const processed = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `Batch processing complete: ${processed} succeeded, ${failed} failed`,
    );

    return {
      success: true,
      total: events.length,
      processed,
      failed,
      results: results.map((result, index) => ({
        eventId: events[index].eventId,
        status: result.status,
        result: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message : null,
      })),
    };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test webhook endpoint' })
  async testWebhook() {
    return {
      success: true,
      message: 'Webhook endpoint is working',
      timestamp: new Date().toISOString(),
    };
  }
}