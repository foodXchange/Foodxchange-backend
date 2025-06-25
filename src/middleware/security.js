const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

// Rate limiting configuration
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Different rate limits for different endpoints
const rateLimiters = {
  general: createRateLimiter(15 * 60 * 1000, 100, 'Too many requests, please try again later'),
  auth: createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts'),
  api: createRateLimiter(15 * 60 * 1000, 1000, 'API rate limit exceeded')
};

// Security middleware setup
const setupSecurity = (app) => {
  // Set security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));

  // Data sanitization against NoSQL query injection
  app.use(mongoSanitize());

  // Data sanitization against XSS
  app.use(xss());

  // Prevent parameter pollution
  app.use(hpp({
    whitelist: ['sort', 'fields', 'page', 'limit']
  }));

  return rateLimiters;
};

module.exports = {
  setupSecurity,
  rateLimiters
};
