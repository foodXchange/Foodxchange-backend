// File: websocket-server.js
// Save this file in your backend root directory: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\

const http = require('http');
const url = require('url');

const WebSocket = require('ws');

class FoodXchangeWebSocketServer {
  private port: number;
  private clients: Map<string, any>;
  private rfqRooms: Map<string, Set<string>>;
  private userActivity: Map<string, { lastActivity: Date; status: string }>;
  private server: any;
  private wss: any;

  constructor(port = 3001) {
    this.port = port;
    this.clients = new Map();
    this.rfqRooms = new Map();
    this.userActivity = new Map();
    this.server = null;
    this.wss = null;
  }

  start() {
    this.server = http.createServer();
    this.wss = new WebSocket.Server({
      server: this.server,
      path: '/ws'
    });

    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    this.server.listen(this.port, () => {
      console.log(`🌐 FoodXchange WebSocket Server running on port ${this.port}`);
      console.log(`📡 WebSocket endpoint: ws://localhost:${this.port}/ws`);
      console.log('🎯 Frontend connects automatically from http://localhost:3000');
      console.log('🔗 Test: Open multiple browser tabs and watch real-time updates!');
    });
  }

  handleConnection(ws, request) {
    const {query} = url.parse(request.url, true);
    const userId = query.userId || `user_${Date.now()}`;
    const userName = query.userName || `User ${userId}`;

    console.log(`👤 User ${userId} (${userName}) connected`);

    // Store client connection
    this.clients.set(userId, {
      ws,
      userId,
      userName,
      connectedAt: new Date(),
      currentRfq: null
    });

    // Update user activity
    this.userActivity.set(userId, {
      userId,
      userName,
      role: 'buyer',
      lastSeen: new Date().toISOString(),
      status: 'active'
    });

    // Send welcome message
    this.sendToUser(userId, {
      type: 'connected',
      payload: {
        userId,
        userName,
        message: 'Connected to FoodXchange real-time system',
        serverTime: new Date().toISOString()
      }
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(userId, message);
      } catch (error) {
        console.error(`Error parsing message from ${userId}:`, error);
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log(`👤 User ${userId} disconnected`);
      this.handleDisconnection(userId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
    });
  }

  handleMessage(userId, message) {
    const { type, payload } = message;

    console.log(`📨 ${userId}: ${type}`);

    switch (type) {
      case 'heartbeat':
        this.sendToUser(userId, {
          type: 'heartbeat_ack',
          payload: { timestamp: Date.now() }
        });
        break;

      case 'join_rfq':
        this.joinRFQRoom(userId, payload.rfqId);
        break;

      case 'leave_rfq':
        this.leaveRFQRoom(userId, payload.rfqId);
        break;

      case 'rfq_status_update':
        this.handleRFQStatusUpdate(userId, payload);
        break;

      case 'collaboration_message':
        this.handleCollaborationMessage(userId, payload);
        break;

      case 'typing_indicator':
        this.handleTypingIndicator(userId, payload);
        break;

      case 'user_status':
        this.handleUserStatusUpdate(userId, payload);
        break;

      case 'compliance_check_request':
        this.handleComplianceCheck(userId, payload);
        break;

      case 'subscribe_rfqs':
        this.subscribeToRFQUpdates(userId, payload.rfqIds);
        break;

      case 'subscribe_notifications':
        this.subscribeToNotifications(userId, payload.types);
        break;

      default:
        console.warn(`Unknown message type from ${userId}: ${type}`);
    }
  }

  joinRFQRoom(userId, rfqId) {
    if (!this.rfqRooms.has(rfqId)) {
      this.rfqRooms.set(rfqId, new Set());
    }

    this.rfqRooms.get(rfqId).add(userId);

    const client = this.clients.get(userId);
    if (client) {
      client.currentRfq = rfqId;
    }

    // Notify others in the room
    this.broadcastToRFQ(rfqId, {
      type: 'user_activity',
      payload: {
        ...this.userActivity.get(userId),
        currentRfq: rfqId,
        action: 'joined'
      }
    }, userId);

    console.log(`👥 User ${userId} joined RFQ room ${rfqId}`);
  }

  leaveRFQRoom(userId, rfqId) {
    if (this.rfqRooms.has(rfqId)) {
      this.rfqRooms.get(rfqId).delete(userId);

      if (this.rfqRooms.get(rfqId).size === 0) {
        this.rfqRooms.delete(rfqId);
      }
    }

    const client = this.clients.get(userId);
    if (client) {
      client.currentRfq = null;
    }

    // Notify others in the room
    this.broadcastToRFQ(rfqId, {
      type: 'user_activity',
      payload: {
        ...this.userActivity.get(userId),
        currentRfq: null,
        action: 'left'
      }
    }, userId);

    console.log(`👥 User ${userId} left RFQ room ${rfqId}`);
  }

  handleRFQStatusUpdate(userId, payload) {
    const { rfqId, status, data } = payload;

    // Simulate realistic RFQ update
    const updateData = {
      rfqId,
      status,
      bidCount: Math.floor(Math.random() * 10) + 1,
      lastActivity: new Date().toISOString(),
      bestPrice: status === 'receiving_bids' ? Math.round((Math.random() * 20 + 5) * 100) / 100 : undefined,
      complianceScore: Math.floor(Math.random() * 20) + 80,
      updatedBy: userId,
      ...data
    };

    // Broadcast to all users watching this RFQ
    this.broadcastToRFQ(rfqId, {
      type: 'rfq_update',
      payload: updateData
    });

    // Send notification to relevant users
    this.sendNotification(rfqId, {
      title: 'RFQ Status Updated',
      message: `RFQ ${rfqId} status changed to ${status}`,
      type: 'rfq_update',
      rfqId
    });

    console.log(`📋 RFQ ${rfqId} status updated to ${status} by ${userId}`);
  }

  handleCollaborationMessage(userId, payload) {
    const { rfqId, message, metadata } = payload;
    const user = this.userActivity.get(userId);

    const collaborationMessage = {
      id: `msg_${Date.now()}_${userId}`,
      rfqId,
      userId,
      userName: user?.userName || `User ${userId}`,
      message,
      timestamp: new Date().toISOString(),
      type: 'message',
      metadata
    };

    // Broadcast to all users in the RFQ room
    this.broadcastToRFQ(rfqId, {
      type: 'collaboration_message',
      payload: collaborationMessage
    });

    console.log(`💬 Message in RFQ ${rfqId} from ${userId}: ${message}`);
  }

  handleTypingIndicator(userId, payload) {
    const { rfqId, isTyping } = payload;
    const user = this.userActivity.get(userId);

    // Broadcast typing indicator to others in the room
    this.broadcastToRFQ(rfqId, {
      type: 'typing_indicator',
      payload: {
        rfqId,
        userId,
        userName: user?.userName || `User ${userId}`,
        isTyping
      }
    }, userId);
  }

  handleUserStatusUpdate(userId, payload) {
    const { rfqId, status } = payload;

    if (this.userActivity.has(userId)) {
      const user = this.userActivity.get(userId);
      user.status = status;
      user.currentRfq = rfqId;
      this.userActivity.set(userId, user);

      // Broadcast user activity update
      this.broadcastToRFQ(rfqId, {
        type: 'user_activity',
        payload: user
      }, userId);
    }
  }

  handleComplianceCheck(userId, payload) {
    const { rfqId, specifications } = payload;

    console.log(`🛡️ Compliance check requested for RFQ ${rfqId} by ${userId}`);

    // Simulate compliance check processing (2-5 seconds)
    setTimeout(() => {
      const complianceResult = {
        rfqId,
        complianceScore: Math.floor(Math.random() * 30) + 70,
        status: Math.random() > 0.3 ? 'compliant' : 'non_compliant',
        riskLevel: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        issues: Math.random() > 0.5 ? [{
          id: `issue_${Date.now()}`,
          severity: 'medium',
          message: 'Consider adding organic certification for better market appeal',
          field: 'certifications',
          suggestion: 'Add USDA Organic certification'
        }] : [],
        checkedAt: new Date().toISOString()
      };

      // Send result to requesting user
      this.sendToUser(userId, {
        type: 'compliance_update',
        payload: complianceResult
      });

      // Also broadcast to others watching this RFQ
      this.broadcastToRFQ(rfqId, {
        type: 'compliance_update',
        payload: complianceResult
      }, userId);

      console.log(`✅ Compliance check completed for RFQ ${rfqId} - Score: ${complianceResult.complianceScore}%`);

    }, 2000 + Math.random() * 3000);
  }

  subscribeToRFQUpdates(userId, rfqIds) {
    const client = this.clients.get(userId);
    if (client) {
      client.subscribedRfqs = rfqIds;
    }
    console.log(`📡 User ${userId} subscribed to RFQ updates: ${rfqIds.join(', ')}`);
  }

  subscribeToNotifications(userId, types) {
    const client = this.clients.get(userId);
    if (client) {
      client.notificationTypes = types;
    }
    console.log(`🔔 User ${userId} subscribed to notifications: ${types.join(', ')}`);
  }

  sendNotification(rfqId, notificationData) {
    if (this.rfqRooms.has(rfqId)) {
      this.rfqRooms.get(rfqId).forEach(userId => {
        this.sendToUser(userId, {
          type: 'notification',
          payload: {
            id: `notif_${Date.now()}_${userId}`,
            timestamp: new Date().toISOString(),
            read: false,
            ...notificationData
          }
        });
      });
    }
  }

  broadcastToRFQ(rfqId, message, excludeUserId = null) {
    if (this.rfqRooms.has(rfqId)) {
      this.rfqRooms.get(rfqId).forEach(userId => {
        if (userId !== excludeUserId) {
          this.sendToUser(userId, message);
        }
      });
    }
  }

  sendToUser(userId, message) {
    const client = this.clients.get(userId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify({
          ...message,
          timestamp: new Date().toISOString(),
          messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }));
      } catch (error) {
        console.error(`Error sending message to ${userId}:`, error);
      }
    }
  }

  handleDisconnection(userId) {
    // Remove from all RFQ rooms
    this.rfqRooms.forEach((users, rfqId) => {
      if (users.has(userId)) {
        this.leaveRFQRoom(userId, rfqId);
      }
    });

    // Remove client connection
    this.clients.delete(userId);

    // Update user activity status
    if (this.userActivity.has(userId)) {
      const user = this.userActivity.get(userId);
      user.status = 'offline';
      user.lastSeen = new Date().toISOString();
      this.userActivity.set(userId, user);
    }
  }

  // Demo feature: Simulate live RFQ updates for testing
  startDemoUpdates() {
    setInterval(() => {
      const rfqIds = ['rfq_001', 'rfq_002', 'rfq_003'];
      const randomRfqId = rfqIds[Math.floor(Math.random() * rfqIds.length)];

      // Only send updates if there are users watching this RFQ
      if (this.rfqRooms.has(randomRfqId) && this.rfqRooms.get(randomRfqId).size > 0) {
        this.broadcastToRFQ(randomRfqId, {
          type: 'rfq_update',
          payload: {
            rfqId: randomRfqId,
            status: 'receiving_bids',
            bidCount: Math.floor(Math.random() * 5) + 1,
            lastActivity: new Date().toISOString(),
            bestPrice: Math.round((Math.random() * 10 + 5) * 100) / 100,
            complianceScore: Math.floor(Math.random() * 20) + 80
          }
        });

        console.log(`🎭 Demo update sent for RFQ ${randomRfqId}`);
      }
    }, 15000); // Every 15 seconds

    console.log('🎭 Demo updates started - RFQs will update automatically when users are connected');
  }

  getStats() {
    return {
      connectedUsers: this.clients.size,
      activeRooms: this.rfqRooms.size,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    };
  }
}

// Create and start the WebSocket server
const wsServer = new FoodXchangeWebSocketServer(3001);
wsServer.start();

// Start demo updates for testing
wsServer.startDemoUpdates();

// Log stats every 30 seconds
setInterval(() => {
  const stats = wsServer.getStats();
  if (stats.connectedUsers > 0) {
    console.log(`📊 Stats: ${stats.connectedUsers} users, ${stats.activeRooms} rooms, uptime: ${stats.uptime}s`);
  }
}, 30000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received - shutting down WebSocket server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received - shutting down WebSocket server...');
  process.exit(0);
});

// Export for potential integration with other servers
module.exports = FoodXchangeWebSocketServer;
