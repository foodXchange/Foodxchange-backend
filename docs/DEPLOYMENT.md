# Deployment Guide

Comprehensive deployment guide for FoodXchange Backend across different environments and platforms.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Deployment](#docker-deployment)
4. [Cloud Deployment](#cloud-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Production Configuration](#production-configuration)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- **CPU**: 2+ cores (4+ recommended for production)
- **RAM**: 4GB minimum (8GB+ for production)
- **Storage**: 20GB+ available
- **OS**: Linux, macOS, Windows (WSL2), ARM64 support

### Software Requirements
```bash
# Required
- Node.js 18.x or 20.x
- npm 8.x+
- Git

# Optional (can use Docker)
- MongoDB 7.x
- Redis 7.x
- Docker & Docker Compose
```

## Local Development

### Quick Start (Windows)
```powershell
# PowerShell (Run as Administrator)
.\quick-start.ps1

# This script will:
# 1. Check prerequisites
# 2. Install dependencies
# 3. Set up environment
# 4. Start services with Docker
# 5. Launch development server
```

### Manual Setup

#### 1. Clone Repository
```bash
git clone https://github.com/foodxchange/backend.git
cd backend
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Configure Environment
```bash
# Copy example environment
cp .env.example .env

# Edit configuration
# Required variables:
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/foodxchange
JWT_SECRET=your-secure-secret-key-minimum-32-characters
```

#### 4. Start Services
```bash
# Option 1: Using Docker (Recommended)
docker-compose -f docker-compose.dev.yml up -d

# Option 2: Manual services
# Start MongoDB
mongod --dbpath ./data/db

# Start Redis (separate terminal)
redis-server

# Option 3: Use cloud services
# MongoDB Atlas + Redis Cloud
```

#### 5. Run Development Server
```bash
# With hot reload
npm run dev

# With debugging
npm run dev:debug
```

## Docker Deployment

### Development with Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Clean everything
docker-compose down -v
```

### Production Docker Build

#### Multi-Architecture Build
```bash
# Setup buildx
docker buildx create --name multiarch --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t foodxchange/backend:latest \
  --push .
```

#### Optimized Production Image
```bash
# Use optimized Dockerfile
docker build -f Dockerfile.optimized -t foodxchange/backend:prod .

# Run production container
docker run -d \
  --name foodxchange-backend \
  -p 5000:5000 \
  -p 9090:9090 \
  --env-file .env.production \
  --restart unless-stopped \
  foodxchange/backend:prod
```

### Docker Compose Variants

#### Development
```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  backend:
    build: .
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
    command: npm run dev
```

#### Production
```yaml
# docker-compose.production.yml
version: '3.8'
services:
  backend:
    image: foodxchange/backend:latest
    restart: unless-stopped
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

#### ARM64 (Raspberry Pi, M1 Mac)
```yaml
# docker-compose.arm64.yml
version: '3.8'
services:
  backend:
    build:
      dockerfile: Dockerfile.arm64
    platform: linux/arm64
```

## Cloud Deployment

### Azure App Service

#### Prerequisites
```bash
# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
az login
```

#### Deployment Steps
```bash
# 1. Create resources
az group create --name foodxchange-rg --location eastus
az appservice plan create \
  --name foodxchange-plan \
  --resource-group foodxchange-rg \
  --sku P1V2 \
  --is-linux

# 2. Create web app
az webapp create \
  --name foodxchange-api \
  --resource-group foodxchange-rg \
  --plan foodxchange-plan \
  --runtime "NODE:18-lts"

# 3. Configure settings
az webapp config appsettings set \
  --name foodxchange-api \
  --resource-group foodxchange-rg \
  --settings @appsettings.json

# 4. Deploy code
az webapp deployment source config-zip \
  --name foodxchange-api \
  --resource-group foodxchange-rg \
  --src deploy.zip
```

### AWS ECS

#### Setup
```bash
# Configure AWS CLI
aws configure

# Create ECR repository
aws ecr create-repository \
  --repository-name foodxchange-backend \
  --region us-east-1
```

#### Deploy to ECS
```bash
# 1. Build and push image
$(aws ecr get-login --no-include-email --region us-east-1)
docker build -t foodxchange-backend .
docker tag foodxchange-backend:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/foodxchange-backend:latest
docker push \
  123456789.dkr.ecr.us-east-1.amazonaws.com/foodxchange-backend:latest

# 2. Create task definition
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json

# 3. Create service
aws ecs create-service \
  --cluster production \
  --service-name foodxchange-backend \
  --task-definition foodxchange-backend:1 \
  --desired-count 3 \
  --launch-type FARGATE
```

### Google Cloud Run

```bash
# 1. Configure GCP
gcloud config set project YOUR_PROJECT_ID

# 2. Build and push
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/foodxchange-backend

# 3. Deploy
gcloud run deploy foodxchange-backend \
  --image gcr.io/YOUR_PROJECT_ID/foodxchange-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10
```

## Kubernetes Deployment

### Local Kubernetes (Minikube)
```bash
# Start Minikube
minikube start --memory 4096 --cpus 2

# Build image in Minikube
eval $(minikube docker-env)
docker build -t foodxchange-backend:local .
```

### Production Kubernetes

#### 1. Create Namespace
```bash
kubectl create namespace foodxchange
kubectl config set-context --current --namespace=foodxchange
```

#### 2. Create Secrets
```bash
# Create secret from .env file
kubectl create secret generic foodxchange-secrets \
  --from-env-file=.env.production

# Or individual secrets
kubectl create secret generic foodxchange-secrets \
  --from-literal=jwt-secret='your-secret' \
  --from-literal=mongodb-uri='mongodb://...'
```

#### 3. Deploy Application
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: foodxchange-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: foodxchange/backend:latest
        ports:
        - containerPort: 5000
        - containerPort: 9090
        envFrom:
        - secretRef:
            name: foodxchange-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 10
          periodSeconds: 10
```

#### 4. Create Service
```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: foodxchange-backend
spec:
  selector:
    app: backend
  ports:
  - name: http
    port: 80
    targetPort: 5000
  - name: metrics
    port: 9090
    targetPort: 9090
  type: LoadBalancer
```

#### 5. Deploy Ingress
```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: foodxchange-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.foodxchange.com
    secretName: foodxchange-tls
  rules:
  - host: api.foodxchange.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: foodxchange-backend
            port:
              number: 80
```

#### 6. Apply Configuration
```bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml

# Check status
kubectl get all
kubectl logs -f deployment/foodxchange-backend
```

## Production Configuration

### Environment Variables
```env
# Production .env
NODE_ENV=production
PORT=5000

# Security
JWT_SECRET=<generate-with-openssl-rand-base64-32>
JWT_REFRESH_SECRET=<generate-with-openssl-rand-base64-32>
ENCRYPTION_KEY=<generate-with-openssl-rand-base64-32>

# Database
MONGODB_URI=mongodb://user:pass@mongo1:27017,mongo2:27017,mongo3:27017/foodxchange?replicaSet=rs0
DB_POOL_SIZE=50
DB_MAX_POOL_SIZE=100

# Redis
REDIS_URL=redis://:password@redis-cluster:6379
REDIS_CLUSTER_NODES=redis-1:6379,redis-2:6379,redis-3:6379

# Performance
NODE_OPTIONS=--max-old-space-size=4096
UV_THREADPOOL_SIZE=16

# Features
ENABLE_CLUSTERING=true
ENABLE_CACHING=true
ENABLE_COMPRESSION=true
ENABLE_RATE_LIMITING=true

# Monitoring
ENABLE_METRICS=true
ENABLE_TRACING=true
JAEGER_ENDPOINT=http://jaeger:14268/api/traces
```

### Nginx Configuration
```nginx
# /etc/nginx/sites-available/foodxchange
upstream backend {
    least_conn;
    server backend-1:5000 max_fails=3 fail_timeout=30s;
    server backend-2:5000 max_fails=3 fail_timeout=30s;
    server backend-3:5000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80;
    listen 443 ssl http2;
    server_name api.foodxchange.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/api.foodxchange.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.foodxchange.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
    limit_req zone=api burst=50 nodelay;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://backend;
        access_log off;
    }
}
```

### Database Configuration

#### MongoDB Replica Set
```bash
# Initialize replica set
mongosh --eval "rs.initiate({
  _id: 'rs0',
  members: [
    { _id: 0, host: 'mongo1:27017' },
    { _id: 1, host: 'mongo2:27017' },
    { _id: 2, host: 'mongo3:27017' }
  ]
})"

# Create indexes
mongosh foodxchange --eval "
db.products.createIndex({ category: 1, status: 1 });
db.orders.createIndex({ userId: 1, createdAt: -1 });
db.rfqs.createIndex({ status: 1, expiryDate: 1 });
"
```

#### Redis Cluster
```bash
# Create cluster
redis-cli --cluster create \
  redis1:6379 redis2:6379 redis3:6379 \
  redis4:6379 redis5:6379 redis6:6379 \
  --cluster-replicas 1

# Configure persistence
redis-cli CONFIG SET save "900 1 300 10 60 10000"
redis-cli CONFIG SET appendonly yes
```

## Monitoring & Maintenance

### Health Checks
```bash
# Basic health check
curl https://api.foodxchange.com/health

# Detailed health check
curl https://api.foodxchange.com/health/detailed

# Metrics endpoint
curl https://api.foodxchange.com/metrics
```

### Monitoring Stack

#### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'foodxchange-backend'
    static_configs:
      - targets: ['backend-1:9090', 'backend-2:9090', 'backend-3:9090']
```

#### Grafana Dashboards
1. Import dashboard from `./monitoring/grafana-dashboard.json`
2. Configure alerts for:
   - Response time > 500ms
   - Error rate > 1%
   - Memory usage > 80%
   - CPU usage > 80%

### Backup Strategy

#### Automated Backups
```bash
# MongoDB backup script
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mongodump --uri="${MONGODB_URI}" --out="/backup/mongo_${TIMESTAMP}"

# Compress and upload to S3
tar -czf "/backup/mongo_${TIMESTAMP}.tar.gz" "/backup/mongo_${TIMESTAMP}"
aws s3 cp "/backup/mongo_${TIMESTAMP}.tar.gz" "s3://foodxchange-backups/mongo/"

# Clean up old backups (keep 30 days)
find /backup -name "mongo_*.tar.gz" -mtime +30 -delete
```

#### Restore Process
```bash
# Download from S3
aws s3 cp "s3://foodxchange-backups/mongo/mongo_20250723_120000.tar.gz" .

# Extract
tar -xzf mongo_20250723_120000.tar.gz

# Restore
mongorestore --uri="${MONGODB_URI}" --drop mongo_20250723_120000/
```

### Maintenance Tasks

#### Daily
- Check error logs
- Monitor disk space
- Verify backups

#### Weekly
- Review performance metrics
- Update dependencies
- Security scan

#### Monthly
- Database optimization
- Certificate renewal check
- Capacity planning review

## Troubleshooting

For detailed troubleshooting, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

### Quick Fixes

#### Service Won't Start
```bash
# Check logs
docker logs foodxchange-backend
kubectl logs deployment/foodxchange-backend

# Common issues:
# - Port already in use
# - Missing environment variables
# - Database connection failed
```

#### Performance Issues
```bash
# Enable profiling
NODE_ENV=production NODE_OPTIONS="--prof" node dist/server.js

# Analyze profile
node --prof-process isolate-*.log > profile.txt
```

#### Connection Issues
```bash
# Test database connection
mongosh "${MONGODB_URI}" --eval "db.adminCommand('ping')"

# Test Redis connection
redis-cli -u "${REDIS_URL}" ping
```

## Security Checklist

- [ ] HTTPS enabled with valid certificate
- [ ] Environment variables secured
- [ ] Database authentication enabled
- [ ] Redis password configured
- [ ] Rate limiting active
- [ ] CORS properly configured
- [ ] Security headers set
- [ ] Regular security updates
- [ ] Audit logging enabled
- [ ] Backup encryption enabled

## Support

- Documentation: [https://docs.foodxchange.com](https://docs.foodxchange.com)
- Issues: [GitHub Issues](https://github.com/foodxchange/backend/issues)
- Community: [Discord](https://discord.gg/foodxchange)
- Email: support@foodxchange.com

---

Last Updated: July 23, 2025