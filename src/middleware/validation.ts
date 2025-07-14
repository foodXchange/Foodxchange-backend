/**
 * Request Validation Middleware
 * Provides schema validation for requests using Zod
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { ValidationError } from '../core/errors';

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
          value: err.path.reduce((obj, key) => obj?.[key], req.body ?? req.query ?? req.params),
        }));
        
        next(new ValidationError('Validation failed', validationErrors));
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
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
  
  // MongoDB ObjectId
  objectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId'),
  
  // Email
  email: z.string().email().toLowerCase(),
  
  // Phone
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
  
  // URL
  url: z.string().url(),
  
  // Date range
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }).refine(data => data.startDate <= data.endDate, {
    message: 'Start date must be before end date',
  }),
  
  // Price
  price: z.object({
    amount: z.number().positive(),
    currency: z.string().length(3).toUpperCase(),
  }),
  
  // Address
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().optional(),
    country: z.string().min(2),
    postalCode: z.string().min(1),
  }),
};

// Validation middleware factory
export const validationMiddleware = {
  body: (schema: ZodSchema) => validate({ body: schema }),
  query: (schema: ZodSchema) => validate({ query: schema }),
  params: (schema: ZodSchema) => validate({ params: schema }),
  headers: (schema: ZodSchema) => validate({ headers: schema }),
};