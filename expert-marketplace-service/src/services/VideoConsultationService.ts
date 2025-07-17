import { EventEmitter } from 'events';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { ExpertProfile } from '../models/ExpertProfile.model';
import { productionLogger } from '../utils/productionLogger';
import { redisClient } from '../utils/redis';
import { Socket } from 'socket.io';

export interface VideoRoom {
  roomId: string;
  expertId: string;
  clientId: string;
  status: 'scheduled' | 'waiting' | 'active' | 'ended' | 'cancelled';
  scheduledAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  duration?: number;
  recordingEnabled: boolean;
  recordingUrl?: string;
  participants: Participant[];
  settings: RoomSettings;
  metadata: {
    rfqId?: string;
    projectId?: string;
    purpose: string;
    notes?: string;
  };
}

export interface Participant {
  userId: string;
  role: 'expert' | 'client' | 'observer';
  joinedAt: Date;
  leftAt?: Date;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  devices: {
    camera: boolean;
    microphone: boolean;
    screen: boolean;
  };
}

export interface RoomSettings {
  maxDuration: number; // minutes
  allowRecording: boolean;
  allowScreenShare: boolean;
  allowChat: boolean;
  allowFileSharing: boolean;
  autoEndOnLeave: boolean;
  waitingRoomEnabled: boolean;
}

export interface VideoConsultationRequest {
  expertId: string;
  clientId: string;
  scheduledAt: Date;
  duration: number; // minutes
  purpose: string;
  rfqId?: string;
  projectId?: string;
  recordingRequired?: boolean;
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface WebRTCConfig {
  iceServers: IceServer[];
  iceTransportPolicy: 'all' | 'relay';
  bundlePolicy: 'balanced' | 'max-compat' | 'max-bundle';
  rtcpMuxPolicy: 'negotiate' | 'require';
}

export class VideoConsultationService extends EventEmitter {
  private static instance: VideoConsultationService;
  private rooms: Map<string, VideoRoom> = new Map();
  private socketRooms: Map<string, Set<string>> = new Map(); // roomId -> socketIds
  private userSockets: Map<string, string> = new Map(); // userId -> socketId
  
  // WebRTC configuration
  private webRTCConfig: WebRTCConfig = {
    iceServers: [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
      },
      {
        urls: ['turn:turn.example.com:3478'],
        username: config.webrtc?.turnUsername || 'username',
        credential: config.webrtc?.turnCredential || 'credential'
      }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

  private constructor() {
    super();
    this.loadRoomsFromCache();
  }

  static getInstance(): VideoConsultationService {
    if (!VideoConsultationService.instance) {
      VideoConsultationService.instance = new VideoConsultationService();
    }
    return VideoConsultationService.instance;
  }

  private async loadRoomsFromCache(): Promise<void> {
    try {
      const roomKeys = await redisClient.keys('video:room:*');
      for (const key of roomKeys) {
        const roomData = await redisClient.get(key);
        if (roomData) {
          const room = JSON.parse(roomData);
          this.rooms.set(room.roomId, room);
        }
      }
      productionLogger.info('Loaded video rooms from cache', {
        roomCount: this.rooms.size
      });
    } catch (error) {
      productionLogger.error('Failed to load rooms from cache', { error });
    }
  }

  async createConsultation(request: VideoConsultationRequest): Promise<VideoRoom> {
    const roomId = `room_${uuidv4()}`;
    
    const room: VideoRoom = {
      roomId,
      expertId: request.expertId,
      clientId: request.clientId,
      status: 'scheduled',
      scheduledAt: request.scheduledAt,
      recordingEnabled: request.recordingRequired || false,
      participants: [],
      settings: {
        maxDuration: request.duration,
        allowRecording: request.recordingRequired || false,
        allowScreenShare: true,
        allowChat: true,
        allowFileSharing: true,
        autoEndOnLeave: false,
        waitingRoomEnabled: true
      },
      metadata: {
        rfqId: request.rfqId,
        projectId: request.projectId,
        purpose: request.purpose
      }
    };

    this.rooms.set(roomId, room);
    await this.saveRoomToCache(room);

    productionLogger.info('Video consultation created', {
      roomId,
      expertId: request.expertId,
      clientId: request.clientId,
      scheduledAt: request.scheduledAt
    });

    // Schedule reminder notifications
    await this.scheduleReminders(room);

    this.emit('consultation:created', room);
    return room;
  }

  async joinRoom(roomId: string, userId: string, socket: Socket): Promise<VideoRoom> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    // Check if user is authorized
    if (userId !== room.expertId && userId !== room.clientId) {
      throw new Error('Unauthorized to join this room');
    }

    // Determine role
    const role = userId === room.expertId ? 'expert' : 'client';

    // Add participant
    const participant: Participant = {
      userId,
      role,
      joinedAt: new Date(),
      connectionQuality: 'good',
      devices: {
        camera: true,
        microphone: true,
        screen: false
      }
    };

    room.participants.push(participant);
    
    // Update room status
    if (room.status === 'scheduled' || room.status === 'waiting') {
      room.status = 'waiting';
      
      // If both participants are present, start the consultation
      const expertPresent = room.participants.some(p => p.role === 'expert' && !p.leftAt);
      const clientPresent = room.participants.some(p => p.role === 'client' && !p.leftAt);
      
      if (expertPresent && clientPresent) {
        room.status = 'active';
        room.startedAt = new Date();
      }
    }

    // Socket room management
    socket.join(roomId);
    this.addSocketToRoom(roomId, socket.id);
    this.userSockets.set(userId, socket.id);

    await this.saveRoomToCache(room);

    productionLogger.info('User joined video room', {
      roomId,
      userId,
      role,
      status: room.status
    });

    // Notify other participants
    socket.to(roomId).emit('participant:joined', {
      participant,
      roomStatus: room.status
    });

    this.emit('room:joined', { room, userId, role });
    return room;
  }

