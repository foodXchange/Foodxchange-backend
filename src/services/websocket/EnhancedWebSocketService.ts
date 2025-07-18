import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { Logger } from '../../core/logging/logger';
import { CacheService } from '../../infrastructure/cache/CacheService';
import { MetricsService } from '../../core/monitoring/metrics';
import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';
import { config } from '../../core/config';

const logger = new Logger('EnhancedWebSocketService');
const metrics = metricsService;

export interface WebSocketMessage {
  id: string;
  type: string;
  payload: any;
  timestamp: Date;
  userId: string;
  correlationId?: string;
}

export interface WebSocketRoom {
  id: string;
  name: string;
  type: 'rfq' | 'compliance' | 'order' | 'general';
  participants: string[];
  created: Date;
  lastActivity: Date;
  metadata?: any;
}

export interface WebSocketSession {
  id: string;
  userId: string;
  socketId: string;
  userAgent: string;
  ip: string;
  connectedAt: Date;
  lastActivity: Date;
  rooms: string[];
  metadata?: any;
}

export interface WebSocketEvent {
  type: string;
  room?: string;
  payload: any;
  broadcast?: boolean;
  targetUsers?: string[];
  excludeUsers?: string[];
  persistent?: boolean;
  ttl?: number;
}

export class EnhancedWebSocketService extends EventEmitter {
  private static instance: EnhancedWebSocketService;
  private io: SocketIOServer | null = null;
  private cache: CacheService;
  private activeSessions: Map<string, WebSocketSession> = new Map();
  private activeRooms: Map<string, WebSocketRoom> = new Map();
  private userSockets: Map<string, Set<string>> = new Map();

  private constructor() {
    super();
    this.cache = cacheService;
  }

  static getInstance(): EnhancedWebSocketService {
    if (!EnhancedWebSocketService.instance) {
      EnhancedWebSocketService.instance = new EnhancedWebSocketService();
    }
    return EnhancedWebSocketService.instance;
  }

  initialize(server: HttpServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: config.cors.allowedOrigins,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.setupHealthCheck();

    logger.info('WebSocket service initialized');
  }

