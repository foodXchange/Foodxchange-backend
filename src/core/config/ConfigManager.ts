import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';
import { z } from 'zod';

import { Logger } from '../logging/logger';


const logger = new Logger('ConfigManager');

// Environment-specific configuration schema
const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().min(1000).max(65535).default(5000),
  HOST: z.string().default('0.0.0.0'),

  // Database configuration
  MONGODB_URI: z.string().url(),
  DB_NAME: z.string().default('foodxchange'),
  DB_MAX_POOL_SIZE: z.coerce.number().min(1).max(100).default(10),
  DB_MIN_POOL_SIZE: z.coerce.number().min(1).max(10).default(2),
  DB_MAX_IDLE_TIME: z.coerce.number().min(1000).default(10000),
  DB_SERVER_SELECTION_TIMEOUT: z.coerce.number().min(1000).default(5000),
  DB_SOCKET_TIMEOUT: z.coerce.number().min(1000).default(45000),
  DB_WRITE_TIMEOUT: z.coerce.number().min(1000).default(2500),
  DB_MONITORING_INTERVAL: z.coerce.number().min(10000).default(60000),

  // Redis configuration
  REDIS_URL: z.string().url().optional(),
  REDIS_TTL: z.coerce.number().min(60).default(300),
  REDIS_MAX_RETRIES: z.coerce.number().min(1).default(3),
  REDIS_RETRY_DELAY: z.coerce.number().min(100).default(1000),

  // Authentication configuration
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(15).default(12),

  // API configuration
  API_PREFIX: z.string().default('/api/v1'),
  API_RATE_LIMIT_WINDOW: z.coerce.number().min(60000).default(900000), // 15 minutes
  API_RATE_LIMIT_MAX: z.coerce.number().min(1).default(100),
  API_TIMEOUT: z.coerce.number().min(1000).default(30000),
  API_MAX_REQUEST_SIZE: z.coerce.number().min(1024).default(10485760), // 10MB

  // Security configuration
  CORS_ORIGIN: z.string().default('*'),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),
  HELMET_ENABLED: z.coerce.boolean().default(true),
  SECURITY_HEADERS_ENABLED: z.coerce.boolean().default(true),

  // Logging configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
  LOG_TO_CONSOLE: z.coerce.boolean().default(true),
  LOG_TO_FILE: z.coerce.boolean().default(true),
  LOG_MAX_SIZE: z.string().default('20m'),
  LOG_MAX_FILES: z.string().default('14d'),

  // Email configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().min(1).max(65535).optional(),
  SMTP_SECURE: z.coerce.boolean().default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // File upload configuration
  UPLOAD_MAX_SIZE: z.coerce.number().min(1024).default(5242880), // 5MB
  UPLOAD_ALLOWED_TYPES: z.string().default('image/jpeg,image/png,image/gif,application/pdf'),
  UPLOAD_DIR: z.string().default('uploads'),

  // External service configuration
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().default('uploads'),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_COGNITIVE_SERVICES_KEY: z.string().optional(),
  AZURE_COGNITIVE_SERVICES_ENDPOINT: z.string().url().optional(),

  // Monitoring configuration
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().min(1000).max(65535).default(9090),
  HEALTH_CHECK_ENABLED: z.coerce.boolean().default(true),
  PERFORMANCE_MONITORING_ENABLED: z.coerce.boolean().default(true),

  // Feature flags
  FEATURE_USER_REGISTRATION: z.coerce.boolean().default(true),
  FEATURE_EMAIL_VERIFICATION: z.coerce.boolean().default(true),
  FEATURE_TWO_FACTOR_AUTH: z.coerce.boolean().default(false),
  FEATURE_ANALYTICS: z.coerce.boolean().default(true),
  FEATURE_CACHING: z.coerce.boolean().default(true),
  FEATURE_RATE_LIMITING: z.coerce.boolean().default(true),

  // Development configuration
  DEV_MOCK_EXTERNAL_SERVICES: z.coerce.boolean().default(false),
  DEV_SEED_DATABASE: z.coerce.boolean().default(false),
  DEV_ENABLE_PROFILING: z.coerce.boolean().default(false),
  DEV_ENABLE_DEBUG_ROUTES: z.coerce.boolean().default(false)
});

export type EnvironmentConfig = z.infer<typeof environmentSchema>;

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
  deprecatedKeys: string[];
}

export class ConfigManager {
  private static instance: ConfigManager;
  private config: EnvironmentConfig;
  private validationResult: ConfigValidationResult;
  private readonly loadedAt: Date;
  private readonly configSources: string[] = [];

