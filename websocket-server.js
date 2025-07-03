const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Store active RFQ rooms and users
const rfqRooms = new Map();
const activeUsers = new Map();

// Mock team members for demonstration
const mockTeamMembers = [
  { id: 'user_sarah', name: 'Sarah Chen (Buyer)', role: 'buyer' },
  { id: 'user_mike', name: 'Mike Rodriguez (Compliance)', role: 'compliance' },
  { id: 'user_lisa', name: 'Lisa Thompson (Procurement)', role: 'procurement' }
];

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('🔗 New client connected:', socket.id);

  // Handle user authentication
  socket.on('authenticate', (data) => {
    const { userId, userName } = data;
    activeUsers.set(socket.id, { userId, userName, socketId: socket.id });
    console.log(`👤 User authenticated: ${userName} (${userId})`);
  });

  // Join RFQ collaboration room
  socket.on('join_rfq_room', (data) => {
    const { rfqId, userId } = data;
    
    socket.join(rfqId);
    
    // Initialize room if it doesn't exist
    if (!rfqRooms.has(rfqId)) {
      rfqRooms.set(rfqId, {
        participants: new Set(),
        activity: [],
        currentRFQ: {
          title: '',
          productType: '',
          specifications: {},
          status: 'draft'
        }
      });
    }
    
    const room = rfqRooms.get(rfqId);
    room.participants.add(userId);
    
    console.log(`📡 User ${userId} joined RFQ room: ${rfqId}`);
    
    // Notify other participants
    socket.to(rfqId).emit('team_member_joined', {
      userId,
      timestamp: new Date().toISOString(),
      participantCount: room.participants.size
    });

    // Send current RFQ state to new participant
    socket.emit('rfq_state_sync', {
      rfqId,
      currentState: room.currentRFQ,
      recentActivity: room.activity.slice(-10),
      participants: Array.from(room.participants)
    });

    // Simulate mock team member activity (for demo purposes)
    setTimeout(() => {
      simulateTeamActivity(rfqId, socket);
    }, 3000);
  });

  // Handle RFQ field updates
  socket.on('rfq_field_updated', (data) => {
    const { rfqId, update, broadcastToRoom } = data;
    
    if (rfqRooms.has(rfqId)) {
      const room = rfqRooms.get(rfqId);
      
      // Update RFQ state
      if (update.field === 'productType') {
        room.currentRFQ.productType = update.value;
      } else if (update.field.startsWith('specifications.')) {
        const specField = update.field.replace('specifications.', '');
        room.currentRFQ.specifications[specField] = update.value;
      } else {
        room.currentRFQ[update.field] = update.value;
      }
      
      // Add to activity log
      const activity = {
        timestamp: new Date().toISOString(),
        userId: update.userId,
        action: 'field_updated',
        field: update.field,
        value: update.value,
        complianceStatus: update.complianceStatus
      };
      
      room.activity.push(activity);
      
      console.log(`📝 RFQ ${rfqId} field updated: ${update.field} = ${update.value} (${update.complianceStatus})`);
      
      if (broadcastToRoom) {
        // Broadcast to all other participants in the room
        socket.to(rfqId).emit('rfq_updated', {
          field: update.field,
          value: update.value,
          complianceStatus: update.complianceStatus,
          timestamp: activity.timestamp,
          userId: update.userId
        });
        
        // Send activity update
        socket.to(rfqId).emit('activity_updated', activity);
      }
    }
  });

  // Handle compliance alerts
  socket.on('compliance_alert', (alert) => {
    const { rfqId, message, severity } = alert;
    
    console.log(`🚨 Compliance alert for RFQ ${rfqId}: ${message} (${severity})`);
    
    if (rfqRooms.has(rfqId)) {
      const room = rfqRooms.get(rfqId);
      
      const alertData = {
        id: `alert_${Date.now()}`,
        rfqId,
        message,
        severity,
        timestamp: new Date().toISOString()
      };
      
      // Add to activity log
      room.activity.push({
        timestamp: alertData.timestamp,
        action: 'compliance_alert',
        severity,
        message,
        userId: 'system'
      });
      
      // Broadcast to all participants in the room
      io.to(rfqId).emit('compliance_alert_received', alertData);
      
      // If critical error, simulate immediate team response
      if (severity === 'error') {
        setTimeout(() => {
          simulateComplianceResponse(rfqId, alert);
        }, 2000);
      }
    }
  });

  // Handle chat messages
  socket.on('rfq_chat_message', (data) => {
    const { rfqId, message, userId } = data;
    
    const chatMessage = {
      id: `msg_${Date.now()}`,
      rfqId,
      message,
      userId,
      timestamp: new Date().toISOString(),
      type: 'text'
    };
    
    console.log(`💬 Chat message in RFQ ${rfqId}: ${message}`);
    
    // Broadcast to all participants
    io.to(rfqId).emit('rfq_chat_received', chatMessage);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
    
    const user = activeUsers.get(socket.id);
    if (user) {
      // Remove user from all RFQ rooms
      rfqRooms.forEach((room, rfqId) => {
        if (room.participants.has(user.userId)) {
          room.participants.delete(user.userId);
          
          // Notify other participants
          socket.to(rfqId).emit('team_member_left', {
            userId: user.userId,
            timestamp: new Date().toISOString(),
            participantCount: room.participants.size
          });
        }
      });
      
      activeUsers.delete(socket.id);
    }
  });
});

