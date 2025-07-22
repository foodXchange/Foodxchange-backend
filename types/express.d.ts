import { Express } from 'express';

declare global {
  namespace Express {
    interface Request {
      // User authentication
      userId?: string;
      user?: {
        id: string;
        email: string;
        role: string;
        company?: string;
        tenantId?: string;
        isActive?: boolean;
        twoFactor?: {
          enabled: boolean;
          secret?: string;
          verified?: boolean;
        };
      };

      // File uploads
      optimizedImage?: {
        filename: string;
        originalname: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
        dimensions?: {
          width: number;
          height: number;
        };
        metadata?: any;
      };
      optimizedImages?: Array<{
        filename: string;
        originalname: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
        dimensions?: {
          width: number;
          height: number;
        };
        metadata?: any;
      }>;

      // WebSocket
      ws?: any;

      // Session data
      session?: any;
      sessionID?: string;

      // Company and tenant info
      companyId?: string;
      tenantId?: string;

      // Rate limiting
      rateLimit?: {
        limit: number;
        current: number;
        remaining: number;
        resetTime: Date;
      };

      // Request metadata
      requestId?: string;
      startTime?: number;
      
      // Validation
      validatedData?: any;
      
      // Analytics
      analytics?: {
        userId?: string;
        sessionId?: string;
        event?: string;
        properties?: Record<string, any>;
      };

      // Feature flags
      features?: Record<string, boolean>;

      // Language/locale
      locale?: string;
      language?: string;

      // Device info
      device?: {
        type: string;
        os: string;
        browser: string;
      };

      // Search context
      searchContext?: {
        query: string;
        filters: Record<string, any>;
        sort: string;
        pagination: {
          page: number;
          limit: number;
        };
      };

      // Subscription info
      subscription?: {
        plan: string;
        status: string;
        features: string[];
      };

      // Activity tracking
      userActivity?: {
        lastActivity: Date;
        activityCount: number;
        actions: string[];
      };

      // API versioning
      apiVersion?: string;

      // Custom headers
      customHeaders?: Record<string, string>;
    }

    interface Response {
      // Custom response methods
      sendSuccess?: (data: any, message?: string) => void;
      sendError?: (error: any, statusCode?: number) => void;
      sendPaginated?: (data: any[], total: number, page: number, limit: number) => void;
    }

    interface Application {
      // WebSocket support
      ws?: (path: string, handler: any) => void;
      
      // Custom app properties
      isProduction?: boolean;
      config?: Record<string, any>;
      services?: Record<string, any>;
      models?: Record<string, any>;
    }
  }
}

export {};