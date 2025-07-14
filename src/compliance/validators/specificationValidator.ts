// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\src\compliance\validators\specificationValidator.ts

import { z } from 'zod';

// Color validation rules for food products
export const FoodColorSpecification = z.object({
  colorName: z.string().min(1, "Color name is required"),
  pantoneCode: z.string().optional(),
  rgbValue: z.object({
    r: z.number().min(0).max(255),
    g: z.number().min(0).max(255),
    b: z.number().min(0).max(255)
  }).optional(),
  hexCode: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid hex color code").optional(),
  labValue: z.object({
    l: z.number(),
    a: z.number(),
    b: z.number()
  }).optional(),
  tolerance: z.object({
    deltaE: z.number().default(2.0),
    method: z.enum(['CIE76', 'CIE94', 'CIEDE2000']).default('CIEDE2000')
  }).optional()
});

// Product-specific color rules
export const ProductColorRules: Record<string, any> = {
  cornflakes: {
    allowedColors: ['golden', 'light golden', 'amber', 'honey'],
    prohibitedColors: ['green', 'blue', 'red', 'purple'],
    pantoneRange: ['7401C', '7402C', '7403C', '7404C', '7405C'],
    rgbRange: {
      r: { min: 200, max: 255 },
      g: { min: 150, max: 220 },
      b: { min: 50, max: 150 }
    }
  },
  cereals: {
    allowedColors: ['natural', 'brown', 'golden', 'honey', 'chocolate'],
    requiresApproval: ['red', 'green', 'blue', 'purple'],
    naturalOnly: ['organic', 'whole grain']
  }
};

// Dimension specifications
export const DimensionSpecification = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['mm', 'cm', 'inch']),
  tolerance: z.number().default(0.5),
  weight: z.object({
    value: z.number().positive(),
    unit: z.enum(['g', 'kg', 'oz', 'lb'])
  })
});

// Ingredient validation
export const IngredientSpecification = z.object({
  name: z.string().min(1),
  percentage: z.number().min(0).max(100),
  origin: z.string().optional(),
  allergens: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  maxAllowedVariation: z.number().default(2)
});

// Complete product specification schema
export const ProductSpecification = z.object({
  productId: z.string(),
  productName: z.string(),
  category: z.string(),
  specifications: z.object({
    visual: z.object({
      primaryColor: FoodColorSpecification,
      secondaryColors: z.array(FoodColorSpecification).optional(),
      pattern: z.string().optional(),
      surface: z.enum(['matte', 'glossy', 'semi-glossy']).optional()
    }),
    dimensions: DimensionSpecification,
    ingredients: z.array(IngredientSpecification),
    packaging: z.object({
      material: z.string(),
      printColors: z.array(FoodColorSpecification),
      recyclable: z.boolean(),
      foodGrade: z.boolean()
    }),
    nutritional: z.object({
      servingSize: z.string(),
      calories: z.number(),
      nutrients: z.record(z.number())
    })
  }),
  complianceRequirements: z.object({
    certifications: z.array(z.string()),
    allergenLabeling: z.array(z.string()),
    countrySpecific: z.record(z.any())
  })
});

