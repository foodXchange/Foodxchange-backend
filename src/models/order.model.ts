import { Schema, model, Document, Types } from 'mongoose';

export enum OrderStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  PARTIALLY_SHIPPED = 'partially_shipped',
  SHIPPED = 'shipped',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export enum LineItemStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  ALLOCATED = 'allocated',
  PICKED = 'picked',
  PACKED = 'packed',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned'
}

export enum ShipmentStatus {
  PREPARING = 'preparing',
  DISPATCHED = 'dispatched',
  IN_TRANSIT = 'in_transit',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  RETURNED = 'returned'
}

export interface ITemperatureReading {
  temperature: number;
  unit: 'C' | 'F';
  timestamp: Date;
  location?: string;
  deviceId?: string;
}

export interface ILineItem {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  productName: string;
  sku: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;

  // Line-level tracking
  status: LineItemStatus;
  allocatedQuantity: number;
  shippedQuantity: number;
  deliveredQuantity: number;
  returnedQuantity: number;

  // Temperature monitoring
  requiresTemperatureControl?: boolean;
  temperatureRange?: {
    min: number;
    max: number;
    unit: 'C' | 'F';
  };

  // Batch tracking
  batchNumber?: string;
  expiryDate?: Date;
  productionDate?: Date;

  // Warehouse info
  warehouseLocation?: string;
  pickingInstructions?: string;

  // Timeline
  timeline?: {
    status: LineItemStatus;
    timestamp: Date;
    user: Types.ObjectId;
    notes?: string;
  }[];
}

export interface IShipment {
  _id: Types.ObjectId;
  shipmentId: string;
  status: ShipmentStatus;
  carrier: string;
  trackingNumber: string;

  // Items in this shipment
  lineItems: {
    lineItemId: Types.ObjectId;
    quantity: number;
  }[];

  // Addresses
  pickupAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    contactName: string;
    contactPhone: string;
  };
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

  // Dates
  estimatedPickupDate?: Date;
  actualPickupDate?: Date;
  estimatedDeliveryDate?: Date;
  actualDeliveryDate?: Date;

  // Temperature monitoring
  temperatureReadings?: ITemperatureReading[];
  temperatureAlerts?: {
    timestamp: Date;
    message: string;
    severity: 'low' | 'medium' | 'high';
  }[];

  // Documents
  documents?: {
    type: string;
    name: string;
    url: string;
    uploadedAt: Date;
  }[];

  // Tracking events
  trackingEvents?: {
    timestamp: Date;
    location: string;
    status: string;
    description: string;
  }[];

  createdAt: Date;
  updatedAt: Date;
}

export interface IOrder extends Document {
  orderId: string;
  buyer: Types.ObjectId;
  buyerName: string;
  supplier: Types.ObjectId;
  supplierName: string;

  // Order details
  status: OrderStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  orderDate: Date;
  requiredDate?: Date;

  // Line items with tracking
  lineItems: ILineItem[];

  // Pricing
  subtotal: number;
  tax: number;
  shipping: number;
  discount?: number;
  total: number;
  currency: string;

  // Partial fulfillment
  allowPartialFulfillment: boolean;
  minimumFulfillmentPercentage?: number;

  // Shipments
  shipments: IShipment[];

  // Payment
  paymentTerms: string;
  paymentStatus: 'pending' | 'partial' | 'paid' | 'overdue' | 'refunded';
  paymentDueDate?: Date;

  // Temperature monitoring
  requiresTemperatureControl: boolean;
  temperatureMonitoring?: {
    enabled: boolean;
    alertThreshold: number;
    alertEmails: string[];
  };

  // Documents
  documents: {
    type: string;
    name: string;
    url: string;
    uploadedAt: Date;
    uploadedBy: Types.ObjectId;
  }[];

  // Notes
  buyerNotes?: string;
  supplierNotes?: string;
  internalNotes?: string;

  // Compliance
  complianceChecked: boolean;
  complianceDocuments?: string[];

