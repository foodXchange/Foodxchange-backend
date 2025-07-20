import { query } from 'express-validator';

export const searchValidationRules = {
  productSearch: [
    query('q')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 0, max: 200 })
      .withMessage('Query must be between 0 and 200 characters'),

    query('size')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Size must be between 1 and 100'),

    query('from')
      .optional()
      .isInt({ min: 0 })
      .withMessage('From must be a non-negative integer'),

    query('sort')
      .optional()
      .isIn(['relevance', 'price_asc', 'price_desc', 'rating', 'popularity', 'newest'])
      .withMessage('Invalid sort option'),

    query('priceMin')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum price must be a positive number'),

    query('priceMax')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum price must be a positive number'),

    query('category')
      .optional()
      .custom((value) => {
        if (Array.isArray(value)) {
          return value.every(cat => typeof cat === 'string' && cat.length <= 50);
        }
        return typeof value === 'string' && value.length <= 50;
      })
      .withMessage('Invalid category format'),

    query('supplier')
      .optional()
      .custom((value) => {
        if (Array.isArray(value)) {
          return value.every(sup => typeof sup === 'string' && sup.length <= 50);
        }
        return typeof value === 'string' && value.length <= 50;
      })
      .withMessage('Invalid supplier format'),

    query('inStock')
      .optional()
      .isBoolean()
      .withMessage('inStock must be a boolean'),

    query('certification')
      .optional()
      .custom((value) => {
        if (Array.isArray(value)) {
          return value.every(cert => typeof cert === 'string' && cert.length <= 50);
        }
        return typeof value === 'string' && value.length <= 50;
      })
      .withMessage('Invalid certification format'),

    query('lat')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),

    query('lon')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),

    query('distance')
      .optional()
      .matches(/^\d+(\.\d+)?(km|mi)$/)
      .withMessage('Distance must be in format "10km" or "5mi"'),

    query('nutritionFilters')
      .optional()
      .custom((value) => {
        try {
          if (typeof value === 'string') {
            const parsed = JSON.parse(value);
            return typeof parsed === 'object';
          }
          return false;
        } catch {
          return false;
        }
      })
      .withMessage('Nutrition filters must be valid JSON object')
  ],

  companySearch: [
    query('q')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 0, max: 200 })
      .withMessage('Query must be between 0 and 200 characters'),

    query('size')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Size must be between 1 and 100'),

    query('from')
      .optional()
      .isInt({ min: 0 })
      .withMessage('From must be a non-negative integer'),

    query('type')
      .optional()
      .custom((value) => {
        const validTypes = ['SUPPLIER', 'BUYER', 'DISTRIBUTOR', 'MANUFACTURER'];
        if (Array.isArray(value)) {
          return value.every(type => validTypes.includes(type));
        }
        return validTypes.includes(value);
      })
      .withMessage('Invalid company type'),

    query('industry')
      .optional()
      .custom((value) => {
        if (Array.isArray(value)) {
          return value.every(ind => typeof ind === 'string' && ind.length <= 50);
        }
        return typeof value === 'string' && value.length <= 50;
      })
      .withMessage('Invalid industry format'),

    query('verified')
      .optional()
      .isBoolean()
      .withMessage('Verified must be a boolean'),

    query('minRating')
      .optional()
      .isFloat({ min: 0, max: 5 })
      .withMessage('Minimum rating must be between 0 and 5'),

    query('lat')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),

    query('lon')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),

    query('distance')
      .optional()
      .matches(/^\d+(\.\d+)?(km|mi)$/)
      .withMessage('Distance must be in format "10km" or "5mi"')
  ],

  userSearch: [
    query('q')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 0, max: 200 })
      .withMessage('Query must be between 0 and 200 characters'),

    query('size')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Size must be between 1 and 100'),

    query('from')
      .optional()
      .isInt({ min: 0 })
      .withMessage('From must be a non-negative integer'),

    query('role')
      .optional()
      .isIn(['ADMIN', 'BUYER', 'SELLER', 'MANAGER'])
      .withMessage('Invalid user role'),

    query('verified')
      .optional()
      .isBoolean()
      .withMessage('Verified must be a boolean'),

    query('active')
      .optional()
      .isBoolean()
      .withMessage('Active must be a boolean')
  ],

  orderSearch: [
    query('q')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 0, max: 200 })
      .withMessage('Query must be between 0 and 200 characters'),

    query('size')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Size must be between 1 and 100'),

    query('from')
      .optional()
      .isInt({ min: 0 })
      .withMessage('From must be a non-negative integer'),

    query('status')
      .optional()
      .isIn(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
      .withMessage('Invalid order status'),

    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('Date from must be a valid ISO date'),

    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('Date to must be a valid ISO date'),

    query('minAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Minimum amount must be a positive number'),

    query('maxAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Maximum amount must be a positive number')
  ],

  globalSearch: [
    query('q')
      .notEmpty()
      .isString()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Query must be between 2 and 200 characters'),

    query('size')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Size must be between 1 and 50'),

    query('from')
      .optional()
      .isInt({ min: 0 })
      .withMessage('From must be a non-negative integer'),

    query('indices')
      .optional()
      .custom((value) => {
        const validIndices = ['products', 'companies', 'users', 'orders'];
        if (Array.isArray(value)) {
          return value.every(index => validIndices.includes(index));
        }
        return validIndices.includes(value);
      })
      .withMessage('Invalid index name')
  ],

  suggestions: [
    query('q')
      .notEmpty()
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Query must be between 2 and 100 characters'),

    query('size')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Size must be between 1 and 20')
  ]
};
