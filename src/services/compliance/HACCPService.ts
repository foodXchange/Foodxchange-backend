import mongoose, { Document, Schema } from 'mongoose';

import { Logger } from '../../core/logging/logger';
import { sendEmail } from '../../utils/email';
import { sendSMS } from '../../utils/sms';
import { getServiceBusService } from '../azure/ServiceBusService';
import { getSignalRService } from '../azure/SignalRService';

const logger = new Logger('HACCPService');

export interface ICriticalControlPoint extends Document {
  name: string;
  description: string;
  type: 'temperature' | 'ph' | 'humidity' | 'time' | 'chemical' | 'biological' | 'physical';
  hazardType: 'biological' | 'chemical' | 'physical';
  location: string;
  orderId?: mongoose.Types.ObjectId;
  productId?: mongoose.Types.ObjectId;
  tenantId: string;

  // Control limits
  criticalLimits: {
    min?: number;
    max?: number;
    target?: number;
    unit: string;
    tolerance?: number;
  };

  // Monitoring
  monitoringFrequency: 'continuous' | 'hourly' | 'daily' | 'per_batch' | 'custom';
  monitoringInterval?: number; // in minutes
  responsiblePerson: mongoose.Types.ObjectId;

  // Status
  status: 'active' | 'inactive' | 'alert' | 'violation';
  isActive: boolean;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: mongoose.Types.ObjectId;
}

export interface ICCPMeasurement extends Document {
  ccpId: mongoose.Types.ObjectId;
  tenantId: string;

  // Measurement data
  value: number;
  unit: string;
  timestamp: Date;

  // Context
  orderId?: mongoose.Types.ObjectId;
  productId?: mongoose.Types.ObjectId;
  batchNumber?: string;
  location: string;

  // Personnel
  recordedBy: mongoose.Types.ObjectId;
  verifiedBy?: mongoose.Types.ObjectId;

  // Status
  status: 'normal' | 'warning' | 'critical' | 'violation';
  isWithinLimits: boolean;
  deviation?: number;

  // Actions
  correctiveAction?: string;
  preventiveAction?: string;
  actionTaken?: boolean;
  actionTakenBy?: mongoose.Types.ObjectId;
  actionTakenAt?: Date;

  // Verification
  isVerified: boolean;
  verifiedAt?: Date;
  verificationNotes?: string;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface IHACCPPlan extends Document {
  name: string;
  description: string;
  version: string;
  tenantId: string;

  // Product/Process info
  productTypes: string[];
  processSteps: string[];

  // Team
  haccp_team: Array<{
    userId: mongoose.Types.ObjectId;
    role: string;
    responsibilities: string[];
  }>;

  // Hazard analysis
  hazardAnalysis: Array<{
    processStep: string;
    hazard: string;
    hazardType: 'biological' | 'chemical' | 'physical';
    likelihood: 'low' | 'medium' | 'high';
    severity: 'low' | 'medium' | 'high';
    riskLevel: 'low' | 'medium' | 'high';
    isCCP: boolean;
    justification: string;
  }>;

  // Critical Control Points
  criticalControlPoints: mongoose.Types.ObjectId[];

  // Verification procedures
  verificationProcedures: Array<{
    procedure: string;
    frequency: string;
    responsiblePerson: mongoose.Types.ObjectId;
    records: string[];
  }>;

  // Record keeping
  recordKeeping: {
    retentionPeriod: number; // in months
    storage: string;
    access: string[];
  };

  // Status
  status: 'draft' | 'active' | 'under_review' | 'expired';
  effectiveDate: Date;
  expirationDate: Date;

  // Approval
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: mongoose.Types.ObjectId;
}

export interface IComplianceAlert extends Document {
  type: 'ccp_violation' | 'temperature_deviation' | 'ph_deviation' | 'time_exceeded' | 'contamination' | 'certification_expired';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  tenantId: string;

  // Context
  ccpId?: mongoose.Types.ObjectId;
  measurementId?: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  productId?: mongoose.Types.ObjectId;

