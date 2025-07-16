import { Server as SocketServer, Socket } from 'socket.io';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { ExpertProfile, ExpertCollaboration, ServiceBooking } from '../models';

const logger = new Logger('ExpertStatusTracker');

export interface LiveExpertStatus {
  expertId: string;
  currentStatus: 'available' | 'busy' | 'in_consultation' | 'offline';
  nextAvailableSlot: Date | null;
  responseTimeEstimate: number; // minutes
  currentWorkload: number; // 0-100%
  instantBookingEnabled: boolean;
  lastSeen: Date;
  activeCollaborations: number;
  todayConsultations: number;
}

interface StatusUpdate {
  expertId: string;
  status: LiveExpertStatus['currentStatus'];
  metadata?: {
    consultationId?: string;
    estimatedDuration?: number;
    autoStatus?: boolean;
  };
}

export class ExpertStatusTracker {
  private io: SocketServer;
  private redisClient: RedisClientType;
  private statusUpdateInterval: NodeJS.Timeout;
  private readonly STATUS_TTL = 300; // 5 minutes
  private readonly WORKLOAD_CHECK_INTERVAL = 60000; // 1 minute

  constructor(io: SocketServer) {
    this.io = io;
    this.initializeRedis();
    this.setupSocketHandlers();
    this.startPeriodicUpdates();
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    this.redisClient = createClient({
      url: config.redis.url,
      password: config.redis.password,
      database: config.redis.db,
    });

    this.redisClient.on('error', (err) => {
      logger.error('Redis Client Error', err);
    });

    this.redisClient.on('connect', () => {
      logger.info('Redis connected for expert status tracking');
    });

    await this.redisClient.connect();
  }

  /**
   * Setup Socket.IO handlers for real-time status
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      // Expert joins their status room
      socket.on('expert:join', async (expertId: string) => {
        socket.join(`expert:${expertId}`);
        socket.data.expertId = expertId;
        
        // Send current status
        const status = await this.getExpertStatus(expertId);
        socket.emit('status:current', status);
        
        // Mark as online
        await this.updateExpertStatus({
          expertId,
          status: 'available',
          metadata: { autoStatus: true }
        });
      });

      // Expert updates their status
      socket.on('status:update', async (update: StatusUpdate) => {
        if (socket.data.expertId === update.expertId) {
          await this.updateExpertStatus(update);
        }
      });

      // Client subscribes to expert status updates
      socket.on('expert:subscribe', (expertIds: string[]) => {
        expertIds.forEach(id => socket.join(`expert:${id}:watchers`));
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        if (socket.data.expertId) {
          await this.handleExpertDisconnect(socket.data.expertId);
        }
      });

      // Instant booking request
      socket.on('booking:instant', async (data: {
        expertId: string;
        clientId: string;
        duration: number;
        topic: string;
      }) => {
        await this.handleInstantBooking(data);
      });
    });
  }

  /**
   * Start periodic status updates
   */
  private startPeriodicUpdates(): void {
    this.statusUpdateInterval = setInterval(async () => {
      await this.updateAllExpertWorkloads();
      await this.checkUpcomingAvailability();
    }, this.WORKLOAD_CHECK_INTERVAL);
  }

  /**
   * Update expert status
   */
  async updateExpertStatus(update: StatusUpdate): Promise<void> {
    try {
      const status = await this.calculateExpertStatus(update.expertId);
      
      // Override with manual status if provided
      if (update.status) {
        status.currentStatus = update.status;
      }

      // Store in Redis
      const key = `expert:status:${update.expertId}`;
      await this.redisClient.setEx(
        key,
        this.STATUS_TTL,
        JSON.stringify(status)
      );

      // Update database
      await ExpertProfile.findByIdAndUpdate(update.expertId, {
        lastActiveAt: new Date(),
      });

      // Broadcast to all watchers
      this.io.to(`expert:${update.expertId}`).emit('status:updated', status);
      this.io.to(`expert:${update.expertId}:watchers`).emit('expert:status:changed', {
        expertId: update.expertId,
        status
      });

      logger.info(`Expert ${update.expertId} status updated to ${status.currentStatus}`);
    } catch (error) {
      logger.error('Error updating expert status', error);
    }
  }

