import { User } from '../models/User';
import { MetricsService } from '../services/metrics/MetricsService';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
      validatedData?: any;
      shardKey?: string;
      apiVersion?: string;
      requestId?: string;
      startTime?: number;
      metrics?: MetricsService;
    }
  }
}

export {};
