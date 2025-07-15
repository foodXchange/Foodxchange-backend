const twilio = require('twilio');
const { SmsClient } = require('@azure/communication-sms');
const { EmailClient } = require('@azure/communication-email');
const AgentCommunication = require('../models/AgentCommunication.ts');
const Agent = require('../models/Agent.ts');
const asyncHandler = require('express-async-handler');
const logger = require('../config/logger');
const axios = require('axios');

class WhatsAppService {
  constructor() {
    // Initialize Twilio client for WhatsApp Business API
    this.twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      : null;
    
    this.twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'; // Twilio Sandbox default
    
    // Initialize Azure Communication Services
    this.azureSmsClient = process.env.AZURE_COMMUNICATION_CONNECTION_STRING
      ? new SmsClient(process.env.AZURE_COMMUNICATION_CONNECTION_STRING)
      : null;
    
    this.azureEmailClient = process.env.AZURE_COMMUNICATION_CONNECTION_STRING
      ? new EmailClient(process.env.AZURE_COMMUNICATION_CONNECTION_STRING)
      : null;
    
    // WhatsApp message templates
    this.templates = {
      newLead: {
        template: 'new_lead_notification',
        body: `🔔 *New Lead Available!*\n\n*Lead:* {{leadTitle}}\n*Value:* {{currency}} {{amount}}\n*Location:* {{location}}\n*Urgency:* {{urgency}}\n*Match Score:* {{matchScore}}%\n\n⏰ *Response Time:* {{timeRemaining}}\n\n✅ Reply 'ACCEPT {{leadNumber}}' to accept\n❌ Reply 'DECLINE {{leadNumber}}' to decline\n\n_Lead #{{leadNumber}}_`
      },
      leadAccepted: {
        template: 'lead_accepted',
        body: `✅ *Lead Accepted Successfully!*\n\n*Lead:* {{leadTitle}}\n*Lead #:* {{leadNumber}}\n\nBuyer contact details have been sent to your email.\n\nPlease contact the buyer within 2 hours to maintain your performance rating.`
      },
      leadExpired: {
        template: 'lead_expired',
        body: `⏰ *Lead Offer Expired*\n\nThe lead "{{leadTitle}}" ({{leadNumber}}) has expired.\n\nStay active to receive more leads!`
      },
      commissionUpdate: {
        template: 'commission_update',
        body: `💰 *Commission Update!*\n\n*Type:* {{commissionType}}\n*Amount:* {{currency}} {{amount}}\n*Status:* {{status}}\n*Deal:* {{dealReference}}\n\n{{additionalInfo}}\n\n_Your total pending commission: {{currency}} {{pendingTotal}}_`
      },
      weeklyReport: {
        template: 'weekly_report',
        body: `📊 *Weekly Performance Report*\n\n*Period:* {{startDate}} - {{endDate}}\n\n📈 *Metrics:*\n• Leads Received: {{leadsReceived}}\n• Leads Accepted: {{leadsAccepted}}\n• Conversion Rate: {{conversionRate}}%\n• Total Earnings: {{currency}} {{totalEarnings}}\n\n🎯 *Current Tier:* {{tier}}\n⭐ *Rating:* {{rating}}/5\n\nKeep up the great work! 💪`
      },
      urgentAlert: {
        template: 'urgent_alert',
        body: `🚨 *URGENT: Action Required*\n\n{{alertMessage}}\n\n{{actionRequired}}\n\n_Reply 'HELP' for assistance_`
      }
    };
  }

  /**
   * Send WhatsApp message to agent
   */
  async sendWhatsAppMessage(agentId, messageType, data) {
    try {
      const agent = await Agent.findById(agentId)
        .populate('userId', 'phone email');
      
      if (!agent || !agent.personalInfo.whatsapp) {
        throw new Error('Agent or WhatsApp number not found');
      }

      const whatsappNumber = this.formatWhatsAppNumber(agent.personalInfo.whatsapp);
      const message = this.formatMessage(messageType, data);

      let result;
      let deliveryStatus = 'pending';
      let messageId;

      // Try Twilio first
      if (this.twilioClient) {
        try {
          const twilioMessage = await this.twilioClient.messages.create({
            body: message,
            from: this.twilioWhatsAppFrom,
            to: `whatsapp:${whatsappNumber}`
          });
          
          messageId = twilioMessage.sid;
          deliveryStatus = twilioMessage.status;
          result = { success: true, provider: 'twilio', messageId };
        } catch (twilioError) {
          logger.error('Twilio WhatsApp error:', twilioError);
          // Fall back to Azure SMS if Twilio fails
          if (this.azureSmsClient) {
            result = await this.sendFallbackSMS(whatsappNumber, message);
          } else {
            throw twilioError;
          }
        }
      } else {
        // No WhatsApp provider configured, use SMS fallback
        if (this.azureSmsClient) {
          result = await this.sendFallbackSMS(whatsappNumber, message);
        } else {
          throw new Error('No messaging service configured');
        }
      }

      // Log communication
      await this.logCommunication(agent._id, 'whatsapp', message, data, result);

      return result;
    } catch (error) {
      logger.error('WhatsApp service error:', error);
      throw error;
    }
  }

