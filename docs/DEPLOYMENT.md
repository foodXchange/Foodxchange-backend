# FoodXchange Backend - Deployment Guide

Comprehensive deployment guide for all platforms and environments.

## Table of Contents

1. [Local Development Setup](#local-development-setup)
2. [Docker Deployment](#docker-deployment)
3. [Cloud Platforms](#cloud-platforms)
   - [Azure Deployment](#azure-deployment)
   - [AWS Deployment](#aws-deployment)
   - [Google Cloud Deployment](#google-cloud-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Production Configuration](#production-configuration)
6. [Security Checklist](#security-checklist)
7. [Monitoring & Maintenance](#monitoring--maintenance)

## Local Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- MongoDB 7.0+
- Redis 7+
- Docker Desktop (optional)
- Git

### Quick Setup

#### Windows (PowerShell)

```powershell
# Clone repository
git clone https://github.com/foodxchange/backend.git
cd foodxchange-backend

# Install dependencies
npm install

# Copy environment file
Copy-Item .env.example .env

# Start services with Docker
docker-compose -f docker-compose.dev.yml up -d

# Run development server
npm run dev
```

#### macOS/Linux

```bash
# Clone repository
git clone https://github.com/foodxchange/backend.git
cd foodxchange-backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start services with Docker
docker-compose -f docker-compose.dev.yml up -d

# Run development server
npm run dev
```

### Manual Setup (Without Docker)

1. **Install MongoDB**
```bash
# macOS
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community

# Ubuntu
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# Windows
# Download installer from https://www.mongodb.com/try/download/community
```

2. **Install Redis**
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server

# Windows
# Use WSL2 or Docker
```

3. **Configure Environment**
```bash
# .env file
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/foodxchange
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d
```

4. **Initialize Database**
```bash
# Run migrations
npm run migrate

# Seed development data
npm run seed:dev
```

### Development Tools

```bash
# Start with hot reload
npm run dev

# Start with debugging
npm run dev:debug

# Start with performance monitoring
npm run dev:perf

# Run tests
npm test

# Generate API documentation
npm run docs:generate
```

## Docker Deployment

### Development Environment

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  foodxchange-backend:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "5000:5000"
      - "9229:9229"  # Debug port
    environment:
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true
    command: npm run dev
```

### Production Build

1. **Build Docker Image**
```bash
# Standard build
docker build -t foodxchange-backend:latest .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 \
  -t foodxchange-backend:latest .

# Build with specific target
docker build --target production \
  -t foodxchange-backend:prod .
```

2. **Run Container**
```bash
# Basic run
docker run -d \
  --name foodxchange-backend \
  -p 5000:5000 \
  --env-file .env.production \
  foodxchange-backend:latest

# With volume mounts
docker run -d \
  --name foodxchange-backend \
  -p 5000:5000 \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/uploads:/app/uploads \
  --env-file .env.production \
  foodxchange-backend:latest
```

### Docker Compose Production

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    image: foodxchange-backend:latest
    restart: always
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
    depends_on:
      - mongo
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mongo:
    image: mongo:7.0
    restart: always
    volumes:
      - mongo-data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD}

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app

volumes:
  mongo-data:
  redis-data:
```

### Docker Registry

```bash
# Tag image
docker tag foodxchange-backend:latest registry.foodxchange.com/backend:latest

# Push to registry
docker push registry.foodxchange.com/backend:latest

# Pull from registry
docker pull registry.foodxchange.com/backend:latest
```

## Cloud Platforms

### Azure Deployment

#### Azure Container Instances

```bash
# Create resource group
az group create --name foodxchange-rg --location eastus

# Create container instance
az container create \
  --resource-group foodxchange-rg \
  --name foodxchange-backend \
  --image registry.foodxchange.com/backend:latest \
  --dns-name-label foodxchange-api \
  --ports 5000 \
  --environment-variables \
    NODE_ENV=production \
    MONGODB_URI=${MONGODB_URI} \
    REDIS_URL=${REDIS_URL}
```

#### Azure Kubernetes Service (AKS)

```bash
# Create AKS cluster
az aks create \
  --resource-group foodxchange-rg \
  --name foodxchange-aks \
  --node-count 3 \
  --enable-addons monitoring \
  --generate-ssh-keys

# Get credentials
az aks get-credentials \
  --resource-group foodxchange-rg \
  --name foodxchange-aks

# Deploy application
kubectl apply -f k8s/
```

#### Azure App Service

```bash
# Create App Service plan
az appservice plan create \
  --name foodxchange-plan \
  --resource-group foodxchange-rg \
  --sku B2 \
  --is-linux

# Create web app
az webapp create \
  --resource-group foodxchange-rg \
  --plan foodxchange-plan \
  --name foodxchange-api \
  --deployment-container-image-name registry.foodxchange.com/backend:latest

# Configure settings
az webapp config appsettings set \
  --resource-group foodxchange-rg \
  --name foodxchange-api \
  --settings \
    NODE_ENV=production \
    WEBSITES_PORT=5000
```

#### Azure Infrastructure (Terraform)

```hcl
# main.tf
provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "main" {
  name     = "foodxchange-rg"
  location = "East US"
}

resource "azurerm_container_group" "main" {
  name                = "foodxchange-backend"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  ip_address_type     = "Public"
  dns_name_label      = "foodxchange-api"
  os_type             = "Linux"

  container {
    name   = "backend"
    image  = "registry.foodxchange.com/backend:latest"
    cpu    = "2"
    memory = "4"

    ports {
      port     = 5000
      protocol = "TCP"
    }

    environment_variables = {
      NODE_ENV = "production"
    }

    secure_environment_variables = {
      MONGODB_URI = var.mongodb_uri
      REDIS_URL   = var.redis_url
      JWT_SECRET  = var.jwt_secret
    }
  }
}
```

### AWS Deployment

#### AWS ECS

```bash
# Create ECR repository
aws ecr create-repository --repository-name foodxchange-backend

# Get login token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.us-east-1.amazonaws.com

# Push image
docker tag foodxchange-backend:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/foodxchange-backend:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/foodxchange-backend:latest
```

**Task Definition** (task-definition.json):
```json
{
  "family": "foodxchange-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/foodxchange-backend:latest",
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "MONGODB_URI",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:mongodb-uri"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/foodxchange-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### AWS Elastic Beanstalk

```bash
# Initialize EB
eb init -p docker foodxchange-backend

# Create environment
eb create production

# Deploy
eb deploy

# Set environment variables
eb setenv NODE_ENV=production \
  MONGODB_URI=$MONGODB_URI \
  REDIS_URL=$REDIS_URL
```

#### AWS Lambda (Serverless)

```yaml
# serverless.yml
service: foodxchange-backend

provider:
  name: aws
  runtime: nodejs18.x
  stage: ${opt:stage, 'dev'}
  region: us-east-1

functions:
  api:
    handler: dist/lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
    environment:
      NODE_ENV: production
      MONGODB_URI: ${env:MONGODB_URI}
      REDIS_URL: ${env:REDIS_URL}
```

### Google Cloud Deployment

#### Google Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/foodxchange/backend

# Deploy to Cloud Run
gcloud run deploy foodxchange-backend \
  --image gcr.io/foodxchange/backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production
```

#### Google Kubernetes Engine (GKE)

```bash
# Create cluster
gcloud container clusters create foodxchange-cluster \
  --num-nodes=3 \
  --zone=us-central1-a

# Get credentials
gcloud container clusters get-credentials foodxchange-cluster \
  --zone=us-central1-a

# Deploy
kubectl apply -f k8s/
```

#### Google App Engine

```yaml
# app.yaml
runtime: nodejs18
env: standard

instance_class: F2

env_variables:
  NODE_ENV: "production"

automatic_scaling:
  min_instances: 1
  max_instances: 10
  target_cpu_utilization: 0.6

handlers:
- url: /.*
  script: auto
  secure: always
```

## Kubernetes Deployment

### Deployment Manifest

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: foodxchange-backend
  labels:
    app: foodxchange-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: foodxchange-backend
  template:
    metadata:
      labels:
        app: foodxchange-backend
    spec:
      containers:
      - name: backend
        image: registry.foodxchange.com/backend:latest
        ports:
        - containerPort: 5000
        env:
        - name: NODE_ENV
          value: "production"
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: foodxchange-secrets
              key: mongodb-uri
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: foodxchange-secrets
              key: redis-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Service Configuration

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: foodxchange-backend
spec:
  selector:
    app: foodxchange-backend
  ports:
  - protocol: TCP
    port: 80
    targetPort: 5000
  type: LoadBalancer
```

### Ingress Configuration

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: foodxchange-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
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

### Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: foodxchange-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: foodxchange-backend
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: foodxchange-config
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  ENABLE_METRICS: "true"
  CACHE_TTL: "3600"
```

### Secrets

```bash
# Create secrets
kubectl create secret generic foodxchange-secrets \
  --from-literal=mongodb-uri='mongodb://...' \
  --from-literal=redis-url='redis://...' \
  --from-literal=jwt-secret='...'
```

## Production Configuration

### Environment Variables

```bash
# .env.production
# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

# Database Configuration
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/foodxchange?retryWrites=true
MONGODB_POOL_SIZE=10
MONGODB_TIMEOUT=30000

# Redis Configuration
REDIS_HOST=redis.foodxchange.com
REDIS_PORT=6379
REDIS_PASSWORD=secure-password
REDIS_DB=0
REDIS_KEY_PREFIX=foodxchange:

# Authentication
JWT_SECRET=production-secret-change-this
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=refresh-secret-change-this
JWT_REFRESH_EXPIRES_IN=30d

# Security
BCRYPT_ROUNDS=12
SESSION_SECRET=session-secret-change-this
CORS_ORIGIN=https://app.foodxchange.com

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=/app/uploads

# Email Configuration
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
EMAIL_FROM=noreply@foodxchange.com

# Cloud Storage
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=foodxchange-uploads

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
NEW_RELIC_LICENSE_KEY=xxx
DATADOG_API_KEY=xxx

# Feature Flags
ENABLE_WEBSOCKET=true
ENABLE_ANALYTICS=true
ENABLE_COMPLIANCE_AI=true
ENABLE_REAL_TIME_SYNC=true
```

### Nginx Configuration

```nginx
# nginx.conf
upstream backend {
    least_conn;
    server app1:5000 weight=1 max_fails=3 fail_timeout=30s;
    server app2:5000 weight=1 max_fails=3 fail_timeout=30s;
    server app3:5000 weight=1 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name api.foodxchange.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.foodxchange.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/foodxchange.crt;
    ssl_certificate_key /etc/nginx/ssl/foodxchange.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Compression
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1000;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Proxy Configuration
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

    # WebSocket Support
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health Check Endpoint
    location /health {
        access_log off;
        proxy_pass http://backend/health;
    }
}
```

### Database Optimization

```javascript
// MongoDB Production Settings
const mongoOptions = {
  // Connection Pool
  maxPoolSize: 100,
  minPoolSize: 10,
  maxIdleTimeMS: 10000,
  
  // Timeouts
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  
  // Write Concern
  writeConcern: {
    w: 'majority',
    j: true,
    wtimeout: 1000
  },
  
  // Read Preference
  readPreference: 'secondaryPreferred',
  
  // Compression
  compressors: ['zlib'],
  
  // Retry
  retryWrites: true,
  retryReads: true
};

// Redis Production Settings
const redisOptions = {
  // Connection Pool
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
  
  // Reconnection
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  
  // Performance
  enableReadyCheck: true,
  lazyConnect: false,
  
  // Security
  password: process.env.REDIS_PASSWORD,
  tls: process.env.NODE_ENV === 'production' ? {} : undefined
};
```

## Security Checklist

### Pre-Deployment

- [ ] Update all dependencies to latest stable versions
- [ ] Run security audit: `npm audit fix`
- [ ] Scan Docker images for vulnerabilities
- [ ] Review and update all secrets
- [ ] Enable HTTPS/TLS everywhere
- [ ] Configure firewall rules
- [ ] Set up WAF (Web Application Firewall)
- [ ] Enable DDoS protection
- [ ] Configure CORS properly
- [ ] Implement rate limiting
- [ ] Enable request/response logging
- [ ] Set up intrusion detection

### Application Security

- [ ] Use strong JWT secrets (min 256 bits)
- [ ] Implement proper session management
- [ ] Enable CSRF protection
- [ ] Sanitize all user inputs
- [ ] Implement SQL injection prevention
- [ ] Use parameterized queries
- [ ] Encrypt sensitive data at rest
- [ ] Implement proper error handling
- [ ] Hide stack traces in production
- [ ] Remove debug endpoints
- [ ] Implement API versioning
- [ ] Use security headers

### Infrastructure Security

- [ ] Use private subnets for databases
- [ ] Enable VPC/Network isolation
- [ ] Configure security groups properly
- [ ] Use bastion hosts for SSH
- [ ] Enable audit logging
- [ ] Implement backup encryption
- [ ] Use IAM roles instead of keys
- [ ] Enable MFA for admin access
- [ ] Regular security patching
- [ ] Implement zero-trust networking
- [ ] Use secrets management service
- [ ] Enable compliance monitoring

### Monitoring Security

- [ ] Set up security alerts
- [ ] Monitor failed login attempts
- [ ] Track API usage patterns
- [ ] Alert on unusual activity
- [ ] Log all admin actions
- [ ] Monitor file integrity
- [ ] Track configuration changes
- [ ] Set up vulnerability scanning
- [ ] Implement log retention policies
- [ ] Regular security audits

## Monitoring & Maintenance

### Health Checks

```bash
# Basic health check
curl https://api.foodxchange.com/health

# Detailed health check
curl https://api.foodxchange.com/health/detailed

# Database health
curl https://api.foodxchange.com/health/db

# Dependencies health
curl https://api.foodxchange.com/health/dependencies
```

### Monitoring Stack

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana

  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml

  node-exporter:
    image: prom/node-exporter:latest
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
```

### Backup Strategy

```bash
#!/bin/bash
# backup.sh

# MongoDB backup
mongodump --uri=$MONGODB_URI --out=/backup/mongo-$(date +%Y%m%d)

# Redis backup
redis-cli --rdb /backup/redis-$(date +%Y%m%d).rdb

# Application files
tar -czf /backup/app-$(date +%Y%m%d).tar.gz /app/uploads

# Upload to S3
aws s3 sync /backup s3://foodxchange-backups/$(date +%Y%m%d)/

# Clean old backups
find /backup -mtime +7 -delete
```

### Update Process

```bash
# 1. Backup current version
./scripts/backup.sh

# 2. Pull latest changes
git pull origin main

# 3. Install dependencies
npm ci

# 4. Run migrations
npm run migrate

# 5. Build application
npm run build

# 6. Run tests
npm test

# 7. Deploy with zero downtime
kubectl set image deployment/foodxchange-backend \
  backend=registry.foodxchange.com/backend:new-version

# 8. Monitor rollout
kubectl rollout status deployment/foodxchange-backend

# 9. Run smoke tests
npm run test:smoke

# 10. Rollback if needed
kubectl rollout undo deployment/foodxchange-backend
```

### Performance Tuning

```bash
# Node.js optimization
NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size"

# PM2 cluster mode
pm2 start dist/server-new.js -i max

# Nginx caching
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Troubleshooting Deployment

### Common Issues

1. **Connection refused**
   - Check firewall rules
   - Verify service is running
   - Check port bindings

2. **Out of memory**
   - Increase container limits
   - Check for memory leaks
   - Enable swap if needed

3. **Slow performance**
   - Check database indexes
   - Review query performance
   - Enable caching
   - Scale horizontally

4. **SSL/TLS errors**
   - Verify certificate validity
   - Check certificate chain
   - Update TLS configuration

### Debug Commands

```bash
# Check logs
kubectl logs -f deployment/foodxchange-backend
docker logs -f foodxchange-backend

# Check resources
kubectl top pods
docker stats

# Check connectivity
kubectl exec -it pod-name -- curl http://localhost:5000/health
docker exec -it container-name curl http://localhost:5000/health

# Check environment
kubectl exec -it pod-name -- env | grep NODE
docker exec -it container-name env | grep NODE
```

## Support

For deployment assistance:
- Documentation: [https://docs.foodxchange.com/deployment](https://docs.foodxchange.com/deployment)
- DevOps Support: devops@foodxchange.com
- Emergency: +1-800-FOODX-911

---

**Version**: 2.0.0  
**Last Updated**: January 2025