import { body, param, query } from 'express-validator';

export const abTestingValidationRules = {
  testId: [
    param('testId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Test ID must be between 1 and 100 characters')
  ],

  createTest: [
    body('name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Test name must be between 1 and 200 characters'),

    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),

    body('variants')
      .isArray({ min: 2, max: 10 })
      .withMessage('Must have between 2 and 10 variants'),

    body('variants.*.name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Variant name must be between 1 and 100 characters'),

    body('variants.*.description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Variant description cannot exceed 500 characters'),

    body('variants.*.trafficSplit')
      .isFloat({ min: 0, max: 100 })
      .withMessage('Traffic split must be between 0 and 100'),

    body('variants.*.configuration')
      .isObject()
      .withMessage('Variant configuration must be an object'),

    body('variants.*.isControl')
      .isBoolean()
      .withMessage('isControl must be a boolean'),

    body('targetCriteria')
      .optional()
      .isObject()
      .withMessage('Target criteria must be an object'),

    body('targetCriteria.userSegments')
      .optional()
      .isArray()
      .withMessage('User segments must be an array'),

    body('targetCriteria.geographicRegions')
      .optional()
      .isArray()
      .withMessage('Geographic regions must be an array'),

    body('targetCriteria.deviceTypes')
      .optional()
      .isArray()
      .withMessage('Device types must be an array'),

    body('targetCriteria.userRoles')
      .optional()
      .isArray()
      .withMessage('User roles must be an array'),

    body('targetCriteria.companyTypes')
      .optional()
      .isArray()
      .withMessage('Company types must be an array'),

    body('metrics')
      .isArray({ min: 1, max: 10 })
      .withMessage('Must have between 1 and 10 metrics'),

    body('metrics.*.name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Metric name must be between 1 and 100 characters'),

    body('metrics.*.type')
      .isIn(['conversion', 'revenue', 'engagement', 'retention', 'custom'])
      .withMessage('Metric type must be one of: conversion, revenue, engagement, retention, custom'),

    body('metrics.*.goal')
      .isIn(['increase', 'decrease'])
      .withMessage('Metric goal must be either increase or decrease'),

    body('metrics.*.primaryMetric')
      .isBoolean()
      .withMessage('primaryMetric must be a boolean'),

    body('metrics.*.customEventName')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Custom event name must be between 1 and 100 characters'),

    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO date')
      .custom((endDate) => {
        if (new Date(endDate) <= new Date()) {
          throw new Error('End date must be in the future');
        }
        return true;
      }),

    body('sampleSize')
      .optional()
      .isInt({ min: 100, max: 1000000 })
      .withMessage('Sample size must be between 100 and 1,000,000'),

    body('confidenceLevel')
      .optional()
      .isFloat({ min: 0.8, max: 0.99 })
      .withMessage('Confidence level must be between 0.8 and 0.99'),

    body('trafficAllocation')
      .optional()
      .isFloat({ min: 1, max: 100 })
      .withMessage('Traffic allocation must be between 1% and 100%'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  assignUser: [
    param('testId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Test ID must be between 1 and 100 characters'),

    body('context')
      .optional()
      .isObject()
      .withMessage('Context must be an object'),

    body('context.deviceType')
      .optional()
      .isString()
      .trim()
      .isIn(['desktop', 'mobile', 'tablet'])
      .withMessage('Device type must be one of: desktop, mobile, tablet'),

    body('context.region')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Region must be between 1 and 100 characters'),

    body('context.userAgent')
      .optional()
      .isString()
      .withMessage('User agent must be a string'),

    body('context.referrer')
      .optional()
      .isString()
      .withMessage('Referrer must be a string')
  ],

  recordEvent: [
    param('testId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Test ID must be between 1 and 100 characters'),

    body('eventType')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Event type must be between 1 and 100 characters'),

    body('value')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Value must be a non-negative number'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  recordConversion: [
    param('testId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Test ID must be between 1 and 100 characters'),

    body('conversionType')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversion type must be between 1 and 100 characters'),

    body('value')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Value must be a non-negative number')
  ],

  recordRevenue: [
    param('testId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Test ID must be between 1 and 100 characters'),

    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be greater than 0'),

    body('currency')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 3 })
      .withMessage('Currency must be a 3-character ISO code')
      .matches(/^[A-Z]{3}$/)
      .withMessage('Currency must be uppercase ISO format (e.g., USD, EUR)')
  ],

  // Advanced validation rules
  updateTest: [
    param('testId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Test ID must be between 1 and 100 characters'),

    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Test name must be between 1 and 200 characters'),

    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),

    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO date'),

    body('trafficAllocation')
      .optional()
      .isFloat({ min: 1, max: 100 })
      .withMessage('Traffic allocation must be between 1% and 100%')
  ],

  batchAssignment: [
    body('assignments')
      .isArray({ min: 1, max: 1000 })
      .withMessage('Assignments must be an array with 1-1000 items'),

    body('assignments.*.testId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Each test ID must be between 1 and 100 characters'),

    body('assignments.*.userId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Each user ID must be between 1 and 100 characters'),

    body('assignments.*.context')
      .optional()
      .isObject()
      .withMessage('Context must be an object')
  ],

  analyticsFilter: [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO date'),

    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO date')
      .custom((endDate, { req }) => {
        const {startDate} = req.query;
        if (startDate && new Date(endDate) <= new Date(startDate as string)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),

    query('variants')
      .optional()
      .isString()
      .withMessage('Variants must be a comma-separated string'),

    query('metrics')
      .optional()
      .isString()
      .withMessage('Metrics must be a comma-separated string'),

    query('groupBy')
      .optional()
      .isIn(['variant', 'metric', 'day', 'hour'])
      .withMessage('Group by must be one of: variant, metric, day, hour'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 10000 })
      .withMessage('Limit must be between 1 and 10,000'),

    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],

  testConfiguration: [
    body('config')
      .isObject()
      .withMessage('Configuration must be an object'),

    body('config.minimumSampleSize')
      .optional()
      .isInt({ min: 100, max: 100000 })
      .withMessage('Minimum sample size must be between 100 and 100,000'),

    body('config.maximumDuration')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Maximum duration must be between 1 and 365 days'),

    body('config.earlyStoppingRules')
      .optional()
      .isObject()
      .withMessage('Early stopping rules must be an object'),

    body('config.earlyStoppingRules.enabled')
      .optional()
      .isBoolean()
      .withMessage('Early stopping enabled must be a boolean'),

    body('config.earlyStoppingRules.checkFrequency')
      .optional()
      .isIn(['daily', 'weekly'])
      .withMessage('Check frequency must be daily or weekly'),

    body('config.earlyStoppingRules.minDuration')
      .optional()
      .isInt({ min: 1, max: 30 })
      .withMessage('Minimum duration must be between 1 and 30 days'),

    body('config.statisticalSettings')
      .optional()
      .isObject()
      .withMessage('Statistical settings must be an object'),

    body('config.statisticalSettings.alpha')
      .optional()
      .isFloat({ min: 0.01, max: 0.20 })
      .withMessage('Alpha (significance level) must be between 0.01 and 0.20'),

    body('config.statisticalSettings.power')
      .optional()
      .isFloat({ min: 0.7, max: 0.99 })
      .withMessage('Statistical power must be between 0.7 and 0.99'),

    body('config.statisticalSettings.minimumDetectableEffect')
      .optional()
      .isFloat({ min: 0.01, max: 1.0 })
      .withMessage('Minimum detectable effect must be between 1% and 100%')
  ],

  segmentDefinition: [
    body('segment')
      .isObject()
      .withMessage('Segment must be an object'),

    body('segment.name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Segment name must be between 1 and 100 characters'),

    body('segment.description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description cannot exceed 500 characters'),

    body('segment.criteria')
      .isObject()
      .withMessage('Criteria must be an object'),

    body('segment.criteria.userProperties')
      .optional()
      .isObject()
      .withMessage('User properties must be an object'),

    body('segment.criteria.behavioralFilters')
      .optional()
      .isArray()
      .withMessage('Behavioral filters must be an array'),

    body('segment.criteria.timeWindow')
      .optional()
      .isObject()
      .withMessage('Time window must be an object'),

    body('segment.criteria.timeWindow.start')
      .optional()
      .isISO8601()
      .withMessage('Start time must be a valid ISO date'),

    body('segment.criteria.timeWindow.end')
      .optional()
      .isISO8601()
      .withMessage('End time must be a valid ISO date')
  ]
};

