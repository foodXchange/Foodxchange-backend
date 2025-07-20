// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\src\compliance\rules\complianceRules.ts

export interface ComplianceRule {
  id: string;
  category: string;
  productTypes: string[];
  markets: string[];
  requirement: string;
  description: string;
  validationFunction: (spec: any) => boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  autoFixable: boolean;
  fixSuggestion?: string;
}

export const ComplianceRulesDatabase: ComplianceRule[] = [
  // Color Compliance Rules
  {
    id: 'RULE_COLOR_001',
    category: 'visual_specification',
    productTypes: ['cornflakes', 'cereals'],
    markets: ['US', 'EU', 'UK'],
    requirement: 'Approved Color Range',
    description: 'Product color must be within approved range for food type',
    validationFunction: (spec) => {
      const color = spec.specifications?.visual?.primaryColor;
      if (!color) return false;

      // Check for prohibited artificial colors
      const prohibitedColors = ['blue', 'green', 'purple', 'red'];
      return !prohibitedColors.includes(color.colorName?.toLowerCase());
    },
    severity: 'critical',
    autoFixable: false,
    fixSuggestion: 'Review and update color specifications to approved natural colors'
  },

  // Allergen Labeling Rules
  {
    id: 'RULE_ALLERGEN_001',
    category: 'allergen_management',
    productTypes: ['all'],
    markets: ['US'],
    requirement: 'US Major Allergen Labeling',
    description: 'Must declare 9 major allergens: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame',
    validationFunction: (spec) => {
      const ingredients = spec.specifications?.ingredients || [];
      const declaredAllergens = spec.complianceRequirements?.allergenLabeling || [];

      const majorAllergens = ['milk', 'eggs', 'fish', 'shellfish', 'tree nuts', 'peanuts', 'wheat', 'soybeans', 'sesame'];
      const foundAllergens = ingredients.flatMap((i: any) => i.allergens || []);

      return foundAllergens.every((allergen: string) =>
        declaredAllergens.includes(allergen)
      );
    },
    severity: 'critical',
    autoFixable: true,
    fixSuggestion: 'Auto-populate allergen declarations from ingredient list'
  },

  {
    id: 'RULE_ALLERGEN_002',
    category: 'allergen_management',
    productTypes: ['all'],
    markets: ['EU'],
    requirement: 'EU 14 Allergen Declaration',
    description: 'Must declare 14 EU allergens including cereals containing gluten, crustaceans, eggs, fish, peanuts, soybeans, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs',
    validationFunction: (spec) => {
      const declaredAllergens = spec.complianceRequirements?.allergenLabeling || [];
      return declaredAllergens.length > 0;
    },
    severity: 'critical',
    autoFixable: true
  },

  // Nutrition Labeling Rules
  {
    id: 'RULE_NUTRITION_001',
    category: 'nutrition_labeling',
    productTypes: ['all'],
    markets: ['US'],
    requirement: 'US Nutrition Facts Panel',
    description: 'Must include serving size, calories, and required nutrients',
    validationFunction: (spec) => {
      const nutrition = spec.specifications?.nutritional;
      if (!nutrition) return false;

      const requiredFields = ['servingSize', 'calories', 'nutrients'];
      return requiredFields.every(field => nutrition[field] !== undefined);
    },
    severity: 'high',
    autoFixable: false
  },

  // Organic Certification Rules
  {
    id: 'RULE_ORGANIC_001',
    category: 'certification',
    productTypes: ['organic'],
    markets: ['US'],
    requirement: 'USDA Organic Certification',
    description: 'Products labeled as organic must have USDA Organic certification',
    validationFunction: (spec) => {
      if (spec.productName?.toLowerCase().includes('organic') ||
          spec.category?.toLowerCase().includes('organic')) {
        return spec.complianceRequirements?.certifications?.includes('USDA Organic');
      }
      return true;
    },
    severity: 'critical',
    autoFixable: false,
    fixSuggestion: 'Obtain USDA Organic certification or remove organic claims'
  },

  // Weight and Measure Rules
  {
    id: 'RULE_WEIGHT_001',
    category: 'weights_measures',
    productTypes: ['all'],
    markets: ['US', 'EU'],
    requirement: 'Net Weight Declaration',
    description: 'Must declare net weight in both metric and imperial units',
    validationFunction: (spec) => {
      const weight = spec.specifications?.dimensions?.weight;
      return weight?.value && weight.unit;
    },
    severity: 'high',
    autoFixable: false
  },

  // Shelf Life Rules
  {
    id: 'RULE_SHELF_001',
    category: 'shelf_life',
    productTypes: ['cereals', 'cornflakes'],
    markets: ['all'],
    requirement: 'Shelf Life Declaration',
    description: 'Must specify shelf life and storage conditions',
    validationFunction: (spec) => {
      return spec.shelfLife && spec.storageConditions;
    },
    severity: 'medium',
    autoFixable: false
  },

  // GMO Labeling Rules
  {
    id: 'RULE_GMO_001',
    category: 'gmo_labeling',
    productTypes: ['all'],
    markets: ['EU'],
    requirement: 'EU GMO Labeling',
    description: 'Products containing >0.9% GMO must be labeled',
    validationFunction: (spec) => {
      const hasGMO = spec.specifications?.ingredients?.some((i: any) =>
        i.gmo === true
      );

      if (hasGMO) {
        return spec.complianceRequirements?.gmoLabeling === true;
      }
      return true;
    },
    severity: 'high',
    autoFixable: true
  },

  // Country of Origin Rules
  {
    id: 'RULE_ORIGIN_001',
    category: 'origin_labeling',
    productTypes: ['all'],
    markets: ['US'],
    requirement: 'Country of Origin Labeling (COOL)',
    description: 'Must declare country of origin for certain products',
    validationFunction: (spec) => {
      return spec.countryOfOrigin !== undefined;
    },
    severity: 'medium',
    autoFixable: false
  },

  // Additive Compliance Rules
  {
    id: 'RULE_ADDITIVE_001',
    category: 'food_additives',
    productTypes: ['all'],
    markets: ['US', 'EU'],
    requirement: 'Approved Food Additives',
    description: 'All additives must be on approved lists for target markets',
    validationFunction: (spec) => {
      const ingredients = spec.specifications?.ingredients || [];
      const additives = ingredients.filter((i: any) => i.isAdditive);

      // This would check against approved additive databases
      return true; // Placeholder - would integrate with additive database
    },
    severity: 'high',
    autoFixable: false
  },

  // Packaging Material Rules
  {
    id: 'RULE_PACKAGE_001',
    category: 'packaging',
    productTypes: ['all'],
    markets: ['all'],
    requirement: 'Food-Grade Packaging',
    description: 'Packaging materials must be food-grade certified',
    validationFunction: (spec) => {
      return spec.specifications?.packaging?.foodGrade === true;
    },
    severity: 'critical',
    autoFixable: false
  }
];

