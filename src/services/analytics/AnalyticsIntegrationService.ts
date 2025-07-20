import { Server } from 'http';

import { Logger } from '../../core/logging/logger';
import { blockchainService } from '../blockchain/BlockchainService';

import { advancedAnalyticsService } from './AdvancedAnalyticsService';
import { dataVisualizationService } from './DataVisualizationService';
import { predictiveAnalyticsService } from './PredictiveAnalyticsService';
import { realTimeAnalyticsService } from './RealTimeAnalyticsService';

const logger = new Logger('AnalyticsIntegrationService');

export interface AnalyticsConfig {
  enableRealtime: boolean;
  enablePredictive: boolean;
  enableBlockchainAnalytics: boolean;
  cacheSettings: {
    ttl: number;
    maxSize: number;
  };
  alertThresholds: {
    performanceDrops: number;
    anomalies: number;
    riskLevels: string[];
  };
}

export class AnalyticsIntegrationService {
  private isInitialized: boolean = false;
  private readonly config: AnalyticsConfig;
  private readonly eventListeners: Map<string, Function[]> = new Map();

  constructor(config?: Partial<AnalyticsConfig>) {
    this.config = {
      enableRealtime: true,
      enablePredictive: true,
      enableBlockchainAnalytics: true,
      cacheSettings: {
        ttl: 3600, // 1 hour
        maxSize: 1000
      },
      alertThresholds: {
        performanceDrops: 20, // 20% drop triggers alert
        anomalies: 0.8, // 80% confidence threshold
        riskLevels: ['HIGH', 'CRITICAL']
      },
      ...config
    };
  }

  async initialize(server?: Server) {
    try {
      logger.info('Initializing analytics integration service');

      // Initialize real-time analytics if enabled
      if (this.config.enableRealtime && server) {
        await realTimeAnalyticsService.initialize(server);
        this.setupRealTimeEventHandlers();
      }

      // Initialize blockchain analytics if enabled
      if (this.config.enableBlockchainAnalytics) {
        await this.setupBlockchainAnalyticsIntegration();
      }

      // Setup automated analytics tasks
      await this.setupAutomatedTasks();

      // Setup event-driven analytics
      await this.setupEventDrivenAnalytics();

      this.isInitialized = true;
      logger.info('Analytics integration service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize analytics integration service', error);
      throw error;
    }
  }

  private setupRealTimeEventHandlers() {
    // Listen for business events and emit real-time updates

    this.on('order.created', async (data: any) => {
      await realTimeAnalyticsService.emitLiveEvent({
        type: 'ORDER_CREATED',
        timestamp: new Date(),
        data: {
          orderId: data.orderId,
          amount: data.amount,
          customerId: data.customerId
        },
        companyId: data.companyId,
        metadata: { source: 'order_system' }
      });
    });

    this.on('order.status_changed', async (data: any) => {
      await realTimeAnalyticsService.emitLiveEvent({
        type: 'ORDER_STATUS_CHANGED',
        timestamp: new Date(),
        data: {
          orderId: data.orderId,
          oldStatus: data.oldStatus,
          newStatus: data.newStatus
        },
        companyId: data.companyId
      });
    });

    this.on('rfq.created', async (data: any) => {
      await realTimeAnalyticsService.emitLiveEvent({
        type: 'RFQ_CREATED',
        timestamp: new Date(),
        data: {
          rfqId: data.rfqId,
          category: data.category,
          buyerId: data.buyerId
        },
        companyId: data.companyId
      });
    });

    this.on('proposal.submitted', async (data: any) => {
      await realTimeAnalyticsService.emitLiveEvent({
        type: 'PROPOSAL_SUBMITTED',
        timestamp: new Date(),
        data: {
          proposalId: data.proposalId,
          rfqId: data.rfqId,
          supplierId: data.supplierId
        },
        companyId: data.companyId
      });
    });
  }

  private async setupBlockchainAnalyticsIntegration() {
    // Integrate blockchain analytics with main analytics system

    this.on('batch.created', async (data: any) => {
      // Update supply chain analytics when new batch is created
      await this.triggerSupplyChainAnalyticsUpdate(data.companyId);
    });

    this.on('supply_chain.event_added', async (data: any) => {
      // Real-time supply chain event processing
      await realTimeAnalyticsService.emitLiveEvent({
        type: 'ORDER_STATUS_CHANGED', // Map to appropriate type
        timestamp: new Date(),
        data: {
          batchId: data.batchId,
          eventType: data.eventType,
          location: data.location
        },
        companyId: data.companyId
      });
    });
  }

