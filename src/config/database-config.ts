import mongoose from 'mongoose';

import { Logger } from '../core/logging/logger';

const logger = new Logger('DatabaseConfig');

export interface EnvironmentDatabaseConfig {
  uri: string;
  poolSettings: {
    maxPoolSize: number;
    minPoolSize: number;
    maxIdleTimeMS: number;
    waitQueueTimeoutMS: number;
  };
  connectionSettings: {
    serverSelectionTimeoutMS: number;
    socketTimeoutMS: number;
    connectTimeoutMS: number;
    heartbeatFrequencyMS: number;
  };
  writeSettings: {
    w: string | number;
    wtimeoutMS: number;
    journal: boolean;
  };
  readSettings: {
    readPreference: string;
    readConcernLevel: string;
    maxStalenessSeconds: number;
  };
  retrySettings: {
    retryWrites: boolean;
    retryReads: boolean;
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
    maxRetryDelay: number;
  };
  monitoringSettings: {
    monitorCommands: boolean;
    enableProfiling: boolean;
    profileLevel: number;
    slowQueryThreshold: number;
    enableDiagnostics: boolean;
  };
  compressionSettings: {
    compressors: string[];
    zlibCompressionLevel: number;
  };
  securitySettings: {
    tls: boolean;
    tlsInsecure: boolean;
    tlsAllowInvalidCertificates: boolean;
    tlsAllowInvalidHostnames: boolean;
    authSource: string;
  };
  advancedSettings: {
    autoCreate: boolean;
    autoIndex: boolean;
    bufferCommands: boolean;
    directConnection: boolean;
    serverApiVersion?: string;
  };
}

export class DatabaseConfigManager {
  private static instance: DatabaseConfigManager;
  private currentConfig: EnvironmentDatabaseConfig | null = null;

  private constructor() {}

  public static getInstance(): DatabaseConfigManager {
    if (!DatabaseConfigManager.instance) {
      DatabaseConfigManager.instance = new DatabaseConfigManager();
    }
    return DatabaseConfigManager.instance;
  }

  public getConfigForEnvironment(env: string = process.env.NODE_ENV || 'development'): EnvironmentDatabaseConfig {
    if (this.currentConfig) {
      return this.currentConfig;
    }

    let config: EnvironmentDatabaseConfig;

    switch (env) {
      case 'production':
        config = this.getProductionConfig();
        break;
      case 'staging':
        config = this.getStagingConfig();
        break;
      case 'test':
        config = this.getTestConfig();
        break;
      case 'development':
      default:
        config = this.getDevelopmentConfig();
        break;
    }

    this.currentConfig = config;
    logger.info(`Database configuration loaded for environment: ${env}`);
    return config;
  }

