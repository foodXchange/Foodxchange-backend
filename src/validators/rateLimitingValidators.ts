import { body, param, query } from 'express-validator';

export const rateLimitingValidationRules = {
  ruleId: [
    param('ruleId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Rule ID must be between 1 and 100 characters')
  ],

  createRule: [
    body('name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Rule name must be between 1 and 200 characters'),

    body('windowMs')
      .isInt({ min: 1000, max: 3600000 })
      .withMessage('Window must be between 1 second and 1 hour (in milliseconds)'),

    body('maxRequests')
      .isInt({ min: 1, max: 10000 })
      .withMessage('Max requests must be between 1 and 10,000'),

    body('tier')
      .optional()
      .isString()
      .trim()
      .isIn(['basic', 'standard', 'premium', 'enterprise'])
      .withMessage('Tier must be one of: basic, standard, premium, enterprise'),

    body('endpoint')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Endpoint pattern must be between 1 and 500 characters'),

    body('method')
      .optional()
      .isString()
      .trim()
      .isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
      .withMessage('Method must be a valid HTTP method'),

    body('userRole')
      .optional()
      .isString()
      .trim()
      .isIn(['admin', 'buyer', 'supplier', 'logistics'])
      .withMessage('User role must be one of: admin, buyer, supplier, logistics'),

    body('ipWhitelist')
      .optional()
      .isArray()
      .withMessage('IP whitelist must be an array'),

    body('ipWhitelist.*')
      .optional()
      .isIP()
      .withMessage('Each IP in whitelist must be a valid IP address'),

    body('ipBlacklist')
      .optional()
      .isArray()
      .withMessage('IP blacklist must be an array'),

    body('ipBlacklist.*')
      .optional()
      .isIP()
      .withMessage('Each IP in blacklist must be a valid IP address'),

    body('customKey')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Custom key must be between 1 and 200 characters'),

    body('priority')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Priority must be between 1 and 100'),

    body('enabled')
      .optional()
      .isBoolean()
      .withMessage('Enabled must be a boolean'),

    body('burstAllowance')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Burst allowance must be between 1 and 100'),

    body('queueSize')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Queue size must be between 1 and 1,000'),

    body('backoffStrategy')
      .optional()
      .isIn(['linear', 'exponential', 'constant'])
      .withMessage('Backoff strategy must be one of: linear, exponential, constant'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  updateRule: [
    param('ruleId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Rule ID must be between 1 and 100 characters'),

    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Rule name must be between 1 and 200 characters'),

    body('windowMs')
      .optional()
      .isInt({ min: 1000, max: 3600000 })
      .withMessage('Window must be between 1 second and 1 hour (in milliseconds)'),

    body('maxRequests')
      .optional()
      .isInt({ min: 1, max: 10000 })
      .withMessage('Max requests must be between 1 and 10,000'),

    body('tier')
      .optional()
      .isString()
      .trim()
      .isIn(['basic', 'standard', 'premium', 'enterprise'])
      .withMessage('Tier must be one of: basic, standard, premium, enterprise'),

    body('endpoint')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Endpoint pattern must be between 1 and 500 characters'),

    body('method')
      .optional()
      .isString()
      .trim()
      .isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
      .withMessage('Method must be a valid HTTP method'),

    body('userRole')
      .optional()
      .isString()
      .trim()
      .isIn(['admin', 'buyer', 'supplier', 'logistics'])
      .withMessage('User role must be one of: admin, buyer, supplier, logistics'),

    body('enabled')
      .optional()
      .isBoolean()
      .withMessage('Enabled must be a boolean'),

    body('priority')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Priority must be between 1 and 100')
  ],

  ipAddress: [
    param('ipAddress')
      .isIP()
      .withMessage('Must be a valid IP address')
  ],

  blacklistIP: [
    param('ipAddress')
      .isIP()
      .withMessage('Must be a valid IP address'),

    body('reason')
      .isString()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Reason must be between 1 and 500 characters'),

    body('duration')
      .optional()
      .isInt({ min: 300, max: 2592000 })
      .withMessage('Duration must be between 5 minutes and 30 days (in seconds)')
  ],

  getQuota: [
    param('ruleId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Rule ID must be between 1 and 100 characters'),

    query('userId')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('User ID must be between 1 and 100 characters'),

    query('ipAddress')
      .optional()
      .isIP()
      .withMessage('IP address must be valid')
      .custom((value, { req }) => {
        if (!value && !req.query.userId) {
          throw new Error('Either userId or ipAddress must be provided');
        }
        return true;
      })
  ],

  resetKey: [
    param('key')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Key must be between 1 and 200 characters')
  ],

  statistics: [
    query('timeWindow')
      .optional()
      .isInt({ min: 300, max: 86400 })
      .withMessage('Time window must be between 5 minutes and 24 hours (in seconds)')
  ],

  testRateLimit: [
    body('userId')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('User ID must be between 1 and 100 characters'),

    body('userRole')
      .optional()
      .isString()
      .trim()
      .isIn(['admin', 'buyer', 'supplier', 'logistics'])
      .withMessage('User role must be one of: admin, buyer, supplier, logistics'),

    body('userTier')
      .optional()
      .isString()
      .trim()
      .isIn(['basic', 'standard', 'premium', 'enterprise'])
      .withMessage('User tier must be one of: basic, standard, premium, enterprise'),

    body('ipAddress')
      .optional()
      .isIP()
      .withMessage('IP address must be valid'),

    body('endpoint')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Endpoint must be between 1 and 500 characters'),

    body('method')
      .optional()
      .isString()
      .trim()
      .isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
      .withMessage('Method must be a valid HTTP method'),

    body('userAgent')
      .optional()
      .isString()
      .withMessage('User agent must be a string'),

    body('apiKey')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('API key must be between 1 and 100 characters'),

    body('companyId')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Company ID must be between 1 and 100 characters')
  ],

  bulkOperations: [
    body('operation')
      .isIn(['enable', 'disable', 'delete', 'update'])
      .withMessage('Operation must be one of: enable, disable, delete, update'),

    body('ruleIds')
      .isArray({ min: 1, max: 50 })
      .withMessage('Rule IDs must be an array with 1-50 items'),

    body('ruleIds.*')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Each rule ID must be between 1 and 100 characters'),

    body('data')
      .optional()
      .isObject()
      .withMessage('Data must be an object (required for update operation)')
      .custom((value, { req }) => {
        if (req.body.operation === 'update' && !value) {
          throw new Error('Data is required for update operation');
        }
        return true;
      })
  ],

  // Advanced validation rules
  ruleConfiguration: [
    body('config')
      .isObject()
      .withMessage('Configuration must be an object'),

    body('config.throttling')
      .optional()
      .isObject()
      .withMessage('Throttling config must be an object'),

    body('config.throttling.enabled')
      .optional()
      .isBoolean()
      .withMessage('Throttling enabled must be a boolean'),

    body('config.throttling.queueSize')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Queue size must be between 1 and 1,000'),

    body('config.throttling.maxWaitTime')
      .optional()
      .isInt({ min: 1000, max: 300000 })
      .withMessage('Max wait time must be between 1 second and 5 minutes'),

    body('config.burst')
      .optional()
      .isObject()
      .withMessage('Burst config must be an object'),

    body('config.burst.enabled')
      .optional()
      .isBoolean()
      .withMessage('Burst enabled must be a boolean'),

    body('config.burst.maxBurstSize')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Max burst size must be between 1 and 100'),

    body('config.burst.burstRefillRate')
      .optional()
      .isFloat({ min: 0.1, max: 10 })
      .withMessage('Burst refill rate must be between 0.1 and 10'),

    body('config.adaptive')
      .optional()
      .isObject()
      .withMessage('Adaptive config must be an object'),

    body('config.adaptive.enabled')
      .optional()
      .isBoolean()
      .withMessage('Adaptive enabled must be a boolean'),

    body('config.adaptive.baseLimit')
      .optional()
      .isInt({ min: 1, max: 10000 })
      .withMessage('Base limit must be between 1 and 10,000')
  ],

  advancedFilter: [
    query('tier')
      .optional()
      .isIn(['basic', 'standard', 'premium', 'enterprise'])
      .withMessage('Tier must be one of: basic, standard, premium, enterprise'),

    query('enabled')
      .optional()
      .isBoolean()
      .withMessage('Enabled must be a boolean'),

    query('endpoint')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Endpoint pattern must be between 1 and 500 characters'),

    query('method')
      .optional()
      .isString()
      .trim()
      .isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
      .withMessage('Method must be a valid HTTP method'),

    query('priority')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Priority must be between 1 and 100'),

    query('sortBy')
      .optional()
      .isIn(['name', 'priority', 'windowMs', 'maxRequests', 'enabled'])
      .withMessage('Sort by must be one of: name, priority, windowMs, maxRequests, enabled'),

    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1,000'),

    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],

  ipManagement: [
    body('ips')
      .isArray({ min: 1, max: 100 })
      .withMessage('IPs must be an array with 1-100 items'),

    body('ips.*')
      .isIP()
      .withMessage('Each IP must be a valid IP address'),

    body('action')
      .isIn(['whitelist', 'blacklist', 'remove'])
      .withMessage('Action must be one of: whitelist, blacklist, remove'),

    body('reason')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Reason must be between 1 and 500 characters'),

    body('duration')
      .optional()
      .isInt({ min: 300, max: 2592000 })
      .withMessage('Duration must be between 5 minutes and 30 days (in seconds)')
  ]
};

// Composite validation rules for complex operations
export const compositeRateLimitingValidationRules = {
  fullRuleSetup: [
    ...rateLimitingValidationRules.createRule,
    body('schedule')
      .optional()
      .isObject()
      .withMessage('Schedule must be an object'),

    body('schedule.startTime')
      .optional()
      .isISO8601()
      .withMessage('Start time must be a valid ISO date'),

    body('schedule.endTime')
      .optional()
      .isISO8601()
      .withMessage('End time must be a valid ISO date'),

    body('schedule.timezone')
      .optional()
      .isString()
      .withMessage('Timezone must be a string'),

    body('notifications')
      .optional()
      .isObject()
      .withMessage('Notifications must be an object'),

    body('notifications.enabled')
      .optional()
      .isBoolean()
      .withMessage('Notifications enabled must be a boolean'),

    body('notifications.thresholds')
      .optional()
      .isArray()
      .withMessage('Notification thresholds must be an array')
  ],

  ruleAnalytics: [
    query('ruleIds')
      .optional()
      .isString()
      .withMessage('Rule IDs must be a comma-separated string'),

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

    query('metrics')
      .optional()
      .isString()
      .withMessage('Metrics must be a comma-separated string'),

    query('groupBy')
      .optional()
      .isIn(['rule', 'endpoint', 'user', 'ip', 'hour', 'day'])
      .withMessage('Group by must be one of: rule, endpoint, user, ip, hour, day')
  ]
};
