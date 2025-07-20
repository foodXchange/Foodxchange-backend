import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface StandardApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    validationErrors?: Array<{
      field: string;
      message: string;
      value?: any;
    }>;
  };
  meta?: {
    version: string;
    timestamp: string;
    requestId: string;
    duration?: number;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

export interface PaginationOptions {
  page: number;
  limit: number;
  total: number;
}

export class ResponseFormatter {
  static success<T>(
    data: T,
    req: Request,
    options?: {
      message?: string;
      pagination?: PaginationOptions;
    }
  ): StandardApiResponse<T> {
    const response: StandardApiResponse<T> = {
      success: true,
      data,
      meta: {
        version: req.apiVersion || '1.0',
        timestamp: new Date().toISOString(),
        requestId: req.id || uuidv4(),
        duration: req.startTime ? Date.now() - req.startTime : undefined
      }
    };

    if (options?.pagination) {
      const { page, limit, total } = options.pagination;
      const totalPages = Math.ceil(total / limit);

      response.meta.pagination = {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      };
    }

    return response;
  }

  static error(
    error: {
      code: string;
      message: string;
      details?: any;
      validationErrors?: Array<{
        field: string;
        message: string;
        value?: any;
      }>;
    },
    req: Request
  ): StandardApiResponse<never> {
    return {
      success: false,
      error,
      meta: {
        version: req.apiVersion || '1.0',
        timestamp: new Date().toISOString(),
        requestId: req.id || uuidv4(),
        duration: req.startTime ? Date.now() - req.startTime : undefined
      }
    };
  }

  static paginated<T>(
    data: T[],
    pagination: PaginationOptions,
    req: Request
  ): StandardApiResponse<T[]> {
    return this.success(data, req, { pagination });
  }
}

// Middleware to add response formatting helpers to Response object
export const responseFormatterMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Add startTime for duration calculation
  req.startTime = Date.now();

  // Add request ID if not already present
  if (!req.id) {
    req.id = uuidv4();
  }

  // Add success response helper
  res.success = <T>(data: T, options?: { message?: string; pagination?: PaginationOptions }) => {
    const response = ResponseFormatter.success(data, req, options);
    return res.json(response);
  };

  // Add error response helper
  res.error = (
    error: {
      code: string;
      message: string;
      details?: any;
      validationErrors?: Array<{
        field: string;
        message: string;
        value?: any;
      }>;
    },
    statusCode = 500
  ) => {
    const response = ResponseFormatter.error(error, req);
    return res.status(statusCode).json(response);
  };

  // Add paginated response helper
  res.paginated = <T>(data: T[], pagination: PaginationOptions) => {
    const response = ResponseFormatter.paginated(data, pagination, req);
    return res.json(response);
  };

  // Add validation error helper
  res.validationError = (
    validationErrors: Array<{
      field: string;
      message: string;
      value?: any;
    }>,
    message = 'Validation failed'
  ) => {
    const response = ResponseFormatter.error(
      {
        code: 'VAL_001',
        message,
        validationErrors
      },
      req
    );
    return res.status(400).json(response);
  };

  // Add not found helper
  res.notFound = (resource: string, identifier?: string | number) => {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;

    const response = ResponseFormatter.error(
      {
        code: 'BUS_001',
        message
      },
      req
    );
    return res.status(404).json(response);
  };

  // Add unauthorized helper
  res.unauthorized = (message = 'Unauthorized') => {
    const response = ResponseFormatter.error(
      {
        code: 'AUTH_001',
        message
      },
      req
    );
    return res.status(401).json(response);
  };

  // Add forbidden helper
  res.forbidden = (message = 'Forbidden') => {
    const response = ResponseFormatter.error(
      {
        code: 'AUTH_005',
        message
      },
      req
    );
    return res.status(403).json(response);
  };

  // Add conflict helper
  res.conflict = (message = 'Resource conflict') => {
    const response = ResponseFormatter.error(
      {
        code: 'BUS_002',
        message
      },
      req
    );
    return res.status(409).json(response);
  };

  // Add too many requests helper
  res.tooManyRequests = (message = 'Too many requests') => {
    const response = ResponseFormatter.error(
      {
        code: 'SYS_005',
        message
      },
      req
    );
    return res.status(429).json(response);
  };

  // Add internal server error helper
  res.serverError = (message = 'Internal server error') => {
    const response = ResponseFormatter.error(
      {
        code: 'SYS_001',
        message
      },
      req
    );
    return res.status(500).json(response);
  };

  next();
};

// Extend Express Response interface
declare global {
  namespace Express {
    interface Response {
      success<T>(data: T, options?: { message?: string; pagination?: PaginationOptions }): Response;
      error(
        error: {
          code: string;
          message: string;
          details?: any;
          validationErrors?: Array<{
            field: string;
            message: string;
            value?: any;
          }>;
        },
        statusCode?: number
      ): Response;
      paginated<T>(data: T[], pagination: PaginationOptions): Response;
      validationError(
        validationErrors: Array<{
          field: string;
          message: string;
          value?: any;
        }>,
        message?: string
      ): Response;
      notFound(resource: string, identifier?: string | number): Response;
      unauthorized(message?: string): Response;
      forbidden(message?: string): Response;
      conflict(message?: string): Response;
      tooManyRequests(message?: string): Response;
      serverError(message?: string): Response;
    }
  }
}

export default responseFormatterMiddleware;
