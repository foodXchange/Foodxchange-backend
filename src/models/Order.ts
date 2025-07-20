import mongoose, { Document, Schema } from 'mongoose';

export interface IOrder extends Document {
  // Basic Information
  orderNumber: string;
  purchaseOrderNumber?: string;
  rfqId?: mongoose.Types.ObjectId;
  quoteId?: mongoose.Types.ObjectId;

  // Parties
  buyer: mongoose.Types.ObjectId;
  buyerCompany: mongoose.Types.ObjectId;
  supplier: mongoose.Types.ObjectId;
  supplierCompany: mongoose.Types.ObjectId;
  tenantId: string;

  // Order Items
  items: Array<{
    _id?: mongoose.Types.ObjectId;
    productId?: mongoose.Types.ObjectId;
    name: string;
    sku: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unit: string;
    specifications?: string;

    // Food-specific
    batchNumber?: string;
    expiryDate?: Date;
    temperatureRequirement?: {
      min: number;
      max: number;
      unit: 'C' | 'F';
    };

    // Fulfillment
    quantityOrdered: number;
    quantityShipped: number;
    quantityDelivered: number;
    quantityReturned: number;
    quantityRejected: number;

    // Status
    status: 'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
    notes?: string;
  }>;

  // Financial Information
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;

  // Payment Information
  paymentTerms: {
    method: 'net30' | 'net60' | 'net90' | 'cod' | 'prepaid' | 'custom';
    customTerms?: string;
    dueDate?: Date;
  };

  paymentStatus: 'pending' | 'partial' | 'paid' | 'overdue' | 'refunded';

  payments: Array<{
    _id?: mongoose.Types.ObjectId;
    amount: number;
    method: 'credit_card' | 'bank_transfer' | 'check' | 'cash' | 'other';
    reference: string;
    processedAt: Date;
    processedBy: mongoose.Types.ObjectId;
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    gatewayResponse?: any;
  }>;

  // Delivery Information
  deliveryAddress: {
    name: string;
    company?: string;
    address: string;
    city: string;
    state?: string;
    country: string;
    postalCode: string;
    phone?: string;
    email?: string;
    specialInstructions?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };

  deliveryTerms: {
    incoterm: string;
    shippingMethod: string;
    carrier?: string;
    serviceLevel?: string;
    insuranceRequired: boolean;
    signatureRequired: boolean;
    specialHandling?: string[];
  };

  deliverySchedule: {
    requestedDate?: Date;
    confirmedDate?: Date;
    estimatedDate?: Date;
    actualDate?: Date;
    timeWindow?: {
      start: string;
      end: string;
    };
  };

  // Shipment Information
  shipments: Array<{
    _id?: mongoose.Types.ObjectId;
    shipmentNumber: string;
    carrier: string;
    trackingNumber: string;
    service: string;
    items: Array<{
      itemId: mongoose.Types.ObjectId;
      quantity: number;
    }>;

    // Dates
    shippedDate: Date;
    estimatedDeliveryDate?: Date;
    actualDeliveryDate?: Date;

    // Status
    status: 'created' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned' | 'lost';

    // Tracking
    trackingEvents: Array<{
      timestamp: Date;
      status: string;
      location?: string;
      description: string;
      eventCode?: string;
    }>;

    // Costs
    shippingCost: number;
    insuranceCost?: number;

    // Documentation
    documents: Array<{
      type: 'bill_of_lading' | 'packing_list' | 'commercial_invoice' | 'insurance' | 'other';
      name: string;
      url: string;
      uploadedAt: Date;
    }>;
  }>;

  // Order Status and Workflow
  status: 'draft' | 'pending_approval' | 'approved' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'returned';

  // Approval Workflow
  approvalRequired: boolean;
  approvalChain: Array<{
    _id?: mongoose.Types.ObjectId;
    approver: mongoose.Types.ObjectId;
    role: string;
    order: number;
    status: 'pending' | 'approved' | 'rejected' | 'skipped';
    comments?: string;
    processedAt?: Date;
    approvedAmount?: number;
    conditions?: string[];
  }>;

  currentApprovalLevel: number;
  finalApprovalDate?: Date;

  // Compliance & Quality
  compliance: {
    requiredCertifications: string[];
    providedCertifications: Array<{
      type: string;
      certificateNumber: string;
      issuer: string;
      validFrom: Date;
      validUntil: Date;
      documentUrl?: string;
    }>;

    temperatureLog: Array<{
      timestamp: Date;
      temperature: number;
      unit: 'C' | 'F';
      location: string;
      recordedBy: string;
    }>;

    qualityChecks: Array<{
      type: 'incoming' | 'outgoing' | 'storage';
      performedBy: mongoose.Types.ObjectId;
      performedAt: Date;
      result: 'pass' | 'fail' | 'conditional';
      notes?: string;
      photos?: string[];
    }>;
  };

