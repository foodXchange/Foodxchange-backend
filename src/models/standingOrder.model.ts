import { Schema, model, Document, Types } from 'mongoose';

export enum StandingOrderStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed'
}

export enum RecurrencePattern {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  CUSTOM = 'custom'
}

export enum DayOfWeek {
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
  SUNDAY = 0
}

export interface IMLAlgorithmParameters {
  // Demand forecasting
  enableDemandForecasting: boolean;
  forecastingModel: 'arima' | 'prophet' | 'lstm' | 'ensemble';
  seasonalityDetection: boolean;
  trendAnalysis: boolean;

  // Quantity optimization
  enableQuantityOptimization: boolean;
  safetyStockMultiplier: number;
  leadTimeDays: number;
  serviceLevel: number; // Target service level (e.g., 95%)

  // Price optimization
  enablePriceOptimization: boolean;
  priceElasticity: number;
  competitorPricing: boolean;

  // Pattern learning
  learningRate: number;
  minDataPoints: number;
  confidenceThreshold: number;

  // Anomaly detection
  enableAnomalyDetection: boolean;
  anomalyThreshold: number;
}

export interface IDeliverySchedule {
  recurrencePattern: RecurrencePattern;

  // For daily
  everyNDays?: number;

  // For weekly
  daysOfWeek?: DayOfWeek[];
  everyNWeeks?: number;

  // For monthly
  dayOfMonth?: number;
  monthlyWeekday?: {
    week: 1 | 2 | 3 | 4 | -1; // -1 for last week
    dayOfWeek: DayOfWeek;
  };
  everyNMonths?: number;

  // For custom
  customCronExpression?: string;

  // Delivery time preferences
  preferredDeliveryTime?: {
    start: string; // HH:mm format
    end: string;
  };

  // Blackout dates
  blackoutDates?: Date[];
  holidayCalendar?: string; // Reference to holiday calendar
}

export interface IOrderTemplate {
  product: Types.ObjectId;
  productName: string;
  sku: string;

  // Quantity configuration
  baseQuantity: number;
  unit: string;
  minQuantity?: number;
  maxQuantity?: number;
  quantityIncrements?: number;

  // ML-driven adjustments
  enableMLAdjustments: boolean;
  historicalAverageQuantity?: number;
  quantityVariance?: number;

  // Pricing
  negotiatedPrice?: number;
  maxPrice?: number;

  // Product-specific requirements
  requiresTemperatureControl?: boolean;
  temperatureRange?: {
    min: number;
    max: number;
    unit: 'C' | 'F';
  };
  shelfLifeRequirement?: number; // Minimum days of shelf life on delivery
}

export interface IOrderHistory {
  orderId: string;
  orderDate: Date;
  deliveryDate: Date;
  quantity: number;
  price: number;
  fulfillmentRate: number;
  qualityScore?: number;
  mlPredictedQuantity?: number;
  actualVsPredicted?: number;
}

export interface IMLInsights {
  lastUpdated: Date;

  // Demand insights
  predictedNextQuantity?: number;
  demandTrend: 'increasing' | 'stable' | 'decreasing';
  seasonalityPattern?: {
    type: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    peakPeriods: string[];
  };

  // Optimization recommendations
  recommendedQuantity?: number;
  recommendedFrequency?: RecurrencePattern;
  costSavingOpportunity?: number;

  // Performance metrics
  forecastAccuracy?: number;
  orderFulfillmentRate?: number;
  averageQualityScore?: number;

  // Alerts
  alerts?: {
    type: 'stockout_risk' | 'overstock_risk' | 'price_anomaly' | 'quality_issue';
    message: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: Date;
  }[];
}

export interface IStandingOrder extends Document {
  standingOrderId: string;
  buyer: Types.ObjectId;
  buyerName: string;
  supplier: Types.ObjectId;
  supplierName: string;

  // Order configuration
  name: string;
  description?: string;
  status: StandingOrderStatus;
  priority: 'low' | 'medium' | 'high';

  // Schedule
  deliverySchedule: IDeliverySchedule;
  startDate: Date;
  endDate?: Date;
  nextOrderDate?: Date;

  // Order template
  orderTemplate: IOrderTemplate[];

  // ML configuration
  mlEnabled: boolean;
  mlAlgorithmParameters: IMLAlgorithmParameters;
  mlInsights?: IMLInsights;

  // Automation rules
  automationRules: {
    autoApprove: boolean;
    autoApproveTreshold?: number; // Max order value for auto-approval
    requiresReviewIf?: {
      quantityChangePercent?: number;
      priceChangePercent?: number;
      newProduct?: boolean;
    };
    notificationRecipients: string[];
  };

  // Order history
  orderHistory: IOrderHistory[];
  totalOrdersGenerated: number;
  lastOrderDate?: Date;