// Helper function to get rules by criteria
export function getRulesByProduct(productType: string): ComplianceRule[] {
  return ComplianceRulesDatabase.filter(rule =>
    rule.productTypes.includes('all') || rule.productTypes.includes(productType)
  );
}

export function getRulesByMarket(market: string): ComplianceRule[] {
  return ComplianceRulesDatabase.filter(rule =>
    rule.markets.includes('all') || rule.markets.includes(market)
  );
}

export function getCriticalRules(): ComplianceRule[] {
  return ComplianceRulesDatabase.filter(rule => rule.severity === 'critical');
}

// Market-specific requirements database
export const MarketRequirements = {
  US: {
    mandatoryCertifications: ['FDA Facility Registration'],
    labelingRequirements: [
      'Nutrition Facts Panel',
      'Ingredient List (descending order by weight)',
      'Allergen Declaration',
      'Net Weight (dual declaration)',
      'Manufacturer Information'
    ],
    prohibitedIngredients: [
      'Cyclamate',
      'Certain artificial colors (in specific products)'
    ]
  },
  EU: {
    mandatoryCertifications: ['EU Food Business Registration'],
    labelingRequirements: [
      'Nutrition Declaration',
      'Ingredient List with percentages (QUID)',
      '14 Allergen Highlighting',
      'Net Weight (metric)',
      'Best Before Date',
      'Storage Conditions',
      'Business Operator Information'
    ],
    prohibitedIngredients: [
      'Certain GMO ingredients without labeling',
      'Various additives not on EU approved list'
    ]
  },
  UK: {
    mandatoryCertifications: ['UK Food Business Registration'],
    labelingRequirements: [
      'Similar to EU with UK-specific requirements',
      'UK address required'
    ],
    prohibitedIngredients: [
      'Similar to EU regulations'
    ]
  }
};

// Automated fix suggestions
export const AutomatedFixes = {
  allergenDeclaration: (ingredients: any[]) => {
    const allergens = new Set<string>();
    ingredients.forEach(ing => {
      if (ing.allergens) {
        ing.allergens.forEach((a: string) => allergens.add(a));
      }
    });
    return Array.from(allergens);
  },

  nutritionCalculation: (ingredients: any[]) => {
    // Would integrate with nutrition database
    return {
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0
    };
  }
};
