# Frontend Configuration for New API

## Update Frontend Environment

In your frontend project (`FDX-frontend`), update the `.env` file:

```env
# Old API (v0)
VITE_API_URL_OLD=http://localhost:5000/api

# New API (v1)
VITE_API_URL=http://localhost:5001/api/v1

# WebSocket URL
VITE_WS_URL=ws://localhost:5001

# Feature flags
VITE_USE_NEW_API=true
VITE_ENABLE_WEBSOCKET=true
```

## Update API Client

Create or update `src/services/api.ts` in your frontend:

```typescript
import axios from 'axios';
import { api } from '@shared/api-client'; // Use the shared client we created

// Configure base URL based on environment
const API_VERSION = import.meta.env.VITE_USE_NEW_API === 'true' ? 'v1' : 'v0';
const BASE_URL = import.meta.env.VITE_USE_NEW_API === 'true' 
  ? import.meta.env.VITE_API_URL 
  : import.meta.env.VITE_API_URL_OLD;

// Export configured API client
export default api;

// Convenience exports
export const {
  auth,
  products,
  rfqs,
  orders,
  compliance,
  samples,
  ai,
} = api;
```

## Update API Calls

### Old API Call:
```typescript
// Before
const response = await fetch('http://localhost:5000/api/products');
const data = await response.json();
```

### New API Call:
```typescript
// After
import { products } from '@/services/api';

const response = await products.getAll({
  page: 1,
  limit: 20,
  sort: 'createdAt',
  order: 'desc'
});
// response.data contains the products
```

## API Endpoint Mapping

| Feature | Old Endpoint | New Endpoint |
|---------|--------------|--------------|
| Login | `POST /api/auth/login` | `POST /api/v1/auth/login` |
| Products List | `GET /api/products` | `GET /api/v1/products` |
| Create RFQ | `POST /api/rfq` | `POST /api/v1/rfq` |
| Compliance Check | `POST /api/compliance/validate` | `POST /api/v1/compliance/validate` |
| Orders | `GET /api/orders` | `GET /api/v1/orders` |

## Update WebSocket Connection

```typescript
// src/services/websocket.ts
import { io, Socket } from 'socket.io-client';

class WebSocketService {
  private socket: Socket | null = null;

  connect(token: string) {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5001';
    
    this.socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket');
    });

    this.socket.on('notification', (data) => {
      console.log('New notification:', data);
      // Handle notification
    });

    this.socket.on('rfq:update', (data) => {
      console.log('RFQ updated:', data);
      // Update RFQ in state
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

  on(event: string, callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }
}

export const wsService = new WebSocketService();
```

## Update Authentication Flow

```typescript
// src/contexts/AuthContext.tsx
import { auth } from '@/services/api';
import { wsService } from '@/services/websocket';

export const useAuth = () => {
  const login = async (email: string, password: string) => {
    try {
      const response = await auth.login({ email, password });
      
      // Store token
      localStorage.setItem('auth_token', response.data.token);
      
      // Connect WebSocket
      wsService.connect(response.data.token);
      
      return response.data;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await auth.logout();
    } finally {
      localStorage.removeItem('auth_token');
      wsService.disconnect();
    }
  };

  return { login, logout };
};
```

## Error Handling

Update error handling to work with new error format:

```typescript
// src/utils/errorHandler.ts
import { ApiError } from '@shared/types';

export const handleApiError = (error: any): string => {
  if (error.success === false) {
    // New API error format
    if (error.error?.validationErrors) {
      return error.error.validationErrors
        .map((e: any) => `${e.field}: ${e.message}`)
        .join(', ');
    }
    return error.error?.message || error.message || 'An error occurred';
  }
  
  // Fallback for network errors
  return error.message || 'Network error';
};
```

## Testing the Integration

Create a test component:

```typescript
// src/components/ApiTest.tsx
import { useState } from 'react';
import { products, compliance } from '@/services/api';

export const ApiTest = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testProductsApi = async () => {
    setLoading(true);
    try {
      const response = await products.getAll({ limit: 5 });
      setResult(response);
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const testComplianceApi = async () => {
    setLoading(true);
    try {
      const response = await compliance.validate({
        productType: 'dairy',
        specifications: { temperature: 4 }
      });
      setResult(response);
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">API Test</h2>
      
      <div className="space-x-2 mb-4">
        <button 
          onClick={testProductsApi}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Test Products API
        </button>
        
        <button 
          onClick={testComplianceApi}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Test Compliance API
        </button>
      </div>

      {result && (
        <pre className="bg-gray-100 p-4 rounded">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
};
```

## Migration Checklist

- [ ] Update `.env` with new API URL
- [ ] Install shared types package
- [ ] Update API client configuration
- [ ] Update authentication flow
- [ ] Update all API calls to use new client
- [ ] Add WebSocket support
- [ ] Update error handling
- [ ] Test all features
- [ ] Remove old API code

## Gradual Migration Strategy

1. **Phase 1**: Add new API client alongside old one
2. **Phase 2**: Migrate feature by feature
3. **Phase 3**: Add WebSocket for real-time features
4. **Phase 4**: Remove old API code
5. **Phase 5**: Optimize and add caching