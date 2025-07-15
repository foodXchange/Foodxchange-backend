import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/metrics/MetricsService';
import { multiLevelCache } from '../cache/MultiLevelCacheService';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';

// Event types for analytics tracking
export type AnalyticsEvent = 
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'signup_success'
  | 'signup_failure'
  | 'password_reset_requested'
  | 'password_reset_success'
  | 'password_changed'
  | 'email_verified'
  | 'profile_updated'
  | 'company_updated'
  | 'document_uploaded'
  | 'preferences_updated'
  | 'sso_login_success'
  | 'sso_login_failure'
  | 'api_request'
  | 'api_error'
  | 'rfq_created'
  | 'rfq_updated'
  | 'rfq_deleted'
  | 'quote_submitted'
  | 'quote_accepted'
  | 'quote_rejected'
  | 'order_created'
  | 'order_updated'
  | 'order_completed'
  | 'message_sent'
  | 'notification_sent'
  | 'file_uploaded'
  | 'search_performed'
  | 'page_viewed'
  | 'feature_used';

export interface AnalyticsEventData {
  userId?: string;
  email?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  timestamp?: Date;
  properties?: { [key: string]: any };
}

// Analytics event schema for MongoDB
const analyticsEventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  sessionId: {
    type: String,
    index: true
  },
  email: String,
  role: String,
  ip: String,
  userAgent: String,
  properties: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Metadata for processing
  processed: {
    type: Boolean,
    default: false,
    index: true
  },
  batchId: String
}, {
  timestamps: true,
  // Optimize for time-series data
  capped: {
    size: 1000000000, // 1GB
    max: 10000000 // 10M documents
  }
});

// Compound indexes for common queries
analyticsEventSchema.index({ eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ userId: 1, timestamp: -1 });
analyticsEventSchema.index({ timestamp: -1, processed: 1 });

const AnalyticsEvent = mongoose.model('AnalyticsEvent', analyticsEventSchema);

