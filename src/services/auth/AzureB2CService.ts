import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { Logger } from '../../core/logging/logger';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { AuthenticationError, AuthorizationError } from '../../core/errors';

const logger = new Logger('AzureB2CService');

export interface B2CUserInfo {
  objectId: string;
  email: string;
  displayName: string;
  givenName: string;
  surname: string;
  tenantId: string;
  signInNames: Array<{
    type: string;
    value: string;
  }>;
}

export interface B2CTokenValidationResult {
  isValid: boolean;
  userInfo?: B2CUserInfo;
  error?: string;
}

export class AzureB2CService {
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly policyName: string;
  private readonly keyVaultUrl: string;
  private secretClient: SecretClient;

  constructor() {
    this.tenantId = process.env.AZURE_B2C_TENANT_ID || '';
    this.clientId = process.env.AZURE_B2C_CLIENT_ID || '';
    this.clientSecret = process.env.AZURE_B2C_CLIENT_SECRET || '';
    this.policyName = process.env.AZURE_B2C_POLICY_NAME || 'B2C_1_SignUpSignIn';
    this.keyVaultUrl = process.env.AZURE_KEYVAULT_URL || '';
    
    if (this.keyVaultUrl) {
      const credential = new DefaultAzureCredential();
      this.secretClient = new SecretClient(this.keyVaultUrl, credential);
    }
  }

  /**
   * Initialize service with secrets from Azure Key Vault
   */
  async initialize(): Promise<void> {
    try {
      if (this.secretClient) {
        const secrets = await Promise.all([
          this.secretClient.getSecret('azure-b2c-tenant-id'),
          this.secretClient.getSecret('azure-b2c-client-id'),
          this.secretClient.getSecret('azure-b2c-client-secret'),
          this.secretClient.getSecret('azure-b2c-policy-name')
        ]);

        if (secrets[0].value) this.tenantId = secrets[0].value;
        if (secrets[1].value) this.clientId = secrets[1].value;
        if (secrets[2].value) this.clientSecret = secrets[2].value;
        if (secrets[3].value) this.policyName = secrets[3].value;
      }

      logger.info('Azure B2C service initialized successfully');
    } catch (error) {
      logger.warn('Failed to load B2C secrets from Key Vault, using environment variables', error);
    }
  }

  /**
   * Validate Azure B2C JWT token
   */
  async validateToken(token: string): Promise<B2CTokenValidationResult> {
    try {
      // Get the well-known OpenID configuration
      const configUrl = `https://${this.tenantId}.b2clogin.com/${this.tenantId}.onmicrosoft.com/${this.policyName}/v2.0/.well-known/openid_configuration`;
      const configResponse = await axios.get(configUrl);
      const config = configResponse.data;

      // Get the JWKS (JSON Web Key Set)
      const jwksResponse = await axios.get(config.jwks_uri);
      const jwks = jwksResponse.data;

      // Decode the token header to get the key ID
      const decodedHeader = jwt.decode(token, { complete: true });
      if (!decodedHeader) {
        return { isValid: false, error: 'Invalid token format' };
      }

      const kid = decodedHeader.header.kid;
      const key = jwks.keys.find((k: any) => k.kid === kid);

      if (!key) {
        return { isValid: false, error: 'Key not found in JWKS' };
      }

      // Verify the token
      const publicKey = this.jwkToPem(key);
      const decoded = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        audience: this.clientId,
        issuer: config.issuer
      }) as any;

      // Extract user information
      const userInfo: B2CUserInfo = {
        objectId: decoded.sub,
        email: decoded.emails?.[0] || decoded.email,
        displayName: decoded.name || `${decoded.given_name} ${decoded.family_name}`,
        givenName: decoded.given_name,
        surname: decoded.family_name,
        tenantId: decoded.tid,
        signInNames: decoded.signInNames || []
      };

