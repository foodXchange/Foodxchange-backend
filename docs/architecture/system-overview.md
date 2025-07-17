# FoodXchange System Architecture Overview

## Executive Summary
FoodXchange is a comprehensive B2B food commerce platform built on a microservices architecture using Node.js, TypeScript, and Azure cloud services. The system facilitates complex food industry workflows including RFQ management, supplier verification, compliance tracking, and expert consultations while ensuring food safety and regulatory compliance.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Applications"
        WEB[Web Application]
        MOBILE[Mobile App]
        API_CLIENT[API Clients]
    end

    subgraph "Load Balancer & Gateway"
        LB[Azure Load Balancer]
        APIM[API Management]
    end

    subgraph "Microservices"
        MAIN[Main Backend Service<br/>Port: 5001]
        EXPERT[Expert Marketplace Service<br/>Port: 3001]
    end

    subgraph "Data Layer"
        MONGODB[(MongoDB<br/>Primary Database)]
        REDIS[(Redis<br/>Cache & Sessions)]
        AZURESTORAGE[Azure Blob Storage<br/>File Storage]
    end

    subgraph "Azure Services"
        AI[Azure AI Services]
        SEARCH[Azure Cognitive Search]
        SERVICEBUS[Azure Service Bus]
        INSIGHTS[Application Insights]
    end

    subgraph "External Integrations"
        PAYMENT[Payment Gateways]
        EMAIL[Email Services]
        SMS[SMS Services]
    end

    WEB --> LB
    MOBILE --> LB
    API_CLIENT --> LB
    
    LB --> APIM
    APIM --> MAIN
    APIM --> EXPERT
    
    MAIN --> MONGODB
    MAIN --> REDIS
    MAIN --> AZURESTORAGE
    MAIN --> AI
    MAIN --> SEARCH
    MAIN --> SERVICEBUS
    
    EXPERT --> MONGODB
    EXPERT --> REDIS
    EXPERT --> AZURESTORAGE
    EXPERT --> AI
    
    MAIN --> INSIGHTS
    EXPERT --> INSIGHTS
    
    MAIN --> PAYMENT
    MAIN --> EMAIL
    MAIN --> SMS
