/**
 * Validation Schemas for Request Validation
 */

import { z } from 'zod';

// Auth validation schemas
export const authSchemas = {
  userLogin: {
    body: z.object({
      email: z.string().email(),
      password: z.string().min(6)
    })
  },
  
  userRegister: {
    body: z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['BUYER', 'SELLER', 'ADMIN']).optional(),
      company: z.string().optional()
    })
  },
  
  forgotPassword: {
    body: z.object({
      email: z.string().email()
    })
  },
  
  resetPassword: {
    body: z.object({
      token: z.string(),
      password: z.string().min(6)
    })
  }
};

// User validation schemas
export const userSchemas = {
  userUpdate: {
    body: z.object({
      name: z.string().min(2).optional(),
      phone: z.string().optional(),
      avatar: z.string().url().optional(),
      bio: z.string().optional(),
      preferences: z.record(z.any()).optional()
    })
  },
  
  companyUpdate: {
    body: z.object({
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      website: z.string().url().optional(),
      logo: z.string().url().optional(),
      address: z.object({
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional()
      }).optional()
    })
  },
  
  userChangePassword: {
    body: z.object({
      currentPassword: z.string().min(6),
      newPassword: z.string().min(6),
      confirmPassword: z.string().min(6)
    }).refine(data => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"]
    })
  }
};

// Export all schemas
export const validationSchemas = {
  auth: authSchemas,
  user: userSchemas
};