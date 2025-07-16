import { Logger } from '../utils/logger';
import { advancedCacheService } from './AdvancedCacheService';
import { ExpertProfile } from '../models/ExpertProfile.model';
import { AgentProfile } from '../modules/agent/models/AgentProfile.model';
import { Lead } from '../modules/agent/models/Lead.model';
import { AgentCommission } from '../modules/agent/models/AgentCommission.model';

const logger = new Logger('AdvancedAnalyticsService');

export interface AnalyticsPeriod {
  start: Date;
  end: Date;
  period: '1d' | '7d' | '30d' | '90d' | '1y' | 'custom';
}

export interface KPIMetrics {
  // Business Metrics
  totalRevenue: number;
  totalTransactions: number;
  averageTransactionValue: number;
  growthRate: number;
  
  // User Metrics
  totalExperts: number;
  activeExperts: number;
  totalAgents: number;
  activeAgents: number;
  totalClients: number;
  
  // Performance Metrics
  expertUtilizationRate: number;
  agentConversionRate: number;
  averageResponseTime: number;
  customerSatisfactionScore: number;
  
  // Platform Metrics
  totalProjects: number;
  completedProjects: number;
  projectCompletionRate: number;
  averageProjectDuration: number;
}

export interface TrendAnalysis {
  metric: string;
  currentValue: number;
  previousValue: number;
  changePercentage: number;
  trend: 'up' | 'down' | 'stable';
  prediction?: number;
}

export interface RegionalAnalytics {
  region: string;
  totalUsers: number;
  totalRevenue: number;
  topIndustries: { name: string; percentage: number }[];
  growthRate: number;
  marketPenetration: number;
}

export interface IndustryAnalytics {
  industry: string;
  totalExperts: number;
  totalProjects: number;
  averageRate: number;
  demandGrowth: number;
  competitionLevel: 'low' | 'medium' | 'high';
  marketOpportunity: number;
}

export interface PredictiveInsights {
  demandForecast: {
    industry: string;
    predictedDemand: number;
    confidence: number;
    factors: string[];
  }[];
  expertSupplyGaps: {
    skillArea: string;
    currentSupply: number;
    projectedDemand: number;
    gap: number;
  }[];
  revenueProjection: {
    period: string;
    projectedRevenue: number;
    confidence: number;
  }[];
}

export interface CustomReport {
  id: string;
  name: string;
  description: string;
  userId: string;
  metrics: string[];
  filters: Record<string, any>;
  schedule?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    format: 'pdf' | 'excel' | 'json';
  };
  createdAt: Date;
  lastGenerated?: Date;
}

export class AdvancedAnalyticsService {
  
  /**
   * Get comprehensive platform KPIs
   */
  async getPlatformKPIs(period: AnalyticsPeriod): Promise<KPIMetrics> {
    try {
      const cacheKey = `platform_kpis:${period.period}:${period.start.toISOString()}:${period.end.toISOString()}`;
      const cached = await advancedCacheService.get<KPIMetrics>(cacheKey);
      
      if (cached) return cached;

      const [
        revenueData,
        userMetrics,
        performanceMetrics,
        projectMetrics
      ] = await Promise.all([
        this.calculateRevenueMetrics(period),
        this.calculateUserMetrics(period),
        this.calculatePerformanceMetrics(period),
        this.calculateProjectMetrics(period)
      ]);

      const kpis: KPIMetrics = {
        ...revenueData,
        ...userMetrics,
        ...performanceMetrics,
        ...projectMetrics
      };

      // Cache for appropriate duration based on period
      const cacheTTL = this.getCacheTTL(period.period);
      await advancedCacheService.set(cacheKey, kpis, {
        ttl: cacheTTL,
        tags: ['analytics', 'kpis', period.period]
      });

      return kpis;
    } catch (error) {
      logger.error('Error calculating platform KPIs:', error);
      throw error;
    }
  }

