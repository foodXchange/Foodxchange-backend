const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const winston = require('winston');
require('dotenv').config();

const app = express();

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'foodxchange-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Security middleware
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Connect to MongoDB
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    logger.info('Connected to MongoDB');
  })
  .catch((error) => {
    logger.error('MongoDB connection error:', error);
  });
} else {
  logger.warn('MONGODB_URI not set - database connection skipped');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0'
  });
});

// Basic API routes (placeholder)
app.get('/api', (req, res) => {
  res.json({
    message: 'FoodXchange API v2.0 - Ready for AI integration',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /health - Health check',
      'GET /api - This endpoint',
      'AI endpoints coming soon...'
    ]
  });
});

// AI Routes placeholder (will be added by AI integration script)
// app.use('/api/ai', require('./src/routes/ai/aiRoutes'));

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error(error.stack);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }
  
  res.status(error.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong!' 
      : error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`🚀 FoodXchange API server running on port ${PORT}`);
  logger.info(`🌟 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;


