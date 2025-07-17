import Joi from 'joi';

/**
 * Validation schema for order creation
 */
export const validateOrderData = (data: any) => {
  const schema = Joi.object({
    purchaseOrderNumber: Joi.string().optional(),
    rfqId: Joi.string().optional(),
    quoteId: Joi.string().optional(),
    
    // Parties
    buyer: Joi.string().required(),
    buyerCompany: Joi.string().required(),
    supplier: Joi.string().required(),
    supplierCompany: Joi.string().required(),
    
    // Order Items
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().optional(),
        name: Joi.string().required(),
        sku: Joi.string().required(),
        description: Joi.string().optional(),
        quantity: Joi.number().min(1).required(),
        unitPrice: Joi.number().min(0).required(),
        unit: Joi.string().required(),
        specifications: Joi.string().optional(),
        
        // Food-specific
        batchNumber: Joi.string().optional(),
        expiryDate: Joi.date().optional(),
        temperatureRequirement: Joi.object({
          min: Joi.number().required(),
          max: Joi.number().required(),
          unit: Joi.string().valid('C', 'F').required()
        }).optional(),
        
        // Fulfillment
        quantityOrdered: Joi.number().min(0).required(),
        quantityShipped: Joi.number().min(0).default(0),
        quantityDelivered: Joi.number().min(0).default(0),
        quantityReturned: Joi.number().min(0).default(0),
        quantityRejected: Joi.number().min(0).default(0),
        
        // Status
        status: Joi.string().valid('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'returned').default('pending'),
        notes: Joi.string().optional()
      })
    ).min(1).required(),
    
    // Financial Information
    subtotal: Joi.number().min(0).required(),
    taxAmount: Joi.number().min(0).default(0),
    shippingCost: Joi.number().min(0).default(0),
    discountAmount: Joi.number().min(0).default(0),
    totalAmount: Joi.number().min(0).required(),
    currency: Joi.string().uppercase().default('USD'),
    
    // Payment Information
    paymentTerms: Joi.object({
      method: Joi.string().valid('net30', 'net60', 'net90', 'cod', 'prepaid', 'custom').default('net30'),
      customTerms: Joi.string().optional(),
      dueDate: Joi.date().optional()
    }).required(),
    
    // Delivery Information
    deliveryAddress: Joi.object({
      name: Joi.string().required(),
      company: Joi.string().optional(),
      address: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().optional(),
      country: Joi.string().required(),
      postalCode: Joi.string().required(),
      phone: Joi.string().optional(),
      email: Joi.string().email().optional(),
      specialInstructions: Joi.string().optional(),
      coordinates: Joi.object({
        lat: Joi.number().required(),
        lng: Joi.number().required()
      }).optional()
    }).required(),
    
    deliveryTerms: Joi.object({
      incoterm: Joi.string().valid('EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF').required(),
      shippingMethod: Joi.string().required(),
      carrier: Joi.string().optional(),
      serviceLevel: Joi.string().optional(),
      insuranceRequired: Joi.boolean().default(false),
      signatureRequired: Joi.boolean().default(true),
      specialHandling: Joi.array().items(Joi.string()).optional()
    }).required(),
    
    deliverySchedule: Joi.object({
      requestedDate: Joi.date().optional(),
      confirmedDate: Joi.date().optional(),
      estimatedDate: Joi.date().optional(),
      actualDate: Joi.date().optional(),
      timeWindow: Joi.object({
        start: Joi.string().required(),
        end: Joi.string().required()
      }).optional()
    }).optional(),
    
    // Compliance & Quality
    compliance: Joi.object({
      requiredCertifications: Joi.array().items(Joi.string()).optional(),
      providedCertifications: Joi.array().items(
        Joi.object({
          type: Joi.string().required(),
          certificateNumber: Joi.string().required(),
          issuer: Joi.string().required(),
          validFrom: Joi.date().required(),
          validUntil: Joi.date().required(),
          documentUrl: Joi.string().optional()
        })
      ).optional()
    }).optional(),
    
    // Contract Terms
    contractTerms: Joi.object({
      warrantyPeriod: Joi.number().optional(),
      returnPolicy: Joi.string().optional(),
      penalties: Joi.array().items(
        Joi.object({
          type: Joi.string().required(),
          amount: Joi.number().required(),
          conditions: Joi.string().required()
        })
      ).optional(),
      serviceLevel: Joi.object({
        deliveryTime: Joi.number().required(),
        accuracyRate: Joi.number().required(),
        responseTime: Joi.number().required()
      }).optional()
    }).optional(),
    
    // Integration
    externalReferences: Joi.object({
      erpOrderId: Joi.string().optional(),
      accountingReference: Joi.string().optional(),
      warehouseReference: Joi.string().optional(),
      carrierReference: Joi.string().optional(),
      customerReference: Joi.string().optional()
    }).optional()
  });

  return schema.validate(data, { allowUnknown: false });
};

