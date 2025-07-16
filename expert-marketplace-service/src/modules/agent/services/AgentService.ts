import { AgentProfile, Lead, AgentCommission } from '../models';
import { Logger } from '../../../utils/logger';
import { CacheService } from '../../../services/CacheService';
import { 
  AgentRegistration, 
  LeadCreation,
  AgentStatus,
  AgentTier,
  LeadStatus,
  CommissionType,
  CommissionStatus
} from '../interfaces/agent.interface';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthenticationError
} from '../../../utils/errors';

const logger = new Logger('AgentService');

export class AgentService {
  private cacheService: CacheService;

  constructor() {
    this.cacheService = new CacheService();
  }

  /**
   * Register new agent
   */
  async registerAgent(registrationData: AgentRegistration): Promise<{
    agent: any;
    agentCode: string;
  }> {
    try {
      // Check if email already exists
      const existingAgent = await AgentProfile.findOne({ 
        email: registrationData.email 
      });

      if (existingAgent) {
        throw new ConflictError('Email already registered');
      }

      // Check if WhatsApp number already exists
      const existingWhatsApp = await AgentProfile.findOne({ 
        whatsappNumber: registrationData.whatsappNumber 
      });

      if (existingWhatsApp) {
        throw new ConflictError('WhatsApp number already registered');
      }

      // Generate agent code
      const agentCode = await AgentProfile.generateAgentCode(
        registrationData.firstName,
        registrationData.lastName,
        registrationData.country
      );

      // Create user in main backend (mock for now)
      const userId = await this.createUserInMainBackend({
        email: registrationData.email,
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        role: 'agent'
      });

      // Create agent profile
      const agentProfile = new AgentProfile({
        userId,
        agentCode,
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        email: registrationData.email,
        phone: registrationData.phone,
        whatsappNumber: registrationData.whatsappNumber,
        location: {
          country: registrationData.country,
          state: registrationData.state,
          city: registrationData.city
        },
        coverageAreas: [registrationData.country], // Start with country
        experienceYears: registrationData.experienceYears,
        industryExperience: registrationData.industryExperience,
        productCategories: registrationData.productCategories,
        languages: registrationData.languages,
        hasBusinessRegistration: registrationData.hasBusinessRegistration,
        businessName: registrationData.businessName,
        existingSupplierConnections: registrationData.existingSupplierConnections,
        existingBuyerConnections: registrationData.existingBuyerConnections,
        networkDescription: registrationData.networkDescription,
        status: AgentStatus.PENDING
      });

      await agentProfile.save();

      logger.info('Agent registered successfully', {
        agentId: agentProfile._id,
        agentCode,
        email: registrationData.email
      });

      return {
        agent: agentProfile.toObject(),
        agentCode
      };
    } catch (error) {
      logger.error('Agent registration failed:', error);
      throw error;
    }
  }

  /**
   * Get agent profile
   */
  async getAgentProfile(agentId: string): Promise<any> {
    try {
      // Try cache first
      let agent = await this.cacheService.get(`agent:profile:${agentId}`);

      if (!agent) {
        agent = await AgentProfile.findById(agentId)
          .select('-documents.verified -__v')
          .lean();

        if (!agent) {
          throw new NotFoundError('Agent');
        }

        // Cache the result
        await this.cacheService.set(`agent:profile:${agentId}`, agent, { ttl: 3600 });
      }

      return agent;
    } catch (error) {
      logger.error('Get agent profile failed:', error);
      throw error;
    }
  }

  /**
   * Update agent profile
   */
  async updateAgentProfile(agentId: string, updateData: any): Promise<any> {
    try {
      const agent = await AgentProfile.findByIdAndUpdate(
        agentId,
        { $set: updateData, lastActiveAt: new Date() },
        { new: true, runValidators: true }
      ).select('-documents -__v');

      if (!agent) {
        throw new NotFoundError('Agent');
      }

      // Invalidate cache
      await this.cacheService.delete(`agent:profile:${agentId}`);

      logger.info('Agent profile updated', { agentId });

      return agent;
    } catch (error) {
      logger.error('Update agent profile failed:', error);
      throw error;
    }
  }

