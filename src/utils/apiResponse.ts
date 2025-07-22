import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  message?: string;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): Response => {
  return res.status(statusCode).json({
    success: true,
    data,
    message
  });
};

export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  code?: string,
  details?: any
): Response => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details
    }
  });
};

export const sendPaginatedResponse = <T>(
  res: Response,
  data: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
  },
  message?: string
): Response => {
  return res.json({
    success: true,
    data,
    pagination: {
      ...pagination,
      pages: Math.ceil(pagination.total / pagination.limit)
    },
    message
  });
};

export default {
  sendSuccess,
  sendError,
  sendPaginatedResponse
};