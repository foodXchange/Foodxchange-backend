# FoodXchange Architecture Documentation

## System Overview

FoodXchange is a B2B food commerce platform that connects food buyers with suppliers, providing compliance validation, AI-powered matching, and marketplace functionality.

## Architecture Pattern

The system follows a **Monorepo Architecture** with shared types between frontend and backend to ensure type safety and consistency.

```
FoodXchange/
├── backend/          # Node.js + Express + TypeScript
├── frontend/         # React + TypeScript + Vite
└── shared/           # Shared TypeScript types and utilities
```

## Tech Stack

### Backend
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js with TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT-based with bcrypt
- **Real-time**: WebSocket (Socket.io)
- **AI Integration**: Azure Cognitive Services
- **Validation**: Zod + Express Validator

### Frontend
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **State Management**: Context API / Zustand
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios with interceptors
- **Real-time**: Socket.io-client

## API Design Principles

### 1. RESTful Standards
- Use proper HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Resource-based URLs
- Stateless communication

### 2. Consistent Response Format
```typescript
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
  count?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  requestId?: string;
}
```

### 3. Error Handling
```typescript
interface ApiError {
  success: false;
  message: string;
  errors: string[];
  statusCode: number;
  requestId: string;
}
```

## Authentication Flow

1. **Login**: POST `/api/auth/login` → Returns JWT token
2. **Token Storage**: Frontend stores in localStorage/httpOnly cookie
3. **Request Authentication**: Include token in Authorization header
4. **Token Refresh**: Automatic refresh before expiration
5. **Logout**: Clear token and redirect to login

## Core Business Entities

### 1. User System
- **Roles**: buyer, supplier, admin, contractor, agent
- **Profile**: Personal info, company association, preferences
- **Verification**: Email, phone, company verification

### 2. Product Management
- **Product Catalog**: SKU, description, pricing, images
- **Categories**: Hierarchical categorization
- **Compliance**: Certifications, specifications
- **Inventory**: Stock levels, availability

### 3. RFQ (Request for Quote)
- **Creation**: Buyers create RFQs with requirements
- **Matching**: AI-powered supplier matching
- **Proposals**: Suppliers submit proposals
- **Award**: Buyer selects winning proposal

### 4. Compliance System
- **Validation**: Product spec validation
- **Rules Engine**: Market-specific compliance rules
- **Certifications**: Document management
- **Reports**: Compliance status reports

### 5. Order Management
- **Order Creation**: From accepted proposals
- **Status Tracking**: Order lifecycle management
- **Shipping**: Integration with logistics
- **Invoicing**: Financial transactions

## Data Flow

```
Frontend → API Gateway → Express Routes → Controllers → Services → Database
                                    ↓
                              Middleware (Auth, Validation, Logging)
```

## Security Measures

1. **Authentication**: JWT with secure secret rotation
2. **Authorization**: Role-based access control (RBAC)
3. **Input Validation**: Zod schemas for all inputs
4. **Rate Limiting**: API rate limiting per user/IP
5. **CORS**: Configured for frontend domain only
6. **HTTPS**: SSL/TLS for all communications
7. **Data Encryption**: Sensitive data encrypted at rest
8. **File Upload**: Virus scanning, type validation

## Scalability Considerations

1. **Database**: MongoDB replica sets for high availability
2. **Caching**: Redis for session and data caching
3. **File Storage**: Azure Blob Storage for scalable file handling
4. **Load Balancing**: Nginx reverse proxy
5. **Microservices**: Future migration path for specific services
6. **Message Queue**: RabbitMQ for async processing

## Development Workflow

### Backend Development
```bash
cd backend
npm run dev        # Start development server
npm run build      # Build for production
npm run test       # Run tests
npm run lint       # Lint code
```

### Frontend Development
```bash
cd frontend
npm run dev        # Start development server
npm run build      # Build for production
npm run preview    # Preview production build
npm run test       # Run tests
```

## API Documentation

API documentation is available via:
1. **Swagger UI**: http://localhost:5000/api-docs
2. **Postman Collection**: `/docs/postman-collection.json`
3. **TypeScript Types**: Shared types ensure type safety

## Deployment

### Production Environment
- **Backend**: Docker container on Azure App Service
- **Frontend**: Static hosting on Azure Static Web Apps
- **Database**: MongoDB Atlas cluster
- **CDN**: Azure CDN for static assets
- **Monitoring**: Application Insights

### CI/CD Pipeline
1. GitHub Actions for automated testing
2. Build and push Docker images
3. Deploy to staging environment
4. Run E2E tests
5. Deploy to production with approval

## Best Practices

1. **Code Organization**: Feature-based folder structure
2. **Type Safety**: Strict TypeScript configuration
3. **Testing**: Unit, integration, and E2E tests
4. **Documentation**: JSDoc comments, README files
5. **Version Control**: Git flow with feature branches
6. **Code Review**: PR reviews required
7. **Performance**: Lazy loading, code splitting
8. **Accessibility**: WCAG 2.1 AA compliance

## Future Enhancements

1. **GraphQL API**: For flexible data fetching
2. **Microservices**: Extract services for scalability
3. **AI Enhancement**: More sophisticated matching algorithms
4. **Mobile Apps**: React Native applications
5. **Blockchain**: Supply chain transparency
6. **Analytics**: Advanced business intelligence