  // Delivery preferences
  deliveryAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    contactName: string;
    contactPhone: string;
  };
  specialInstructions?: string;

  // Financial
  paymentTerms: string;
  budgetLimit?: {
    amount: number;
    period: 'monthly' | 'quarterly' | 'yearly';
    currentSpend: number;
    resetDate: Date;
  };

  // Compliance
  requiredCertifications?: string[];
  complianceDocuments?: string[];

  // Metadata
  tags?: string[];
  customFields?: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
  createdBy: Types.ObjectId;
  lastModifiedBy: Types.ObjectId;

  // Methods
  calculateNextOrderDate(): Date | null;
}

const MLAlgorithmParametersSchema = new Schema<IMLAlgorithmParameters>({
  enableDemandForecasting: { type: Boolean, default: true },
  forecastingModel: {
    type: String,
    enum: ['arima', 'prophet', 'lstm', 'ensemble'],
    default: 'ensemble'
  },
  seasonalityDetection: { type: Boolean, default: true },
  trendAnalysis: { type: Boolean, default: true },

  enableQuantityOptimization: { type: Boolean, default: true },
  safetyStockMultiplier: { type: Number, default: 1.5 },
  leadTimeDays: { type: Number, default: 3 },
  serviceLevel: { type: Number, default: 95, min: 0, max: 100 },

  enablePriceOptimization: { type: Boolean, default: false },
  priceElasticity: { type: Number, default: 1 },
  competitorPricing: { type: Boolean, default: false },

  learningRate: { type: Number, default: 0.01 },
  minDataPoints: { type: Number, default: 10 },
  confidenceThreshold: { type: Number, default: 0.8 },

  enableAnomalyDetection: { type: Boolean, default: true },
  anomalyThreshold: { type: Number, default: 2.5 }
}, { _id: false });

const DeliveryScheduleSchema = new Schema<IDeliverySchedule>({
  recurrencePattern: {
    type: String,
    enum: Object.values(RecurrencePattern),
    required: true
  },

  everyNDays: Number,

  daysOfWeek: [{ type: Number, enum: Object.values(DayOfWeek) }],
  everyNWeeks: Number,

  dayOfMonth: { type: Number, min: 1, max: 31 },
  monthlyWeekday: {
    week: { type: Number, enum: [1, 2, 3, 4, -1] },
    dayOfWeek: { type: Number, enum: Object.values(DayOfWeek) }
  },
  everyNMonths: Number,

  customCronExpression: String,

  preferredDeliveryTime: {
    start: String,
    end: String
  },

  blackoutDates: [Date],
  holidayCalendar: String
}, { _id: false });

const OrderTemplateSchema = new Schema<IOrderTemplate>({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: { type: String, required: true },
  sku: { type: String, required: true },

  baseQuantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true },
  minQuantity: { type: Number, min: 0 },
  maxQuantity: { type: Number, min: 0 },
  quantityIncrements: { type: Number, min: 1 },

  enableMLAdjustments: { type: Boolean, default: true },
  historicalAverageQuantity: Number,
  quantityVariance: Number,

  negotiatedPrice: { type: Number, min: 0 },
  maxPrice: { type: Number, min: 0 },

  requiresTemperatureControl: Boolean,
  temperatureRange: {
    min: Number,
    max: Number,
    unit: { type: String, enum: ['C', 'F'] }
  },
  shelfLifeRequirement: Number
}, { _id: false });

