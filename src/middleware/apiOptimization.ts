import { Request, Response, NextFunction } from 'express';
import { Logger } from '../core/logging/logger';

const logger = new Logger('APIOptimizationMiddleware');

interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
  sort: string;
  order: 'asc' | 'desc';
}

interface FilterParams {
  [key: string]: any;
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      pagination?: PaginationParams;
      filters?: FilterParams;
      fields?: string[];
    }
  }
}

/**
 * Pagination middleware with smart defaults
 */
export const pagination = (defaultLimit: number = 20, maxLimit: number = 100) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(
      parseInt(req.query.limit as string) || defaultLimit,
      maxLimit
    );
    const offset = (page - 1) * limit;
    const sort = req.query.sort as string || '-createdAt';
    const order = sort.startsWith('-') ? 'desc' : 'asc';

    req.pagination = {
      page,
      limit,
      offset,
      sort: sort.replace(/^-/, ''),
      order
    };

    // Add pagination headers
    res.setHeader('X-Page', page.toString());
    res.setHeader('X-Limit', limit.toString());

    next();
  };
};

/**
 * Field selection middleware for partial responses
 */
export const fieldSelection = (req: Request, res: Response, next: NextFunction) => {
  const fields = req.query.fields as string;
  
  if (fields) {
    req.fields = fields.split(',').map(f => f.trim());
  }
  
  next();
};

/**
 * Advanced filtering middleware
 */
export const filtering = (allowedFilters: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const filters: FilterParams = {};
    
    // Parse filter query parameters
    Object.keys(req.query).forEach(key => {
      if (key.startsWith('filter.')) {
        const filterKey = key.substring(7);
        
        if (allowedFilters.length === 0 || allowedFilters.includes(filterKey)) {
          const value = req.query[key];
          
          // Handle different filter operators
          if (typeof value === 'string') {
            if (value.startsWith('gte:')) {
              filters[filterKey] = { $gte: parseValue(value.substring(4)) };
            } else if (value.startsWith('lte:')) {
              filters[filterKey] = { $lte: parseValue(value.substring(4)) };
            } else if (value.startsWith('gt:')) {
              filters[filterKey] = { $gt: parseValue(value.substring(3)) };
            } else if (value.startsWith('lt:')) {
              filters[filterKey] = { $lt: parseValue(value.substring(3)) };
            } else if (value.startsWith('ne:')) {
              filters[filterKey] = { $ne: parseValue(value.substring(3)) };
            } else if (value.startsWith('in:')) {
              filters[filterKey] = { $in: value.substring(3).split(',').map(v => parseValue(v.trim())) };
            } else if (value.startsWith('regex:')) {
              filters[filterKey] = { $regex: value.substring(6), $options: 'i' };
            } else {
              filters[filterKey] = parseValue(value);
            }
          } else {
            filters[filterKey] = value;
          }
        }
      }
    });
    
    // Handle date range filters
    if (req.query.dateFrom || req.query.dateTo) {
      filters.createdAt = {};
      if (req.query.dateFrom) {
        filters.createdAt.$gte = new Date(req.query.dateFrom as string);
      }
      if (req.query.dateTo) {
        filters.createdAt.$lte = new Date(req.query.dateTo as string);
      }
    }
    
    req.filters = filters;
    next();
  };
};

/**
 * Response optimization middleware
 */
export const responseOptimization = (req: Request, res: Response, next: NextFunction) => {
  // Store original json method
  const originalJson = res.json;
  
  // Override json method
  res.json = function(data: any) {
    // Apply field selection if requested
    if (req.fields && data) {
      if (Array.isArray(data)) {
        data = data.map(item => selectFields(item, req.fields!));
      } else if (data.data && Array.isArray(data.data)) {
        data.data = data.data.map((item: any) => selectFields(item, req.fields!));
      } else if (data.data) {
        data.data = selectFields(data.data, req.fields!);
      } else {
        data = selectFields(data, req.fields!);
      }
    }
    
    // Call original json method
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * ETag support for caching
 */
export const etag = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  
  res.json = function(data: any) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
    const etag = `"${hash}"`;
    
    res.setHeader('ETag', etag);
    
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return res;
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Query result caching middleware
 */
export const cacheResponse = (ttl: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    const { optimizedCache } = await import('../services/cache/OptimizedCacheService');
    const cacheKey = `api:${req.originalUrl}`;
    
    // Try to get from cache
    const cached = await optimizedCache.get(cacheKey, { parse: false });
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Content-Type', 'application/json');
      return res.send(cached);
    }
    
    // Store original send method
    const originalSend = res.send;
    
    // Override send method to cache response
    res.send = function(data: any) {
      res.setHeader('X-Cache', 'MISS');
      
      // Cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        optimizedCache.set(cacheKey, data, { ttl }).catch(error => {
          logger.error('Failed to cache response:', error);
        });
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * Batch request handler
 */
export const batchRequests = async (req: Request, res: Response, next: NextFunction) => {
  if (req.path !== '/batch' || req.method !== 'POST') {
    return next();
  }
  
  const { requests } = req.body;
  
  if (!Array.isArray(requests)) {
    return res.status(400).json({
      success: false,
      error: 'Requests must be an array'
    });
  }
  
  const results = await Promise.all(
    requests.map(async (request: any) => {
      try {
        // Create a mock request/response for each batch item
        const mockReq = {
          ...req,
          method: request.method || 'GET',
          url: request.url,
          query: request.query || {},
          body: request.body || {},
          params: request.params || {}
        };
        
        // Process the request through your router
        // This is a simplified example - you'd need to properly route these
        return {
          id: request.id,
          status: 200,
          data: { message: 'Batch request processed' }
        };
      } catch (error) {
        return {
          id: request.id,
          status: 500,
          error: error.message
        };
      }
    })
  );
  
  res.json({
    success: true,
    results
  });
};

// Helper functions

function parseValue(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^\d+$/.test(value)) return parseInt(value);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

function selectFields(obj: any, fields: string[]): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result: any = {};
  
  fields.forEach(field => {
    if (field.includes('.')) {
      // Handle nested fields
      const parts = field.split('.');
      let source = obj;
      let target = result;
      
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (source[part] !== undefined) {
          if (!target[part]) {
            target[part] = {};
          }
          source = source[part];
          target = target[part];
        } else {
          break;
        }
      }
      
      const lastPart = parts[parts.length - 1];
      if (source && source[lastPart] !== undefined) {
        target[lastPart] = source[lastPart];
      }
    } else {
      // Handle simple fields
      if (obj[field] !== undefined) {
        result[field] = obj[field];
      }
    }
  });
  
  // Always include id if present
  if (obj._id && !result._id) result._id = obj._id;
  if (obj.id && !result.id) result.id = obj.id;
  
  return result;
}