  // Timestamps
  confirmedAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const TemperatureReadingSchema = new Schema<ITemperatureReading>({
  temperature: { type: Number, required: true },
  unit: { type: String, enum: ['C', 'F'], required: true },
  timestamp: { type: Date, required: true },
  location: String,
  deviceId: String
}, { _id: false });

const LineItemSchema = new Schema<ILineItem>({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: { type: String, required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true },
  unitPrice: { type: Number, required: true, min: 0 },
  totalPrice: { type: Number, required: true, min: 0 },

  status: {
    type: String,
    enum: Object.values(LineItemStatus),
    default: LineItemStatus.PENDING
  },
  allocatedQuantity: { type: Number, default: 0, min: 0 },
  shippedQuantity: { type: Number, default: 0, min: 0 },
  deliveredQuantity: { type: Number, default: 0, min: 0 },
  returnedQuantity: { type: Number, default: 0, min: 0 },

  requiresTemperatureControl: Boolean,
  temperatureRange: {
    min: Number,
    max: Number,
    unit: { type: String, enum: ['C', 'F'] }
  },

  batchNumber: String,
  expiryDate: Date,
  productionDate: Date,

  warehouseLocation: String,
  pickingInstructions: String,

  timeline: [{
    status: { type: String, enum: Object.values(LineItemStatus), required: true },
    timestamp: { type: Date, default: Date.now },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: String
  }]
});

const ShipmentSchema = new Schema<IShipment>({
  shipmentId: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: Object.values(ShipmentStatus),
    default: ShipmentStatus.PREPARING
  },
  carrier: { type: String, required: true },
  trackingNumber: { type: String, required: true, index: true },

  lineItems: [{
    lineItemId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 0 }
  }],

  pickupAddress: {
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true }
  },
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

  estimatedPickupDate: Date,
  actualPickupDate: Date,
  estimatedDeliveryDate: Date,
  actualDeliveryDate: Date,

  temperatureReadings: [TemperatureReadingSchema],
  temperatureAlerts: [{
    timestamp: { type: Date, required: true },
    message: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], required: true }
  }],

  documents: [{
    type: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],

  trackingEvents: [{
    timestamp: { type: Date, required: true },
    location: { type: String, required: true },
    status: { type: String, required: true },
    description: { type: String, required: true }
  }]
}, { timestamps: true });

const OrderSchema = new Schema<IOrder>({
  orderId: {
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

  status: {
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.DRAFT,
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  orderDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  requiredDate: Date,

  lineItems: {
    type: [LineItemSchema],
    required: true,
    validate: {
      validator(items: ILineItem[]) {
        return items.length > 0;
      },
      message: 'Order must have at least one line item'
    }
  },

  subtotal: { type: Number, required: true, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  shipping: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD', required: true },

  allowPartialFulfillment: { type: Boolean, default: false },
  minimumFulfillmentPercentage: { type: Number, min: 0, max: 100 },

  shipments: [ShipmentSchema],

  paymentTerms: { type: String, required: true },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue', 'refunded'],
    default: 'pending'
  },
  paymentDueDate: Date,

  requiresTemperatureControl: { type: Boolean, default: false },
  temperatureMonitoring: {
    enabled: Boolean,
    alertThreshold: Number,
    alertEmails: [String]
  },

  documents: [{
    type: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  }],

  buyerNotes: String,
  supplierNotes: String,
  internalNotes: String,

  complianceChecked: { type: Boolean, default: false },
  complianceDocuments: [String],

  confirmedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  completedAt: Date,
  cancelledAt: Date
}, {
  timestamps: true,
  collection: 'orders'
});

// Indexes
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ 'lineItems.status': 1 });
OrderSchema.index({ 'shipments.trackingNumber': 1 });
OrderSchema.index({ orderDate: -1 });
OrderSchema.index({ requiredDate: 1 });

// Virtual for fulfillment percentage
OrderSchema.virtual('fulfillmentPercentage').get(function() {
  const totalQuantity = this.lineItems.reduce((sum, item) => sum + item.quantity, 0);
  const deliveredQuantity = this.lineItems.reduce((sum, item) => sum + item.deliveredQuantity, 0);
  return totalQuantity > 0 ? Math.round((deliveredQuantity / totalQuantity) * 100) : 0;
});

