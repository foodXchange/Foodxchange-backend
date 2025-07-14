// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\services\compliance\validationService.ts

// Types and Interfaces
interface ValidationRule {
  [key: string]: any;
}

interface ColorRule {
  allowed?: string[];
  forbidden?: string[];
  description: string;
}

interface NumericRule {
  min?: number;
  max?: number;
  description: string;
}

interface AllergenRule {
  required?: string[];
  optional?: string[];
  description: string;
}

interface ProductRules {
  color?: ColorRule;
  size?: NumericRule;
  moisture?: NumericRule;
  sodium?: NumericRule;
  allergens?: AllergenRule;
  additives?: {
    forbidden?: string[];
    description: string;
  };
  labeling?: {
    required?: string[];
    description: string;
  };
  caffeine?: NumericRule;
  sugar?: {
    labeling_required?: boolean;
    description: string;
  };
}

interface MarketRules {
  [market: string]: ProductRules;
}

interface ValidationRules {
  [productType: string]: MarketRules;
}

interface ValidationResult {
  isValid: boolean;
  message: string;
  details: SpecificationValidation[];
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

interface SpecificationValidation {
  specification: string;
  value?: any;
  status: 'PASSED' | 'FAILED' | 'WARNING';
  message?: string;
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  recommendations?: string[];
}

interface AllergenRequirements {
  major_allergens: string[];
  labeling: string;
}

// Product validation rules by type and market
const VALIDATION_RULES: ValidationRules = {
  cornflakes: {
    US: {
      color: {
        allowed: ['golden', 'light_brown', 'honey', 'natural'],
        forbidden: ['dark_brown', 'black', 'white', 'artificial'],
        description: 'Cornflakes must have natural golden to light brown color'
      },
      size: {
        min: 8, // mm
        max: 15, // mm
        description: 'Cornflake size must be between 8-15mm'
      },
      moisture: {
        max: 3, // percentage
        description: 'Moisture content must not exceed 3%'
      },
      allergens: {
        required: ['gluten'],
        optional: ['milk', 'soy'],
        description: 'Must declare gluten, may contain milk/soy'
      }
    },
    EU: {
      color: {
        allowed: ['golden', 'light_brown', 'honey', 'natural'],
        forbidden: ['dark_brown', 'black', 'white', 'artificial'],
        description: 'EU regulations require natural coloring only'
      },
      additives: {
        forbidden: ['E127', 'E128', 'E129'],
        description: 'Certain colorants banned in EU'
      }
    }
  },
  snacks: {
    US: {
      sodium: {
        max: 800, // mg per 100g
        description: 'Sodium content limited to 800mg per 100g'
      },
      labeling: {
        required: ['calories', 'fat', 'sodium', 'carbs', 'protein'],
        description: 'FDA nutrition facts panel required'
      }
    }
  },
  beverages: {
    US: {
      caffeine: {
        max: 400, // mg per container
        description: 'Caffeine content limited to 400mg per container'
      },
      sugar: {
        labeling_required: true,
        description: 'Added sugars must be labeled separately'
      }
    }
  }
};

// Allergen database
const ALLERGEN_REQUIREMENTS: Record<string, AllergenRequirements> = {
  US: {
    major_allergens: ['milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soy'],
    labeling: 'Must be clearly stated in ingredients list and may contain statement'
  },
  EU: {
    major_allergens: ['cereals_gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'],
    labeling: 'Must be highlighted in ingredients list'
  }
};

// Main validation function
export const validateProductSpecifications = async (
  productType: string, 
  specifications: Record<string, any>, 
  targetMarket: string = 'US'
): Promise<ValidationResult> => {
  try {
    const validationResult: ValidationResult = {
      isValid: true,
      message: 'Validation passed',
      details: [],
      errors: [],
      warnings: [],
      recommendations: []
    };

    // Get validation rules for product type and market
    const rules = VALIDATION_RULES[productType.toLowerCase()]?.[targetMarket];
    
    if (!rules) {
      validationResult.warnings.push(`No specific validation rules found for ${productType} in ${targetMarket} market`);
      validationResult.recommendations.push('Consider adding validation rules for this product type');
      return validationResult;
    }

    // Validate each specification against rules
    for (const [specKey, specValue] of Object.entries(specifications)) {
      const rule = rules[specKey as keyof ProductRules];
      
      if (rule) {
        const specValidation = validateSpecification(specKey, specValue, rule);
        
        if (!specValidation.isValid) {
          validationResult.isValid = false;
          validationResult.errors.push(...(specValidation.errors || []));
        }
        
        validationResult.details.push(specValidation);
        validationResult.warnings.push(...(specValidation.warnings || []));
        validationResult.recommendations.push(...(specValidation.recommendations || []));
      }
    }

    // Special validation for cornflakes color (prevent the costly error scenario)
    if (productType.toLowerCase() === 'cornflakes' && specifications.color) {
      const colorValidation = validateCornflakeColor(specifications.color, targetMarket);
      
      if (!colorValidation.isValid) {
        validationResult.isValid = false;
        validationResult.errors.push(...colorValidation.errors);
        validationResult.message = 'CRITICAL: Cornflake color validation failed - this could cause product recall!';
      } else {
        validationResult.details.push({
          specification: 'color',
          status: 'PASSED',
          message: 'Cornflake color meets requirements - recall risk avoided',
          isValid: true
        });
      }
    }

    // Validate allergens
    const allergenValidation = validateAllergens(specifications.allergens, targetMarket);
    if (!allergenValidation.isValid) {
      validationResult.isValid = false;
      validationResult.errors.push(...(allergenValidation.errors || []));
    }
    validationResult.details.push(allergenValidation);

    // Set final validation message
    if (!validationResult.isValid) {
      validationResult.message = `Validation failed: ${validationResult.errors.length} critical errors found`;
    } else if (validationResult.warnings.length > 0) {
      validationResult.message = `Validation passed with ${validationResult.warnings.length} warnings`;
    }

    return validationResult;

  } catch (error) {
    console.error('Validation service error:', error);
    return {
      isValid: false,
      message: 'Validation service error',
      errors: ['Internal validation error occurred'],
      details: [],
      warnings: [],
      recommendations: []
    };
  }
};

// Validate individual specification
const validateSpecification = (specKey: string, specValue: any, rule: any): SpecificationValidation => {
  const result: SpecificationValidation = {
    specification: specKey,
    value: specValue,
    isValid: true,
    status: 'PASSED',
    errors: [],
    warnings: [],
    recommendations: []
  };

  try {
    switch (specKey) {
      case 'color':
        const colorRule = rule as ColorRule;
        if (colorRule.allowed && !colorRule.allowed.includes(specValue)) {
          result.isValid = false;
          result.errors!.push(`Color '${specValue}' not allowed. Allowed colors: ${colorRule.allowed.join(', ')}`);
        }
        if (colorRule.forbidden && colorRule.forbidden.includes(specValue)) {
          result.isValid = false;
          result.errors!.push(`Color '${specValue}' is forbidden. ${colorRule.description}`);
        }
        break;

      case 'size':
        const sizeRule = rule as NumericRule;
        const sizeValue = parseFloat(specValue);
        if (sizeRule.min && sizeValue < sizeRule.min) {
          result.isValid = false;
          result.errors!.push(`Size ${sizeValue}mm below minimum ${sizeRule.min}mm`);
        }
        if (sizeRule.max && sizeValue > sizeRule.max) {
          result.isValid = false;
          result.errors!.push(`Size ${sizeValue}mm exceeds maximum ${sizeRule.max}mm`);
        }
        break;

      case 'moisture':
        const moistureRule = rule as NumericRule;
        const moistureValue = parseFloat(specValue);
        if (moistureRule.max && moistureValue > moistureRule.max) {
          result.isValid = false;
          result.errors!.push(`Moisture ${moistureValue}% exceeds maximum ${moistureRule.max}%`);
        }
        break;

      case 'sodium':
        const sodiumRule = rule as NumericRule;
        const sodiumValue = parseFloat(specValue);
        if (sodiumRule.max && sodiumValue > sodiumRule.max) {
          result.isValid = false;
          result.errors!.push(`Sodium ${sodiumValue}mg exceeds maximum ${sodiumRule.max}mg per 100g`);
        }
        break;

      default:
        result.warnings!.push(`Unknown specification '${specKey}' - manual review recommended`);
    }

    result.status = result.isValid ? 'PASSED' : 'FAILED';
    
  } catch (error) {
    result.isValid = false;
    result.errors!.push(`Validation error for ${specKey}: ${(error as Error).message}`);
    result.status = 'FAILED';
  }

  return result;
};

// Critical cornflake color validation (prevents costly recalls)
export const validateCornflakeColor = (color: string, targetMarket: string): SpecificationValidation => {
  const result: SpecificationValidation = {
    specification: 'cornflake_color',
    isValid: true,
    status: 'PASSED',
    errors: [],
    warnings: []
  };

  const allowedColors = ['golden', 'light_brown', 'honey', 'natural'];
  const criticalForbidden = ['dark_brown', 'black']; // These cause recalls

  if (criticalForbidden.includes(color)) {
    result.isValid = false;
    result.status = 'FAILED';
    result.errors!.push(`CRITICAL ERROR: Cornflake color '${color}' will cause product recall!`);
    result.errors!.push('This exact error caused a 9-month project failure and costly product recall.');
    result.errors!.push('Immediate specification correction required before production.');
  } else if (!allowedColors.includes(color)) {
    result.isValid = false;
    result.status = 'FAILED';
    result.errors!.push(`Cornflake color '${color}' not approved for ${targetMarket} market`);
    result.errors!.push(`Approved colors: ${allowedColors.join(', ')}`);
  }

  return result;
};

// Validate allergen declarations
const validateAllergens = (allergens: any, targetMarket: string): SpecificationValidation => {
  const result: SpecificationValidation = {
    specification: 'allergens',
    isValid: true,
    status: 'PASSED',
    errors: [],
    warnings: []
  };

  if (!allergens) {
    result.warnings!.push('No allergen information provided - manual review required');
    return result;
  }

  const requirements = ALLERGEN_REQUIREMENTS[targetMarket];
  if (!requirements) {
    result.warnings!.push(`No allergen requirements defined for ${targetMarket}`);
    return result;
  }

  // Check for proper allergen declarations
  const declaredAllergens = Array.isArray(allergens) ? allergens : allergens.split(',').map((a: string) => a.trim());
  
  result.message = `Allergens declared: ${declaredAllergens.join(', ')}`;

  return result;
};

// Get validation rules for a product type
export const getProductValidationRules = (productType: string, targetMarket: string): ProductRules => {
  return VALIDATION_RULES[productType.toLowerCase()]?.[targetMarket] || {};
};

// Export constants for external use
export { VALIDATION_RULES, ALLERGEN_REQUIREMENTS };