  private setupMiddleware(): void {
    if (!this.io) return;

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        
        if (!token) {
          throw new Error('No authentication token provided');
        }

        const decoded = jwt.verify(token, config.auth.jwt.secret) as any;
        
        // Add user info to socket
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        socket.userCompany = decoded.company;

        next();
      } catch (error) {
        logger.warn('WebSocket authentication failed', { error: error.message });
        next(new Error('Authentication failed'));
      }
    });

    // Rate limiting middleware
    this.io.use((socket, next) => {
      // Implement rate limiting logic
      next();
    });
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  private handleConnection(socket: Socket): void {
    const session = this.createSession(socket);
    
    logger.info('WebSocket connection established', {
      sessionId: session.id,
      userId: session.userId,
      socketId: socket.id,
    });

    // Store session
    this.activeSessions.set(socket.id, session);
    
    // Add socket to user mapping
    if (!this.userSockets.has(session.userId)) {
      this.userSockets.set(session.userId, new Set());
    }
    this.userSockets.get(session.userId)!.add(socket.id);

    // Set up socket event handlers
    this.setupSocketEventHandlers(socket, session);

    // Join default rooms
    this.joinDefaultRooms(socket, session);

    // Send welcome message
    this.sendToSocket(socket.id, {
      type: 'connection_established',
      payload: {
        sessionId: session.id,
        timestamp: new Date(),
      },
    });

    // Update metrics
    metrics.increment('websocket_connections');
    metrics.gauge('websocket_active_connections', this.activeSessions.size);
  }

  private setupSocketEventHandlers(socket: Socket, session: WebSocketSession): void {
    // RFQ events
    socket.on('rfq:join', (data) => this.handleRFQJoin(socket, session, data));
    socket.on('rfq:leave', (data) => this.handleRFQLeave(socket, session, data));
    socket.on('rfq:status_update', (data) => this.handleRFQStatusUpdate(socket, session, data));
    socket.on('rfq:proposal_submitted', (data) => this.handleProposalSubmitted(socket, session, data));

    // Compliance events
    socket.on('compliance:check_request', (data) => this.handleComplianceCheckRequest(socket, session, data));
    socket.on('compliance:status_update', (data) => this.handleComplianceStatusUpdate(socket, session, data));

    // Order events
    socket.on('order:status_update', (data) => this.handleOrderStatusUpdate(socket, session, data));
    socket.on('order:tracking_update', (data) => this.handleOrderTrackingUpdate(socket, session, data));

    // Chat/messaging events
    socket.on('chat:message', (data) => this.handleChatMessage(socket, session, data));
    socket.on('chat:typing', (data) => this.handleTypingIndicator(socket, session, data));

    // Notification events
    socket.on('notification:read', (data) => this.handleNotificationRead(socket, session, data));
    socket.on('notification:subscribe', (data) => this.handleNotificationSubscribe(socket, session, data));

    // Heartbeat
    socket.on('heartbeat', () => this.handleHeartbeat(socket, session));

    // Disconnect
    socket.on('disconnect', (reason) => this.handleDisconnect(socket, session, reason));

    // Error handling
    socket.on('error', (error) => this.handleSocketError(socket, session, error));
  }

  private createSession(socket: Socket): WebSocketSession {
    return {
      id: this.generateSessionId(),
      userId: socket.userId,
      socketId: socket.id,
      userAgent: socket.handshake.headers['user-agent'] || '',
      ip: socket.handshake.address,
      connectedAt: new Date(),
      lastActivity: new Date(),
      rooms: [],
      metadata: {
        role: socket.userRole,
        company: socket.userCompany,
      },
    };
  }

  private joinDefaultRooms(socket: Socket, session: WebSocketSession): void {
    // Join user-specific room
    const userRoom = `user:${session.userId}`;
    socket.join(userRoom);
    session.rooms.push(userRoom);

    // Join role-specific room
    if (session.metadata?.role) {
      const roleRoom = `role:${session.metadata.role}`;
      socket.join(roleRoom);
      session.rooms.push(roleRoom);
    }

    // Join company-specific room
    if (session.metadata?.company) {
      const companyRoom = `company:${session.metadata.company}`;
      socket.join(companyRoom);
      session.rooms.push(companyRoom);
    }
  }

  // Event handlers
  private async handleRFQJoin(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { rfqId } = data;
      const roomId = `rfq:${rfqId}`;
      
      // Validate access to RFQ
      const hasAccess = await this.validateRFQAccess(session.userId, rfqId);
      if (!hasAccess) {
        this.sendError(socket, 'Access denied to RFQ');
        return;
      }

      // Join room
      socket.join(roomId);
      session.rooms.push(roomId);

      // Update or create room
      await this.updateRoom(roomId, 'rfq', session.userId);

      // Notify others in room
      socket.to(roomId).emit('rfq:user_joined', {
        userId: session.userId,
        timestamp: new Date(),
      });

      // Send confirmation
      this.sendToSocket(socket.id, {
        type: 'rfq:joined',
        payload: { rfqId, roomId },
      });

      logger.info('User joined RFQ room', { userId: session.userId, rfqId, roomId });
    } catch (error) {
      logger.error('Error handling RFQ join', { error, data });
      this.sendError(socket, 'Failed to join RFQ room');
    }
  }

  private async handleRFQLeave(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { rfqId } = data;
      const roomId = `rfq:${rfqId}`;
      
      // Leave room
      socket.leave(roomId);
      session.rooms = session.rooms.filter(room => room !== roomId);

      // Update room
      await this.updateRoom(roomId, 'rfq', session.userId, 'leave');

      // Notify others in room
      socket.to(roomId).emit('rfq:user_left', {
        userId: session.userId,
        timestamp: new Date(),
      });

      // Send confirmation
      this.sendToSocket(socket.id, {
        type: 'rfq:left',
        payload: { rfqId, roomId },
      });

      logger.info('User left RFQ room', { userId: session.userId, rfqId, roomId });
    } catch (error) {
      logger.error('Error handling RFQ leave', { error, data });
    }
  }

  private async handleRFQStatusUpdate(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { rfqId, status, message } = data;
      const roomId = `rfq:${rfqId}`;

      // Validate permission to update status
      const canUpdate = await this.validateRFQUpdatePermission(session.userId, rfqId);
      if (!canUpdate) {
        this.sendError(socket, 'Permission denied to update RFQ status');
        return;
      }

      // Broadcast status update to room
      this.broadcastToRoom(roomId, {
        type: 'rfq:status_updated',
        payload: {
          rfqId,
          status,
          message,
          updatedBy: session.userId,
          timestamp: new Date(),
        },
      });

      // Emit to external event system
      this.emit('rfq:status_updated', { rfqId, status, userId: session.userId });

      logger.info('RFQ status updated', { rfqId, status, userId: session.userId });
    } catch (error) {
      logger.error('Error handling RFQ status update', { error, data });
      this.sendError(socket, 'Failed to update RFQ status');
    }
  }

  private async handleProposalSubmitted(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { rfqId, proposalId, supplierId } = data;
      const roomId = `rfq:${rfqId}`;

      // Broadcast proposal submission to RFQ room
      this.broadcastToRoom(roomId, {
        type: 'rfq:proposal_submitted',
        payload: {
          rfqId,
          proposalId,
          supplierId,
          timestamp: new Date(),
        },
      });

      // Notify RFQ owner directly
      await this.notifyRFQOwner(rfqId, {
        type: 'proposal_submitted',
        payload: { rfqId, proposalId, supplierId },
      });

      // Emit to external event system
      this.emit('proposal:submitted', { rfqId, proposalId, supplierId });

      logger.info('Proposal submitted notification sent', { rfqId, proposalId, supplierId });
    } catch (error) {
      logger.error('Error handling proposal submitted', { error, data });
    }
  }

  private async handleComplianceCheckRequest(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { productId, region, checkType } = data;

      // Validate access to product
      const hasAccess = await this.validateProductAccess(session.userId, productId);
      if (!hasAccess) {
        this.sendError(socket, 'Access denied to product');
        return;
      }

      // Send acknowledgment
      this.sendToSocket(socket.id, {
        type: 'compliance:check_started',
        payload: {
          productId,
          region,
          checkType,
          requestId: this.generateRequestId(),
          timestamp: new Date(),
        },
      });

      // Emit to external event system
      this.emit('compliance:check_requested', { productId, region, checkType, userId: session.userId });

      logger.info('Compliance check requested', { productId, region, checkType, userId: session.userId });
    } catch (error) {
      logger.error('Error handling compliance check request', { error, data });
      this.sendError(socket, 'Failed to request compliance check');
    }
  }

  private async handleComplianceStatusUpdate(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { checkId, status, results } = data;

      // Notify user about compliance status update
      this.sendToUser(session.userId, {
        type: 'compliance:status_updated',
        payload: {
          checkId,
          status,
          results,
          timestamp: new Date(),
        },
      });

      // Emit to external event system
      this.emit('compliance:status_updated', { checkId, status, results, userId: session.userId });

      logger.info('Compliance status updated', { checkId, status, userId: session.userId });
    } catch (error) {
      logger.error('Error handling compliance status update', { error, data });
    }
  }

  private async handleOrderStatusUpdate(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { orderId, status, message } = data;

      // Validate permission to update order
      const canUpdate = await this.validateOrderUpdatePermission(session.userId, orderId);
      if (!canUpdate) {
        this.sendError(socket, 'Permission denied to update order');
        return;
      }

      // Notify relevant parties
      await this.notifyOrderParties(orderId, {
        type: 'order:status_updated',
        payload: {
          orderId,
          status,
          message,
          updatedBy: session.userId,
          timestamp: new Date(),
        },
      });

      // Emit to external event system
      this.emit('order:status_updated', { orderId, status, userId: session.userId });

      logger.info('Order status updated', { orderId, status, userId: session.userId });
    } catch (error) {
      logger.error('Error handling order status update', { error, data });
      this.sendError(socket, 'Failed to update order status');
    }
  }

  private async handleOrderTrackingUpdate(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { orderId, trackingInfo } = data;

      // Notify order parties about tracking update
      await this.notifyOrderParties(orderId, {
        type: 'order:tracking_updated',
        payload: {
          orderId,
          trackingInfo,
          timestamp: new Date(),
        },
      });

      logger.info('Order tracking updated', { orderId, userId: session.userId });
    } catch (error) {
      logger.error('Error handling order tracking update', { error, data });
    }
  }

  private async handleChatMessage(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { roomId, message, replyTo } = data;

      // Validate access to chat room
      const hasAccess = await this.validateChatAccess(session.userId, roomId);
      if (!hasAccess) {
        this.sendError(socket, 'Access denied to chat room');
        return;
      }

      // Broadcast message to room
      this.broadcastToRoom(roomId, {
        type: 'chat:message',
        payload: {
          messageId: this.generateMessageId(),
          roomId,
          message,
          replyTo,
          senderId: session.userId,
          timestamp: new Date(),
        },
      }, [socket.id]); // Exclude sender

      // Send confirmation to sender
      this.sendToSocket(socket.id, {
        type: 'chat:message_sent',
        payload: {
          roomId,
          timestamp: new Date(),
        },
      });

      logger.info('Chat message sent', { roomId, userId: session.userId });
    } catch (error) {
      logger.error('Error handling chat message', { error, data });
      this.sendError(socket, 'Failed to send message');
    }
  }

  private async handleTypingIndicator(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { roomId, isTyping } = data;

      // Broadcast typing indicator to room
      socket.to(roomId).emit('chat:typing', {
        userId: session.userId,
        isTyping,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Error handling typing indicator', { error, data });
    }
  }

  private async handleNotificationRead(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { notificationId } = data;

      // Emit to external event system
      this.emit('notification:read', { notificationId, userId: session.userId });

      logger.info('Notification marked as read', { notificationId, userId: session.userId });
    } catch (error) {
      logger.error('Error handling notification read', { error, data });
    }
  }

  private async handleNotificationSubscribe(socket: Socket, session: WebSocketSession, data: any): Promise<void> {
    try {
      const { types, entities } = data;

      // Update subscription preferences
      await this.updateNotificationSubscriptions(session.userId, types, entities);

      // Send confirmation
      this.sendToSocket(socket.id, {
        type: 'notification:subscribed',
        payload: {
          types,
          entities,
          timestamp: new Date(),
        },
      });

      logger.info('Notification subscriptions updated', { userId: session.userId, types, entities });
    } catch (error) {
      logger.error('Error handling notification subscription', { error, data });
    }
  }

  private async handleHeartbeat(socket: Socket, session: WebSocketSession): Promise<void> {
    session.lastActivity = new Date();
    socket.emit('heartbeat_ack', { timestamp: new Date() });
  }

  private async handleDisconnect(socket: Socket, session: WebSocketSession, reason: string): Promise<void> {
    try {
      // Remove session
      this.activeSessions.delete(socket.id);

      // Remove from user sockets mapping
      const userSockets = this.userSockets.get(session.userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.userSockets.delete(session.userId);
        }
      }

      // Leave all rooms
      for (const roomId of session.rooms) {
        await this.updateRoom(roomId, 'general', session.userId, 'leave');
      }

      // Update metrics
      metrics.decrement('websocket_active_connections');
      metrics.increment('websocket_disconnections');

      logger.info('WebSocket disconnected', {
        sessionId: session.id,
        userId: session.userId,
        reason,
      });
    } catch (error) {
      logger.error('Error handling disconnect', { error, reason });
    }
  }

  private async handleSocketError(socket: Socket, session: WebSocketSession, error: any): Promise<void> {
    logger.error('WebSocket error', {
      sessionId: session.id,
      userId: session.userId,
      error: error.message,
    });

    metrics.increment('websocket_errors');
  }

  // Public methods for external use
  public async sendToUser(userId: string, event: WebSocketEvent): Promise<void> {
    const userSockets = this.userSockets.get(userId);
    if (!userSockets) {
      logger.warn('No active sockets for user', { userId });
      return;
    }

    for (const socketId of userSockets) {
      this.sendToSocket(socketId, event);
    }
  }

  public async sendToRoom(roomId: string, event: WebSocketEvent): Promise<void> {
    if (!this.io) return;

    this.io.to(roomId).emit(event.type, event.payload);
  }

  public async broadcastToRoom(roomId: string, event: WebSocketEvent, excludeSockets?: string[]): Promise<void> {
    if (!this.io) return;

    let broadcast = this.io.to(roomId);
    
    if (excludeSockets) {
      for (const socketId of excludeSockets) {
        broadcast = broadcast.except(socketId);
      }
    }

    broadcast.emit(event.type, event.payload);
  }

  public async sendToSocket(socketId: string, event: WebSocketEvent): Promise<void> {
    if (!this.io) return;

    this.io.to(socketId).emit(event.type, event.payload);
  }

  public async sendError(socket: Socket, message: string): Promise<void> {
    socket.emit('error', {
      message,
      timestamp: new Date(),
    });
  }

  // Helper methods
  private async validateRFQAccess(userId: string, rfqId: string): Promise<boolean> {
    // Implement RFQ access validation
    return true;
  }

  private async validateRFQUpdatePermission(userId: string, rfqId: string): Promise<boolean> {
    // Implement RFQ update permission validation
    return true;
  }

  private async validateProductAccess(userId: string, productId: string): Promise<boolean> {
    // Implement product access validation
    return true;
  }

  private async validateOrderUpdatePermission(userId: string, orderId: string): Promise<boolean> {
    // Implement order update permission validation
    return true;
  }

  private async validateChatAccess(userId: string, roomId: string): Promise<boolean> {
    // Implement chat access validation
    return true;
  }

  private async updateRoom(roomId: string, type: string, userId: string, action: 'join' | 'leave' = 'join'): Promise<void> {
    // Implement room management
  }

  private async notifyRFQOwner(rfqId: string, event: WebSocketEvent): Promise<void> {
    // Implement RFQ owner notification
  }

  private async notifyOrderParties(orderId: string, event: WebSocketEvent): Promise<void> {
    // Implement order parties notification
  }

  private async updateNotificationSubscriptions(userId: string, types: string[], entities: string[]): Promise<void> {
    // Implement notification subscription update
  }

  private generateSessionId(): string {
    return new Date().getTime().toString(36) + Math.random().toString(36).substr(2);
  }

  private generateRequestId(): string {
    return 'req_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private generateMessageId(): string {
    return 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private setupHealthCheck(): void {
    setInterval(() => {
      if (this.io) {
        metrics.gauge('websocket_active_connections', this.activeSessions.size);
        metrics.gauge('websocket_active_rooms', this.activeRooms.size);
        metrics.gauge('websocket_active_users', this.userSockets.size);
      }
    }, 30000); // Every 30 seconds
  }

  public getStats(): any {
    return {
      activeSessions: this.activeSessions.size,
      activeRooms: this.activeRooms.size,
      activeUsers: this.userSockets.size,
      uptime: process.uptime(),
    };
  }
}

export default EnhancedWebSocketService.getInstance();