# FoodXchange Backend

<div align="center">
  <h1>🍎 FoodXchange B2B Marketplace Backend</h1>
  <p><strong>Enterprise-grade B2B food marketplace platform built with TypeScript</strong></p>

  ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
  ![Node.js](https://img.shields.io/badge/Node.js-20.x-green?logo=node.js)
  ![Express](https://img.shields.io/badge/Express-4.x-lightgrey?logo=express)
  ![MongoDB](https://img.shields.io/badge/MongoDB-7.x-green?logo=mongodb)
  ![Redis](https://img.shields.io/badge/Redis-7.x-red?logo=redis)
  ![Azure](https://img.shields.io/badge/Azure-AI-blue?logo=microsoft-azure)
  
  ![License](https://img.shields.io/badge/License-MIT-yellow.svg)
  ![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen)
  ![Code Coverage](https://img.shields.io/badge/Coverage-85%25-green)
</div>

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

FoodXchange is a cutting-edge B2B marketplace platform designed specifically for the food industry. It connects suppliers, buyers, and distributors in a secure, compliant, and efficient digital ecosystem.

### Key Benefits

- **🚀 High Performance**: Built with TypeScript for type safety and optimal performance
- **🔒 Enterprise Security**: JWT authentication, role-based access control, and data encryption
- **☁️ Cloud Native**: Designed for Azure cloud deployment with microservices architecture
- **🤖 AI-Powered**: Integrated Azure Cognitive Services for intelligent matching and compliance
- **📊 Real-time Analytics**: Comprehensive dashboards and insights for business intelligence
- **🌍 Global Compliance**: Built-in compliance validation for international food regulations

## ✨ Features

### Core Marketplace Features
- **Product Management**: Comprehensive catalog with rich media support
- **RFQ System**: Request for quotation with intelligent supplier matching
- **Order Processing**: Full order lifecycle management with tracking
- **Compliance Validation**: Automated certification and regulation checking
- **Smart Matching**: AI-powered buyer-supplier matching algorithms
- **Real-time Updates**: WebSocket support for live notifications
- **Multi-tenant**: Support for multiple organizations

### Technical Features
- **RESTful API**: Clean, versioned API design
- **WebSocket Support**: Real-time notifications and updates
- **Caching Layer**: Redis integration for high performance
- **Event-Driven**: Pub/sub architecture for scalability
- **Monitoring**: Built-in metrics and health checks
- **Type Safety**: Full TypeScript implementation
- **Error Handling**: Comprehensive error management
- **Rate Limiting**: API protection and throttling

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Frontend      │────▶│   API Gateway   │────▶│  Load Balancer  │
│   (React)       │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                          │
                                ┌─────────────────────────┴─────────────────────────┐
                                │                                                   │
                        ┌───────▼────────┐                                 ┌────────▼────────┐
                        │                │                                 │                 │
                        │  Auth Service  │                                 │  Core Services  │
                        │                │                                 │                 │
                        └────────────────┘                                 └─────────────────┘
                                │                                                   │
                        ┌───────▼────────┐     ┌──────────────┐          ┌────────▼────────┐
                        │                │     │              │          │                 │
                        │    MongoDB     │     │    Redis     │          │   Azure AI      │
                        │                │     │              │          │                 │
                        └────────────────┘     └──────────────┘          └─────────────────┘
```

### Design Patterns
- **Repository Pattern**: Data access abstraction
- **Service Layer**: Business logic encapsulation
- **Dependency Injection**: IoC container for loose coupling
- **Event Sourcing**: Audit trail and event history
- **CQRS**: Separated read/write operations for scalability

## 🛠️ Tech Stack

### Core Technologies
- **Runtime**: Node.js 20.x LTS
- **Language**: TypeScript 5.0+
- **Framework**: Express.js 4.x
- **Database**: MongoDB 7.x with Mongoose ODM
- **Cache**: Redis 7.x
- **Authentication**: JWT with bcrypt

### Azure Integration
- **Azure Cognitive Services**: Text Analytics, Computer Vision
- **Azure OpenAI**: Intelligent content generation
- **Azure Storage**: Document and media storage
- **Azure Key Vault**: Secrets management

### Development Tools
- **Build**: TypeScript Compiler, ESBuild
- **Linting**: ESLint with TypeScript plugins
- **Testing**: Jest, Supertest
- **API Docs**: OpenAPI 3.0 (Swagger)
- **Monitoring**: Winston logging, Prometheus metrics

## 📁 Project Structure

```
foodxchange-backend/
├── src/
│   ├── controllers/          # Route controllers
│   │   ├── auth/            # Authentication controllers
│   │   ├── marketplace/     # Marketplace controllers
│   │   └── compliance/      # Compliance controllers
│   ├── services/            # Business logic services
│   │   ├── auth/           # Authentication service
│   │   ├── marketplace/    # Product, RFQ, Order services
│   │   └── compliance/     # Compliance service
│   ├── models/              # Database models
│   │   ├── auth/           # User, Company models
│   │   ├── marketplace/    # Product, RFQ, Order models
│   │   └── compliance/     # Certification models
│   ├── middleware/          # Express middleware
│   ├── routes/              # API route definitions
│   ├── core/               # Core utilities
│   │   ├── config/         # Configuration management
│   │   ├── logging/        # Logging system
│   │   ├── errors/         # Error handling
│   │   └── monitoring/     # Metrics and monitoring
│   ├── infrastructure/      # External services
│   │   ├── azure/          # Azure AI integration
│   │   ├── cache/          # Redis caching
│   │   └── database/       # Database connections
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   └── server.ts           # Main server entry point
├── tests/                   # Test files
├── scripts/                 # Utility scripts
├── docs/                    # Documentation
├── .github/                 # GitHub workflows and templates
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20.x or higher
- MongoDB 7.x
- Redis 7.x (optional, falls back to memory cache)
- Azure account (for AI features)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/foodXchange/Foodxchange-backend.git
   cd Foodxchange-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   npm run db:setup
   npm run db:seed  # Optional: Load sample data
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

### Quick Start with Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f backend
```

## 📚 API Documentation

### Base URL
```
http://localhost:5001/api/v1
```

### Authentication
All API requests require authentication via JWT token:
```http
Authorization: Bearer <your-jwt-token>
```

### Key Endpoints

#### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh token
- `GET /auth/profile` - Get user profile

#### Products
- `GET /products` - List products
- `POST /products` - Create product
- `GET /products/:id` - Get product details
- `PUT /products/:id` - Update product
- `DELETE /products/:id` - Delete product

#### RFQs (Request for Quotation)
- `GET /rfqs` - List RFQs
- `POST /rfqs` - Create RFQ
- `GET /rfqs/:id` - Get RFQ details
- `POST /rfqs/:id/proposals` - Submit proposal

#### Orders
- `GET /orders` - List orders
- `POST /orders` - Create order
- `GET /orders/:id` - Get order details
- `PUT /orders/:id/status` - Update order status

#### Compliance
- `POST /compliance/validate` - Validate compliance
- `GET /compliance/certifications` - List certifications
- `POST /compliance/certifications` - Create certification

### WebSocket Events

Connect to WebSocket at `ws://localhost:5001`:

- `notification` - Real-time notifications
- `rfq:update` - RFQ status updates
- `order:update` - Order status updates
- `chat:message` - Chat messages

### API Documentation
Full API documentation is available at:
- Development: `http://localhost:5001/api-docs`
- Production: `https://api.foodxchange.com/api-docs`

## 💻 Development

### Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Generate API documentation
npm run docs:generate

# Check TypeScript types
npm run type-check
```

### Environment Variables

See `.env.example` for all available options. Key variables:

```env
# Server
PORT=5001
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/foodxchange

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRE=7d

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Azure AI (optional)
AZURE_COGNITIVE_SERVICES_KEY=your-key
AZURE_COGNITIVE_SERVICES_ENDPOINT=your-endpoint
```

### Code Style Guide
- Follow [Airbnb TypeScript Style Guide](https://github.com/airbnb/javascript)
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write unit tests for business logic

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test auth.test.ts

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

### Testing Strategy
- **Unit Tests**: Service and utility functions
- **Integration Tests**: API endpoints
- **E2E Tests**: Critical user flows
- **Performance Tests**: Load testing for scalability

## 🚢 Deployment

### Docker Deployment
```bash
# Build Docker image
docker build -t foodxchange-backend .

# Run container
docker run -p 5001:5001 --env-file .env foodxchange-backend
```

### Azure Deployment
```bash
# Deploy to Azure App Service
az webapp up --name foodxchange-api --resource-group foodxchange-rg

# Deploy to AKS
kubectl apply -f k8s/
```

### Production Checklist
- [ ] Set NODE_ENV=production
- [ ] Configure secure JWT secret
- [ ] Set up MongoDB replica set
- [ ] Configure Redis for session storage
- [ ] Enable HTTPS
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategy
- [ ] Review security headers

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention
We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Build process or auxiliary tool changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with ❤️ by the FoodXchange team
- Powered by Microsoft Azure
- Special thanks to all contributors

## 📞 Support

- 📧 Email: support@foodxchange.com
- 💬 Discord: [Join our community](https://discord.gg/foodxchange)
- 📚 Documentation: [docs.foodxchange.com](https://docs.foodxchange.com)
- 🐛 Issues: [GitHub Issues](https://github.com/foodXchange/Foodxchange-backend/issues)

---

<div align="center">
  <p>Made with ❤️ for the food industry</p>
  <p>© 2024 FoodXchange. All rights reserved.</p>
</div>
