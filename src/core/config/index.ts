/**
 * Centralized Configuration Management
 * Enterprise-grade configuration with validation and type safety
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Configuration Schema
const configSchema = z.object({
  // Environment
  env: z.enum(['development', 'staging', 'production']).default('development'),
  port: z.number().min(1).max(65535).default(5000),
  
  // Database
  database: z.object({
    uri: z.string().url().or(z.string().regex(/^mongodb(\+srv)?:\/\//)),
    options: z.object({
      retryWrites: z.boolean().default(true),
      w: z.string().default('majority'),
      maxPoolSize: z.number().default(10),
      minPoolSize: z.number().default(5),
    }),
  }),
  
  // Authentication
  auth: z.object({
    jwt: z.object({
      secret: z.string().min(32),
      expiresIn: z.string().default('7d'),
      refreshSecret: z.string().min(32),
      refreshExpiresIn: z.string().default('30d'),
    }),
    bcrypt: z.object({
      rounds: z.number().min(10).max(15).default(12),
    }),
  }),
  
  // Azure Services
  azure: z.object({
    storage: z.object({
      connectionString: z.string().optional(),
      containerName: z.string().default('foodxchange-files'),
    }),
    ai: z.object({
      textAnalytics: z.object({
        endpoint: z.string().url().optional(),
        key: z.string().optional(),
      }),
      computerVision: z.object({
        endpoint: z.string().url().optional(),
        key: z.string().optional(),
      }),
      formRecognizer: z.object({
        endpoint: z.string().url().optional(),
        key: z.string().optional(),
      }),
      openAI: z.object({
        endpoint: z.string().url().optional(),
        key: z.string().optional(),
        deploymentName: z.string().optional(),
      }),
    }),
  }),
  
  // Email
  email: z.object({
    service: z.string().default('gmail'),
    host: z.string().default('smtp.gmail.com'),
    port: z.number().default(587),
    secure: z.boolean().default(false),
    auth: z.object({
      user: z.string().email().optional(),
      pass: z.string().optional(),
    }),
    from: z.string().default('FoodXchange <noreply@foodxchange.com>'),
  }),
  
  // Security
  security: z.object({
    cors: z.object({
      origins: z.array(z.string()).default(['http://localhost:5173']),
      credentials: z.boolean().default(true),
    }),
    rateLimiting: z.object({
      windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
      max: z.number().default(100),
    }),
    encryption: z.object({
      key: z.string().length(32).optional(),
    }),
  }),
  
  // Features
  features: z.object({
    ai: z.boolean().default(true),
    websocket: z.boolean().default(true),
    emailNotifications: z.boolean().default(true),
    caching: z.boolean().default(true),
  }),
  
  // External Services
  external: z.object({
    redis: z.object({
      url: z.string().default('redis://localhost:6379'),
      password: z.string().optional(),
    }),
    stripe: z.object({
      secretKey: z.string().optional(),
      webhookSecret: z.string().optional(),
    }),
    googleMaps: z.object({
      apiKey: z.string().optional(),
    }),
  }),
  
  // Logging
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    dir: z.string().default('./logs'),
  }),
  
  // File Upload
  upload: z.object({
    maxFileSize: z.number().default(10 * 1024 * 1024), // 10MB
    allowedTypes: z.array(z.string()).default([
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]),
  }),
});

// Parse and validate configuration
const parseConfig = () => {
  try {
    const config = configSchema.parse({
      env: process.env.NODE_ENV,
      port: parseInt(process.env.PORT || '5000', 10),
      
      database: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange',
        options: {
          retryWrites: process.env.MONGODB_RETRY_WRITES !== 'false',
          w: process.env.MONGODB_W || 'majority',
          maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10),
          minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5', 10),
        },
      },
      
      auth: {
        jwt: {
          secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
          expiresIn: process.env.JWT_EXPIRES_IN || '7d',
          refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production',
          refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
        },
        bcrypt: {
          rounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
        },
      },
      
      azure: {
        storage: {
          connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
          containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'foodxchange-files',
        },
        ai: {
          textAnalytics: {
            endpoint: process.env.AZURE_TEXT_ANALYTICS_ENDPOINT,
            key: process.env.AZURE_TEXT_ANALYTICS_KEY,
          },
          computerVision: {
            endpoint: process.env.AZURE_COMPUTER_VISION_ENDPOINT,
            key: process.env.AZURE_COMPUTER_VISION_KEY,
          },
          formRecognizer: {
            endpoint: process.env.AZURE_FORM_RECOGNIZER_ENDPOINT,
            key: process.env.AZURE_FORM_RECOGNIZER_KEY,
          },
          openAI: {
            endpoint: process.env.AZURE_OPENAI_ENDPOINT,
            key: process.env.AZURE_OPENAI_KEY,
            deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
          },
        },
      },
      
      email: {
        service: process.env.EMAIL_SERVICE || 'gmail',
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587', 10),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        from: process.env.EMAIL_FROM || 'FoodXchange <noreply@foodxchange.com>',
      },
      
      security: {
        cors: {
          origins: process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['http://localhost:5173'],
          credentials: true,
        },
        rateLimiting: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
          max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
        },
        encryption: {
          key: process.env.ENCRYPTION_KEY,
        },
      },
      
      features: {
        ai: process.env.ENABLE_AI_FEATURES !== 'false',
        websocket: process.env.ENABLE_WEBSOCKET !== 'false',
        emailNotifications: process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false',
        caching: process.env.ENABLE_CACHING !== 'false',
      },
      
      external: {
        redis: {
          url: process.env.REDIS_URL || 'redis://localhost:6379',
          password: process.env.REDIS_PASSWORD,
        },
        stripe: {
          secretKey: process.env.STRIPE_SECRET_KEY,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        },
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
      
      logging: {
        level: (process.env.LOG_LEVEL as any) || 'info',
        dir: process.env.LOG_DIR || './logs',
      },
      
      upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
        allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',').map(t => t.trim()) || undefined,
      },
    });
    
    return config;
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:', error.errors);
      throw new Error(`Invalid configuration: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    console.error('Configuration validation failed:', error.message || error);
    throw new Error(`Configuration error: ${error.message || 'Unknown error'}`);
  }
};

// Export validated configuration
export const config = parseConfig();

// Type-safe configuration getter
export type Config = z.infer<typeof configSchema>;

// Environment checks
export const isDevelopment = () => config.env === 'development';
export const isProduction = () => config.env === 'production';
export const isStaging = () => config.env === 'staging';

// Feature flags
export const isFeatureEnabled = (feature: keyof Config['features']) => config.features[feature];

// Azure service availability checks
export const isAzureStorageConfigured = () => !!(config.azure.storage.connectionString);
export const isAzureAIConfigured = () => {
  const ai = config.azure.ai;
  return !!(ai.textAnalytics.endpoint && ai.textAnalytics.key) ||
         !!(ai.computerVision.endpoint && ai.computerVision.key) ||
         !!(ai.formRecognizer.endpoint && ai.formRecognizer.key) ||
         !!(ai.openAI.endpoint && ai.openAI.key);
};

export default config;