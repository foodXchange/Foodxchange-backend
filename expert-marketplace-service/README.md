# FoodXchange Expert Marketplace Service

A comprehensive B2B expert marketplace specifically designed for the food industry, providing intelligent matching, real-time collaboration, and compliance expertise.

## 🚀 Features Implemented

### ✅ Core Infrastructure
- **TypeScript + Express.js** microservice architecture
- **MongoDB + Mongoose** with optimized schemas and indexing
- **Redis caching** with fallback to in-memory storage
- **Socket.io** for real-time features
- **Comprehensive security** with rate limiting, input sanitization, and XSS protection

### ✅ Authentication & Security
- **JWT-based authentication** with refresh tokens
- **Two-factor authentication** with backup codes
- **Role-based permissions** for experts and clients
- **Advanced security middleware** with CSRF protection
- **Expert verification system** with document upload

### ✅ Expert Management
- **Complete expert profiles** with specializations and verification
- **Service creation and management** for verified experts
- **Availability scheduling** with time slot management
- **Document upload** with Azure Storage integration
- **Dashboard analytics** with performance metrics

### ✅ Advanced Search & Matching
- **AI-powered expert matching** using Azure Text Analytics
- **Intelligent RFQ analysis** with automatic expert suggestions
- **Multi-criteria search** with caching and filtering
- **Food industry specializations** with 20+ expert categories
- **Autocomplete suggestions** and trending data

### ✅ Real-time Status Tracking
- **Live expert availability** with WebSocket updates
- **Instant consultation booking** with automated scheduling
- **Workload monitoring** and utilization tracking
- **Expert presence tracking** with session management

## 🏗️ Architecture Overview

```
├── src/
│   ├── controllers/         # Request handlers
│   │   ├── AuthController.ts
│   │   ├── ExpertController.ts
│   │   └── SearchController.ts
│   ├── models/             # Database schemas
│   │   ├── ExpertProfile.model.ts
│   │   ├── ExpertService.model.ts
│   │   ├── ExpertCollaboration.model.ts
│   │   └── [8 other models]
│   ├── services/           # Business logic
│   │   ├── AuthService.ts
│   │   ├── ExpertMatchingEngine.ts
│   │   ├── ExpertStatusTracker.ts
│   │   └── CacheService.ts
│   ├── middleware/         # Express middleware
│   │   ├── auth.middleware.ts
│   │   └── security.middleware.ts
│   ├── routes/            # API routes
│   │   ├── auth.routes.ts
│   │   ├── expert.routes.ts
│   │   └── search.routes.ts
│   └── config/           # Configuration
│       ├── index.ts
│       └── expertSpecializations.ts
```

## 🔧 Getting Started

### Prerequisites
- Node.js 20+ LTS
- MongoDB 7.x
- Redis 7.x
- Azure account (for AI services and storage)

### Installation

1. **Install dependencies:**
   ```bash
   cd expert-marketplace-service
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp .env.example .env
   # Configure your environment variables
   ```

3. **Start the service:**
   ```bash
   # Development
   npm run dev

   # Production
   npm run build
   npm start
   ```

### Key Environment Variables

```env
# Database
MONGODB_URI=mongodb://localhost:27017/foodxchange_experts
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# Azure Services
AZURE_OPENAI_ENDPOINT=your-openai-endpoint
AZURE_TEXT_ANALYTICS_ENDPOINT=your-text-analytics-endpoint
AZURE_STORAGE_CONNECTION_STRING=your-storage-connection

# Stripe
STRIPE_SECRET_KEY=your-stripe-secret-key
```

## 📚 API Documentation

### Authentication Endpoints
```
POST /api/v1/auth/register          - Register new expert
POST /api/v1/auth/login             - Login expert
POST /api/v1/auth/refresh           - Refresh access token
POST /api/v1/auth/logout            - Logout expert
POST /api/v1/auth/2fa/setup         - Setup 2FA
GET  /api/v1/auth/me                - Get current expert
```

### Expert Management
```
GET  /api/v1/experts/profile/:id    - Get expert profile
PUT  /api/v1/experts/profile        - Update profile
POST /api/v1/experts/profile/photo  - Upload photo
GET  /api/v1/experts/dashboard      - Get dashboard data
GET  /api/v1/experts/analytics      - Get analytics
POST /api/v1/experts/services       - Create service
GET  /api/v1/experts/services       - Get services
PUT  /api/v1/experts/services/:id   - Update service
```