  /**
   * Send fallback SMS using Azure Communication Services
   */
  async sendFallbackSMS(phoneNumber, message) {
    try {
      const sendResult = await this.azureSmsClient.send({
        from: process.env.AZURE_COMMUNICATION_PHONE_NUMBER || '+1234567890',
        to: [phoneNumber],
        message: message.replace(/\*/g, '') // Remove WhatsApp formatting
      });

      const result = sendResult[0];
      return {
        success: result.successful,
        provider: 'azure_sms',
        messageId: result.messageId,
        fallback: true
      };
    } catch (error) {
      logger.error('Azure SMS error:', error);
      throw error;
    }
  }

  /**
   * Format WhatsApp number
   */
  formatWhatsAppNumber(number) {
    // Remove all non-numeric characters
    let cleaned = number.replace(/\D/g, '');
    
    // Add country code if not present (assuming US for now)
    if (!cleaned.startsWith('1') && cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    // Add + prefix
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Format message using template
   */
  formatMessage(messageType, data) {
    const template = this.templates[messageType];
    if (!template) {
      throw new Error(`Unknown message type: ${messageType}`);
    }

    let message = template.body;
    
    // Replace placeholders
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      message = message.replace(regex, data[key]);
    });

    return message;
  }

  /**
   * Send new lead notification
   */
  async notifyNewLead(agentId, lead) {
    const data = {
      leadTitle: lead.leadInfo.title,
      leadNumber: lead.leadNumber,
      currency: lead.leadInfo.estimatedValue.currency,
      amount: lead.leadInfo.estimatedValue.amount.toLocaleString(),
      location: `${lead.leadInfo.requirements.deliveryLocation.city}, ${lead.leadInfo.requirements.deliveryLocation.country}`,
      urgency: lead.leadInfo.urgency.toUpperCase(),
      matchScore: Math.round(lead.assignment.assignedAgents.find(a => a.agentId.toString() === agentId.toString())?.matchScore || 0),
      timeRemaining: this.formatTimeRemaining(lead.assignment.assignedAgents.find(a => a.agentId.toString() === agentId.toString())?.offerExpiresAt)
    };

    return await this.sendWhatsAppMessage(agentId, 'newLead', data);
  }

  /**
   * Send lead accepted confirmation
   */
  async notifyLeadAccepted(agentId, lead) {
    const data = {
      leadTitle: lead.leadInfo.title,
      leadNumber: lead.leadNumber
    };

    return await this.sendWhatsAppMessage(agentId, 'leadAccepted', data);
  }

  /**
   * Send lead expired notification
   */
  async notifyLeadExpired(agentId, lead) {
    const data = {
      leadTitle: lead.leadInfo.title,
      leadNumber: lead.leadNumber
    };

    return await this.sendWhatsAppMessage(agentId, 'leadExpired', data);
  }

