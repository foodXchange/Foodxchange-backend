// File: src/config/config.js
require('dotenv').config();

const config = {
  // Server configuration
  port: process.env.PORT || 5000,
  wsPort: process.env.WS_PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database configuration
  database: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017/foodxchange',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },

  // CORS configuration
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:3001']
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100
  },

  // File upload configuration
  upload: {
    maxSize: process.env.MAX_UPLOAD_SIZE || '10mb',
    allowedTypes: ['image/jpeg', 'image/png', 'application/pdf']
  },

  // Email configuration
  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },

  // External APIs
  apis: {
    complianceService: process.env.COMPLIANCE_API_URL,
    notificationService: process.env.NOTIFICATION_API_URL
  }
};

module.exports = config;
