import { Request, Response, NextFunction } from 'express';

import { ApiError } from '../core/errors';

/**
 * Authorization middleware to check user roles
 * @param roles - Array of allowed roles or single role
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError('Authentication required', 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(`Access denied. Required roles: ${roles.join(', ')}`, 403);
    }

    next();
  };
};