// Main validation function
export async function validateProductSpecification(
  productType: string,
  specifications: any
): Promise<{
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    severity: 'error' | 'warning';
    suggestion?: string;
  }>;
  warnings: string[];
  score: number;
}> {
  const errors: Array<any> = [];
  const warnings: string[] = [];
  let score = 100;

  try {
    // Validate against schema
    const validatedSpec = ProductSpecification.parse(specifications);

    // Product-specific color validation
    if (ProductColorRules[productType]) {
      const rules = ProductColorRules[productType];
      const primaryColor = validatedSpec.specifications.visual.primaryColor;

      // Check allowed colors
      if (rules.allowedColors && !rules.allowedColors.includes(primaryColor.colorName.toLowerCase())) {
        errors.push({
          field: 'specifications.visual.primaryColor',
          message: `Color "${primaryColor.colorName}" is not allowed for ${productType}`,
          severity: 'error',
          suggestion: `Allowed colors: ${rules.allowedColors.join(', ')}`
        });
        score -= 30;
      }

      // Check prohibited colors
      if (rules.prohibitedColors && rules.prohibitedColors.includes(primaryColor.colorName.toLowerCase())) {
        errors.push({
          field: 'specifications.visual.primaryColor',
          message: `Color "${primaryColor.colorName}" is prohibited for ${productType}`,
          severity: 'error',
          suggestion: `This color will cause product rejection. Use approved colors: ${rules.allowedColors?.join(', ')}`
        });
        score -= 50;
      }

      // Check RGB range
      if (rules.rgbRange && primaryColor.rgbValue) {
        const rgb = primaryColor.rgbValue;
        if (
          rgb.r < rules.rgbRange.r.min || rgb.r > rules.rgbRange.r.max ||
          rgb.g < rules.rgbRange.g.min || rgb.g > rules.rgbRange.g.max ||
          rgb.b < rules.rgbRange.b.min || rgb.b > rules.rgbRange.b.max
        ) {
          errors.push({
            field: 'specifications.visual.primaryColor.rgbValue',
            message: `RGB values outside acceptable range for ${productType}`,
            severity: 'error',
            suggestion: `RGB should be: R(${rules.rgbRange.r.min}-${rules.rgbRange.r.max}), G(${rules.rgbRange.g.min}-${rules.rgbRange.g.max}), B(${rules.rgbRange.b.min}-${rules.rgbRange.b.max})`
          });
          score -= 25;
        }
      }
    }

    // Allergen validation
    const allergens = new Set<string>();
    validatedSpec.specifications.ingredients.forEach(ingredient => {
      ingredient.allergens?.forEach(allergen => allergens.add(allergen));
    });

    if (allergens.size > 0 && !validatedSpec.complianceRequirements.allergenLabeling?.length) {
      errors.push({
        field: 'complianceRequirements.allergenLabeling',
        message: 'Allergens detected in ingredients but not declared in labeling',
        severity: 'error',
        suggestion: `Add allergen declarations for: ${Array.from(allergens).join(', ')}`
      });
      score -= 20;
    }

    // Certification validation
    const requiredCerts = getRequiredCertifications(productType, specifications);
    const missingCerts = requiredCerts.filter(
      cert => !validatedSpec.complianceRequirements.certifications.includes(cert)
    );

    if (missingCerts.length > 0) {
      warnings.push(`Missing recommended certifications: ${missingCerts.join(', ')}`);
      score -= 5 * missingCerts.length;
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        errors.push({
          field: err.path.join('.'),
          message: err.message,
          severity: 'error'
        });
        score -= 10;
      });
    }
  }

  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings,
    score: Math.max(0, score)
  };
}

// Helper function to get required certifications
function getRequiredCertifications(productType: string, specifications: any): string[] {
  const certs: string[] = [];
  
  if (specifications.specifications?.ingredients?.some((i: any) => i.name.toLowerCase().includes('organic'))) {
    certs.push('USDA Organic');
  }
  
  if (productType === 'cornflakes' || productType === 'cereals') {
    certs.push('FDA Food Safety', 'HACCP');
  }
  
  return certs;
}

// Real-time validation for live updates
export async function validateFieldRealTime(
  fieldPath: string,
  value: any,
  productType: string
): Promise<{
  isValid: boolean;
  message?: string;
  suggestion?: string;
}> {
  // Implement field-specific validation
  if (fieldPath === 'specifications.visual.primaryColor.colorName') {
    const rules = ProductColorRules[productType];
    if (rules) {
      if (rules.prohibitedColors?.includes(value.toLowerCase())) {
        return {
          isValid: false,
          message: `"${value}" is a prohibited color for ${productType}`,
          suggestion: `Use one of: ${rules.allowedColors?.join(', ')}`
        };
      }
      if (rules.allowedColors && !rules.allowedColors.includes(value.toLowerCase())) {
        return {
          isValid: false,
          message: `"${value}" is not in the approved color list`,
          suggestion: `Approved colors: ${rules.allowedColors.join(', ')}`
        };
      }
    }
  }

  return { isValid: true };
}

// Export validation history tracker
export class ValidationHistory {
  private history: Map<string, any[]> = new Map();

  addValidation(productId: string, validation: any) {
    if (!this.history.has(productId)) {
      this.history.set(productId, []);
    }
    this.history.get(productId)!.push({
      ...validation,
      timestamp: new Date(),
      id: crypto.randomUUID()
    });
  }

  getHistory(productId: string) {
    return this.history.get(productId) || [];
  }

  getFailedValidations() {
    const failed: any[] = [];
    this.history.forEach((validations, productId) => {
      validations.forEach(v => {
        if (!v.isValid) {
          failed.push({ productId, ...v });
        }
      });
    });
    return failed;
  }
}