import request from 'supertest';
import { Express } from 'express';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { clearDatabase, createTestUser, createTestCompany } from '../setup';
import bcrypt from 'bcryptjs';

// Mock the app - in a real scenario, you'd import your actual app
const mockApp = {} as Express;

describe('Authentication Integration Tests', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe('POST /api/v1/auth/signup', () => {
    const signupData = {
      email: 'newuser@example.com',
      password: 'StrongPass123!',
      firstName: 'John',
      lastName: 'Doe',
      role: 'buyer',
      company: 'Test Company',
      businessType: 'restaurant',
      phone: '+1234567890',
      acceptTerms: true
    };

    it('should register a new user successfully', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/signup')
        .send(signupData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'User registered successfully. Please check your email for verification.',
          user: {
            email: 'newuser@example.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'buyer',
            onboardingStep: 'email-verification',
            isEmailVerified: false
          }
        }
      });

      // Verify user was created in database
      const user = await User.findOne({ email: 'newuser@example.com' });
      expect(user).toBeTruthy();
      expect(user?.firstName).toBe('John');
      expect(user?.lastName).toBe('Doe');
      expect(user?.role).toBe('buyer');
      expect(user?.isEmailVerified).toBe(false);
      expect(user?.onboardingStep).toBe('email-verification');

      // Verify company was created
      const company = await Company.findOne({ name: 'Test Company' });
      expect(company).toBeTruthy();
      expect(company?.businessType).toBe('restaurant');
      expect(company?.verificationStatus).toBe('pending');
    });

    it('should reject duplicate email registration', async () => {
      // Create user first
      const existingUser = createTestUser({ email: 'newuser@example.com' });
      await new User(existingUser).save();

      const response = await request(mockApp)
        .post('/api/v1/auth/signup')
        .send(signupData)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Email already exists'
        }
      });
    });

    it('should validate required fields', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: '123',
        firstName: '',
        lastName: '',
        acceptTerms: false
      };

      const response = await request(mockApp)
        .post('/api/v1/auth/signup')
        .send(invalidData)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: {
            fields: expect.arrayContaining([
              expect.objectContaining({
                field: 'email',
                message: expect.stringContaining('valid email')
              }),
              expect.objectContaining({
                field: 'password',
                message: expect.stringContaining('8 characters')
              }),
              expect.objectContaining({
                field: 'acceptTerms',
                message: expect.stringContaining('terms')
              })
            ])
          }
        }
      });
    });

    it('should enforce password strength requirements', async () => {
      const weakPasswords = [
        'password123',      // Common password
        'nouppercase123!',  // No uppercase
        'NOLOWERCASE123!',  // No lowercase
        'NoNumbers!',       // No numbers
        'NoSpecialChars123' // No special characters
      ];

      for (const password of weakPasswords) {
        const response = await request(mockApp)
          .post('/api/v1/auth/signup')
          .send({ ...signupData, password })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let testUser: any;

    beforeEach(async () => {
      // Create test user
      const hashedPassword = await bcrypt.hash('StrongPass123!', 12);
      testUser = createTestUser({
        email: 'test@example.com',
        password: hashedPassword,
        isEmailVerified: true,
        accountStatus: 'active'
      });
      await new User(testUser).save();
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'StrongPass123!',
          rememberMe: false
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          user: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'buyer'
          },
          expiresIn: '24h'
        }
      });

      expect(response.body.data.accessToken).toBeValidJWT();
      expect(response.body.data.refreshToken).toBeValidJWT();
    });

    it('should reject invalid credentials', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid credentials'
        }
      });
    });

    it('should reject login for non-existent user', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'StrongPass123!'
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid credentials'
        }
      });
    });

    it('should reject login for locked account', async () => {
      // Update user to locked status
      await User.findByIdAndUpdate(testUser._id, { accountStatus: 'locked' });

      const response = await request(mockApp)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'StrongPass123!'
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Account is locked. Please contact support.'
        }
      });
    });

    it('should handle remember me option', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'StrongPass123!',
          rememberMe: true
        })
        .expect(200);

      expect(response.body.data.expiresIn).toBe('7d');
    });

    it('should track failed login attempts', async () => {
      // Make several failed attempts
      for (let i = 0; i < 3; i++) {
        await request(mockApp)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          })
          .expect(401);
      }

      // Check that failed attempts were recorded
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user?.failedLoginAttempts).toBe(3);
      expect(user?.lastFailedLoginAt).toBeTruthy();
    });

    it('should reset failed attempts on successful login', async () => {
      // Set failed attempts
      await User.findByIdAndUpdate(testUser._id, { 
        failedLoginAttempts: 3,
        lastFailedLoginAt: new Date()
      });

      const response = await request(mockApp)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'StrongPass123!'
        })
        .expect(200);

      // Check that failed attempts were reset
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user?.failedLoginAttempts).toBe(0);
      expect(user?.lastFailedLoginAt).toBeFalsy();
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let testUser: any;
    let refreshToken: string;

    beforeEach(async () => {
      // Create test user with refresh token
      testUser = createTestUser({ isEmailVerified: true });
      refreshToken = 'valid-refresh-token';
      testUser.refreshToken = refreshToken;
      await new User(testUser).save();
    });

    it('should refresh token successfully', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          accessToken: expect.any(String),
          expiresIn: '24h'
        }
      });

      expect(response.body.data.accessToken).toBeValidJWT();
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid refresh token'
        }
      });
    });

    it('should reject missing refresh token', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Refresh token required'
        }
      });
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let testUser: any;
    let authToken: string;

    beforeEach(async () => {
      testUser = createTestUser({ 
        isEmailVerified: true,
        refreshToken: 'refresh-token-123'
      });
      await new User(testUser).save();
      authToken = 'Bearer valid-jwt-token';
    });

    it('should logout successfully', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/logout')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Logout successful'
        }
      });

      // Verify refresh token was cleared
      const user = await User.findById(testUser._id);
      expect(user?.refreshToken).toBeFalsy();
    });

    it('should handle logout without authentication', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Logout successful'
        }
      });
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = createTestUser({ 
        isEmailVerified: false,
        onboardingStep: 'email-verification'
      });
      await new User(testUser).save();
    });

    it('should verify email successfully', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'valid-verification-token' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Email verified successfully'
        }
      });

      // Verify user was updated
      const user = await User.findById(testUser._id);
      expect(user?.isEmailVerified).toBe(true);
      expect(user?.onboardingStep).toBe('company-details');
      expect(user?.emailVerifiedAt).toBeTruthy();
    });

    it('should handle already verified email', async () => {
      // Mark email as already verified
      await User.findByIdAndUpdate(testUser._id, { isEmailVerified: true });

      const response = await request(mockApp)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'valid-verification-token' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Email already verified'
        }
      });
    });

    it('should reject invalid verification token', async () => {
      const response = await request(mockApp)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'invalid-token' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid or expired verification token'
        }
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on login attempts', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      // Make requests up to the limit
      for (let i = 0; i < 5; i++) {
        await request(mockApp)
          .post('/api/v1/auth/login')
          .send(loginData)
          .expect(401);
      }

      // Next request should be rate limited
      const response = await request(mockApp)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(429);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many authentication attempts. Please try again later.'
        }
      });
    });
  });
});