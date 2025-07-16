import { Server as SocketServer, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { ExpertProfile } from '../models/ExpertProfile.model';
import { AgentProfile } from '../modules/agent/models/AgentProfile.model';
import { advancedCacheService } from './AdvancedCacheService';

const logger = new Logger('RealTimeStatusService');

export interface UserPresence {
  userId: string;
  userType: 'expert' | 'agent' | 'client';
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen: Date;
  socketId?: string;
  location?: {
    country: string;
    city: string;
  };
  device?: string;
}

export interface RealTimeEvent {
  type: string;
  payload: any;
  userId?: string;
  room?: string;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export class RealTimeStatusService {
  private io: SocketServer;
  private redisClient!: Redis;
  private userSessions: Map<string, UserPresence> = new Map();
  private roomSubscriptions: Map<string, Set<string>> = new Map();

  constructor(io: SocketServer) {
    this.io = io;
    this.initializeRedis();
    this.setupSocketHandlers();
    this.startPresenceCleanup();
  }

  private initializeRedis(): void {
    this.redisClient = new Redis({
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db || 1, // Use different DB for real-time data
      keyPrefix: 'foodx:realtime:',
    });

    this.redisClient.on('error', (error) => {
      logger.error('Real-time Redis connection error:', error);
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info('New WebSocket connection', { socketId: socket.id });

      // Handle user authentication and presence
      socket.on('authenticate', async (data: { userId: string; userType: 'expert' | 'agent' | 'client'; token: string }) => {
        try {
          // Verify JWT token (implement your auth logic)
          const isValid = await this.verifyToken(data.token);
          if (!isValid) {
            socket.emit('auth_error', { message: 'Invalid token' });
            return;
          }

          // Set user presence
          await this.setUserPresence(socket, data.userId, data.userType);
          
          // Join user-specific room
          socket.join(`user:${data.userId}`);
          
          // Join type-specific room
          socket.join(`${data.userType}s`);

          socket.emit('authenticated', { success: true });
          
          // Broadcast user online status
          this.broadcastStatusUpdate(data.userId, 'online');
          
        } catch (error) {
          logger.error('Authentication error:', error);
          socket.emit('auth_error', { message: 'Authentication failed' });
        }
      });

      // Handle status updates
      socket.on('status_update', async (data: { status: 'online' | 'away' | 'busy' }) => {
        const userSession = Array.from(this.userSessions.values())
          .find(session => session.socketId === socket.id);
        
        if (userSession) {
          await this.updateUserStatus(userSession.userId, data.status);
          this.broadcastStatusUpdate(userSession.userId, data.status);
        }
      });

      // Handle joining specific rooms (projects, collaborations, etc.)
      socket.on('join_room', async (data: { room: string; userId: string }) => {
        try {
          // Verify user has permission to join room
          const hasPermission = await this.verifyRoomPermission(data.userId, data.room);
          if (!hasPermission) {
            socket.emit('room_error', { message: 'Permission denied' });
            return;
          }

          socket.join(data.room);
          this.addRoomSubscription(data.room, data.userId);
          
          // Send room history
          const roomHistory = await this.getRoomHistory(data.room);
          socket.emit('room_history', roomHistory);
          
          // Notify room members
          socket.to(data.room).emit('user_joined', { 
            userId: data.userId, 
            timestamp: new Date() 
          });
          
        } catch (error) {
          logger.error('Join room error:', error);
          socket.emit('room_error', { message: 'Failed to join room' });
        }
      });

      // Handle leaving rooms
      socket.on('leave_room', (data: { room: string; userId: string }) => {
        socket.leave(data.room);
        this.removeRoomSubscription(data.room, data.userId);
        
        socket.to(data.room).emit('user_left', { 
          userId: data.userId, 
          timestamp: new Date() 
        });
      });

      // Handle real-time notifications
      socket.on('send_notification', async (data: RealTimeEvent) => {
        await this.processRealTimeEvent(data);
      });

      // Handle expert availability updates
      socket.on('availability_update', async (data: { 
        expertId: string; 
        availability: any; 
        timezone: string 
      }) => {
        await this.updateExpertAvailability(data.expertId, data.availability, data.timezone);
      });

      // Handle agent lead updates
      socket.on('lead_update', async (data: {
        agentId: string;
        leadId: string;
        status: string;
        notes?: string;
      }) => {
        await this.processLeadUpdate(data);
      });

      // Handle typing indicators
      socket.on('typing_start', (data: { room: string; userId: string }) => {
        socket.to(data.room).emit('user_typing', { 
          userId: data.userId, 
          timestamp: new Date() 
        });
      });

      socket.on('typing_stop', (data: { room: string; userId: string }) => {
        socket.to(data.room).emit('user_stopped_typing', { 
          userId: data.userId 
        });
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        await this.handleDisconnection(socket);
      });
    });
  }

  private async setUserPresence(socket: Socket, userId: string, userType: 'expert' | 'agent' | 'client'): Promise<void> {
    const presence: UserPresence = {
      userId,
      userType,
      status: 'online',
      lastSeen: new Date(),
      socketId: socket.id,
    };

    this.userSessions.set(socket.id, presence);
    
    // Store in Redis for cross-instance communication
    await this.redisClient.setex(
      `presence:${userId}`, 
      3600, 
      JSON.stringify(presence)
    );

    // Update database presence
    if (userType === 'expert') {
      await ExpertProfile.findByIdAndUpdate(userId, {
        isOnline: true,
        lastActiveAt: new Date()
      });
    } else if (userType === 'agent') {
      await AgentProfile.findByIdAndUpdate(userId, {
        isOnline: true,
        lastActiveAt: new Date()
      });
    }

    // Cache user presence
    await advancedCacheService.set(
      `presence:${userId}`, 
      presence, 
      { ttl: 3600, tags: ['presence', userType] }
    );
  }

  private async updateUserStatus(userId: string, status: 'online' | 'away' | 'busy'): Promise<void> {
    // Update in-memory sessions
    for (const [socketId, session] of this.userSessions.entries()) {
      if (session.userId === userId) {
        session.status = status;
        session.lastSeen = new Date();
        break;
      }
    }

    // Update Redis
    const presence = await this.redisClient.get(`presence:${userId}`);
    if (presence) {
      const parsedPresence = JSON.parse(presence);
      parsedPresence.status = status;
      parsedPresence.lastSeen = new Date();
      
      await this.redisClient.setex(
        `presence:${userId}`, 
        3600, 
        JSON.stringify(parsedPresence)
      );
    }

    // Update cache
    await advancedCacheService.invalidateByTags([`user:${userId}`, 'presence']);
  }

  private broadcastStatusUpdate(userId: string, status: string): void {
    this.io.emit('status_update', {
      userId,
      status,
      timestamp: new Date()
    });
  }

  private async processRealTimeEvent(event: RealTimeEvent): Promise<void> {
    try {
      // Store event for analytics
      await this.storeEvent(event);

      // Route event based on type
      switch (event.type) {
        case 'expert_booking':
          await this.handleExpertBooking(event);
          break;
        case 'lead_assignment':
          await this.handleLeadAssignment(event);
          break;
        case 'rfq_update':
          await this.handleRfqUpdate(event);
          break;
        case 'collaboration_invite':
          await this.handleCollaborationInvite(event);
          break;
        case 'payment_notification':
          await this.handlePaymentNotification(event);
          break;
        default:
          await this.handleGenericEvent(event);
      }
    } catch (error) {
      logger.error('Error processing real-time event:', error);
    }
  }

  private async handleExpertBooking(event: RealTimeEvent): Promise<void> {
    const { expertId, clientId, bookingData } = event.payload;
    
    // Notify expert
    this.io.to(`user:${expertId}`).emit('new_booking', {
      booking: bookingData,
      timestamp: event.timestamp,
      priority: event.priority
    });

    // Notify client
    this.io.to(`user:${clientId}`).emit('booking_confirmed', {
      booking: bookingData,
      timestamp: event.timestamp
    });

    // Update expert availability in real-time
    await this.updateExpertAvailabilityCache(expertId);
  }

  private async handleLeadAssignment(event: RealTimeEvent): Promise<void> {
    const { agentId, leadData } = event.payload;
    
    // Notify agent
    this.io.to(`user:${agentId}`).emit('new_lead_assigned', {
      lead: leadData,
      timestamp: event.timestamp,
      priority: event.priority
    });

    // Update agent dashboard in real-time
    this.io.to(`user:${agentId}`).emit('dashboard_update', {
      type: 'new_lead',
      data: leadData
    });
  }

  private async handleRfqUpdate(event: RealTimeEvent): Promise<void> {
    const { rfqId, status, involvedUsers } = event.payload;
    
    // Notify all involved users
    for (const userId of involvedUsers) {
      this.io.to(`user:${userId}`).emit('rfq_status_update', {
        rfqId,
        status,
        timestamp: event.timestamp
      });
    }
  }

  private async handleCollaborationInvite(event: RealTimeEvent): Promise<void> {
    const { inviteeId, inviterName, projectDetails } = event.payload;
    
    this.io.to(`user:${inviteeId}`).emit('collaboration_invite', {
      inviterName,
      projectDetails,
      timestamp: event.timestamp,
      priority: 'high'
    });
  }

  private async handlePaymentNotification(event: RealTimeEvent): Promise<void> {
    const { userId, paymentData } = event.payload;
    
    this.io.to(`user:${userId}`).emit('payment_update', {
      payment: paymentData,
      timestamp: event.timestamp,
      priority: 'high'
    });
  }

  private async handleGenericEvent(event: RealTimeEvent): Promise<void> {
    if (event.room) {
      this.io.to(event.room).emit(event.type, {
        payload: event.payload,
        timestamp: event.timestamp,
        priority: event.priority
      });
    } else if (event.userId) {
      this.io.to(`user:${event.userId}`).emit(event.type, {
        payload: event.payload,
        timestamp: event.timestamp,
        priority: event.priority
      });
    }
  }

  private async updateExpertAvailability(expertId: string, availability: any, timezone: string): Promise<void> {
    try {
      // Update database
      await ExpertProfile.findByIdAndUpdate(expertId, {
        'availability.schedule': availability,
        'availability.timezone': timezone,
        lastActiveAt: new Date()
      });

      // Invalidate related caches
      await advancedCacheService.invalidateByTags([
        `expert:${expertId}`,
        'availability',
        'expert_search'
      ]);

      // Broadcast to interested parties
      this.io.emit('expert_availability_update', {
        expertId,
        availability,
        timezone,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error updating expert availability:', error);
    }
  }

  private async processLeadUpdate(data: any): Promise<void> {
    try {
      // Update lead in database (this would call your lead service)
      // await leadService.updateLead(data.leadId, data);

      // Notify relevant users
      this.io.to(`user:${data.agentId}`).emit('lead_updated', {
        leadId: data.leadId,
        status: data.status,
        notes: data.notes,
        timestamp: new Date()
      });

      // Update agent dashboard
      this.io.to(`user:${data.agentId}`).emit('dashboard_update', {
        type: 'lead_status_change',
        data: data
      });

    } catch (error) {
      logger.error('Error processing lead update:', error);
    }
  }

  private async updateExpertAvailabilityCache(expertId: string): Promise<void> {
    await advancedCacheService.invalidateByTags([
      `expert:${expertId}`,
      'availability'
    ]);
  }

  private async verifyToken(token: string): Promise<boolean> {
    // Implement JWT token verification
    // This would use your existing auth service
    return true; // Placeholder
  }

  private async verifyRoomPermission(userId: string, room: string): Promise<boolean> {
    // Implement room permission verification
    // Check if user has access to specific rooms/projects
    return true; // Placeholder
  }

  private async getRoomHistory(room: string): Promise<any[]> {
    // Get recent room messages/events
    const history = await this.redisClient.lrange(`room_history:${room}`, 0, 50);
    return history.map(item => JSON.parse(item));
  }

  private addRoomSubscription(room: string, userId: string): void {
    if (!this.roomSubscriptions.has(room)) {
      this.roomSubscriptions.set(room, new Set());
    }
    this.roomSubscriptions.get(room)!.add(userId);
  }

  private removeRoomSubscription(room: string, userId: string): void {
    const subscribers = this.roomSubscriptions.get(room);
    if (subscribers) {
      subscribers.delete(userId);
      if (subscribers.size === 0) {
        this.roomSubscriptions.delete(room);
      }
    }
  }

  private async storeEvent(event: RealTimeEvent): Promise<void> {
    // Store event for analytics and audit trail
    await this.redisClient.lpush(
      'events:timeline',
      JSON.stringify({
        ...event,
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })
    );

    // Keep only last 10000 events
    await this.redisClient.ltrim('events:timeline', 0, 9999);
  }

  private async handleDisconnection(socket: Socket): Promise<void> {
    const userSession = this.userSessions.get(socket.id);
    
    if (userSession) {
      // Update status to offline
      await this.updateUserStatus(userSession.userId, 'offline');
      
      // Update database
      if (userSession.userType === 'expert') {
        await ExpertProfile.findByIdAndUpdate(userSession.userId, {
          isOnline: false,
          lastActiveAt: new Date()
        });
      } else if (userSession.userType === 'agent') {
        await AgentProfile.findByIdAndUpdate(userSession.userId, {
          isOnline: false,
          lastActiveAt: new Date()
        });
      }

      // Remove from sessions
      this.userSessions.delete(socket.id);
      
      // Broadcast offline status
      this.broadcastStatusUpdate(userSession.userId, 'offline');
      
      logger.info('User disconnected', { 
        userId: userSession.userId, 
        socketId: socket.id 
      });
    }
  }

  private startPresenceCleanup(): void {
    // Clean up stale presence data every 5 minutes
    setInterval(async () => {
      try {
        const staleThreshold = Date.now() - (10 * 60 * 1000); // 10 minutes
        
        for (const [socketId, session] of this.userSessions.entries()) {
          if (session.lastSeen.getTime() < staleThreshold) {
            await this.updateUserStatus(session.userId, 'offline');
            this.userSessions.delete(socketId);
          }
        }
      } catch (error) {
        logger.error('Presence cleanup error:', error);
      }
    }, 5 * 60 * 1000);
  }

  // Public API methods
  async getUserPresence(userId: string): Promise<UserPresence | null> {
    try {
      const cached = await advancedCacheService.get<UserPresence>(`presence:${userId}`);
      return cached;
    } catch (error) {
      logger.error('Error getting user presence:', error);
      return null;
    }
  }

  async getOnlineUsers(userType?: 'expert' | 'agent' | 'client'): Promise<UserPresence[]> {
    const onlineUsers: UserPresence[] = [];
    
    for (const session of this.userSessions.values()) {
      if (session.status !== 'offline' && (!userType || session.userType === userType)) {
        onlineUsers.push(session);
      }
    }
    
    return onlineUsers;
  }

  async sendNotificationToUser(userId: string, notification: any): Promise<void> {
    this.io.to(`user:${userId}`).emit('notification', {
      ...notification,
      timestamp: new Date()
    });
  }

  async sendNotificationToRoom(room: string, notification: any): Promise<void> {
    this.io.to(room).emit('room_notification', {
      ...notification,
      timestamp: new Date()
    });
  }

  async getRoomMembers(room: string): Promise<string[]> {
    const subscribers = this.roomSubscriptions.get(room);
    return subscribers ? Array.from(subscribers) : [];
  }
}