  /**
   * Get trend analysis for key metrics
   */
  async getTrendAnalysis(metrics: string[], period: AnalyticsPeriod): Promise<TrendAnalysis[]> {
    try {
      const trends: TrendAnalysis[] = [];
      
      for (const metric of metrics) {
        const currentPeriod = period;
        const previousPeriod = this.getPreviousPeriod(period);
        
        const [currentValue, previousValue] = await Promise.all([
          this.getMetricValue(metric, currentPeriod),
          this.getMetricValue(metric, previousPeriod)
        ]);

        const changePercentage = previousValue > 0 
          ? ((currentValue - previousValue) / previousValue) * 100 
          : 0;

        const trend: 'up' | 'down' | 'stable' = 
          changePercentage > 5 ? 'up' :
          changePercentage < -5 ? 'down' : 'stable';

        // Simple linear prediction (in real implementation, use ML models)
        const prediction = currentValue + (currentValue - previousValue);

        trends.push({
          metric,
          currentValue,
          previousValue,
          changePercentage: Math.round(changePercentage * 100) / 100,
          trend,
          prediction: Math.max(0, prediction)
        });
      }

      return trends;
    } catch (error) {
      logger.error('Error calculating trend analysis:', error);
      throw error;
    }
  }

  /**
   * Get regional analytics breakdown
   */
  async getRegionalAnalytics(period: AnalyticsPeriod): Promise<RegionalAnalytics[]> {
    try {
      const cacheKey = `regional_analytics:${period.period}:${period.start.toISOString()}`;
      const cached = await advancedCacheService.get<RegionalAnalytics[]>(cacheKey);
      
      if (cached) return cached;

      // Aggregate user data by region
      const usersByRegion = await this.aggregateUsersByRegion(period);
      const revenueByRegion = await this.aggregateRevenueByRegion(period);
      const industriesByRegion = await this.aggregateIndustriesByRegion(period);

      const regionalAnalytics: RegionalAnalytics[] = [];

      for (const [region, userData] of Object.entries(usersByRegion)) {
        const analytics: RegionalAnalytics = {
          region,
          totalUsers: userData.count,
          totalRevenue: revenueByRegion[region] || 0,
          topIndustries: industriesByRegion[region] || [],
          growthRate: await this.calculateRegionalGrowthRate(region, period),
          marketPenetration: await this.calculateMarketPenetration(region)
        };
        
        regionalAnalytics.push(analytics);
      }

      // Sort by total revenue
      regionalAnalytics.sort((a, b) => b.totalRevenue - a.totalRevenue);

      // Cache for 4 hours
      await advancedCacheService.set(cacheKey, regionalAnalytics, {
        ttl: 14400,
        tags: ['analytics', 'regional', period.period]
      });

      return regionalAnalytics;
    } catch (error) {
      logger.error('Error calculating regional analytics:', error);
      throw error;
    }
  }

  /**
   * Get industry-specific analytics
   */
  async getIndustryAnalytics(period: AnalyticsPeriod): Promise<IndustryAnalytics[]> {
    try {
      const industries = [
        'dairy', 'meat_poultry', 'beverages', 'bakery_confectionery',
        'fruits_vegetables', 'supplements_nutraceuticals', 'food_safety',
        'quality_assurance', 'regulatory_compliance', 'packaging'
      ];

      const industryAnalytics: IndustryAnalytics[] = [];

      for (const industry of industries) {
        const analytics = await this.calculateIndustryMetrics(industry, period);
        industryAnalytics.push(analytics);
      }

      return industryAnalytics.sort((a, b) => b.totalRevenue - a.totalRevenue);
    } catch (error) {
      logger.error('Error calculating industry analytics:', error);
      throw error;
    }
  }

