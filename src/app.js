// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\src\app.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Import routes
const authRoutes = require('./routes/authRoutes');

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    // For development, continue without DB
    console.log('⚠️ Continuing without database for development...');
  }
};

// Connect to database
connectDB();

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'FoodXchange Backend API with Authentication',
    version: '1.0.0',
    status: 'running',
    websocket: 'ws://localhost:3001/ws',
    endpoints: {
      auth: '/api/auth/*',
      rfqs: '/api/rfqs',
      health: '/api/health'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    websocket: wss.clients.size + ' clients connected',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Auth routes
app.use('/api/auth', authRoutes);

// RFQ API routes (temporarily keeping mock data)
app.get('/api/rfqs', (req, res) => {
  res.json([
    {
      id: 'rfq-001',
      title: 'Premium Cornflakes Supply',
      status: 'active',
      deadline: '2025-05-15',
      progress: 65,
      budget: '$45,000',
      requirements: {
        quantity: '10000 kg',
        certification: 'Organic',
        packaging: 'Retail boxes'
      },
      createdBy: 'user-123',
      createdAt: new Date().toISOString()
    },
    {
      id: 'rfq-002', 
      title: 'Gluten-Free Pasta Import',
      status: 'pending',
      deadline: '2025-06-01',
      progress: 30,
      budget: '$78,000',
      requirements: {
        quantity: '5000 kg',
        certification: 'Gluten-Free',
        packaging: 'Bulk'
      },
      createdBy: 'user-456',
      createdAt: new Date().toISOString()
    }
  ]);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Start Express server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Express server running on port ${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}`);
  console.log(`🔐 Auth endpoints: http://localhost:${PORT}/api/auth/*`);
});

// WebSocket Server Setup
const wss = new WebSocket.Server({ 
  port: 3001,
  verifyClient: (info) => {
    const origin = info.origin;
    return origin === 'http://localhost:3000' || origin === 'http://localhost:3001';
  }
});

// Store active connections
const clients = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId') || 'anonymous';
  const username = url.searchParams.get('username') || 'User';
  
  const clientInfo = {
    id: userId,
    username: username,
    joinedAt: new Date(),
    ws: ws
  };
  
  clients.set(ws, clientInfo);
  
  console.log(`✅ WebSocket connected: ${username} (${userId})`);
  console.log(`📊 Total clients: ${clients.size}`);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to FoodXchange WebSocket',
    clientId: userId,
    timestamp: new Date().toISOString()
  }));
  
  // Broadcast user joined to others
  broadcast({
    type: 'user_joined',
    user: { id: userId, username: username },
    timestamp: new Date().toISOString()
  }, ws);
  
  // Send current active users
  const activeUsers = Array.from(clients.values()).map(client => ({
    id: client.id,
    username: client.username,
    joinedAt: client.joinedAt
  }));
  
  ws.send(JSON.stringify({
    type: 'active_users',
    users: activeUsers,
    total: activeUsers.length
  }));
  
  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📨 Message from ${username}:`, message);
      
      switch (message.type) {
        case 'rfq_update':
          broadcast({
            type: 'rfq_update',
            rfq: message.rfq,
            updatedBy: { id: userId, username: username },
            timestamp: new Date().toISOString()
          });
          break;
          
        case 'typing':
          broadcast({
            type: 'typing',
            user: { id: userId, username: username },
            isTyping: message.isTyping,
            timestamp: new Date().toISOString()
          }, ws);
          break;
          
        case 'compliance_check':
          broadcast({
            type: 'compliance_result',
            result: message.result,
            checkedBy: { id: userId, username: username },
            timestamp: new Date().toISOString()
          });
          break;
          
        case 'chat_message':
          broadcast({
            type: 'chat_message',
            message: message.content,
            sender: { id: userId, username: username },
            timestamp: new Date().toISOString()
          });
          break;
          
        case 'auth_update':
          // Handle authentication state changes
          broadcast({
            type: 'auth_update',
            user: message.user,
            action: message.action, // 'login' or 'logout'
            timestamp: new Date().toISOString()
          });
          break;
          
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type',
            receivedType: message.type
          }));
      }
    } catch (error) {
      console.error('❌ WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  // Handle connection close
  ws.on('close', () => {
    console.log(`❌ WebSocket disconnected: ${username} (${userId})`);
    clients.delete(ws);
    console.log(`📊 Total clients: ${clients.size}`);
    
    // Broadcast user left
    broadcast({
      type: 'user_left',
      user: { id: userId, username: username },
      timestamp: new Date().toISOString()
    });
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for ${username}:`, error);
    clients.delete(ws);
  });
});

// Broadcast function
function broadcast(message, excludeWs = null) {
  const messageStr = JSON.stringify(message);
  
  clients.forEach((clientInfo, ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error('❌ Broadcast error:', error);
        clients.delete(ws);
      }
    }
  });
}

// Periodic health check
setInterval(() => {
  const activeCount = clients.size;
  if (activeCount > 0) {
    console.log(`💓 Health check: ${activeCount} active connections`);
    
    clients.forEach((clientInfo, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clients.delete(ws);
      }
    });
  }
}, 30000);

console.log('🚀 WebSocket server listening on port 3001');
console.log('📡 Ready for real-time FoodXchange connections!');

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  mongoose.connection.close();
  server.close(() => {
    wss.close(() => {
      process.exit(0);
    });
  });
});

module.exports = { app, server, wss };