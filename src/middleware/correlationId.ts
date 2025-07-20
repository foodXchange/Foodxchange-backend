/**
 * Correlation ID Middleware
 * Adds unique request ID for tracing through the system
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id: string;
      correlationId: string;
    }
  }
}

export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check for existing correlation ID from headers
  const correlationId = req.headers['x-correlation-id'] as string ||
                       req.headers['x-request-id'] as string ||
                       uuidv4();

  // Attach to request
  req.id = correlationId;
  req.correlationId = correlationId;

  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Request-ID', correlationId);

  next();
};
