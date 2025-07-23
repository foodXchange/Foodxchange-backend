# Documentation Index

Welcome to the FoodXchange Backend documentation. This index provides a comprehensive overview of all available documentation to help you navigate the project effectively.

## 📚 Documentation Overview

### Quick Links
- [🚀 Quick Start Guide](#quick-start)
- [🏗️ Architecture Overview](#architecture)
- [🔧 Troubleshooting Guide](#troubleshooting)
- [📡 API Reference](#api-reference)
- [🚢 Deployment Guide](#deployment)
- [💻 Development Guide](#development)

---

## Core Documentation

### 📖 [README.md](../README.md)
**Main project documentation**
- Project overview and features
- Quick start instructions
- Basic setup and configuration
- Performance benchmarks
- Contributing guidelines

### 🔧 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
**Comprehensive troubleshooting guide** *(Permanent documentation as requested)*
- Server startup issues
- Docker problems and solutions
- Redis connection and memory issues
- MongoDB authentication and performance
- Common error messages and fixes
- Development environment issues
- Production deployment problems

### 📡 [API_REFERENCE.md](./API_REFERENCE.md)
**Complete API documentation**
- Authentication endpoints
- Product management APIs
- RFQ (Request for Quote) system
- Order processing endpoints
- Compliance validation
- WebSocket events
- Rate limiting information
- SDK examples

### 🚢 [DEPLOYMENT.md](./DEPLOYMENT.md)
**Deployment instructions for all platforms**
- Local development setup
- Docker deployment (dev, production, ARM64)
- Cloud deployment (Azure, AWS, Google Cloud)
- Kubernetes deployment
- Production configuration
- Monitoring and maintenance
- Security checklist

---

## Recent Changes & Updates

### 🆕 [BACKEND_CHANGES_2025.md](./BACKEND_CHANGES_2025.md)
**Latest backend improvements and features**
- Phase 1 optimizations (July 2025)
- ARM architecture support
- Performance enhancements
- Security improvements
- Future roadmap

### ⚡ [OPTIMIZATION_SUMMARY.md](../OPTIMIZATION_SUMMARY.md)
**Comprehensive optimization documentation**
- Architecture assessment
- Implemented optimizations
- Performance improvements
- Security enhancements
- Developer experience improvements

---

## Quick Start

### For New Developers
1. Start with [README.md](../README.md) for project overview
2. Follow setup instructions in [DEPLOYMENT.md](./DEPLOYMENT.md#local-development)
3. Review [API_REFERENCE.md](./API_REFERENCE.md) for API documentation
4. Keep [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) handy for common issues

### For DevOps/Deployment
1. Review [DEPLOYMENT.md](./DEPLOYMENT.md) for platform-specific instructions
2. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#production-issues) for production issues
3. Follow security checklist in deployment guide

### For API Integration
1. Start with [API_REFERENCE.md](./API_REFERENCE.md)
2. Review authentication methods
3. Check rate limiting and best practices
4. Use provided SDK examples

---

## Architecture

### System Architecture
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web/Mobile    │────▶│  Load Balancer  │────▶│   API Gateway   │
│    Clients      │     │    (Nginx)      │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                          │
                              ┌───────────────────────────┴───────────────────────────┐
                              │                                                       │
                      ┌───────▼────────┐                                   ┌──────────▼─────────┐
                      │  Auth Service  │                                   │   Core Services    │
                      │  JWT + OAuth2  │                                   │  Products, Orders  │
                      └────────────────┘                                   └────────────────────┘
```

### Key Technologies
- **Backend**: Node.js 18.x/20.x with TypeScript
- **Database**: MongoDB 7.x with replica sets
- **Cache**: Redis 7.x with clustering
- **Container**: Docker with multi-architecture support
- **AI/ML**: Azure Cognitive Services integration

---

## Troubleshooting

### Common Issues Quick Reference

#### Server Won't Start
- Port already in use → [Solution](./TROUBLESHOOTING.md#server-wont-start)
- Memory issues → [Solution](./TROUBLESHOOTING.md#nodejs-memory-issues)
- Module not found → [Solution](./TROUBLESHOOTING.md#module-not-found-errors)

#### Docker Issues
- Docker Desktop not starting → [Solution](./TROUBLESHOOTING.md#docker-desktop-not-starting-windows)
- Build failures → [Solution](./TROUBLESHOOTING.md#docker-build-failures)
- Network issues → [Solution](./TROUBLESHOOTING.md#docker-network-issues)

#### Database Issues
- Redis connection refused → [Solution](./TROUBLESHOOTING.md#redis-connection-refused)
- MongoDB authentication failed → [Solution](./TROUBLESHOOTING.md#mongodb-connection-failed)
- Performance problems → [Solution](./TROUBLESHOOTING.md#performance-issues)

---

## Development

### Development Workflow
```bash
# Quick start
./quick-start.ps1  # Windows
./quick-start.sh   # Linux/Mac

# Manual setup
npm install
npm run dev

# Run tests
npm test

# Build production
npm run build
```

### Project Structure
```
src/
├── api/              # API layer
├── core/             # Core infrastructure
├── domain/           # Business logic
├── infrastructure/   # External integrations
└── shared/          # Shared utilities
```

### Environment Variables
See [.env.example](../.env.example) for complete configuration options.

---

## API Reference

### Base URLs
- Development: `http://localhost:5000/api/v1`
- Production: `https://api.foodxchange.com/api/v1`

### Key Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | User authentication |
| `/products` | GET/POST | Product management |
| `/rfqs` | GET/POST | RFQ operations |
| `/orders` | GET/POST | Order processing |
| `/compliance/validate` | POST | Compliance validation |

### Authentication
```http
Authorization: Bearer <jwt-token>
X-API-Key: <api-key>  # For B2B integrations
```

---

## Deployment

### Deployment Options

#### Docker (Recommended)
```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.production.yml up -d

# ARM64 (Raspberry Pi, M1 Mac)
docker-compose -f docker-compose.arm64.yml up -d
```

#### Cloud Platforms
- **Azure**: App Service, AKS, Container Instances
- **AWS**: ECS, EKS, Elastic Beanstalk
- **Google Cloud**: Cloud Run, GKE
- **On-Premise**: Docker, Kubernetes, Traditional VM

### Production Checklist
- [ ] Environment variables configured
- [ ] SSL/TLS certificates installed
- [ ] Database backups configured
- [ ] Monitoring enabled
- [ ] Security headers configured
- [ ] Rate limiting active

---

## Support & Resources

### Getting Help
1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues
2. Review relevant documentation section
3. Search [GitHub Issues](https://github.com/foodxchange/backend/issues)
4. Join [Discord Community](https://discord.gg/foodxchange)
5. Contact support@foodxchange.com

### Contributing
See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

### License
This project is licensed under the MIT License.

---

## Document Map

### By Purpose
- **Getting Started**: README.md → DEPLOYMENT.md
- **API Development**: API_REFERENCE.md
- **Problem Solving**: TROUBLESHOOTING.md
- **System Design**: BACKEND_CHANGES_2025.md, OPTIMIZATION_SUMMARY.md
- **Operations**: DEPLOYMENT.md → TROUBLESHOOTING.md

### By Audience
- **Developers**: README.md, API_REFERENCE.md, TROUBLESHOOTING.md
- **DevOps**: DEPLOYMENT.md, TROUBLESHOOTING.md
- **Architects**: BACKEND_CHANGES_2025.md, OPTIMIZATION_SUMMARY.md
- **Support**: TROUBLESHOOTING.md, API_REFERENCE.md

---

*Last Updated: July 23, 2025*
*Documentation Version: 2.0*