/**
 * Validation schema for order updates
 */
export const validateOrderUpdateData = (data: any) => {
  const schema = Joi.object({
    purchaseOrderNumber: Joi.string().optional(),
    
    // Order Items
    items: Joi.array().items(
      Joi.object({
        _id: Joi.string().optional(),
        productId: Joi.string().optional(),
        name: Joi.string().required(),
        sku: Joi.string().required(),
        description: Joi.string().optional(),
        quantity: Joi.number().min(1).required(),
        unitPrice: Joi.number().min(0).required(),
        unit: Joi.string().required(),
        specifications: Joi.string().optional(),
        
        // Food-specific
        batchNumber: Joi.string().optional(),
        expiryDate: Joi.date().optional(),
        temperatureRequirement: Joi.object({
          min: Joi.number().required(),
          max: Joi.number().required(),
          unit: Joi.string().valid('C', 'F').required()
        }).optional(),
        
        // Fulfillment
        quantityOrdered: Joi.number().min(0).required(),
        quantityShipped: Joi.number().min(0).default(0),
        quantityDelivered: Joi.number().min(0).default(0),
        quantityReturned: Joi.number().min(0).default(0),
        quantityRejected: Joi.number().min(0).default(0),
        
        // Status
        status: Joi.string().valid('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'returned').default('pending'),
        notes: Joi.string().optional()
      })
    ).optional(),
    
    // Financial Information
    subtotal: Joi.number().min(0).optional(),
    taxAmount: Joi.number().min(0).optional(),
    shippingCost: Joi.number().min(0).optional(),
    discountAmount: Joi.number().min(0).optional(),
    totalAmount: Joi.number().min(0).optional(),
    currency: Joi.string().uppercase().optional(),
    
    // Payment Information
    paymentTerms: Joi.object({
      method: Joi.string().valid('net30', 'net60', 'net90', 'cod', 'prepaid', 'custom').optional(),
      customTerms: Joi.string().optional(),
      dueDate: Joi.date().optional()
    }).optional(),
    
    // Delivery Information
    deliveryAddress: Joi.object({
      name: Joi.string().required(),
      company: Joi.string().optional(),
      address: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().optional(),
      country: Joi.string().required(),
      postalCode: Joi.string().required(),
      phone: Joi.string().optional(),
      email: Joi.string().email().optional(),
      specialInstructions: Joi.string().optional(),
      coordinates: Joi.object({
        lat: Joi.number().required(),
        lng: Joi.number().required()
      }).optional()
    }).optional(),
    
    deliveryTerms: Joi.object({
      incoterm: Joi.string().valid('EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF').required(),
      shippingMethod: Joi.string().required(),
      carrier: Joi.string().optional(),
      serviceLevel: Joi.string().optional(),
      insuranceRequired: Joi.boolean().optional(),
      signatureRequired: Joi.boolean().optional(),
      specialHandling: Joi.array().items(Joi.string()).optional()
    }).optional(),
    
    deliverySchedule: Joi.object({
      requestedDate: Joi.date().optional(),
      confirmedDate: Joi.date().optional(),
      estimatedDate: Joi.date().optional(),
      actualDate: Joi.date().optional(),
      timeWindow: Joi.object({
        start: Joi.string().required(),
        end: Joi.string().required()
      }).optional()
    }).optional(),
    
    // Compliance & Quality
    compliance: Joi.object({
      requiredCertifications: Joi.array().items(Joi.string()).optional(),
      providedCertifications: Joi.array().items(
        Joi.object({
          type: Joi.string().required(),
          certificateNumber: Joi.string().required(),
          issuer: Joi.string().required(),
          validFrom: Joi.date().required(),
          validUntil: Joi.date().required(),
          documentUrl: Joi.string().optional()
        })
      ).optional()
    }).optional(),
    
    // Contract Terms
    contractTerms: Joi.object({
      warrantyPeriod: Joi.number().optional(),
      returnPolicy: Joi.string().optional(),
      penalties: Joi.array().items(
        Joi.object({
          type: Joi.string().required(),
          amount: Joi.number().required(),
          conditions: Joi.string().required()
        })
      ).optional(),
      serviceLevel: Joi.object({
        deliveryTime: Joi.number().required(),
        accuracyRate: Joi.number().required(),
        responseTime: Joi.number().required()
      }).optional()
    }).optional(),
    
    // Integration
    externalReferences: Joi.object({
      erpOrderId: Joi.string().optional(),
      accountingReference: Joi.string().optional(),
      warehouseReference: Joi.string().optional(),
      carrierReference: Joi.string().optional(),
      customerReference: Joi.string().optional()
    }).optional()
  });

  return schema.validate(data, { allowUnknown: false });
};

/**
 * Validation schema for RFQ data
 */
export const validateRFQData = (data: any) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    
    // Buyer Information
    buyer: Joi.string().required(),
    buyerCompany: Joi.string().required(),
    
    // Items
    items: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        description: Joi.string().optional(),
        quantity: Joi.number().min(1).required(),
        unit: Joi.string().required(),
        specifications: Joi.string().optional(),
        
        // Food-specific
        category: Joi.string().optional(),
        subCategory: Joi.string().optional(),
        targetPrice: Joi.number().min(0).optional(),
        
        // Quality requirements
        qualityStandards: Joi.array().items(Joi.string()).optional(),
        certifications: Joi.array().items(Joi.string()).optional(),
        
        // Packaging
        packagingType: Joi.string().optional(),
        packagingSize: Joi.string().optional(),
        
        // Delivery
        deliveryLocation: Joi.string().optional(),
        deliveryDate: Joi.date().optional()
      })
    ).min(1).required(),
    
    // Delivery Information
    deliveryAddress: Joi.object({
      name: Joi.string().required(),
      company: Joi.string().optional(),
      address: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().optional(),
      country: Joi.string().required(),
      postalCode: Joi.string().required(),
      phone: Joi.string().optional(),
      email: Joi.string().email().optional(),
      specialInstructions: Joi.string().optional()
    }).required(),
    
    // Terms
    terms: Joi.object({
      paymentTerms: Joi.string().required(),
      deliveryTerms: Joi.string().required(),
      warranty: Joi.string().optional(),
      returnPolicy: Joi.string().optional(),
      specialRequirements: Joi.string().optional()
    }).required(),
    
    // Timeline
    submissionDeadline: Joi.date().required(),
    validUntil: Joi.date().required(),
    
    // Budget
    budgetRange: Joi.object({
      min: Joi.number().min(0).optional(),
      max: Joi.number().min(0).optional(),
      currency: Joi.string().uppercase().default('USD')
    }).optional(),
    
    // Selection Criteria
    selectionCriteria: Joi.object({
      priceWeight: Joi.number().min(0).max(100).default(40),
      qualityWeight: Joi.number().min(0).max(100).default(30),
      deliveryWeight: Joi.number().min(0).max(100).default(20),
      serviceWeight: Joi.number().min(0).max(100).default(10)
    }).optional(),
    
    // Attachments
    attachments: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        url: Joi.string().required(),
        type: Joi.string().required(),
        size: Joi.number().required()
      })
    ).optional()
  });

  return schema.validate(data, { allowUnknown: false });
};

