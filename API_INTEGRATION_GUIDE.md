# FoodXchange API Integration Guide

## 🎯 **Quick Start for Frontend Teams**

This guide provides everything needed to integrate the FoodXchange backend APIs with frontend applications.

## 📋 **Available APIs Overview**

### **Core Business APIs**
```typescript
// Base URL: http://localhost:5000/api

// Authentication & Users
POST   /auth/login              // User authentication
POST   /auth/register           // User registration  
GET    /auth/me                 // Get current user
POST   /auth/logout             // Logout user

// RFQ Management
GET    /rfq                     // Get RFQs
POST   /rfq                     // Create RFQ
GET    /rfq/:id                 // Get specific RFQ
PUT    /rfq/:id                 // Update RFQ

// Compliance
GET    /compliance/check        // Run compliance checks
GET    /compliance/reports      // Get compliance reports
POST   /compliance/certify      // Submit certification

// Payments
POST   /payments/process        // Process payment
GET    /payments/:id            // Get payment details
POST   /payments/:id/refund     // Refund payment
GET    /payments/stats          // Payment statistics
```

### **Advanced Feature APIs**
```typescript
// Search (Elasticsearch)
GET    /search/products         // Search products
GET    /search/companies        // Search companies
GET    /search/suggest          // Autocomplete suggestions

// Real-time Chat
WS     /socket.io               // WebSocket connection
POST   /chat/rooms              // Create chat room
GET    /chat/history/:roomId    // Get chat history

// Notifications
POST   /notifications/send      // Send notification
GET    /notifications/user      // Get user notifications
PUT    /notifications/:id/read  // Mark as read

// Workflows
POST   /workflows/start         // Start workflow
GET    /workflows/instances     // Get workflow instances
POST   /workflows/approve       // Submit approval

// A/B Testing
GET    /ab-tests/active         // Get active tests
POST   /ab-tests/track          // Track experiment event

// Audit & Analytics
GET    /audit/logs              // Get audit logs
GET    /audit/stats             // Get audit statistics
```

## 🔐 **Authentication Setup**

### **JWT Token Management**
```typescript
// Frontend authentication helper
class AuthService {
  private token: string | null = null;

  async login(email: string, password: string) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (data.success) {
      this.token = data.token;
      localStorage.setItem('authToken', this.token);
      return data.user;
    }
    throw new Error(data.error?.message || 'Login failed');
  }

  logout() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  getAuthHeaders() {
    const token = this.token || localStorage.getItem('authToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
}

export const authService = new AuthService();
```

### **API Client Setup**
```typescript
// Axios configuration for API calls
import axios from 'axios';
import { authService } from './auth';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 10000,
});

// Request interceptor for auth
apiClient.interceptors.request.use((config) => {
  const authHeaders = authService.getAuthHeaders();
  config.headers = { ...config.headers, ...authHeaders };
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authService.logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

## 💳 **Payment Integration**

### **Stripe Frontend Integration**
```typescript
// Install: npm install @stripe/stripe-js

import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

