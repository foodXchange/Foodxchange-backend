import { Twilio } from 'twilio';
import { Logger } from '../core/logging/logger';

const logger = new Logger('SMSService');

interface SMSOptions {
  to: string;
  message: string;
}

class SMSService {
  private client: Twilio | null = null;
  
  constructor() {
    this.initializeClient();
  }
  
  private initializeClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (accountSid && authToken) {
      this.client = new Twilio(accountSid, authToken);
    } else {
      logger.warn('Twilio configuration not found, SMS sending disabled');
    }
  }
  
  async send(options: SMSOptions): Promise<void> {
    if (!this.client) {
      logger.warn('SMS client not configured, skipping SMS');
      return;
    }
    
    try {
      const message = await this.client.messages.create({
        body: options.message,
        from: process.env.TWILIO_FROM_NUMBER,
        to: options.to
      });
      
      logger.info('SMS sent successfully', {
        to: options.to,
        messageId: message.sid
      });
    } catch (error) {
      logger.error('Failed to send SMS:', error);
      throw error;
    }
  }
}

const smsService = new SMSService();

export const sendSMS = async (options: SMSOptions): Promise<void> => {
  return smsService.send(options);
};