/**
 * Seller Validators
 * Input validation for seller-related operations
 */

import { body, param, query } from 'express-validator';

/**
 * Validation for seller registration
 */
export const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email address'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    }),
  
  body('firstName')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage('First name contains invalid characters'),
  
  body('lastName')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage('Last name contains invalid characters'),
  
  body('companyName')
    .isLength({ min: 2, max: 100 })
    .withMessage('Company name must be between 2 and 100 characters'),
  
  body('businessType')
    .isIn(['manufacturer', 'distributor', 'wholesaler', 'processor', 'other'])
    .withMessage('Business type must be one of: manufacturer, distributor, wholesaler, processor, other'),
  
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please enter a valid phone number'),
  
  body('address.street')
    .notEmpty()
    .withMessage('Street address is required'),
  
  body('address.city')
    .notEmpty()
    .withMessage('City is required'),
  
  body('address.postalCode')
    .notEmpty()
    .withMessage('Postal code is required'),
  
  body('address.country')
    .isLength({ min: 2 })
    .withMessage('Country is required'),
  
  body('acceptTerms')
    .equals('true')
    .withMessage('You must accept the terms and conditions')
];

/**
 * Validation for seller login
 */
export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  body('rememberMe')
    .optional()
    .isBoolean()
    .withMessage('Remember me must be a boolean value')
];

/**
 * Validation for seller profile update
 */
export const validateProfileUpdate = [
  body('firstName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage('First name contains invalid characters'),
  
  body('lastName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage('Last name contains invalid characters'),
  
  body('companyName')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Company name must be between 2 and 100 characters'),
  
  body('businessType')
    .optional()
    .isIn(['manufacturer', 'distributor', 'wholesaler', 'processor', 'other'])
    .withMessage('Business type must be one of: manufacturer, distributor, wholesaler, processor, other'),
  
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please enter a valid phone number'),
  
  body('website')
    .optional()
    .isURL()
    .withMessage('Please enter a valid website URL'),
  
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters')
];

/**
 * Validation for product creation
 */
export const validateProductCreation = [
  body('name')
    .isLength({ min: 2, max: 100 })
    .withMessage('Product name must be between 2 and 100 characters'),
  
  body('description')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Product description must be between 10 and 2000 characters'),
  
  body('category')
    .notEmpty()
    .withMessage('Product category is required'),
  
  body('price.amount')
    .isFloat({ gt: 0 })
    .withMessage('Price amount must be greater than 0'),
  
  body('price.currency')
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be 3 characters (e.g., USD)'),
  
  body('inventory.quantity')
    .isInt({ min: 0 })
    .withMessage('Inventory quantity must be a non-negative integer'),
  
  body('inventory.unit')
    .notEmpty()
    .withMessage('Inventory unit is required'),
  
  body('minimumOrder')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Minimum order must be at least 1'),
  
  body('specifications')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Specifications cannot exceed 1000 characters')
];

/**
 * Validation for proposal creation
 */
export const validateProposalCreation = [
  body('rfqId')
    .isMongoId()
    .withMessage('Invalid RFQ ID'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  
  body('items.*.rfqItemId')
    .isMongoId()
    .withMessage('Invalid RFQ item ID'),
  
  body('items.*.unitPrice')
    .isFloat({ gt: 0 })
    .withMessage('Unit price must be greater than 0'),
  
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  
  body('totalAmount')
    .isFloat({ gt: 0 })
    .withMessage('Total amount must be greater than 0'),
  
  body('currency')
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be 3 characters'),
  
  body('validUntil')
    .isISO8601()
    .withMessage('Valid until date must be in ISO format')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Valid until date must be in the future');
      }
      return true;
    }),
  
  body('terms.paymentTerms')
    .notEmpty()
    .withMessage('Payment terms are required'),
  
  body('terms.shippingTerms')
    .notEmpty()
    .withMessage('Shipping terms are required'),
  
  body('terms.deliveryTime')
    .notEmpty()
    .withMessage('Delivery time is required')
];

/**
 * Validation for order status update
 */
export const validateOrderStatusUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Invalid order ID'),
  
  body('status')
    .isIn(['pending', 'accepted', 'processing', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid order status'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  
  body('trackingNumber')
    .optional()
    .isLength({ min: 5, max: 50 })
    .withMessage('Tracking number must be between 5 and 50 characters')
];

/**
 * Validation for inventory update
 */
export const validateInventoryUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Invalid product ID'),
  
  body('quantity')
    .isInt({ min: 0 })
    .withMessage('Quantity must be a non-negative integer'),
  
  body('action')
    .isIn(['set', 'add', 'subtract'])
    .withMessage('Action must be one of: set, add, subtract')
];

/**
 * Validation for common query parameters
 */
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

/**
 * Validation for ID parameters
 */
export const validateIdParam = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format')
];