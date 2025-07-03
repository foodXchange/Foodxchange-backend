const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());

// Basic routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'FoodXchange Backend API',
    version: '1.0.0',
    status: 'running',
    websocket: 'ws://localhost:3001/ws'
  });
});

app.get('/api/rfqs', (req, res) => {
  res.json([
    {
      id: 'rfq-001',
      title: 'Premium Cornflakes Supply',
      status: 'active',
      deadline: '2025-05-15'
    },
    {
      id: 'rfq-002', 
      title: 'Gluten-Free Pasta Import',
      status: 'pending',
      deadline: '2025-06-01'
    }
  ]);
});

// Start Express server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

// WebSocket Server Setup
const wss = new WebSocket.Server({ port: 3001 });
const clients = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId') || 'anonymous';
  const username = url.searchParams.get('username') || 'User';
  
  clients.set(ws, { id: userId, username: username });
  
  console.log(`WebSocket connected: ${username} (${userId})`);
  console.log(`Total clients: ${clients.size}`);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to FoodXchange WebSocket',
    clientId: userId,
    timestamp: new Date().toISOString()
  }));
  
  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`Message from ${username}:`, message);
      
      // Broadcast to all other clients
      const messageStr = JSON.stringify({
        type: message.type,
        data: message,
        sender: { id: userId, username: username },
        timestamp: new Date().toISOString()
      });
      
      clients.forEach((clientInfo, clientWs) => {
        if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(messageStr);
        }
      });
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`WebSocket disconnected: ${username}`);
    clients.delete(ws);
    console.log(`Total clients: ${clients.size}`);
  });
});

console.log('WebSocket server listening on port 3001');
console.log('Ready for real-time FoodXchange connections!');
