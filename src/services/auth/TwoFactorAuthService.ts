import crypto from 'crypto';
import { User } from '../../models/User';
import { Logger } from '../../core/logging/logger';
import { secureConfig } from '../../config/secure-config';

const logger = new Logger('TwoFactorAuthService');

interface TwoFactorSecret {
  secret: string;
  qrCode: string;
  backupCodes: string[];
  isEnabled: boolean;
  createdAt: Date;
  lastUsed?: Date;
}

export interface TwoFactorChallenge {
  userId: string;
  challengeId: string;
  method: 'totp' | 'sms' | 'email';
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

export class TwoFactorAuthService {
  private readonly secretLength = 32;
  private readonly tokenWindow = 1; // 30-second window
  private readonly backupCodeLength = 10;
  private readonly backupCodeCount = 10;

  /**
   * Generate a new TOTP secret for a user
   */
  async generateTOTPSecret(userId: string): Promise<TwoFactorSecret> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate secret
      const secret = this.generateSecret();
      
      // Generate QR code data
      const qrCodeData = this.generateQRCodeData(user.email, secret);
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      const twoFactorSecret: TwoFactorSecret = {
        secret,
        qrCode: qrCodeData,
        backupCodes,
        isEnabled: false,
        createdAt: new Date()
      };

      // Store encrypted secret in user record
      await User.findByIdAndUpdate(userId, {
        $set: {
          'twoFactor.secret': this.encryptSecret(secret),
          'twoFactor.backupCodes': backupCodes.map(code => this.hashBackupCode(code)),
          'twoFactor.isEnabled': false,
          'twoFactor.createdAt': new Date()
        }
      });

      logger.info('TOTP secret generated for user', { userId });
      