  async leaveRoom(roomId: string, userId: string, socket: Socket): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    // Update participant status
    const participant = room.participants.find(p => p.userId === userId);
    if (participant) {
      participant.leftAt = new Date();
    }

    // Socket management
    socket.leave(roomId);
    this.removeSocketFromRoom(roomId, socket.id);
    this.userSockets.delete(userId);

    // Check if room should end
    const activeParticipants = room.participants.filter(p => !p.leftAt);
    
    if (room.settings.autoEndOnLeave && activeParticipants.length === 0) {
      await this.endConsultation(roomId);
    } else if (room.status === 'active' && activeParticipants.length < 2) {
      room.status = 'waiting';
    }

    await this.saveRoomToCache(room);

    // Notify other participants
    socket.to(roomId).emit('participant:left', {
      userId,
      remainingParticipants: activeParticipants.length
    });

    productionLogger.info('User left video room', {
      roomId,
      userId,
      remainingParticipants: activeParticipants.length
    });

    this.emit('room:left', { room, userId });
  }

  async endConsultation(roomId: string): Promise<VideoRoom> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    room.status = 'ended';
    room.endedAt = new Date();
    
    if (room.startedAt) {
      room.duration = Math.floor((room.endedAt.getTime() - room.startedAt.getTime()) / 1000 / 60);
    }

    // End all active participants
    room.participants.forEach(participant => {
      if (!participant.leftAt) {
        participant.leftAt = room.endedAt;
      }
    });

    await this.saveRoomToCache(room);

    // Notify all participants
    this.broadcastToRoom(roomId, 'consultation:ended', {
      roomId,
      duration: room.duration,
      endedAt: room.endedAt
    });

    // Clean up socket rooms
    this.socketRooms.delete(roomId);

    productionLogger.info('Video consultation ended', {
      roomId,
      duration: room.duration,
      participantCount: room.participants.length
    });

    // Generate consultation summary
    await this.generateConsultationSummary(room);

