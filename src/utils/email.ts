import nodemailer from 'nodemailer';
import { Logger } from '../core/logging/logger';

const logger = new Logger('EmailService');

interface EmailOptions {
  to: string;
  subject: string;
  template?: string;
  html?: string;
  text?: string;
  data?: any;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  
  constructor() {
    this.initializeTransporter();
  }
  
  private initializeTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else {
      logger.warn('SMTP configuration not found, email sending disabled');
    }
  }
  
  async send(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      logger.warn('Email transporter not configured, skipping email');
      return;
    }
    
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@foodxchange.com',
        to: options.to,
        subject: options.subject,
        html: options.html || this.renderTemplate(options.template, options.data),
        text: options.text
      };
      
      await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject
      });
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }
  
  private renderTemplate(template?: string, data?: any): string {
    // Simple template rendering - in production, use a proper template engine
    if (!template) {
      return '<p>No template specified</p>';
    }
    
    // Template rendering logic would go here
    return `<h1>FoodXchange Notification</h1><p>${JSON.stringify(data)}</p>`;
  }
}

const emailService = new EmailService();

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  return emailService.send(options);
};