### Search & Discovery
```
GET  /api/v1/search/experts         - Search experts
GET  /api/v1/search/services        - Search services
GET  /api/v1/search/suggestions     - Autocomplete
GET  /api/v1/search/specializations - Get specializations
POST /api/v1/search/suggest-experts - AI expert suggestions
```

## 🎯 Food Industry Specializations

The platform includes 20+ specialized expert categories:

### Compliance & Regulatory
- HACCP Specialist
- FDA Compliance Consultant
- Organic Certification Specialist
- Halal/Kosher Certification Expert

### Quality & Safety
- Food Microbiologist
- Quality Assurance Manager
- Allergen Management Specialist

### Supply Chain & Logistics
- Cold Chain Specialist
- Import/Export Specialist
- Supply Chain Optimization

### Product Development
- Food Scientist/R&D Specialist
- Nutritionist
- Sensory Evaluation Expert
- Packaging Specialist

### Technology & Innovation
- Food Technology Specialist
- Blockchain & Traceability Expert

## 🚀 Advanced Features

### AI-Powered Matching Engine
```typescript
// Automatic expert suggestions based on RFQ analysis
const suggestions = await matchingEngine.analyzeRFQAndMatch({
  title: "HACCP Implementation for Dairy Facility",
  description: "Need expert help with HACCP plan development...",
  requirements: ["HACCP", "Dairy", "FDA Compliance"],
  budget: 5000,
  urgency: "high"
});
```

### Real-time Status Tracking
```typescript
// Live expert status updates
io.on('connection', (socket) => {
  socket.on('expert:join', async (expertId) => {
    const status = await statusTracker.getExpertStatus(expertId);
    socket.emit('status:current', status);
  });
});
```

### Advanced Caching
```typescript
// Intelligent caching with tag-based invalidation
await cacheService.set('expert:profile:123', expertData, {
  ttl: 3600,
  tags: ['expert', 'expert:123']
});

// Invalidate all expert-related cache
await cacheService.invalidateByTags(['expert:123']);
```

## 🔒 Security Features

- **Input Sanitization:** All inputs are sanitized and validated
- **Rate Limiting:** Advanced rate limiting with user-specific quotas
- **CSRF Protection:** State-changing operations require CSRF tokens
- **File Upload Security:** MIME type validation and malware scanning
- **SQL Injection Prevention:** Query parameterization and pattern detection
- **XSS Protection:** Content Security Policy and output encoding

## 📊 Performance Optimizations

- **Redis Caching:** Expert profiles, search results, and session data
- **Database Indexing:** Optimized queries for search and filtering
- **Response Compression:** Gzip compression for all responses
- **Connection Pooling:** Efficient database connection management
- **Background Jobs:** Async processing for heavy operations

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📈 Monitoring & Analytics

### Health Checks
- `GET /health` - Basic health check
- `GET /ready` - Readiness check with dependencies

### Metrics
- Expert registration and verification rates
- Search performance and match quality
- API response times and error rates
- Cache hit ratios and performance

## 🔄 Next Steps (Remaining Chapters)

### Chapter 6: RFQ Integration
- Webhook endpoints for RFQ events
- Automatic expert matching on RFQ creation
- Integration with main FoodXchange backend

### Chapter 7: Real-time Collaboration
- Video consultation platform
- Shared document workspace
- Real-time messaging system

### Chapter 8: Payment & Billing
- Stripe integration for payments
- Escrow and milestone payments
- Invoice generation and tax handling

### Chapter 9: Azure AI Integration
- Enhanced text analysis and extraction
- Document processing with Form Recognizer
- Multi-language support with Translator

### Chapter 10-13: Production Readiness
- Performance optimization and monitoring
- Comprehensive security hardening
- Full test coverage and CI/CD
- Docker containerization and deployment

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is proprietary to FoodXchange and not open source.

## 📞 Support

For technical support or questions:
- Email: tech-support@foodxchange.com
- Documentation: https://docs.foodxchange.com/expert-marketplace
- Slack: #expert-marketplace-dev