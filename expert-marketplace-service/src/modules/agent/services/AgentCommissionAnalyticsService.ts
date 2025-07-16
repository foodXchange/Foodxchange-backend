import { Logger } from '../../../utils/logger';
import { advancedCacheService } from '../../../services/AdvancedCacheService';
import { AgentProfile } from '../models/AgentProfile.model';
import { AgentCommission } from '../models/AgentCommission.model';
import { Lead } from '../models/Lead.model';
import { ServiceBooking } from '../../../models/ServiceBooking.model';

const logger = new Logger('AgentCommissionAnalyticsService');

export interface CommissionTier {
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  baseRate: number;
  bonusMultiplier: number;
  requirements: {
    monthlyRevenue?: number;
    monthlyConversions?: number;
    customerSatisfaction?: number;
    retentionRate?: number;
  };
  benefits: string[];
}

export interface CommissionCalculation {
  leadId: string;
  agentId: string;
  baseCommission: number;
  bonuses: {
    type: string;
    amount: number;
    reason: string;
  }[];
  penalties: {
    type: string;
    amount: number;
    reason: string;
  }[];
  tierMultiplier: number;
  finalCommission: number;
  calculatedAt: Date;
  payoutDate: Date;
}

export interface AgentPerformanceMetrics {
  agentId: string;
  period: {
    start: Date;
    end: Date;
    type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  };
  metrics: {
    // Revenue Metrics
    totalRevenue: number;
    commissionEarned: number;
    averageCommissionPerLead: number;
    revenueGrowth: number;
    
    // Conversion Metrics
    leadsGenerated: number;
    leadsConverted: number;
    conversionRate: number;
    averageLeadValue: number;
    
    // Quality Metrics
    customerSatisfactionScore: number;
    retentionRate: number;
    refundRate: number;
    complaintRate: number;
    
    // Activity Metrics
    activeDays: number;
    averageResponseTime: number;
    followUpRate: number;
    
    // Ranking
    rankInTier: number;
    rankOverall: number;
  };
  achievements: {
    id: string;
    title: string;
    description: string;
    earnedAt: Date;
    value?: number;
  }[];
  trends: {
    metric: string;
    trend: 'up' | 'down' | 'stable';
    changePercentage: number;
  }[];
}

export interface CommissionPayout {
  payoutId: string;
  agentId: string;
  period: {
    start: Date;
    end: Date;
  };
  commissions: CommissionCalculation[];
  totalAmount: number;
  fees: {
    type: string;
    amount: number;
  }[];
  netAmount: number;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  paymentMethod: string;
  paymentReference?: string;
  processedAt?: Date;
  failureReason?: string;
}

export interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  tier: string;
  score: number;
  metric: string;
  rank: number;
  avatar?: string;
  region?: string;
}

export interface AgentAnalyticsDashboard {
  agent: {
    id: string;
    name: string;
    tier: string;
    status: string;
    joinedAt: Date;
  };
  currentPeriod: AgentPerformanceMetrics;
  previousPeriod: AgentPerformanceMetrics;
  goals: {
    metric: string;
    target: number;
    current: number;
    progress: number;
    deadline: Date;
  }[];
  recentCommissions: CommissionCalculation[];
  upcomingPayout: CommissionPayout;
  leaderboards: {
    tier: LeaderboardEntry[];
    overall: LeaderboardEntry[];
    regional?: LeaderboardEntry[];
  };
  recommendations: {
    type: 'improvement' | 'opportunity' | 'recognition';
    title: string;
    description: string;
    actionItems: string[];
  }[];
}

export class AgentCommissionAnalyticsService {

  private commissionTiers: Map<string, CommissionTier> = new Map();

  constructor() {
    this.initializeCommissionTiers();
  }

