import { Request, Response } from 'express';

import { ValidationError, NotFoundError } from '../../core/errors';
import { asyncHandler } from '../../core/errors';
import { Logger } from '../../core/logging/logger';
import { Product } from '../../models/Product';
import { EnhancedComplianceService } from '../../services/compliance/EnhancedComplianceService';

const logger = new Logger('ComplianceController');
const complianceService = new EnhancedComplianceService();

export class ComplianceController {
  /**
   * Run compliance check on a product
   */
  async checkProductCompliance(req: Request, res: Response): Promise<void> {
    try {
      const { productId, region, certifications } = req.body;

      // Validate inputs
      if (!productId) {
        throw new ValidationError('Product ID is required');
      }

      if (!region) {
        throw new ValidationError('Region is required for compliance check');
      }

      // Verify product exists
      const product = await Product.findById(productId);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      // Run compliance check
      const complianceResult = await complianceService.checkProductCompliance({
        productId,
        productData: {
          name: product.name,
          description: product.description,
          ingredients: (product as any).ingredients || [], // Add if needed
          nutritionalInfo: product.nutritionalInfo,
          allergens: product.foodSafety?.allergens || [],
          certifications: certifications || product.certifications,
          category: product.category,
          manufacturer: product.manufacturer,
          countryOfOrigin: product.countryOfOrigin
        },
        region,
        certifications: certifications || []
      });

      res.json({
        success: true,
        data: complianceResult
      });

    } catch (error) {
      logger.error('Compliance check error:', error);
      throw error;
    }
  }

  /**
   * Get compliance history for a product
   */
  async getComplianceHistory(req: Request, res: Response): Promise<void> {
    try {
      const { productId } = req.params;
      const { limit = 10, offset = 0 } = req.query;

      const history = await complianceService.getComplianceHistory(
        productId,
        Number(limit),
        Number(offset)
      );

      res.json({
        success: true,
        data: history
      });

    } catch (error) {
      logger.error('Get compliance history error:', error);
      throw error;
    }
  }

  /**
   * Verify certification
   */
  async verifyCertification(req: Request, res: Response): Promise<void> {
    try {
      const { certificationType, certificateNumber, issuer } = req.body;

      if (!certificationType || !certificateNumber || !issuer) {
        throw new ValidationError('Certificate type, number, and issuer are required');
      }

      const verificationResult = await complianceService.verifyCertification({
        type: certificationType,
        certificateNumber,
        issuer
      });

      res.json({
        success: true,
        data: verificationResult
      });

    } catch (error) {
      logger.error('Certificate verification error:', error);
      throw error;
    }
  }

  /**
   * Get compliance requirements by region
   */
  async getRegionalRequirements(req: Request, res: Response): Promise<void> {
    try {
      const { region } = req.params;
      const { category } = req.query;

      const requirements = await complianceService.getRegionalRequirements(
        region,
        category as string
      );

      res.json({
        success: true,
        data: requirements
      });

    } catch (error) {
      logger.error('Get regional requirements error:', error);
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(req: Request, res: Response): Promise<void> {
    try {
      const { productId, format = 'pdf' } = req.body;

      if (!productId) {
        throw new ValidationError('Product ID is required');
      }

      // Map format to reportType
      const reportTypeMap: Record<string, 'summary' | 'detailed' | 'regulatory' | 'audit'> = {
        'json': 'summary',
        'pdf': 'detailed', 
        'excel': 'regulatory'
      };
      
      const reportType = reportTypeMap[format as string] || 'summary';
      const report = await complianceService.generateComplianceReport(
        productId,
        reportType
      );

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      logger.error('Generate compliance report error:', error);
      throw error;
    }
  }

  /**
   * Bulk compliance check
   */
  async bulkComplianceCheck(req: Request, res: Response): Promise<void> {
    try {
      const { productIds, region } = req.body;

      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        throw new ValidationError('Product IDs array is required');
      }

      if (!region) {
        throw new ValidationError('Region is required');
      }

      const results = await Promise.all(
        productIds.map(async (productId) => {
          try {
            const product = await Product.findById(productId);
            if (!product) {
              return {
                productId,
                success: false,
                error: 'Product not found'
              };
            }

            const result = await complianceService.checkProductCompliance({
              productId,
              productData: {
                name: product.name,
                description: product.description,
                ingredients: (product as any).ingredients || [], // Add if needed
                nutritionalInfo: product.nutritionalInfo,
                allergens: product.foodSafety?.allergens || [],
                certifications: product.certifications,
                category: product.category,
                manufacturer: product.manufacturer,
                countryOfOrigin: product.countryOfOrigin
              },
              region,
              certifications: product.certifications || []
            });

            return {
              productId,
              success: true,
              result
            };
          } catch (error) {
            return {
              productId,
              success: false,
              error: error.message
            };
          }
        })
      );

      res.json({
        success: true,
        data: {
          total: productIds.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results
        }
      });

    } catch (error) {
      logger.error('Bulk compliance check error:', error);
      throw error;
    }
  }

  /**
   * Get compliance statistics
   */
  async getComplianceStats(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, region, category } = req.query;

      const stats = await complianceService.getComplianceStatistics({
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        region: region as string,
        category: category as string
      });

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Get compliance stats error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const complianceController = new ComplianceController();
