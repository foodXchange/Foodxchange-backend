const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./src/config/db');
const http = require('http');
const socketIO = require('socket.io');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS
app.use(cors());

// Mount routes
const authRoutes = require('./src/routes/auth');
const productRoutes = require('./src/routes/products');
const rfqRoutes = require('./src/routes/rfqs');
const orderRoutes = require('./src/routes/orders');
const companyRoutes = require('./src/routes/companies');
const requestRoutes = require('./src/routes/requests');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rfqs', rfqRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/companies', companyRoutes);

// Import routes
const importRoutes = require('./src/routes/import');
app.use('/api/import', importRoutes);
app.use('/api/requests', requestRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'FoodXchange API is running!',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Error handler middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Create HTTP server and Socket.IO
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// ONLY ONE LISTEN CALL - Use server.listen, not app.listen
server.listen(PORT, () => {
  console.log(`
+-----------------------------------------------+
║          FoodXchange API Server               ║
║                                               ║
║  Status: Running ✅                           ║
║  Port: ${PORT}                                  ║
║  Environment: ${process.env.NODE_ENV || 'development'}                    ║
║  Database: MongoDB                            ║
║                                               ║
║  API Endpoints:                               ║
║  - /api/auth     (Authentication)             ║
║  - /api/products (Product catalog)            ║
║  - /api/rfqs     (Request for quotations)     ║
║  - /api/orders   (Order management)           ║
║  - /api/companies (Company profiles)          ║
║  - /api/import   (Data import)                ║
║                                               ║
║  WebSocket: Socket.IO enabled                 ║
║                                               ║
+-----------------------------------------------+
  `);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}/api/`);
  console.log(`🔌 Socket.IO enabled for real-time features`);
});