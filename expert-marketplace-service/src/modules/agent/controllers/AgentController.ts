import { Request, Response } from 'express';
import { AgentService } from '../services/AgentService';
import { WhatsAppService } from '../services/WhatsAppService';
import { Logger } from '../../../utils/logger';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { 
  ValidationError, 
  AuthenticationError, 
  NotFoundError 
} from '../../../utils/errors';
import { 
  AgentRegistration, 
  LeadCreation,
  LeadStatus 
} from '../interfaces/agent.interface';

const logger = new Logger('AgentController');

export class AgentController {
  private agentService: AgentService;
  private whatsAppService: WhatsAppService;

  constructor() {
    this.agentService = new AgentService();
    this.whatsAppService = new WhatsAppService();
  }

  /**
   * Register new agent
   */
  registerAgent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const registrationData: AgentRegistration = req.body;

    try {
      const result = await this.agentService.registerAgent(registrationData);

      logger.info('Agent registration successful', {
        agentId: result.agent._id,
        agentCode: result.agentCode
      });

      res.status(201).json({
        success: true,
        message: 'Agent registration successful. Please check your WhatsApp for verification instructions.',
        data: {
          agent: {
            id: result.agent._id,
            agentCode: result.agentCode,
            firstName: result.agent.firstName,
            lastName: result.agent.lastName,
            email: result.agent.email,
            status: result.agent.status,
            tier: result.agent.tier
          }
        }
      });
    } catch (error) {
      logger.error('Agent registration failed:', error);
      throw error;
    }
  });

  /**
   * Get agent dashboard
   */
  getDashboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    try {
      const dashboardData = await this.agentService.getAgentDashboard(req.user.agentId);

      res.status(200).json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      logger.error('Get agent dashboard failed:', error);
      throw error;
    }
  });

  /**
   * Get agent profile
   */
  getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { agentId } = req.params;
    const requestingAgentId = req.user?.agentId;

    // Allow agents to view their own profile or public profiles
    const targetAgentId = agentId || requestingAgentId;
    
    if (!targetAgentId) {
      throw new ValidationError('Agent ID required');
    }

    try {
      const agent = await this.agentService.getAgentProfile(targetAgentId);

      // Filter sensitive data if viewing another agent's profile
      if (agentId && agentId !== requestingAgentId) {
        delete agent.email;
        delete agent.phone;
        delete agent.documents;
        delete agent.totalCommissionsEarned;
      }

      res.status(200).json({
        success: true,
        data: { agent }
      });
    } catch (error) {
      logger.error('Get agent profile failed:', error);
      throw error;
    }
  });

  /**
   * Update agent profile
   */
  updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const updateData = req.body;

    try {
      const agent = await this.agentService.updateAgentProfile(
        req.user.agentId,
        updateData
      );

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: { agent }
      });
    } catch (error) {
      logger.error('Update agent profile failed:', error);
      throw error;
    }
  });

  /**
   * Create new lead
   */
  createLead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const leadData: LeadCreation = req.body;

    try {
      const lead = await this.agentService.createLead(req.user.agentId, leadData);

      res.status(201).json({
        success: true,
        message: 'Lead created successfully',
        data: { lead }
      });
    } catch (error) {
      logger.error('Create lead failed:', error);
      throw error;
    }
  });

  /**
   * Get agent leads
   */
  getLeads = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { status, temperature, page, limit } = req.query;

    try {
      const result = await this.agentService.getAgentLeads(req.user.agentId, {
        status: status as LeadStatus,
        temperature: temperature as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Get agent leads failed:', error);
      throw error;
    }
  });

  /**
   * Update lead status
   */
  updateLeadStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { leadId } = req.params;
    const { status, notes, nextFollowUpDate } = req.body;

    if (!status) {
      throw new ValidationError('Status is required');
    }

    try {
      const lead = await this.agentService.updateLeadStatus(
        req.user.agentId,
        leadId,
        status,
        notes,
        nextFollowUpDate ? new Date(nextFollowUpDate) : undefined
      );

      res.status(200).json({
        success: true,
        message: 'Lead status updated successfully',
        data: { lead }
      });
    } catch (error) {
      logger.error('Update lead status failed:', error);
      throw error;
    }
  });

  /**
   * Add lead interaction
   */
  addLeadInteraction = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { leadId } = req.params;
    const interaction = req.body;

    if (!interaction.type || !interaction.description) {
      throw new ValidationError('Interaction type and description are required');
    }

    try {
      const lead = await this.agentService.addLeadInteraction(
        req.user.agentId,
        leadId,
        interaction
      );

      res.status(200).json({
        success: true,
        message: 'Interaction added successfully',
        data: { lead }
      });
    } catch (error) {
      logger.error('Add lead interaction failed:', error);
      throw error;
    }
  });

  /**
   * Get agent analytics
   */
  getAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { period = '30d' } = req.query;

    try {
      const analytics = await this.agentService.getAgentAnalytics(
        req.user.agentId,
        period as '7d' | '30d' | '90d' | '1y'
      );

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error) {
      logger.error('Get agent analytics failed:', error);
      throw error;
    }
  });

  /**
   * Send WhatsApp message
   */
  sendWhatsAppMessage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { to, message, leadId } = req.body;

    if (!to || !message) {
      throw new ValidationError('Recipient and message are required');
    }

    try {
      const result = await this.whatsAppService.sendTextMessage(
        req.user.agentId,
        to,
        message,
        leadId
      );

      res.status(200).json({
        success: true,
        message: 'WhatsApp message sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Send WhatsApp message failed:', error);
      throw error;
    }
  });

  /**
   * Send WhatsApp template message
   */
  sendTemplateMessage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { to, templateName, parameters = [], leadId } = req.body;

    if (!to || !templateName) {
      throw new ValidationError('Recipient and template name are required');
    }

    try {
      const result = await this.whatsAppService.sendTemplateMessage(
        req.user.agentId,
        to,
        templateName,
        parameters,
        leadId
      );

      res.status(200).json({
        success: true,
        message: 'Template message sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Send template message failed:', error);
      throw error;
    }
  });

  /**
   * Send bulk WhatsApp messages
   */
  sendBulkMessages = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { contacts, message, campaignId } = req.body;

    if (!contacts || !Array.isArray(contacts) || !message) {
      throw new ValidationError('Contacts array and message are required');
    }

    try {
      const result = await this.whatsAppService.sendBulkMessages(
        req.user.agentId,
        contacts,
        message,
        campaignId
      );

      res.status(200).json({
        success: true,
        message: 'Bulk messages sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Send bulk messages failed:', error);
      throw error;
    }
  });

  /**
   * Get WhatsApp message templates
   */
  getMessageTemplates = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const templates = await this.whatsAppService.getMessageTemplates();

      res.status(200).json({
        success: true,
        data: { templates }
      });
    } catch (error) {
      logger.error('Get message templates failed:', error);
      throw error;
    }
  });

  /**
   * Get WhatsApp message analytics
   */
  getMessageAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { days = 30 } = req.query;

    try {
      const analytics = await this.whatsAppService.getAgentMessageAnalytics(
        req.user.agentId,
        parseInt(days as string)
      );

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error) {
      logger.error('Get message analytics failed:', error);
      throw error;
    }
  });

  /**
   * WhatsApp webhook handler
   */
  handleWhatsAppWebhook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Verify webhook (for Facebook WhatsApp Business API)
      if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token']) {
        const verifyToken = req.query['hub.verify_token'];
        const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'your_verify_token';
        
        if (verifyToken === expectedToken) {
          res.status(200).send(req.query['hub.challenge']);
          return;
        } else {
          res.status(403).send('Verification failed');
          return;
        }
      }

      // Process webhook events
      await this.whatsAppService.processWebhookEvent(req.body);

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('WhatsApp webhook handler failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Get agent commissions
   */
  getCommissions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { status, type, page = 1, limit = 20 } = req.query;

    try {
      const { AgentCommission } = await import('../models');
      
      const query: any = { agentId: req.user.agentId };
      if (status) query.status = status;
      if (type) query.type = type;

      const commissions = await AgentCommission.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit) * Number(page))
        .skip((Number(page) - 1) * Number(limit))
        .populate('leadId', 'leadId companyName')
        .lean();

      const total = await AgentCommission.countDocuments(query);

      res.status(200).json({
        success: true,
        data: {
          commissions,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      logger.error('Get agent commissions failed:', error);
      throw error;
    }
  });

  /**
   * Get commission summary
   */
  getCommissionSummary = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const { period } = req.query;

    try {
      const { AgentCommission } = await import('../models');
      
      let startDate, endDate;
      if (period) {
        endDate = new Date();
        startDate = new Date();
        
        switch (period) {
          case '7d':
            startDate.setDate(endDate.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(endDate.getDate() - 30);
            break;
          case '90d':
            startDate.setDate(endDate.getDate() - 90);
            break;
          case '1y':
            startDate.setFullYear(endDate.getFullYear() - 1);
            break;
        }
      }

      const summary = await AgentCommission.getAgentCommissionSummary(
        req.user.agentId,
        startDate,
        endDate
      );

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error('Get commission summary failed:', error);
      throw error;
    }
  });

  /**
   * Upload agent documents
   */
  uploadDocuments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.agentId) {
      throw new AuthenticationError('Agent authentication required');
    }

    const files = req.files as Express.Multer.File[];
    const { documentTypes } = req.body;

    if (!files || files.length === 0) {
      throw new ValidationError('Documents required');
    }

    try {
      const documents = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const documentType = documentTypes[i];

        // Upload to Azure Storage (placeholder)
        const documentUrl = await this.uploadToAzureStorage(file);

        documents.push({
          type: documentType,
          name: file.originalname,
          url: documentUrl,
          uploadedAt: new Date(),
          verified: false
        });
      }

      // Add documents to agent profile
      const { AgentProfile } = await import('../models');
      const agent = await AgentProfile.findByIdAndUpdate(
        req.user.agentId,
        { $push: { documents: { $each: documents } } },
        { new: true }
      ).select('documents verificationStatus');

      if (!agent) {
        throw new NotFoundError('Agent');
      }

      // Update verification status to pending if not already verified
      if (agent.verificationStatus === 'unverified') {
        agent.verificationStatus = 'pending';
        await agent.save();
      }

      res.status(200).json({
        success: true,
        message: 'Documents uploaded successfully. Verification is pending review.',
        data: {
          documents: agent.documents,
          verificationStatus: agent.verificationStatus
        }
      });
    } catch (error) {
      logger.error('Upload agent documents failed:', error);
      throw error;
    }
  });

  /**
   * Placeholder for Azure Storage upload
   */
  private async uploadToAzureStorage(file: Express.Multer.File): Promise<string> {
    // This would integrate with Azure Blob Storage
    return `https://foodxchange.blob.core.windows.net/agents/${Date.now()}-${file.originalname}`;
  }
}