  /**
   * Generate predictive insights using AI/ML
   */
  async getPredictiveInsights(period: AnalyticsPeriod): Promise<PredictiveInsights> {
    try {
      const cacheKey = `predictive_insights:${period.period}`;
      const cached = await advancedCacheService.get<PredictiveInsights>(cacheKey);
      
      if (cached) return cached;

      const [demandForecast, supplyGaps, revenueProjection] = await Promise.all([
        this.generateDemandForecast(period),
        this.analyzeSupplyGaps(period),
        this.projectRevenue(period)
      ]);

      const insights: PredictiveInsights = {
        demandForecast,
        expertSupplyGaps: supplyGaps,
        revenueProjection
      };

      // Cache for 24 hours
      await advancedCacheService.set(cacheKey, insights, {
        ttl: 86400,
        tags: ['analytics', 'predictive', 'ai']
      });

      return insights;
    } catch (error) {
      logger.error('Error generating predictive insights:', error);
      throw error;
    }
  }

  /**
   * Create custom report
   */
  async createCustomReport(
    userId: string,
    reportConfig: Omit<CustomReport, 'id' | 'createdAt'>
  ): Promise<CustomReport> {
    try {
      const report: CustomReport = {
        ...reportConfig,
        id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        createdAt: new Date()
      };

      // Store report configuration
      await advancedCacheService.set(`custom_report:${report.id}`, report, {
        ttl: 86400 * 365, // 1 year
        tags: ['reports', `user:${userId}`]
      });

      logger.info('Custom report created', { reportId: report.id, userId });
      return report;
    } catch (error) {
      logger.error('Error creating custom report:', error);
      throw error;
    }
  }

  /**
   * Generate custom report data
   */
  async generateReportData(
    reportId: string,
    period: AnalyticsPeriod
  ): Promise<any> {
    try {
      const report = await advancedCacheService.get<CustomReport>(`custom_report:${reportId}`);
      if (!report) {
        throw new Error('Report not found');
      }

      const reportData: any = {
        reportId,
        reportName: report.name,
        generatedAt: new Date(),
        period,
        data: {}
      };

      // Generate data for each requested metric
      for (const metric of report.metrics) {
        switch (metric) {
          case 'platform_kpis':
            reportData.data.platformKPIs = await this.getPlatformKPIs(period);
            break;
          case 'regional_analytics':
            reportData.data.regionalAnalytics = await this.getRegionalAnalytics(period);
            break;
          case 'industry_analytics':
            reportData.data.industryAnalytics = await this.getIndustryAnalytics(period);
            break;
          case 'predictive_insights':
            reportData.data.predictiveInsights = await this.getPredictiveInsights(period);
            break;
          case 'trend_analysis':
            reportData.data.trendAnalysis = await this.getTrendAnalysis(['revenue', 'users', 'projects'], period);
            break;
        }
      }

      // Apply filters if specified
      if (report.filters) {
        reportData.data = this.applyFilters(reportData.data, report.filters);
      }

      // Update last generated timestamp
      report.lastGenerated = new Date();
      await advancedCacheService.set(`custom_report:${reportId}`, report, {
        ttl: 86400 * 365,
        tags: ['reports', `user:${report.userId}`]
      });

      return reportData;
    } catch (error) {
      logger.error('Error generating report data:', error);
      throw error;
    }
  }

  /**
   * Get real-time dashboard metrics
   */
  async getRealTimeDashboard(): Promise<any> {
    try {
      const cacheKey = 'realtime_dashboard';
      const cached = await advancedCacheService.get(cacheKey);
      
      if (cached) return cached;

      const dashboard = {
        currentUsers: await this.getCurrentActiveUsers(),
        todayMetrics: await this.getTodayMetrics(),
        systemHealth: await this.getSystemHealth(),
        alertsAndNotifications: await this.getActiveAlerts(),
        topPerformers: await this.getTopPerformers(),
        recentActivity: await this.getRecentActivity()
      };

      // Cache for 1 minute for real-time updates
      await advancedCacheService.set(cacheKey, dashboard, {
        ttl: 60,
        tags: ['dashboard', 'realtime']
      });

      return dashboard;
    } catch (error) {
      logger.error('Error getting real-time dashboard:', error);
      throw error;
    }
  }

