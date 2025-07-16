import axios from 'axios';
import { WhatsAppMessage, Lead, AgentProfile } from '../models';
import { Logger } from '../../../utils/logger';
import { config } from '../../../config';
import { WhatsAppTemplate } from '../interfaces/agent.interface';
import { ExternalServiceError, ValidationError } from '../../../utils/errors';

const logger = new Logger('WhatsAppService');

export class WhatsAppService {
  private apiUrl: string;
  private accessToken: string;
  private phoneNumberId: string;

  constructor() {
    // Initialize with Twilio WhatsApp Business API or Facebook WhatsApp Business API
    this.apiUrl = 'https://graph.facebook.com/v18.0';
    this.accessToken = config.whatsapp?.accessToken || '';
    this.phoneNumberId = config.whatsapp?.phoneNumberId || '';
  }

  /**
   * Send text message
   */
  async sendTextMessage(
    agentId: string,
    to: string,
    message: string,
    leadId?: string
  ): Promise<any> {
    try {
      // Validate WhatsApp number format
      const formattedNumber = this.formatPhoneNumber(to);
      
      // Create message record
      const whatsAppMessage = new WhatsAppMessage({
        agentId,
        leadId,
        to: formattedNumber,
        from: this.phoneNumberId,
        messageType: 'text',
        content: message,
        status: 'queued',
        isAutomated: false
      });

      await whatsAppMessage.save();

      // Send via WhatsApp API
      const response = await this.sendMessage({
        messaging_product: 'whatsapp',
        to: formattedNumber,
        type: 'text',
        text: {
          body: message
        }
      });

      // Update message status
      await whatsAppMessage.markAsSent();

      // Add interaction to lead if provided
      if (leadId) {
        const lead = await Lead.findById(leadId);
        if (lead) {
          await lead.addInteraction('whatsapp', `Sent: ${message.substring(0, 100)}...`);
        }
      }

      logger.info('Text message sent successfully', {
        messageId: whatsAppMessage.messageId,
        agentId,
        to: formattedNumber
      });

      return {
        messageId: whatsAppMessage.messageId,
        whatsappMessageId: response.messages[0].id,
        status: 'sent'
      };
    } catch (error) {
      logger.error('Send text message failed:', error);
      throw new ExternalServiceError('WhatsApp', error.message);
    }
  }

  /**
   * Send template message
   */
  async sendTemplateMessage(
    agentId: string,
    to: string,
    templateName: string,
    parameters: string[] = [],
    leadId?: string
  ): Promise<any> {
    try {
      const formattedNumber = this.formatPhoneNumber(to);
      
      // Get template
      const template = await this.getTemplate(templateName);
      if (!template) {
        throw new ValidationError(`Template ${templateName} not found`);
      }

      // Create message record
      const whatsAppMessage = new WhatsAppMessage({
        agentId,
        leadId,
        to: formattedNumber,
        from: this.phoneNumberId,
        messageType: 'template',
        content: `Template: ${templateName}`,
        templateName,
        status: 'queued',
        isAutomated: true,
        metadata: { parameters }
      });

      await whatsAppMessage.save();

      // Build template message
      const templateMessage = {
        messaging_product: 'whatsapp',
        to: formattedNumber,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: 'en'
          },
          components: parameters.length > 0 ? [{
            type: 'body',
            parameters: parameters.map(param => ({
              type: 'text',
              text: param
            }))
          }] : undefined
        }
      };

      // Send via WhatsApp API
      const response = await this.sendMessage(templateMessage);

      // Update message status
      await whatsAppMessage.markAsSent();

      logger.info('Template message sent successfully', {
        messageId: whatsAppMessage.messageId,
        agentId,
        templateName,
        to: formattedNumber
      });

