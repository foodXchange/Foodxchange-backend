/**
 * Rate Limiting Middleware
 * Re-exports from rateLimiter.ts for backwards compatibility
 */

export * from './rateLimiter';

// Default export for backwards compatibility
import rateLimiter from './rateLimiter';
export default rateLimiter;