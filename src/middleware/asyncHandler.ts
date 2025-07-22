/**
 * Async Handler Middleware
 * Wraps async route handlers to catch rejected promises
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async function to catch any errors and pass them to next()
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;