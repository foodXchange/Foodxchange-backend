# FoodXchange Production Deployment Guide

## 🚀 **Quick Start Production Deployment**

This guide provides step-by-step instructions for deploying the FoodXchange backend to production environments.

## 📋 **Prerequisites**

### **Required Software**
- Docker & Docker Compose (v3.8+)
- Node.js 18+ (for local development)
- Git
- SSL certificates (for HTTPS)
- Domain name with DNS access

### **External Services**
- **Payment Gateways**: Stripe and/or PayPal accounts
- **Email Service**: SMTP provider (SendGrid, Mailgun, etc.)
- **Push Notifications**: Firebase FCM, Apple APNs
- **Cloud Storage**: AWS S3 or compatible service
- **Monitoring**: Optional (DataDog, New Relic, etc.)

## 🔧 **Environment Setup**

### **1. Clone Repository**
```bash
git clone https://github.com/your-org/foodxchange-backend.git
cd foodxchange-backend
```

### **2. Environment Configuration**
Create production environment file:

```bash
cp .env.example .env.production
```

Edit `.env.production` with your production values:

```bash
# Database Configuration
MONGO_PASSWORD=your_secure_mongo_password
REDIS_PASSWORD=your_secure_redis_password
POSTGRES_PASSWORD=your_secure_postgres_password

# Security Keys (Generate secure random strings)
JWT_SECRET=your_super_secure_jwt_secret_64_chars_minimum
JWT_REFRESH_SECRET=your_super_secure_refresh_secret_64_chars_minimum
ENCRYPTION_KEY=your_32_character_encryption_key

# Payment Gateways
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret

# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-production-bucket

# Email Configuration
EMAIL_HOST=smtp.your-provider.com
EMAIL_PORT=587
EMAIL_USER=your_email_username
EMAIL_PASS=your_email_password

# Push Notifications
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
FCM_SERVER_KEY=your_fcm_server_key

# MinIO Object Storage
MINIO_ACCESS_KEY=your_minio_access_key
MINIO_SECRET_KEY=your_minio_secret_key

# Monitoring
GRAFANA_PASSWORD=your_secure_grafana_password
```

## 🏗️ **Production Deployment**

### **Quick Start Commands**
```bash
# 1. Start production environment
docker-compose -f docker-compose.production.yml up -d

# 2. Check all services are running
docker-compose -f docker-compose.production.yml ps

# 3. View API logs
docker-compose -f docker-compose.production.yml logs -f api

# 4. Test API health
curl http://localhost:5000/api/health
```

### **Service Status Verification**
```bash
# Check individual services
curl http://localhost:5000/api/payments/health
curl http://localhost:5000/api/search/health
curl http://localhost:5000/api/notifications/health
curl http://localhost:5000/api/audit/stats
```

## 🔍 **Monitoring Dashboards**

Once deployed, access these monitoring interfaces:

- **API Health**: http://localhost:5000/api/health
- **Grafana Dashboard**: http://localhost:3000 (admin/[GRAFANA_PASSWORD])
- **Prometheus Metrics**: http://localhost:9090
- **MinIO Console**: http://localhost:9001
- **Database Admin**: http://localhost:8080 (Adminer)

## 🔐 **Security Checklist**

- [ ] SSL certificates installed
- [ ] Strong passwords for all services
- [ ] Firewall configured (ports 80, 443 only)
- [ ] Environment variables secured
- [ ] Regular backup schedule
- [ ] Monitoring alerts configured

## 📊 **Performance Monitoring**

Key metrics to monitor:
- API response time < 500ms
- Memory usage < 80%
- CPU usage < 70%
- Database connections healthy
- Error rate < 1%

## 🚨 **Emergency Procedures**

### **Quick Recovery Commands**
```bash
# Restart all services
docker-compose -f docker-compose.production.yml restart

# Rebuild and restart API only
docker-compose -f docker-compose.production.yml up -d --build api

# View system resources
docker stats

# Check logs for errors
docker-compose -f docker-compose.production.yml logs --tail=100 api
```

### **Backup & Restore**
```bash
# Create backup
docker-compose -f docker-compose.production.yml run --rm backup

# Restore from backup (if backup service configured)
./scripts/restore-backup.sh backup-file.tar.gz
```

## 📈 **Scaling Instructions**

### **Horizontal Scaling**
```bash
# Scale API to 3 instances
docker-compose -f docker-compose.production.yml up -d --scale api=3

# Scale down to 1 instance
docker-compose -f docker-compose.production.yml up -d --scale api=1
```

## 🔧 **Common Troubleshooting**

### **API Won't Start**
```bash
# Check environment variables
docker-compose -f docker-compose.production.yml config

# Check resource usage
docker stats

# View detailed logs
docker-compose -f docker-compose.production.yml logs api
```

### **Database Connection Issues**
```bash
# Test MongoDB
docker exec foodxchange-mongodb-prod mongosh --eval "db.adminCommand('ping')"

# Test Redis
docker exec foodxchange-redis-prod redis-cli ping

# Test PostgreSQL
docker exec foodxchange-postgres-prod pg_isready
```

## 📞 **Support Resources**

- **API Integration Guide**: [API_INTEGRATION_GUIDE.md](./API_INTEGRATION_GUIDE.md)
- **Payment System Documentation**: [PAYMENT_SYSTEM.md](./PAYMENT_SYSTEM.md)
- **Architecture Overview**: [ARCHITECTURE.md](./ARCHITECTURE.md)

For technical support, check the logs first, then contact the development team with specific error messages and steps to reproduce issues.