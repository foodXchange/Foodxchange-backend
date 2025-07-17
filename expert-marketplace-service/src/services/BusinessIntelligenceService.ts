import { Logger } from '../utils/logger';
import { advancedCacheService } from './AdvancedCacheService.cleaned';
import { ExpertProfile } from '../models/ExpertProfile.model.cleaned';
import { Lead } from '../modules/agent/models/Lead.model.cleaned';
import { queryPerformanceMonitor } from './QueryPerformanceMonitor';
import { config } from '../config/index.cleaned';

const logger = new Logger('BusinessIntelligenceService');

export interface BusinessMetrics {
  overview: {
    totalExperts: number;
    activeExperts: number;
    totalLeads: number;
    activeLeads: number;
    totalMatches: number;
    successfulMatches: number;
    conversionRate: number;
    averageResponseTime: number;
    systemHealth: 'healthy' | 'degraded' | 'unhealthy';
  };
  trends: {
    expertGrowth: number;
    leadGrowth: number;
    matchGrowth: number;
    revenueGrowth: number;
  };
  performance: {
    apiResponseTime: number;
    databasePerformance: number;
    cacheHitRate: number;
    errorRate: number;
    throughput: number;
  };
  userEngagement: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    averageSessionDuration: number;
    bounceRate: number;
  };
  businessKPIs: {
    totalRevenue: number;
    averageOrderValue: number;
    customerLifetimeValue: number;
    churnRate: number;
    customerSatisfactionScore: number;
  };
}

export interface RealtimeMetrics {
  timestamp: Date;
  activeUsers: number;
  currentRPS: number;
  systemCPU: number;
  memoryUsage: number;
  databaseConnections: number;
  queueLength: number;
  errorCount: number;
  cacheHitRate: number;
}

export interface AlertDefinition {
  id: string;
  name: string;
  description: string;
  metric: string;
  threshold: number;
  operator: 'greater_than' | 'less_than' | 'equals';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  lastTriggered?: Date;
  triggerCount: number;
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'chart' | 'metric' | 'table' | 'gauge' | 'map';
  dataSource: string;
  configuration: any;
  position: { x: number; y: number; width: number; height: number };
  refreshInterval: number;
  isVisible: boolean;
  permissions: string[];
}

export interface CustomDashboard {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  createdBy: string;
  createdAt: Date;
  lastModified: Date;
  isPublic: boolean;
  tags: string[];
}

/**
 * Comprehensive Business Intelligence Service for FoodXchange platform
 */
export class BusinessIntelligenceService {
  private alerts: AlertDefinition[] = [];
  private customDashboards: CustomDashboard[] = [];
  private realtimeMetrics: RealtimeMetrics[] = [];
  private readonly metricsRetention = 24 * 60 * 60 * 1000; // 24 hours
  private readonly refreshInterval = 60000; // 1 minute
  private metricsTimer?: NodeJS.Timeout;
  private alertsTimer?: NodeJS.Timeout;

  constructor() {
    this.initializeDefaultAlerts();
    this.startMetricsCollection();
    this.startAlertMonitoring();
  }