const OrderHistorySchema = new Schema<IOrderHistory>({
  orderId: { type: String, required: true },
  orderDate: { type: Date, required: true },
  deliveryDate: { type: Date, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  fulfillmentRate: { type: Number, required: true },
  qualityScore: Number,
  mlPredictedQuantity: Number,
  actualVsPredicted: Number
}, { _id: false });

const StandingOrderSchema = new Schema<IStandingOrder>({
  standingOrderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  buyer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  buyerName: { type: String, required: true },
  supplier: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  supplierName: { type: String, required: true },

  name: { type: String, required: true },
  description: String,
  status: {
    type: String,
    enum: Object.values(StandingOrderStatus),
    default: StandingOrderStatus.ACTIVE,
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },

  deliverySchedule: {
    type: DeliveryScheduleSchema,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: Date,
  nextOrderDate: {
    type: Date,
    index: true
  },

  orderTemplate: {
    type: [OrderTemplateSchema],
    required: true,
    validate: {
      validator(templates: IOrderTemplate[]) {
        return templates.length > 0;
      },
      message: 'Standing order must have at least one product'
    }
  },

  mlEnabled: { type: Boolean, default: true },
  mlAlgorithmParameters: {
    type: MLAlgorithmParametersSchema,
    default: () => ({})
  },
  mlInsights: {
    lastUpdated: Date,
    predictedNextQuantity: Number,
    demandTrend: { type: String, enum: ['increasing', 'stable', 'decreasing'] },
    seasonalityPattern: {
      type: { type: String, enum: ['weekly', 'monthly', 'quarterly', 'yearly'] },
      peakPeriods: [String]
    },
    recommendedQuantity: Number,
    recommendedFrequency: { type: String, enum: Object.values(RecurrencePattern) },
    costSavingOpportunity: Number,
    forecastAccuracy: Number,
    orderFulfillmentRate: Number,
    averageQualityScore: Number,
    alerts: [{
      type: {
        type: String,
        enum: ['stockout_risk', 'overstock_risk', 'price_anomaly', 'quality_issue']
      },
      message: String,
      severity: { type: String, enum: ['low', 'medium', 'high'] },
      timestamp: Date
    }]
  },

  automationRules: {
    autoApprove: { type: Boolean, default: false },
    autoApproveTreshold: Number,
    requiresReviewIf: {
      quantityChangePercent: Number,
      priceChangePercent: Number,
      newProduct: Boolean
    },
    notificationRecipients: [String]
  },

  orderHistory: [OrderHistorySchema],
  totalOrdersGenerated: { type: Number, default: 0 },
  lastOrderDate: Date,

  deliveryAddress: {
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true }
  },
  specialInstructions: String,

  paymentTerms: { type: String, required: true },
  budgetLimit: {
    amount: { type: Number, min: 0 },
    period: { type: String, enum: ['monthly', 'quarterly', 'yearly'] },
    currentSpend: { type: Number, default: 0 },
    resetDate: Date
  },

  requiredCertifications: [String],
  complianceDocuments: [String],

  tags: [String],
  customFields: {
    type: Map,
    of: Schema.Types.Mixed
  },

  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  collection: 'standingOrders'
});

// Indexes
StandingOrderSchema.index({ status: 1, nextOrderDate: 1 });
StandingOrderSchema.index({ buyer: 1, status: 1 });
StandingOrderSchema.index({ supplier: 1, status: 1 });
StandingOrderSchema.index({ tags: 1 });

// Methods
StandingOrderSchema.methods.calculateNextOrderDate = function(): Date | null {
  if (this.status !== StandingOrderStatus.ACTIVE) {
    return null;
  }

  const schedule = this.deliverySchedule;
  const baseDate = this.lastOrderDate || this.startDate;
  const nextDate = new Date(baseDate);

  switch (schedule.recurrencePattern) {
    case RecurrencePattern.DAILY:
      nextDate.setDate(nextDate.getDate() + (schedule.everyNDays || 1));
      break;

    case RecurrencePattern.WEEKLY:
      // Implementation for weekly pattern
      nextDate.setDate(nextDate.getDate() + 7 * (schedule.everyNWeeks || 1));
      break;

    case RecurrencePattern.MONTHLY:
      nextDate.setMonth(nextDate.getMonth() + (schedule.everyNMonths || 1));
      if (schedule.dayOfMonth) {
        nextDate.setDate(schedule.dayOfMonth);
      }
      break;

    case RecurrencePattern.QUARTERLY:
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
  }

  // Check blackout dates
  if (schedule.blackoutDates) {
    while (schedule.blackoutDates.some(date =>
      date.toDateString() === nextDate.toDateString()
    )) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
  }

  // Check if past end date
  if (this.endDate && nextDate > this.endDate) {
    return null;
  }

  return nextDate;
};

StandingOrderSchema.methods.generateOrder = async function(userId: Types.ObjectId) {
  // This method would create an actual order based on the template
  // Implementation would involve creating an Order document

  const orderData = {
    buyer: this.buyer,
    supplier: this.supplier,
    lineItems: this.orderTemplate.map(template => ({
      product: template.product,
      productName: template.productName,
      sku: template.sku,
      quantity: this.mlEnabled && this.mlInsights?.recommendedQuantity
        ? this.mlInsights.recommendedQuantity
        : template.baseQuantity,
      unit: template.unit,
      unitPrice: template.negotiatedPrice || 0,
      requiresTemperatureControl: template.requiresTemperatureControl
    })),
    deliveryAddress: this.deliveryAddress,
    paymentTerms: this.paymentTerms,
    specialInstructions: this.specialInstructions,
    standingOrderReference: this._id
  };

  // Record in history
  this.totalOrdersGenerated += 1;
  this.lastOrderDate = new Date();
  this.nextOrderDate = this.calculateNextOrderDate();

  return this.save();
};

StandingOrderSchema.methods.updateMLInsights = function(insights: Partial<IMLInsights>) {
  this.mlInsights = {
    ...this.mlInsights,
    ...insights,
    lastUpdated: new Date()
  };
  return this.save();
};

// Pre-save middleware
StandingOrderSchema.pre('save', function(next) {
  // Generate ID if not present
  if (!this.standingOrderId && this.isNew) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    this.standingOrderId = `STO-${year}${month}-${random}`;
  }

  // Calculate next order date if not set
  if (!this.nextOrderDate && this.status === StandingOrderStatus.ACTIVE) {
    this.nextOrderDate = this.calculateNextOrderDate();
  }

  // Check budget limits
  if (this.budgetLimit && this.budgetLimit.currentSpend >= this.budgetLimit.amount) {
    this.status = StandingOrderStatus.PAUSED;
  }

  next();
});

export const StandingOrder = model<IStandingOrder>('StandingOrder', StandingOrderSchema);