  private constructor() {
    this.loadedAt = new Date();
    this.loadConfiguration();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfiguration(): void {
    // Load environment files in order of precedence
    this.loadEnvironmentFiles();

    // Validate configuration
    this.validationResult = this.validateConfiguration();

    if (!this.validationResult.isValid) {
      logger.error('Configuration validation failed', {
        errors: this.validationResult.errors,
        missingRequired: this.validationResult.missingRequired
      });
      throw new Error('Invalid configuration');
    }

    // Parse and set configuration
    this.config = environmentSchema.parse(process.env);

    // Log configuration status
    this.logConfigurationStatus();
  }

  private loadEnvironmentFiles(): void {
    const envFiles = [
      '.env',
      `.env.${process.env.NODE_ENV}`,
      '.env.local',
      `.env.${process.env.NODE_ENV}.local`
    ];

    for (const envFile of envFiles) {
      const envPath = path.resolve(process.cwd(), envFile);
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        this.configSources.push(envFile);
        logger.debug('Loaded environment file', { file: envFile });
      }
    }
  }

  private validateConfiguration(): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingRequired: string[] = [];
    const deprecatedKeys: string[] = [];

    try {
      // Validate against schema
      environmentSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          const path = issue.path.join('.');
          errors.push(`${path}: ${issue.message}`);

          if (issue.code === 'invalid_type' && issue.received === 'undefined') {
            missingRequired.push(path);
          }
        }
      }
    }

    // Check for deprecated environment variables
    const deprecatedVars = [
      'DATABASE_URL', // Use MONGODB_URI instead
      'REDIS_HOST', // Use REDIS_URL instead
      'SECRET_KEY', // Use JWT_SECRET instead
      'MAIL_HOST' // Use SMTP_HOST instead
    ];

    for (const deprecatedVar of deprecatedVars) {
      if (process.env[deprecatedVar]) {
        deprecatedKeys.push(deprecatedVar);
        warnings.push(`${deprecatedVar} is deprecated and will be removed in a future version`);
      }
    }

    // Environment-specific validations
    if (process.env.NODE_ENV === 'production') {
      // Production-specific validations
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters in production');
      }

      if (!process.env.MONGODB_URI?.includes('mongodb')) {
        errors.push('MONGODB_URI must be a valid MongoDB connection string in production');
      }

      if (process.env.LOG_LEVEL === 'debug') {
        warnings.push('DEBUG log level is not recommended for production');
      }
    }

    // Check for common configuration issues
    if (process.env.PORT && process.env.METRICS_PORT && process.env.PORT === process.env.METRICS_PORT) {
      errors.push('PORT and METRICS_PORT cannot be the same');
    }

    if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
      warnings.push('JWT_SECRET and JWT_REFRESH_SECRET should be different');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingRequired,
      deprecatedKeys
    };
  }

  private logConfigurationStatus(): void {
    logger.info('Configuration loaded successfully', {
      environment: this.config.NODE_ENV,
      sources: this.configSources,
      loadedAt: this.loadedAt.toISOString(),
      warnings: this.validationResult.warnings.length,
      deprecatedKeys: this.validationResult.deprecatedKeys.length
    });

    // Log warnings
    for (const warning of this.validationResult.warnings) {
      logger.warn('Configuration warning', { warning });
    }

    // Log deprecated keys
    for (const deprecatedKey of this.validationResult.deprecatedKeys) {
      logger.warn('Deprecated configuration key', { key: deprecatedKey });
    }
  }

  public getConfig(): EnvironmentConfig {
    return this.config;
  }

  public get<K extends keyof EnvironmentConfig>(key: K): EnvironmentConfig[K] {
    return this.config[key];
  }

  public getValidationResult(): ConfigValidationResult {
    return this.validationResult;
  }

  public isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  public isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  public isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }

  public isStaging(): boolean {
    return this.config.NODE_ENV === 'staging';
  }

  public isFeatureEnabled(feature: string): boolean {
    const featureKey = `FEATURE_${feature.toUpperCase()}` as keyof EnvironmentConfig;
    return this.config[featureKey] as boolean || false;
  }

  public getDatabaseConfig(): {
    uri: string;
    name: string;
    maxPoolSize: number;
    minPoolSize: number;
    maxIdleTime: number;
    serverSelectionTimeout: number;
    socketTimeout: number;
    writeTimeout: number;
    monitoringInterval: number;
    } {
    return {
      uri: this.config.MONGODB_URI,
      name: this.config.DB_NAME,
      maxPoolSize: this.config.DB_MAX_POOL_SIZE,
      minPoolSize: this.config.DB_MIN_POOL_SIZE,
      maxIdleTime: this.config.DB_MAX_IDLE_TIME,
      serverSelectionTimeout: this.config.DB_SERVER_SELECTION_TIMEOUT,
      socketTimeout: this.config.DB_SOCKET_TIMEOUT,
      writeTimeout: this.config.DB_WRITE_TIMEOUT,
      monitoringInterval: this.config.DB_MONITORING_INTERVAL
    };
  }

  public getRedisConfig(): {
    url?: string;
    ttl: number;
    maxRetries: number;
    retryDelay: number;
    } {
    return {
      url: this.config.REDIS_URL,
      ttl: this.config.REDIS_TTL,
      maxRetries: this.config.REDIS_MAX_RETRIES,
      retryDelay: this.config.REDIS_RETRY_DELAY
    };
  }

  public getJwtConfig(): {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
    } {
    return {
      secret: this.config.JWT_SECRET,
      expiresIn: this.config.JWT_EXPIRES_IN,
      refreshSecret: this.config.JWT_REFRESH_SECRET,
      refreshExpiresIn: this.config.JWT_REFRESH_EXPIRES_IN
    };
  }

  public getApiConfig(): {
    prefix: string;
    rateLimitWindow: number;
    rateLimitMax: number;
    timeout: number;
    maxRequestSize: number;
    } {
    return {
      prefix: this.config.API_PREFIX,
      rateLimitWindow: this.config.API_RATE_LIMIT_WINDOW,
      rateLimitMax: this.config.API_RATE_LIMIT_MAX,
      timeout: this.config.API_TIMEOUT,
      maxRequestSize: this.config.API_MAX_REQUEST_SIZE
    };
  }

  public getLoggingConfig(): {
    level: string;
    dir: string;
    toConsole: boolean;
    toFile: boolean;
    maxSize: string;
    maxFiles: string;
    } {
    return {
      level: this.config.LOG_LEVEL,
      dir: this.config.LOG_DIR,
      toConsole: this.config.LOG_TO_CONSOLE,
      toFile: this.config.LOG_TO_FILE,
      maxSize: this.config.LOG_MAX_SIZE,
      maxFiles: this.config.LOG_MAX_FILES
    };
  }

  public getSecurityConfig(): {
    corsOrigin: string;
    corsCredentials: boolean;
    helmetEnabled: boolean;
    securityHeadersEnabled: boolean;
    } {
    return {
      corsOrigin: this.config.CORS_ORIGIN,
      corsCredentials: this.config.CORS_CREDENTIALS,
      helmetEnabled: this.config.HELMET_ENABLED,
      securityHeadersEnabled: this.config.SECURITY_HEADERS_ENABLED
    };
  }

  public generateExampleEnv(): string {
    const exampleConfig = `# FoodXchange Backend Configuration
# Copy this file to .env and configure the values

# Environment
NODE_ENV=development
PORT=5000
HOST=0.0.0.0

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/foodxchange
DB_NAME=foodxchange
DB_MAX_POOL_SIZE=10
DB_MIN_POOL_SIZE=2

# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379
REDIS_TTL=300

# Authentication
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=your-super-secret-refresh-key-at-least-32-characters-long
JWT_REFRESH_EXPIRES_IN=30d
BCRYPT_ROUNDS=12

# API Configuration
API_PREFIX=/api/v1
API_RATE_LIMIT_WINDOW=900000
API_RATE_LIMIT_MAX=100
API_TIMEOUT=30000
API_MAX_REQUEST_SIZE=10485760

# Security
CORS_ORIGIN=*
CORS_CREDENTIALS=true
HELMET_ENABLED=true
SECURITY_HEADERS_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_DIR=logs
LOG_TO_CONSOLE=true
LOG_TO_FILE=true

# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@foodxchange.com

# File Upload
UPLOAD_MAX_SIZE=5242880
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/gif,application/pdf
UPLOAD_DIR=uploads

# Azure Services (optional)
AZURE_STORAGE_CONNECTION_STRING=your-azure-storage-connection-string
AZURE_STORAGE_CONTAINER=uploads
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_COGNITIVE_SERVICES_KEY=your-cognitive-services-key
AZURE_COGNITIVE_SERVICES_ENDPOINT=https://your-resource.cognitiveservices.azure.com/

# Monitoring
METRICS_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_ENABLED=true
PERFORMANCE_MONITORING_ENABLED=true

# Feature Flags
FEATURE_USER_REGISTRATION=true
FEATURE_EMAIL_VERIFICATION=true
FEATURE_TWO_FACTOR_AUTH=false
FEATURE_ANALYTICS=true
FEATURE_CACHING=true
FEATURE_RATE_LIMITING=true

# Development Settings
DEV_MOCK_EXTERNAL_SERVICES=false
DEV_SEED_DATABASE=false
DEV_ENABLE_PROFILING=false
DEV_ENABLE_DEBUG_ROUTES=false
`;

    return exampleConfig;
  }

  public reload(): void {
    logger.info('Reloading configuration...');
    this.loadConfiguration();
    logger.info('Configuration reloaded successfully');
  }

  public getConfigSummary(): {
    environment: string;
    loadedAt: string;
    sources: string[];
    validation: ConfigValidationResult;
    features: Record<string, boolean>;
    } {
    const features: Record<string, boolean> = {};

    // Extract feature flags
    for (const [key, value] of Object.entries(this.config)) {
      if (key.startsWith('FEATURE_')) {
        const featureName = key.replace('FEATURE_', '').toLowerCase();
        features[featureName] = value as boolean;
      }
    }

    return {
      environment: this.config.NODE_ENV,
      loadedAt: this.loadedAt.toISOString(),
      sources: this.configSources,
      validation: this.validationResult,
      features
    };
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();
export default configManager;
