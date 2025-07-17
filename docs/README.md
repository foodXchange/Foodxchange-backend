# FoodXchange Backend Documentation

Welcome to the comprehensive documentation for the FoodXchange B2B food commerce platform backend. This documentation provides everything you need to understand, develop, deploy, and maintain the FoodXchange system.

## 🚀 Quick Start

**New to FoodXchange?** Start here:
- [Quick Start Guide](QUICK_START.md) - Get up and running in 30 minutes
- [System Overview](architecture/system-overview.md) - Understand the architecture
- [API Authentication](api/authentication.md) - Make your first authenticated API call

## 📖 Documentation Structure

### 🔧 API Documentation
Complete API reference with examples and schemas:
- [Authentication API](api/authentication.md) - JWT, roles, permissions
- [Products API](api/products.md) - Product catalog management
- [RFQ API](api/rfq.md) - Request for Quote system
- [Orders API](api/orders.md) - Order processing and fulfillment
- [Compliance API](api/compliance.md) - Food safety and regulatory compliance
- [Experts API](api/experts.md) - Expert marketplace integration
- [Real-time Events](api/real-time.md) - WebSocket events and handlers
- [Error Codes](api/error-codes.md) - Complete error reference

### 🏗️ Architecture Documentation
System design and technical architecture:
- [System Overview](architecture/system-overview.md) - High-level architecture
- [Microservices](architecture/microservices.md) - Service communication patterns
- [Database Schema](architecture/database-schema.md) - Complete data model
- [Security Model](architecture/security-model.md) - Security implementation
- [Real-time Architecture](architecture/real-time-architecture.md) - WebSocket and messaging
- [Azure Integration](architecture/azure-integration.md) - Cloud services integration

### 📋 Business Logic Documentation
Food industry specific processes and workflows:
- [RFQ Workflow](business-logic/rfq-workflow.md) - Complete RFQ lifecycle
- [Compliance Process](business-logic/compliance-process.md) - Food safety compliance
- [Expert Matching](business-logic/expert-matching.md) - Expert-client matching algorithm
- [Pricing Model](business-logic/pricing-model.md) - Commission and pricing structure
- [Order Fulfillment](business-logic/order-fulfillment.md) - Order processing workflow
- [Supplier Verification](business-logic/supplier-verification.md) - Supplier onboarding

### 🚀 Deployment & Operations
Setup, deployment, and maintenance guides:
- [Local Development](deployment/local-development.md) - Development environment setup
- [Environment Setup](deployment/environment-setup.md) - Configuration and variables
- [Azure Deployment](deployment/azure-deployment.md) - Production deployment
- [Docker Setup](deployment/docker-setup.md) - Containerization
- [Monitoring](deployment/monitoring.md) - Observability and alerting
- [Troubleshooting](deployment/troubleshooting.md) - Common issues and solutions

### 💻 Developer Resources
Development tools, standards, and best practices:
- [Coding Standards](development/coding-standards.md) - Code style and conventions
- [Testing Guide](development/testing-guide.md) - Testing strategies
- [Security Guidelines](development/security-guidelines.md) - Security best practices
- [Performance Guidelines](development/performance-guidelines.md) - Optimization techniques
- [Migration Guide](development/migration-guide.md) - Database migrations

### 🔌 Integration Guides
External service integrations and APIs:
- [Azure AI Services](integrations/azure-ai-services.md) - Machine learning integration
- [Payment Gateways](integrations/payment-gateways.md) - Payment processing
- [Third-party APIs](integrations/third-party-apis.md) - External API integrations
- [Webhook Specifications](integrations/webhook-specifications.md) - Webhook implementations

### 📊 Compliance Documentation
Food industry specific compliance requirements:
- [FDA Requirements](compliance/fda-requirements.md) - FDA compliance implementation
- [USDA Standards](compliance/usda-standards.md) - USDA requirements
- [International Standards](compliance/international-standards.md) - Global compliance
- [Traceability](compliance/traceability.md) - Food traceability implementation
- [Certification Tracking](compliance/certification-tracking.md) - Certificate management

## 🏢 System Overview

FoodXchange is a comprehensive B2B food commerce platform designed specifically for the food industry, featuring:

### Core Features
- **RFQ Management**: Complete request-for-quote lifecycle
- **Product Catalog**: Comprehensive food product management
- **Compliance Tracking**: Automated food safety compliance
- **Supplier Verification**: Multi-level supplier validation
- **Expert Marketplace**: Professional food industry consultations
- **Real-time Collaboration**: Live updates and messaging
- **Multi-company Workflows**: Complex B2B transaction support

### Technical Highlights
- **Microservices Architecture**: Main backend + Expert marketplace service
- **Cloud-Native**: Azure-first design with comprehensive service integration
- **Real-time Capabilities**: WebSocket-based live features
- **AI-Powered**: Machine learning for matching and recommendations
- **Security-First**: Enterprise-grade security and compliance
- **Scalable Design**: Horizontal scaling and performance optimization