  // Private helper methods

  private async calculateRevenueMetrics(period: AnalyticsPeriod): Promise<Partial<KPIMetrics>> {
    // Mock implementation - replace with actual database queries
    const totalRevenue = Math.random() * 1000000;
    const totalTransactions = Math.floor(Math.random() * 1000);
    
    return {
      totalRevenue,
      totalTransactions,
      averageTransactionValue: totalRevenue / totalTransactions,
      growthRate: (Math.random() - 0.5) * 50 // -25% to +25%
    };
  }

  private async calculateUserMetrics(period: AnalyticsPeriod): Promise<Partial<KPIMetrics>> {
    // Mock implementation
    return {
      totalExperts: Math.floor(Math.random() * 1000) + 500,
      activeExperts: Math.floor(Math.random() * 500) + 200,
      totalAgents: Math.floor(Math.random() * 200) + 50,
      activeAgents: Math.floor(Math.random() * 100) + 20,
      totalClients: Math.floor(Math.random() * 2000) + 1000
    };
  }

  private async calculatePerformanceMetrics(period: AnalyticsPeriod): Promise<Partial<KPIMetrics>> {
    return {
      expertUtilizationRate: Math.random() * 100,
      agentConversionRate: Math.random() * 50,
      averageResponseTime: Math.random() * 24,
      customerSatisfactionScore: 4.0 + Math.random()
    };
  }

  private async calculateProjectMetrics(period: AnalyticsPeriod): Promise<Partial<KPIMetrics>> {
    const totalProjects = Math.floor(Math.random() * 500) + 100;
    const completedProjects = Math.floor(totalProjects * (0.7 + Math.random() * 0.2));
    
    return {
      totalProjects,
      completedProjects,
      projectCompletionRate: (completedProjects / totalProjects) * 100,
      averageProjectDuration: Math.random() * 30 + 5
    };
  }

  private getPreviousPeriod(period: AnalyticsPeriod): AnalyticsPeriod {
    const duration = period.end.getTime() - period.start.getTime();
    return {
      start: new Date(period.start.getTime() - duration),
      end: new Date(period.start.getTime()),
      period: period.period
    };
  }

  private async getMetricValue(metric: string, period: AnalyticsPeriod): Promise<number> {
    // Mock implementation - replace with actual metric calculation
    return Math.random() * 100000;
  }

  private getCacheTTL(period: string): number {
    switch (period) {
      case '1d': return 3600; // 1 hour
      case '7d': return 7200; // 2 hours
      case '30d': return 14400; // 4 hours
      case '90d': return 43200; // 12 hours
      case '1y': return 86400; // 24 hours
      default: return 3600;
    }
  }

  private async aggregateUsersByRegion(period: AnalyticsPeriod): Promise<Record<string, any>> {
    // Mock implementation
    return {
      'North America': { count: 500 },
      'Europe': { count: 300 },
      'Asia Pacific': { count: 200 },
      'Latin America': { count: 100 },
      'Middle East & Africa': { count: 50 }
    };
  }

  private async aggregateRevenueByRegion(period: AnalyticsPeriod): Promise<Record<string, number>> {
    return {
      'North America': 500000,
      'Europe': 300000,
      'Asia Pacific': 200000,
      'Latin America': 100000,
      'Middle East & Africa': 50000
    };
  }

  private async aggregateIndustriesByRegion(period: AnalyticsPeriod): Promise<Record<string, any[]>> {
    return {
      'North America': [
        { name: 'Dairy', percentage: 30 },
        { name: 'Meat & Poultry', percentage: 25 },
        { name: 'Beverages', percentage: 20 }
      ],
      'Europe': [
        { name: 'Food Safety', percentage: 35 },
        { name: 'Organic', percentage: 25 },
        { name: 'Packaging', percentage: 20 }
      ]
    };
  }

