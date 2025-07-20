import { EventEmitter } from 'events';

import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';


import { Logger } from '../../core/logging/logger';
import { optimizedCache } from '../cache/OptimizedCacheService';

import { advancedAnalyticsService, RealtimeMetrics } from './AdvancedAnalyticsService';

const logger = new Logger('RealTimeAnalyticsService');

export interface LiveEvent {
  type: 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'RFQ_CREATED' | 'PROPOSAL_SUBMITTED' | 'USER_JOINED' | 'USER_LEFT' | 'METRIC_UPDATE';
  timestamp: Date;
  data: any;
  userId?: string;
  companyId?: string;
  metadata?: Record<string, any>;
}

export interface DashboardSubscription {
  userId: string;
  companyId: string;
  socketId: string;
  filters: {
    metrics?: string[];
    timeframe?: string;
    realtime?: boolean;
  };
  lastUpdate?: Date;
}

export class RealTimeAnalyticsService extends EventEmitter {
  private io: SocketIOServer;
  private redis: Redis;
  private readonly subscriptions: Map<string, DashboardSubscription> = new Map();
  private metricsInterval: NodeJS.Timeout;
  private isInitialized: boolean = false;

  constructor() {
    super();
  }

  async initialize(server: any) {
    try {
      // Initialize Socket.IO
      this.io = new SocketIOServer(server, {
        cors: {
          origin: process.env.FRONTEND_URL || 'http://localhost:3000',
          methods: ['GET', 'POST'],
          credentials: true
        },
        path: '/socket.io/analytics',
        transports: ['websocket', 'polling']
      });

      // Initialize Redis for horizontal scaling
      if (process.env.REDIS_URL) {
        this.redis = new Redis(process.env.REDIS_URL);
        const pubClient = new Redis(process.env.REDIS_URL);
        const subClient = pubClient.duplicate();

        this.io.adapter(createAdapter(pubClient, subClient));

        logger.info('Redis adapter configured for Socket.IO');
      }

      this.setupEventHandlers();
      this.startMetricsUpdates();

      this.isInitialized = true;
      logger.info('Real-time analytics service initialized');

    } catch (error) {
      logger.error('Failed to initialize real-time analytics service', error);
      throw error;
    }
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected to analytics', { socketId: socket.id });

      // Handle authentication
      socket.on('authenticate', async (token: string) => {
        try {
          // In real implementation, verify JWT token
          const user = await this.verifyToken(token);

          if (user) {
            socket.data.user = user;
            socket.join(`company:${user.companyId}`);
            socket.join(`user:${user.userId}`);

            logger.info('Client authenticated for analytics', {
              socketId: socket.id,
              userId: user.userId,
              companyId: user.companyId
            });

            socket.emit('authenticated', { success: true });

            // Send initial metrics
            await this.sendInitialMetrics(socket, user);
          } else {
            socket.emit('authentication_failed', { error: 'Invalid token' });
            socket.disconnect();
          }
        } catch (error) {
          logger.error('Authentication failed', error);
          socket.emit('authentication_failed', { error: 'Authentication error' });
          socket.disconnect();
        }
      });

      // Handle dashboard subscription
      socket.on('subscribe_dashboard', async (filters: any) => {
        try {
          if (!socket.data.user) {
            socket.emit('subscription_failed', { error: 'Not authenticated' });
            return;
          }

          const subscription: DashboardSubscription = {
            userId: socket.data.user.userId,
            companyId: socket.data.user.companyId,
            socketId: socket.id,
            filters: filters || {},
            lastUpdate: new Date()
          };

          this.subscriptions.set(socket.id, subscription);

          logger.info('Dashboard subscription created', {
            socketId: socket.id,
            userId: subscription.userId,
            filters
          });

          socket.emit('subscription_success', { filters });

          // Send current metrics
          await this.sendMetricsUpdate(socket, subscription);

        } catch (error) {
          logger.error('Failed to create dashboard subscription', error);
          socket.emit('subscription_failed', { error: 'Subscription error' });
        }
      });

      // Handle unsubscribe
      socket.on('unsubscribe_dashboard', () => {
        this.subscriptions.delete(socket.id);
        logger.info('Dashboard subscription removed', { socketId: socket.id });
      });

      // Handle custom metric requests
      socket.on('request_custom_metrics', async (config: any) => {
        try {
          if (!socket.data.user) {
            socket.emit('error', { error: 'Not authenticated' });
            return;
          }

          const analytics = await advancedAnalyticsService.generateCustomAnalytics(
            socket.data.user.companyId,
            config
          );

          socket.emit('custom_metrics', {
            timestamp: new Date(),
            data: analytics
          });

        } catch (error) {
          logger.error('Failed to generate custom metrics', error);
          socket.emit('error', { error: 'Failed to generate metrics' });
        }
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        this.subscriptions.delete(socket.id);
        logger.info('Client disconnected from analytics', {
          socketId: socket.id,
          reason
        });
      });
    });
  }

  private async verifyToken(token: string): Promise<{ userId: string; companyId: string; role: string } | null> {
    try {
      // Mock token verification - implement proper JWT verification
      if (token && token.length > 10) {
        return {
          userId: 'user123',
          companyId: 'company123',
          role: 'BUYER'
        };
      }
      return null;
    } catch (error) {
      logger.error('Token verification failed', error);
      return null;
    }
  }

  private async sendInitialMetrics(socket: any, user: any) {
    try {
      const metrics = await advancedAnalyticsService.getRealtimeMetrics(
        user.companyId,
        user.role
      );

      socket.emit('initial_metrics', {
        timestamp: new Date(),
        data: metrics
      });

    } catch (error) {
      logger.error('Failed to send initial metrics', error);
    }
  }

  private async sendMetricsUpdate(socket: any, subscription: DashboardSubscription) {
    try {
      const {user} = socket.data;

      // Get real-time metrics
      const realtimeMetrics = await advancedAnalyticsService.getRealtimeMetrics(
        user.companyId,
        user.role
      );

      // Get dashboard metrics if requested
      let dashboardMetrics;
      if (subscription.filters.metrics?.includes('dashboard')) {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days

        dashboardMetrics = await advancedAnalyticsService.generateDashboardMetrics(
          user.companyId,
          { start: startDate, end: endDate },
          user.role
        );
      }

      const update = {
        timestamp: new Date(),
        realtime: realtimeMetrics,
        dashboard: dashboardMetrics,
        filters: subscription.filters
      };

      socket.emit('metrics_update', update);
      subscription.lastUpdate = new Date();

    } catch (error) {
      logger.error('Failed to send metrics update', error);
    }
  }

  private startMetricsUpdates() {
    // Update metrics every 10 seconds
    this.metricsInterval = setInterval(async () => {
      await this.broadcastMetricsUpdates();
    }, 10000);

    logger.info('Started metrics update broadcast');
  }

  private async broadcastMetricsUpdates() {
    try {
      const updates = new Map<string, any>();

      // Group subscriptions by company for efficient batch processing
      const companiesSockets = new Map<string, DashboardSubscription[]>();

      for (const subscription of this.subscriptions.values()) {
        if (!companiesSockets.has(subscription.companyId)) {
          companiesSockets.set(subscription.companyId, []);
        }
        companiesSockets.get(subscription.companyId).push(subscription);
      }

      // Generate metrics for each company
      for (const [companyId, subs] of companiesSockets) {
        try {
          const sample = subs[0];
          const socket = this.io.sockets.sockets.get(sample.socketId);

          if (socket?.data.user) {
            const metrics = await advancedAnalyticsService.getRealtimeMetrics(
              companyId,
              socket.data.user.role
            );
            updates.set(companyId, metrics);
          }
        } catch (error) {
          logger.error(`Failed to generate metrics for company ${companyId}`, error);
        }
      }

      // Send updates to subscribed clients
      for (const subscription of this.subscriptions.values()) {
        const socket = this.io.sockets.sockets.get(subscription.socketId);

        if (socket && updates.has(subscription.companyId)) {
          const metrics = updates.get(subscription.companyId);

          socket.emit('realtime_update', {
            timestamp: new Date(),
            data: metrics
          });
        }
      }

    } catch (error) {
      logger.error('Failed to broadcast metrics updates', error);
    }
  }

  // Public methods for emitting events

  async emitLiveEvent(event: LiveEvent) {
    try {
      if (!this.isInitialized) return;

      // Emit to specific company room
      if (event.companyId) {
        this.io.to(`company:${event.companyId}`).emit('live_event', {
          ...event,
          timestamp: new Date()
        });
      }

      // Emit to specific user
      if (event.userId) {
        this.io.to(`user:${event.userId}`).emit('live_event', {
          ...event,
          timestamp: new Date()
        });
      }

      // Store in cache for recent events
      await this.storeLiveEvent(event);

      logger.debug('Live event emitted', {
        type: event.type,
        companyId: event.companyId,
        userId: event.userId
      });

    } catch (error) {
      logger.error('Failed to emit live event', error);
    }
  }

  async emitMetricAlert(alert: {
    type: 'WARNING' | 'ERROR' | 'INFO';
    message: string;
    companyId: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    data?: any;
  }) {
    try {
      if (!this.isInitialized) return;

      this.io.to(`company:${alert.companyId}`).emit('metric_alert', {
        ...alert,
        timestamp: new Date()
      });

      logger.info('Metric alert emitted', {
        type: alert.type,
        severity: alert.severity,
        companyId: alert.companyId
      });

    } catch (error) {
      logger.error('Failed to emit metric alert', error);
    }
  }

  private async storeLiveEvent(event: LiveEvent) {
    try {
      const key = `live_events:${event.companyId || 'global'}`;
      const events = await optimizedCache.get(key) || [];

      events.push({
        ...event,
        timestamp: new Date()
      });

      // Keep only last 50 events
      if (events.length > 50) {
        events.splice(0, events.length - 50);
      }

      await optimizedCache.set(key, events, { ttl: 3600 }); // 1 hour

    } catch (error) {
      logger.error('Failed to store live event', error);
    }
  }

  async getRecentEvents(companyId: string, limit: number = 20): Promise<LiveEvent[]> {
    try {
      const key = `live_events:${companyId}`;
      const events = await optimizedCache.get(key) || [];

      return events
        .sort((a: LiveEvent, b: LiveEvent) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);

    } catch (error) {
      logger.error('Failed to get recent events', error);
      return [];
    }
  }

  getConnectedClients(): {
    total: number;
    byCompany: Record<string, number>;
    subscriptions: number;
    } {
    const stats = {
      total: this.io.sockets.sockets.size,
      byCompany: {} as Record<string, number>,
      subscriptions: this.subscriptions.size
    };

    // Count clients by company
    for (const subscription of this.subscriptions.values()) {
      const {companyId} = subscription;
      stats.byCompany[companyId] = (stats.byCompany[companyId] || 0) + 1;
    }

    return stats;
  }

  async stop() {
    try {
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      if (this.io) {
        this.io.close();
      }

      if (this.redis) {
        await this.redis.quit();
      }

      this.subscriptions.clear();
      this.isInitialized = false;

      logger.info('Real-time analytics service stopped');

    } catch (error) {
      logger.error('Failed to stop real-time analytics service', error);
      throw error;
    }
  }
}

export const realTimeAnalyticsService = new RealTimeAnalyticsService();
