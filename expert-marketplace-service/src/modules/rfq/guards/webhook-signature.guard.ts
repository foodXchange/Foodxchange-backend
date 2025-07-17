import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);
  private readonly webhookSecret: string;

  constructor(private configService: ConfigService) {
    this.webhookSecret = this.configService.get<string>('WEBHOOK_SECRET');
    if (!this.webhookSecret) {
      this.logger.warn('WEBHOOK_SECRET not configured');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-webhook-signature'];
    const timestamp = request.headers['x-webhook-timestamp'];
    const body = request.body;

    // Skip validation in development if no secret is configured
    if (
      !this.webhookSecret &&
      this.configService.get<string>('NODE_ENV') === 'development'
    ) {
      this.logger.warn('Skipping webhook signature validation in development');
      return true;
    }

    if (!signature || !timestamp) {
      this.logger.error('Missing webhook signature or timestamp');
      throw new UnauthorizedException('Missing webhook signature or timestamp');
    }

    // Create the signed content
    const signedContent = `${timestamp}.${JSON.stringify(body)}`;

    // Generate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedContent)
      .digest('hex');

    // Compare signatures
    const signatureValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );

    if (!signatureValid) {
      this.logger.error('Invalid webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}