// Methods
OrderSchema.methods.canShip = function(): boolean {
  const fulfilledPercentage = this.fulfillmentPercentage;
  if (!this.allowPartialFulfillment) {
    return fulfilledPercentage === 100;
  }
  return fulfilledPercentage >= (this.minimumFulfillmentPercentage || 0);
};

OrderSchema.methods.updateLineItemStatus = async function(
  lineItemId: string,
  status: LineItemStatus,
  userId: Types.ObjectId,
  notes?: string
) {
  const lineItem = this.lineItems.id(lineItemId);
  if (!lineItem) {
    throw new Error('Line item not found');
  }

  lineItem.status = status;
  lineItem.timeline = lineItem.timeline || [];
  lineItem.timeline.push({
    status,
    timestamp: new Date(),
    user: userId,
    notes
  });

  // Update quantities based on status
  switch (status) {
    case LineItemStatus.ALLOCATED:
      lineItem.allocatedQuantity = lineItem.quantity;
      break;
    case LineItemStatus.SHIPPED:
      lineItem.shippedQuantity = lineItem.quantity;
      break;
    case LineItemStatus.DELIVERED:
      lineItem.deliveredQuantity = lineItem.quantity;
      break;
  }

  // Update order status based on line items
  await this.updateOrderStatus();

  return this.save();
};

OrderSchema.methods.updateOrderStatus = async function() {
  const allStatuses = this.lineItems.map(item => item.status);

  if (allStatuses.every(s => s === LineItemStatus.DELIVERED)) {
    this.status = OrderStatus.DELIVERED;
    this.deliveredAt = new Date();
  } else if (allStatuses.some(s => s === LineItemStatus.SHIPPED)) {
    this.status = OrderStatus.PARTIALLY_SHIPPED;
  } else if (allStatuses.every(s => s === LineItemStatus.CONFIRMED)) {
    this.status = OrderStatus.CONFIRMED;
  }
};

OrderSchema.methods.addShipment = async function(shipmentData: Partial<IShipment>) {
  const shipmentId = `SHP-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  this.shipments.push({
    ...shipmentData,
    shipmentId,
    _id: new Types.ObjectId()
  } as IShipment);

  // Update line item statuses
  for (const item of shipmentData.lineItems || []) {
    await this.updateLineItemStatus(
      item.lineItemId.toString(),
      LineItemStatus.SHIPPED,
      shipmentData.createdBy as Types.ObjectId
    );
  }

  return this.save();
};

OrderSchema.methods.addTemperatureReading = function(
  shipmentId: string,
  reading: ITemperatureReading
) {
  const shipment = this.shipments.id(shipmentId);
  if (!shipment) {
    throw new Error('Shipment not found');
  }

  shipment.temperatureReadings = shipment.temperatureReadings || [];
  shipment.temperatureReadings.push(reading);

  // Check for temperature violations
  const tempControl = this.temperatureMonitoring;
  if (tempControl?.enabled && tempControl.alertThreshold) {
    const violatesThreshold = reading.unit === 'C'
      ? Math.abs(reading.temperature) > tempControl.alertThreshold
      : Math.abs((reading.temperature - 32) * 5/9) > tempControl.alertThreshold;

    if (violatesThreshold) {
      shipment.temperatureAlerts = shipment.temperatureAlerts || [];
      shipment.temperatureAlerts.push({
        timestamp: new Date(),
        message: `Temperature ${reading.temperature}°${reading.unit} exceeds threshold`,
        severity: 'high'
      });
    }
  }

  return this.save();
};

// Pre-save middleware
OrderSchema.pre('save', function(next) {
  // Generate orderId if not present
  if (!this.orderId && this.isNew) {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    this.orderId = `ORD-${year}${month}${day}-${random}`;
  }

  // Calculate totals
  this.subtotal = this.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  this.total = this.subtotal + this.tax + this.shipping - (this.discount || 0);

  // Check temperature control requirement
  this.requiresTemperatureControl = this.lineItems.some(item => item.requiresTemperatureControl);

  next();
});

export const Order = model<IOrder>('Order', OrderSchema);
