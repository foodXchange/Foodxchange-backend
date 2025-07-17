# FoodXchange Backend - Quick Start Guide

## Overview
FoodXchange is a B2B food commerce platform with dual-service architecture: a main backend service and an expert marketplace microservice. This guide gets you up and running in under 30 minutes.

## Prerequisites
- Node.js 18.x or 20.x LTS
- MongoDB 7.x
- Redis 7.x
- Docker (optional but recommended)
- Azure CLI (for cloud features)

## 🚀 Fast Setup (5 minutes)

### 1. Clone and Install
```bash
git clone https://github.com/foodXchange/Foodxchange-backend.git
cd Foodxchange-backend
npm install
cd expert-marketplace-service && npm install && cd ..
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env
cp expert-marketplace-service/.env.example expert-marketplace-service/.env

# Edit .env files with your settings
# Minimum required for local development:
```

### 3. Database Setup
```bash
# Start MongoDB and Redis (using Docker)
docker run -d --name foodx-mongo -p 27017:27017 mongo:7.0
docker run -d --name foodx-redis -p 6379:6379 redis:7-alpine

# Or use local installations
mongod --dbpath ./data/db
redis-server
```

### 4. Start Services
```bash
# Terminal 1: Main backend service
npm run dev

# Terminal 2: Expert marketplace service
cd expert-marketplace-service
npm run dev
```

### 5. Verify Setup
```bash
# Check main service
curl http://localhost:5001/api/health

# Check expert service
curl http://localhost:3001/api/health

# Expected response: {"status":"ok","timestamp":"..."}
```

## 🔑 First API Call

### 1. Create Test User
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "firstName": "Test",
    "lastName": "User",
    "role": "buyer",
    "company": "Test Company"
  }'
```

### 2. Login and Get Token
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

### 3. Use API with Token
```bash
# Save token from login response
TOKEN="your-jwt-token-here"

# Make authenticated request
curl -X GET http://localhost:5001/api/products \
  -H "Authorization: Bearer $TOKEN"
```

## 📁 Project Structure
```
foodxchange-backend/
├── src/                    # Main backend service
│   ├── api/routes/        # API endpoints
│   ├── controllers/       # Business logic
│   ├── models/           # Database schemas
│   ├── services/         # Business services
│   └── middleware/       # Auth, validation, etc.
├── expert-marketplace-service/  # Expert microservice
│   └── src/              # Similar structure to main service
├── infrastructure/       # Azure deployment configs
├── docker/              # Docker configurations
└── docs/               # Documentation (you are here!)
```

## 🛠 Development Commands

### Main Backend Service
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
npm run lint         # Lint code
npm run typecheck    # Check TypeScript
```

### Expert Marketplace Service
```bash
cd expert-marketplace-service
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
```

## 🔧 Common Tasks

### Adding New API Endpoint
1. Create route in `src/api/routes/`
2. Add controller in `src/controllers/`
3. Add any new models in `src/models/`
4. Update middleware if needed
5. Add tests

### Database Operations
```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/foodxchange

# View collections
show collections

# Sample queries
db.users.find({}).limit(5)
db.products.find({"category": "dairy"})
```

### Redis Operations
```bash
# Connect to Redis
redis-cli

# View keys
keys *

# Check cache
get "user:session:*"
```

## 🌐 Available Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - User logout

### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `GET /api/products/:id` - Get product details
- `PUT /api/products/:id` - Update product

### RFQ (Request for Quote)
- `GET /api/rfq` - List RFQs
- `POST /api/rfq` - Create RFQ
- `GET /api/rfq/:id` - Get RFQ details
- `POST /api/rfq/:id/proposals` - Submit proposal

### Expert Marketplace
- `GET /api/v1/experts` - List experts
- `POST /api/v1/experts` - Register expert
- `GET /api/v1/experts/:id/availability` - Expert availability

## 🚨 Troubleshooting

### Common Issues

#### Service Won't Start
```bash
# Check if ports are in use
lsof -i :5001  # Main service
lsof -i :3001  # Expert service

# Kill processes if needed
pkill -f "node.*server"
```

#### Database Connection Error
```bash
# Check MongoDB status
mongosh --eval "db.adminCommand('ismaster')"

# Check Redis status
redis-cli ping
```

#### Environment Variables
```bash
# Verify required environment variables
node -e "console.log(process.env.NODE_ENV, process.env.MONGODB_URI)"
```

#### TypeScript Errors
```bash
# Run type checking
npm run typecheck

# Build to see detailed errors
npm run build
```

### Error Messages
- `"No token provided"` → Add Authorization header
- `"Invalid token"` → Check token format and expiration
- `"Database connection failed"` → Verify MongoDB is running
- `"Redis connection failed"` → Verify Redis is running

## 📚 Next Steps

1. **Read API Documentation**: [API Reference](api/README.md)
2. **Understand Architecture**: [System Overview](architecture/system-overview.md)
3. **Set up Testing**: [Testing Guide](development/testing-guide.md)
4. **Deploy to Azure**: [Azure Deployment](deployment/azure-deployment.md)

## 🆘 Getting Help

- **Issues**: Check [Troubleshooting Guide](deployment/troubleshooting.md)
- **API Questions**: See [API Documentation](api/)
- **Business Logic**: Read [Business Logic Documentation](business-logic/)
- **Deployment**: Check [Deployment Guides](deployment/)

## ⚡ Performance Tips

1. **Use Redis caching** for frequently accessed data
2. **Enable MongoDB indexes** for query optimization
3. **Use connection pooling** for database connections
4. **Enable compression** for API responses
5. **Monitor memory usage** with built-in monitoring

## 🔐 Security Notes

- Never commit `.env` files to version control
- Use strong JWT secrets in production
- Enable HTTPS in production environments
- Regularly update dependencies for security patches
- Use Azure Key Vault for production secrets

This guide covers the essentials to get you started. For detailed information on specific features, refer to the comprehensive documentation in the respective sections.