  private async setupAutomatedTasks() {
    // Setup periodic analytics tasks

    // Daily analytics summary
    setInterval(async () => {
      try {
        await this.generateDailyAnalyticsSummary();
      } catch (error) {
        logger.error('Failed to generate daily analytics summary', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Hourly anomaly detection
    setInterval(async () => {
      try {
        await this.performAnomalyDetection();
      } catch (error) {
        logger.error('Failed to perform anomaly detection', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Weekly predictive analytics refresh
    setInterval(async () => {
      try {
        await this.refreshPredictiveAnalytics();
      } catch (error) {
        logger.error('Failed to refresh predictive analytics', error);
      }
    }, 7 * 24 * 60 * 60 * 1000); // 7 days
  }

  private async setupEventDrivenAnalytics() {
    // Setup analytics that trigger based on specific events

    this.on('performance.threshold_breach', async (data: any) => {
      await this.handlePerformanceAlert(data);
    });

    this.on('demand.spike_detected', async (data: any) => {
      await this.handleDemandSpike(data);
    });

    this.on('risk.level_increased', async (data: any) => {
      await this.handleRiskIncrease(data);
    });
  }

  private async generateDailyAnalyticsSummary() {
    logger.info('Generating daily analytics summary');

    // This would generate and send daily summary reports
    // Implementation would depend on specific business requirements
  }

  private async performAnomalyDetection() {
    logger.info('Performing automated anomaly detection');

    // Implement automated anomaly detection across all metrics
    // This would identify unusual patterns in orders, revenue, supply chain, etc.
  }

  private async refreshPredictiveAnalytics() {
    logger.info('Refreshing predictive analytics models');

    // Refresh demand forecasts, price optimizations, etc.
    // This ensures models are trained on the latest data
  }

  private async triggerSupplyChainAnalyticsUpdate(companyId: string) {
    // Trigger supply chain analytics update
    this.emit('analytics.supply_chain_update', { companyId });
  }

  private async handlePerformanceAlert(data: any) {
    logger.warn('Performance threshold breached', data);

    await realTimeAnalyticsService.emitMetricAlert({
      type: 'WARNING',
      message: `Performance metric ${data.metric} dropped by ${data.dropPercentage}%`,
      companyId: data.companyId,
      severity: 'MEDIUM',
      data
    });
  }

  private async handleDemandSpike(data: any) {
    logger.info('Demand spike detected', data);

    await realTimeAnalyticsService.emitMetricAlert({
      type: 'INFO',
      message: `Demand spike detected for ${data.productName}: ${data.increasePercentage}% increase`,
      companyId: data.companyId,
      severity: 'LOW',
      data
    });
  }

  private async handleRiskIncrease(data: any) {
    logger.error('Risk level increased', data);

    await realTimeAnalyticsService.emitMetricAlert({
      type: 'ERROR',
      message: `Risk level increased to ${data.newLevel} for ${data.riskType}`,
      companyId: data.companyId,
      severity: 'HIGH',
      data
    });
  }

  // Event emitter methods
  on(event: string, listener: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }

  emit(event: string, data?: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          logger.error(`Error in event listener for ${event}`, error);
        }
      });
    }
  }

  // Public methods for triggering analytics events

  async trackOrderEvent(type: 'created' | 'status_changed' | 'completed', orderData: any) {
    try {
      this.emit(`order.${type}`, orderData);

      // Update real-time metrics
      if (this.config.enableRealtime) {
        await this.updateRealtimeMetrics(orderData.companyId);
      }

    } catch (error) {
      logger.error('Failed to track order event', error);
    }
  }

  async trackRFQEvent(type: 'created' | 'updated' | 'completed', rfqData: any) {
    try {
      this.emit(`rfq.${type}`, rfqData);

      if (this.config.enableRealtime) {
        await this.updateRealtimeMetrics(rfqData.companyId);
      }

    } catch (error) {
      logger.error('Failed to track RFQ event', error);
    }
  }

  async trackSupplyChainEvent(type: 'batch_created' | 'event_added' | 'verification_completed', data: any) {
    try {
      this.emit(`supply_chain.${type}`, data);

    } catch (error) {
      logger.error('Failed to track supply chain event', error);
    }
  }

  private async updateRealtimeMetrics(companyId: string) {
    // Trigger real-time metrics update
    this.emit('metrics.update_required', { companyId });
  }

  // Analytics query methods

  async getAnalyticsSummary(companyId: string, timeframe: string) {
    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (timeframe) {
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'quarter':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(endDate.getMonth() - 1);
      }

      const [dashboardMetrics, realtimeMetrics] = await Promise.all([
        advancedAnalyticsService.generateDashboardMetrics(
          companyId,
          { start: startDate, end: endDate },
          'USER' // Default role
        ),
        this.config.enableRealtime ?
          advancedAnalyticsService.getRealtimeMetrics(companyId, 'USER') :
          null
      ]);

      return {
        dashboard: dashboardMetrics,
        realtime: realtimeMetrics,
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Failed to get analytics summary', error);
      throw error;
    }
  }

  async getPredictiveInsights(companyId: string, productIds?: string[]) {
    try {
      if (!this.config.enablePredictive) {
        throw new Error('Predictive analytics is disabled');
      }

      const [customerSegments, riskAssessment, marketTrends] = await Promise.all([
        predictiveAnalyticsService.segmentCustomers(companyId),
        predictiveAnalyticsService.assessRisks(companyId),
        predictiveAnalyticsService.generateMarketTrends()
      ]);

      let demandForecasts = [];
      if (productIds && productIds.length > 0) {
        demandForecasts = await Promise.all(
          productIds.slice(0, 5).map(async productId =>
            predictiveAnalyticsService.generateDemandForecast(productId, 'MONTH', 3)
          )
        );
      }

      return {
        customerSegments,
        riskAssessment,
        marketTrends,
        demandForecasts,
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Failed to get predictive insights', error);
      throw error;
    }
  }

  getConnectionStats() {
    if (!this.config.enableRealtime) {
      return { enabled: false };
    }

    return {
      enabled: true,
      connections: realTimeAnalyticsService.getConnectedClients(),
      eventListeners: this.eventListeners.size
    };
  }

  async stop() {
    try {
      if (this.config.enableRealtime) {
        await realTimeAnalyticsService.stop();
      }

      this.eventListeners.clear();
      this.isInitialized = false;

      logger.info('Analytics integration service stopped');

    } catch (error) {
      logger.error('Failed to stop analytics integration service', error);
      throw error;
    }
  }
}

export const analyticsIntegrationService = new AnalyticsIntegrationService();