export const PaymentForm = ({ amount, orderId, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);

  const handlePayment = async (paymentMethodId: string) => {
    setLoading(true);
    
    try {
      const response = await apiClient.post('/payments/process', {
        orderId,
        amount: amount * 100, // Convert to cents
        currency: 'USD',
        paymentMethod: {
          type: 'credit_card',
          token: paymentMethodId
        },
        customer: {
          email: 'customer@example.com',
          name: 'Customer Name'
        }
      });

      if (response.data.success) {
        onSuccess(response.data.data);
      } else if (response.data.requiresAction) {
        // Handle 3D Secure authentication
        const stripe = await stripePromise;
        const { error } = await stripe.confirmCardPayment(
          response.data.requiresAction.clientSecret
        );
        
        if (error) {
          onError(error.message);
        } else {
          onSuccess(response.data.data);
        }
      }
    } catch (error) {
      onError(error.response?.data?.error?.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <StripePaymentForm
      onSubmit={handlePayment}
      loading={loading}
      amount={amount}
    />
  );
};
```

## 🔍 **Search Integration**

### **Advanced Search with Elasticsearch**
```typescript
// Search service
export class SearchService {
  async searchProducts(query: string, filters?: any) {
    const params = new URLSearchParams({
      q: query,
      ...filters,
      limit: '20'
    });

    const response = await apiClient.get(`/search/products?${params}`);
    return response.data.data;
  }

  async getAutocompleteSuggestions(query: string) {
    const response = await apiClient.get(`/search/suggest?q=${query}`);
    return response.data.data.suggestions;
  }

  async searchWithFacets(query: string) {
    const response = await apiClient.get('/search/products', {
      params: {
        q: query,
        facets: ['category', 'price_range', 'location', 'certifications']
      }
    });
    
    return {
      results: response.data.data.results,
      facets: response.data.data.facets,
      total: response.data.data.total
    };
  }
}

export const searchService = new SearchService();
```

### **Search Component Example**
```typescript
export const ProductSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (searchQuery: string) => {
    setLoading(true);
    try {
      const searchResults = await searchService.searchProducts(searchQuery);
      setResults(searchResults.results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = async (value: string) => {
    setQuery(value);
    if (value.length > 2) {
      const autocompleteSuggestions = await searchService.getAutocompleteSuggestions(value);
      setSuggestions(autocompleteSuggestions);
    }
  };

  return (
    <div className="product-search">
      <SearchInput
        value={query}
        onChange={handleInputChange}
        onSearch={handleSearch}
        suggestions={suggestions}
        loading={loading}
      />
      <SearchResults results={results} />
    </div>
  );
};
```

## 💬 **Real-time Chat Integration**

### **Socket.IO Setup**
```typescript
// Install: npm install socket.io-client

import io from 'socket.io-client';

export class ChatService {
  private socket: any;

  connect(userId: string) {
    this.socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
      auth: {
        token: localStorage.getItem('authToken')
      }
    });

    this.socket.emit('user:join', { userId });

    return this.socket;
  }

  joinRoom(roomId: string) {
    this.socket.emit('room:join', { roomId });
  }

  sendMessage(roomId: string, message: string) {
    this.socket.emit('message:send', {
      roomId,
      message,
      timestamp: new Date()
    });
  }

  onMessage(callback: (message: any) => void) {
    this.socket.on('message:received', callback);
  }

  onUserJoined(callback: (user: any) => void) {
    this.socket.on('user:joined', callback);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export const chatService = new ChatService();
```

## 🔔 **Push Notifications**

### **Web Push Notifications**
```typescript
// Service worker registration
export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.register('/sw.js');
    return registration;
  }
};

// Push notification subscription
export const subscribeToPush = async () => {
  const registration = await registerServiceWorker();
  
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: process.env.REACT_APP_VAPID_PUBLIC_KEY
  });

  // Send subscription to backend
  await apiClient.post('/notifications/subscribe', {
    subscription: subscription.toJSON(),
    platform: 'web'
  });

  return subscription;
};
```

## 🌍 **Multi-language Support**

### **i18n Integration**
```typescript
// Install: npm install react-i18next i18next

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    
    // Backend integration
    backend: {
      loadPath: '/api/i18n/{{lng}}/{{ns}}'
    },

    interpolation: {
      escapeValue: false
    }
  });

export default i18n;

// Usage in components
import { useTranslation } from 'react-i18next';

export const MyComponent = () => {
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div>
      <h1>{t('welcome.title')}</h1>
      <p>{t('welcome.description')}</p>
      
      <select onChange={(e) => changeLanguage(e.target.value)}>
        <option value="en">English</option>
        <option value="es">Español</option>
        <option value="fr">Français</option>
      </select>
    </div>
  );
};
```

## 📊 **A/B Testing Integration**

### **Experiment Tracking**
```typescript
export class ABTestService {
  async getActiveExperiments() {
    const response = await apiClient.get('/ab-tests/active');
    return response.data.data;
  }

  async trackEvent(experimentId: string, eventType: string, metadata?: any) {
    await apiClient.post('/ab-tests/track', {
      experimentId,
      eventType,
      metadata,
      timestamp: new Date()
    });
  }

  async getVariant(experimentId: string): Promise<string> {
    const response = await apiClient.get(`/ab-tests/${experimentId}/variant`);
    return response.data.data.variant;
  }
}

// React hook for A/B testing
export const useABTest = (experimentId: string) => {
  const [variant, setVariant] = useState<string>('control');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVariant = async () => {
      try {
        const experimentVariant = await abTestService.getVariant(experimentId);
        setVariant(experimentVariant);
      } catch (error) {
        console.error('Failed to load A/B test variant:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVariant();
  }, [experimentId]);

  const trackEvent = (eventType: string, metadata?: any) => {
    abTestService.trackEvent(experimentId, eventType, metadata);
  };

  return { variant, loading, trackEvent };
};

export const abTestService = new ABTestService();
```

## 🔄 **Workflow Integration**

### **Workflow Management**
```typescript
export class WorkflowService {
  async startWorkflow(definitionId: string, input: any) {
    const response = await apiClient.post(`/workflows/definitions/${definitionId}/start`, {
      input,
      metadata: {
        initiatedBy: 'frontend',
        timestamp: new Date()
      }
    });
    return response.data.data;
  }

  async getApprovalRequests() {
    const response = await apiClient.get('/workflows/approvals');
    return response.data.data;
  }

  async submitApproval(instanceId: string, stepId: string, action: string, comment?: string) {
    const response = await apiClient.post(
      `/workflows/instances/${instanceId}/steps/${stepId}/approve`,
      { action, comment }
    );
    return response.data.data;
  }

  async getWorkflowInstance(instanceId: string) {
    const response = await apiClient.get(`/workflows/instances/${instanceId}`);
    return response.data.data;
  }
}

export const workflowService = new WorkflowService();
```

## 🛠️ **Development Environment Setup**

### **Environment Variables**
```bash
# .env file for frontend
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...
REACT_APP_VAPID_PUBLIC_KEY=your_vapid_public_key
```

### **API Client Configuration**
```typescript
// config/api.ts
export const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 10000,
  retries: 3,
  retryDelay: 1000,
};