// Simulate mock team member activity for demo
function simulateTeamActivity(rfqId, originalSocket) {
  const activities = [
    {
      delay: 5000,
      action: () => {
        const mockUser = mockTeamMembers[0];
        originalSocket.to(rfqId).emit('rfq_updated', {
          field: 'budget',
          value: 50000,
          complianceStatus: 'valid',
          timestamp: new Date().toISOString(),
          userId: mockUser.id,
          userName: mockUser.name
        });
        console.log(`🤖 Mock activity: ${mockUser.name} updated budget`);
      }
    },
    {
      delay: 10000,
      action: () => {
        const mockUser = mockTeamMembers[1];
        originalSocket.to(rfqId).emit('compliance_alert_received', {
          id: `alert_${Date.now()}`,
          rfqId,
          message: 'Compliance team reviewing specifications...',
          severity: 'info',
          timestamp: new Date().toISOString(),
          userId: mockUser.id,
          userName: mockUser.name
        });
        console.log(`🤖 Mock activity: ${mockUser.name} sent compliance update`);
      }
    },
    {
      delay: 15000,
      action: () => {
        const mockUser = mockTeamMembers[2];
        originalSocket.to(rfqId).emit('rfq_chat_received', {
          id: `msg_${Date.now()}`,
          rfqId,
          message: 'Looking good! Let me check with our preferred suppliers.',
          userId: mockUser.id,
          userName: mockUser.name,
          timestamp: new Date().toISOString(),
          type: 'text'
        });
        console.log(`🤖 Mock activity: ${mockUser.name} sent chat message`);
      }
    }
  ];

  activities.forEach(activity => {
    setTimeout(activity.action, activity.delay);
  });
}

// Simulate compliance team response to critical errors
function simulateComplianceResponse(rfqId, originalAlert) {
  setTimeout(() => {
    const complianceUser = mockTeamMembers[1];
    
    io.to(rfqId).emit('rfq_chat_received', {
      id: `msg_${Date.now()}`,
      rfqId,
      message: '🚨 URGENT: I see the cornflake color issue. This matches the error that caused our 9-month project failure in 2024. Please select from approved colors only!',
      userId: complianceUser.id,
      userName: complianceUser.name,
      timestamp: new Date().toISOString(),
      type: 'text'
    });
    
    console.log(`🤖 Compliance response: ${complianceUser.name} responded to critical alert`);
  }, 1000);
}

// Basic REST endpoints for RFQ management
app.get('/api/rfqs', (req, res) => {
  const rfqs = Array.from(rfqRooms.entries()).map(([id, room]) => ({
    id,
    ...room.currentRFQ,
    participantCount: room.participants.size,
    lastActivity: room.activity[room.activity.length - 1]?.timestamp
  }));
  
  res.json({ success: true, data: rfqs });
});

app.get('/api/rfqs/:rfqId', (req, res) => {
  const { rfqId } = req.params;
  const room = rfqRooms.get(rfqId);
  
  if (!room) {
    return res.status(404).json({ success: false, message: 'RFQ not found' });
  }
  
  res.json({
    success: true,
    data: {
      id: rfqId,
      ...room.currentRFQ,
      participants: Array.from(room.participants),
      activity: room.activity,
      participantCount: room.participants.size
    }
  });
});

app.post('/api/rfqs', (req, res) => {
  const rfqId = `rfq_${Date.now()}`;
  const rfqData = req.body;
  
  rfqRooms.set(rfqId, {
    participants: new Set(),
    activity: [{
      timestamp: new Date().toISOString(),
      action: 'rfq_created',
      userId: 'system'
    }],
    currentRFQ: {
      ...rfqData,
      id: rfqId,
      status: 'draft',
      createdAt: new Date().toISOString()
    }
  });
  
  res.json({ success: true, data: { id: rfqId, ...rfqData } });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'FoodXchange WebSocket Server is running',
    activeRFQs: rfqRooms.size,
    activeConnections: activeUsers.size,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log('🍴 FoodXchange WebSocket Server running on port', PORT);
  console.log('🔗 Real-time collaboration enabled');
  console.log('📡 WebSocket endpoint: ws://localhost:' + PORT);
  console.log('🌐 CORS enabled for: http://localhost:3000');
  console.log('');
  console.log('Ready for real-time RFQ collaboration! 🚀');
});