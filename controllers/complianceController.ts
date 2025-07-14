// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\controllers\complianceController.ts

import { Request, Response } from 'express';
import { complianceService } from '../src/compliance/validators/validationService';
import { getRulesByProduct, getRulesByMarket, ComplianceRulesDatabase } from '../src/compliance/rules/complianceRules';
import RFQ, { IRFQ } from '../models/RFQ';
import Product, { IProduct } from '../models/Product';
import User, { IUser } from '../models/User';

interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: any;
}

interface ValidationRequest {
  productType: string;
  specifications: any;
  targetMarket?: string;
  rfqId?: string;
}

// Main compliance validation endpoint - Now with robust validation
export const validateCompliance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { productType, specifications, targetMarket = 'US', rfqId }: ValidationRequest = req.body;
    const userId = req.userId || 'system';

    if (!productType || !specifications) {
      res.status(400).json({
        success: false,
        message: 'Product type and specifications are required'
      });
      return;
    }

    // Use the robust validation service
    const validationResult = await complianceService.validateRFQSpecifications(
      rfqId || `manual_${Date.now()}`,
      productType,
      specifications,
      userId
    );

    // Check market-specific compliance
    const marketCompliance = await complianceService.validateForMarket(
      specifications,
      targetMarket,
      productType
    );

    // Update RFQ if ID provided
    if (rfqId) {
      await RFQ.findByIdAndUpdate(rfqId, {
        complianceStatus: validationResult.passed ? 'approved' : 'rejected',
        complianceScore: validationResult.validationScore,
        lastValidated: new Date(),
        complianceErrors: validationResult.criticalErrors
      });
    }

    res.json({
      success: true,
      validation: {
        passed: validationResult.passed,
        score: validationResult.validationScore,
        criticalErrors: validationResult.criticalErrors,
        warnings: validationResult.warnings,
        suggestions: validationResult.suggestions,
        certificationsRequired: validationResult.certificationsRequired,
        estimatedFixTime: validationResult.estimatedFixTime,
        marketCompliance,
        auditTrail: validationResult.auditLog
      }
    });

  } catch (error) {
    console.error('Compliance validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Compliance validation failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Real-time field validation endpoint
export const validateField = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { rfqId, fieldPath, oldValue, newValue, productType } = req.body;
    const userId = req.userId || 'system';

    const validation = await complianceService.validateFieldChange(
      rfqId,
      fieldPath,
      oldValue,
      newValue,
      productType,
      userId
    );

    res.json({
      success: true,
      validation
    });

  } catch (error) {
    console.error('Field validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Field validation failed'
    });
  }
};

// Get compliance history
export const getComplianceHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '20', productType, status } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const query: any = {};
    if (productType) query.productType = productType;
    if (status) query.complianceStatus = status;

    const rfqs = await RFQ.find(query)
      .populate('buyerId', 'companyName')
      .sort({ lastValidated: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await RFQ.countDocuments(query);

    res.json({
      success: true,
      data: rfqs.map(rfq => ({
        id: rfq._id,
        title: rfq.title,
        productType: rfq.productType,
        complianceStatus: rfq.complianceStatus,
        complianceScore: rfq.complianceScore,
        lastValidated: rfq.lastValidated,
        buyer: rfq.buyerId
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get compliance history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance history'
    });
  }
};

// Get validation rules for product type
export const getValidationRules = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productType, targetMarket = 'US' } = req.params;

    const productRules = getRulesByProduct(productType);
    const marketRules = getRulesByMarket(targetMarket);
    
    // Combine and deduplicate rules
    const allRules = [...new Set([...productRules, ...marketRules])];

    res.json({
      success: true,
      rules: allRules.map(rule => ({
        id: rule.id,
        category: rule.category,
        requirement: rule.requirement,
        description: rule.description,
        severity: rule.severity,
        autoFixable: rule.autoFixable,
        fixSuggestion: rule.fixSuggestion
      })),
      totalRules: allRules.length,
      criticalRules: allRules.filter(r => r.severity === 'critical').length
    });

  } catch (error) {
    console.error('Get validation rules error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve validation rules'
    });
  }
};

// Bulk compliance validation
export const validateBulkCompliance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { products, targetMarket = 'US' } = req.body;
    const userId = req.userId || 'system';

    if (!Array.isArray(products) || products.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Products array is required'
      });
      return;
    }

    const bulkResult = await complianceService.validateBulkProducts(
      products,
      userId
    );

    res.json({
      success: true,
      summary: {
        totalProducts: bulkResult.totalProducts,
        passed: bulkResult.passed,
        failed: bulkResult.failed,
        averageScore: bulkResult.avgScore,
        criticalIssues: bulkResult.criticalIssues
      },
      detailedResults: bulkResult.detailedResults
    });

  } catch (error) {
    console.error('Bulk validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk validation failed'
    });
  }
};

// Generate compliance report
export const generateComplianceReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { rfqId } = req.params;

    const rfq = await RFQ.findById(rfqId)
      .populate('buyerId')
      .populate('supplierId');

    if (!rfq) {
      res.status(404).json({
        success: false,
        message: 'RFQ not found'
      });
      return;
    }

    // Generate comprehensive report
    const report = {
      rfqDetails: {
        id: rfq._id,
        title: rfq.title,
        productType: rfq.productType,
        createdAt: rfq.createdAt,
        buyer: rfq.buyerId,
        supplier: rfq.supplierId
      },
      complianceStatus: {
        overallStatus: rfq.complianceStatus,
        score: rfq.complianceScore,
        lastValidated: rfq.lastValidated,
        errors: rfq.complianceErrors || []
      },
      requiredCertifications: [],
      marketCompliance: {},
      recommendations: [],
      estimatedCompletionTime: '2-3 days'
    };

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate compliance report'
    });
  }
};

// Fix compliance issues automatically where possible
export const autoFixCompliance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { rfqId, issues } = req.body;

    // This would implement automated fixes for certain issues
    // For now, return suggested fixes
    const fixes = issues.map((issue: any) => ({
      issue: issue.description,
      fixable: issue.autoFixable,
      suggestedFix: issue.fixSuggestion || 'Manual review required'
    }));

    res.json({
      success: true,
      fixes,
      message: 'Review suggested fixes before applying'
    });

  } catch (error) {
    console.error('Auto-fix error:', error);
    res.status(500).json({
      success: false,
      message: 'Auto-fix failed'
    });
  }
};
