# Frontend-Backend Synchronization Guide

## Overview

This guide ensures proper synchronization between the FoodXchange frontend and backend applications.

## Quick Start

### 1. Backend Setup (Current Directory)
```bash
# Install dependencies
npm install

# Create .env file with required variables
cp .env.example .env

# Start development server
npm run dev

# Backend will run on http://localhost:5000
```

### 2. Frontend Setup (FDX-frontend)
```bash
# Navigate to frontend directory
cd C:\Users\foodz\Documents\GitHub\Development\FDX-frontend

# Install dependencies
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:5000/api" > .env

# Start development server
npm run dev

# Frontend will run on http://localhost:5173
```

## Shared Types Configuration

### Backend Setup
1. Install the shared types:
```bash
# In backend directory
npm install --save-dev @types/node
```

2. Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../shared/*"],
      "@shared": ["../shared"]
    }
  }
}
```

### Frontend Setup
1. Update frontend's `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../Foodxchange-backend/shared/*"],
      "@shared": ["../Foodxchange-backend/shared"]
    }
  }
}
```

## API Integration Pattern

### Frontend API Service
Create `src/services/api.ts` in frontend:

```typescript
import axios from 'axios';
import type { ApiResponse } from '@shared/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create axios instance
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data || error);
  }
);

// Typed API methods
export const authAPI = {
  login: (data: LoginRequest): Promise<ApiResponse<LoginResponse>> =>
    api.post('/auth/login', data),
    
  register: (data: RegisterRequest): Promise<ApiResponse<User>> =>
    api.post('/auth/register', data),
    
  logout: (): Promise<ApiResponse> =>
    api.post('/auth/logout'),
};

export const productAPI = {
  getAll: (params?: SearchParams): Promise<ApiResponse<Product[]>> =>
    api.get('/products', { params }),
    
  getById: (id: string): Promise<ApiResponse<Product>> =>
    api.get(`/products/${id}`),
    
  create: (data: Partial<Product>): Promise<ApiResponse<Product>> =>
    api.post('/products', data),
};
```

## Real-time Synchronization

### Backend WebSocket Setup
```typescript
// server.ts
import { Server } from 'socket.io';

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Join user-specific room
  socket.on('authenticate', (userId) => {
    socket.join(`user:${userId}`);
  });
  
  // Handle events
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Emit events from controllers
export const emitToUser = (userId: string, event: string, data: any) => {
  io.to(`user:${userId}`).emit(event, data);
};
```

### Frontend WebSocket Setup
```typescript
// src/services/websocket.ts
import { io, Socket } from 'socket.io-client';

class WebSocketService {
  private socket: Socket | null = null;
  
  connect(token: string) {
    this.socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:5000', {
      auth: { token },
    });
    
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket');
    });
    
    this.socket.on('notification', (data) => {
      // Handle notification
      console.log('New notification:', data);
    });
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  emit(event: string, data: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }
}

export const wsService = new WebSocketService();
```

## State Management

### Frontend State with Context API
```typescript
// src/contexts/AppContext.tsx
import React, { createContext, useContext, useReducer } from 'react';
import type { User, Product, RFQ } from '@shared/types';

interface AppState {
  user: User | null;
  products: Product[];
  rfqs: RFQ[];
  loading: boolean;
  error: string | null;
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<any>;
}>({} as any);

export const useApp = () => useContext(AppContext);
```

## Development Workflow

### 1. Adding New Features
1. Define types in `shared/types`
2. Create backend endpoint
3. Test with Postman/Thunder Client
4. Implement frontend integration
5. Add error handling
6. Write tests

### 2. Type Safety Checklist
- [ ] Define shared types for all API contracts
- [ ] Use TypeScript strict mode
- [ ] Validate request data with Zod
- [ ] Type all API responses
- [ ] Handle null/undefined cases

### 3. Testing Integration
```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# E2E tests (both servers running)
cd e2e && npm test
```

## Common Issues & Solutions

### CORS Issues
```typescript
// backend/server.ts
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
```

### Authentication Token Expiry
```typescript
// Frontend: Auto-refresh token
const refreshToken = async () => {
  try {
    const response = await api.post('/auth/refresh');
    localStorage.setItem('token', response.data.token);
  } catch (error) {
    // Redirect to login
  }
};
```

### Type Mismatch
```typescript
// Use type guards
const isProduct = (item: any): item is Product => {
  return item && typeof item.sku === 'string';
};
```

## Environment Variables

### Backend (.env)
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/foodxchange
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
AZURE_STORAGE_CONNECTION_STRING=
AZURE_TEXT_ANALYTICS_ENDPOINT=
AZURE_TEXT_ANALYTICS_KEY=
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000/api
VITE_WS_URL=http://localhost:5000
VITE_APP_NAME=FoodXchange
```

## Deployment Synchronization

### Production Checklist
1. [ ] Update API URLs in frontend
2. [ ] Configure CORS for production domain
3. [ ] Set secure cookie options
4. [ ] Enable HTTPS
5. [ ] Configure proper logging
6. [ ] Set up monitoring
7. [ ] Database backups
8. [ ] CDN for static assets

## API Versioning

### Backend
```typescript
// routes/index.ts
app.use('/api/v1', v1Routes);
app.use('/api/v2', v2Routes); // Future
```

### Frontend
```typescript
// services/api.ts
const API_VERSION = 'v1';
const API_URL = `${BASE_URL}/api/${API_VERSION}`;
```

## Monitoring & Debugging

### Backend Logging
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

### Frontend Error Tracking
```typescript
// Error boundary component
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Send to monitoring service
  }
}
```

## Performance Optimization

### Backend
1. Use database indexes
2. Implement caching with Redis
3. Paginate large datasets
4. Optimize queries with .lean()
5. Use compression middleware

### Frontend
1. Lazy load components
2. Implement virtual scrolling
3. Use React.memo for expensive components
4. Optimize bundle size
5. Cache API responses

## Next Steps

1. Set up the frontend project
2. Install shared dependencies
3. Configure environment variables
4. Test API endpoints
5. Implement authentication flow
6. Build core features
7. Add real-time updates
8. Deploy to staging