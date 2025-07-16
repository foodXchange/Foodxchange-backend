import dotenv from 'dotenv';
import Joi from 'joi';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production', 'staging').default('development'),
  PORT: Joi.number().default(3003),
  HOST: Joi.string().default('0.0.0.0'),
  
  // Database
  MONGODB_URI: Joi.string().required().description('MongoDB connection string'),
  DB_POOL_SIZE: Joi.number().default(10),
  
  // Redis
  REDIS_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().default(1),
  REDIS_REPLICA_HOST: Joi.string().allow(''),
  REDIS_REPLICA_PORT: Joi.number().default(6379),
  
  // JWT
  JWT_SECRET: Joi.string().required().min(32),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  JWT_REFRESH_SECRET: Joi.string().required().min(32),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
  
  // Azure
  AZURE_STORAGE_CONNECTION_STRING: Joi.string().allow(''),
  AZURE_STORAGE_CONTAINER_NAME: Joi.string().default('expert-documents'),
  AZURE_TENANT_ID: Joi.string().allow(''),
  AZURE_CLIENT_ID: Joi.string().allow(''),
  AZURE_CLIENT_SECRET: Joi.string().allow(''),
  AZURE_OPENAI_ENDPOINT: Joi.string().allow(''),
  AZURE_OPENAI_KEY: Joi.string().allow(''),
  AZURE_OPENAI_DEPLOYMENT_NAME: Joi.string().allow(''),
  AZURE_FORM_RECOGNIZER_ENDPOINT: Joi.string().allow(''),
  AZURE_FORM_RECOGNIZER_KEY: Joi.string().allow(''),
  AZURE_TEXT_ANALYTICS_ENDPOINT: Joi.string().allow(''),
  AZURE_TEXT_ANALYTICS_KEY: Joi.string().allow(''),
  AZURE_COMMUNICATION_CONNECTION_STRING: Joi.string().allow(''),
  AZURE_SERVICE_BUS_CONNECTION_STRING: Joi.string().allow(''),
  
  // Stripe
  STRIPE_SECRET_KEY: Joi.string().allow(''),
  STRIPE_PUBLISHABLE_KEY: Joi.string().allow(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow(''),
  
  // Email
  EMAIL_FROM: Joi.string().email().default('experts@foodxchange.com'),
  EMAIL_REPLY_TO: Joi.string().email().default('support@foodxchange.com'),
  
  // WhatsApp
  TWILIO_ACCOUNT_SID: Joi.string().allow(''),
  TWILIO_AUTH_TOKEN: Joi.string().allow(''),
  TWILIO_WHATSAPP_FROM: Joi.string().allow(''),
  WHATSAPP_ACCESS_TOKEN: Joi.string().allow(''),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow(''),
  WHATSAPP_VERIFY_TOKEN: Joi.string().allow(''),
  
  // Service URLs
  MAIN_BACKEND_URL: Joi.string().uri().default('http://localhost:3000'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3001'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // File Upload
  MAX_FILE_SIZE_MB: Joi.number().default(10),
  ALLOWED_FILE_TYPES: Joi.string().default('pdf,doc,docx,xls,xlsx,png,jpg,jpeg'),
  
  // Expert Marketplace
  PLATFORM_COMMISSION_PERCENTAGE: Joi.number().min(0).max(100).default(15),
  MIN_HOURLY_RATE: Joi.number().default(50),
  MAX_HOURLY_RATE: Joi.number().default(1000),
  MAX_ACTIVE_COLLABORATIONS_PER_EXPERT: Joi.number().default(10),
  EXPERT_VERIFICATION_EXPIRY_DAYS: Joi.number().default(365),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('debug'),
  LOG_FILE_PATH: Joi.string().default('./logs'),
  LOG_MAX_FILES: Joi.string().default('14d'),
  
  // Monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().default(9090),
}).unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  host: envVars.HOST,
  
  database: {
    uri: envVars.MONGODB_URI,
    poolSize: envVars.DB_POOL_SIZE,
  },
  
  redis: {
    url: envVars.REDIS_URL,
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD,
    db: envVars.REDIS_DB,
    replicaHost: envVars.REDIS_REPLICA_HOST,
    replicaPort: envVars.REDIS_REPLICA_PORT,
  },
  
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN,
  },
  
  azure: {
    storage: {
      connectionString: envVars.AZURE_STORAGE_CONNECTION_STRING,
      containerName: envVars.AZURE_STORAGE_CONTAINER_NAME,
    },
    identity: {
      tenantId: envVars.AZURE_TENANT_ID,
      clientId: envVars.AZURE_CLIENT_ID,
      clientSecret: envVars.AZURE_CLIENT_SECRET,
    },
    openai: {
      endpoint: envVars.AZURE_OPENAI_ENDPOINT,
      key: envVars.AZURE_OPENAI_KEY,
      deploymentName: envVars.AZURE_OPENAI_DEPLOYMENT_NAME,
    },
    formRecognizer: {
      endpoint: envVars.AZURE_FORM_RECOGNIZER_ENDPOINT,
      key: envVars.AZURE_FORM_RECOGNIZER_KEY,
    },
    textAnalytics: {
      endpoint: envVars.AZURE_TEXT_ANALYTICS_ENDPOINT,
      key: envVars.AZURE_TEXT_ANALYTICS_KEY,
    },
    communication: {
      connectionString: envVars.AZURE_COMMUNICATION_CONNECTION_STRING,
    },
    serviceBus: {
      connectionString: envVars.AZURE_SERVICE_BUS_CONNECTION_STRING,
    },
  },
  
  stripe: {
    secretKey: envVars.STRIPE_SECRET_KEY,
    publishableKey: envVars.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: envVars.STRIPE_WEBHOOK_SECRET,
  },
  
  email: {
    from: envVars.EMAIL_FROM,
    replyTo: envVars.EMAIL_REPLY_TO,
  },
  
  whatsapp: {
    accountSid: envVars.TWILIO_ACCOUNT_SID,
    authToken: envVars.TWILIO_AUTH_TOKEN,
    from: envVars.TWILIO_WHATSAPP_FROM,
    accessToken: envVars.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: envVars.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: envVars.WHATSAPP_VERIFY_TOKEN,
  },
  
  services: {
    mainBackendUrl: envVars.MAIN_BACKEND_URL,
    frontendUrl: envVars.FRONTEND_URL,
  },
  
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
  },
  
  fileUpload: {
    maxSizeMB: envVars.MAX_FILE_SIZE_MB,
    allowedTypes: envVars.ALLOWED_FILE_TYPES.split(','),
  },
  
  expertMarketplace: {
    platformCommissionPercentage: envVars.PLATFORM_COMMISSION_PERCENTAGE,
    minHourlyRate: envVars.MIN_HOURLY_RATE,
    maxHourlyRate: envVars.MAX_HOURLY_RATE,
    maxActiveCollaborationsPerExpert: envVars.MAX_ACTIVE_COLLABORATIONS_PER_EXPERT,
    expertVerificationExpiryDays: envVars.EXPERT_VERIFICATION_EXPIRY_DAYS,
  },
  
  logging: {
    level: envVars.LOG_LEVEL,
    filePath: envVars.LOG_FILE_PATH,
    maxFiles: envVars.LOG_MAX_FILES,
  },
  
  monitoring: {
    enableMetrics: envVars.ENABLE_METRICS,
    metricsPort: envVars.METRICS_PORT,
  },
};