  /**
   * Calculate commission for a converted lead
   */
  async calculateCommission(
    leadId: string,
    finalAmount: number,
    conversionData?: Record<string, any>
  ): Promise<CommissionCalculation> {
    try {
      const lead = await Lead.findById(leadId);
      if (!lead) {
        throw new Error('Lead not found');
      }

      const agent = await AgentProfile.findById(lead.assignedAgent);
      if (!agent) {
        throw new Error('Agent not found');
      }

      const tier = this.commissionTiers.get(agent.tier);
      if (!tier) {
        throw new Error('Invalid agent tier');
      }

      // Base commission calculation
      const baseCommission = finalAmount * (tier.baseRate / 100);

      // Calculate bonuses
      const bonuses = await this.calculateBonuses(lead, agent, finalAmount, conversionData);

      // Calculate penalties
      const penalties = await this.calculatePenalties(lead, agent, conversionData);

      // Apply tier multiplier
      const tierMultiplier = tier.bonusMultiplier;
      const bonusAmount = bonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
      const penaltyAmount = penalties.reduce((sum, penalty) => sum + penalty.amount, 0);

      const finalCommission = Math.max(0, (baseCommission + bonusAmount - penaltyAmount) * tierMultiplier);

      const calculation: CommissionCalculation = {
        leadId,
        agentId: agent._id.toString(),
        baseCommission,
        bonuses,
        penalties,
        tierMultiplier,
        finalCommission,
        calculatedAt: new Date(),
        payoutDate: this.calculatePayoutDate()
      };

      // Store commission calculation
      await this.storeCommissionCalculation(calculation);

      // Update agent performance metrics
      await this.updateAgentMetrics(agent._id.toString(), calculation);

      logger.info('Commission calculated', { 
        leadId, 
        agentId: agent._id, 
        finalCommission 
      });

      return calculation;
    } catch (error) {
      logger.error('Error calculating commission:', error);
      throw error;
    }
  }

  /**
   * Get agent performance metrics for a specific period
   */
  async getAgentPerformanceMetrics(
    agentId: string,
    periodType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' = 'monthly',
    startDate?: Date,
    endDate?: Date
  ): Promise<AgentPerformanceMetrics> {
    try {
      const period = this.calculatePeriod(periodType, startDate, endDate);
      const cacheKey = `agent_metrics:${agentId}:${periodType}:${period.start.toISOString()}`;
      
      const cached = await advancedCacheService.get<AgentPerformanceMetrics>(cacheKey);
      if (cached) return cached;

      const [
        revenueMetrics,
        conversionMetrics,
        qualityMetrics,
        activityMetrics,
        rankings,
        achievements,
        trends
      ] = await Promise.all([
        this.calculateRevenueMetrics(agentId, period),
        this.calculateConversionMetrics(agentId, period),
        this.calculateQualityMetrics(agentId, period),
        this.calculateActivityMetrics(agentId, period),
        this.calculateAgentRankings(agentId),
        this.getAgentAchievements(agentId, period),
        this.calculateMetricTrends(agentId, period)
      ]);

      const metrics: AgentPerformanceMetrics = {
        agentId,
        period: {
          start: period.start,
          end: period.end,
          type: periodType
        },
        metrics: {
          ...revenueMetrics,
          ...conversionMetrics,
          ...qualityMetrics,
          ...activityMetrics,
          ...rankings
        },
        achievements,
        trends
      };

      // Cache for appropriate duration
      const cacheTTL = this.getCacheTTLForPeriod(periodType);
      await advancedCacheService.set(cacheKey, metrics, {
        ttl: cacheTTL,
        tags: ['agent_metrics', `agent:${agentId}`, periodType]
      });

      return metrics;
    } catch (error) {
      logger.error('Error getting agent performance metrics:', error);
      throw error;
    }
  }

  /**
   * Process commission payouts for agents
   */
  async processCommissionPayouts(
    period: { start: Date; end: Date },
    agentIds?: string[]
  ): Promise<CommissionPayout[]> {
    try {
      const agents = agentIds ? 
        await AgentProfile.find({ _id: { $in: agentIds } }) :
        await AgentProfile.find({ status: 'active' });

      const payouts: CommissionPayout[] = [];

      for (const agent of agents) {
        const payout = await this.calculateAgentPayout(agent._id.toString(), period);
        if (payout.totalAmount > 0) {
          payouts.push(payout);
          await this.initiatePayment(payout);
        }
      }

      logger.info('Commission payouts processed', { 
        period, 
        agentCount: agents.length, 
        totalPayouts: payouts.length 
      });

      return payouts;
    } catch (error) {
      logger.error('Error processing commission payouts:', error);
      throw error;
    }
  }

