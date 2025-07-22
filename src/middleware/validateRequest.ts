/**
 * Request Validation Middleware
 * Re-exports from validation.ts for backwards compatibility
 */

export { validateRequest } from './validation';

// Default export for backwards compatibility
import { validateRequest } from './validation';
export default validateRequest;