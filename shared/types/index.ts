// Shared TypeScript Types for Frontend-Backend Communication

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
  count?: number;
  pagination?: PaginationInfo;
  requestId?: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  success: false;
  message: string;
  errors: string[];
  statusCode: number;
  requestId: string;
}

// Authentication Types
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  company?: string;
  phone?: string;
}

// User Types
export enum UserRole {
  BUYER = 'buyer',
  SUPPLIER = 'supplier',
  ADMIN = 'admin',
  CONTRACTOR = 'contractor',
  AGENT = 'agent'
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  profile: UserProfile;
  company?: Company;
  preferences: UserPreferences;
  verification: UserVerification;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  bio?: string;
}

export interface UserPreferences {
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  language: string;
  timezone: string;
}

export interface UserVerification {
  email: boolean;
  phone: boolean;
  company: boolean;
}

// Company Types
export interface Company {
  id: string;
  name: string;
  type: 'buyer' | 'supplier';
  businessDetails: BusinessDetails;
  compliance: CompanyCompliance;
  rating?: number;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessDetails {
  registrationNumber?: string;
  vatNumber?: string;
  address: Address;
  website?: string;
  description?: string;
  establishedYear?: number;
  employeeCount?: string;
  annualRevenue?: string;
}

export interface Address {
  street: string;
  city: string;
  state?: string;
  country: string;
  postalCode: string;
}

export interface CompanyCompliance {
  certifications: Certification[];
  licenses: License[];
  insurances: Insurance[];
}

// Product Types
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  brand?: string;
  supplier: string | Company;
  pricing: ProductPricing;
  specifications: ProductSpecifications;
  compliance: ProductCompliance;
  images: string[];
  status: ProductStatus;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  OUT_OF_STOCK = 'out_of_stock',
  DISCONTINUED = 'discontinued'
}

export interface ProductPricing {
  currency: string;
  basePrice: number;
  bulkPricing?: BulkPricing[];
  minimumOrderQuantity?: number;
  unit: string;
}

export interface BulkPricing {
  minQuantity: number;
  maxQuantity?: number;
  price: number;
  discount?: number;
}

export interface ProductSpecifications {
  weight?: string;
  dimensions?: string;
  packagingType?: string;
  shelfLife?: string;
  storageConditions?: string;
  nutritionalInfo?: NutritionalInfo;
  ingredients?: string[];
  allergens?: string[];
}

export interface NutritionalInfo {
  servingSize: string;
  calories: number;
  fat?: number;
  protein?: number;
  carbohydrates?: number;
  sodium?: number;
  [key: string]: any;
}

export interface ProductCompliance {
  certifications: string[];
  kosher?: boolean;
  halal?: boolean;
  organic?: boolean;
  gmofree?: boolean;
  glutenfree?: boolean;
}

// RFQ Types
export interface RFQ {
  id: string;
  buyer: string | User;
  title: string;
  description: string;
  category: string;
  lineItems: RFQLineItem[];
  requirements: RFQRequirements;
  targetPrice?: number;
  currency: string;
  deliveryLocation: Address;
  deliveryDate: Date;
  status: RFQStatus;
  proposals?: Proposal[];
  createdAt: Date;
  updatedAt: Date;
  closingDate: Date;
}

export enum RFQStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  CLOSED = 'closed',
  AWARDED = 'awarded',
  CANCELLED = 'cancelled'
}

export interface RFQLineItem {
  productName: string;
  description?: string;
  quantity: number;
  unit: string;
  specifications?: any;
}

export interface RFQRequirements {
  certifications?: string[];
  packagingRequirements?: string;
  qualityStandards?: string;
  paymentTerms?: string;
  additionalRequirements?: string;
}

// Proposal Types
export interface Proposal {
  id: string;
  rfq: string | RFQ;
  supplier: string | Company;
  lineItems: ProposalLineItem[];
  totalPrice: number;
  currency: string;
  validUntil: Date;
  deliveryTerms: string;
  paymentTerms: string;
  notes?: string;
  attachments?: string[];
  status: ProposalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum ProposalStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn'
}

export interface ProposalLineItem {
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
}

