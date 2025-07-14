import { Request } from 'express';
import { Document } from 'mongoose';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: any;
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