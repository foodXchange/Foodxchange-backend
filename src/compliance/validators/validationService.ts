// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\src\compliance\validators\validationService.ts

import { validateProductSpecification, validateFieldRealTime, ValidationHistory } from './specificationValidator';
const Product = require('../../../models/Product');
const RFQ = require('../../../models/RFQ');

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

export class ComplianceValidationService {
  private validationHistory: ValidationHistory;
  private auditLog: Map<string, AuditEntry[]>;

  constructor() {
    this.validationHistory = new ValidationHistory();
    this.auditLog = new Map();
  }

  // Main validation method for RFQ specifications
  async validateRFQSpecifications(
    rfqId: string,
    productType: string,
    specifications: any,
    userId: string
  ): Promise<ComplianceValidationResult> {
    const startTime = Date.now();
    
    // Log validation attempt
    this.addAuditEntry(rfqId, {
      timestamp: new Date(),
      action: 'VALIDATION_STARTED',
      field: 'full_specification',
      oldValue: null,
      newValue: specifications,
      userId,
      impact: 'medium'
    });

    // Run core validation
    const validationResult = await validateProductSpecification(productType, specifications);
    
    // Calculate estimated fix time based on errors
    const estimatedFixTime = this.calculateFixTime(validationResult.errors);
    
    // Determine required certifications
    const certificationsRequired = this.determineRequiredCertifications(
      productType,
      specifications,
      validationResult
    );

    // Build comprehensive result
    const result: ComplianceValidationResult = {
      productId: specifications.productId,
      rfqId,
      timestamp: new Date(),
      validationScore: validationResult.score,
      passed: validationResult.isValid && validationResult.score >= 80,
      criticalErrors: validationResult.errors
        .filter(e => e.severity === 'error')
        .map(e => e.message),
      warnings: validationResult.warnings,
      suggestions: validationResult.errors
        .filter(e => e.suggestion)
        .map(e => e.suggestion!),
      certificationsRequired,
      estimatedFixTime,
      auditLog: this.getAuditLog(rfqId)
    };

    // Save to history
    this.validationHistory.addValidation(specifications.productId, result);

    // Log validation completion
    this.addAuditEntry(rfqId, {
      timestamp: new Date(),
      action: 'VALIDATION_COMPLETED',
      field: 'validation_result',
      oldValue: null,
      newValue: {
        passed: result.passed,
        score: result.validationScore,
        errorCount: result.criticalErrors.length
      },
      userId,
      impact: result.passed ? 'low' : 'high'
    });

    return result;
  }

  // Real-time field validation during data entry
  async validateFieldChange(
    rfqId: string,
    fieldPath: string,
    oldValue: any,
    newValue: any,
    productType: string,
    userId: string
  ): Promise<{
    isValid: boolean;
    message?: string;
    suggestion?: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
  }> {
    // Validate the field
    const validation = await validateFieldRealTime(fieldPath, newValue, productType);
    
    // Determine impact
    const impact = this.assessFieldImpact(fieldPath, oldValue, newValue);
    
    // Log the change
    this.addAuditEntry(rfqId, {
      timestamp: new Date(),
      action: 'FIELD_CHANGED',
      field: fieldPath,
      oldValue,
      newValue,
      userId,
      impact
    });

    return {
      ...validation,
      impact
    };
  }

  // Bulk validation for multiple products
  async validateBulkProducts(
    products: Array<{
      productId: string;
      productType: string;
      specifications: any;
    }>,
    userId: string
  ): Promise<{
    totalProducts: number;
    passed: number;
    failed: number;
    avgScore: number;
    criticalIssues: string[];
    detailedResults: ComplianceValidationResult[];
  }> {
    const results: ComplianceValidationResult[] = [];
    let totalScore = 0;
    const criticalIssues = new Set<string>();

    for (const product of products) {
      const result = await this.validateRFQSpecifications(
        `bulk_${Date.now()}`,
        product.productType,
        product.specifications,
        userId
      );
      
      results.push(result);
      totalScore += result.validationScore;
      
      result.criticalErrors.forEach(error => criticalIssues.add(error));
    }

    return {
      totalProducts: products.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      avgScore: totalScore / products.length,
      criticalIssues: Array.from(criticalIssues),
      detailedResults: results
    };
  }