  /**
   * Send commission update notification
   */
  async notifyCommissionUpdate(agentId, commission) {
    const agent = await Agent.findById(agentId);
    
    // Calculate pending commissions
    const pendingCommissions = await AgentCommunication.aggregate([
      {
        $match: {
          agentId: agentId,
          'payment.status': { $in: ['pending', 'approved'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$financial.netAmount' }
        }
      }
    ]);

    const pendingTotal = pendingCommissions[0]?.total || 0;

    const data = {
      commissionType: this.formatCommissionType(commission.type),
      currency: commission.financial.commission.currency,
      amount: commission.financial.netAmount.toFixed(2),
      status: this.formatStatus(commission.status),
      dealReference: commission.source.referenceNumber || 'N/A',
      additionalInfo: commission.calculation.breakdown.bonusCalculation || '',
      pendingTotal: pendingTotal.toFixed(2)
    };

    return await this.sendWhatsAppMessage(agentId, 'commissionUpdate', data);
  }

  /**
   * Send weekly performance report
   */
  async sendWeeklyReport(agentId, reportData) {
    const data = {
      startDate: new Date(reportData.period.start).toLocaleDateString(),
      endDate: new Date(reportData.period.end).toLocaleDateString(),
      leadsReceived: reportData.metrics.leadsReceived,
      leadsAccepted: reportData.metrics.leadsAccepted,
      conversionRate: reportData.metrics.conversionRate.toFixed(1),
      currency: reportData.metrics.currency || 'USD',
      totalEarnings: reportData.metrics.totalEarnings.toFixed(2),
      tier: reportData.agent.tier.toUpperCase(),
      rating: reportData.agent.rating.toFixed(1)
    };

    return await this.sendWhatsAppMessage(agentId, 'weeklyReport', data);
  }

  /**
   * Send urgent alert
   */
  async sendUrgentAlert(agentId, alertMessage, actionRequired) {
    const data = {
      alertMessage,
      actionRequired
    };

    return await this.sendWhatsAppMessage(agentId, 'urgentAlert', data);
  }

  /**
   * Process incoming WhatsApp message
   */
  async processIncomingMessage(from, body, messageId) {
    try {
      const phoneNumber = from.replace('whatsapp:', '');
      
      // Find agent by WhatsApp number
      const agent = await Agent.findOne({
        'personalInfo.whatsapp': { $regex: phoneNumber.replace(/\D/g, ''), $options: 'i' }
      });

      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }

      // Parse message
      const command = body.trim().toUpperCase();
      const parts = command.split(' ');

      let response;
      switch (parts[0]) {
        case 'ACCEPT':
          if (parts[1]) {
            response = await this.handleAcceptLead(agent._id, parts[1]);
          } else {
            response = 'Please provide lead number. Format: ACCEPT LEAD123';
          }
          break;
          
        case 'DECLINE':
          if (parts[1]) {
            response = await this.handleDeclineLead(agent._id, parts[1], parts.slice(2).join(' '));
          } else {
            response = 'Please provide lead number. Format: DECLINE LEAD123 [reason]';
          }
          break;
          
        case 'STATUS':
          response = await this.handleStatusRequest(agent._id);
          break;
          
        case 'HELP':
          response = this.getHelpMessage();
          break;
          
        default:
          response = 'Unknown command. Reply HELP for available commands.';
      }

      // Send response
      if (this.twilioClient) {
        await this.twilioClient.messages.create({
          body: response,
          from: this.twilioWhatsAppFrom,
          to: from
        });
      }

      return { success: true, response };
    } catch (error) {
      logger.error('Process incoming message error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle accept lead command
   */
  async handleAcceptLead(agentId, leadNumber) {
    try {
      const AgentLead = require('../models/AgentLead');
      const lead = await AgentLead.findOne({ leadNumber });
      
      if (!lead) {
        return 'Lead not found. Please check the lead number.';
      }

      // Check if agent is assigned to this lead
      const assignment = lead.assignment.assignedAgents.find(
        a => a.agentId.toString() === agentId.toString()
      );

      if (!assignment) {
        return 'You are not assigned to this lead.';
      }

      if (assignment.status !== 'offered') {
        return `This lead has already been ${assignment.status}.`;
      }

      // Accept the lead
      assignment.status = 'accepted';
      assignment.response = {
        action: 'accepted',
        respondedAt: new Date(),
        responseTime: Math.floor((Date.now() - assignment.assignedAt) / 60000) // minutes
      };

      lead.assignment.activeAgent = agentId;
      lead.status = 'in_progress';
      
      await lead.save();

      // Notify via WebSocket
      const agentWebSocketService = require('./websocket/agentWebSocketService');
      await agentWebSocketService.notifyLeadStatusUpdate(lead, agentId, 'accepted');

      return `✅ Lead ${leadNumber} accepted successfully! Check your email for buyer contact details.`;
    } catch (error) {
      logger.error('Handle accept lead error:', error);
      return 'Error accepting lead. Please try again or contact support.';
    }
  }

  /**
   * Handle decline lead command
   */
  async handleDeclineLead(agentId, leadNumber, reason) {
    try {
      const AgentLead = require('../models/AgentLead');
      const lead = await AgentLead.findOne({ leadNumber });
      
      if (!lead) {
        return 'Lead not found. Please check the lead number.';
      }

      const assignment = lead.assignment.assignedAgents.find(
        a => a.agentId.toString() === agentId.toString()
      );

      if (!assignment) {
        return 'You are not assigned to this lead.';
      }

      if (assignment.status !== 'offered') {
        return `This lead has already been ${assignment.status}.`;
      }

      // Decline the lead
      assignment.status = 'declined';
      assignment.response = {
        action: 'declined',
        reason: reason || 'No reason provided',
        respondedAt: new Date(),
        responseTime: Math.floor((Date.now() - assignment.assignedAt) / 60000)
      };
      
      await lead.save();

      // Reassign to next agent
      const leadDistributionService = require('./leadDistributionService');
      await leadDistributionService.reassignLead(lead._id, agentId);

      return `Lead ${leadNumber} declined. Thank you for your response.`;
    } catch (error) {
      logger.error('Handle decline lead error:', error);
      return 'Error declining lead. Please try again or contact support.';
    }
  }

  /**
   * Handle status request
   */
  async handleStatusRequest(agentId) {
    try {
      const agent = await Agent.findById(agentId);
      const AgentLead = require('../models/AgentLead');
      
      // Get active leads count
      const activeLeads = await AgentLead.countDocuments({
        'assignment.activeAgent': agentId,
        status: 'in_progress'
      });

      // Get today's stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayLeads = await AgentLead.countDocuments({
        'assignment.assignedAgents.agentId': agentId,
        'assignment.assignedAgents.assignedAt': { $gte: today }
      });

      return `📊 *Your Status*\n\n🎯 Tier: ${agent.performance.tier.toUpperCase()}\n⭐ Rating: ${agent.performance.rating.average}/5\n📈 Active Leads: ${activeLeads}\n📅 Today's Leads: ${todayLeads}\n💰 Pending Commission: $${agent.performance.metrics.pendingCommission || 0}`;
    } catch (error) {
      logger.error('Handle status request error:', error);
      return 'Error retrieving status. Please try again later.';
    }
  }

  /**
   * Get help message
   */
  getHelpMessage() {
    return `📱 *WhatsApp Commands*\n\n• ACCEPT [lead#] - Accept a lead\n• DECLINE [lead#] [reason] - Decline a lead\n• STATUS - Get your current status\n• HELP - Show this message\n\n_Example: ACCEPT LEAD123_`;
  }

  /**
   * Format time remaining
   */
  formatTimeRemaining(expiresAt) {
    const remaining = new Date(expiresAt) - Date.now();
    const minutes = Math.floor(remaining / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Format commission type
   */
  formatCommissionType(type) {
    const types = {
      base_commission: 'Base Commission',
      tier_bonus: 'Tier Bonus',
      new_supplier_bonus: 'New Supplier Bonus',
      new_buyer_bonus: 'New Buyer Bonus',
      first_deal_bonus: 'First Deal Bonus',
      high_value_bonus: 'High Value Bonus',
      quick_closure_bonus: 'Quick Closure Bonus',
      monthly_target_bonus: 'Monthly Target Bonus',
      recurring_commission: 'Recurring Commission'
    };
    return types[type] || type;
  }

  /**
   * Format status
   */
  formatStatus(status) {
    const statuses = {
      pending: '⏳ Pending',
      approved: '✅ Approved',
      paid: '💰 Paid',
      cancelled: '❌ Cancelled'
    };
    return statuses[status] || status;
  }

  /**
   * Log communication
   */
  async logCommunication(agentId, channel, message, data, result) {
    try {
      const communication = new AgentCommunication({
        agentId,
        channel,
        direction: 'outbound',
        messageInfo: {
          subject: `${data.messageType || 'Notification'} via ${channel}`,
          content: message,
          format: 'text',
          messageId: result.messageId
        },
        metadata: {
          provider: result.provider,
          fallback: result.fallback || false,
          templateUsed: data.messageType
        },
        delivery: {
          status: result.success ? 'sent' : 'failed',
          sentAt: new Date(),
          attempts: 1
        }
      });

      await communication.save();
    } catch (error) {
      logger.error('Log communication error:', error);
    }
  }
}

module.exports = new WhatsAppService();