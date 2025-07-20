import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  message?: string;
  metadata?: {
    timestamp: string;
    version?: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class ResponseFormatter {
  /**
   * Send success response
   */
  static success<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode: number = 200
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      ...(message && { message }),
      metadata: {
        timestamp: new Date().toISOString()
      }
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  static error(
    res: Response,
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any
  ): Response {
    const response: ApiResponse = {
      success: false,
      error: {
        message,
        ...(code && { code }),
        ...(details && { details })
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send validation error response
   */
  static validationError(
    res: Response,
    errors: any[],
    message: string = 'Validation failed'
  ): Response {
    return this.error(res, message, 400, 'VALIDATION_ERROR', errors);
  }

  /**
   * Send not found response
   */
  static notFound(
    res: Response,
    resource: string = 'Resource'
  ): Response {
    return this.error(res, `${resource} not found`, 404, 'NOT_FOUND');
  }

  /**
   * Send unauthorized response
   */
  static unauthorized(
    res: Response,
    message: string = 'Unauthorized'
  ): Response {
    return this.error(res, message, 401, 'UNAUTHORIZED');
  }

  /**
   * Send forbidden response
   */
  static forbidden(
    res: Response,
    message: string = 'Forbidden'
  ): Response {
    return this.error(res, message, 403, 'FORBIDDEN');
  }

  /**
   * Send conflict response
   */
  static conflict(
    res: Response,
    message: string = 'Resource already exists'
  ): Response {
    return this.error(res, message, 409, 'CONFLICT');
  }

  /**
   * Send paginated response
   */
  static paginated<T>(
    res: Response,
    data: T[],
    pagination: {
      page: number;
      limit: number;
      total: number;
    },
    message?: string
  ): Response {
    const totalPages = Math.ceil(pagination.total / pagination.limit);

    const response: ApiResponse<T[]> = {
      success: true,
      data,
      ...(message && { message }),
      pagination: {
        ...pagination,
        totalPages,
        hasNext: pagination.page < totalPages,
        hasPrev: pagination.page > 1
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    };

    return res.json(response);
  }

  /**
   * Send created response
   */
  static created<T>(
    res: Response,
    data: T,
    message: string = 'Resource created successfully'
  ): Response {
    return this.success(res, data, message, 201);
  }

  /**
   * Send updated response
   */
  static updated<T>(
    res: Response,
    data: T,
    message: string = 'Resource updated successfully'
  ): Response {
    return this.success(res, data, message, 200);
  }

  /**
   * Send deleted response
   */
  static deleted(
    res: Response,
    message: string = 'Resource deleted successfully'
  ): Response {
    return this.success(res, null, message, 200);
  }

  /**
   * Send no content response
   */
  static noContent(res: Response): Response {
    return res.status(204).send();
  }
}
