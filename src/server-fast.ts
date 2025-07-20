import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Performance tracking
console.time('Total startup time');
console.time('Basic middleware setup');

// Basic middleware - these are fast and essential
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Only use morgan in development
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

console.timeEnd('Basic middleware setup');

// Health check route - immediate availability
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// API info route - immediate availability
app.get('/api', (req, res) => {
  res.json({
    name: 'FoodXchange API',
    version: '1.0.0',
    description: 'Multi-sided B2B food commerce platform API (Optimized)',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      rfqs: '/api/rfqs',
      orders: '/api/orders',
      compliance: '/api/compliance'
    },
    timestamp: new Date().toISOString()
  });
});

// Async MongoDB connection - don't block server startup
const connectDB = async (): Promise<void> => {
  console.time('MongoDB connection');
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';
    
    const mongooseOptions = {
      maxPoolSize: NODE_ENV === 'production' ? 10 : 5,
      minPoolSize: NODE_ENV === 'production' ? 2 : 1,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      bufferCommands: false,
      heartbeatFrequencyMS: NODE_ENV === 'production' ? 2000 : 10000
    };

    await mongoose.connect(MONGODB_URI, mongooseOptions);
    console.timeEnd('MongoDB connection');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    // Don't exit in development
    if (NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Lazy load routes
const loadRoutes = async () => {
  console.time('Route loading');
  
  try {
    // Critical routes - load immediately
    const authRoutes = await import('./api/routes/auth');
    app.use('/api/auth', authRoutes.default);
    
    // Load other routes asynchronously
    const routePromises = [
      import('./api/routes/products').then(m => app.use('/api/products', m.default)),
      import('./api/routes/rfq').then(m => app.use('/api/rfqs', m.default)),
      import('./api/routes/order').then(m => app.use('/api/orders', m.default)),
      import('./api/routes/compliance').then(m => app.use('/api/compliance', m.default)),
      import('./api/routes/supplier').then(m => app.use('/api/suppliers', m.default))
    ];
    
    // Don't wait for all routes to load
    Promise.all(routePromises).then(() => {
      console.timeEnd('Route loading');
      console.log('✅ All routes loaded');
    }).catch(error => {
      console.error('⚠️ Some routes failed to load:', error);
    });
    
  } catch (error) {
    console.error('❌ Critical route loading failed:', error);
  }
};

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// Start server immediately
const server = app.listen(PORT, () => {
  console.timeEnd('Total startup time');
  console.log(`
🚀 FoodXchange Backend Server Started (Optimized)!
📍 Port: ${PORT}
🌍 Environment: ${NODE_ENV}
💻 API Base: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/health

⚡ Server is ready to accept requests!
📊 Background services are loading...
  `);
  
  // Load routes after server starts
  loadRoutes();
  
  // Connect to MongoDB in background
  connectDB();
  
  // Load optional services after a delay
  if (NODE_ENV === 'production') {
    setTimeout(() => {
      console.log('📡 Loading optional services...');
      // Load i18n, streaming, etc. here if needed
    }, 1000);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close();
  });
});

export default app;