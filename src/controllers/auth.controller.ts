import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { User } from '../models/User';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '15m'; // Short-lived access token
const REFRESH_TOKEN_EXPIRE = process.env.REFRESH_TOKEN_EXPIRE || '7d';

// Generate JWT Token
const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
};

// Generate Refresh Token
const generateRefreshToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate Token Pair
const generateTokenPair = async (userId: string) => {
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken();
  
  // Store refresh token in database
  await User.findByIdAndUpdate(userId, {
    refreshToken,
    $inc: { loginCount: 1 },
    lastLoginAt: new Date()
  });
  
  return { accessToken, refreshToken };
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, company, role } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      company,
      role: role || 'buyer'
    });

    // Generate token pair
    const tokens = await generateTokenPair(user._id.toString());

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          company: user.company,
          role: user.role
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error creating user'
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password'
      });
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Increment failed login attempts
      user.failedLoginAttempts += 1;
      user.lastFailedLoginAt = new Date();
      
      // Lock account after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        user.accountStatus = 'locked';
        user.accountLockedAt = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
        console.warn('Account locked due to failed login attempts', {
          userId: user._id.toString(),
          email: user.email,
          failedAttempts: user.failedLoginAttempts
        });
      }
      
      await user.save();
      
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if account is locked
    if (user.isAccountLocked()) {
      return res.status(423).json({
        success: false,
        error: 'Account is locked due to multiple failed login attempts. Please contact support.'
      });
    }

    // Reset failed login attempts on successful login
    user.failedLoginAttempts = 0;
    user.lastFailedLoginAt = undefined;
    await user.save();

    // Generate token pair
    const tokens = await generateTokenPair(user._id.toString());

    console.log('User logged in successfully', {
      userId: user._id.toString(),
      email: user.email,
      loginCount: user.loginCount
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          company: user.company,
          role: user.role,
          onboardingStep: user.onboardingStep,
          profileCompletionPercentage: user.profileCompletionPercentage
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error logging in'
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error: any) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching user'
    });
  }
};

// @desc    Update password
// @route   PUT /api/auth/update-password
// @access  Private
export const updatePassword = async (req: any, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get user with password
    const user = await User.findById(req.userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error: any) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error updating password'
    });
  }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }
    
    // Find user by refresh token
    const user = await User.findOne({ refreshToken });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
    
    // Generate new token pair
    const tokens = await generateTokenPair(user._id.toString());
    
    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });
  } catch (error: any) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error refreshing token'
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req: any, res: Response) => {
  try {
    // Clear refresh token from database
    await User.findByIdAndUpdate(req.userId, {
      refreshToken: undefined
    });
    
    console.log('User logged out successfully', {
      userId: req.userId
    });
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error logging out'
    });
  }
};

// @desc    Logout from all devices
// @route   POST /api/auth/logout-all
// @access  Private
export const logoutAll = async (req: any, res: Response) => {
  try {
    // Clear refresh token and increment a token version to invalidate all tokens
    await User.findByIdAndUpdate(req.userId, {
      refreshToken: undefined,
      $inc: { loginCount: 1 } // This effectively invalidates all existing tokens
    });
    
    console.log('User logged out from all devices', {
      userId: req.userId
    });
    
    res.json({
      success: true,
      message: 'Logged out from all devices successfully'
    });
  } catch (error: any) {
    console.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error logging out from all devices'
    });
  }
};