```

## Service Architecture

### 1. Main Backend Service (`/src/`)
**Purpose**: Core B2B marketplace functionality
- **Port**: 5001 (development), 80/443 (production)
- **Framework**: Express.js with TypeScript
- **Responsibilities**:
  - User authentication and authorization
  - Product catalog management
  - RFQ (Request for Quote) system
  - Order processing and fulfillment
  - Supplier and buyer management
  - Compliance validation
  - Payment processing integration
  - Core business logic

**Directory Structure**:
```
src/
├── api/routes/           # RESTful API endpoints
├── controllers/          # Request handlers and business logic
├── models/              # MongoDB schemas and data models
├── services/            # Business services and external integrations
├── middleware/          # Authentication, validation, error handling
├── config/              # Configuration management
├── infrastructure/      # Azure services integration
├── utils/               # Utility functions and helpers
└── types/               # TypeScript type definitions
```

### 2. Expert Marketplace Service (`/expert-marketplace-service/`)
**Purpose**: Specialized service for expert consultations and professional services
- **Port**: 3001 (development)
- **Framework**: Express.js with TypeScript
- **Responsibilities**:
  - Expert profile management
  - Expert-client matching
  - Availability scheduling
  - Commission tracking
  - Agent management
  - Real-time consultations
  - Expert verification

**Directory Structure**:
```
expert-marketplace-service/src/
├── controllers/          # Expert-specific controllers
├── models/              # Expert domain models
├── services/            # Expert business services
├── modules/             # Feature modules (rfq, agent, etc.)
├── middleware/          # Expert-specific middleware
├── config/              # Service configuration
└── utils/               # Service-specific utilities
```

## Technology Stack

### Backend Technologies
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | Node.js | 18.x/20.x LTS | JavaScript runtime |
| Language | TypeScript | 5.x | Type-safe development |
| Framework | Express.js | 4.x | Web application framework |
| Database | MongoDB | 7.x | Primary data storage |
| Cache | Redis | 7.x | Caching and session storage |
| Real-time | Socket.IO | 4.x | WebSocket communications |
| Authentication | JWT | - | Token-based authentication |
| Validation | Joi/Zod | - | Input validation |
| Monitoring | Prometheus | - | Metrics collection |

### Azure Cloud Services
| Service | Purpose | Usage |
|---------|---------|-------|
| Azure App Service | Web hosting | Production deployment |
| Azure Cosmos DB | Document database | Alternative to MongoDB |
| Azure Cache for Redis | Distributed cache | Session storage and caching |
| Azure Blob Storage | File storage | Document and image storage |
| Azure AI Services | Machine learning | Product analysis, recommendations |
| Azure Cognitive Search | Search engine | Product and expert search |
| Azure Service Bus | Message queue | Asynchronous processing |
| Azure Key Vault | Secret management | Secure configuration storage |
| Application Insights | Monitoring | Performance and error tracking |
| Azure API Management | API gateway | Rate limiting, security, analytics |

## Data Architecture

### Database Design

#### Primary Database: MongoDB
```mermaid
erDiagram
    User ||--o{ Company : "works for"
    User ||--o{ RFQ : "creates"
    User ||--o{ Order : "places"
    User ||--o{ ExpertProfile : "has expert profile"
    
    Company ||--o{ Product : "supplies"
    Company ||--o{ ComplianceCertification : "holds"
    
    RFQ ||--o{ RFQProposal : "receives"
    RFQ ||--o{ ExpertMatch : "matched with"
    
    Product ||--o{ ProductVariant : "has variants"
    Product ||--o{ NutritionalInfo : "contains"
    Product ||--o{ ComplianceInfo : "requires"
    
    Order ||--o{ OrderItem : "contains"
    Order ||--o{ OrderDocument : "attached"
    
    ExpertProfile ||--o{ ExpertAvailability : "defines"
    ExpertProfile ||--o{ ExpertReview : "receives"
    ExpertProfile ||--o{ AgentCommission : "earns"
```

#### Collections Overview
| Collection | Purpose | Indexes |
|------------|---------|---------|
| `users` | User accounts and profiles | email, role, company |
| `companies` | Business entities | name, verification_status |
| `products` | Product catalog | category, supplier, name (text) |
| `rfqs` | Request for quotes | buyer, status, category, delivery_date |
| `orders` | Purchase orders | buyer, seller, status, created_date |
| `expert_profiles` | Expert information | expertise, location, rating |
| `agent_profiles` | Sales agent data | territory, commission_rate |
| `compliance_docs` | Compliance certificates | type, expiry_date, entity |

#### Caching Strategy (Redis)
```
Cache Structure:
├── Sessions: user:session:{sessionId}
├── API Cache: api:{endpoint}:{params_hash}
├── Product Cache: product:{productId}
├── User Cache: user:{userId}
├── Search Cache: search:{query_hash}
├── Expert Cache: expert:{expertId}
├── Rate Limiting: ratelimit:{ip|userId}
└── Blacklisted Tokens: blacklist:{tokenId}
```

## Security Architecture

### Authentication & Authorization Flow
```mermaid
sequenceDiagram
    participant Client
    participant API_Gateway
    participant Auth_Service
    participant Redis
    participant Business_Service
    participant Database

    Client->>API_Gateway: Request with JWT
    API_Gateway->>Auth_Service: Validate token
    Auth_Service->>Redis: Check token blacklist
    Redis-->>Auth_Service: Token status
    Auth_Service->>Database: Get user permissions
    Database-->>Auth_Service: User data
    Auth_Service-->>API_Gateway: Validation result
    API_Gateway->>Business_Service: Authorized request
    Business_Service->>Database: Execute operation
    Database-->>Business_Service: Result
    Business_Service-->>API_Gateway: Response
    API_Gateway-->>Client: Final response
```

### Security Layers
1. **Network Security**: Azure WAF, DDoS protection
2. **API Security**: Rate limiting, input validation, CORS
3. **Authentication**: JWT with refresh tokens
4. **Authorization**: Role-based access control (RBAC)
5. **Data Security**: Encryption at rest and in transit
6. **Audit Logging**: Comprehensive activity logging

## Business Logic Domains

### 1. Core Marketplace
```mermaid
graph LR
    A[User Registration] --> B[Company Verification]
    B --> C[Product Catalog]
    C --> D[RFQ Creation]
    D --> E[Supplier Matching]
    E --> F[Proposal Submission]
    F --> G[Order Processing]
    G --> H[Fulfillment]
```

### 2. Expert Marketplace
```mermaid
graph LR
    A[Expert Registration] --> B[Verification Process]
    B --> C[Profile Creation]
    C --> D[Availability Setup]
    D --> E[RFQ Matching]
    E --> F[Client Consultation]
    F --> G[Commission Processing]
```

### 3. Compliance Workflow
```mermaid
graph TB
    A[Document Upload] --> B[Automated Validation]
    B --> C{Validation Result}
    C -->|Pass| D[Certificate Generation]
    C -->|Fail| E[Manual Review]
    E --> F[Expert Consultation]
    F --> G[Compliance Approval]
    D --> H[Compliance Tracking]
    G --> H
```

## Integration Architecture

### Internal Service Communication
```typescript
// Service-to-service communication patterns
interface ServiceCommunication {
  // Synchronous HTTP calls for immediate responses
  http: {
    authentication: 'JWT tokens',
    timeout: '30 seconds',
    retries: 3
  };
  
  // Asynchronous messaging for background processing
  messaging: {
    queue: 'Azure Service Bus',
    patterns: ['pub-sub', 'request-response'],
    durability: 'persistent'
  };
  
  // Real-time communication
  websocket: {
    protocol: 'Socket.IO',
    authentication: 'JWT in handshake',
    scaling: 'Redis adapter'
  };
}
```

### External Integrations
| Integration | Type | Purpose |
|-------------|------|---------|
| Payment Gateways | REST API | Payment processing |
| Email Services | SMTP/API | Notifications |
| SMS Services | REST API | Alerts and verification |
| Shipping APIs | REST API | Logistics integration |
| ERP Systems | REST/SOAP | Enterprise system integration |
| Food Safety APIs | REST API | Compliance validation |

## Scalability & Performance

### Horizontal Scaling Strategy
```mermaid
graph TB
    subgraph "Load Balancer"
        LB[Azure Load Balancer]
    end
    
    subgraph "Application Tier"
        APP1[App Instance 1]
        APP2[App Instance 2]
        APP3[App Instance N]
    end
    
    subgraph "Database Tier"
        MONGO_PRIMARY[MongoDB Primary]
        MONGO_SECONDARY1[MongoDB Secondary 1]
        MONGO_SECONDARY2[MongoDB Secondary 2]
    end
    
    subgraph "Cache Tier"
        REDIS_PRIMARY[Redis Primary]
        REDIS_REPLICA[Redis Replica]
    end
    
    LB --> APP1
    LB --> APP2
    LB --> APP3
    
    APP1 --> MONGO_PRIMARY
    APP2 --> MONGO_PRIMARY
    APP3 --> MONGO_PRIMARY
    
    MONGO_PRIMARY --> MONGO_SECONDARY1
    MONGO_PRIMARY --> MONGO_SECONDARY2
    
    APP1 --> REDIS_PRIMARY
    APP2 --> REDIS_PRIMARY
    APP3 --> REDIS_PRIMARY
    
    REDIS_PRIMARY --> REDIS_REPLICA
```

### Performance Optimizations
1. **Database Indexing**: Strategic index design for query optimization
2. **Caching Layers**: Multi-level caching (Redis, CDN, application-level)
3. **Connection Pooling**: Efficient database connection management
4. **Lazy Loading**: On-demand data loading
5. **CDN Integration**: Azure CDN for static content
6. **API Pagination**: Efficient data transfer
7. **Background Processing**: Asynchronous task processing

## Monitoring & Observability

### Monitoring Stack
```mermaid
graph TB
    subgraph "Application"
        APP[Application Code]
        METRICS[Custom Metrics]
    end
    
    subgraph "Collection"
        PROMETHEUS[Prometheus]
        APPINSIGHTS[Application Insights]
        WINSTON[Winston Logger]
    end
    
    subgraph "Storage"
        TSDB[Time Series Database]
        LOGS[Log Storage]
    end
    
    subgraph "Visualization"
        GRAFANA[Grafana Dashboards]
        AZURE_PORTAL[Azure Portal]
    end
    
    subgraph "Alerting"
        ALERTS[Alert Rules]
        NOTIFICATIONS[Notifications]
    end
    
    APP --> METRICS
    METRICS --> PROMETHEUS
    APP --> APPINSIGHTS
    APP --> WINSTON
    
    PROMETHEUS --> TSDB
    WINSTON --> LOGS
    
    TSDB --> GRAFANA
    APPINSIGHTS --> AZURE_PORTAL
    
    GRAFANA --> ALERTS
    AZURE_PORTAL --> ALERTS
    ALERTS --> NOTIFICATIONS
```

### Key Metrics
- **Application Metrics**: Response time, throughput, error rate
- **Business Metrics**: RFQ conversion rate, order volume, revenue
- **Infrastructure Metrics**: CPU, memory, disk, network usage
- **User Metrics**: Active users, session duration, feature usage

## Deployment Architecture

### Environment Strategy
```
Development → Staging → Production
    ↓           ↓          ↓
Local Dev   Azure Test  Azure Prod
```

### CI/CD Pipeline
```mermaid
graph LR
    A[Code Commit] --> B[Build & Test]
    B --> C[Security Scan]
    C --> D[Deploy to Staging]
    D --> E[Integration Tests]
    E --> F[Manual Approval]
    F --> G[Deploy to Production]
    G --> H[Health Checks]
```

### Infrastructure as Code
- **Bicep Templates**: Azure resource provisioning
- **Docker**: Containerization
- **Kubernetes**: Container orchestration (optional)
- **GitHub Actions**: CI/CD automation

## Disaster Recovery & Business Continuity

### Backup Strategy
- **Database**: Automated daily backups with point-in-time recovery
- **Files**: Geo-redundant storage with versioning
- **Configuration**: Infrastructure as code in version control
- **Secrets**: Azure Key Vault with backup keys

### Recovery Procedures
- **RTO (Recovery Time Objective)**: 4 hours
- **RPO (Recovery Point Objective)**: 1 hour
- **Multi-region deployment**: Primary (East US), Secondary (West Europe)
- **Failover strategy**: Automated for database, manual for application

## Future Architecture Considerations

### Planned Enhancements
1. **Microservices Expansion**: Break down monolithic components
2. **Event-Driven Architecture**: Implement event sourcing
3. **API Gateway Enhancement**: Advanced routing and transformation
4. **Machine Learning Pipeline**: Enhanced AI capabilities
5. **Blockchain Integration**: Supply chain traceability
6. **Mobile-First API**: Optimized mobile endpoints

### Technology Roadmap
- **Container Orchestration**: Kubernetes adoption
- **Serverless Functions**: Azure Functions for specific workloads
- **GraphQL**: Flexible API queries
- **Progressive Web App**: Enhanced mobile experience
- **Edge Computing**: Reduced latency with edge locations

This architecture provides a robust, scalable foundation for the FoodXchange B2B marketplace while maintaining flexibility for future growth and feature additions.