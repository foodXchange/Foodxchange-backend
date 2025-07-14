# FoodXchange Enterprise Architecture

## 🏗️ Architecture Overview

FoodXchange backend has been redesigned with enterprise-grade architecture patterns focusing on:

- **Scalability**: Microservices-ready architecture
- **Maintainability**: Clear separation of concerns
- **Robustness**: Comprehensive error handling and monitoring
- **Performance**: Caching, connection pooling, and optimization
- **Security**: Multiple layers of security measures

## 📁 Project Structure

```
foodxchange-backend/
├── src/
│   ├── core/                 # Core framework components
│   │   ├── config/          # Centralized configuration
│   │   ├── di/             # Dependency injection
│   │   ├── errors/         # Error handling system
│   │   └── logging/        # Enterprise logging
│   │
│   ├── infrastructure/      # External service integrations
│   │   ├── azure/          # Azure services
│   │   │   ├── ai/         # AI services (Text Analytics, Vision, OpenAI)
│   │   │   └── storage/    # Blob storage
│   │   ├── cache/          # Redis/In-memory caching
│   │   ├── database/       # MongoDB service
│   │   └── monitoring/     # Metrics and monitoring
│   │
│   ├── domain/             # Business logic (future)
│   │   ├── auth/          # Authentication domain
│   │   ├── marketplace/   # Marketplace domain
│   │   ├── compliance/    # Compliance domain
│   │   └── rfq/          # RFQ domain
│   │
│   ├── api/               # API layer
│   │   ├── controllers/   # Request handlers
│   │   ├── middleware/    # Express middleware
│   │   ├── routes/        # Route definitions
│   │   └── validators/    # Request validation
│   │
│   ├── services/          # Business services
│   ├── models/            # Database models
│   ├── utils/             # Utility functions
│   └── server.ts          # Application entry point
│
├── shared/                # Shared with frontend
│   ├── types/            # TypeScript interfaces
│   └── api-client.ts     # API client template
│
├── config/               # Configuration files
├── scripts/              # Utility scripts
├── tests/                # Test files
└── docs/                 # Documentation
```

## 🚀 Key Features

### 1. **Centralized Configuration**
- Type-safe configuration with Zod validation
- Environment-based settings
- Feature flags support

### 2. **Enterprise Logging**
- Structured logging with Winston
- Log rotation and archiving
- Correlation IDs for request tracing
- Multiple transports (console, file, external services)

### 3. **Comprehensive Error Handling**
- Typed error classes
- Consistent error responses
- Error tracking and monitoring
- Graceful error recovery

### 4. **Azure AI Integration**
- Unified interface for all Azure Cognitive Services
- Automatic retry and circuit breaking
- Response caching
- Performance monitoring

### 5. **Caching Strategy**
- Multi-tier caching (Redis + In-memory)
- Automatic fallback
- Cache invalidation patterns
- Performance metrics

### 6. **Database Service**
- Connection pooling
- Transaction support
- Query monitoring
- Automatic reconnection

### 7. **Dependency Injection**
- IoC container
- Service lifetime management
- Decorator support
- Easy testing and mocking

### 8. **Monitoring & Metrics**
- Real-time metrics collection
- Prometheus-compatible export
- Business event tracking
- Performance monitoring

## 🔧 Configuration

### Environment Variables
The system uses a comprehensive `.env` file. Copy `.env.example` to `.env` and configure:

```bash
# Core Settings
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/foodxchange

# Azure AI Services
AZURE_TEXT_ANALYTICS_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_TEXT_ANALYTICS_KEY=your-key

# ... see .env.example for all options
```

### Feature Flags
Enable/disable features via environment variables:
- `ENABLE_AI_FEATURES`
- `ENABLE_WEBSOCKET`
- `ENABLE_CACHING`
- `ENABLE_EMAIL_NOTIFICATIONS`

## 🏃 Running the Application

### Development
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Production
```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Other Commands
```bash
npm run typecheck    # Type checking
npm run lint         # Linting
npm run test         # Run tests
npm run clean        # Clean build artifacts
```

## 📊 Monitoring Endpoints

- **Health Check**: `GET /health`
- **Metrics**: `GET /metrics` (Prometheus format)
- **API Info**: `GET /api`

## 🔐 Security Features

1. **Request Security**
   - Helmet.js for security headers
   - CORS with whitelist
   - Rate limiting
   - Request sanitization

2. **Authentication**
   - JWT-based authentication
   - Refresh token support
   - Role-based access control

3. **Data Protection**
   - Input validation with Zod
   - MongoDB injection prevention
   - XSS protection
   - HTTPS enforcement

## 🎯 Performance Optimizations

1. **Caching**
   - API response caching
   - Database query caching
   - Static asset caching

2. **Database**
   - Connection pooling
   - Indexed queries
   - Query optimization
   - Aggregation pipelines

3. **API**
   - Response compression
   - Pagination support
   - Partial responses
   - Batch operations

## 🧪 Testing Strategy

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

## 📈 Scalability Considerations

1. **Horizontal Scaling**
   - Stateless design
   - Session management via Redis
   - Load balancer ready

2. **Microservices Ready**
   - Domain-driven design
   - Service boundaries defined
   - Message queue support
   - API gateway compatible

3. **Cloud Native**
   - Container ready
   - Environment-based config
   - Health checks
   - Graceful shutdown

## 🚨 Error Handling

Errors are categorized with specific codes:
- `AUTH_xxx`: Authentication errors
- `VAL_xxx`: Validation errors
- `BUS_xxx`: Business logic errors
- `EXT_xxx`: External service errors
- `SYS_xxx`: System errors

## 📝 API Documentation

API documentation is auto-generated and available at:
- Development: `http://localhost:5000/api/docs`
- Production: `https://api.foodxchange.com/docs`

## 🔄 Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

### Azure App Service
The application is configured for Azure App Service deployment with:
- Application Insights integration
- Azure Key Vault for secrets
- Managed Identity support

## 🤝 Contributing

1. Follow TypeScript best practices
2. Maintain test coverage above 80%
3. Document all public APIs
4. Use conventional commits
5. Run linter before committing

## 📞 Support

For issues or questions:
- Check logs in `/logs` directory
- Review health check endpoint
- Monitor metrics endpoint
- Contact: dev@foodxchange.com