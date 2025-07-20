import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';

const logger = new Logger('BaseController');

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export abstract class BaseController {
  /**
   * Send success response
   */
  protected sendSuccess<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode: number = 200
  ): void {
    const response: ApiResponse<T> = {
      success: true,
      data,
      ...(message && { message })
    };

    res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  protected sendError(
    res: Response,
    message: string,
    statusCode: number = 500,
    code?: string
  ): void {
    const response: ApiResponse = {
      success: false,
      error: {
        message,
        ...(code && { code })
      }
    };

    logger.error('API Error:', { message, statusCode, code });
    res.status(statusCode).json(response);
  }

  /**
   * Send paginated response
   */
  protected sendPaginatedResponse<T>(
    res: Response,
    data: T[],
    total: number,
    page: number,
    limit: number,
    message?: string
  ): void {
    const totalPages = Math.ceil(total / limit);

    const response: ApiResponse<T[]> = {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      ...(message && { message })
    };

    res.json(response);
  }

  /**
   * Parse pagination options from request
   */
  protected getPaginationOptions(req: Request): PaginationOptions {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    return {
      page: Math.max(1, page),
      limit: Math.min(100, Math.max(1, limit)),
      sortBy,
      sortOrder
    };
  }

  /**
   * Calculate skip value for pagination
   */
  protected calculateSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  /**
   * Create sort object for MongoDB
   */
  protected createSortObject(sortBy: string, sortOrder: 'asc' | 'desc'): Record<string, 1 | -1> {
    return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  }

  /**
   * Handle async route
   */
  protected asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: Function) => {
      Promise.resolve(fn(req, res, next)).catch((error) => {
        logger.error('Async handler error:', error);
        this.sendError(res, 'Internal server error', 500);
      });
    };
  }

  /**
   * Validate required fields
   */
  protected validateRequiredFields(
    data: any,
    requiredFields: string[]
  ): { isValid: boolean; missingFields: string[] } {
    const missingFields = requiredFields.filter(field => !data[field]);

    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }

  /**
   * Log controller action
   */
  protected logAction(
    action: string,
    userId?: string,
    data?: any
  ): void {
    logger.info(`Controller action: ${action}`, {
      userId,
      timestamp: new Date().toISOString(),
      ...(data && { data })
    });
  }
}