  /**
   * Get expert status
   */
  async getExpertStatus(expertId: string): Promise<LiveExpertStatus | null> {
    try {
      // Check Redis cache first
      const cached = await this.redisClient.get(`expert:status:${expertId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate fresh status
      const status = await this.calculateExpertStatus(expertId);
      
      // Cache it
      await this.redisClient.setEx(
        `expert:status:${expertId}`,
        this.STATUS_TTL,
        JSON.stringify(status)
      );

      return status;
    } catch (error) {
      logger.error('Error getting expert status', error);
      return null;
    }
  }

  /**
   * Get multiple expert statuses
   */
  async getMultipleExpertStatuses(expertIds: string[]): Promise<Map<string, LiveExpertStatus>> {
    const statuses = new Map<string, LiveExpertStatus>();

    // Batch Redis operations
    const pipeline = this.redisClient.multi();
    expertIds.forEach(id => {
      pipeline.get(`expert:status:${id}`);
    });

    const results = await pipeline.exec();

    // Process results and calculate missing statuses
    await Promise.all(expertIds.map(async (id, index) => {
      const cached = results[index];
      if (cached) {
        statuses.set(id, JSON.parse(cached as string));
      } else {
        const status = await this.calculateExpertStatus(id);
        statuses.set(id, status);
      }
    }));

    return statuses;
  }

  /**
   * Calculate expert status based on current data
   */
  private async calculateExpertStatus(expertId: string): Promise<LiveExpertStatus> {
    const [expert, activeCollabs, todayBookings, nextAvailable] = await Promise.all([
      ExpertProfile.findById(expertId).select('responseTime lastActiveAt'),
      ExpertCollaboration.countDocuments({
        expertId,
        status: { $in: ['accepted', 'in_progress'] }
      }),
      ServiceBooking.countDocuments({
        expertId,
        scheduledDate: {
          $gte: new Date().setHours(0, 0, 0, 0),
          $lt: new Date().setHours(23, 59, 59, 999)
        },
        status: { $in: ['confirmed', 'in_progress'] }
      }),
      this.getNextAvailableSlot(expertId)
    ]);

    if (!expert) {
      throw new Error(`Expert ${expertId} not found`);
    }

    // Determine current status
    const now = new Date();
    const isInConsultation = await this.isCurrentlyInConsultation(expertId);
    const lastSeenMinutesAgo = (now.getTime() - expert.lastActiveAt.getTime()) / 60000;

    let currentStatus: LiveExpertStatus['currentStatus'];
    if (lastSeenMinutesAgo > 30) {
      currentStatus = 'offline';
    } else if (isInConsultation) {
      currentStatus = 'in_consultation';
    } else if (activeCollabs >= config.expertMarketplace.maxActiveCollaborationsPerExpert) {
      currentStatus = 'busy';
    } else {
      currentStatus = 'available';
    }

    // Calculate workload
    const workload = Math.min(
      (activeCollabs / config.expertMarketplace.maxActiveCollaborationsPerExpert) * 100,
      100
    );

    return {
      expertId,
      currentStatus,
      nextAvailableSlot: nextAvailable,
      responseTimeEstimate: expert.responseTime * 60, // Convert to minutes
      currentWorkload: Math.round(workload),
      instantBookingEnabled: currentStatus === 'available' && workload < 80,
      lastSeen: expert.lastActiveAt,
      activeCollaborations: activeCollabs,
      todayConsultations: todayBookings
    };
  }

  /**
   * Check if expert is currently in consultation
   */
  private async isCurrentlyInConsultation(expertId: string): Promise<boolean> {
    const now = new Date();
    
    const activeBooking = await ServiceBooking.findOne({
      expertId,
      status: 'confirmed',
      scheduledDate: { $lte: now },
      $expr: {
        $gte: [
          { $add: ['$scheduledDate', { $multiply: ['$duration', 60000] }] },
          now
        ]
      }
    });

    return !!activeBooking;
  }

  /**
   * Get next available slot for expert
   */
  private async getNextAvailableSlot(expertId: string): Promise<Date | null> {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get expert's availability slots
    const expert = await ExpertProfile.findById(expertId).select('availability');
    if (!expert || !expert.availability.length) {
      return null;
    }

    // Get booked slots
    const bookings = await ServiceBooking.find({
      expertId,
      status: { $in: ['confirmed', 'pending'] },
      scheduledDate: { $gte: now, $lte: nextWeek }
    }).select('scheduledDate duration');

    // Find next available slot
    // This is a simplified version - real implementation would be more complex
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    return tomorrow;
  }

  /**
   * Handle expert disconnect
   */
  private async handleExpertDisconnect(expertId: string): Promise<void> {
    // Wait 30 seconds before marking offline (in case of reconnection)
    setTimeout(async () => {
      const connectedSockets = await this.io.in(`expert:${expertId}`).fetchSockets();
      
      if (connectedSockets.length === 0) {
        await this.updateExpertStatus({
          expertId,
          status: 'offline',
          metadata: { autoStatus: true }
        });
      }
    }, 30000);
  }

  /**
   * Handle instant booking request
   */
  private async handleInstantBooking(data: {
    expertId: string;
    clientId: string;
    duration: number;
    topic: string;
  }): Promise<void> {
    try {
      const status = await this.getExpertStatus(data.expertId);
      
      if (!status || !status.instantBookingEnabled) {
        this.io.to(`client:${data.clientId}`).emit('booking:instant:failed', {
          reason: 'Expert not available for instant booking'
        });
        return;
      }

      // Create instant booking
      // Implementation would create a ServiceBooking and start consultation

      // Update expert status
      await this.updateExpertStatus({
        expertId: data.expertId,
        status: 'in_consultation',
        metadata: {
          consultationId: 'generated-id',
          estimatedDuration: data.duration
        }
      });

      // Notify both parties
      this.io.to(`expert:${data.expertId}`).emit('booking:instant:created', {
        clientId: data.clientId,
        duration: data.duration,
        topic: data.topic
      });

      this.io.to(`client:${data.clientId}`).emit('booking:instant:success', {
        expertId: data.expertId,
        meetingUrl: 'generated-meeting-url'
      });
    } catch (error) {
      logger.error('Error handling instant booking', error);
    }
  }

  /**
   * Update all expert workloads
   */
  private async updateAllExpertWorkloads(): Promise<void> {
    try {
      // Get all active experts
      const activeExperts = await ExpertProfile.find({
        status: 'active',
        lastActiveAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).select('_id');

      // Update workloads in batches
      const batchSize = 50;
      for (let i = 0; i < activeExperts.length; i += batchSize) {
        const batch = activeExperts.slice(i, i + batchSize);
        await Promise.all(
          batch.map(expert => this.updateExpertStatus({
            expertId: expert._id.toString(),
            status: null as any, // Just recalculate
            metadata: { autoStatus: true }
          }))
        );
      }
    } catch (error) {
      logger.error('Error updating expert workloads', error);
    }
  }

  /**
   * Check upcoming availability
   */
  private async checkUpcomingAvailability(): Promise<void> {
    try {
      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

      // Find experts becoming available soon
      const upcomingAvailable = await ServiceBooking.find({
        status: 'confirmed',
        scheduledDate: { $lte: now },
        $expr: {
          $and: [
            { $lte: [{ $add: ['$scheduledDate', { $multiply: ['$duration', 60000] }] }, inOneHour] },
            { $gte: [{ $add: ['$scheduledDate', { $multiply: ['$duration', 60000] }] }, now] }
          ]
        }
      }).distinct('expertId');

      // Notify about upcoming availability
      upcomingAvailable.forEach(expertId => {
        this.io.to(`expert:${expertId}:watchers`).emit('expert:becoming:available', {
          expertId,
          availableIn: 'soon'
        });
      });
    } catch (error) {
      logger.error('Error checking upcoming availability', error);
    }
  }

  /**
   * Get expert availability heatmap
   */
  async getAvailabilityHeatmap(expertId: string, days: number = 7): Promise<any> {
    const heatmap = [];
    const startDate = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      const dayData = {
        date: date.toISOString().split('T')[0],
        slots: await this.getDayAvailability(expertId, date)
      };
      
      heatmap.push(dayData);
    }
    
    return heatmap;
  }

  /**
   * Get day availability
   */
  private async getDayAvailability(expertId: string, date: Date): Promise<any[]> {
    // Implementation would check expert's availability patterns
    // and existing bookings to return available time slots
    return [];
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
    }
    
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}