export class AnalyticsService extends EventEmitter {
  private logger: Logger;
  private metricsService: MetricsService;
  private batchSize: number = 100;
  private flushInterval: number = 30000; // 30 seconds
  private eventBuffer: Array<any> = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.logger = new Logger('AnalyticsService');
    this.metricsService = new MetricsService();
    this.startBatchProcessor();
  }

  /**
   * Track an analytics event
   */
  async track(eventType: AnalyticsEvent, data: AnalyticsEventData = {}): Promise<void> {
    try {
      const event = {
        eventType,
        userId: data.userId ? new mongoose.Types.ObjectId(data.userId) : undefined,
        email: data.email,
        role: data.role,
        ip: data.ip,
        userAgent: data.userAgent,
        sessionId: data.sessionId,
        properties: data.properties || {},
        timestamp: data.timestamp || new Date()
      };

      // Add to buffer for batch processing
      this.eventBuffer.push(event);

      // Update metrics
      this.metricsService.incrementCounter('analytics_events_total', {
        event_type: eventType,
        user_role: data.role || 'unknown'
      });

      // Emit event for real-time processing
      this.emit('event', event);

      // Flush buffer if it's full
      if (this.eventBuffer.length >= this.batchSize) {
        await this.flushEvents();
      }

      this.logger.debug('Analytics event tracked:', { eventType, userId: data.userId });

    } catch (error) {
      this.logger.error('Failed to track analytics event:', error);
      this.metricsService.incrementCounter('analytics_errors_total', {
        event_type: eventType,
        error_type: 'tracking_failed'
      });
    }
  }

  /**
   * Track API request
   */
  async trackApiRequest(req: any, res: any, responseTime: number): Promise<void> {
    await this.track('api_request', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      properties: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime,
        query: req.query,
        params: req.params
      }
    });
  }

  /**
   * Track API error
   */
  async trackApiError(req: any, error: Error): Promise<void> {
    await this.track('api_error', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      properties: {
        method: req.method,
        path: req.path,
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack
      }
    });
  }

  /**
   * Track user journey step
   */
  async trackUserJourney(userId: string, step: string, properties: any = {}): Promise<void> {
    await this.track('feature_used', {
      userId,
      properties: {
        journeyStep: step,
        ...properties
      }
    });
  }

  /**
   * Track search query
   */
  async trackSearch(userId: string, query: string, results: number, filters: any = {}): Promise<void> {
    await this.track('search_performed', {
      userId,
      properties: {
        query,
        resultsCount: results,
        filters,
        timestamp: new Date()
      }
    });
  }

  /**
   * Track business metrics
   */
  async trackBusinessMetric(userId: string, metric: string, value: number, metadata: any = {}): Promise<void> {
    await this.track('feature_used', {
      userId,
      properties: {
        metricType: 'business',
        metric,
        value,
        metadata,
        timestamp: new Date()
      }
    });
  }

  /**
   * Get analytics summary for a user
   */
  async getUserAnalytics(userId: string, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const cacheKey = `user_analytics:${userId}:${startDate?.toISOString()}:${endDate?.toISOString()}`;
      
      // Check cache first
      const cached = await multiLevelCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const matchQuery: any = { userId: new mongoose.Types.ObjectId(userId) };
      
      if (startDate || endDate) {
        matchQuery.timestamp = {};
        if (startDate) matchQuery.timestamp.$gte = startDate;
        if (endDate) matchQuery.timestamp.$lte = endDate;
      }

      const analytics = await AnalyticsEvent.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
            lastOccurrence: { $max: '$timestamp' }
          }
        },
        {
          $group: {
            _id: null,
            totalEvents: { $sum: '$count' },
            eventTypes: {
              $push: {
                eventType: '$_id',
                count: '$count',
                lastOccurrence: '$lastOccurrence'
              }
            }
          }
        }
      ]);

      const result = analytics[0] || {
        totalEvents: 0,
        eventTypes: []
      };

      // Cache for 5 minutes
      await multiLevelCache.set(cacheKey, result, 300);

      return result;

    } catch (error) {
      this.logger.error('Failed to get user analytics:', error);
      throw error;
    }
  }

  /**
   * Get system-wide analytics
   */
  async getSystemAnalytics(startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const cacheKey = `system_analytics:${startDate?.toISOString()}:${endDate?.toISOString()}`;
      
      // Check cache first
      const cached = await multiLevelCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const matchQuery: any = {};
      
      if (startDate || endDate) {
        matchQuery.timestamp = {};
        if (startDate) matchQuery.timestamp.$gte = startDate;
        if (endDate) matchQuery.timestamp.$lte = endDate;
      }

      const analytics = await AnalyticsEvent.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              eventType: '$eventType',
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$timestamp'
                }
              }
            },
            count: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        {
          $group: {
            _id: '$_id.eventType',
            totalCount: { $sum: '$count' },
            uniqueUsers: { $sum: { $size: '$uniqueUsers' } },
            dailyBreakdown: {
              $push: {
                date: '$_id.date',
                count: '$count',
                uniqueUsers: { $size: '$uniqueUsers' }
              }
            }
          }
        }
      ]);

      const result = {
        eventTypes: analytics,
        totalEvents: analytics.reduce((sum, event) => sum + event.totalCount, 0),
        totalUniqueUsers: new Set(analytics.flatMap(event => event.uniqueUsers)).size
      };

      // Cache for 10 minutes
      await multiLevelCache.set(cacheKey, result, 600);

      return result;

    } catch (error) {
      this.logger.error('Failed to get system analytics:', error);
      throw error;
    }
  }

  /**
   * Get real-time analytics
   */
  async getRealtimeAnalytics(): Promise<any> {
    try {
      const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);
      
      const realtimeData = await AnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: last5Minutes } } },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        {
          $project: {
            eventType: '$_id',
            count: 1,
            uniqueUsers: { $size: '$uniqueUsers' }
          }
        }
      ]);

      return {
        timeRange: '5 minutes',
        events: realtimeData
      };

    } catch (error) {
      this.logger.error('Failed to get realtime analytics:', error);
      throw error;
    }
  }

  /**
   * Start batch processor for efficient event storage
   */
  private startBatchProcessor(): void {
    this.flushTimer = setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        await this.flushEvents();
      }
    }, this.flushInterval);
  }

  /**
   * Flush buffered events to database
   */
  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    try {
      const events = this.eventBuffer.splice(0, this.batchSize);
      const batchId = new mongoose.Types.ObjectId().toString();

      // Add batch ID to events
      events.forEach(event => {
        event.batchId = batchId;
      });

      await AnalyticsEvent.insertMany(events, { ordered: false });

      this.metricsService.incrementCounter('analytics_events_flushed_total', {
        batch_size: events.length.toString()
      });

      this.logger.debug('Flushed analytics events:', { count: events.length, batchId });

    } catch (error) {
      this.logger.error('Failed to flush analytics events:', error);
      this.metricsService.incrementCounter('analytics_errors_total', {
        error_type: 'flush_failed'
      });
    }
  }

  /**
   * Cleanup old events (for data retention)
   */
  async cleanupOldEvents(daysToKeep: number = 90): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      
      const result = await AnalyticsEvent.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      this.logger.info('Cleaned up old analytics events:', {
        deletedCount: result.deletedCount,
        cutoffDate: cutoffDate.toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to cleanup old analytics events:', error);
    }
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(startDate: Date, endDate: Date, format: 'json' | 'csv' = 'json'): Promise<any> {
    try {
      const events = await AnalyticsEvent.find({
        timestamp: { $gte: startDate, $lte: endDate }
      }).sort({ timestamp: -1 });

      if (format === 'json') {
        return events;
      }

      // Convert to CSV format
      const csvData = events.map(event => ({
        eventType: event.eventType,
        userId: event.userId,
        timestamp: event.timestamp,
        ip: event.ip,
        properties: JSON.stringify(event.properties)
      }));

      return csvData;

    } catch (error) {
      this.logger.error('Failed to export analytics:', error);
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    // Flush remaining events
    await this.flushEvents();
    
    this.logger.info('Analytics service shut down gracefully');
  }
}