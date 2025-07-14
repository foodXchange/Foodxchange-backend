import { Request, Response, NextFunction } from 'express';

interface ErrorWithCode extends Error {
  statusCode?: number;
  code?: number;
  errors?: Record<string, { message: string }>;
}

const errorHandler = (err: ErrorWithCode, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Default error
  let error: { message: string; statusCode: number } = {
    message: err.message,
    statusCode: err.statusCode || 500
  };

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error = { message: 'Resource not found', statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    error = { message: 'Duplicate field value entered', statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError' && err.errors) {
    const message = Object.values(err.errors).map((val: any) => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = { message: 'Invalid token', statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    error = { message: 'Token expired', statusCode: 401 };
  }

  res.status(error.statusCode).json({
    success: false,
    error: error.message || 'Server Error',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

export default errorHandler;