  private getDevelopmentConfig(): EnvironmentDatabaseConfig {
    return {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange_dev',
      poolSettings: {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '10'),
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '2'),
        maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME || '10000'),
        waitQueueTimeoutMS: parseInt(process.env.DB_WAIT_QUEUE_TIMEOUT || '5000')
      },
      connectionSettings: {
        serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT || '5000'),
        socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT || '45000'),
        connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000'),
        heartbeatFrequencyMS: parseInt(process.env.DB_HEARTBEAT_FREQUENCY || '10000')
      },
      writeSettings: {
        w: process.env.DB_WRITE_CONCERN || 'majority',
        wtimeoutMS: parseInt(process.env.DB_WRITE_TIMEOUT || '2500'),
        journal: process.env.DB_JOURNAL !== 'false'
      },
      readSettings: {
        readPreference: process.env.DB_READ_PREFERENCE || 'primaryPreferred',
        readConcernLevel: process.env.DB_READ_CONCERN_LEVEL || 'majority',
        maxStalenessSeconds: parseInt(process.env.DB_MAX_STALENESS_SECONDS || '90')
      },
      retrySettings: {
        retryWrites: process.env.DB_RETRY_WRITES !== 'false',
        retryReads: process.env.DB_RETRY_READS !== 'false',
        maxRetries: parseInt(process.env.DB_MAX_RETRIES || '5'),
        retryDelay: parseInt(process.env.DB_RETRY_DELAY || '5000'),
        backoffMultiplier: parseFloat(process.env.DB_BACKOFF_MULTIPLIER || '1.5'),
        maxRetryDelay: parseInt(process.env.DB_MAX_RETRY_DELAY || '30000')
      },
      monitoringSettings: {
        monitorCommands: process.env.DB_MONITOR_COMMANDS === 'true',
        enableProfiling: process.env.DB_ENABLE_PROFILING === 'true',
        profileLevel: parseInt(process.env.DB_PROFILE_LEVEL || '100'),
        slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '100'),
        enableDiagnostics: process.env.DB_ENABLE_DIAGNOSTICS === 'true'
      },
      compressionSettings: {
        compressors: process.env.DB_COMPRESSORS ? process.env.DB_COMPRESSORS.split(',') : ['zlib'],
        zlibCompressionLevel: parseInt(process.env.DB_ZLIB_COMPRESSION_LEVEL || '4')
      },
      securitySettings: {
        tls: process.env.DB_TLS === 'true',
        tlsInsecure: process.env.DB_TLS_INSECURE === 'true',
        tlsAllowInvalidCertificates: process.env.DB_TLS_ALLOW_INVALID_CERTS === 'true',
        tlsAllowInvalidHostnames: process.env.DB_TLS_ALLOW_INVALID_HOSTNAMES === 'true',
        authSource: process.env.DB_AUTH_SOURCE || 'admin'
      },
      advancedSettings: {
        autoCreate: true,
        autoIndex: true,
        bufferCommands: false,
        directConnection: process.env.DB_DIRECT_CONNECTION === 'true',
        serverApiVersion: process.env.DB_SERVER_API_VERSION
      }
    };
  }

  private getProductionConfig(): EnvironmentDatabaseConfig {
    return {
      uri: process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster.mongodb.net/foodxchange_prod',
      poolSettings: {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '50'),
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '10'),
        maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME || '30000'),
        waitQueueTimeoutMS: parseInt(process.env.DB_WAIT_QUEUE_TIMEOUT || '10000')
      },
      connectionSettings: {
        serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT || '10000'),
        socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT || '60000'),
        connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT || '15000'),
        heartbeatFrequencyMS: parseInt(process.env.DB_HEARTBEAT_FREQUENCY || '10000')
      },
      writeSettings: {
        w: process.env.DB_WRITE_CONCERN || 'majority',
        wtimeoutMS: parseInt(process.env.DB_WRITE_TIMEOUT || '5000'),
        journal: process.env.DB_JOURNAL !== 'false'
      },
      readSettings: {
        readPreference: process.env.DB_READ_PREFERENCE || 'primaryPreferred',
        readConcernLevel: process.env.DB_READ_CONCERN_LEVEL || 'majority',
        maxStalenessSeconds: parseInt(process.env.DB_MAX_STALENESS_SECONDS || '90')
      },
      retrySettings: {
        retryWrites: process.env.DB_RETRY_WRITES !== 'false',
        retryReads: process.env.DB_RETRY_READS !== 'false',
        maxRetries: parseInt(process.env.DB_MAX_RETRIES || '3'),
        retryDelay: parseInt(process.env.DB_RETRY_DELAY || '2000'),
        backoffMultiplier: parseFloat(process.env.DB_BACKOFF_MULTIPLIER || '2.0'),
        maxRetryDelay: parseInt(process.env.DB_MAX_RETRY_DELAY || '15000')
      },
      monitoringSettings: {
        monitorCommands: process.env.DB_MONITOR_COMMANDS === 'true',
        enableProfiling: process.env.DB_ENABLE_PROFILING === 'true',
        profileLevel: parseInt(process.env.DB_PROFILE_LEVEL || '0'),
        slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '200'),
        enableDiagnostics: process.env.DB_ENABLE_DIAGNOSTICS === 'true'
      },
      compressionSettings: {
        compressors: process.env.DB_COMPRESSORS ? process.env.DB_COMPRESSORS.split(',') : ['snappy', 'zlib'],
        zlibCompressionLevel: parseInt(process.env.DB_ZLIB_COMPRESSION_LEVEL || '6')
      },
      securitySettings: {
        tls: process.env.DB_TLS !== 'false',
        tlsInsecure: process.env.DB_TLS_INSECURE === 'true',
        tlsAllowInvalidCertificates: process.env.DB_TLS_ALLOW_INVALID_CERTS === 'true',
        tlsAllowInvalidHostnames: process.env.DB_TLS_ALLOW_INVALID_HOSTNAMES === 'true',
        authSource: process.env.DB_AUTH_SOURCE || 'admin'
      },
      advancedSettings: {
        autoCreate: false,
        autoIndex: false,
        bufferCommands: false,
        directConnection: process.env.DB_DIRECT_CONNECTION === 'true',
        serverApiVersion: process.env.DB_SERVER_API_VERSION || '1'
      }
    };
  }

  private getStagingConfig(): EnvironmentDatabaseConfig {
    // Staging uses production-like settings but with more monitoring
    const prodConfig = this.getProductionConfig();
    return {
      ...prodConfig,
      uri: process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster.mongodb.net/foodxchange_staging',
      poolSettings: {
        ...prodConfig.poolSettings,
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '25'),
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '5')
      },
      monitoringSettings: {
        ...prodConfig.monitoringSettings,
        monitorCommands: true,
        enableProfiling: true,
        enableDiagnostics: true
      },
      advancedSettings: {
        ...prodConfig.advancedSettings,
        autoCreate: true,
        autoIndex: true
      }
    };
  }

  private getTestConfig(): EnvironmentDatabaseConfig {
    return {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange_test',
      poolSettings: {
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '5'),
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '1'),
        maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME || '5000'),
        waitQueueTimeoutMS: parseInt(process.env.DB_WAIT_QUEUE_TIMEOUT || '3000')
      },
      connectionSettings: {
        serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT || '3000'),
        socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT || '30000'),
        connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000'),
        heartbeatFrequencyMS: parseInt(process.env.DB_HEARTBEAT_FREQUENCY || '5000')
      },
      writeSettings: {
        w: process.env.DB_WRITE_CONCERN || 1,
        wtimeoutMS: parseInt(process.env.DB_WRITE_TIMEOUT || '1000'),
        journal: process.env.DB_JOURNAL !== 'false'
      },
      readSettings: {
        readPreference: process.env.DB_READ_PREFERENCE || 'primary',
        readConcernLevel: process.env.DB_READ_CONCERN_LEVEL || 'local',
        maxStalenessSeconds: parseInt(process.env.DB_MAX_STALENESS_SECONDS || '60')
      },
      retrySettings: {
        retryWrites: process.env.DB_RETRY_WRITES !== 'false',
        retryReads: process.env.DB_RETRY_READS !== 'false',
        maxRetries: parseInt(process.env.DB_MAX_RETRIES || '2'),
        retryDelay: parseInt(process.env.DB_RETRY_DELAY || '1000'),
        backoffMultiplier: parseFloat(process.env.DB_BACKOFF_MULTIPLIER || '1.2'),
        maxRetryDelay: parseInt(process.env.DB_MAX_RETRY_DELAY || '5000')
      },
      monitoringSettings: {
        monitorCommands: false,
        enableProfiling: false,
        profileLevel: 0,
        slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '50'),
        enableDiagnostics: false
      },
      compressionSettings: {
        compressors: [],
        zlibCompressionLevel: 1
      },
      securitySettings: {
        tls: false,
        tlsInsecure: false,
        tlsAllowInvalidCertificates: false,
        tlsAllowInvalidHostnames: false,
        authSource: process.env.DB_AUTH_SOURCE || 'admin'
      },
      advancedSettings: {
        autoCreate: true,
        autoIndex: true,
        bufferCommands: false,
        directConnection: process.env.DB_DIRECT_CONNECTION === 'true',
        serverApiVersion: process.env.DB_SERVER_API_VERSION
      }
    };
  }

  public toMongooseOptions(config: EnvironmentDatabaseConfig): mongoose.ConnectOptions {
    return {
      // Connection Pool Settings
      maxPoolSize: config.poolSettings.maxPoolSize,
      minPoolSize: config.poolSettings.minPoolSize,
      maxIdleTimeMS: config.poolSettings.maxIdleTimeMS,
      waitQueueTimeoutMS: config.poolSettings.waitQueueTimeoutMS,

      // Connection Settings
      serverSelectionTimeoutMS: config.connectionSettings.serverSelectionTimeoutMS,
      socketTimeoutMS: config.connectionSettings.socketTimeoutMS,
      connectTimeoutMS: config.connectionSettings.connectTimeoutMS,
      heartbeatFrequencyMS: config.connectionSettings.heartbeatFrequencyMS,
      family: 4,

      // Write Concern
      w: config.writeSettings.w as any,
      wtimeoutMS: config.writeSettings.wtimeoutMS,
      journal: config.writeSettings.journal,

      // Read Preference
      readPreference: config.readSettings.readPreference as any,
      readConcern: { level: config.readSettings.readConcernLevel as any },
      maxStalenessSeconds: config.readSettings.maxStalenessSeconds,

      // Retry Settings
      retryWrites: config.retrySettings.retryWrites,
      retryReads: config.retrySettings.retryReads,

      // Monitoring
      monitorCommands: config.monitoringSettings.monitorCommands,

      // Compression
      compressors: config.compressionSettings.compressors as any[],
      zlibCompressionLevel: config.compressionSettings.zlibCompressionLevel as any,

      // Security
      tls: config.securitySettings.tls,
      tlsInsecure: config.securitySettings.tlsInsecure,
      tlsAllowInvalidCertificates: config.securitySettings.tlsAllowInvalidCertificates,
      tlsAllowInvalidHostnames: config.securitySettings.tlsAllowInvalidHostnames,
      authSource: config.securitySettings.authSource,

      // Advanced Settings
      autoCreate: config.advancedSettings.autoCreate,
      autoIndex: config.advancedSettings.autoIndex,
      bufferCommands: config.advancedSettings.bufferCommands,
      directConnection: config.advancedSettings.directConnection,
      serverApi: config.advancedSettings.serverApiVersion ? { version: '1' as const } : undefined
    };
  }

  public validateConfiguration(config: EnvironmentDatabaseConfig): {
    isValid: boolean;
    warnings: string[];
    errors: string[];
    recommendations: string[];
  } {
    const validation = {
      isValid: true,
      warnings: [] as string[],
      errors: [] as string[],
      recommendations: [] as string[]
    };

    // Validate URI
    if (!config.uri?.includes('mongodb')) {
      validation.errors.push('Invalid MongoDB URI');
      validation.isValid = false;
    }

    // Validate pool settings
    if (config.poolSettings.maxPoolSize <= config.poolSettings.minPoolSize) {
      validation.errors.push('maxPoolSize must be greater than minPoolSize');
      validation.isValid = false;
    }

    if (config.poolSettings.maxPoolSize > 100) {
      validation.warnings.push('maxPoolSize is very high, consider reducing for optimal performance');
    }

    // Validate timeouts
    if (config.connectionSettings.socketTimeoutMS < config.connectionSettings.connectTimeoutMS) {
      validation.warnings.push('socketTimeoutMS should be greater than connectTimeoutMS');
    }

    // Production recommendations
    if (process.env.NODE_ENV === 'production') {
      if (!config.securitySettings.tls) {
        validation.warnings.push('TLS is disabled in production - consider enabling for security');
      }

      if (config.monitoringSettings.enableProfiling) {
        validation.warnings.push('Query profiling is enabled in production - this may impact performance');
      }

      if (config.advancedSettings.autoIndex) {
        validation.warnings.push('autoIndex is enabled in production - this may impact performance');
      }

      if (config.poolSettings.maxPoolSize < 20) {
        validation.recommendations.push('Consider increasing maxPoolSize for production workloads');
      }

      if (config.monitoringSettings.slowQueryThreshold < 100) {
        validation.recommendations.push('Consider increasing slow query threshold for production');
      }
    }

    return validation;
  }

  public getEnvironmentSummary(): {
    environment: string;
    config: EnvironmentDatabaseConfig;
    validation: any;
    optimizations: string[];
    } {
    const env = process.env.NODE_ENV || 'development';
    const config = this.getConfigForEnvironment(env);
    const validation = this.validateConfiguration(config);

    const optimizations = [];

    // Generate optimization suggestions
    if (env === 'production') {
      optimizations.push('Enable connection pooling monitoring');
      optimizations.push('Implement query result caching');
      optimizations.push('Set up database replication for read scaling');
      optimizations.push('Configure automated backups');
      optimizations.push('Monitor slow queries and create appropriate indexes');
    } else if (env === 'development') {
      optimizations.push('Enable query profiling for development insights');
      optimizations.push('Use smaller connection pool sizes');
      optimizations.push('Enable detailed logging for debugging');
    }

    return {
      environment: env,
      config,
      validation,
      optimizations
    };
  }

  public resetConfiguration(): void {
    this.currentConfig = null;
  }
}

// Export singleton instance
export const databaseConfigManager = DatabaseConfigManager.getInstance();
