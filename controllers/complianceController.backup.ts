// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\controllers\complianceController.ts

import { Request, Response } from 'express';
import { ComplianceValidation } from '../models/compliance/ComplianceValidation';
import { validateProductSpecifications } from '../services/compliance/validationService';

// Interfaces
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

interface ValidationRequest {
  productType: string;
  specifications: Record<string, any>;
  targetMarket?: string;
}

interface ValidationResponse {
  success: boolean;
  message: string;
  details?: any;
  errors?: string[];
  recommendations?: string[];
  validationId?: string;
}

// Main compliance validation endpoint
export const validateCompliance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { productType, specifications, targetMarket = 'US' }: ValidationRequest = req.body;

    if (!productType || !specifications) {
      res.status(400).json({
        success: false,
        message: 'Product type and specifications are required',
        errors: ['Missing required fields']
      });
      return;
    }

    // Validate product specifications
    const validationResult = await validateProductSpecifications(
      productType, 
      specifications, 
      targetMarket
    );

    // Log validation attempt
    const validationLog = new ComplianceValidation({
      productType,
      specifications,
      targetMarket,
      validationResult,
      timestamp: new Date(),
      userId: req.user?.id || 'anonymous'
    });

    await validationLog.save();

    // Return validation result
    const response: ValidationResponse = {
      success: validationResult.isValid,
      message: validationResult.message,
      details: validationResult.details,
      errors: validationResult.errors || [],
      recommendations: validationResult.recommendations || [],
      validationId: validationLog._id?.toString()
    };

    res.json(response);

  } catch (error) {
    console.error('Compliance validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during validation',
      error: process.env.NODE_ENV === 'development' ? (error as Error).message : 'Validation failed'
    });
  }
};

// Get compliance history
export const getComplianceHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '20', productType } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    
    const filter: any = {};
    if (productType) filter.productType = productType;
    if (req.user?.id) filter.userId = req.user.id;

    const validations = await ComplianceValidation
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .exec();

    const total = await ComplianceValidation.countDocuments(filter);

    res.json({
      success: true,
      data: validations,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get compliance history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch compliance history'
    });
  }
};

// Get validation rules for product type
export const getValidationRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productType, targetMarket = 'US' } = req.params;
    
    // Import the function here to avoid circular dependencies
    const { getProductValidationRules } = await import('../services/compliance/validationService');
    const rules = getProductValidationRules(productType, targetMarket);

    res.json({
      success: true,
      productType,
      targetMarket,
      rules: rules
    });

  } catch (error) {
    console.error('Get validation rules error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch validation rules'
    });
  }
};

// Bulk compliance validation
export const validateBulkCompliance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { products, targetMarket = 'US' }: { 
      products: Array<{ id?: string; productType: string; specifications: Record<string, any> }>;
      targetMarket?: string;
    } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Products array is required'
      });
      return;
    }

    const results = [];
    for (const product of products) {
      const result = await validateProductSpecifications(
        product.productType,
        product.specifications,
        targetMarket
      );
      
      results.push({
        productId: product.id || product.productType,
        ...result
      });
    }

    res.json({
      success: true,
      results,
      summary: {
        total: results.length,
        valid: results.filter(r => r.isValid).length,
        invalid: results.filter(r => !r.isValid).length
      }
    });

  } catch (error) {
    console.error('Bulk compliance validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk validation failed'
    });
  }
};