import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { Logger } from '../utils/logger';
import { config } from '../config';

const logger = new Logger('ErrorHandler');

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let error = err;

  if (!(error instanceof AppError)) {
    const message = error.message || 'Internal server error';
    error = new AppError(message, 500, 'INTERNAL_ERROR', false);
  }

  const appError = error as AppError;

  if (!appError.isOperational) {
    logger.error('Unexpected error:', error, {
      url: req.url,
      method: req.method,
      ip: req.ip,
      userId: (req as any).user?.id,
    });
  }

  const response = {
    success: false,
    error: {
      message: appError.message,
      code: appError.code,
      ...(config.env === 'development' && { stack: err.stack }),
    },
  };

  res.status(appError.statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Resource not found',
      code: 'NOT_FOUND',
    },
  });
};