  // Contract Terms
  contractTerms: {
    warrantyPeriod?: number;
    returnPolicy?: string;
    penalties?: Array<{
      type: string;
      amount: number;
      conditions: string;
    }>;
    serviceLevel?: {
      deliveryTime: number;
      accuracyRate: number;
      responseTime: number;
    };
  };

  // Notifications
  notifications: Array<{
    type: string;
    recipient: mongoose.Types.ObjectId;
    sentAt: Date;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    message: string;
  }>;

  // Integration
  externalReferences: {
    erpOrderId?: string;
    accountingReference?: string;
    warehouseReference?: string;
    carrierReference?: string;
    customerReference?: string;
  };

  // Analytics
  analytics: {
    orderValue: number;
    profitMargin?: number;
    processingTime: number;
    fulfillmentTime?: number;
    customerSatisfaction?: number;
    returnRate?: number;
  };

  // Activity Log
  activityLog: Array<{
    action: string;
    performedBy: mongoose.Types.ObjectId;
    timestamp: Date;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
  }>;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  version: number;

  // Virtual fields
  isApprovalPending: boolean;
  canBeCancelled: boolean;
  estimatedDeliveryDate: Date;
  fulfillmentProgress: number;

  // Methods
  addToApprovalChain(approver: string, role: string, order: number): Promise<void>;
  processApproval(approverId: string, decision: 'approved' | 'rejected', comments?: string): Promise<void>;
  updateStatus(newStatus: string, userId: string): Promise<void>;
  addShipment(shipmentData: any): Promise<void>;
  updateShipmentTracking(shipmentId: string, trackingData: any): Promise<void>;
  calculateTotals(): void;
  addActivityLog(action: string, userId: string, details?: any): Promise<void>;
  canBeModified(): boolean;
  getNextApprover(): any;
}