  // Status
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledgedBy?: mongoose.Types.ObjectId;
  acknowledgedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;

  // Actions
  immediateAction?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  rootCause?: string;

  // Escalation
  escalationLevel: number;
  escalatedTo?: mongoose.Types.ObjectId[];
  escalatedAt?: Date;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: mongoose.Types.ObjectId;
}

// Critical Control Point Schema
const criticalControlPointSchema = new Schema<ICriticalControlPoint>({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['temperature', 'ph', 'humidity', 'time', 'chemical', 'biological', 'physical'],
    required: true
  },
  hazardType: {
    type: String,
    enum: ['biological', 'chemical', 'physical'],
    required: true
  },
  location: {
    type: String,
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },

  // Control limits
  criticalLimits: {
    min: Number,
    max: Number,
    target: Number,
    unit: {
      type: String,
      required: true
    },
    tolerance: Number
  },

  // Monitoring
  monitoringFrequency: {
    type: String,
    enum: ['continuous', 'hourly', 'daily', 'per_batch', 'custom'],
    required: true
  },
  monitoringInterval: Number,
  responsiblePerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'alert', 'violation'],
    default: 'active'
  },
  isActive: {
    type: Boolean,
    default: true
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// CCP Measurement Schema
const ccpMeasurementSchema = new Schema<ICCPMeasurement>({
  ccpId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CriticalControlPoint',
    required: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },

  // Measurement data
  value: {
    type: Number,
    required: true
  },
  unit: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },

  // Context
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  batchNumber: String,
  location: {
    type: String,
    required: true
  },

  // Personnel
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Status
  status: {
    type: String,
    enum: ['normal', 'warning', 'critical', 'violation'],
    default: 'normal'
  },
  isWithinLimits: {
    type: Boolean,
    default: true
  },
  deviation: Number,

  // Actions
  correctiveAction: String,
  preventiveAction: String,
  actionTaken: {
    type: Boolean,
    default: false
  },
  actionTakenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  actionTakenAt: Date,

  // Verification
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: Date,
  verificationNotes: String
}, {
  timestamps: true
});