## 🛠️ Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Runtime** | Node.js 18.x/20.x | JavaScript runtime |
| **Language** | TypeScript 5.x | Type-safe development |
| **Framework** | Express.js 4.x | Web application framework |
| **Database** | MongoDB 7.x | Primary data storage |
| **Cache** | Redis 7.x | Session storage and caching |
| **Real-time** | Socket.IO 4.x | WebSocket communications |
| **Cloud** | Microsoft Azure | Cloud infrastructure |
| **AI/ML** | Azure AI Services | Machine learning capabilities |
| **Search** | Azure Cognitive Search | Intelligent search |
| **Storage** | Azure Blob Storage | File and document storage |
| **Monitoring** | Application Insights | Performance monitoring |
| **Infrastructure** | Azure Bicep | Infrastructure as code |

## 🚦 Getting Started

### Prerequisites
- Node.js 18.x or 20.x LTS
- MongoDB 7.x
- Redis 7.x
- Azure CLI (for cloud features)
- Docker (recommended)

### Quick Setup
```bash
# Clone repository
git clone https://github.com/foodXchange/Foodxchange-backend.git
cd Foodxchange-backend

# Install dependencies
npm install
cd expert-marketplace-service && npm install && cd ..

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Start services
npm run dev                    # Main backend (port 5001)
cd expert-marketplace-service && npm run dev  # Expert service (port 3001)
```

### First API Call
```bash
# Health check
curl http://localhost:5001/api/health

# Register user
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","firstName":"Test","lastName":"User","role":"buyer"}'

# Login and get token
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

## 📚 Learning Path

### For New Developers
1. **Start**: [Quick Start Guide](QUICK_START.md)
2. **Understand**: [System Overview](architecture/system-overview.md)
3. **Authenticate**: [Authentication API](api/authentication.md)
4. **Build**: [Development Guidelines](development/coding-standards.md)
5. **Test**: [Testing Guide](development/testing-guide.md)

### For API Users
1. **Authentication**: [Authentication API](api/authentication.md)
2. **Core APIs**: [Products](api/products.md), [RFQ](api/rfq.md), [Orders](api/orders.md)
3. **Real-time**: [WebSocket Events](api/real-time.md)
4. **Error Handling**: [Error Codes](api/error-codes.md)

### For DevOps Engineers
1. **Environment**: [Environment Setup](deployment/environment-setup.md)
2. **Deployment**: [Azure Deployment](deployment/azure-deployment.md)
3. **Monitoring**: [Monitoring Guide](deployment/monitoring.md)
4. **Troubleshooting**: [Common Issues](deployment/troubleshooting.md)

### For Food Industry Professionals
1. **Business Logic**: [RFQ Workflow](business-logic/rfq-workflow.md)
2. **Compliance**: [Food Safety Process](business-logic/compliance-process.md)
3. **Expert System**: [Expert Matching](business-logic/expert-matching.md)
4. **Regulations**: [FDA Requirements](compliance/fda-requirements.md)

## 🔍 Key Concepts

### RFQ (Request for Quote)
Central feature enabling buyers to request quotes from multiple suppliers with automated matching and proposal management.

### Expert Marketplace
Specialized service connecting food industry experts with clients for consultations, compliance guidance, and technical expertise.

### Compliance Automation
Automated validation of food safety certificates, regulatory compliance, and audit trail maintenance.

### Multi-tenant Architecture
Support for multiple companies, roles, and complex B2B relationships within a single platform.

## 🆘 Support & Help

### Documentation Issues
- **Missing Information**: Create an issue in the repository
- **Outdated Content**: Submit a pull request with updates
- **Questions**: Check existing discussions or create a new one

### Development Support
- **API Questions**: See [API Documentation](api/)
- **Technical Issues**: Check [Troubleshooting Guide](deployment/troubleshooting.md)
- **Security Concerns**: Follow [Security Guidelines](development/security-guidelines.md)

### Business Logic Questions
- **Process Workflows**: See [Business Logic Documentation](business-logic/)
- **Compliance Requirements**: See [Compliance Documentation](compliance/)
- **Food Industry Standards**: See specific compliance guides

## 🔄 Documentation Updates

This documentation is continuously updated to reflect the latest system changes. Last major update: **January 2024**.

### Contributing to Documentation
1. **Fork** the repository
2. **Create** a feature branch
3. **Update** documentation
4. **Test** locally
5. **Submit** pull request

### Versioning
- Documentation follows semantic versioning
- API changes are documented with deprecation notices
- Breaking changes include migration guides

## 📄 License & Legal

- **Code License**: MIT License
- **Documentation License**: Creative Commons
- **Data Privacy**: GDPR and CCPA compliant
- **Food Safety**: FDA and USDA compliant

---

**Ready to get started?** Head to the [Quick Start Guide](QUICK_START.md) and have your first API call working in under 30 minutes!