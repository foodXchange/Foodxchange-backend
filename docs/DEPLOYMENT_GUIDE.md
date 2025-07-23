# FoodXchange Backend Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Deployment](#docker-deployment)
4. [Cloud Deployment](#cloud-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Production Checklist](#production-checklist)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- **CPU**: 2+ cores (4+ recommended)
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: 20GB available space
- **OS**: Linux, macOS, Windows (with WSL2)

### Software Requirements
- Node.js 18.x or 20.x
- Docker & Docker Compose
- MongoDB 7.x (or Docker)
- Redis 7.x (optional)
- Git

### ARM64 Support
- Raspberry Pi 4/5 (4GB+ RAM)
- AWS Graviton instances
- Apple Silicon (M1/M2/M3)

## Local Development

### Quick Start (Windows PowerShell)
```powershell
# Clone repository
git clone https://github.com/foodxchange/backend.git
cd backend

# One-command setup and start
.\quick-start.ps1
```

### Manual Setup
```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
# Key variables to set:
# - MONGODB_URI
# - JWT_SECRET (generate secure 256-bit key)
# - REDIS_URL (optional)

# Start development server
npm run dev
```

### Docker Development
```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# Check logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

## Docker Deployment

### Building Images

#### Multi-Architecture Build
```bash
# Create buildx builder
docker buildx create --name multiarch --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t foodxchange/backend:latest \
  --push .
```

#### Platform-Specific Builds
```bash
# AMD64 (standard servers)
docker build -t foodxchange/backend:amd64 .

# ARM64 (Raspberry Pi, M1 Mac)
docker build -f Dockerfile.arm64 -t foodxchange/backend:arm64 .
```

### Running Containers

#### Development Environment
```bash
docker-compose -f docker-compose.dev.yml up -d
```

#### Production Optimized
```bash
docker-compose -f docker-compose.optimized.yml up -d
```

#### ARM64 Devices
```bash
docker-compose -f docker-compose.arm64.yml up -d
```

### Docker Compose Options

#### Minimal Setup (Backend + DB + Redis)
```yaml
version: '3.8'
services:
  backend:
    image: foodxchange/backend:latest
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/foodxchange
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongo
      - redis
  
  mongo:
    image: mongo:7.0
    volumes:
      - mongo-data:/data/db
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  mongo-data:
  redis-data:
```

## Cloud Deployment

### Azure App Service

#### Prerequisites
```bash
# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Login to Azure
az login
```

#### Deployment Steps
```bash
# Create resource group
az group create --name foodxchange-rg --location eastus

# Create App Service Plan
az appservice plan create \
  --name foodxchange-plan \
  --resource-group foodxchange-rg \
  --sku P1V2 \
  --is-linux

# Create Web App
az webapp create \
  --name foodxchange-api \
  --resource-group foodxchange-rg \
  --plan foodxchange-plan \
  --runtime "NODE:18-lts"

# Configure environment variables
az webapp config appsettings set \
  --name foodxchange-api \
  --resource-group foodxchange-rg \
  --settings \
    NODE_ENV=production \
    MONGODB_URI="your-connection-string" \
    JWT_SECRET="your-secret"

# Deploy from Docker
az webapp config container set \
  --name foodxchange-api \
  --resource-group foodxchange-rg \
  --docker-custom-image-name foodxchange/backend:latest
```

### AWS ECS

#### Setup
```bash
# Configure AWS CLI
aws configure

# Create ECR repository
aws ecr create-repository --repository-name foodxchange-backend

# Get login token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.us-east-1.amazonaws.com
```

#### Deploy to ECS
```bash
# Tag and push image
docker tag foodxchange/backend:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/foodxchange-backend:latest

docker push \
  123456789.dkr.ecr.us-east-1.amazonaws.com/foodxchange-backend:latest

# Create task definition (see ecs-task-definition.json)
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

# Create service
aws ecs create-service \
  --cluster foodxchange \
  --service-name backend \
  --task-definition foodxchange-backend:1 \
  --desired-count 3
```

### Google Cloud Run

```bash
# Configure GCP
gcloud auth login
gcloud config set project your-project-id

# Build and push to Container Registry
gcloud builds submit --tag gcr.io/your-project/foodxchange-backend

# Deploy to Cloud Run
gcloud run deploy foodxchange-backend \
  --image gcr.io/your-project/foodxchange-backend \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 10 \
  --allow-unauthenticated
```

## Kubernetes Deployment

### Prerequisites
```bash
# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Install Helm
curl https://get.helm.sh/helm-v3.12.0-linux-amd64.tar.gz | tar xz
sudo mv linux-amd64/helm /usr/local/bin/
```

### Deployment Steps

#### 1. Create Namespace
```bash
kubectl create namespace foodxchange
```

#### 2. Create Secrets
```bash
kubectl create secret generic foodxchange-secrets \
  --from-literal=jwt-secret='your-secret' \
  --from-literal=mongodb-uri='mongodb://...' \
  -n foodxchange
```

#### 3. Apply Manifests
```bash
# Apply all K8s resources
kubectl apply -f k8s/ -n foodxchange

# Check deployment status
kubectl get all -n foodxchange

# View logs
kubectl logs -f deployment/backend -n foodxchange
```

#### 4. Helm Chart Deployment
```bash
# Add repository
helm repo add foodxchange https://charts.foodxchange.com

# Install
helm install foodxchange foodxchange/backend \
  --namespace foodxchange \
  --values values.yaml
```

### Kubernetes Manifests

#### deployment.yaml
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
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
        env:
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: foodxchange-secrets
              key: jwt-secret
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

## Production Checklist

### Environment Configuration
- [ ] Set `NODE_ENV=production`
- [ ] Configure secure JWT secrets (256-bit)
- [ ] Set up environment-specific configs
- [ ] Enable production error handling
- [ ] Configure proper CORS origins

### Database
- [ ] MongoDB replica set (3+ nodes)
- [ ] Connection pooling configured
- [ ] Indexes created and optimized
- [ ] Backup strategy implemented
- [ ] Point-in-time recovery enabled

### Caching
- [ ] Redis cluster mode enabled
- [ ] Persistence configured
- [ ] Memory limits set
- [ ] Eviction policy configured
- [ ] Connection pooling enabled

### Security
- [ ] HTTPS/TLS configured
- [ ] Security headers enabled
- [ ] Rate limiting active
- [ ] DDoS protection
- [ ] API keys for B2B access
- [ ] Secrets in Key Vault

### Performance
- [ ] Node.js memory configured (2GB+)
- [ ] UV thread pool sized (16)
- [ ] Compression enabled
- [ ] CDN configured
- [ ] Static assets cached
- [ ] Database queries optimized

### Monitoring
- [ ] Health check endpoints
- [ ] Prometheus metrics
- [ ] Log aggregation
- [ ] Error tracking (Sentry)
- [ ] APM configured
- [ ] Alerts set up

### High Availability
- [ ] Load balancer configured
- [ ] Auto-scaling policies
- [ ] Multi-zone deployment
- [ ] Graceful shutdown
- [ ] Zero-downtime deployments
- [ ] Disaster recovery plan

## Monitoring & Maintenance

### Health Checks
```bash
# Basic health check
curl http://api.foodxchange.com/health

# Detailed health check
curl http://api.foodxchange.com/health/detailed

# Metrics endpoint
curl http://api.foodxchange.com/metrics
```

### Log Management
```bash
# View logs (Docker)
docker logs -f foodxchange-backend

# View logs (Kubernetes)
kubectl logs -f deployment/backend -n foodxchange

# View logs (PM2)
pm2 logs backend
```

### Performance Monitoring

#### Key Metrics
- Response time (p50, p95, p99)
- Request rate
- Error rate
- CPU usage
- Memory usage
- Database query time
- Cache hit rate

#### Grafana Dashboards
1. Import dashboards from `docker/grafana/dashboards/`
2. Configure data source (Prometheus)
3. Set up alerts

### Database Maintenance
```bash
# MongoDB backup
mongodump --uri="mongodb://..." --out=/backup/$(date +%Y%m%d)

# MongoDB restore
mongorestore --uri="mongodb://..." /backup/20250723

# Redis backup
redis-cli BGSAVE

# Check replication status
mongo --eval "rs.status()"
```

## Troubleshooting

### Common Issues

#### 1. Server Won't Start
```bash
# Check logs
docker logs foodxchange-backend

# Common causes:
# - Missing environment variables
# - Database connection failed
# - Port already in use
# - Insufficient memory
```

#### 2. Slow Performance
```bash
# Check metrics
curl http://localhost:9090/metrics

# Common optimizations:
# - Enable caching
# - Add database indexes
# - Increase connection pool
# - Scale horizontally
```

#### 3. Memory Issues
```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096"

# Check memory usage
docker stats foodxchange-backend
```

#### 4. Connection Errors
```bash
# Test MongoDB connection
mongosh "mongodb://..." --eval "db.adminCommand('ping')"

# Test Redis connection
redis-cli -h host -p 6379 ping
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm start

# Specific components
DEBUG=app:*,cache:*,db:* npm start
```

### Performance Profiling
```bash
# CPU profiling
node --prof dist/server.js

# Heap snapshot
node --heapsnapshot-signal=SIGUSR2 dist/server.js
```

## Support

- Documentation: [docs.foodxchange.com](https://docs.foodxchange.com)
- Issues: [GitHub Issues](https://github.com/foodxchange/backend/issues)
- Email: support@foodxchange.com
- Slack: [Join our workspace](https://foodxchange.slack.com)

---

Last Updated: July 23, 2025