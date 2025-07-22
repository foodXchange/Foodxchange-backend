/**
 * Validation Middleware
 * Re-exports from validation.ts for backwards compatibility
 */

export * from './validation';

// Default export for backwards compatibility
import { validate } from './validation';
export default validate;