import { Request, Response } from 'express';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { 
  ValidationError, 
  AuthenticationError, 
  ConflictError 
} from '../../core/errors';
import { Logger } from '../../core/logging/logger';
import { AnalyticsService } from '../../services/analytics/AnalyticsService';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export class SSOController {
  private logger: Logger;
  private analyticsService: AnalyticsService;

  constructor() {
    this.logger = new Logger('SSOController');
    this.analyticsService = new AnalyticsService();
  }

  async getProviders(req: Request, res: Response): Promise<void> {
    try {
      const providers = [
        {
          name: 'google',
          displayName: 'Google',
          enabled: !!process.env.GOOGLE_CLIENT_ID,
          icon: 'https://developers.google.com/identity/images/g-logo.png'
        },
        {
          name: 'microsoft',
          displayName: 'Microsoft',
          enabled: !!process.env.MICROSOFT_CLIENT_ID,
          icon: 'https://docs.microsoft.com/en-us/azure/active-directory/develop/media/howto-add-branding-in-azure-ad-apps/ms-symbollockup_mssymbol_19.png'
        },
        {
          name: 'linkedin',
          displayName: 'LinkedIn',
          enabled: !!process.env.LINKEDIN_CLIENT_ID,
          icon: 'https://content.linkedin.com/content/dam/me/business/en-us/amp/brand-site/v2/bg/LI-Bug.svg.original.svg'
        },
        {
          name: 'saml',
          displayName: 'SAML',
          enabled: !!process.env.SAML_ENABLED,
          icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/SAML_logo.svg/1200px-SAML_logo.svg.png'
        }
      ];

      res.success({
        providers: providers.filter(p => p.enabled)
      });

    } catch (error) {
      this.logger.error('Get providers error:', error);
      throw error;
    }
  }

  async initiateGoogleAuth(req: Request, res: Response): Promise<void> {
    try {
      const { redirect_uri } = req.query;
      
      if (!process.env.GOOGLE_CLIENT_ID) {
        throw new ValidationError('Google SSO not configured');
      }

      const state = uuidv4();
      const scope = 'openid profile email';
      
      // Store state in session or cache for verification
      // For now, we'll just include it in the URL
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;

      if (redirect_uri) {
        // Store original redirect URI for later use
        // In production, this should be stored in a secure session store
      }

      res.redirect(authUrl);

    } catch (error) {
      this.logger.error('Google auth initiation error:', error);
      throw error;
    }
  }

  async handleGoogleCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        throw new ValidationError('Missing authorization code or state');
      }

      // Exchange code for access token
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI
      });

      const { access_token } = tokenResponse.data;

      // Get user info from Google
      const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });

      const googleUser = userResponse.data;
      
      // Find or create user
      const user = await this.findOrCreateSSOUser({
        email: googleUser.email,
        firstName: googleUser.given_name,
        lastName: googleUser.family_name,
        avatar: googleUser.picture,
        provider: 'google',
        providerId: googleUser.id
      });

      // Generate JWT tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Update user login info
      await User.findByIdAndUpdate(user._id, {
        lastLoginAt: new Date(),
        refreshToken,
        $inc: { loginCount: 1 }
      });

      // Track SSO login
      await this.analyticsService.track('sso_login_success', {
        userId: user._id.toString(),
        email: user.email,
        provider: 'google',
        ip: req.ip
      });

      res.success({
        accessToken,
        refreshToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyVerified: user.companyVerified,
          onboardingStep: user.onboardingStep,
          isEmailVerified: user.isEmailVerified
        },
        expiresIn: '24h'
      });

    } catch (error) {
      this.logger.error('Google callback error:', error);
      
      await this.analyticsService.track('sso_login_failure', {
        provider: 'google',
        error: error.message,
        ip: req.ip
      });
      
      throw error;
    }
  }

  async initiateMicrosoftAuth(req: Request, res: Response): Promise<void> {
    try {
      const { redirect_uri } = req.query;
      
      if (!process.env.MICROSOFT_CLIENT_ID) {
        throw new ValidationError('Microsoft SSO not configured');
      }

      const state = uuidv4();
      const scope = 'openid profile email';
      
      const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${process.env.MICROSOFT_CLIENT_ID}&` +
        `redirect_uri=${process.env.MICROSOFT_REDIRECT_URI}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;

      res.redirect(authUrl);

    } catch (error) {
      this.logger.error('Microsoft auth initiation error:', error);
      throw error;
    }
  }

  async handleMicrosoftCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        throw new ValidationError('Missing authorization code or state');
      }

      // Exchange code for access token
      const tokenResponse = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.MICROSOFT_REDIRECT_URI
      });

      const { access_token } = tokenResponse.data;

      // Get user info from Microsoft Graph
      const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });

      const microsoftUser = userResponse.data;
      
      // Find or create user
      const user = await this.findOrCreateSSOUser({
        email: microsoftUser.mail || microsoftUser.userPrincipalName,
        firstName: microsoftUser.givenName,
        lastName: microsoftUser.surname,
        provider: 'microsoft',
        providerId: microsoftUser.id
      });

      // Generate JWT tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Update user login info
      await User.findByIdAndUpdate(user._id, {
        lastLoginAt: new Date(),
        refreshToken,
        $inc: { loginCount: 1 }
      });

      // Track SSO login
      await this.analyticsService.track('sso_login_success', {
        userId: user._id.toString(),
        email: user.email,
        provider: 'microsoft',
        ip: req.ip
      });

      res.success({
        accessToken,
        refreshToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyVerified: user.companyVerified,
          onboardingStep: user.onboardingStep,
          isEmailVerified: user.isEmailVerified
        },
        expiresIn: '24h'
      });

    } catch (error) {
      this.logger.error('Microsoft callback error:', error);
      
      await this.analyticsService.track('sso_login_failure', {
        provider: 'microsoft',
        error: error.message,
        ip: req.ip
      });
      
      throw error;
    }
  }

  async initiateLinkedInAuth(req: Request, res: Response): Promise<void> {
    try {
      const { redirect_uri } = req.query;
      
      if (!process.env.LINKEDIN_CLIENT_ID) {
        throw new ValidationError('LinkedIn SSO not configured');
      }

      const state = uuidv4();
      const scope = 'r_liteprofile r_emailaddress';
      
      const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
        `client_id=${process.env.LINKEDIN_CLIENT_ID}&` +
        `redirect_uri=${process.env.LINKEDIN_REDIRECT_URI}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;

      res.redirect(authUrl);

    } catch (error) {
      this.logger.error('LinkedIn auth initiation error:', error);
      throw error;
    }
  }

  async handleLinkedInCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        throw new ValidationError('Missing authorization code or state');
      }

      // Exchange code for access token
      const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', {
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI
      });

      const { access_token } = tokenResponse.data;

      // Get user profile
      const profileResponse = await axios.get('https://api.linkedin.com/v2/people/~:(id,firstName,lastName,profilePicture(displayImage~:playableStreams))', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });

      // Get user email
      const emailResponse = await axios.get('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });

      const linkedInUser = profileResponse.data;
      const email = emailResponse.data.elements[0]['handle~'].emailAddress;
      
      // Find or create user
      const user = await this.findOrCreateSSOUser({
        email,
        firstName: linkedInUser.firstName.localized.en_US,
        lastName: linkedInUser.lastName.localized.en_US,
        provider: 'linkedin',
        providerId: linkedInUser.id
      });

      // Generate JWT tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Update user login info
      await User.findByIdAndUpdate(user._id, {
        lastLoginAt: new Date(),
        refreshToken,
        $inc: { loginCount: 1 }
      });

      // Track SSO login
      await this.analyticsService.track('sso_login_success', {
        userId: user._id.toString(),
        email: user.email,
        provider: 'linkedin',
        ip: req.ip
      });

      res.success({
        accessToken,
        refreshToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyVerified: user.companyVerified,
          onboardingStep: user.onboardingStep,
          isEmailVerified: user.isEmailVerified
        },
        expiresIn: '24h'
      });

    } catch (error) {
      this.logger.error('LinkedIn callback error:', error);
      
      await this.analyticsService.track('sso_login_failure', {
        provider: 'linkedin',
        error: error.message,
        ip: req.ip
      });
      
      throw error;
    }
  }

  async getSAMLMetadata(req: Request, res: Response): Promise<void> {
    try {
      if (!process.env.SAML_ENABLED) {
        throw new ValidationError('SAML SSO not configured');
      }

      // Generate SAML metadata XML
      const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${process.env.SAML_ENTITY_ID}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService index="0"
                              isDefault="true"
                              Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                              Location="${process.env.SAML_CALLBACK_URL}" />
  </SPSSODescriptor>
</EntityDescriptor>`;

      res.set('Content-Type', 'application/xml');
      res.send(metadata);

    } catch (error) {
      this.logger.error('SAML metadata error:', error);
      throw error;
    }
  }

  async initiateSAMLLogin(req: Request, res: Response): Promise<void> {
    try {
      const { domain, redirect_uri } = req.body;

      if (!process.env.SAML_ENABLED) {
        throw new ValidationError('SAML SSO not configured');
      }

      // In a real implementation, you would:
      // 1. Look up the SAML configuration for the domain
      // 2. Generate a SAML AuthnRequest
      // 3. Redirect to the IdP

      // For now, we'll return a placeholder response
      res.success({
        message: 'SAML login initiated',
        redirectUrl: `${process.env.SAML_IDP_URL}/sso/saml?domain=${domain}`
      });

    } catch (error) {
      this.logger.error('SAML login initiation error:', error);
      throw error;
    }
  }

  async handleSAMLCallback(req: Request, res: Response): Promise<void> {
    try {
      const { SAMLResponse, RelayState } = req.body;

      if (!SAMLResponse) {
        throw new ValidationError('Missing SAML response');
      }

      // In a real implementation, you would:
      // 1. Validate the SAML response
      // 2. Extract user information
      // 3. Find or create user
      // 4. Generate JWT tokens

      // For now, we'll return a placeholder response
      res.success({
        message: 'SAML authentication successful',
        // In reality, you'd return actual tokens here
        accessToken: 'placeholder_token',
        refreshToken: 'placeholder_refresh_token'
      });

    } catch (error) {
      this.logger.error('SAML callback error:', error);
      throw error;
    }
  }

  private async findOrCreateSSOUser(ssoData: {
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    provider: string;
    providerId: string;
  }): Promise<any> {
    // Try to find existing user by email
    let user = await User.findOne({ email: ssoData.email });

    if (user) {
      // Update user with SSO info if needed
      if (!user.avatar && ssoData.avatar) {
        user.avatar = ssoData.avatar;
      }
      
      // Mark email as verified for SSO users
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        user.emailVerifiedAt = new Date();
        user.onboardingStep = 'company-details';
      }
      
      await user.save();
    } else {
      // Create new user
      user = new User({
        email: ssoData.email,
        firstName: ssoData.firstName,
        lastName: ssoData.lastName,
        avatar: ssoData.avatar,
        password: uuidv4(), // Random password for SSO users
        role: 'buyer', // Default role
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        onboardingStep: 'company-details',
        accountStatus: 'active',
        failedLoginAttempts: 0,
        loginCount: 0
      });
      
      await user.save();
    }

    return user;
  }

  private generateAccessToken(user: any): string {
    return jwt.sign(
      { 
        userId: user._id.toString(),
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
  }

  private generateRefreshToken(user: any): string {
    return jwt.sign(
      { 
        userId: user._id.toString(),
        type: 'refresh' 
      },
      process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
  }
}