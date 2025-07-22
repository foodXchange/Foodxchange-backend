/**
 * Request Validation Middleware
 * Provides schema validation for requests using Zod
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { validationResult, ValidationChain } from 'express-validator';
import { z, ZodError, ZodSchema } from 'zod';

import { ValidationError } from '../core/errors';
import { User } from '../models/User';

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

export const validate = (schemas: ValidationSchemas) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate each part of the request
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }

      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }

      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }

      if (schemas.headers) {
        const validatedHeaders = await schemas.headers.parseAsync(req.headers);
        // Don't override all headers, just validated ones
        Object.assign(req.headers, validatedHeaders);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          value: err.path.reduce((obj, key) => obj?.[key], req.body ?? req.query ?? req.params)
        }));

        const errorMessage = validationErrors.map(e => `${e.field}: ${e.message}`).join(', ');
        next(new ValidationError(errorMessage));
      } else {
        next(error);
      }
    }
  };
};

// Common validation schemas
export const commonSchemas = {
  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  }),

  // MongoDB ObjectId
  objectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId'),

  // Enhanced Email validation
  email: z.string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .refine(email => {
      const domain = email.split('@')[1];
      const forbiddenDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com'];
      return !forbiddenDomains.includes(domain);
    }, 'Temporary email addresses are not allowed'),

  // Enhanced Phone validation
  phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number in international format')
    .min(10, 'Phone number must be at least 10 digits')
    .max(15, 'Phone number cannot exceed 15 digits'),

  // Password validation with strength requirements
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/^(?=.*[a-z])/, 'Password must contain at least one lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Password must contain at least one uppercase letter')
    .regex(/^(?=.*\d)/, 'Password must contain at least one number')
    .regex(/^(?=.*[!@#$%^&*(),.?":{}|<>])/, 'Password must contain at least one special character')
    .refine(password => {
      const commonPasswords = ['password', '123456', 'qwerty', 'abc123', 'password123'];
      return !commonPasswords.includes(password.toLowerCase());
    }, 'Password is too common, please choose a stronger password'),

  // Company name validation
  companyName: z.string()
    .min(2, 'Company name must be at least 2 characters long')
    .max(100, 'Company name cannot exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s\-&.,()]+$/, 'Company name contains invalid characters'),

  // Company size validation
  companySize: z.enum(['1-10', '11-50', '50-200', '200+'], {
    errorMap: () => ({ message: 'Company size must be one of: 1-10, 11-50, 50-200, 200+' })
  }),

  // Industry validation
  industry: z.string()
    .min(2, 'Industry must be at least 2 characters long')
    .max(50, 'Industry cannot exceed 50 characters'),

  // Business type validation
  businessType: z.enum(['restaurant', 'distributor', 'manufacturer', 'retailer', 'other'], {
    errorMap: () => ({ message: 'Business type must be one of: restaurant, distributor, manufacturer, retailer, other' })
  }),

  // URL
  url: z.string().url(),

  // Date range
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date()
  }).refine(data => data.startDate <= data.endDate, {
    message: 'Start date must be before end date'
  }),

  // Price
  price: z.object({
    amount: z.number().positive(),
    currency: z.string().length(3).toUpperCase()
  }),

  // Address
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().optional(),
    country: z.string().min(2),
    postalCode: z.string().min(1)
  })
};

// Validation middleware factory
export const validationMiddleware = {
  body: (schema: ZodSchema) => validate({ body: schema }),
  query: (schema: ZodSchema) => validate({ query: schema }),
  params: (schema: ZodSchema) => validate({ params: schema }),
  headers: (schema: ZodSchema) => validate({ headers: schema })
};

// Enhanced validation middleware with specific requirements
export const enhancedValidate = {
  // User login validation
  userLogin: validate({
    body: z.object({
      email: commonSchemas.email,
      password: z.string().min(1, 'Password is required'),
      rememberMe: z.boolean().optional().default(false)
    })
  }),

  // User registration validation
  userRegister: validate({
    body: z.object({
      email: commonSchemas.email.refine(async (email) => {
        const existingUser = await User.findOne({ email });
        return !existingUser;
      }, 'Email already exists'),
      password: commonSchemas.password,
      firstName: z.string()
        .min(2, 'First name must be at least 2 characters long')
        .max(50, 'First name cannot exceed 50 characters')
        .regex(/^[a-zA-Z\s\-']+$/, 'First name contains invalid characters'),
      lastName: z.string()
        .min(2, 'Last name must be at least 2 characters long')
        .max(50, 'Last name cannot exceed 50 characters')
        .regex(/^[a-zA-Z\s\-']+$/, 'Last name contains invalid characters'),
      role: z.enum(['buyer', 'seller', 'contractor', 'agent'], {
        errorMap: () => ({ message: 'Role must be one of: buyer, seller, contractor, agent' })
      }),
      company: commonSchemas.companyName,
      businessType: commonSchemas.businessType,
      phone: commonSchemas.phone.optional(),
      acceptTerms: z.boolean().refine(val => val === true, 'You must accept the terms and conditions')
    })
  }),

  // User profile update validation
  userUpdate: validate({
    body: z.object({
      firstName: z.string()
        .min(2, 'First name must be at least 2 characters long')
        .max(50, 'First name cannot exceed 50 characters')
        .regex(/^[a-zA-Z\s\-']+$/, 'First name contains invalid characters')
        .optional(),
      lastName: z.string()
        .min(2, 'Last name must be at least 2 characters long')
        .max(50, 'Last name cannot exceed 50 characters')
        .regex(/^[a-zA-Z\s\-']+$/, 'Last name contains invalid characters')
        .optional(),
      phone: commonSchemas.phone.optional(),
      bio: z.string()
        .max(500, 'Bio cannot exceed 500 characters')
        .optional(),
      avatar: commonSchemas.url.optional(),
      website: commonSchemas.url.optional()
    })
  }),

  // Company update validation
  companyUpdate: validate({
    body: z.object({
      companyName: commonSchemas.companyName,
      companySize: commonSchemas.companySize,
      industry: commonSchemas.industry,
      businessType: commonSchemas.businessType,
      website: commonSchemas.url.optional(),
      description: z.string()
        .max(1000, 'Description cannot exceed 1000 characters')
        .optional(),
      address: z.object({
        street: z.string().min(1, 'Street address is required'),
        city: z.string().min(1, 'City is required'),
        state: z.string().optional(),
        zipCode: z.string().min(1, 'ZIP code is required'),
        country: z.string().min(2, 'Country is required')
      }).optional()
    })
  }),

  // Password change validation
  userChangePassword: validate({
    body: z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: commonSchemas.password,
      confirmPassword: z.string().min(1, 'Password confirmation is required')
    }).refine(data => data.newPassword === data.confirmPassword, {
      message: 'Password confirmation does not match',
      path: ['confirmPassword']
    }).refine(data => data.currentPassword !== data.newPassword, {
      message: 'New password must be different from current password',
      path: ['newPassword']
    })
  })
};

// Rate limiting middleware
export const rateLimiters = {
  // Authentication endpoints (stricter)
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again later.',
        statusCode: 429
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for trusted IPs (if needed)
      const trustedIPs = process.env.TRUSTED_IPS?.split(',') || [];
      return trustedIPs.includes(req.ip);
    }
  }),

  // General API endpoints
  general: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        statusCode: 429
      }
    },
    standardHeaders: true,
    legacyHeaders: false
  }),

  // Password reset (very strict)
  passwordReset: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // limit each IP to 3 password reset requests per hour
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many password reset attempts. Please try again later.',
        statusCode: 429
      }
    },
    standardHeaders: true,
    legacyHeaders: false
  })
};

// Enhanced validate is already exported above

// Express-validator middleware

export const validateRequest = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map(async validation => validation.run(req)));

    // Check for errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const validationErrors = errors.array().map(err => ({
        field: err.type === 'field' ? err.path : err.type,
        message: err.msg,
        value: err.type === 'field' ? err.value : undefined
      }));

      const errorMessage = validationErrors.map(e => `${e.field}: ${e.message}`).join(', ');
      return next(new ValidationError(errorMessage));
    }

    next();
  };
};
