// Type definitions for compliance validation
export interface ComplianceValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ComplianceValidationOptions {
  checkAllergens?: boolean;
  checkCertifications?: boolean;
  checkLabeling?: boolean;
  targetCountries?: string[];
}

// Main compliance validator object
export const complianceValidator = {
  validateProduct: (
    productData: any,
    options: ComplianceValidationOptions = {}
  ): ComplianceValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!productData) {
      errors.push('Product data is required');
      return { isValid: false, errors, warnings };
    }

    // Allergen validation
    if (options.checkAllergens && !productData.allergens) {
      warnings.push('Allergen information not provided');
    }

    // Certification validation
    if (options.checkCertifications && !productData.certifications) {
      warnings.push('No certifications found');
    }

    // Labeling validation
    if (options.checkLabeling) {
      if (!productData.nutritionalInfo) {
        errors.push('Nutritional information is required for labeling');
      }
      if (!productData.ingredients) {
        errors.push('Ingredients list is required');
      }
    }

    // Country-specific validation
    if (options.targetCountries) {
      for (const country of options.targetCountries) {
        if (country === 'US' && !productData.fdaApproved) {
          warnings.push('FDA approval status not confirmed for US market');
        }
        if (country === 'EU' && !productData.ceMarking) {
          warnings.push('CE marking not confirmed for EU market');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  },

  validateRFQ: (rfqData: any): ComplianceValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!rfqData.title || rfqData.title.trim().length < 3) {
      errors.push('RFQ title must be at least 3 characters');
    }

    if (!rfqData.description || rfqData.description.trim().length < 10) {
      errors.push('RFQ description must be at least 10 characters');
    }

    if (!rfqData.quantity || rfqData.quantity <= 0) {
      errors.push('Quantity must be greater than 0');
    }

    if (!rfqData.deliveryDate) {
      errors.push('Delivery date is required');
    } else {
      const deliveryDate = new Date(rfqData.deliveryDate);
      const now = new Date();
      if (deliveryDate <= now) {
        errors.push('Delivery date must be in the future');
      }
    }

    if (!rfqData.specifications || Object.keys(rfqData.specifications).length === 0) {
      warnings.push('No specifications provided - this may limit supplier responses');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
};

// Default export
export default complianceValidator;