/**
 * Validation schema for product data
 */
export const validateProductData = (data: any) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    description: Joi.string().required(),
    sku: Joi.string().required(),
    category: Joi.string().required(),
    subCategory: Joi.string().optional(),
    
    // Pricing
    price: Joi.number().min(0).required(),
    currency: Joi.string().uppercase().default('USD'),
    priceUnit: Joi.string().required(),
    
    // Inventory
    inventory: Joi.object({
      quantity: Joi.number().min(0).required(),
      unit: Joi.string().required(),
      minOrderQuantity: Joi.number().min(1).required(),
      maxOrderQuantity: Joi.number().min(1).optional(),
      reorderPoint: Joi.number().min(0).optional(),
      stockStatus: Joi.string().valid('in_stock', 'low_stock', 'out_of_stock').default('in_stock')
    }).required(),
    
    // Food Safety
    foodSafety: Joi.object({
      allergens: Joi.array().items(Joi.string()).optional(),
      storageTemperature: Joi.object({
        min: Joi.number().required(),
        max: Joi.number().required(),
        unit: Joi.string().valid('C', 'F').required()
      }).optional(),
      shelfLife: Joi.object({
        value: Joi.number().min(1).required(),
        unit: Joi.string().valid('days', 'weeks', 'months', 'years').required()
      }).optional()
    }).optional(),
    
    // Nutritional Information
    nutritionalInfo: Joi.object({
      servingSize: Joi.string().optional(),
      calories: Joi.number().min(0).optional(),
      protein: Joi.number().min(0).optional(),
      carbohydrates: Joi.number().min(0).optional(),
      fat: Joi.number().min(0).optional(),
      fiber: Joi.number().min(0).optional(),
      sugar: Joi.number().min(0).optional(),
      sodium: Joi.number().min(0).optional()
    }).optional(),
    
    // Packaging
    packaging: Joi.object({
      type: Joi.string().required(),
      size: Joi.string().required(),
      weight: Joi.number().min(0).required(),
      weightUnit: Joi.string().required(),
      dimensions: Joi.object({
        length: Joi.number().min(0).required(),
        width: Joi.number().min(0).required(),
        height: Joi.number().min(0).required(),
        unit: Joi.string().required()
      }).optional()
    }).required(),
    
    // Certifications
    certifications: Joi.array().items(Joi.string()).optional(),
    
    // Supplier Information
    supplier: Joi.string().required(),
    supplierCompany: Joi.string().required(),
    
    // Images
    images: Joi.array().items(Joi.string()).optional(),
    
    // Status
    status: Joi.string().valid('active', 'inactive', 'discontinued').default('active'),
    
    // Traceability
    traceability: Joi.object({
      lotTracking: Joi.boolean().default(false),
      batchTracking: Joi.boolean().default(false),
      originCountry: Joi.string().optional(),
      harvestDate: Joi.date().optional(),
      farmLocation: Joi.object({
        name: Joi.string().required(),
        address: Joi.string().required(),
        coordinates: Joi.object({
          lat: Joi.number().required(),
          lng: Joi.number().required()
        }).optional()
      }).optional()
    }).optional()
  });

  return schema.validate(data, { allowUnknown: false });
};

/**
 * Validation schema for user registration
 */
export const validateUserRegistration = (data: any) => {
  const schema = Joi.object({
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
    phone: Joi.string().optional(),
    role: Joi.string().valid('buyer', 'supplier', 'admin', 'manager').default('buyer'),
    companyName: Joi.string().required(),
    companyType: Joi.string().valid('buyer', 'supplier', 'both').required(),
    businessLicense: Joi.string().optional(),
    taxId: Joi.string().optional()
  });

  return schema.validate(data, { allowUnknown: false });
};

/**
 * Validation schema for user login
 */
export const validateUserLogin = (data: any) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  });

  return schema.validate(data, { allowUnknown: false });
};