    this.emit('consultation:ended', room);
    return room;
  }

  async updateParticipantDevices(
    roomId: string, 
    userId: string, 
    devices: Partial<Participant['devices']>
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const participant = room.participants.find(p => p.userId === userId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    participant.devices = { ...participant.devices, ...devices };
    await this.saveRoomToCache(room);

    // Notify other participants
    this.broadcastToRoom(roomId, 'participant:deviceUpdate', {
      userId,
      devices: participant.devices
    });
  }

  async updateConnectionQuality(
    roomId: string, 
    userId: string, 
    quality: Participant['connectionQuality']
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const participant = room.participants.find(p => p.userId === userId);
    if (participant) {
      participant.connectionQuality = quality;
      await this.saveRoomToCache(room);

      // Notify if quality is poor
      if (quality === 'poor') {
        this.broadcastToRoom(roomId, 'connection:qualityAlert', {
          userId,
          quality
        });
      }
    }
  }

  async startRecording(roomId: string): Promise<string> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.settings.allowRecording) {
      throw new Error('Recording not allowed for this consultation');
    }

    // In production, integrate with recording service (e.g., Agora, Twilio)
    const recordingId = `rec_${uuidv4()}`;
    room.recordingUrl = `https://recordings.foodxchange.com/${recordingId}`;

    await this.saveRoomToCache(room);

    this.broadcastToRoom(roomId, 'recording:started', {
      recordingId,
      startedAt: new Date()
    });

    productionLogger.info('Recording started', { roomId, recordingId });
    return recordingId;
  }

  async stopRecording(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    await this.saveRoomToCache(room);

    this.broadcastToRoom(roomId, 'recording:stopped', {
      stoppedAt: new Date()
    });

    productionLogger.info('Recording stopped', { roomId });
  }

  async getRoomToken(roomId: string, userId: string): Promise<string> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    // Verify user is authorized
    if (userId !== room.expertId && userId !== room.clientId) {
      throw new Error('Unauthorized');
    }

    // Generate JWT token for room access
    const token = jwt.sign(
      {
        roomId,
        userId,
        role: userId === room.expertId ? 'expert' : 'client',
        permissions: {
          canShare: true,
          canRecord: room.settings.allowRecording,
          canChat: room.settings.allowChat
        }
      },
      config.jwt.secret,
      { expiresIn: '4h' }
    );

    return token;
  }

  getWebRTCConfig(): WebRTCConfig {
    return this.webRTCConfig;
  }

  async getActiveConsultations(userId: string): Promise<VideoRoom[]> {
    const rooms = Array.from(this.rooms.values());
    return rooms.filter(room => 
      (room.expertId === userId || room.clientId === userId) &&
      (room.status === 'scheduled' || room.status === 'waiting' || room.status === 'active')
    );
  }

  async getConsultationHistory(userId: string, limit: number = 10): Promise<VideoRoom[]> {
    const rooms = Array.from(this.rooms.values());
    return rooms
      .filter(room => 
        (room.expertId === userId || room.clientId === userId) &&
        room.status === 'ended'
      )
      .sort((a, b) => (b.endedAt?.getTime() || 0) - (a.endedAt?.getTime() || 0))
      .slice(0, limit);
  }

  async getConsultationStats(userId: string): Promise<{
    totalConsultations: number;
    totalDuration: number;
    averageDuration: number;
    completionRate: number;
    connectionQuality: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    };
  }> {
    const userRooms = Array.from(this.rooms.values()).filter(room =>
      room.expertId === userId || room.clientId === userId
    );

    const completedRooms = userRooms.filter(room => room.status === 'ended');
    const totalDuration = completedRooms.reduce((sum, room) => sum + (room.duration || 0), 0);

    // Analyze connection quality
    const qualityCounts = { excellent: 0, good: 0, fair: 0, poor: 0 };
    completedRooms.forEach(room => {
      room.participants.forEach(participant => {
        if (participant.userId === userId) {
          qualityCounts[participant.connectionQuality]++;
        }
      });
    });

    return {
      totalConsultations: userRooms.length,
      totalDuration,
      averageDuration: completedRooms.length > 0 ? totalDuration / completedRooms.length : 0,
      completionRate: userRooms.length > 0 ? (completedRooms.length / userRooms.length) * 100 : 0,
      connectionQuality: qualityCounts
    };
  }

  // Helper methods
  private async saveRoomToCache(room: VideoRoom): Promise<void> {
    await redisClient.setex(
      `video:room:${room.roomId}`,
      86400, // 24 hours
      JSON.stringify(room)
    );
  }

  private addSocketToRoom(roomId: string, socketId: string): void {
    if (!this.socketRooms.has(roomId)) {
      this.socketRooms.set(roomId, new Set());
    }
    this.socketRooms.get(roomId)!.add(socketId);
  }

  private removeSocketFromRoom(roomId: string, socketId: string): void {
    const sockets = this.socketRooms.get(roomId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.socketRooms.delete(roomId);
      }
    }
  }

  private broadcastToRoom(roomId: string, event: string, data: any): void {
    const sockets = this.socketRooms.get(roomId);
    if (sockets) {
      sockets.forEach(socketId => {
        // Emit through Socket.io instance
        this.emit('broadcast', { socketId, event, data });
      });
    }
  }

  private async scheduleReminders(room: VideoRoom): Promise<void> {
    // Schedule 24-hour reminder
    const oneDayBefore = new Date(room.scheduledAt.getTime() - 24 * 60 * 60 * 1000);
    if (oneDayBefore > new Date()) {
      setTimeout(() => {
        this.emit('reminder:24hours', room);
      }, oneDayBefore.getTime() - Date.now());
    }

    // Schedule 1-hour reminder
    const oneHourBefore = new Date(room.scheduledAt.getTime() - 60 * 60 * 1000);
    if (oneHourBefore > new Date()) {
      setTimeout(() => {
        this.emit('reminder:1hour', room);
      }, oneHourBefore.getTime() - Date.now());
    }

    // Schedule 15-minute reminder
    const fifteenMinutesBefore = new Date(room.scheduledAt.getTime() - 15 * 60 * 1000);
    if (fifteenMinutesBefore > new Date()) {
      setTimeout(() => {
        this.emit('reminder:15minutes', room);
      }, fifteenMinutesBefore.getTime() - Date.now());
    }
  }

  private async generateConsultationSummary(room: VideoRoom): Promise<void> {
    const summary = {
      roomId: room.roomId,
      duration: room.duration,
      participants: room.participants.map(p => ({
        userId: p.userId,
        role: p.role,
        joinDuration: p.leftAt && p.joinedAt 
          ? Math.floor((p.leftAt.getTime() - p.joinedAt.getTime()) / 1000 / 60)
          : 0,
        connectionQuality: p.connectionQuality
      })),
      recordingUrl: room.recordingUrl,
      metadata: room.metadata
    };

    // Save summary for future reference
    await redisClient.setex(
      `video:summary:${room.roomId}`,
      2592000, // 30 days
      JSON.stringify(summary)
    );

    this.emit('summary:generated', summary);
  }
}

export const videoConsultationService = VideoConsultationService.getInstance();