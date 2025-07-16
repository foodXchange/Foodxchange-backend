import { Document, Types } from 'mongoose';

export enum AgentStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated'
}

export enum AgentTier {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum'
}

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  NEGOTIATING = 'negotiating',
  PROPOSAL_SENT = 'proposal_sent',
  WON = 'won',
  LOST = 'lost',
  DORMANT = 'dormant'
}

export enum LeadType {
  BUYER = 'buyer',
  SUPPLIER = 'supplier',
  BOTH = 'both'
}

export enum LeadSource {
  REFERRAL = 'referral',
  COLD_OUTREACH = 'cold_outreach',
  EVENT = 'event',
  WEBSITE = 'website',
  SOCIAL_MEDIA = 'social_media',
  EXISTING_NETWORK = 'existing_network'
}

export enum CommissionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  PAID = 'paid',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled'
}

export enum CommissionType {
  TRANSACTION = 'transaction',
  SUBSCRIPTION = 'subscription',
  BONUS = 'bonus',
  REFERRAL = 'referral'
}

export interface IAgentProfile extends Document {
  userId: Types.ObjectId;
  agentCode: string; // Unique agent identifier
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  whatsappNumber: string;
  profilePhoto?: string;
  
  // Location & Coverage
  location: {
    country: string;
    state?: string;
    city?: string;
    address?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  coverageAreas: string[]; // Geographic areas they cover
  
  // Professional Info
  experienceYears: number;
  industryExperience: string[];
  languages: string[];
  productCategories: string[]; // Food categories they specialize in
  
  // Status & Performance
  status: AgentStatus;
  tier: AgentTier;
  tierPoints: number;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  verificationDate?: Date;
  
  // Business Info
  hasBusinessRegistration: boolean;
  businessName?: string;
  businessRegistrationNumber?: string;
  taxId?: string;
  
  // Network & Connections
  existingSupplierConnections: number;
  existingBuyerConnections: number;
  networkDescription?: string;
  
  // Performance Metrics
  totalLeads: number;
  convertedLeads: number;
  conversionRate: number;
  totalCommissionsEarned: number;
  totalTransactionValue: number;
  averageTransactionSize: number;
  
  // Activity
  lastActiveAt: Date;
  joinedAt: Date;
  isOnline: boolean;
  
  // Settings
  notificationPreferences: {
    whatsapp: boolean;
    email: boolean;
    sms: boolean;
    pushNotifications: boolean;
  };
  autoAssignLeads: boolean;
  maxLeadsPerDay: number;
  
  // Verification Documents
  documents: {
    type: string;
    name: string;
    url: string;
    verified: boolean;
    uploadedAt: Date;
  }[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ILead extends Document {
  leadId: string; // Unique lead identifier
  agentId: Types.ObjectId;
  assignedBy?: Types.ObjectId; // Manager who assigned
  
  // Company Information
  companyName: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone: string;
  whatsappNumber?: string;
  
  // Business Details
  leadType: LeadType;
  productCategories: string[];
  estimatedTransactionVolume?: number;
  estimatedTransactionValue?: number;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  
  // Location
  location: {
    country: string;
    state?: string;
    city?: string;
  };
  
  // Lead Management
  status: LeadStatus;
  source: LeadSource;
  sourceDetails?: string;
  priority: number; // 1-5 scale
  temperature: 'cold' | 'warm' | 'hot';
  
  // Timeline
  lastContactDate?: Date;
  nextFollowUpDate?: Date;
  expectedCloseDate?: Date;
  actualCloseDate?: Date;
  
  // Interactions
  interactionCount: number;
  lastInteractionType?: 'whatsapp' | 'phone' | 'email' | 'meeting';
  
  // Conversion
  convertedToRFQ?: Types.ObjectId;
  convertedToOrder?: Types.ObjectId;
  finalTransactionValue?: number;
  
  // Notes & History
  notes: string;
  interactionHistory: {
    date: Date;
    type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'note';
    description: string;
    outcome?: string;
    nextAction?: string;
  }[];
  
  // Assignment
  assignedAt: Date;
  assignmentReason?: string;
  reassignmentHistory: {
    fromAgent: Types.ObjectId;
    toAgent: Types.ObjectId;
    reason: string;
    date: Date;
  }[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IAgentCommission extends Document {
  commissionId: string;
  agentId: Types.ObjectId;
  leadId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  rfqId?: Types.ObjectId;
  
  // Commission Details
  type: CommissionType;
  baseAmount: number;
  commissionRate: number;
  commissionAmount: number;
  bonusAmount?: number;
  totalAmount: number;
  currency: string;
  
  // Status & Processing
  status: CommissionStatus;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  paidAt?: Date;
  
  // Transaction Details
  transactionValue: number;
  transactionDate: Date;
  
  // Tier Multipliers
  tierMultiplier: number;
  performanceBonus?: number;
  
  // Payment Info
  paymentMethod?: 'bank_transfer' | 'digital_wallet' | 'check';
  paymentReference?: string;
  paymentNotes?: string;
  
  // Dispute Management
  disputeReason?: string;
  disputeDate?: Date;
  disputeResolution?: string;
  
  // Metadata
  metadata: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IAgentTerritory extends Document {
  territoryId: string;
  name: string;
  description?: string;
  
  // Geographic Definition
  countries: string[];
  states?: string[];
  cities?: string[];
  postalCodes?: string[];
  
  // Product Categories
  productCategories?: string[];
  
  // Assigned Agents
  primaryAgent?: Types.ObjectId;
  secondaryAgents: Types.ObjectId[];
  
  // Performance Metrics
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
  
  // Status
  isActive: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IWhatsAppMessage extends Document {
  messageId: string;
  agentId: Types.ObjectId;
  leadId?: Types.ObjectId;
  
  // Message Details
  to: string;
  from: string;
  messageType: 'text' | 'image' | 'document' | 'template' | 'interactive';
  content: string;
  templateName?: string;
  
  // Status
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  deliveredAt?: Date;
  readAt?: Date;
  failureReason?: string;
  
  // Campaign
  campaignId?: string;
  isAutomated: boolean;
  
  // Metadata
  metadata: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IAgentAnalytics extends Document {
  agentId: Types.ObjectId;
  date: Date; // Daily analytics
  
  // Lead Metrics
  newLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  lostLeads: number;
  
  // Activity Metrics
  whatsappMessagesSent: number;
  phoneCallsMade: number;
  emailsSent: number;
  meetingsHeld: number;
  
  // Performance Metrics
  conversionRate: number;
  averageLeadValue: number;
  timeToFirstContact: number; // hours
  averageResponseTime: number; // hours
  
  // Revenue Metrics
  commissionsEarned: number;
  transactionValue: number;
  
  // Tier Progress
  tierPointsEarned: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentRegistration {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  whatsappNumber: string;
  
  // Location
  country: string;
  state?: string;
  city?: string;
  
  // Experience
  experienceYears: number;
  industryExperience: string[];
  productCategories: string[];
  languages: string[];
  
  // Business
  hasBusinessRegistration: boolean;
  businessName?: string;
  
  // Network
  existingSupplierConnections: number;
  existingBuyerConnections: number;
  networkDescription?: string;
  
  // Legal
  termsAccepted: boolean;
  commissionAgreementAccepted: boolean;
}

export interface LeadCreation {
  companyName: string;
  contactPerson: string;
  contactPhone: string;
  whatsappNumber?: string;
  contactEmail?: string;
  
  leadType: LeadType;
  productCategories: string[];
  estimatedTransactionVolume?: number;
  estimatedTransactionValue?: number;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  
  source: LeadSource;
  sourceDetails?: string;
  
  location: {
    country: string;
    state?: string;
    city?: string;
  };
  
  notes?: string;
}

export interface WhatsAppTemplate {
  name: string;
  category: 'marketing' | 'utility' | 'authentication';
  language: string;
  components: {
    type: 'header' | 'body' | 'footer' | 'buttons';
    text?: string;
    parameters?: string[];
  }[];
}

export interface CommissionRule {
  id: string;
  name: string;
  description: string;
  
  // Conditions
  minTransactionValue?: number;
  maxTransactionValue?: number;
  productCategories?: string[];
  leadSources?: LeadSource[];
  agentTiers?: AgentTier[];
  
  // Commission Structure
  baseRate: number; // percentage
  tierMultipliers: {
    [key in AgentTier]: number;
  };
  
  // Bonuses
  volumeBonus?: {
    threshold: number;
    bonus: number;
  }[];
  
  isActive: boolean;
}