// Composite validation rules for complex operations
export const compositeABTestingValidationRules = {
  fullTestSetup: [
    ...abTestingValidationRules.createTest,
    body('autoStart')
      .optional()
      .isBoolean()
      .withMessage('Auto start must be a boolean'),

    body('segments')
      .optional()
      .isArray()
      .withMessage('Segments must be an array'),

    body('integrations')
      .optional()
      .isObject()
      .withMessage('Integrations must be an object'),

    body('integrations.analytics')
      .optional()
      .isArray()
      .withMessage('Analytics integrations must be an array'),

    body('integrations.notifications')
      .optional()
      .isObject()
      .withMessage('Notification integrations must be an object')
  ],

  multivariateTesting: [
    body('factors')
      .isArray({ min: 2, max: 5 })
      .withMessage('Must have between 2 and 5 factors for multivariate testing'),

    body('factors.*.name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Factor name must be between 1 and 100 characters'),

    body('factors.*.values')
      .isArray({ min: 2, max: 10 })
      .withMessage('Each factor must have between 2 and 10 values'),

    body('interactions')
      .optional()
      .isBoolean()
      .withMessage('Interactions must be a boolean'),

    body('fractionalFactorial')
      .optional()
      .isBoolean()
      .withMessage('Fractional factorial must be a boolean')
  ]
};