const orderSchema = new Schema<IOrder>({
  // Basic Information
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  purchaseOrderNumber: {
    type: String,
    sparse: true,
    index: true
  },
  rfqId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ'
  },
  quoteId: {
    type: mongoose.Schema.Types.ObjectId
  },

  // Parties
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyerCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supplierCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },

  // Order Items
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    name: {
      type: String,
      required: true
    },
    sku: {
      type: String,
      required: true
    },
    description: String,
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },
    unit: {
      type: String,
      required: true
    },
    specifications: String,

    // Food-specific
    batchNumber: String,
    expiryDate: Date,
    temperatureRequirement: {
      min: Number,
      max: Number,
      unit: {
        type: String,
        enum: ['C', 'F']
      }
    },

    // Fulfillment
    quantityOrdered: {
      type: Number,
      required: true,
      min: 0
    },
    quantityShipped: {
      type: Number,
      default: 0,
      min: 0
    },
    quantityDelivered: {
      type: Number,
      default: 0,
      min: 0
    },
    quantityReturned: {
      type: Number,
      default: 0,
      min: 0
    },
    quantityRejected: {
      type: Number,
      default: 0,
      min: 0
    },

    // Status
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'returned'],
      default: 'pending'
    },
    notes: String
  }],

  // Financial Information
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  shippingCost: {
    type: Number,
    default: 0,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD'
  },

  // Payment Information
  paymentTerms: {
    method: {
      type: String,
      enum: ['net30', 'net60', 'net90', 'cod', 'prepaid', 'custom'],
      default: 'net30'
    },
    customTerms: String,
    dueDate: Date
  },

  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue', 'refunded'],
    default: 'pending'
  },

  payments: [{
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    method: {
      type: String,
      enum: ['credit_card', 'bank_transfer', 'check', 'cash', 'other'],
      required: true
    },
    reference: {
      type: String,
      required: true
    },
    processedAt: {
      type: Date,
      default: Date.now
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    gatewayResponse: mongoose.Schema.Types.Mixed
  }],

  // Delivery Information
  deliveryAddress: {
    name: {
      type: String,
      required: true
    },
    company: String,
    address: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: String,
    country: {
      type: String,
      required: true
    },
    postalCode: {
      type: String,
      required: true
    },
    phone: String,
    email: String,
    specialInstructions: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  deliveryTerms: {
    incoterm: {
      type: String,
      required: true,
      enum: ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']
    },
    shippingMethod: {
      type: String,
      required: true
    },
    carrier: String,
    serviceLevel: String,
    insuranceRequired: {
      type: Boolean,
      default: false
    },
    signatureRequired: {
      type: Boolean,
      default: true
    },
    specialHandling: [String]
  },

  deliverySchedule: {
    requestedDate: Date,
    confirmedDate: Date,
    estimatedDate: Date,
    actualDate: Date,
    timeWindow: {
      start: String,
      end: String
    }
  },

  // Shipment Information
  shipments: [{
    shipmentNumber: {
      type: String,
      required: true
    },
    carrier: {
      type: String,
      required: true
    },
    trackingNumber: {
      type: String,
      required: true
    },
    service: {
      type: String,
      required: true
    },
    items: [{
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: 1
      }
    }],

    // Dates
    shippedDate: {
      type: Date,
      required: true
    },
    estimatedDeliveryDate: Date,
    actualDeliveryDate: Date,

    // Status
    status: {
      type: String,
      enum: ['created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'lost'],
      default: 'created'
    },

    // Tracking
    trackingEvents: [{
      timestamp: {
        type: Date,
        required: true
      },
      status: {
        type: String,
        required: true
      },
      location: String,
      description: {
        type: String,
        required: true
      },
      eventCode: String
    }],

    // Costs
    shippingCost: {
      type: Number,
      required: true,
      min: 0
    },
    insuranceCost: {
      type: Number,
      min: 0
    },

    // Documentation
    documents: [{
      type: {
        type: String,
        enum: ['bill_of_lading', 'packing_list', 'commercial_invoice', 'insurance', 'other'],
        required: true
      },
      name: {
        type: String,
        required: true
      },
      url: {
        type: String,
        required: true
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  }],

  // Order Status and Workflow
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'returned'],
    default: 'draft'
  },

  // Approval Workflow
  approvalRequired: {
    type: Boolean,
    default: false
  },
  approvalChain: [{
    approver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      required: true
    },
    order: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'skipped'],
      default: 'pending'
    },
    comments: String,
    processedAt: Date,
    approvedAmount: Number,
    conditions: [String]
  }],

  currentApprovalLevel: {
    type: Number,
    default: 0
  },
  finalApprovalDate: Date,

  // Compliance & Quality
  compliance: {
    requiredCertifications: [String],
    providedCertifications: [{
      type: {
        type: String,
        required: true
      },
      certificateNumber: {
        type: String,
        required: true
      },
      issuer: {
        type: String,
        required: true
      },
      validFrom: {
        type: Date,
        required: true
      },
      validUntil: {
        type: Date,
        required: true
      },
      documentUrl: String
    }],

    temperatureLog: [{
      timestamp: {
        type: Date,
        required: true
      },
      temperature: {
        type: Number,
        required: true
      },
      unit: {
        type: String,
        enum: ['C', 'F'],
        required: true
      },
      location: {
        type: String,
        required: true
      },
      recordedBy: {
        type: String,
        required: true
      }
    }],

    qualityChecks: [{
      type: {
        type: String,
        enum: ['incoming', 'outgoing', 'storage'],
        required: true
      },
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      performedAt: {
        type: Date,
        default: Date.now
      },
      result: {
        type: String,
        enum: ['pass', 'fail', 'conditional'],
        required: true
      },
      notes: String,
      photos: [String]
    }]
  },

  // Contract Terms
  contractTerms: {
    warrantyPeriod: Number,
    returnPolicy: String,
    penalties: [{
      type: String,
      amount: Number,
      conditions: String
    }],
    serviceLevel: {
      deliveryTime: Number,
      accuracyRate: Number,
      responseTime: Number
    }
  },

  // Notifications
  notifications: [{
    type: {
      type: String,
      required: true
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent'
    },
    message: {
      type: String,
      required: true
    }
  }],

  // Integration
  externalReferences: {
    erpOrderId: String,
    accountingReference: String,
    warehouseReference: String,
    carrierReference: String,
    customerReference: String
  },

  // Analytics
  analytics: {
    orderValue: {
      type: Number,
      required: true
    },
    profitMargin: Number,
    processingTime: {
      type: Number,
      default: 0
    },
    fulfillmentTime: Number,
    customerSatisfaction: {
      type: Number,
      min: 0,
      max: 5
    },
    returnRate: {
      type: Number,
      min: 0,
      max: 100
    }
  },

  // Activity Log
  activityLog: [{
    action: {
      type: String,
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String
  }],

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
orderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ buyerCompany: 1, status: 1 });
orderSchema.index({ supplierCompany: 1, status: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ purchaseOrderNumber: 1 });
orderSchema.index({ 'deliverySchedule.requestedDate': 1 });
orderSchema.index({ 'paymentTerms.dueDate': 1 });
orderSchema.index({ paymentStatus: 1 });

// Virtual fields
orderSchema.virtual('isApprovalPending').get(function() {
  return this.approvalRequired && this.status === 'pending_approval';
});

orderSchema.virtual('canBeCancelled').get(function() {
  return ['draft', 'pending_approval', 'approved', 'confirmed'].includes(this.status);
});