// HACCP Plan Schema
const haccpPlanSchema = new Schema<IHACCPPlan>({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  version: {
    type: String,
    required: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },

  // Product/Process info
  productTypes: [String],
  processSteps: [String],

  // Team
  haccp_team: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      required: true
    },
    responsibilities: [String]
  }],

  // Hazard analysis
  hazardAnalysis: [{
    processStep: String,
    hazard: String,
    hazardType: {
      type: String,
      enum: ['biological', 'chemical', 'physical']
    },
    likelihood: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    isCCP: Boolean,
    justification: String
  }],

  // Critical Control Points
  criticalControlPoints: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CriticalControlPoint'
  }],

  // Verification procedures
  verificationProcedures: [{
    procedure: String,
    frequency: String,
    responsiblePerson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    records: [String]
  }],

  // Record keeping
  recordKeeping: {
    retentionPeriod: {
      type: Number,
      default: 24 // 24 months
    },
    storage: String,
    access: [String]
  },

  // Status
  status: {
    type: String,
    enum: ['draft', 'active', 'under_review', 'expired'],
    default: 'draft'
  },
  effectiveDate: Date,
  expirationDate: Date,

  // Approval
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Compliance Alert Schema
const complianceAlertSchema = new Schema<IComplianceAlert>({
  type: {
    type: String,
    enum: ['ccp_violation', 'temperature_deviation', 'ph_deviation', 'time_exceeded', 'contamination', 'certification_expired'],
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },

  // Context
  ccpId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CriticalControlPoint'
  },
  measurementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CCPMeasurement'
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved', 'dismissed'],
    default: 'active'
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  acknowledgedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: Date,

  // Actions
  immediateAction: String,
  correctiveAction: String,
  preventiveAction: String,
  rootCause: String,

  // Escalation
  escalationLevel: {
    type: Number,
    default: 1
  },
  escalatedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  escalatedAt: Date,

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
criticalControlPointSchema.index({ tenantId: 1, type: 1, location: 1 });
criticalControlPointSchema.index({ tenantId: 1, status: 1 });
criticalControlPointSchema.index({ tenantId: 1, isActive: 1 });

ccpMeasurementSchema.index({ tenantId: 1, ccpId: 1, timestamp: -1 });
ccpMeasurementSchema.index({ tenantId: 1, status: 1 });
ccpMeasurementSchema.index({ tenantId: 1, orderId: 1 });
ccpMeasurementSchema.index({ tenantId: 1, productId: 1 });

haccpPlanSchema.index({ tenantId: 1, status: 1 });
haccpPlanSchema.index({ tenantId: 1, effectiveDate: 1 });

complianceAlertSchema.index({ tenantId: 1, status: 1, severity: 1 });
complianceAlertSchema.index({ tenantId: 1, type: 1 });
complianceAlertSchema.index({ tenantId: 1, createdAt: -1 });

// Models
export const CriticalControlPoint = mongoose.model<ICriticalControlPoint>('CriticalControlPoint', criticalControlPointSchema);
export const CCPMeasurement = mongoose.model<ICCPMeasurement>('CCPMeasurement', ccpMeasurementSchema);
export const HACCPPlan = mongoose.model<IHACCPPlan>('HACCPPlan', haccpPlanSchema);
export const ComplianceAlert = mongoose.model<IComplianceAlert>('ComplianceAlert', complianceAlertSchema);

export class HACCPService {
  private readonly serviceBusService = getServiceBusService();
  private readonly signalRService = getSignalRService();

  /**
   * Create a new Critical Control Point
   */
  async createCCP(ccpData: Partial<ICriticalControlPoint>): Promise<ICriticalControlPoint> {
    try {
      const ccp = new CriticalControlPoint(ccpData);
      await ccp.save();

      // Send notification to responsible person
      await this.sendCCPNotification(ccp, 'created');

      // Send event to service bus
      await this.serviceBusService.sendComplianceEvent('ccp_created', ccp._id.toString(), 'ccp', ccp.tenantId, ccp.createdBy.toString(), {
        name: ccp.name,
        type: ccp.type,
        location: ccp.location
      });

      logger.info('CCP created', { ccpId: ccp._id, name: ccp.name });
      return ccp;
    } catch (error) {
      logger.error('Error creating CCP:', error);
      throw error;
    }
  }

  /**
   * Record a CCP measurement
   */
  async recordMeasurement(measurementData: Partial<ICCPMeasurement>): Promise<ICCPMeasurement> {
    try {
      const measurement = new CCPMeasurement(measurementData);

      // Get CCP details
      const ccp = await CriticalControlPoint.findById(measurement.ccpId);
      if (!ccp) {
        throw new Error('CCP not found');
      }

      // Check if measurement is within critical limits
      const { isWithinLimits, deviation, status } = this.evaluateMeasurement(measurement.value, ccp.criticalLimits);

      measurement.isWithinLimits = isWithinLimits;
      measurement.deviation = deviation;
      measurement.status = status;

      await measurement.save();

      // Handle violations
      if (!isWithinLimits) {
        await this.handleCCPViolation(ccp, measurement);
      }

      // Send real-time update
      await this.signalRService.sendToGroup(`tenant_${measurement.tenantId}`, 'ccp_measurement', {
        ccpId: ccp._id,
        ccpName: ccp.name,
        measurement: measurement.value,
        unit: measurement.unit,
        status: measurement.status,
        location: measurement.location
      });

      // Send event to service bus
      await this.serviceBusService.sendComplianceEvent('ccp_measurement_recorded', measurement._id.toString(), 'measurement', measurement.tenantId, measurement.recordedBy.toString(), {
        ccpId: ccp._id.toString(),
        ccpName: ccp.name,
        value: measurement.value,
        unit: measurement.unit,
        status: measurement.status,
        isWithinLimits: measurement.isWithinLimits,
        deviation: measurement.deviation
      });

      logger.info('CCP measurement recorded', {
        ccpId: ccp._id,
        measurementId: measurement._id,
        value: measurement.value,
        status: measurement.status
      });

      return measurement;
    } catch (error) {
      logger.error('Error recording CCP measurement:', error);
      throw error;
    }
  }

  /**
   * Evaluate measurement against critical limits
   */
  private evaluateMeasurement(value: number, limits: any): { isWithinLimits: boolean; deviation: number; status: string } {
    let isWithinLimits = true;
    let deviation = 0;
    let status = 'normal';

    if (limits.min !== undefined && value < limits.min) {
      isWithinLimits = false;
      deviation = limits.min - value;
      status = 'violation';
    } else if (limits.max !== undefined && value > limits.max) {
      isWithinLimits = false;
      deviation = value - limits.max;
      status = 'violation';
    } else if (limits.target !== undefined && limits.tolerance !== undefined) {
      const lowerWarning = limits.target - limits.tolerance;
      const upperWarning = limits.target + limits.tolerance;

      if (value < lowerWarning || value > upperWarning) {
        status = 'warning';
        deviation = Math.abs(value - limits.target);
      }
    }

    return { isWithinLimits, deviation, status };
  }

  /**
   * Handle CCP violation
   */
  private async handleCCPViolation(ccp: ICriticalControlPoint, measurement: ICCPMeasurement): Promise<void> {
    try {
      // Create compliance alert
      const alert = new ComplianceAlert({
        type: 'ccp_violation',
        severity: this.determineSeverity(measurement.deviation || 0, ccp.criticalLimits),
        title: `CCP Violation: ${ccp.name}`,
        description: `Critical limit exceeded at ${ccp.location}. Value: ${measurement.value} ${measurement.unit}`,
        tenantId: ccp.tenantId,
        ccpId: ccp._id,
        measurementId: measurement._id,
        orderId: measurement.orderId,
        productId: measurement.productId,
        createdBy: measurement.recordedBy
      });

      await alert.save();

      // Update CCP status
      ccp.status = 'violation';
      await ccp.save();

      // Send immediate notifications
      await this.sendViolationNotifications(ccp, measurement, alert);

      // Send compliance alert via SignalR
      await this.signalRService.sendComplianceAlert(
        'ccp_violation',
        alert.severity as any,
        ccp.responsiblePerson.toString(),
        ccp.tenantId,
        {
          ccpId: ccp._id.toString(),
          ccpName: ccp.name,
          location: ccp.location,
          value: measurement.value,
          unit: measurement.unit,
          deviation: measurement.deviation,
          alertId: alert._id.toString()
        }
      );

      // Send event to service bus
      await this.serviceBusService.sendComplianceEvent('ccp_violation', alert._id.toString(), 'alert', ccp.tenantId, measurement.recordedBy.toString(), {
        ccpId: ccp._id.toString(),
        ccpName: ccp.name,
        severity: alert.severity,
        value: measurement.value,
        unit: measurement.unit,
        location: ccp.location,
        deviation: measurement.deviation
      });

      logger.warn('CCP violation detected', {
        ccpId: ccp._id,
        measurementId: measurement._id,
        alertId: alert._id,
        severity: alert.severity
      });
    } catch (error) {
      logger.error('Error handling CCP violation:', error);
      throw error;
    }
  }

  /**
   * Determine severity based on deviation
   */
  private determineSeverity(deviation: number, limits: any): 'low' | 'medium' | 'high' | 'critical' {
    if (!limits.tolerance) return 'high';

    const relativeDev = deviation / limits.tolerance;

    if (relativeDev <= 1) return 'low';
    if (relativeDev <= 2) return 'medium';
    if (relativeDev <= 3) return 'high';
    return 'critical';
  }

  /**
   * Send CCP notifications
   */
  private async sendCCPNotification(ccp: ICriticalControlPoint, action: string): Promise<void> {
    try {
      // Implementation would send notifications to responsible person
      logger.info('CCP notification sent', { ccpId: ccp._id, action });
    } catch (error) {
      logger.error('Error sending CCP notification:', error);
    }
  }

  /**
   * Send violation notifications
   */
  private async sendViolationNotifications(ccp: ICriticalControlPoint, measurement: ICCPMeasurement, alert: IComplianceAlert): Promise<void> {
    try {
      // Implementation would send urgent notifications
      logger.warn('Violation notification sent', {
        ccpId: ccp._id,
        measurementId: measurement._id,
        alertId: alert._id
      });
    } catch (error) {
      logger.error('Error sending violation notification:', error);
    }
  }

  /**
   * Get CCP measurements with filtering
   */
  async getCCPMeasurements(tenantId: string, filters: any = {}): Promise<{
    measurements: ICCPMeasurement[];
    totalCount: number;
  }> {
    try {
      const query = { tenantId, ...filters };
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const skip = (page - 1) * limit;

      const [measurements, totalCount] = await Promise.all([
        CCPMeasurement.find(query)
          .populate('ccpId', 'name type location')
          .populate('recordedBy', 'name email')
          .populate('verifiedBy', 'name email')
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit),
        CCPMeasurement.countDocuments(query)
      ]);

      return { measurements, totalCount };
    } catch (error) {
      logger.error('Error getting CCP measurements:', error);
      throw error;
    }
  }

  /**
   * Get active compliance alerts
   */
  async getComplianceAlerts(tenantId: string, filters: any = {}): Promise<{
    alerts: IComplianceAlert[];
    totalCount: number;
  }> {
    try {
      const query = { tenantId, status: 'active', ...filters };
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const skip = (page - 1) * limit;

      const [alerts, totalCount] = await Promise.all([
        ComplianceAlert.find(query)
          .populate('ccpId', 'name type location')
          .populate('createdBy', 'name email')
          .populate('acknowledgedBy', 'name email')
          .populate('resolvedBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        ComplianceAlert.countDocuments(query)
      ]);

      return { alerts, totalCount };
    } catch (error) {
      logger.error('Error getting compliance alerts:', error);
      throw error;
    }
  }

  /**
   * Acknowledge compliance alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<IComplianceAlert> {
    try {
      const alert = await ComplianceAlert.findById(alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.status = 'acknowledged';
      alert.acknowledgedBy = userId as any;
      alert.acknowledgedAt = new Date();
      await alert.save();

      // Send event to service bus
      await this.serviceBusService.sendComplianceEvent('alert_acknowledged', alertId, 'alert', alert.tenantId, userId, {
        alertType: alert.type,
        severity: alert.severity
      });

      logger.info('Compliance alert acknowledged', { alertId, userId });
      return alert;
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  /**
   * Resolve compliance alert
   */
  async resolveAlert(alertId: string, userId: string, resolution: {
    correctiveAction: string;
    preventiveAction?: string;
    rootCause?: string;
  }): Promise<IComplianceAlert> {
    try {
      const alert = await ComplianceAlert.findById(alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.status = 'resolved';
      alert.resolvedBy = userId as any;
      alert.resolvedAt = new Date();
      alert.correctiveAction = resolution.correctiveAction;
      alert.preventiveAction = resolution.preventiveAction;
      alert.rootCause = resolution.rootCause;
      await alert.save();

      // Send event to service bus
      await this.serviceBusService.sendComplianceEvent('alert_resolved', alertId, 'alert', alert.tenantId, userId, {
        alertType: alert.type,
        severity: alert.severity,
        correctiveAction: resolution.correctiveAction
      });

      logger.info('Compliance alert resolved', { alertId, userId });
      return alert;
    } catch (error) {
      logger.error('Error resolving alert:', error);
      throw error;
    }
  }

  /**
   * Get compliance dashboard data
   */
  async getDashboardData(tenantId: string): Promise<{
    totalCCPs: number;
    activeCCPs: number;
    totalMeasurements: number;
    violationsToday: number;
    activeAlerts: number;
    criticalAlerts: number;
    recentMeasurements: ICCPMeasurement[];
    recentAlerts: IComplianceAlert[];
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalCCPs,
        activeCCPs,
        totalMeasurements,
        violationsToday,
        activeAlerts,
        criticalAlerts,
        recentMeasurements,
        recentAlerts
      ] = await Promise.all([
        CriticalControlPoint.countDocuments({ tenantId }),
        CriticalControlPoint.countDocuments({ tenantId, isActive: true }),
        CCPMeasurement.countDocuments({ tenantId }),
        CCPMeasurement.countDocuments({ tenantId, status: 'violation', createdAt: { $gte: today } }),
        ComplianceAlert.countDocuments({ tenantId, status: 'active' }),
        ComplianceAlert.countDocuments({ tenantId, status: 'active', severity: 'critical' }),
        CCPMeasurement.find({ tenantId })
          .populate('ccpId', 'name type location')
          .populate('recordedBy', 'name')
          .sort({ timestamp: -1 })
          .limit(10),
        ComplianceAlert.find({ tenantId, status: 'active' })
          .populate('ccpId', 'name type location')
          .sort({ createdAt: -1 })
          .limit(10)
      ]);

      return {
        totalCCPs,
        activeCCPs,
        totalMeasurements,
        violationsToday,
        activeAlerts,
        criticalAlerts,
        recentMeasurements,
        recentAlerts
      };
    } catch (error) {
      logger.error('Error getting dashboard data:', error);
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(tenantId: string, startDate: Date, endDate: Date): Promise<{
    period: { start: Date; end: Date };
    totalMeasurements: number;
    violations: number;
    complianceRate: number;
    ccpPerformance: Array<{
      ccpId: string;
      name: string;
      measurements: number;
      violations: number;
      complianceRate: number;
    }>;
    alerts: Array<{
      type: string;
      count: number;
      severity: string;
    }>;
  }> {
    try {
      const dateFilter = {
        tenantId,
        createdAt: { $gte: startDate, $lte: endDate }
      };

      const [
        totalMeasurements,
        violations,
        ccpPerformance,
        alertStats
      ] = await Promise.all([
        CCPMeasurement.countDocuments(dateFilter),
        CCPMeasurement.countDocuments({ ...dateFilter, status: 'violation' }),
        CCPMeasurement.aggregate([
          { $match: dateFilter },
          { $group: {
            _id: '$ccpId',
            measurements: { $sum: 1 },
            violations: { $sum: { $cond: [{ $eq: ['$status', 'violation'] }, 1, 0] } }
          }},
          { $lookup: {
            from: 'criticalcontrolpoints',
            localField: '_id',
            foreignField: '_id',
            as: 'ccp'
          }},
          { $unwind: '$ccp' },
          { $project: {
            ccpId: '$_id',
            name: '$ccp.name',
            measurements: 1,
            violations: 1,
            complianceRate: { $subtract: [100, { $multiply: [{ $divide: ['$violations', '$measurements'] }, 100] }] }
          }}
        ]),
        ComplianceAlert.aggregate([
          { $match: dateFilter },
          { $group: {
            _id: { type: '$type', severity: '$severity' },
            count: { $sum: 1 }
          }},
          { $project: {
            type: '$_id.type',
            severity: '$_id.severity',
            count: 1,
            _id: 0
          }}
        ])
      ]);

      const complianceRate = totalMeasurements > 0 ? ((totalMeasurements - violations) / totalMeasurements) * 100 : 100;

      return {
        period: { start: startDate, end: endDate },
        totalMeasurements,
        violations,
        complianceRate,
        ccpPerformance,
        alerts: alertStats
      };
    } catch (error) {
      logger.error('Error generating compliance report:', error);
      throw error;
    }
  }
}

// Singleton instance
let haccpService: HACCPService;

export const getHACCPService = (): HACCPService => {
  if (!haccpService) {
    haccpService = new HACCPService();
  }
  return haccpService;
};

export default getHACCPService();