// Error handling
export const handleApiError = (error: any) => {
  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;
    
    switch (status) {
      case 401:
        // Unauthorized - redirect to login
        authService.logout();
        break;
      case 403:
        // Forbidden - show access denied message
        throw new Error('Access denied');
      case 429:
        // Rate limited - show retry message
        throw new Error('Rate limit exceeded. Please try again later.');
      default:
        throw new Error(data?.error?.message || 'An error occurred');
    }
  } else if (error.request) {
    // Network error
    throw new Error('Network error. Please check your connection.');
  } else {
    // Other error
    throw new Error(error.message || 'An unexpected error occurred');
  }
};
```

## 📱 **Mobile App Integration**

### **React Native Setup**
```typescript
// Install: npm install @react-native-async-storage/async-storage

import AsyncStorage from '@react-native-async-storage/async-storage';

class MobileAuthService {
  async storeToken(token: string) {
    await AsyncStorage.setItem('authToken', token);
  }

  async getToken(): Promise<string | null> {
    return await AsyncStorage.getItem('authToken');
  }

  async removeToken() {
    await AsyncStorage.removeItem('authToken');
  }
}

// Push notifications for mobile
import messaging from '@react-native-firebase/messaging';

export const requestUserPermission = async () => {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    const fcmToken = await messaging().getToken();
    
    // Send token to backend
    await apiClient.post('/notifications/device', {
      token: fcmToken,
      platform: 'android' // or 'ios'
    });
  }
};
```

## 🧪 **Testing Integration**

### **API Testing Utilities**
```typescript
// test-utils/api.ts
export const createMockApiClient = () => {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
};

// test-utils/auth.ts
export const mockAuthUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: 'buyer',
  token: 'mock-jwt-token'
};

// Integration test example
describe('Payment Integration', () => {
  test('processes payment successfully', async () => {
    const mockResponse = {
      data: {
        success: true,
        data: { id: 'payment-123', status: 'completed' }
      }
    };

    apiClient.post.mockResolvedValue(mockResponse);

    const result = await paymentService.processPayment({
      amount: 100,
      orderId: 'order-123'
    });

    expect(result.success).toBe(true);
    expect(apiClient.post).toHaveBeenCalledWith('/payments/process', expect.objectContaining({
      amount: 10000, // Converted to cents
      orderId: 'order-123'
    }));
  });
});
```

## 📚 **Common Integration Patterns**

### **Data Fetching Hook**
```typescript
export const useApi = <T>(url: string, options?: any) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(url, options);
        setData(response.data.data);
      } catch (err) {
        setError(handleApiError(err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]);

  const refetch = () => {
    fetchData();
  };

  return { data, loading, error, refetch };
};

// Usage
const { data: products, loading, error } = useApi<Product[]>('/products');
```

### **Form Submission Helper**
```typescript
export const useForm = <T>(initialValues: T, onSubmit: (values: T) => Promise<void>) => {
  const [values, setValues] = useState<T>(initialValues);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      await onSubmit(values);
    } catch (error) {
      if (error.response?.data?.validation) {
        setErrors(error.response.data.validation);
      } else {
        setErrors({ general: error.message });
      }
    } finally {
      setLoading(false);
    }
  };

  const setValue = (field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  return { values, setValue, handleSubmit, loading, errors };
};
```

## 🚨 **Error Handling Best Practices**

### **Global Error Boundary**
```typescript
export class ApiErrorBoundary extends React.Component {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    // Log error to monitoring service
    console.error('API Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>Please refresh the page or contact support</p>
        </div>
      );
    }

    return this.props.children;
  }
}
```

This guide provides everything needed to integrate the FoodXchange backend APIs with any frontend application. Each section includes working code examples and best practices for production use.

For specific implementation questions or troubleshooting, refer to the individual API documentation or contact the development team.