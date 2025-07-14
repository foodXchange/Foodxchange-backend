import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
// import path from 'path'; // Unused for now
import importRoutes from './routes/import';
import corsConfig from './config/cors.config';

// Configure environment variables
dotenv.config();

// Create Express app
const app: Express = express();
const PORT: number = parseInt(process.env.PORT || '5000', 10);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false,
}));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// CORS middleware with configuration
app.use(cors(corsConfig));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy (for deployment behind reverse proxy)
app.set('trust proxy', 1);

// API routes
app.use('/api/import', importRoutes);

// MongoDB Connection with proper error handling
const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    // Don't exit in development, retry connection
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      setTimeout(connectDB, 5000);
    }
  }
};

// Connect to database
connectDB();

// MongoDB connection event handlers
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

// Root Route
app.get('/', (_req: Request, res: Response): void => {
  res.json({
    message: 'FoodXchange API',
    status: 'running',
    compliance: 'enabled',
    typescript: 'active',
    version: '2.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health Check
app.get('/api/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      compliance: 'operational',
      server: 'running'
    }
  });
});

// Load Routes with error handling - ONLY ONE FUNCTION
const loadRoutes = async (): Promise<void> => {
  try {
    // Import routes dynamically to handle both TS and JS
    const complianceModule = await import('./routes/compliance');
    const complianceRoutes = complianceModule.default || complianceModule;
    
    app.use('/api/compliance', complianceRoutes);
    console.log('✅ Compliance routes loaded successfully');
    
    // RFQ routes
    const rfqModule = await import('./routes/rfq');
    const rfqRoutes = rfqModule.default || rfqModule;
    app.use('/api/rfq', rfqRoutes);
    app.use('/api/rfqs', rfqRoutes); // Also mount on /api/rfqs
    console.log('✅ RFQ routes loaded successfully');
    
    // Add other routes here as they're converted to TypeScript
    // const authRoutes = await import('./routes/auth');
    // app.use('/api/auth', authRoutes.default);
    
  } catch (error) {
    console.error('❌ Error loading routes:', error);
    // Create fallback routes for critical services
    app.use('/api/compliance', (_req: Request, res: Response) => {
      res.status(503).json({
        success: false,
        message: 'Compliance service temporarily unavailable',
        error: 'Routes failed to load'
      });
    });
  }
};

// Load all routes
loadRoutes();

// Global Error Handler
interface ErrorWithStatus extends Error {
  status?: number;
  code?: string;
}

app.use((error: ErrorWithStatus, req: Request, res: Response, _next: NextFunction): void => {
  console.error('🔥 Server error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  const status = error.status || 500;
  
  res.status(status).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? {
      message: error.message,
      stack: error.stack
    } : 'Something went wrong',
    requestId: Date.now().toString()
  });
});

// 404 Handler
app.use('*', (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: {
      root: '/',
      health: '/api/health',
      compliance: '/api/compliance',
      rfq: '/api/rfq'
    },
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⏳ SIGTERM received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⏳ SIGINT received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start Server
const server = app.listen(PORT, (): void => {
  console.log('='.repeat(60));
  console.log('🚀 FoodXchange Server Started Successfully!');
  console.log('='.repeat(60));
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🛡️  Compliance API: http://localhost:${PORT}/api/compliance`);
  console.log(`📋 RFQ API: http://localhost:${PORT}/api/rfq`);
  console.log(`📘 TypeScript: Active`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
  console.log('='.repeat(60));
});

// Handle server errors
server.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
  }
});

export default app;