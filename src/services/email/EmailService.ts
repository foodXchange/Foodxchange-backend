import { Logger } from '../../core/logging/logger';

export class EmailService {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('EmailService');
    this.logger.info('Email service initialized (mock mode)');
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    this.logger.info('Mock: Sending verification email', { email, token });
    // In production, this would actually send an email
    return Promise.resolve();
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    this.logger.info('Mock: Sending password reset email', { email, token });
    // In production, this would actually send an email
    return Promise.resolve();
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    this.logger.info('Mock: Sending welcome email', { email, firstName });
    // In production, this would actually send an email
    return Promise.resolve();
  }

  async sendMeetingInvitation(email: string, meeting: any): Promise<void> {
    this.logger.info('Mock: Sending meeting invitation', { email, meetingId: meeting._id });
    // In production, this would actually send an email with meeting details
    return Promise.resolve();
  }

  async sendMeetingCancellation(email: string, meeting: any): Promise<void> {
    this.logger.info('Mock: Sending meeting cancellation', { email, meetingId: meeting._id });
    // In production, this would actually send an email notifying about cancellation
    return Promise.resolve();
  }

  async sendActionItems(email: string, meeting: any, actionItems: any[]): Promise<void> {
    this.logger.info('Mock: Sending action items', { email, meetingId: meeting._id, itemCount: actionItems.length });
    // In production, this would actually send an email with action items
    return Promise.resolve();
  }
}

export default new EmailService();
