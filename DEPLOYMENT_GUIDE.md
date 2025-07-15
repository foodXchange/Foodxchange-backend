# FoodXchange Backend Deployment Guide

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Git

### 1. Environment Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd Foodxchange-backend
```

2. **Copy environment configuration**
```bash
cp .env.example .env
```

3. **Configure environment variables**
Edit `.env` file with your settings:
```bash
# Essential settings
NODE_ENV=production
MONGODB_URI=mongodb://admin:password@mongo:27017/foodxchange?authSource=admin
REDIS_URL=redis://redis:6379
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_REFRESH_SECRET=your-super-secret-refresh-key-at-least-32-characters-long
```

### 2. Docker Deployment

**Start all services:**
```bash
docker-compose up -d
```

**Check service status:**
```bash
docker-compose ps
```

**View logs:**
```bash
docker-compose logs -f foodxchange-backend
```

### 3. Verify Deployment

**Health Check:**
```bash
curl http://localhost:5000/health
```

**API Info:**
```bash
curl http://localhost:5000/api
```

**Monitoring:**
- Prometheus: http://localhost:9091
- Grafana: http://localhost:3000 (admin/admin)

---

## 📋 Service Overview

### Core Services
- **foodxchange-backend** (Port 5000) - Main application
- **mongo** (Port 27017) - MongoDB database
- **redis** (Port 6379) - Cache & session storage
- **nginx** (Port 80/443) - Reverse proxy

### Monitoring Stack
- **prometheus** (Port 9091) - Metrics collection
- **grafana** (Port 3000) - Monitoring dashboard

---

## 🔧 Configuration

### Environment Variables

#### Core Configuration
```bash
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
```

#### Database Configuration
```bash
MONGODB_URI=mongodb://admin:password@mongo:27017/foodxchange?authSource=admin
DB_MAX_POOL_SIZE=10
DB_MIN_POOL_SIZE=2
DB_MONITORING_INTERVAL=60000
```

#### Cache Configuration
```bash
REDIS_URL=redis://redis:6379
REDIS_TTL=300
REDIS_MAX_RETRIES=3
```

#### Security Configuration
```bash
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_REFRESH_SECRET=your-super-secret-refresh-key-at-least-32-characters-long
BCRYPT_ROUNDS=12
```

#### Feature Flags
```bash
FEATURE_USER_REGISTRATION=true
FEATURE_EMAIL_VERIFICATION=true
FEATURE_ANALYTICS=true
FEATURE_CACHING=true
FEATURE_RATE_LIMITING=true
```

---

## 🛠️ Development Setup

### Local Development
```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Run with optimized server
npm run dev:optimized
```

### Development Environment
```bash
# Start only database services
docker-compose up -d mongo redis

# Run backend locally
npm run dev
```

---

## 🔍 Monitoring & Health Checks

### Health Endpoints
- **Main Health**: `GET /health`
- **Liveness**: `GET /health/live`
- **Readiness**: `GET /health/ready`
- **Metrics**: `GET /api/v1/monitoring/metrics`

### Monitoring Dashboard
Access Grafana at http://localhost:3000
- Username: `admin`
- Password: `admin`

### Key Metrics
- Response time
- Request rate
- Error rate
- Database performance
- Cache hit rate
- Memory usage

---

## 📦 Production Deployment

### 1. Environment Setup
```bash
# Production environment variables
NODE_ENV=production
LOG_LEVEL=warn
METRICS_ENABLED=true
PERFORMANCE_MONITORING_ENABLED=true
```

### 2. Database Security
```bash
# Secure MongoDB
MONGODB_URI=mongodb://username:password@mongo:27017/foodxchange?authSource=admin&ssl=true

# Configure authentication
# Edit docker/mongo-init.js for custom users
```

### 3. SSL/TLS Setup
```bash
# Generate SSL certificates
mkdir -p docker/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/ssl/key.pem \
  -out docker/ssl/cert.pem
```

### 4. Production Compose
```bash
# Use production configuration
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 🔐 Security Considerations

### 1. Environment Security
- Use strong, unique secrets for JWT tokens
- Enable HTTPS in production
- Configure proper CORS origins
- Set up rate limiting

### 2. Database Security
- Use authentication for MongoDB
- Enable SSL/TLS for database connections
- Configure proper user permissions
- Regular security updates

### 3. Application Security
- Input sanitization enabled
- SQL injection prevention
- XSS protection
- CSRF protection
- Security headers

---

## 📊 Performance Optimization

### 1. Caching Strategy
- Redis for session storage
- Multi-level caching
- Cache invalidation
- Performance monitoring

### 2. Database Optimization
- Automated indexing
- Query optimization
- Connection pooling
- Performance monitoring

### 3. HTTP Optimization
- Response compression
- Request optimization
- Timeout handling
- Connection management

---

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
npm run test:load
```

### Health Check Testing
```bash
# Test all health endpoints
curl http://localhost:5000/health
curl http://localhost:5000/health/live
curl http://localhost:5000/health/ready
```

---

## 🔧 Troubleshooting

### Common Issues

**1. Service Won't Start**
```bash
# Check logs
docker-compose logs foodxchange-backend

# Restart services
docker-compose restart
```

**2. Database Connection Issues**
```bash
# Check MongoDB status
docker-compose exec mongo mongo --eval "db.stats()"

# Verify credentials
docker-compose exec mongo mongo -u admin -p password
```

**3. Redis Connection Issues**
```bash
# Test Redis connection
docker-compose exec redis redis-cli ping

# Check Redis logs
docker-compose logs redis
```

**4. Performance Issues**
```bash
# Check metrics
curl http://localhost:5000/api/v1/monitoring/metrics

# View performance report
curl http://localhost:5000/api/v1/monitoring/report
```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug

# Enable profiling
export DEV_ENABLE_PROFILING=true
```

---

## 📈 Scaling

### Horizontal Scaling
```bash
# Scale backend instances
docker-compose up -d --scale foodxchange-backend=3

# Load balancer configuration
# Edit docker/nginx.conf
```

### Vertical Scaling
```bash
# Increase resource limits
# Edit docker-compose.yml
resources:
  limits:
    cpus: '2.0'
    memory: 2G
```

---

## 🔄 Maintenance

### Backup
```bash
# Database backup
docker-compose exec mongo mongodump --out /backup

# Redis backup
docker-compose exec redis redis-cli BGSAVE
```

### Updates
```bash
# Update containers
docker-compose pull
docker-compose up -d

# Update application
git pull
docker-compose build
docker-compose up -d
```

### Log Management
```bash
# View logs
docker-compose logs -f --tail=100 foodxchange-backend

# Log rotation is handled automatically
```

---

## 📞 Support

For issues and questions:
1. Check this deployment guide
2. Review application logs
3. Check monitoring dashboards
4. Review GitHub issues

---

## 🎯 Next Steps

1. **Configure SSL/TLS** for production
2. **Set up monitoring alerts**
3. **Configure backup strategy**
4. **Set up CI/CD pipeline**
5. **Performance testing**
6. **Security audit**

The FoodXchange backend is now ready for production deployment with comprehensive monitoring, security, and performance optimization!