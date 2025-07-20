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
}
