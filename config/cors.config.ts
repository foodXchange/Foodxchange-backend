import { CorsOptions } from 'cors';

// Define allowed origins based on environment
const getAllowedOrigins = (): string[] => {
  const origins: string[] = [];
  
  // Always allow localhost for development
  if (process.env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174'
    );
  }
  
  // Add production frontend URL
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }
  
  // Add any additional allowed origins from environment
  if (process.env.ALLOWED_ORIGINS) {
    const additionalOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
    origins.push(...additionalOrigins);
  }
  
  return origins;
};

// CORS configuration
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if the origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  
  credentials: true, // Allow cookies and authentication headers
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-ID',
    'Accept',
    'Origin',
  ],
  
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  
  maxAge: 86400, // 24 hours
  
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

// Helper function to check if origin is allowed
export const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
};

// Development CORS (more permissive)
export const devCorsOptions: CorsOptions = {
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
};

// Export the appropriate configuration based on environment
export default process.env.NODE_ENV === 'production' ? corsOptions : devCorsOptions;