  /**
   * Get agent dashboard data
   */
  async getAgentDashboard(agentId: string): Promise<any> {
    try {
      const agent = await AgentProfile.findById(agentId)
        .select('firstName lastName tier tierPoints conversionRate totalCommissionsEarned totalLeads convertedLeads')
        .lean();

      if (!agent) {
        throw new NotFoundError('Agent');
      }

      // Get current month stats
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [monthlyLeads, activeLeads, pendingCommissions, recentLeads] = await Promise.all([
        Lead.countDocuments({
          agentId,
          createdAt: { $gte: startOfMonth }
        }),
        
        Lead.countDocuments({
          agentId,
          status: { $nin: [LeadStatus.WON, LeadStatus.LOST] }
        }),
        
        AgentCommission.aggregate([
          {
            $match: {
              agentId,
              status: { $in: [CommissionStatus.PENDING, CommissionStatus.APPROVED] }
            }
          },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$totalAmount' },
              count: { $sum: 1 }
            }
          }
        ]),
        
        Lead.find({
          agentId,
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('leadId companyName status estimatedTransactionValue createdAt')
        .lean()
      ]);

      const dashboardData = {
        agent: {
          name: `${agent.firstName} ${agent.lastName}`,
          tier: agent.tier,
          tierPoints: agent.tierPoints,
          conversionRate: agent.conversionRate,
          totalEarnings: agent.totalCommissionsEarned
        },
        stats: {
          totalLeads: agent.totalLeads,
          convertedLeads: agent.convertedLeads,
          monthlyLeads,
          activeLeads,
          pendingCommissions: {
            amount: pendingCommissions[0]?.totalAmount || 0,
            count: pendingCommissions[0]?.count || 0
          }
        },
        recentLeads,
        tierProgress: agent.tierProgress
      };

      return dashboardData;
    } catch (error) {
      logger.error('Get agent dashboard failed:', error);
      throw error;
    }
  }

  /**
   * Create new lead
   */
  async createLead(agentId: string, leadData: LeadCreation): Promise<any> {
    try {
      // Verify agent exists and is active
      const agent = await AgentProfile.findById(agentId);
      if (!agent || agent.status !== AgentStatus.ACTIVE) {
        throw new ValidationError('Agent must be active to create leads');
      }

      // Check if agent has reached daily lead limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayLeadCount = await Lead.countDocuments({
        agentId,
        assignedAt: { $gte: today }
      });

      if (todayLeadCount >= agent.maxLeadsPerDay) {
        throw new ValidationError(`Daily lead limit of ${agent.maxLeadsPerDay} reached`);
      }

      // Create lead
      const lead = new Lead({
        ...leadData,
        agentId,
        assignedAt: new Date(),
        assignmentReason: 'Created by agent'
      });

      await lead.save();

      // Update agent stats
      await AgentProfile.findByIdAndUpdate(agentId, {
        $inc: { totalLeads: 1 },
        lastActiveAt: new Date()
      });

      logger.info('Lead created successfully', {
        leadId: lead.leadId,
        agentId,
        company: leadData.companyName
      });

