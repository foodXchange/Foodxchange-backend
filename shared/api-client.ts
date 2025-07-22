// API Client Configuration for Frontend
// Copy this file to your frontend project: src/services/api-client.ts

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  ApiResponse,
  ApiError,
  LoginRequest,
  LoginResponse,
  User,
  Product,
  RFQ,
  Proposal,
  Order,
  SearchParams,
  ComplianceValidation,
  SampleRequest,
  AIAnalysisRequest,
  AIAnalysisResponse,
  AIMatchingResult
} from '@shared/types';

// Configuration
const API_BASE_URL = (typeof process !== 'undefined' && process?.env?.VITE_API_URL) || 
                     (typeof window !== 'undefined' && (window as any).VITE_API_URL) || 
                     'http://localhost:5000/api';
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Create axios instance
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: REQUEST_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor
  client.interceptors.request.use(
    (config) => {
      // Add auth token
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Add request ID for tracking
      config.headers['X-Request-ID'] = generateRequestId();

      return config;
    },
    (error) => {
      console.error('Request error:', error);
      return Promise.reject(error);
    }
  );

  // Response interceptor
  client.interceptors.response.use(
    (response) => {
      // Return data directly
      return response.data;
    },
    async (error: AxiosError<ApiError>) => {
      const { response } = error;

      if (response) {
        // Handle specific error cases
        switch (response.status) {
          case 401:
            // Unauthorized - clear token and redirect
            localStorage.removeItem('auth_token');
            window.location.href = '/login';
            break;
          
          case 403:
            // Forbidden - show permission error
            console.error('Permission denied');
            break;
          
          case 429:
            // Rate limited - show appropriate message
            console.error('Too many requests. Please try again later.');
            break;
          
          case 500:
            // Server error
            console.error('Server error. Please try again later.');
            break;
        }

        // Return the error response
        return Promise.reject(response.data);
      }

      // Network error
      return Promise.reject({
        success: false,
        message: 'Network error. Please check your connection.',
        errors: ['Network error'],
        statusCode: 0,
        requestId: generateRequestId(),
      } as ApiError);
    }
  );

  return client;
};

// Generate unique request ID
const generateRequestId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Create API client instance
const apiClient = createApiClient();

