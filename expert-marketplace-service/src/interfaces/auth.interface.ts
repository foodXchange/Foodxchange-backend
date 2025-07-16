import { Types } from 'mongoose';

export enum UserRole {
  EXPERT = 'expert',
  CLIENT = 'client',
  ADMIN = 'admin',
  AGENT = 'agent'
}

export enum ExpertPermission {
  // Profile Management
  MANAGE_PROFILE = 'manage_profile',
  UPDATE_AVAILABILITY = 'update_availability',
  MANAGE_SERVICES = 'manage_services',
  
  // Collaboration Management
  VIEW_COLLABORATIONS = 'view_collaborations',
  MANAGE_COLLABORATIONS = 'manage_collaborations',
  ACCESS_WORKSPACE = 'access_workspace',
  
  // Communication
  SEND_MESSAGES = 'send_messages',
  MAKE_VIDEO_CALLS = 'make_video_calls',
  SHARE_DOCUMENTS = 'share_documents',
  
  // Financial
  VIEW_EARNINGS = 'view_earnings',
  MANAGE_PAYMENTS = 'manage_payments',
  WITHDRAW_FUNDS = 'withdraw_funds',
  
  // Analytics
  VIEW_ANALYTICS = 'view_analytics',
  EXPORT_DATA = 'export_data',
  
  // Administrative (for verified experts)
  INSTANT_BOOKING = 'instant_booking',
  PRIORITY_SUPPORT = 'priority_support'
}

export interface JWTPayload {
  userId: string;
  expertId?: string;
  agentId?: string;
  role: UserRole;
  permissions: ExpertPermission[];
  verificationStatus: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
  twoFactorCode?: string;
}

export interface ExpertRegistration {
  // Basic Info
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  
  // Professional Info
  headline: string;
  bio: string;
  expertise: string[];
  languages: string[];
  
  // Location
  country: string;
  state?: string;
  city?: string;
  timezone: string;
  
  // Rates
  hourlyRateMin: number;
  hourlyRateMax: number;
  currency: string;
  
  // Documents
  profilePhoto?: string;
  documents: {
    type: string;
    name: string;
    fileData: Buffer;
  }[];
  
  // Legal
  termsAccepted: boolean;
  privacyAccepted: boolean;
  marketingOptIn?: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  trustedDevices: {
    deviceId: string;
    deviceName: string;
    addedAt: Date;
    lastUsed: Date;
  }[];
  loginAlerts: boolean;
  sessionTimeout: number; // minutes
}

export interface LoginAttempt {
  userId?: Types.ObjectId;
  email: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
  timestamp: Date;
  location?: {
    country: string;
    city: string;
  };
}

export interface SessionData {
  sessionId: string;
  userId: Types.ObjectId;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
}