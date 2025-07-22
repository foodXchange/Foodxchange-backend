import { Request } from 'express';
import { Document, Model } from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: any;
}

// Socket.IO types
export interface SocketWithUser extends Socket {
  userId?: string;
  user?: any;
  company?: string;
  role?: string;
}

// Model static method extensions
export interface ModelWithSearch<T> extends Model<T> {
  searchByText?: (query: string, options?: any) => Promise<T[]>;
  findWithPagination?: (filter: any, options: any) => Promise<{ docs: T[]; total: number }>;
}

// Service interfaces
export interface IAzureAIService {
  isAvailable: boolean;
  textAnalytics?: any;
  textAnalyticsClient?: any;
  formRecognizer?: any;
  blobServiceClient?: any;
  containerName?: string;
  clients?: Record<string, any>;
  analyzeText?: (text: string) => Promise<any>;
  extractFormData?: (buffer: Buffer) => Promise<any>;
}

// Controller validation schemas
export interface ValidationSchemas {
  userUpdate?: any;
  companyUpdate?: any;
  userChangePassword?: any;
  [key: string]: any;
}

// Room management types
export interface RoomManager {
  rfqRooms: Map<string, Set<string>>;
  leadRooms: Map<string, Set<string>>;
  leadTimers: Map<string, NodeJS.Timeout>;
  agentConnections: Map<string, string>;
  userActivity: Map<string, { lastActivity: Date; status: string }>;
}

// Metrics types
export interface MetricsService {
  register: any;
  collectDefaultMetrics: () => void;
  getMetrics: () => Promise<string>;
  getContentType: () => string;
  incrementCounter: (name: string, labels?: any) => void;
  observeHistogram: (name: string, value: number, labels?: any) => void;
  setGauge: (name: string, value: number, labels?: any) => void;
}

// Two-factor authentication service
export interface TwoFactorAuthService {
  generateSecret: (email: string) => { secret: string; qrCode: string };
  verifyToken: (secret: string, token: string) => boolean;
  getUserById: (userId: string) => Promise<any>;
  updateUser: (userId: string, data: any) => Promise<any>;
}

export interface ValidationRequest {
  productType: string;
  specifications: any;
  targetMarket?: string;
  rfqId?: string;
}

export interface ComplianceValidationResult {
  productId: string;
  rfqId?: string;
  timestamp: Date;
  validationScore: number;
  passed: boolean;
  criticalErrors: string[];
  warnings: string[];
  suggestions: string[];
  certificationsRequired: string[];
  estimatedFixTime: string;
  auditLog: AuditEntry[];
}

export interface AuditEntry {
  timestamp: Date;
  action: string;
  field: string;
  oldValue: any;
  newValue: any;
  userId: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

// Extended Document types
export interface DocumentWithTimestamps extends Document {
  createdAt: Date;
  updatedAt: Date;
}

// Query filter extensions
export interface ExtendedFilter {
  timestamp?: any;
  type?: any;
  requestStatus?: any;
  [key: string]: any;
}

// Controller method types
export interface ProductController {
  getProducts: any;
  getSellerProducts?: any;
  createProduct: any;
  updateProduct: any;
  deleteProduct: any;
  bulkImport?: any;
  bulkUpdateProducts: any;
  [key: string]: any;
}

export interface ProposalController {
  getProposals: any;
  getRelevantRFQs?: any;
  createProposal: any;
  updateProposal: any;
  deleteProposal: any;
  getCompetitorAnalysis: any;
  [key: string]: any;
}

export interface OrderController {
  getOrders: any;
  getSellerOrders?: any;
  createOrder: any;
  updateOrder: any;
  deleteOrder: any;
  getOrderAnalytics: any;
  [key: string]: any;
}

// Socket types
import { Socket } from 'socket.io';