// API Service Methods
export const api = {
  // Authentication
  auth: {
    login: (data: LoginRequest): Promise<ApiResponse<LoginResponse>> =>
      apiClient.post('/auth/login', data),
    
    register: (data: any): Promise<ApiResponse<User>> =>
      apiClient.post('/auth/register', data),
    
    logout: (): Promise<ApiResponse> =>
      apiClient.post('/auth/logout'),
    
    refreshToken: (): Promise<ApiResponse<{ token: string }>> =>
      apiClient.post('/auth/refresh'),
    
    forgotPassword: (email: string): Promise<ApiResponse> =>
      apiClient.post('/auth/forgot-password', { email }),
    
    resetPassword: (token: string, password: string): Promise<ApiResponse> =>
      apiClient.post('/auth/reset-password', { token, password }),
  },

  // Products
  products: {
    getAll: (params?: SearchParams): Promise<ApiResponse<Product[]>> =>
      apiClient.get('/products', { params }),
    
    getById: (id: string): Promise<ApiResponse<Product>> =>
      apiClient.get(`/products/${id}`),
    
    getFeatured: (): Promise<ApiResponse<Product[]>> =>
      apiClient.get('/products/featured'),
    
    getCategories: (): Promise<ApiResponse<any[]>> =>
      apiClient.get('/products/categories'),
    
    create: (data: FormData): Promise<ApiResponse<Product>> =>
      apiClient.post('/products', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    
    update: (id: string, data: Partial<Product>): Promise<ApiResponse<Product>> =>
      apiClient.put(`/products/${id}`, data),
    
    delete: (id: string): Promise<ApiResponse> =>
      apiClient.delete(`/products/${id}`),
    
    requestSample: (productId: string, data: any): Promise<ApiResponse<SampleRequest>> =>
      apiClient.post(`/products/${productId}/sample-request`, data),
  },

  // RFQs
  rfqs: {
    getAll: (params?: SearchParams): Promise<ApiResponse<RFQ[]>> =>
      apiClient.get('/rfq', { params }),
    
    getById: (id: string): Promise<ApiResponse<RFQ>> =>
      apiClient.get(`/rfq/${id}`),
    
    create: (data: Partial<RFQ>): Promise<ApiResponse<RFQ>> =>
      apiClient.post('/rfq', data),
    
    update: (id: string, data: Partial<RFQ>): Promise<ApiResponse<RFQ>> =>
      apiClient.put(`/rfq/${id}`, data),
    
    updateStatus: (id: string, status: string): Promise<ApiResponse<RFQ>> =>
      apiClient.patch(`/rfq/${id}/status`, { status }),
    
    delete: (id: string): Promise<ApiResponse> =>
      apiClient.delete(`/rfq/${id}`),
  },

  // Proposals
  proposals: {
    create: (data: Partial<Proposal>): Promise<ApiResponse<Proposal>> =>
      apiClient.post('/proposals', data),
    
    getByRFQ: (rfqId: string): Promise<ApiResponse<Proposal[]>> =>
      apiClient.get(`/proposals/rfq/${rfqId}`),
    
    getById: (id: string): Promise<ApiResponse<Proposal>> =>
      apiClient.get(`/proposals/${id}`),
    
    accept: (id: string): Promise<ApiResponse<Proposal>> =>
      apiClient.put(`/proposals/${id}/accept`),
  },

  // Orders
  orders: {
    getAll: (params?: SearchParams): Promise<ApiResponse<Order[]>> =>
      apiClient.get('/orders', { params }),
    
    getById: (id: string): Promise<ApiResponse<Order>> =>
      apiClient.get(`/orders/${id}`),
    
    updateStatus: (id: string, status: string): Promise<ApiResponse<Order>> =>
      apiClient.patch(`/orders/${id}/status`, { status }),
  },

  // Compliance
  compliance: {
    validate: (data: any): Promise<ApiResponse<ComplianceValidation>> =>
      apiClient.post('/compliance/validate', data),
    
    validateField: (field: string, value: any): Promise<ApiResponse> =>
      apiClient.post('/compliance/validate-field', { field, value }),
    
    getHistory: (params?: SearchParams): Promise<ApiResponse<ComplianceValidation[]>> =>
      apiClient.get('/compliance/history', { params }),
    
    getRules: (productType: string, targetMarket?: string): Promise<ApiResponse<any>> =>
      apiClient.get(`/compliance/rules/${productType}${targetMarket ? `/${targetMarket}` : ''}`),
    
    getReport: (rfqId: string): Promise<ApiResponse<any>> =>
      apiClient.get(`/compliance/report/${rfqId}`),
  },

  // AI Services
  ai: {
    analyzeRFQ: (rfqData: any): Promise<ApiResponse<AIMatchingResult[]>> =>
      apiClient.post('/ai/rfq/analyze', rfqData),
    
    analyzeProduct: (productId: string): Promise<ApiResponse<AIAnalysisResponse>> =>
      apiClient.post(`/ai/product/${productId}/analyze`),
    
    batchAnalyzeProducts: (productIds: string[]): Promise<ApiResponse<AIAnalysisResponse[]>> =>
      apiClient.post('/ai/products/batch-analyze', { productIds }),
  },

  // Sample Requests
  samples: {
    getAll: (params?: SearchParams): Promise<ApiResponse<SampleRequest[]>> =>
      apiClient.get('/samples', { params }),
    
    getById: (id: string): Promise<ApiResponse<SampleRequest>> =>
      apiClient.get(`/samples/${id}`),
    
    updateStatus: (id: string, status: string): Promise<ApiResponse<SampleRequest>> =>
      apiClient.patch(`/samples/${id}/status`, { status }),
    
    submitFeedback: (id: string, feedback: any): Promise<ApiResponse> =>
      apiClient.post(`/samples/${id}/feedback`, feedback),
  },

  // File Upload
  upload: {
    single: (file: File, type: string): Promise<ApiResponse<{ url: string }>> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      
      return apiClient.post('/upload/single', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    
    multiple: (files: File[], type: string): Promise<ApiResponse<{ urls: string[] }>> => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('type', type);
      
      return apiClient.post('/upload/multiple', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
  },

  // Import
  import: {
    products: (file: File): Promise<ApiResponse<any>> => {
      const formData = new FormData();
      formData.append('file', file);
      
      return apiClient.post('/import/products', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
  },
};

// Helper functions
export const setAuthToken = (token: string): void => {
  localStorage.setItem('auth_token', token);
};

export const clearAuthToken = (): void => {
  localStorage.removeItem('auth_token');
};

export const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

export const isAuthenticated = (): boolean => {
  return !!getAuthToken();
};

// Export types for convenience
export type { ApiResponse, ApiError } from '@shared/types';