orderSchema.virtual('estimatedDeliveryDate').get(function() {
  return this.deliverySchedule.estimatedDate || this.deliverySchedule.confirmedDate;
});

orderSchema.virtual('fulfillmentProgress').get(function() {
  const totalOrdered = this.items.reduce((sum, item) => sum + item.quantityOrdered, 0);
  const totalShipped = this.items.reduce((sum, item) => sum + item.quantityShipped, 0);
  return totalOrdered > 0 ? (totalShipped / totalOrdered) * 100 : 0;
});

// Pre-save middleware
orderSchema.pre('save', async function(next) {
  // Generate order number if not exists
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments({ tenantId: this.tenantId });
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    this.orderNumber = `ORD-${year}${month}-${(count + 1).toString().padStart(6, '0')}`;
  }

  // Calculate totals
  this.calculateTotals();

  // Set payment due date
  if (this.paymentTerms.method !== 'prepaid' && !this.paymentTerms.dueDate) {
    const daysToAdd = this.paymentTerms.method === 'net30' ? 30 :
      this.paymentTerms.method === 'net60' ? 60 :
        this.paymentTerms.method === 'net90' ? 90 : 0;

    if (daysToAdd > 0) {
      this.paymentTerms.dueDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
    }
  }

  next();
});

// Methods
orderSchema.methods.addToApprovalChain = async function(
  approver: string,
  role: string,
  order: number
): Promise<void> {
  this.approvalChain.push({
    approver: approver as any,
    role,
    order,
    status: 'pending'
  });

  // Sort by order
  this.approvalChain.sort((a, b) => a.order - b.order);

  await this.save();
};

orderSchema.methods.processApproval = async function(
  approverId: string,
  decision: 'approved' | 'rejected',
  comments?: string
): Promise<void> {
  const approval = this.approvalChain.find(a =>
    a.approver.toString() === approverId && a.status === 'pending'
  );

  if (!approval) {
    throw new Error('Approval not found or already processed');
  }

  approval.status = decision;
  approval.comments = comments;
  approval.processedAt = new Date();

  if (decision === 'rejected') {
    this.status = 'cancelled';
  } else {
    // Check if all approvals are complete
    const pendingApprovals = this.approvalChain.filter(a => a.status === 'pending');
    if (pendingApprovals.length === 0) {
      this.status = 'approved';
      this.finalApprovalDate = new Date();
    }
  }

  await this.addActivityLog(`order_${decision}`, approverId, { comments });
  await this.save();
};

orderSchema.methods.updateStatus = async function(
  newStatus: string,
  userId: string
): Promise<void> {
  const oldStatus = this.status;
  this.status = newStatus;
  this.updatedBy = userId;

  await this.addActivityLog('status_changed', userId, {
    from: oldStatus,
    to: newStatus
  });

  await this.save();
};

orderSchema.methods.addShipment = async function(shipmentData: any): Promise<void> {
  this.shipments.push(shipmentData);

  // Update item quantities
  shipmentData.items.forEach((shipItem: any) => {
    const orderItem = this.items.id(shipItem.itemId);
    if (orderItem) {
      orderItem.quantityShipped += shipItem.quantity;
      orderItem.status = 'shipped';
    }
  });

  // Update order status if fully shipped
  const allShipped = this.items.every(item =>
    item.quantityShipped >= item.quantityOrdered
  );

  if (allShipped) {
    this.status = 'shipped';
  }

  await this.save();
};

orderSchema.methods.updateShipmentTracking = async function(
  shipmentId: string,
  trackingData: any
): Promise<void> {
  const shipment = this.shipments.id(shipmentId);
  if (!shipment) {
    throw new Error('Shipment not found');
  }

  shipment.trackingEvents.push({
    timestamp: new Date(),
    ...trackingData
  });

  // Update shipment status
  if (trackingData.status) {
    shipment.status = trackingData.status;
  }

  await this.save();
};

orderSchema.methods.calculateTotals = function(): void {
  this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
  this.totalAmount = this.subtotal + this.taxAmount + this.shippingCost - this.discountAmount;
  this.analytics.orderValue = this.totalAmount;
};

orderSchema.methods.addActivityLog = async function(
  action: string,
  userId: string,
  details?: any
): Promise<void> {
  this.activityLog.push({
    action,
    performedBy: userId as any,
    timestamp: new Date(),
    details
  });
};

orderSchema.methods.canBeModified = function(): boolean {
  return ['draft', 'pending_approval'].includes(this.status);
};

orderSchema.methods.getNextApprover = function(): any {
  const pendingApproval = this.approvalChain
    .filter(a => a.status === 'pending')
    .sort((a, b) => a.order - b.order)[0];

  return pendingApproval;
};

export const Order = mongoose.model<IOrder>('Order', orderSchema);
export default Order;