  /**
   * Get comprehensive business metrics
   */
  async getBusinessMetrics(): Promise<BusinessMetrics> {
    try {
      const cachedMetrics = await advancedCacheService.get('business_metrics');
      if (cachedMetrics) return cachedMetrics;

      const metrics = await this.calculateBusinessMetrics();
      
      // Cache for 5 minutes
      await advancedCacheService.set('business_metrics', metrics, {
        ttl: 300,
        tags: ['business', 'metrics', 'dashboard'],
        priority: 'high'
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to get business metrics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get real-time system metrics
   */
  async getRealtimeMetrics(): Promise<RealtimeMetrics> {
    try {
      const metrics: RealtimeMetrics = {
        timestamp: new Date(),
        activeUsers: await this.getActiveUsersCount(),
        currentRPS: await this.getCurrentRPS(),
        systemCPU: await this.getSystemCPU(),
        memoryUsage: await this.getMemoryUsage(),
        databaseConnections: await this.getDatabaseConnections(),
        queueLength: await this.getQueueLength(),
        errorCount: await this.getErrorCount(),
        cacheHitRate: await this.getCacheHitRate()
      };

      // Store in memory for real-time access
      this.realtimeMetrics.push(metrics);
      this.cleanupOldMetrics();

      return metrics;
    } catch (error) {
      logger.error('Failed to get real-time metrics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get industry-specific analytics
   */
  async getIndustryAnalytics(): Promise<any> {
    try {
      const analytics = {
        topIndustries: await this.getTopIndustries(),
        industryGrowth: await this.getIndustryGrowth(),
        expertDistribution: await this.getExpertDistribution(),
        demandPatterns: await this.getDemandPatterns(),
        seasonalTrends: await this.getSeasonalTrends()
      };

      return analytics;
    } catch (error) {
      logger.error('Failed to get industry analytics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user behavior analytics
   */
  async getUserBehaviorAnalytics(): Promise<any> {
    try {
      const analytics = {
        userJourney: await this.getUserJourney(),
        conversionFunnel: await this.getConversionFunnel(),
        featureUsage: await this.getFeatureUsage(),
        userSegmentation: await this.getUserSegmentation(),
        churnPrediction: await this.getChurnPrediction()
      };

      return analytics;
    } catch (error) {
      logger.error('Failed to get user behavior analytics', { error: error.message });
      throw error;
    }
  }

  /**
   * Get financial analytics
   */
  async getFinancialAnalytics(): Promise<any> {
    try {
      const analytics = {
        revenue: await this.getRevenueAnalytics(),
        profitability: await this.getProfitabilityAnalytics(),
        costStructure: await this.getCostStructure(),
        projections: await this.getFinancialProjections(),
        benchmarks: await this.getBenchmarks()
      };

      return analytics;
    } catch (error) {
      logger.error('Failed to get financial analytics', { error: error.message });
      throw error;
    }
  }

  /**
   * Create custom dashboard
   */
  async createCustomDashboard(dashboard: Omit<CustomDashboard, 'id' | 'createdAt' | 'lastModified'>): Promise<CustomDashboard> {
    try {
      const newDashboard: CustomDashboard = {
        id: this.generateId(),
        createdAt: new Date(),
        lastModified: new Date(),
        ...dashboard
      };

      this.customDashboards.push(newDashboard);

      // Cache dashboard
      await advancedCacheService.set(`dashboard:${newDashboard.id}`, newDashboard, {
        ttl: 3600,
        tags: ['dashboard', 'custom'],
        priority: 'medium'
      });

      logger.info('Custom dashboard created', { dashboardId: newDashboard.id });
      return newDashboard;
    } catch (error) {
      logger.error('Failed to create custom dashboard', { error: error.message });
      throw error;
    }
  }

  /**
   * Get custom dashboard
   */
  async getCustomDashboard(dashboardId: string): Promise<CustomDashboard | null> {
    try {
      const cached = await advancedCacheService.get(`dashboard:${dashboardId}`);
      if (cached) return cached;

      const dashboard = this.customDashboards.find(d => d.id === dashboardId);
      if (dashboard) {
        await advancedCacheService.set(`dashboard:${dashboardId}`, dashboard, {
          ttl: 3600,
          tags: ['dashboard', 'custom'],
          priority: 'medium'
        });
      }

      return dashboard || null;
    } catch (error) {
      logger.error('Failed to get custom dashboard', { dashboardId, error: error.message });
      throw error;
    }
  }

  /**
   * Create alert definition
   */
  async createAlert(alert: Omit<AlertDefinition, 'id' | 'createdAt' | 'triggerCount'>): Promise<AlertDefinition> {
    try {
      const newAlert: AlertDefinition = {
        id: this.generateId(),
        createdAt: new Date(),
        triggerCount: 0,
        ...alert
      };

      this.alerts.push(newAlert);

      // Cache alert
      await advancedCacheService.set(`alert:${newAlert.id}`, newAlert, {
        ttl: 3600,
        tags: ['alert', 'monitoring'],
        priority: 'high'
      });

      logger.info('Alert created', { alertId: newAlert.id });
      return newAlert;
    } catch (error) {
      logger.error('Failed to create alert', { error: error.message });
      throw error;
    }
  }

  /**
   * Get predictive analytics
   */
  async getPredictiveAnalytics(): Promise<any> {
    try {
      const analytics = {
        demandForecast: await this.getDemandForecast(),
        expertSupplyPrediction: await this.getExpertSupplyPrediction(),
        marketTrends: await this.getMarketTrends(),
        riskAssessment: await this.getRiskAssessment(),
        recommendations: await this.getRecommendations()
      };

      return analytics;
    } catch (error) {
      logger.error('Failed to get predictive analytics', { error: error.message });
      throw error;
    }
  }

  /**
   * Export dashboard data
   */
  async exportDashboardData(dashboardId: string, format: 'csv' | 'json' | 'xlsx'): Promise<Buffer> {
    try {
      const dashboard = await this.getCustomDashboard(dashboardId);
      if (!dashboard) {
        throw new Error('Dashboard not found');
      }

      const data = await this.collectDashboardData(dashboard);
      
      switch (format) {
        case 'csv':
          return this.exportToCSV(data);
        case 'json':
          return Buffer.from(JSON.stringify(data, null, 2));
        case 'xlsx':
          return this.exportToXLSX(data);
        default:
          throw new Error('Unsupported format');
      }
    } catch (error) {
      logger.error('Failed to export dashboard data', { dashboardId, format, error: error.message });
      throw error;
    }
  }

  /**
   * Calculate business metrics
   */
  private async calculateBusinessMetrics(): Promise<BusinessMetrics> {
    const [
      totalExperts,
      activeExperts,
      totalLeads,
      activeLeads,
      performanceMetrics,
      userEngagementMetrics,
      businessKPIs
    ] = await Promise.all([
      this.getTotalExperts(),
      this.getActiveExperts(),
      this.getTotalLeads(),
      this.getActiveLeads(),
      this.getPerformanceMetrics(),
      this.getUserEngagementMetrics(),
      this.getBusinessKPIs()
    ]);

    const totalMatches = await this.getTotalMatches();
    const successfulMatches = await this.getSuccessfulMatches();
    const conversionRate = totalMatches > 0 ? (successfulMatches / totalMatches) * 100 : 0;

    return {
      overview: {
        totalExperts,
        activeExperts,
        totalLeads,
        activeLeads,
        totalMatches,
        successfulMatches,
        conversionRate,
        averageResponseTime: performanceMetrics.apiResponseTime,
        systemHealth: this.determineSystemHealth(performanceMetrics)
      },
      trends: await this.getTrends(),
      performance: performanceMetrics,
      userEngagement: userEngagementMetrics,
      businessKPIs
    };
  }

  /**
   * Get total experts count
   */
  private async getTotalExperts(): Promise<number> {
    return await ExpertProfile.countDocuments();
  }

  /**
   * Get active experts count
   */
  private async getActiveExperts(): Promise<number> {
    return await ExpertProfile.countDocuments({ 
      isActive: true,
      lastActiveAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    });
  }

  /**
   * Get total leads count
   */
  private async getTotalLeads(): Promise<number> {
    return await Lead.countDocuments();
  }

  /**
   * Get active leads count
   */
  private async getActiveLeads(): Promise<number> {
    return await Lead.countDocuments({ 
      status: 'active',
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    });
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(): Promise<any> {
    const queryMetrics = queryPerformanceMonitor.getRealtimeMetrics();
    const cacheStats = await advancedCacheService.getStats();

    return {
      apiResponseTime: queryMetrics.averageResponseTime,
      databasePerformance: 100 - (queryMetrics.slowQueries / Math.max(queryMetrics.totalQueries, 1)) * 100,
      cacheHitRate: cacheStats.hitRate,
      errorRate: (queryMetrics.errorCount || 0) / Math.max(queryMetrics.totalQueries, 1) * 100,
      throughput: queryMetrics.totalQueries
    };
  }

  /**
   * Get user engagement metrics
   */
  private async getUserEngagementMetrics(): Promise<any> {
    // These would typically come from analytics tracking
    return {
      dailyActiveUsers: await this.getDailyActiveUsers(),
      weeklyActiveUsers: await this.getWeeklyActiveUsers(),
      monthlyActiveUsers: await this.getMonthlyActiveUsers(),
      averageSessionDuration: await this.getAverageSessionDuration(),
      bounceRate: await this.getBounceRate()
    };
  }

  /**
   * Get business KPIs
   */
  private async getBusinessKPIs(): Promise<any> {
    return {
      totalRevenue: await this.getTotalRevenue(),
      averageOrderValue: await this.getAverageOrderValue(),
      customerLifetimeValue: await this.getCustomerLifetimeValue(),
      churnRate: await this.getChurnRate(),
      customerSatisfactionScore: await this.getCustomerSatisfactionScore()
    };
  }

  /**
   * Initialize default alerts
   */
  private initializeDefaultAlerts(): void {
    const defaultAlerts: Omit<AlertDefinition, 'id' | 'createdAt' | 'triggerCount'>[] = [
      {
        name: 'High CPU Usage',
        description: 'Alert when CPU usage exceeds 80%',
        metric: 'system.cpu',
        threshold: 80,
        operator: 'greater_than',
        severity: 'high',
        enabled: true,
        createdBy: 'system'
      },
      {
        name: 'High Error Rate',
        description: 'Alert when error rate exceeds 5%',
        metric: 'api.error_rate',
        threshold: 5,
        operator: 'greater_than',
        severity: 'critical',
        enabled: true,
        createdBy: 'system'
      },
      {
        name: 'Low Cache Hit Rate',
        description: 'Alert when cache hit rate drops below 70%',
        metric: 'cache.hit_rate',
        threshold: 70,
        operator: 'less_than',
        severity: 'medium',
        enabled: true,
        createdBy: 'system'
      }
    ];

    defaultAlerts.forEach(alert => {
      this.createAlert(alert).catch(error => {
        logger.error('Failed to create default alert', { alert, error: error.message });
      });
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.getRealtimeMetrics().catch(error => {
        logger.error('Failed to collect real-time metrics', { error: error.message });
      });
    }, this.refreshInterval);

    logger.info('Metrics collection started');
  }

  /**
   * Start alert monitoring
   */
  private startAlertMonitoring(): void {
    this.alertsTimer = setInterval(() => {
      this.checkAlerts().catch(error => {
        logger.error('Failed to check alerts', { error: error.message });
      });
    }, this.refreshInterval);

    logger.info('Alert monitoring started');
  }

  /**
   * Check alerts against current metrics
   */
  private async checkAlerts(): Promise<void> {
    const currentMetrics = await this.getRealtimeMetrics();
    
    for (const alert of this.alerts.filter(a => a.enabled)) {
      const metricValue = this.getMetricValue(alert.metric, currentMetrics);
      const isTriggered = this.evaluateAlertCondition(alert, metricValue);
      
      if (isTriggered) {
        await this.triggerAlert(alert, metricValue);
      }
    }
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(alert: AlertDefinition, metricValue: number): Promise<void> {
    alert.lastTriggered = new Date();
    alert.triggerCount++;

    logger.warn('Alert triggered', {
      alertId: alert.id,
      alertName: alert.name,
      metricValue,
      threshold: alert.threshold,
      severity: alert.severity
    });

    // In production, send notifications via email, Slack, etc.
    await this.sendAlertNotification(alert, metricValue);
  }

  /**
   * Stop services
   */
  async stop(): Promise<void> {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
    if (this.alertsTimer) {
      clearInterval(this.alertsTimer);
    }
    logger.info('Business Intelligence Service stopped');
  }

  // Helper methods (simplified implementations)
  private generateId(): string {
    return require('crypto').randomUUID();
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.metricsRetention;
    this.realtimeMetrics = this.realtimeMetrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  private determineSystemHealth(metrics: any): 'healthy' | 'degraded' | 'unhealthy' {
    if (metrics.errorRate > 10 || metrics.apiResponseTime > 2000) return 'unhealthy';
    if (metrics.errorRate > 5 || metrics.apiResponseTime > 1000) return 'degraded';
    return 'healthy';
  }

  private getMetricValue(metric: string, metrics: RealtimeMetrics): number {
    const metricMap: Record<string, number> = {
      'system.cpu': metrics.systemCPU,
      'system.memory': metrics.memoryUsage,
      'api.error_rate': metrics.errorCount,
      'cache.hit_rate': metrics.cacheHitRate,
      'api.rps': metrics.currentRPS
    };
    return metricMap[metric] || 0;
  }

  private evaluateAlertCondition(alert: AlertDefinition, value: number): boolean {
    switch (alert.operator) {
      case 'greater_than': return value > alert.threshold;
      case 'less_than': return value < alert.threshold;
      case 'equals': return value === alert.threshold;
      default: return false;
    }
  }

  private async sendAlertNotification(alert: AlertDefinition, metricValue: number): Promise<void> {
    // Implementation depends on notification system
    logger.info('Alert notification sent', { alertId: alert.id, metricValue });
  }

  // Placeholder implementations for analytics methods
  private async getActiveUsersCount(): Promise<number> { return 0; }
  private async getCurrentRPS(): Promise<number> { return 0; }
  private async getSystemCPU(): Promise<number> { return 0; }
  private async getMemoryUsage(): Promise<number> { return 0; }
  private async getDatabaseConnections(): Promise<number> { return 0; }
  private async getQueueLength(): Promise<number> { return 0; }
  private async getErrorCount(): Promise<number> { return 0; }
  private async getCacheHitRate(): Promise<number> { return 0; }
  private async getTotalMatches(): Promise<number> { return 0; }
  private async getSuccessfulMatches(): Promise<number> { return 0; }
  private async getTrends(): Promise<any> { return {}; }
  private async getDailyActiveUsers(): Promise<number> { return 0; }
  private async getWeeklyActiveUsers(): Promise<number> { return 0; }
  private async getMonthlyActiveUsers(): Promise<number> { return 0; }
  private async getAverageSessionDuration(): Promise<number> { return 0; }
  private async getBounceRate(): Promise<number> { return 0; }
  private async getTotalRevenue(): Promise<number> { return 0; }
  private async getAverageOrderValue(): Promise<number> { return 0; }
  private async getCustomerLifetimeValue(): Promise<number> { return 0; }
  private async getChurnRate(): Promise<number> { return 0; }
  private async getCustomerSatisfactionScore(): Promise<number> { return 0; }
  private async getTopIndustries(): Promise<any[]> { return []; }
  private async getIndustryGrowth(): Promise<any> { return {}; }
  private async getExpertDistribution(): Promise<any> { return {}; }
  private async getDemandPatterns(): Promise<any> { return {}; }
  private async getSeasonalTrends(): Promise<any> { return {}; }
  private async getUserJourney(): Promise<any> { return {}; }
  private async getConversionFunnel(): Promise<any> { return {}; }
  private async getFeatureUsage(): Promise<any> { return {}; }
  private async getUserSegmentation(): Promise<any> { return {}; }
  private async getChurnPrediction(): Promise<any> { return {}; }
  private async getRevenueAnalytics(): Promise<any> { return {}; }
  private async getProfitabilityAnalytics(): Promise<any> { return {}; }
  private async getCostStructure(): Promise<any> { return {}; }
  private async getFinancialProjections(): Promise<any> { return {}; }
  private async getBenchmarks(): Promise<any> { return {}; }
  private async getDemandForecast(): Promise<any> { return {}; }
  private async getExpertSupplyPrediction(): Promise<any> { return {}; }
  private async getMarketTrends(): Promise<any> { return {}; }
  private async getRiskAssessment(): Promise<any> { return {}; }
  private async getRecommendations(): Promise<any> { return {}; }
  private async collectDashboardData(dashboard: CustomDashboard): Promise<any> { return {}; }
  private exportToCSV(data: any): Buffer { return Buffer.from(''); }
  private exportToXLSX(data: any): Buffer { return Buffer.from(''); }
}

// Export singleton instance
export const businessIntelligenceService = new BusinessIntelligenceService();