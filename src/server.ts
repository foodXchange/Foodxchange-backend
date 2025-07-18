import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

// Load environment variables
dotenv.config();

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { correlationIdMiddleware as correlationId } from './middleware/correlationId';
import { responseFormatterMiddleware as responseFormatter } from './middleware/responseFormatter';
import { requestLogger } from './middleware/requestLogger';
import { performanceMiddleware as performanceMonitor } from './middleware/performance';

// Import routes
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import rfqRoutes from './routes/rfqs';
import orderRoutes from './routes/orders';
import complianceRoutes from './routes/compliance/complianceRoutes';
import analyticsRoutes from './routes/analytics/analyticsRoutes';
import apiKeyRoutes from './routes/apiKeys';
import tenantRoutes from './routes/tenant';

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create HTTP server and Socket.IO instance
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// MongoDB Connection
const connectDB = async (): Promise<void> => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    if (NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FoodXchange API',
      version: '1.0.0',
      description: 'Multi-sided B2B food commerce platform API',
      contact: {
        name: 'FoodXchange Team',
        email: 'support@foodxchange.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Global middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// Custom middleware
app.use(correlationId);
app.use(responseFormatter);
app.use(requestLogger);
app.use(performanceMonitor);

// Apply rate limiting to API routes
app.use('/api', limiter);

// API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check route
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

// API info route
app.get('/api', (req, res) => {
  res.json({
    name: 'FoodXchange API',
    version: '1.0.0',
    description: 'Multi-sided B2B food commerce platform API',
    documentation: `/api-docs`,
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      rfqs: '/api/rfqs',
      orders: '/api/orders',
      compliance: '/api/compliance',
      analytics: '/api/analytics',
      apiKeys: '/api/api-keys',
      tenant: '/api/tenant'
    },
    timestamp: new Date().toISOString()
  });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rfqs', rfqRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/tenant', tenantRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use(errorHandler);

// Initialize database and start server
const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    
    server.listen(PORT, () => {
      console.log(`
🚀 FoodXchange Backend Server Started!
📍 Port: ${PORT}
🌍 Environment: ${NODE_ENV}
💻 API Base: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/health
📚 API Documentation: http://localhost:${PORT}/api-docs
⚡ Socket.IO: Enabled
🔒 Security: Helmet, CORS, Rate Limiting
📊 Monitoring: Morgan, Performance Tracking
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = (signal: string): void => {
  console.log(`${signal} signal received: closing HTTP server`);
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

export default app;