      return {
        messageId: whatsAppMessage.messageId,
        whatsappMessageId: response.messages[0].id,
        status: 'sent'
      };
    } catch (error) {
      logger.error('Send template message failed:', error);
      throw new ExternalServiceError('WhatsApp', error.message);
    }
  }

  /**
   * Send bulk messages to multiple contacts
   */
  async sendBulkMessages(
    agentId: string,
    contacts: { phone: string; leadId?: string; name?: string }[],
    message: string,
    campaignId?: string
  ): Promise<any> {
    try {
      const results = [];
      const batchSize = 10; // Process in batches to avoid rate limiting

      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (contact) => {
          try {
            // Personalize message if name is provided
            const personalizedMessage = contact.name 
              ? message.replace('{{name}}', contact.name)
              : message;

            const result = await this.sendTextMessage(
              agentId,
              contact.phone,
              personalizedMessage,
              contact.leadId
            );

            // Update message with campaign ID
            if (campaignId) {
              await WhatsAppMessage.findByIdAndUpdate(result.messageId, {
                campaignId
              });
            }

            return {
              phone: contact.phone,
              success: true,
              messageId: result.messageId
            };
          } catch (error) {
            logger.error(`Failed to send to ${contact.phone}:`, error);
            return {
              phone: contact.phone,
              success: false,
              error: error.message
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Wait between batches to respect rate limits
        if (i + batchSize < contacts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      logger.info('Bulk messages sent', {
        agentId,
        campaignId,
        total: contacts.length,
        success: successCount,
        failures: failureCount
      });

      return {
        total: contacts.length,
        success: successCount,
        failures: failureCount,
        results
      };
    } catch (error) {
      logger.error('Send bulk messages failed:', error);
      throw error;
    }
  }

  /**
   * Send document/image
   */
  async sendMedia(
    agentId: string,
    to: string,
    mediaUrl: string,
    mediaType: 'image' | 'document',
    caption?: string,
    leadId?: string
  ): Promise<any> {
    try {
      const formattedNumber = this.formatPhoneNumber(to);

      // Create message record
      const whatsAppMessage = new WhatsAppMessage({
        agentId,
        leadId,
        to: formattedNumber,
        from: this.phoneNumberId,
        messageType: mediaType,
        content: caption || mediaUrl,
        status: 'queued',
        isAutomated: false,
        metadata: { mediaUrl, caption }
      });

      await whatsAppMessage.save();

      // Build media message
      const mediaMessage: any = {
        messaging_product: 'whatsapp',
        to: formattedNumber,
        type: mediaType
      };

      mediaMessage[mediaType] = {
        link: mediaUrl
      };

      if (caption && mediaType === 'image') {
        mediaMessage[mediaType].caption = caption;
      }

      // Send via WhatsApp API
      const response = await this.sendMessage(mediaMessage);

      // Update message status
      await whatsAppMessage.markAsSent();

      logger.info('Media message sent successfully', {
        messageId: whatsAppMessage.messageId,
        agentId,
        mediaType,
        to: formattedNumber
      });

      return {
        messageId: whatsAppMessage.messageId,
        whatsappMessageId: response.messages[0].id,
        status: 'sent'
      };
    } catch (error) {
      logger.error('Send media message failed:', error);
      throw new ExternalServiceError('WhatsApp', error.message);
    }
  }

  /**
   * Get message templates
   */
  async getMessageTemplates(): Promise<WhatsAppTemplate[]> {
    try {
      // These would typically be stored in database or fetched from WhatsApp API
      const templates: WhatsAppTemplate[] = [
        {
          name: 'lead_introduction',
          category: 'marketing',
          language: 'en',
          components: [
            {
              type: 'header',
              text: 'Welcome to FoodXchange!'
            },
            {
              type: 'body',
              text: 'Hi {{1}}, I\'m {{2}} from FoodXchange. I understand you\'re looking for {{3}}. I\'d love to help you find the best suppliers. When would be a good time to chat?',
              parameters: ['name', 'agent_name', 'product_category']
            },
            {
              type: 'footer',
              text: 'Reply STOP to opt out'
            }
          ]
        },
        {
          name: 'follow_up_reminder',
          category: 'utility',
          language: 'en',
          components: [
            {
              type: 'body',
              text: 'Hi {{1}}, just following up on our conversation about {{2}}. Have you had a chance to review the proposal? I\'m here if you have any questions.',
              parameters: ['name', 'product']
            }
          ]
        },
        {
          name: 'supplier_match_found',
          category: 'utility',
          language: 'en',
          components: [
            {
              type: 'body',
              text: 'Great news {{1}}! I found {{2}} verified suppliers for {{3}} in your area. The pricing looks competitive. Would you like me to share their details?',
              parameters: ['name', 'supplier_count', 'product']
            }
          ]
        },
        {
          name: 'order_confirmation',
          category: 'utility',
          language: 'en',
          components: [
            {
              type: 'body',
              text: 'Congratulations {{1}}! Your order for {{2}} worth ${{3}} has been confirmed. Your commission of ${{4}} will be processed within 3-5 business days.',
              parameters: ['agent_name', 'product', 'order_value', 'commission']
            }
          ]
        }
      ];

      return templates;
    } catch (error) {
      logger.error('Get message templates failed:', error);
      throw error;
    }
  }

  /**
   * Process webhook events
   */
  async processWebhookEvent(event: any): Promise<void> {
    try {
      if (event.entry && event.entry[0] && event.entry[0].changes) {
        const changes = event.entry[0].changes[0];
        
        if (changes.field === 'messages') {
          const value = changes.value;
          
          // Process message status updates
          if (value.statuses) {
            for (const status of value.statuses) {
              await this.updateMessageStatus(status.id, status.status);
            }
          }

          // Process incoming messages
          if (value.messages) {
            for (const message of value.messages) {
              await this.handleIncomingMessage(message, value.contacts[0]);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Process webhook event failed:', error);
    }
  }

  /**
   * Get agent message analytics
   */
  async getAgentMessageAnalytics(agentId: string, days: number = 30): Promise<any> {
    try {
      const analytics = await WhatsAppMessage.getMessageAnalytics(
        agentId,
        new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        new Date()
      );

      return analytics;
    } catch (error) {
      logger.error('Get message analytics failed:', error);
      throw error;
    }
  }

  // Private helper methods

  private async sendMessage(messageData: any): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        messageData,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('WhatsApp API error:', error.response?.data || error.message);
      throw new ExternalServiceError('WhatsApp API', error.response?.data?.error?.message || error.message);
    }
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    let formatted = phone.replace(/\D/g, '');
    
    // Add country code if not present
    if (!formatted.startsWith('1') && formatted.length === 10) {
      formatted = '1' + formatted; // US/Canada
    }
    
    return formatted;
  }

  private async getTemplate(templateName: string): Promise<WhatsAppTemplate | null> {
    const templates = await this.getMessageTemplates();
    return templates.find(t => t.name === templateName) || null;
  }

  private async updateMessageStatus(whatsAppMessageId: string, status: string): Promise<void> {
    try {
      const message = await WhatsAppMessage.findOne({
        'metadata.whatsAppMessageId': whatsAppMessageId
      });

      if (message) {
        switch (status) {
          case 'delivered':
            await message.markAsDelivered();
            break;
          case 'read':
            await message.markAsRead();
            break;
          case 'failed':
            await message.markAsFailed('Message delivery failed');
            break;
        }
      }
    } catch (error) {
      logger.error('Update message status failed:', error);
    }
  }

  private async handleIncomingMessage(message: any, contact: any): Promise<void> {
    try {
      // Find lead by phone number
      const lead = await Lead.findOne({
        $or: [
          { contactPhone: contact.wa_id },
          { whatsappNumber: contact.wa_id }
        ]
      }).populate('agentId');

      if (lead && lead.agentId) {
        // Add interaction to lead
        await lead.addInteraction(
          'whatsapp',
          `Received: ${message.text?.body || message.type}`,
          'Inbound message received'
        );

        // Create incoming message record
        const incomingMessage = new WhatsAppMessage({
          messageId: `IN${Date.now()}`,
          agentId: lead.agentId._id,
          leadId: lead._id,
          to: this.phoneNumberId,
          from: contact.wa_id,
          messageType: message.type,
          content: message.text?.body || `${message.type} message`,
          status: 'delivered',
          isAutomated: false
        });

        await incomingMessage.save();

        logger.info('Incoming message processed', {
          leadId: lead.leadId,
          from: contact.wa_id,
          type: message.type
        });
      }
    } catch (error) {
      logger.error('Handle incoming message failed:', error);
    }
  }

  /**
   * Schedule automated follow-up messages
   */
  async scheduleFollowUpMessages(): Promise<void> {
    try {
      // Get leads requiring follow-up
      const leadsRequiringFollowUp = await Lead.getLeadsRequiringFollowUp();

      for (const lead of leadsRequiringFollowUp) {
        try {
          // Send follow-up template
          await this.sendTemplateMessage(
            lead.agentId._id,
            lead.whatsappNumber || lead.contactPhone,
            'follow_up_reminder',
            [lead.contactPerson, lead.productCategories[0]],
            lead._id
          );

          // Update next follow-up date
          const nextFollowUp = new Date();
          nextFollowUp.setDate(nextFollowUp.getDate() + 3);
          
          lead.nextFollowUpDate = nextFollowUp;
          await lead.save();
        } catch (error) {
          logger.error(`Failed to send follow-up to lead ${lead.leadId}:`, error);
        }
      }
    } catch (error) {
      logger.error('Schedule follow-up messages failed:', error);
    }
  }
}