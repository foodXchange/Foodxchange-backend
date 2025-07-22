import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain, body, param, query } from 'express-validator';
import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

import { Logger } from '../core/logging/logger';


const logger = new Logger('AdvancedValidation');

/**
 * Enhanced validation middleware with detailed error reporting
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((error: any) => ({
      field: error.param || error.path,
      message: error.msg,
      value: error.value,
      location: error.location
    }));

    logger.warn('Validation failed', {
      ip: req.ip,
      path: req.path,
      errors: formattedErrors
    });

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: formattedErrors
      }
    });
  }

  next();
};

/**
 * Custom validators for food industry specific validations
 */
export const foodIndustryValidators = {
  // Validate GTIN (Global Trade Item Number)
  isGTIN: (value: string): boolean => {
    const gtin = value.replace(/\D/g, '');
    if (![8, 12, 13, 14].includes(gtin.length)) return false;

    // Validate check digit
    const digits = gtin.split('').map(Number);
    const checkDigit = digits.pop();
    const sum = digits.reduce((acc, digit, index) => {
      return acc + (digit * (index % 2 === 0 ? 1 : 3));
    }, 0);

    return (10 - (sum % 10)) % 10 === checkDigit;
  },

  // Validate lot/batch code format
  isValidLotCode: (value: string): boolean => {
    // Format: YYMMDD-XXXX or custom format
    const pattern = /^[A-Z0-9]{2,}-[A-Z0-9]{4,}$/i;
    return pattern.test(value);
  },

  // Validate temperature range
  isValidTemperature: (value: number, unit: 'C' | 'F' = 'C'): boolean => {
    if (unit === 'C') {
      return value >= -273.15 && value <= 1000; // Absolute zero to reasonable max
    }
    return value >= -459.67 && value <= 1832; // Fahrenheit equivalent

  },

  // Validate shelf life format
  isValidShelfLife: (value: string): boolean => {
    // Format: "30 days", "6 months", "2 years"
    const pattern = /^\d+\s+(days?|months?|years?)$/i;
    return pattern.test(value);
  },

  // Validate food allergens
  isValidAllergen: (value: string): boolean => {
    const validAllergens = [
      'milk', 'eggs', 'fish', 'shellfish', 'tree nuts',
      'peanuts', 'wheat', 'soybeans', 'sesame'
    ];
    return validAllergens.includes(value.toLowerCase());
  }
};

/**
 * Sanitization functions
 */
export const sanitizers = {
  // Sanitize HTML content
  sanitizeHTML: (value: string): string => {
    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      ALLOWED_ATTR: ['href']
    });
  },

  // Sanitize file paths
  sanitizeFilePath: (value: string): string => {
    return value.replace(/[^a-zA-Z0-9\-_\/\.]/g, '');
  },

  // Sanitize product names
  sanitizeProductName: (value: string): string => {
    return value
      .replace(/[<>\"']/g, '') // Remove potentially harmful characters
      .trim()
      .substring(0, 200); // Limit length
  },

  // Sanitize monetary values
  sanitizeCurrency: (value: string): number => {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
  }
};

/**
 * Common validation chains
 */
export const commonValidations = {
  // Email validation
  email: () =>
    body('email')
      .trim()
      .toLowerCase()
      .isEmail()
      .withMessage('Invalid email format')
      .normalizeEmail(),

  // Password validation
  password: () =>
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number and special character'),

  // Phone validation
  phone: () =>
    body('phone')
      .optional()
      .isMobilePhone('any')
      .withMessage('Invalid phone number'),

  // MongoDB ObjectId validation
  mongoId: (field: string) =>
    param(field)
      .isMongoId()
      .withMessage(`Invalid ${field} ID`),

  // Pagination validation
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],

  // Date range validation
  dateRange: () => [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format')
      .custom((value, { req }) => {
        if (req.query.startDate && value) {
          return new Date(value) >= new Date(req.query.startDate);
        }
        return true;
      })
      .withMessage('End date must be after start date')
  ],

  // Price validation
  price: (field: string = 'price') =>
    body(field)
      .isFloat({ min: 0 })
      .withMessage('Price must be a positive number')
      .customSanitizer(value => Math.round(value * 100) / 100),

  // URL validation
  url: (field: string) =>
    body(field)
      .optional()
      .isURL({ protocols: ['http', 'https'] })
      .withMessage('Invalid URL format')
};