  // Market-specific compliance check
  async validateForMarket(
    specifications: any,
    targetMarket: string,
    productType: string
  ): Promise<{
    compliant: boolean;
    requirements: string[];
    missingElements: string[];
    marketSpecificWarnings: string[];
  }> {
    const marketRequirements = this.getMarketRequirements(targetMarket, productType);
    const missingElements: string[] = [];
    const warnings: string[] = [];

    // Check each market requirement
    for (const requirement of marketRequirements) {
      if (!this.checkRequirement(specifications, requirement)) {
        missingElements.push(requirement.description);
      }
    }

    // Market-specific warnings
    if (targetMarket === 'EU' && !specifications.complianceRequirements?.allergenLabeling) {
      warnings.push('EU requires comprehensive allergen labeling');
    }

    if (targetMarket === 'US' && productType === 'organic') {
      if (!specifications.complianceRequirements?.certifications?.includes('USDA Organic')) {
        warnings.push('USDA Organic certification required for organic claims in US');
      }
    }

    return {
      compliant: missingElements.length === 0,
      requirements: marketRequirements.map(r => r.description),
      missingElements,
      marketSpecificWarnings: warnings
    };
  }

  // Private helper methods
  private calculateFixTime(errors: any[]): string {
    const errorCount = errors.length;
    const criticalCount = errors.filter(e => e.severity === 'error').length;
    
    if (criticalCount === 0) return 'No fixes required';
    if (criticalCount <= 2) return '1-2 hours';
    if (criticalCount <= 5) return '2-4 hours';
    if (criticalCount <= 10) return '1-2 days';
    return '2-3 days';
  }

  private determineRequiredCertifications(
    productType: string,
    specifications: any,
    validationResult: any
  ): string[] {
    const certs = new Set<string>();

    // Basic food safety
    certs.add('FDA Food Safety');
    certs.add('HACCP');

    // Product-specific
    if (productType === 'organic' || specifications.organic) {
      certs.add('USDA Organic');
      certs.add('EU Organic');
    }

    if (specifications.kosher) {
      certs.add('Kosher Certification');
    }

    if (specifications.halal) {
      certs.add('Halal Certification');
    }

    if (specifications.glutenFree) {
      certs.add('Gluten-Free Certification');
    }

    // Add based on validation errors
    validationResult.errors.forEach((error: any) => {
      if (error.field.includes('allergen')) {
        certs.add('Allergen Control Certification');
      }
    });

    return Array.from(certs);
  }

  private assessFieldImpact(
    fieldPath: string,
    oldValue: any,
    newValue: any
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Critical fields
    if (fieldPath.includes('color') || fieldPath.includes('allergen')) {
      return 'critical';
    }
    
    // High impact fields
    if (fieldPath.includes('ingredient') || fieldPath.includes('certification')) {
      return 'high';
    }
    
    // Medium impact fields
    if (fieldPath.includes('dimension') || fieldPath.includes('weight')) {
      return 'medium';
    }
    
    return 'low';
  }

  private addAuditEntry(id: string, entry: AuditEntry) {
    if (!this.auditLog.has(id)) {
      this.auditLog.set(id, []);
    }
    this.auditLog.get(id)!.push(entry);
  }

  private getAuditLog(id: string): AuditEntry[] {
    return this.auditLog.get(id) || [];
  }

  private getMarketRequirements(market: string, productType: string): any[] {
    // This would connect to a comprehensive market requirements database
    const requirements = [];
    
    if (market === 'US') {
      requirements.push(
        { id: 'fda_registration', description: 'FDA Facility Registration' },
        { id: 'nutrition_facts', description: 'US Nutrition Facts Panel' },
        { id: 'gras', description: 'GRAS Status for Ingredients' }
      );
    }
    
    if (market === 'EU') {
      requirements.push(
        { id: 'ce_marking', description: 'CE Marking Compliance' },
        { id: 'eu_allergens', description: 'EU Allergen Labeling (14 allergens)' },
        { id: 'eu_nutrition', description: 'EU Nutrition Declaration' }
      );
    }
    
    return requirements;
  }

  private checkRequirement(specifications: any, requirement: any): boolean {
    // Implement specific requirement checks
    switch (requirement.id) {
      case 'fda_registration':
        return specifications.complianceRequirements?.certifications?.includes('FDA');
      case 'eu_allergens':
        return specifications.complianceRequirements?.allergenLabeling?.length >= 14;
      default:
        return true;
    }
  }
}

// Export singleton instance
export const complianceService = new ComplianceValidationService();