      return { isValid: true, userInfo };
    } catch (error) {
      logger.error('Token validation failed:', error);
      return { isValid: false, error: error.message };
    }
  }

  /**
   * Create or update user from B2C token
   */
  async createOrUpdateUser(userInfo: B2CUserInfo, companyId?: string): Promise<any> {
    try {
      let user = await User.findOne({
        $or: [
          { email: userInfo.email },
          { azureB2CId: userInfo.objectId }
        ]
      });

      if (!user) {
        // Create new user
        user = new User({
          email: userInfo.email,
          firstName: userInfo.givenName,
          lastName: userInfo.surname,
          displayName: userInfo.displayName,
          azureB2CId: userInfo.objectId,
          azureB2CTenantId: userInfo.tenantId,
          emailVerified: true,
          accountStatus: 'active',
          authProvider: 'azure-b2c'
        });

        if (companyId) {
          user.company = companyId;
        }

        await user.save();
        logger.info('New user created from B2C token', { userId: user._id, email: userInfo.email });
      } else {
        // Update existing user
        user.azureB2CId = userInfo.objectId;
        user.azureB2CTenantId = userInfo.tenantId;
        user.displayName = userInfo.displayName;
        user.lastLoginAt = new Date();
        
        if (companyId && !user.company) {
          user.company = companyId;
        }

        await user.save();
        logger.info('Existing user updated from B2C token', { userId: user._id, email: userInfo.email });
      }

      return user;
    } catch (error) {
      logger.error('Failed to create or update user from B2C token:', error);
      throw new AuthenticationError('Failed to process user authentication');
    }
  }

  /**
   * Get user authentication URL for Azure B2C
   */
  getAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      response_mode: 'query'
    });

    if (state) {
      params.append('state', state);
    }

    return `https://${this.tenantId}.b2clogin.com/${this.tenantId}.onmicrosoft.com/${this.policyName}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<any> {
    try {
      const tokenUrl = `https://${this.tenantId}.b2clogin.com/${this.tenantId}.onmicrosoft.com/${this.policyName}/oauth2/v2.0/token`;
      
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: redirectUri,
        scope: 'openid profile email'
      });

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to exchange authorization code for token:', error);
      throw new AuthenticationError('Failed to exchange authorization code');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<any> {
    try {
      const tokenUrl = `https://${this.tenantId}.b2clogin.com/${this.tenantId}.onmicrosoft.com/${this.policyName}/oauth2/v2.0/token`;
      
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        scope: 'openid profile email offline_access'
      });

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to refresh token:', error);
      throw new AuthenticationError('Failed to refresh token');
    }
  }

  /**
   * Revoke user session in Azure B2C
   */
  async revokeSession(userId: string): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user || !user.azureB2CId) {
        throw new AuthenticationError('User not found or not authenticated via Azure B2C');
      }

      // Azure B2C doesn't have a direct session revocation endpoint
      // Instead, we update the user's local session state
      user.refreshToken = null;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save();

      logger.info('User session revoked', { userId, azureB2CId: user.azureB2CId });
    } catch (error) {
      logger.error('Failed to revoke session:', error);
      throw new AuthorizationError('Failed to revoke session');
    }
  }

  /**
   * Get user profile from Azure B2C Graph API
   */
  async getUserProfile(accessToken: string): Promise<any> {
    try {
      const response = await axios.get(`https://graph.microsoft.com/v1.0/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get user profile:', error);
      throw new AuthenticationError('Failed to get user profile');
    }
  }

  /**
   * Invite user to Azure B2C tenant
   */
  async inviteUser(email: string, displayName: string, companyId: string): Promise<any> {
    try {
      // This requires Microsoft Graph API with appropriate permissions
      // Implementation depends on your specific B2C setup and requirements
      logger.info('User invitation initiated', { email, displayName, companyId });
      
      // For now, return a placeholder response
      return {
        invitationId: `inv_${Date.now()}`,
        invitationUrl: this.getAuthUrl(process.env.FRONTEND_URL + '/auth/callback'),
        email,
        displayName,
        companyId
      };
    } catch (error) {
      logger.error('Failed to invite user:', error);
      throw new AuthenticationError('Failed to invite user');
    }
  }

  /**
   * Convert JWK to PEM format for token verification
   */
  private jwkToPem(jwk: any): string {
    const { Buffer } = require('buffer');
    const keyType = jwk.kty;
    
    if (keyType !== 'RSA') {
      throw new Error('Only RSA keys are supported');
    }

    const modulus = Buffer.from(jwk.n, 'base64');
    const exponent = Buffer.from(jwk.e, 'base64');

    // Convert to PEM format (simplified implementation)
    // In production, use a proper library like node-rsa or jwk-to-pem
    const modulusHex = modulus.toString('hex');
    const exponentHex = exponent.toString('hex');

    // This is a simplified conversion - use a proper library in production
    return `-----BEGIN PUBLIC KEY-----\n${Buffer.from(modulusHex + exponentHex, 'hex').toString('base64')}\n-----END PUBLIC KEY-----`;
  }
}

export default AzureB2CService;