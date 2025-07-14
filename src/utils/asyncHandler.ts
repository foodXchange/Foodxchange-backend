import { Request, Response, NextFunction } from 'express';

/**
 * Async handler wrapper for Express routes
 * Catches errors from async route handlers and passes them to error middleware
 */
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};