      return twoFactorSecret;
    } catch (error) {
      logger.error('Failed to generate TOTP secret:', error);
      throw error;
    }
  }

  /**
   * Verify TOTP token and enable 2FA
   */
  async verifyAndEnable2FA(userId: string, token: string): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      if (!user?.twoFactor?.secret) {
        throw new Error('No 2FA secret found for user');
      }

      const secret = this.decryptSecret(user.twoFactor.secret);
      const isValid = this.verifyTOTPToken(secret, token);

      if (isValid) {
        await User.findByIdAndUpdate(userId, {
          $set: {
            'twoFactor.isEnabled': true,
            'twoFactor.enabledAt': new Date()
          }
        });

        logger.info('2FA enabled for user', { userId });
        return true;
      }

      logger.warn('Invalid 2FA token during enable attempt', { userId });
      return false;
    } catch (error) {
      logger.error('Failed to verify and enable 2FA:', error);
      throw error;
    }
  }

  /**
   * Verify TOTP token for authentication
   */
  async verifyTOTPToken(secret: string, token: string): Promise<boolean> {
    try {
      const timeStep = Math.floor(Date.now() / 1000 / 30);
      
      // Check current time window and adjacent windows
      for (let i = -this.tokenWindow; i <= this.tokenWindow; i++) {
        const expectedToken = this.generateTOTPToken(secret, timeStep + i);
        if (expectedToken === token) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Failed to verify TOTP token:', error);
      return false;
    }
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      if (!user?.twoFactor?.backupCodes) {
        return false;
      }

      const hashedCode = this.hashBackupCode(code);
      const codeIndex = user.twoFactor.backupCodes.indexOf(hashedCode);
      
      if (codeIndex === -1) {
        return false;
      }

      // Remove used backup code
      await User.findByIdAndUpdate(userId, {
        $pull: {
          'twoFactor.backupCodes': hashedCode
        },
        $set: {
          'twoFactor.lastUsed': new Date()
        }
      });

      logger.info('Backup code used successfully', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to verify backup code:', error);
      return false;
    }
  }

  /**
   * Send SMS challenge
   */
  async sendSMSChallenge(userId: string, phoneNumber: string): Promise<string> {
    try {
      const code = this.generateSMSCode();
      const challengeId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store challenge in cache/database
      await this.storeTwoFactorChallenge({
        userId,
        challengeId,
        method: 'sms',
        expiresAt,
        isUsed: false,
        createdAt: new Date()
      }, code);

      // Send SMS (implement with Twilio or similar)
      await this.sendSMS(phoneNumber, `Your FoodXchange verification code is: ${code}`);

      logger.info('SMS challenge sent', { userId, challengeId });
      return challengeId;
    } catch (error) {
      logger.error('Failed to send SMS challenge:', error);
      throw error;
    }
  }

  /**
   * Send email challenge
   */
  async sendEmailChallenge(userId: string, email: string): Promise<string> {
    try {
      const code = this.generateEmailCode();
      const challengeId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store challenge in cache/database
      await this.storeTwoFactorChallenge({
        userId,
        challengeId,
        method: 'email',
        expiresAt,
        isUsed: false,
        createdAt: new Date()
      }, code);

      // Send email (implement with SendGrid or similar)
      await this.sendEmail(email, 'FoodXchange Two-Factor Authentication', `
        <h2>Two-Factor Authentication Code</h2>
        <p>Your verification code is: <strong>${code}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      `);

      logger.info('Email challenge sent', { userId, challengeId });
      return challengeId;
    } catch (error) {
      logger.error('Failed to send email challenge:', error);
      throw error;
    }
  }

  /**
   * Verify challenge code
   */
  async verifyChallengeCode(challengeId: string, code: string): Promise<boolean> {
    try {
      const challenge = await this.getTwoFactorChallenge(challengeId);
      
      if (!challenge || challenge.isUsed || challenge.expiresAt < new Date()) {
        return false;
      }

      const storedCode = await this.getChallengeCode(challengeId);
      if (storedCode !== code) {
        return false;
      }

      // Mark challenge as used
      await this.markChallengeAsUsed(challengeId);

      logger.info('Challenge code verified successfully', { challengeId });
      return true;
    } catch (error) {
      logger.error('Failed to verify challenge code:', error);
      return false;
    }
  }

  /**
   * Check if user has 2FA enabled
   */
  async is2FAEnabled(userId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      return user?.twoFactor?.isEnabled || false;
    } catch (error) {
      logger.error('Failed to check 2FA status:', error);
      return false;
    }
  }

  /**
   * Disable 2FA for user
   */
  async disable2FA(userId: string): Promise<void> {
    try {
      await User.findByIdAndUpdate(userId, {
        $unset: {
          'twoFactor.secret': 1,
          'twoFactor.backupCodes': 1,
          'twoFactor.isEnabled': 1,
          'twoFactor.enabledAt': 1
        }
      });

      logger.info('2FA disabled for user', { userId });
    } catch (error) {
      logger.error('Failed to disable 2FA:', error);
      throw error;
    }
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    try {
      const backupCodes = this.generateBackupCodes();
      
      await User.findByIdAndUpdate(userId, {
        $set: {
          'twoFactor.backupCodes': backupCodes.map(code => this.hashBackupCode(code))
        }
      });

      logger.info('Backup codes regenerated', { userId });
      return backupCodes;
    } catch (error) {
      logger.error('Failed to regenerate backup codes:', error);
      throw error;
    }
  }

  // Private helper methods

  private generateSecret(): string {
    return crypto.randomBytes(this.secretLength).toString('hex');
  }

  private generateQRCodeData(email: string, secret: string): string {
    const issuer = 'FoodXchange';
    const account = encodeURIComponent(email);
    const issuerEncoded = encodeURIComponent(issuer);
    
    return `otpauth://totp/${issuerEncoded}:${account}?secret=${secret}&issuer=${issuerEncoded}`;
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < this.backupCodeCount; i++) {
      codes.push(crypto.randomBytes(this.backupCodeLength).toString('hex').substring(0, 8));
    }
    return codes;
  }

  private generateTOTPToken(secret: string, timeStep: number): string {
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(timeStep, 4);
    
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex'));
    hmac.update(timeBuffer);
    const hash = hmac.digest();
    
    const offset = hash[hash.length - 1] & 0x0f;
    const code = ((hash[offset] & 0x7f) << 24) |
                 ((hash[offset + 1] & 0xff) << 16) |
                 ((hash[offset + 2] & 0xff) << 8) |
                 (hash[offset + 3] & 0xff);
    
    return (code % 1000000).toString().padStart(6, '0');
  }

  private generateSMSCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateEmailCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private encryptSecret(secret: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptSecret(encryptedSecret: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const parts = encryptedSecret.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipher(algorithm, key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private async storeTwoFactorChallenge(challenge: TwoFactorChallenge, code: string): Promise<void> {
    // Store in Redis or database
    // Implementation depends on your caching strategy
    // For now, using in-memory storage (should be replaced with Redis)
    // TODO: Implement Redis storage
  }

  private async getTwoFactorChallenge(challengeId: string): Promise<TwoFactorChallenge | null> {
    // Retrieve from Redis or database
    // Implementation depends on your caching strategy
    // TODO: Implement Redis retrieval
    return null;
  }

  private async getChallengeCode(challengeId: string): Promise<string | null> {
    // Retrieve challenge code from Redis or database
    // TODO: Implement Redis retrieval
    return null;
  }

  private async markChallengeAsUsed(challengeId: string): Promise<void> {
    // Mark challenge as used in Redis or database
    // TODO: Implement Redis update
  }

  private async sendSMS(phoneNumber: string, message: string): Promise<void> {
    // Implement SMS sending with Twilio
    try {
      const twilioSid = await secureConfig.getSecret('twilioAccountSid');
      const twilioToken = await secureConfig.getSecret('twilioAuthToken');
      
      if (!twilioSid || !twilioToken) {
        throw new Error('Twilio credentials not configured');
      }

      // TODO: Implement actual Twilio SMS sending
      logger.info('SMS sent successfully', { phoneNumber: phoneNumber.substring(0, 3) + '***' });
    } catch (error) {
      logger.error('Failed to send SMS:', error);
      throw error;
    }
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    // Implement email sending with SendGrid
    try {
      const sendGridKey = await secureConfig.getSecret('sendGridApiKey');
      
      if (!sendGridKey) {
        throw new Error('SendGrid API key not configured');
      }

      // TODO: Implement actual SendGrid email sending
      logger.info('Email sent successfully', { to: to.substring(0, 3) + '***' });
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const twoFactorAuthService = new TwoFactorAuthService();