/**
 * Food industry specific validations
 */
export const foodValidations = {
  // Product validation
  product: () => [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Product name is required')
      .isLength({ min: 2, max: 200 })
      .withMessage('Product name must be between 2 and 200 characters')
      .customSanitizer(sanitizers.sanitizeProductName),

    body('category')
      .notEmpty()
      .withMessage('Category is required')
      .isIn(['beverages', 'dairy', 'meat', 'seafood', 'produce', 'packaged_foods'])
      .withMessage('Invalid category'),

    body('gtin')
      .optional()
      .custom(foodIndustryValidators.isGTIN)
      .withMessage('Invalid GTIN format'),

    body('nutritionalInfo')
      .optional()
      .isObject()
      .withMessage('Nutritional info must be an object'),

    body('allergens')
      .optional()
      .isArray()
      .withMessage('Allergens must be an array')
      .custom((allergens: string[]) =>
        allergens.every(a => foodIndustryValidators.isValidAllergen(a))
      )
      .withMessage('Invalid allergen specified')
  ],

  // Temperature validation
  temperature: () => [
    body('temperature.min')
      .optional()
      .isFloat()
      .custom(value => foodIndustryValidators.isValidTemperature(value))
      .withMessage('Invalid minimum temperature'),

    body('temperature.max')
      .optional()
      .isFloat()
      .custom(value => foodIndustryValidators.isValidTemperature(value))
      .withMessage('Invalid maximum temperature')
      .custom((value, { req }) => {
        if (req.body.temperature?.min !== undefined) {
          return value > req.body.temperature.min;
        }
        return true;
      })
      .withMessage('Maximum temperature must be greater than minimum')
  ],

  // Certification validation
  certification: () => [
    body('certifications.*.type')
      .notEmpty()
      .isIn(['organic', 'kosher', 'halal', 'non-gmo', 'fair-trade', 'haccp', 'iso22000'])
      .withMessage('Invalid certification type'),

    body('certifications.*.number')
      .notEmpty()
      .matches(/^[A-Z0-9-]+$/i)
      .withMessage('Invalid certification number format'),

    body('certifications.*.validUntil')
      .isISO8601()
      .withMessage('Invalid certification expiry date')
      .custom(value => new Date(value) > new Date())
      .withMessage('Certification has expired')
  ],

  // Batch/Lot validation
  batch: () => [
    body('lotCode')
      .notEmpty()
      .custom(foodIndustryValidators.isValidLotCode)
      .withMessage('Invalid lot code format'),

    body('productionDate')
      .isISO8601()
      .withMessage('Invalid production date')
      .custom(value => new Date(value) <= new Date())
      .withMessage('Production date cannot be in the future'),

    body('expiryDate')
      .isISO8601()
      .withMessage('Invalid expiry date')
      .custom((value, { req }) => {
        const prodDate = new Date(req.body.productionDate);
        const expDate = new Date(value);
        return expDate > prodDate;
      })
      .withMessage('Expiry date must be after production date')
  ]
};

/**
 * Conditional validation helper
 */
export const conditionalValidation = (
  condition: (req: Request) => boolean,
  validations: ValidationChain[]
): ValidationChain[] => {
  return validations.map(validation =>
    validation.if(condition)
  );
};

/**
 * Dynamic validation based on user role
 */
export const roleBasedValidation = (validations: {
  [role: string]: ValidationChain[]
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role || 'guest';
    const roleValidations = validations[userRole] || validations['default'] || [];

    Promise.all(roleValidations.map(async validation => validation.run(req)))
      .then(() => validateRequest(req, res, next))
      .catch(next);
  };
};

/**
 * Custom validation error formatter
 */
export const formatValidationErrors = (errors: any[]) => {
  const formatted: { [key: string]: string[] } = {};

  errors.forEach(error => {
    if (!formatted[error.param]) {
      formatted[error.param] = [];
    }
    formatted[error.param].push(error.msg);
  });

  return formatted;
};

export default {
  validateRequest,
  foodIndustryValidators,
  sanitizers,
  commonValidations,
  foodValidations,
  conditionalValidation,
  roleBasedValidation,
  formatValidationErrors
};