// Order Types
export interface Order {
  id: string;
  orderNumber: string;
  buyer: string | Company;
  supplier: string | Company;
  proposal: string | Proposal;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  shipping: ShippingInfo;
  payment: PaymentInfo;
  timeline: OrderTimeline;
  createdAt: Date;
  updatedAt: Date;
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export interface OrderItem {
  product: string | Product;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  status: string;
}

export interface ShippingInfo {
  method: string;
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  shippingAddress: Address;
  shippingCost?: number;
}

export interface PaymentInfo {
  method: string;
  status: PaymentStatus;
  terms: string;
  dueDate?: Date;
  paidDate?: Date;
  transactionId?: string;
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PARTIAL = 'partial',
  OVERDUE = 'overdue',
  REFUNDED = 'refunded'
}

export interface OrderTimeline {
  ordered: Date;
  confirmed?: Date;
  processed?: Date;
  shipped?: Date;
  delivered?: Date;
  completed?: Date;
}

// Compliance Types
export interface ComplianceValidation {
  id: string;
  entity: 'product' | 'company' | 'document';
  entityId: string;
  validationType: string;
  status: ComplianceStatus;
  results: ComplianceResult[];
  validatedBy?: string;
  validatedAt?: Date;
  expiresAt?: Date;
}

export enum ComplianceStatus {
  PENDING = 'pending',
  VALID = 'valid',
  INVALID = 'invalid',
  EXPIRED = 'expired',
  WARNING = 'warning'
}

export interface ComplianceResult {
  rule: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
  details?: any;
}

// Certificate Types
export interface Certification {
  id: string;
  name: string;
  issuingBody: string;
  certificateNumber: string;
  issueDate: Date;
  expiryDate: Date;
  documentUrl?: string;
  status: 'active' | 'expired' | 'pending';
}

export interface License {
  id: string;
  type: string;
  number: string;
  issuingAuthority: string;
  issueDate: Date;
  expiryDate: Date;
  documentUrl?: string;
}

export interface Insurance {
  id: string;
  type: string;
  provider: string;
  policyNumber: string;
  coverageAmount: number;
  currency: string;
  validFrom: Date;
  validUntil: Date;
  documentUrl?: string;
}

// Sample Request Types
export interface SampleRequest {
  id: string;
  product: string | Product;
  buyer: string | User;
  supplier: string | Company;
  quantity: number;
  purpose: string;
  shippingAddress: Address;
  status: SampleRequestStatus;
  shipping?: ShippingInfo;
  feedback?: SampleFeedback;
  createdAt: Date;
  updatedAt: Date;
}

export enum SampleRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface SampleFeedback {
  rating: number;
  quality: number;
  packaging: number;
  delivery: number;
  comments: string;
  wouldOrder: boolean;
  submittedAt: Date;
}

// Analytics Types
export interface DashboardStats {
  totalProducts: number;
  activeRFQs: number;
  pendingOrders: number;
  totalRevenue: number;
  complianceScore: number;
  newMessages: number;
}

export interface AnalyticsTimeRange {
  start: Date;
  end: Date;
  period: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

// Notification Types
export interface Notification {
  id: string;
  user: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: Date;
}

export enum NotificationType {
  RFQ_NEW = 'rfq_new',
  RFQ_UPDATED = 'rfq_updated',
  PROPOSAL_RECEIVED = 'proposal_received',
  PROPOSAL_ACCEPTED = 'proposal_accepted',
  ORDER_CREATED = 'order_created',
  ORDER_UPDATED = 'order_updated',
  COMPLIANCE_ALERT = 'compliance_alert',
  SYSTEM = 'system'
}

// WebSocket Event Types
export interface WebSocketEvent {
  event: string;
  data: any;
  timestamp: Date;
}

export interface WebSocketMessage {
  type: 'notification' | 'update' | 'alert';
  payload: any;
}

// File Upload Types
export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  url?: string;
  path?: string;
}

// Search and Filter Types
export interface SearchParams {
  query?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

export interface FilterOption {
  label: string;
  value: string;
  count?: number;
}

// AI Service Types
export interface AIAnalysisRequest {
  type: 'product' | 'rfq' | 'document';
  data: any;
  options?: any;
}

export interface AIAnalysisResponse {
  analysis: any;
  confidence: number;
  suggestions?: string[];
  metadata?: any;
}

export interface AIMatchingResult {
  supplierId: string;
  matchScore: number;
  reasons: string[];
  strengths: string[];
  concerns: string[];
}