      return lead;
    } catch (error) {
      logger.error('Create lead failed:', error);
      throw error;
    }
  }

  /**
   * Get agent leads
   */
  async getAgentLeads(
    agentId: string,
    filters: {
      status?: LeadStatus;
      temperature?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;

      const query: any = { agentId };
      
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.temperature) {
        query.temperature = filters.temperature;
      }

      const leads = await Lead.find(query)
        .sort({ priority: -1, nextFollowUpDate: 1, createdAt: -1 })
        .limit(limit * page)
        .skip((page - 1) * limit)
        .lean();

      const total = await Lead.countDocuments(query);

      // Add calculated fields
      const enhancedLeads = leads.map(lead => ({
        ...lead,
        daysInPipeline: this.calculateDaysInPipeline(lead.assignedAt, lead.actualCloseDate),
        isOverdue: lead.nextFollowUpDate && lead.nextFollowUpDate < new Date(),
        leadScore: this.calculateLeadScore(lead)
      }));

      return {
        leads: enhancedLeads,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Get agent leads failed:', error);
      throw error;
    }
  }

  /**
   * Update lead status
   */
  async updateLeadStatus(
    agentId: string,
    leadId: string,
    status: LeadStatus,
    notes?: string,
    nextFollowUpDate?: Date
  ): Promise<any> {
    try {
      const lead = await Lead.findOne({ _id: leadId, agentId });
      if (!lead) {
        throw new NotFoundError('Lead');
      }

      await lead.updateStatus(status, notes, nextFollowUpDate);

      // Update agent performance if lead is won
      if (status === LeadStatus.WON) {
        const agent = await AgentProfile.findById(agentId);
        if (agent) {
          agent.convertedLeads += 1;
          await agent.updatePerformanceMetrics();
          
          // Add tier points for conversion
          await agent.addTierPoints(10, 'Lead conversion');
        }
      }

      logger.info('Lead status updated', {
        leadId: lead.leadId,
        agentId,
        oldStatus: lead.status,
        newStatus: status
      });

      return lead;
    } catch (error) {
      logger.error('Update lead status failed:', error);
      throw error;
    }
  }

  /**
   * Add lead interaction
   */
  async addLeadInteraction(
    agentId: string,
    leadId: string,
    interaction: {
      type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'note';
      description: string;
      outcome?: string;
      nextAction?: string;
    }
  ): Promise<any> {
    try {
      const lead = await Lead.findOne({ _id: leadId, agentId });
      if (!lead) {
        throw new NotFoundError('Lead');
      }

      await lead.addInteraction(
        interaction.type,
        interaction.description,
        interaction.outcome,
        interaction.nextAction
      );

      // Update agent last active
      await AgentProfile.findByIdAndUpdate(agentId, {
        lastActiveAt: new Date()
      });

      logger.info('Lead interaction added', {
        leadId: lead.leadId,
        agentId,
        type: interaction.type
      });

      return lead;
    } catch (error) {
      logger.error('Add lead interaction failed:', error);
      throw error;
    }
  }

  /**
   * Get agent analytics
   */
  async getAgentAnalytics(
    agentId: string,
    period: '7d' | '30d' | '90d' | '1y' = '30d'
  ): Promise<any> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      
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

      const [leadAnalytics, commissionSummary, agent] = await Promise.all([
        Lead.getLeadAnalytics(agentId, startDate, endDate),
        AgentCommission.getAgentCommissionSummary(agentId, startDate, endDate),
        AgentProfile.findById(agentId).select('tier tierPoints performanceScore').lean()
      ]);

      const analytics = {
        period,
        dateRange: { startDate, endDate },
        leads: leadAnalytics,
        commissions: commissionSummary,
        performance: {
          tier: agent?.tier,
          tierPoints: agent?.tierPoints,
          performanceScore: agent?.performanceScore
        }
      };

      return analytics;
    } catch (error) {
      logger.error('Get agent analytics failed:', error);
      throw error;
    }
  }

  /**
   * Calculate commission for agent
   */
  async calculateCommission(
    agentId: string,
    transactionValue: number,
    leadId?: string,
    orderId?: string,
    rfqId?: string
  ): Promise<any> {
    try {
      const agent = await AgentProfile.findById(agentId);
      if (!agent) {
        throw new NotFoundError('Agent');
      }

      // Get base commission rate (could be configurable)
      const baseRate = this.getCommissionRate(transactionValue, agent.tier);
      
      // Get tier multiplier
      const tierMultipliers = {
        [AgentTier.BRONZE]: 1.0,
        [AgentTier.SILVER]: 1.1,
        [AgentTier.GOLD]: 1.25,
        [AgentTier.PLATINUM]: 1.5
      };

      const tierMultiplier = tierMultipliers[agent.tier] || 1.0;

      // Calculate commission
      const commissionCalculation = AgentCommission.calculateCommission(
        transactionValue,
        baseRate,
        tierMultiplier
      );

      // Create commission record
      const commission = new AgentCommission({
        agentId,
        leadId,
        orderId,
        rfqId,
        type: CommissionType.TRANSACTION,
        baseAmount: transactionValue,
        commissionRate: baseRate,
        commissionAmount: commissionCalculation.commissionAmount,
        bonusAmount: commissionCalculation.bonusAmount,
        totalAmount: commissionCalculation.totalAmount,
        currency: 'USD',
        transactionValue,
        transactionDate: new Date(),
        tierMultiplier,
        status: CommissionStatus.PENDING
      });

      await commission.save();

      // Update agent total earnings
      await AgentProfile.findByIdAndUpdate(agentId, {
        $inc: { totalCommissionsEarned: commission.totalAmount }
      });

      logger.info('Commission calculated', {
        commissionId: commission.commissionId,
        agentId,
        amount: commission.totalAmount
      });

      return commission;
    } catch (error) {
      logger.error('Calculate commission failed:', error);
      throw error;
    }
  }

  /**
   * Auto-assign leads to agents
   */
  async autoAssignLeads(): Promise<number> {
    try {
      // Get unassigned leads (this would come from RFQ system or manual entry)
      const unassignedLeads = await this.getUnassignedLeads();
      let assignedCount = 0;

      for (const leadData of unassignedLeads) {
        try {
          // Find best agent for this lead
          const availableAgents = await AgentProfile.findAvailableForLeadAssignment({
            productCategory: leadData.productCategories[0],
            location: leadData.location.country
          });

          if (availableAgents.length > 0) {
            const bestAgent = availableAgents[0];
            
            // Create lead
            const lead = new Lead({
              ...leadData,
              agentId: bestAgent._id,
              assignedAt: new Date(),
              assignmentReason: 'Auto-assigned based on criteria'
            });

            await lead.save();

            // Update agent stats
            await AgentProfile.findByIdAndUpdate(bestAgent._id, {
              $inc: { totalLeads: 1 }
            });

            assignedCount++;
            
            logger.info('Lead auto-assigned', {
              leadId: lead.leadId,
              agentId: bestAgent._id,
              agentCode: bestAgent.agentCode
            });
          }
        } catch (error) {
          logger.error('Failed to assign individual lead:', error);
        }
      }

      logger.info(`Auto-assigned ${assignedCount} leads`);
      return assignedCount;
    } catch (error) {
      logger.error('Auto-assign leads failed:', error);
      throw error;
    }
  }

  // Helper methods

  private calculateDaysInPipeline(startDate: Date, endDate?: Date): number {
    const end = endDate || new Date();
    const diffTime = Math.abs(end.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculateLeadScore(lead: any): number {
    let score = 0;

    // Estimated value scoring
    if (lead.estimatedTransactionValue) {
      score += Math.min(lead.estimatedTransactionValue / 1000, 50);
    }

    // Urgency scoring
    const urgencyScores = { urgent: 30, high: 20, medium: 10, low: 5 };
    score += urgencyScores[lead.urgency] || 0;

    // Temperature scoring
    const temperatureScores = { hot: 30, warm: 20, cold: 10 };
    score += temperatureScores[lead.temperature] || 0;

    // Interaction frequency
    score += Math.min(lead.interactionCount * 2, 20);

    return Math.min(Math.round(score), 100);
  }

  private getCommissionRate(transactionValue: number, tier: AgentTier): number {
    // Base rates by transaction value
    let baseRate = 2.0; // 2% default
    
    if (transactionValue > 100000) {
      baseRate = 1.5;
    } else if (transactionValue > 50000) {
      baseRate = 2.0;
    } else if (transactionValue > 10000) {
      baseRate = 2.5;
    } else {
      baseRate = 3.0;
    }

    return baseRate;
  }

  private async getUnassignedLeads(): Promise<any[]> {
    // This would integrate with the main RFQ system or manual lead entry
    // For now, return empty array
    return [];
  }

  private async createUserInMainBackend(userData: any): Promise<string> {
    // This would integrate with the main FoodXchange backend
    return `user_${Date.now()}`;
  }
}