// Re-export the logger from core
import { Logger as LoggerClass, logger } from '../core/logging/logger';

export { LoggerClass as Logger, logger };
export default LoggerClass;