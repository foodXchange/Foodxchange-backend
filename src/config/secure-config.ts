import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { Logger } from '../core/logging/logger';

const logger = new Logger('SecureConfig');

export interface SecureSecrets {
  // Database
  mongoConnectionString: string;
  redisConnectionString: string;
  
  // JWT
  jwtSecret: string;
  jwtRefreshSecret: string;
  
  // Azure Services
  openAIKey: string;
  textAnalyticsKey: string;
  formRecognizerKey: string;
  searchKey: string;
  storageConnectionString: string;
  serviceBusConnectionString: string;
  
  // External Services
  twilioAccountSid: string;
  twilioAuthToken: string;
  sendGridApiKey: string;
  
  // Encryption
  encryptionKey: string;
  
  // OAuth
  googleClientId: string;
  googleClientSecret: string;
  microsoftClientId: string;
  microsoftClientSecret: string;
}

export class SecureConfig {
  private secrets: SecureSecrets | null = null;
  private isProduction: boolean;
  private useKeyVault: boolean;
  private keyVaultName: string;
  private client: SecretClient | null = null;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.useKeyVault = process.env.USE_KEY_VAULT === 'true';
    this.keyVaultName = process.env.KEY_VAULT_NAME || 'foodxchange-keyvault';
    
    if (this.useKeyVault && this.isProduction) {
      this.initializeKeyVaultClient();
    }
  }

  private initializeKeyVaultClient(): void {
    try {
      const credential = new DefaultAzureCredential();
      const vaultUrl = `https://${this.keyVaultName}.vault.azure.net`;
      this.client = new SecretClient(vaultUrl, credential);
      logger.info('Azure Key Vault client initialized', { vaultUrl });
    } catch (error) {
      logger.error('Failed to initialize Key Vault client:', error);
      throw error;
    }
  }

  async loadSecrets(): Promise<SecureSecrets> {
    if (this.secrets) {
      return this.secrets;
    }

    if (this.useKeyVault && this.isProduction && this.client) {
      logger.info('Loading secrets from Azure Key Vault...');
      this.secrets = await this.loadFromKeyVault();
    } else {
      logger.info('Loading secrets from environment variables...');
      this.secrets = this.loadFromEnvironment();
    }

    // Validate critical secrets
    this.validateSecrets();
    
    return this.secrets;
  }

  private async loadFromKeyVault(): Promise<SecureSecrets> {
    if (!this.client) {
      throw new Error('Key Vault client not initialized');
    }

    const secretNames = [
      'mongo-connection-string',
      'redis-connection-string',
      'jwt-secret',
      'jwt-refresh-secret',
      'azure-openai-key',
      'azure-text-analytics-key',
      'azure-form-recognizer-key',
      'azure-search-key',
      'azure-storage-connection-string',
      'azure-service-bus-connection-string',
      'twilio-account-sid',
      'twilio-auth-token',
      'sendgrid-api-key',
      'encryption-key',
      'google-client-id',
      'google-client-secret',
      'microsoft-client-id',
      'microsoft-client-secret'
    ];

    const secrets: Partial<SecureSecrets> = {};
    
    for (const secretName of secretNames) {
      try {
        const secret = await this.client.getSecret(secretName);
        const key = this.convertSecretNameToKey(secretName);
        secrets[key as keyof SecureSecrets] = secret.value || '';
      } catch (error: any) {
        logger.warn(`Failed to retrieve secret ${secretName}:`, error.message);
        // Fall back to environment variable
        const envKey = secretName.toUpperCase().replace(/-/g, '_');
        secrets[this.convertSecretNameToKey(secretName) as keyof SecureSecrets] = process.env[envKey] || '';
      }
    }

    return secrets as SecureSecrets;
  }

  private loadFromEnvironment(): SecureSecrets {
    return {
      mongoConnectionString: process.env.MONGO_CONNECTION_STRING || process.env.MONGODB_URI || '',
      redisConnectionString: process.env.REDIS_CONNECTION_STRING || process.env.REDIS_URL || '',
      jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production',
      openAIKey: process.env.AZURE_OPENAI_KEY || 'dummy-key',
      textAnalyticsKey: process.env.AZURE_TEXT_ANALYTICS_KEY || 'dummy-key',
      formRecognizerKey: process.env.AZURE_FORM_RECOGNIZER_KEY || 'dummy-key',
      searchKey: process.env.AZURE_SEARCH_KEY || 'dummy-key',
      storageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
      serviceBusConnectionString: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING || '',
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
      sendGridApiKey: process.env.SENDGRID_API_KEY || '',
      encryptionKey: process.env.ENCRYPTION_KEY || 'your-encryption-key-change-in-production',
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
      microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || ''
    };
  }

  private convertSecretNameToKey(secretName: string): string {
    return secretName
      .replace(/azure-/g, '')
      .replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())
      .replace(/^([a-z])/, (match, letter) => letter.toLowerCase());
  }

  private validateSecrets(): void {
    if (!this.secrets) {
      throw new Error('Secrets not loaded');
    }

    const criticalSecrets = ['jwtSecret', 'jwtRefreshSecret'];
    
    if (this.isProduction) {
      criticalSecrets.push('mongoConnectionString', 'redisConnectionString');
    }

    for (const secretKey of criticalSecrets) {
      const value = this.secrets[secretKey as keyof SecureSecrets];
      if (!value || value === 'dummy-key' || value.includes('change-in-production')) {
        throw new Error(`Critical secret ${secretKey} is not properly configured for production`);
      }
    }

    logger.info('Secret validation completed successfully');
  }

  // Helper method to get endpoints
  getEndpoints(): Record<string, string> {
    return {
      openAI: process.env.AZURE_OPENAI_ENDPOINT || 'https://your-openai-resource.openai.azure.com/',
      textAnalytics: process.env.AZURE_TEXT_ANALYTICS_ENDPOINT || 'https://your-text-analytics.cognitiveservices.azure.com/',
      formRecognizer: process.env.AZURE_FORM_RECOGNIZER_ENDPOINT || 'https://your-form-recognizer.cognitiveservices.azure.com/',
      search: process.env.AZURE_SEARCH_ENDPOINT || 'https://your-search-service.search.windows.net',
      storage: process.env.AZURE_STORAGE_ENDPOINT || 'https://yourstorageaccount.blob.core.windows.net',
      serviceBus: process.env.AZURE_SERVICE_BUS_ENDPOINT || 'https://your-service-bus.servicebus.windows.net'
    };
  }

  // Get a specific secret
  async getSecret(key: keyof SecureSecrets): Promise<string> {
    if (!this.secrets) {
      await this.loadSecrets();
    }
    return this.secrets![key];
  }

  // Check if running in production
  isProductionMode(): boolean {
    return this.isProduction;
  }

  // Check if Key Vault is enabled
  isKeyVaultEnabled(): boolean {
    return this.useKeyVault;
  }

  // Rotate secrets (for production use)
  async rotateSecret(secretName: string, newValue: string): Promise<void> {
    if (!this.client) {
      throw new Error('Key Vault client not available');
    }

    try {
      await this.client.setSecret(secretName, newValue);
      logger.info(`Secret ${secretName} rotated successfully`);
      
      // Invalidate cached secrets to force reload
      this.secrets = null;
    } catch (error) {
      logger.error(`Failed to rotate secret ${secretName}:`, error);
      throw error;
    }
  }

  // Health check for Key Vault connectivity
  async healthCheck(): Promise<{ status: string; details: any }> {
    if (!this.useKeyVault || !this.client) {
      return { status: 'disabled', details: { message: 'Key Vault not configured' } };
    }

    try {
      // Try to list secrets (without values) to test connectivity
      const secretsIterator = this.client.listPropertiesOfSecrets();
      const firstSecret = await secretsIterator.next();
      
      return {
        status: 'healthy',
        details: {
          vaultUrl: `https://${this.keyVaultName}.vault.azure.net`,
          connected: true,
          hasSecrets: !firstSecret.done
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        details: {
          vaultUrl: `https://${this.keyVaultName}.vault.azure.net`,
          error: error.message,
          connected: false
        }
      };
    }
  }
}

// Export singleton instance
export const secureConfig = new SecureConfig();