import { Request, Response, NextFunction } from 'express';

export interface RequestWithMetadata extends Request {
  correlationId?: string;
  startTime?: number;
}

export const requestLogger = (req: RequestWithMetadata, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  req.startTime = startTime;
  
  const correlationId = req.correlationId || 'unknown';
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${correlationId} ${req.method} ${req.path}`);
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${correlationId} ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};