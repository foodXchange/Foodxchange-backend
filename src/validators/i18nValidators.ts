import { body, param, query } from 'express-validator';

import { SUPPORTED_LANGUAGES } from '../config/i18n';

const supportedLanguageCodes = Object.keys(SUPPORTED_LANGUAGES);

export const i18nValidationRules = {
  translate: [
    body('key')
      .notEmpty()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Translation key must be between 1 and 200 characters'),

    body('language')
      .optional()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`),

    body('namespace')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Namespace must be between 1 and 50 characters'),

    body('interpolation')
      .optional()
      .isObject()
      .withMessage('Interpolation must be an object'),

    body('context')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Context must be between 1 and 50 characters'),

    body('count')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Count must be a non-negative integer'),

    body('defaultValue')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Default value must be between 1 and 500 characters')
  ],

  translateBulk: [
    body('translations')
      .isArray({ min: 1, max: 100 })
      .withMessage('Translations must be an array with 1-100 items'),

    body('translations.*.key')
      .notEmpty()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Each translation key must be between 1 and 200 characters'),

    body('translations.*.options.language')
      .optional()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`),

    body('translations.*.options.namespace')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Namespace must be between 1 and 50 characters'),

    body('language')
      .optional()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`)
  ],

  updatePreferences: [
    body('language')
      .notEmpty()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`),

    body('timezone')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Timezone must be between 1 and 50 characters'),

    body('dateFormat')
      .optional()
      .isString()
      .isIn(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY/MM/DD', 'DD.MM.YYYY', 'YYYY.MM.DD'])
      .withMessage('Invalid date format'),

    body('currency')
      .optional()
      .isString()
      .isLength({ min: 3, max: 3 })
      .isAlpha()
      .withMessage('Currency must be a 3-letter currency code'),

    body('numberFormat')
      .optional()
      .isString()
      .isIn(['1,234.56', '1.234,56', '1 234,56', '1 234.56'])
      .withMessage('Invalid number format')
  ],

  updateCompanyPreferences: [
    body('language')
      .notEmpty()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`),

    body('timezone')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Timezone must be between 1 and 50 characters'),

    body('defaultCurrency')
      .optional()
      .isString()
      .isLength({ min: 3, max: 3 })
      .isAlpha()
      .withMessage('Currency must be a 3-letter currency code'),

    body('businessLanguages')
      .optional()
      .isArray({ min: 1, max: 10 })
      .withMessage('Business languages must be an array with 1-10 items'),

    body('businessLanguages.*')
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Each business language must be one of: ${supportedLanguageCodes.join(', ')}`)
  ],

  formatCurrency: [
    body('amount')
      .notEmpty()
      .isNumeric()
      .withMessage('Amount must be a valid number'),

    body('currency')
      .notEmpty()
      .isString()
      .isLength({ min: 3, max: 3 })
      .isAlpha()
      .withMessage('Currency must be a 3-letter currency code'),

    body('language')
      .optional()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`)
  ],

  formatDate: [
    body('date')
      .notEmpty()
      .isISO8601()
      .withMessage('Date must be a valid ISO 8601 date'),

    body('language')
      .optional()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`),

    body('options')
      .optional()
      .isObject()
      .withMessage('Options must be an object'),

    body('options.year')
      .optional()
      .isIn(['numeric', '2-digit'])
      .withMessage('Year format must be "numeric" or "2-digit"'),

    body('options.month')
      .optional()
      .isIn(['numeric', '2-digit', 'long', 'short', 'narrow'])
      .withMessage('Month format must be "numeric", "2-digit", "long", "short", or "narrow"'),

    body('options.day')
      .optional()
      .isIn(['numeric', '2-digit'])
      .withMessage('Day format must be "numeric" or "2-digit"'),

    body('options.weekday')
      .optional()
      .isIn(['long', 'short', 'narrow'])
      .withMessage('Weekday format must be "long", "short", or "narrow"'),

    body('options.hour')
      .optional()
      .isIn(['numeric', '2-digit'])
      .withMessage('Hour format must be "numeric" or "2-digit"'),

    body('options.minute')
      .optional()
      .isIn(['numeric', '2-digit'])
      .withMessage('Minute format must be "numeric" or "2-digit"'),

    body('options.second')
      .optional()
      .isIn(['numeric', '2-digit'])
      .withMessage('Second format must be "numeric" or "2-digit"'),

    body('options.timeZone')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Timezone must be between 1 and 50 characters')
  ],

  formatNumber: [
    body('number')
      .notEmpty()
      .isNumeric()
      .withMessage('Number must be a valid number'),

    body('language')
      .optional()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`),

    body('options')
      .optional()
      .isObject()
      .withMessage('Options must be an object'),

    body('options.minimumFractionDigits')
      .optional()
      .isInt({ min: 0, max: 20 })
      .withMessage('Minimum fraction digits must be between 0 and 20'),

    body('options.maximumFractionDigits')
      .optional()
      .isInt({ min: 0, max: 20 })
      .withMessage('Maximum fraction digits must be between 0 and 20'),

    body('options.style')
      .optional()
      .isIn(['decimal', 'currency', 'percent', 'unit'])
      .withMessage('Number style must be "decimal", "currency", "percent", or "unit"')
  ],

  localizeContent: [
    body('content')
      .notEmpty()
      .isObject()
      .withMessage('Content must be an object'),

    body('language')
      .optional()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`)
  ],

  translateTemplate: [
    body('templateKey')
      .notEmpty()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Template key must be between 1 and 100 characters'),

    body('data')
      .optional()
      .isObject()
      .withMessage('Data must be an object'),

    body('language')
      .optional()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`)
  ],

  // Parameter validations
  languageParam: [
    param('language')
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`)
  ],

  namespaceParam: [
    param('namespace')
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .isAlphanumeric()
      .withMessage('Namespace must be alphanumeric and between 1-50 characters')
  ],

  // Query validations
  languageQuery: [
    query('language')
      .optional()
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`)
  ],

  paginationQuery: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),

    query('sort')
      .optional()
      .isIn(['name', 'code', 'usage', 'created', 'updated'])
      .withMessage('Sort must be one of: name, code, usage, created, updated'),

    query('order')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Order must be "asc" or "desc"')
  ]
};

// Composite validation rules
export const compositeValidationRules = {
  getTranslations: [
    ...i18nValidationRules.languageParam,
    ...i18nValidationRules.namespaceParam
  ],

  getLanguageInfo: [
    param('code')
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language code must be one of: ${supportedLanguageCodes.join(', ')}`)
  ],

  getRegionalSettings: [
    param('language')
      .isString()
      .isIn(supportedLanguageCodes)
      .withMessage(`Language must be one of: ${supportedLanguageCodes.join(', ')}`)
  ]
};