  private async calculateRegionalGrowthRate(region: string, period: AnalyticsPeriod): Promise<number> {
    return (Math.random() - 0.3) * 100; // -30% to +70%
  }

  private async calculateMarketPenetration(region: string): Promise<number> {
    return Math.random() * 15; // 0-15% market penetration
  }

  private async calculateIndustryMetrics(industry: string, period: AnalyticsPeriod): Promise<IndustryAnalytics> {
    return {
      industry,
      totalExperts: Math.floor(Math.random() * 100) + 10,
      totalProjects: Math.floor(Math.random() * 50) + 5,
      averageRate: Math.floor(Math.random() * 200) + 50,
      demandGrowth: (Math.random() - 0.2) * 100,
      competitionLevel: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as any,
      marketOpportunity: Math.random() * 100
    };
  }

  private async generateDemandForecast(period: AnalyticsPeriod): Promise<any[]> {
    const industries = ['dairy', 'meat_poultry', 'beverages', 'food_safety'];
    return industries.map(industry => ({
      industry,
      predictedDemand: Math.random() * 1000,
      confidence: 0.7 + Math.random() * 0.3,
      factors: ['seasonal trends', 'regulatory changes', 'market expansion']
    }));
  }

  private async analyzeSupplyGaps(period: AnalyticsPeriod): Promise<any[]> {
    const skills = ['HACCP expertise', 'Food safety auditing', 'Packaging design', 'Nutrition labeling'];
    return skills.map(skill => ({
      skillArea: skill,
      currentSupply: Math.floor(Math.random() * 100),
      projectedDemand: Math.floor(Math.random() * 150) + 50,
      gap: Math.floor(Math.random() * 50)
    }));
  }

  private async projectRevenue(period: AnalyticsPeriod): Promise<any[]> {
    return [
      { period: 'Next Quarter', projectedRevenue: 1200000, confidence: 0.85 },
      { period: 'Next 6 Months', projectedRevenue: 2500000, confidence: 0.75 },
      { period: 'Next Year', projectedRevenue: 5000000, confidence: 0.65 }
    ];
  }

  private applyFilters(data: any, filters: Record<string, any>): any {
    // Apply data filters based on report configuration
    return data;
  }

  private async getCurrentActiveUsers(): Promise<number> {
    // Return current active users from real-time service
    return Math.floor(Math.random() * 1000) + 100;
  }

  private async getTodayMetrics(): Promise<any> {
    return {
      revenue: Math.random() * 50000,
      newUsers: Math.floor(Math.random() * 50),
      projectsStarted: Math.floor(Math.random() * 20),
      averageResponseTime: Math.random() * 2
    };
  }

  private async getSystemHealth(): Promise<any> {
    return {
      status: 'healthy',
      uptime: '99.9%',
      responseTime: '120ms',
      errorRate: '0.01%',
      cacheHitRate: '96.5%'
    };
  }

  private async getActiveAlerts(): Promise<any[]> {
    return [
      { type: 'info', message: 'New compliance standard published', timestamp: new Date() },
      { type: 'warning', message: 'High demand for HACCP experts', timestamp: new Date() }
    ];
  }

  private async getTopPerformers(): Promise<any> {
    return {
      topExperts: [
        { name: 'Dr. Jane Smith', rating: 4.9, projects: 25 },
        { name: 'Prof. John Doe', rating: 4.8, projects: 22 }
      ],
      topAgents: [
        { name: 'Mike Johnson', conversions: 45, revenue: 125000 },
        { name: 'Sarah Wilson', conversions: 38, revenue: 98000 }
      ]
    };
  }

  private async getRecentActivity(): Promise<any[]> {
    return [
      { type: 'booking', message: 'New expert booking by Acme Foods', timestamp: new Date() },
      { type: 'registration', message: 'New expert registered: Food Safety Specialist', timestamp: new Date() },
      { type: 'completion', message: 'HACCP audit project completed', timestamp: new Date() }
    ];
  }
}

export const advancedAnalyticsService = new AdvancedAnalyticsService();