  /**
   * Generate leaderboards for different metrics
   */
  async generateLeaderboards(
    period: { start: Date; end: Date },
    metric: 'revenue' | 'conversions' | 'satisfaction' | 'growth' = 'revenue',
    limit: number = 50
  ): Promise<{
    overall: LeaderboardEntry[];
    byTier: Record<string, LeaderboardEntry[]>;
    byRegion: Record<string, LeaderboardEntry[]>;
  }> {
    try {
      const cacheKey = `leaderboards:${metric}:${period.start.toISOString()}:${period.end.toISOString()}`;
      const cached = await advancedCacheService.get(cacheKey);
      
      if (cached) return cached;

      const agents = await AgentProfile.find({ status: 'active' });
      const leaderboardData = [];

      for (const agent of agents) {
        const metrics = await this.getAgentPerformanceMetrics(
          agent._id.toString(), 
          'monthly', 
          period.start, 
          period.end
        );

        const score = this.getMetricScore(metrics, metric);
        
        leaderboardData.push({
          agentId: agent._id.toString(),
          agentName: agent.personalInfo.fullName,
          tier: agent.tier,
          score,
          metric,
          rank: 0, // Will be calculated after sorting
          avatar: agent.personalInfo.profilePicture,
          region: agent.personalInfo.region
        });
      }

      // Sort by score and assign ranks
      leaderboardData.sort((a, b) => b.score - a.score);
      leaderboardData.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      const overall = leaderboardData.slice(0, limit);

      // Group by tier
      const byTier: Record<string, LeaderboardEntry[]> = {};
      ['bronze', 'silver', 'gold', 'platinum'].forEach(tier => {
        byTier[tier] = leaderboardData
          .filter(entry => entry.tier === tier)
          .slice(0, Math.min(20, limit));
      });

      // Group by region
      const byRegion: Record<string, LeaderboardEntry[]> = {};
      const regions = [...new Set(leaderboardData.map(entry => entry.region).filter(Boolean))];
      regions.forEach(region => {
        byRegion[region] = leaderboardData
          .filter(entry => entry.region === region)
          .slice(0, Math.min(20, limit));
      });

      const result = { overall, byTier, byRegion };

      // Cache for 1 hour
      await advancedCacheService.set(cacheKey, result, {
        ttl: 3600,
        tags: ['leaderboards', metric, 'rankings']
      });

      return result;
    } catch (error) {
      logger.error('Error generating leaderboards:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive agent analytics dashboard
   */
  async getAgentAnalyticsDashboard(agentId: string): Promise<AgentAnalyticsDashboard> {
    try {
      const agent = await AgentProfile.findById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      const [
        currentMetrics,
        previousMetrics,
        goals,
        recentCommissions,
        upcomingPayout,
        leaderboards,
        recommendations
      ] = await Promise.all([
        this.getAgentPerformanceMetrics(agentId, 'monthly'),
        this.getAgentPerformanceMetrics(agentId, 'monthly', 
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
          new Date(Date.now() - 24 * 60 * 60 * 1000)
        ),
        this.getAgentGoals(agentId),
        this.getRecentCommissions(agentId, 10),
        this.getUpcomingPayout(agentId),
        this.getAgentLeaderboardPositions(agentId),
        this.generateAgentRecommendations(agentId)
      ]);

      return {
        agent: {
          id: agentId,
          name: agent.personalInfo.fullName,
          tier: agent.tier,
          status: agent.status,
          joinedAt: agent.createdAt
        },
        currentPeriod: currentMetrics,
        previousPeriod: previousMetrics,
        goals,
        recentCommissions,
        upcomingPayout,
        leaderboards,
        recommendations
      };
    } catch (error) {
      logger.error('Error getting agent analytics dashboard:', error);
      throw error;
    }
  }

  /**
   * Update agent tier based on performance
   */
  async updateAgentTier(agentId: string): Promise<void> {
    try {
      const agent = await AgentProfile.findById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      const metrics = await this.getAgentPerformanceMetrics(agentId, 'monthly');
      const currentTier = this.commissionTiers.get(agent.tier);
      
      // Check for tier upgrades
      const newTier = this.evaluateTierUpgrade(metrics, agent.tier);
      
      if (newTier !== agent.tier) {
        await AgentProfile.findByIdAndUpdate(agentId, {
          tier: newTier,
          'tierHistory': {
            $push: {
              tier: newTier,
              effectiveDate: new Date(),
              reason: 'Performance-based upgrade'
            }
          }
        });

        // Send tier upgrade notification
        await this.sendTierUpgradeNotification(agentId, agent.tier, newTier);

        logger.info('Agent tier updated', { agentId, oldTier: agent.tier, newTier });
      }
    } catch (error) {
      logger.error('Error updating agent tier:', error);
      throw error;
    }
  }

  /**
   * Generate commission analytics report
   */
  async generateCommissionReport(
    period: { start: Date; end: Date },
    options?: {
      agentIds?: string[];
      tiers?: string[];
      regions?: string[];
      format?: 'summary' | 'detailed';
    }
  ): Promise<any> {
    try {
      const filters: any = {
        calculatedAt: { $gte: period.start, $lte: period.end }
      };

      if (options?.agentIds) {
        filters.agentId = { $in: options.agentIds };
      }

      const commissions = await AgentCommission.find(filters);

      const report = {
        period,
        summary: {
          totalCommissions: commissions.length,
          totalAmount: commissions.reduce((sum, c) => sum + c.amount, 0),
          averageCommission: commissions.length > 0 ? 
            commissions.reduce((sum, c) => sum + c.amount, 0) / commissions.length : 0,
          topPerformers: await this.getTopPerformers(commissions, 10)
        },
        breakdown: {
          byTier: await this.breakdownByTier(commissions),
          byRegion: await this.breakdownByRegion(commissions),
          bySource: await this.breakdownBySource(commissions)
        },
        trends: await this.analyzeCommissionTrends(period)
      };

      if (options?.format === 'detailed') {
        report['detailedCommissions'] = commissions;
      }

      return report;
    } catch (error) {
      logger.error('Error generating commission report:', error);
      throw error;
    }
  }

  // Private helper methods

  private initializeCommissionTiers(): void {
    const tiers: CommissionTier[] = [
      {
        tier: 'bronze',
        baseRate: 5, // 5%
        bonusMultiplier: 1.0,
        requirements: {
          monthlyRevenue: 0,
          monthlyConversions: 0,
          customerSatisfaction: 0,
          retentionRate: 0
        },
        benefits: ['Basic commission rate', 'Monthly payouts']
      },
      {
        tier: 'silver',
        baseRate: 7, // 7%
        bonusMultiplier: 1.1,
        requirements: {
          monthlyRevenue: 10000,
          monthlyConversions: 10,
          customerSatisfaction: 4.0,
          retentionRate: 80
        },
        benefits: ['Higher commission rate', 'Performance bonuses', 'Priority support']
      },
      {
        tier: 'gold',
        baseRate: 10, // 10%
        bonusMultiplier: 1.25,
        requirements: {
          monthlyRevenue: 25000,
          monthlyConversions: 25,
          customerSatisfaction: 4.3,
          retentionRate: 85
        },
        benefits: ['Premium commission rate', 'Quarterly bonuses', 'Advanced tools', 'Exclusive training']
      },
      {
        tier: 'platinum',
        baseRate: 15, // 15%
        bonusMultiplier: 1.5,
        requirements: {
          monthlyRevenue: 50000,
          monthlyConversions: 50,
          customerSatisfaction: 4.5,
          retentionRate: 90
        },
        benefits: ['Maximum commission rate', 'Monthly bonuses', 'Dedicated manager', 'VIP perks']
      }
    ];

    tiers.forEach(tier => {
      this.commissionTiers.set(tier.tier, tier);
    });

    logger.info('Commission tiers initialized', { tierCount: tiers.length });
  }

  private async calculateBonuses(
    lead: any,
    agent: any,
    finalAmount: number,
    conversionData?: Record<string, any>
  ): Promise<{ type: string; amount: number; reason: string; }[]> {
    const bonuses = [];

    // Fast conversion bonus
    const conversionTime = Date.now() - lead.createdAt.getTime();
    const daysToConvert = conversionTime / (1000 * 60 * 60 * 24);
    if (daysToConvert <= 7) {
      bonuses.push({
        type: 'fast_conversion',
        amount: finalAmount * 0.02, // 2% bonus
        reason: 'Converted within 7 days'
      });
    }

    // High-value deal bonus
    if (finalAmount >= 10000) {
      bonuses.push({
        type: 'high_value',
        amount: finalAmount * 0.01, // 1% bonus
        reason: 'High-value deal over $10,000'
      });
    }

    // First conversion bonus for new agents
    const existingCommissions = await AgentCommission.countDocuments({ agentId: agent._id });
    if (existingCommissions === 0) {
      bonuses.push({
        type: 'first_conversion',
        amount: 100, // $100 bonus
        reason: 'First successful conversion'
      });
    }

    return bonuses;
  }

  private async calculatePenalties(
    lead: any,
    agent: any,
    conversionData?: Record<string, any>
  ): Promise<{ type: string; amount: number; reason: string; }[]> {
    const penalties = [];

    // Late follow-up penalty
    const followUpDelay = conversionData?.followUpDelay || 0;
    if (followUpDelay > 48) { // More than 48 hours
      penalties.push({
        type: 'late_followup',
        amount: 50, // $50 penalty
        reason: 'Follow-up delay exceeded 48 hours'
      });
    }

    return penalties;
  }

  private calculatePayoutDate(): Date {
    // Next month's 15th
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    return nextMonth;
  }

  private async storeCommissionCalculation(calculation: CommissionCalculation): Promise<void> {
    const commission = new AgentCommission({
      leadId: calculation.leadId,
      agentId: calculation.agentId,
      amount: calculation.finalCommission,
      baseAmount: calculation.baseCommission,
      bonuses: calculation.bonuses,
      penalties: calculation.penalties,
      tierMultiplier: calculation.tierMultiplier,
      status: 'pending',
      earnedAt: calculation.calculatedAt,
      payoutDate: calculation.payoutDate
    });

    await commission.save();
  }

  private async updateAgentMetrics(agentId: string, calculation: CommissionCalculation): Promise<void> {
    // Update cached metrics
    const cachePattern = `agent_metrics:${agentId}:*`;
    await advancedCacheService.deleteByPattern(cachePattern);
  }

  private calculatePeriod(
    periodType: string,
    startDate?: Date,
    endDate?: Date
  ): { start: Date; end: Date } {
    if (startDate && endDate) {
      return { start: startDate, end: endDate };
    }

    const now = new Date();
    const start = new Date();
    const end = new Date();

    switch (periodType) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        start.setDate(now.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case 'monthly':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(start.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        start.setMonth(quarter * 3, 1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(start.getMonth() + 3, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'yearly':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(11, 31);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start, end };
  }

  private async calculateRevenueMetrics(agentId: string, period: any): Promise<any> {
    const commissions = await AgentCommission.find({
      agentId,
      earnedAt: { $gte: period.start, $lte: period.end }
    });

    const totalRevenue = commissions.reduce((sum, c) => sum + (c.leadValue || 0), 0);
    const commissionEarned = commissions.reduce((sum, c) => sum + c.amount, 0);

    return {
      totalRevenue,
      commissionEarned,
      averageCommissionPerLead: commissions.length > 0 ? commissionEarned / commissions.length : 0,
      revenueGrowth: 0 // Would calculate based on previous period
    };
  }

  private async calculateConversionMetrics(agentId: string, period: any): Promise<any> {
    const leads = await Lead.find({
      assignedAgent: agentId,
      createdAt: { $gte: period.start, $lte: period.end }
    });

    const convertedLeads = leads.filter(lead => lead.status === 'converted');
    const totalValue = convertedLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);

    return {
      leadsGenerated: leads.length,
      leadsConverted: convertedLeads.length,
      conversionRate: leads.length > 0 ? (convertedLeads.length / leads.length) * 100 : 0,
      averageLeadValue: convertedLeads.length > 0 ? totalValue / convertedLeads.length : 0
    };
  }

  private async calculateQualityMetrics(agentId: string, period: any): Promise<any> {
    // Mock implementation - would integrate with actual feedback systems
    return {
      customerSatisfactionScore: 4.2 + Math.random() * 0.6,
      retentionRate: 75 + Math.random() * 20,
      refundRate: Math.random() * 5,
      complaintRate: Math.random() * 2
    };
  }

  private async calculateActivityMetrics(agentId: string, period: any): Promise<any> {
    const leads = await Lead.find({
      assignedAgent: agentId,
      updatedAt: { $gte: period.start, $lte: period.end }
    });

    return {
      activeDays: Math.floor(Math.random() * 30) + 1,
      averageResponseTime: Math.random() * 24,
      followUpRate: Math.random() * 100
    };
  }

  private async calculateAgentRankings(agentId: string): Promise<any> {
    // Mock rankings - would calculate based on actual performance data
    return {
      rankInTier: Math.floor(Math.random() * 50) + 1,
      rankOverall: Math.floor(Math.random() * 200) + 1
    };
  }

  private async getAgentAchievements(agentId: string, period: any): Promise<any[]> {
    // Mock achievements
    return [
      {
        id: 'first_conversion',
        title: 'First Conversion',
        description: 'Successfully converted your first lead',
        earnedAt: new Date()
      }
    ];
  }

  private async calculateMetricTrends(agentId: string, period: any): Promise<any[]> {
    return [
      {
        metric: 'conversionRate',
        trend: 'up',
        changePercentage: 15.5
      }
    ];
  }

  private getCacheTTLForPeriod(periodType: string): number {
    switch (periodType) {
      case 'daily': return 3600; // 1 hour
      case 'weekly': return 7200; // 2 hours
      case 'monthly': return 14400; // 4 hours
      case 'quarterly': return 43200; // 12 hours
      case 'yearly': return 86400; // 24 hours
      default: return 3600;
    }
  }

  private async calculateAgentPayout(agentId: string, period: any): Promise<CommissionPayout> {
    const commissions = await AgentCommission.find({
      agentId,
      status: 'pending',
      payoutDate: { $lte: new Date() }
    });

    const totalAmount = commissions.reduce((sum, c) => sum + c.amount, 0);
    const fees = [
      { type: 'processing', amount: Math.min(totalAmount * 0.03, 25) }
    ];
    const netAmount = totalAmount - fees.reduce((sum, fee) => sum + fee.amount, 0);

    return {
      payoutId: `payout_${agentId}_${Date.now()}`,
      agentId,
      period,
      commissions: commissions.map(c => ({
        leadId: c.leadId,
        agentId: c.agentId,
        baseCommission: c.baseAmount || 0,
        bonuses: c.bonuses || [],
        penalties: c.penalties || [],
        tierMultiplier: c.tierMultiplier || 1,
        finalCommission: c.amount,
        calculatedAt: c.earnedAt,
        payoutDate: c.payoutDate
      })),
      totalAmount,
      fees,
      netAmount,
      status: 'pending',
      paymentMethod: 'bank_transfer'
    };
  }

  private async initiatePayment(payout: CommissionPayout): Promise<void> {
    // Mock payment initiation
    logger.info('Payment initiated', { payoutId: payout.payoutId, amount: payout.netAmount });
  }

  private getMetricScore(metrics: AgentPerformanceMetrics, metric: string): number {
    switch (metric) {
      case 'revenue': return metrics.metrics.totalRevenue;
      case 'conversions': return metrics.metrics.leadsConverted;
      case 'satisfaction': return metrics.metrics.customerSatisfactionScore;
      case 'growth': return metrics.metrics.revenueGrowth;
      default: return 0;
    }
  }

  private async getAgentGoals(agentId: string): Promise<any[]> {
    return [
      {
        metric: 'Monthly Revenue',
        target: 15000,
        current: 12500,
        progress: 83.3,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    ];
  }

  private async getRecentCommissions(agentId: string, limit: number): Promise<CommissionCalculation[]> {
    const commissions = await AgentCommission.find({ agentId })
      .sort({ earnedAt: -1 })
      .limit(limit);

    return commissions.map(c => ({
      leadId: c.leadId,
      agentId: c.agentId,
      baseCommission: c.baseAmount || 0,
      bonuses: c.bonuses || [],
      penalties: c.penalties || [],
      tierMultiplier: c.tierMultiplier || 1,
      finalCommission: c.amount,
      calculatedAt: c.earnedAt,
      payoutDate: c.payoutDate
    }));
  }

  private async getUpcomingPayout(agentId: string): Promise<CommissionPayout> {
    const period = this.calculatePeriod('monthly');
    return this.calculateAgentPayout(agentId, period);
  }

  private async getAgentLeaderboardPositions(agentId: string): Promise<any> {
    return {
      tier: [],
      overall: [],
      regional: []
    };
  }

  private async generateAgentRecommendations(agentId: string): Promise<any[]> {
    return [
      {
        type: 'improvement',
        title: 'Improve Response Time',
        description: 'Your average response time is above the recommended 2 hours',
        actionItems: ['Set up mobile notifications', 'Use quick response templates']
      }
    ];
  }

  private evaluateTierUpgrade(metrics: AgentPerformanceMetrics, currentTier: string): string {
    const tiers = ['bronze', 'silver', 'gold', 'platinum'];
    const currentIndex = tiers.indexOf(currentTier);
    
    for (let i = tiers.length - 1; i > currentIndex; i--) {
      const tier = this.commissionTiers.get(tiers[i]);
      if (tier && this.meetsTierRequirements(metrics, tier)) {
        return tiers[i];
      }
    }
    
    return currentTier;
  }

  private meetsTierRequirements(metrics: AgentPerformanceMetrics, tier: CommissionTier): boolean {
    const reqs = tier.requirements;
    const agentMetrics = metrics.metrics;

    return (
      (!reqs.monthlyRevenue || agentMetrics.totalRevenue >= reqs.monthlyRevenue) &&
      (!reqs.monthlyConversions || agentMetrics.leadsConverted >= reqs.monthlyConversions) &&
      (!reqs.customerSatisfaction || agentMetrics.customerSatisfactionScore >= reqs.customerSatisfaction) &&
      (!reqs.retentionRate || agentMetrics.retentionRate >= reqs.retentionRate)
    );
  }

  private async sendTierUpgradeNotification(agentId: string, oldTier: string, newTier: string): Promise<void> {
    logger.info('Tier upgrade notification sent', { agentId, oldTier, newTier });
  }

  private async getTopPerformers(commissions: any[], limit: number): Promise<any[]> {
    // Group by agent and calculate totals
    const agentTotals = new Map();
    
    commissions.forEach(commission => {
      const current = agentTotals.get(commission.agentId) || 0;
      agentTotals.set(commission.agentId, current + commission.amount);
    });

    return Array.from(agentTotals.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([agentId, amount]) => ({ agentId, amount }));
  }

  private async breakdownByTier(commissions: any[]): Promise<Record<string, any>> {
    // Implementation would group commissions by agent tier
    return {};
  }

  private async breakdownByRegion(commissions: any[]): Promise<Record<string, any>> {
    // Implementation would group commissions by agent region
    return {};
  }

  private async breakdownBySource(commissions: any[]): Promise<Record<string, any>> {
    // Implementation would group commissions by lead source
    return {};
  }

  private async analyzeCommissionTrends(period: any): Promise<any[]> {
    // Implementation would analyze commission trends over time
    return [];
  }
}

export const agentCommissionAnalyticsService = new AgentCommissionAnalyticsService();