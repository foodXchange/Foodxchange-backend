/**
 * Environment Configuration and Validation
 * Ensures all required environment variables are set for production
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment schema
const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('5000').transform(Number),
  
  // Database
  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/foodxchange'),
  
  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),
  
  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // Email
  EMAIL_HOST: z.string().default('smtp.gmail.com'),
  EMAIL_PORT: z.string().default('587').transform(Number),
  EMAIL_USER: z.string().email(),
  EMAIL_PASSWORD: z.string(),
  EMAIL_FROM: z.string().email(),
  
  // Azure Services
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().default('uploads'),
  
  // Azure AI Services
  AZURE_AI_ENDPOINT: z.string().url().optional(),
  AZURE_AI_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_KEY: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
  
  // Application
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:5000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  
  // File Upload
  MAX_FILE_SIZE: z.string().default('10485760').transform(Number), // 10MB
  ALLOWED_FILE_TYPES: z.string().default('image/jpeg,image/png,image/gif,application/pdf'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  
  // Session
  SESSION_SECRET: z.string().min(32).default('change-this-secret-in-production'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  
  // External APIs
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  
  // Payment Gateways
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  
  // SMS Services
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  NEW_RELIC_LICENSE_KEY: z.string().optional(),
  
  // Feature Flags
  ENABLE_AI_FEATURES: z.string().default('false').transform(v => v === 'true'),
  ENABLE_COMPLIANCE_CHECK: z.string().default('true').transform(v => v === 'true'),
  ENABLE_SAMPLE_REQUESTS: z.string().default('true').transform(v => v === 'true'),
  ENABLE_CHAT: z.string().default('false').transform(v => v === 'true'),
  
  // Security
  ENCRYPTION_KEY: z.string().min(32).optional(),
  RATE_LIMIT_BYPASS_TOKEN: z.string().optional(),
});

// Validate environment variables
let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('L Invalid environment variables:');
    error.errors.forEach(err => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    
    // In production, exit if required variables are missing
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('   Using default values for missing environment variables');
      // Use defaults in development
      env = envSchema.parse({
        ...process.env,
        JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production-' + Math.random(),
        EMAIL_USER: process.env.EMAIL_USER || 'noreply@foodxchange.com',
        EMAIL_PASSWORD: process.env.EMAIL_PASSWORD || 'dummy-password',
        EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@foodxchange.com',
      });
    }
  } else {
    throw error;
  }
}

// Helper functions
export const isDevelopment = () => env.NODE_ENV === 'development';
export const isProduction = () => env.NODE_ENV === 'production';
export const isTest = () => env.NODE_ENV === 'test';

// Redis configuration helper
export const getRedisConfig = () => {
  if (env.REDIS_URL) {
    return { url: env.REDIS_URL };
  }
  
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  };
};

// Email configuration helper
export const getEmailConfig = () => ({
  host: env.EMAIL_HOST,
  port: env.EMAIL_PORT,
  secure: env.EMAIL_PORT === 465,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASSWORD,
  },
  from: env.EMAIL_FROM,
});

// Export validated environment
export { env };
export default env;