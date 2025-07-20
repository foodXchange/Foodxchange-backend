# 🚀 FoodXchange Backend - Quick Deployment Guide

## Option 1: Docker Deployment (Recommended)

### Local Development with Docker

```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f foodxchange-backend

# Stop services
docker-compose -f docker-compose.dev.yml down
```

**Access Points:**
- API: http://localhost:5000
- MongoDB: localhost:27017
- Redis: localhost:6379

### Deploy to Remote Server with Docker

```bash
# On remote server
git clone https://github.com/your-org/foodxchange-backend.git
cd foodxchange-backend

# Start production stack
docker-compose -f docker-compose.production.yml up -d
```

## Option 2: Traditional Deployment

### Quick Upload to Dev Server

```bash
# Make scripts executable
chmod +x upload-to-dev.sh deploy-dev.sh

# Quick upload (no Git required on server)
DEV_HOST=your-server.com ./upload-to-dev.sh

# Full deployment with Git
DEV_HOST=your-server.com ./deploy-dev.sh
```

### Manual Steps on Server

```bash
# 1. Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install MongoDB & Redis
sudo apt-get update
sudo apt-get install -y mongodb redis-server

# 3. Clone and setup
git clone <your-repo-url>
cd foodxchange-backend
npm ci
cp .env.development .env
npm run build

# 4. Start with PM2
npm install -g pm2
pm2 start ecosystem.config.js
```

## Option 3: One-Click Cloud Deployment

### Deploy to Heroku

```bash
# Create Heroku app
heroku create foodxchange-api-dev

# Add MongoDB
heroku addons:create mongolab:sandbox

# Add Redis
heroku addons:create heroku-redis:hobby-dev

# Deploy
git push heroku main
```

### Deploy to DigitalOcean App Platform

1. Fork the repository
2. Connect to DigitalOcean
3. Select "Web Service"
4. Add MongoDB and Redis databases
5. Deploy

### Deploy to AWS EC2

```bash
# Use AWS CLI
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --key-name your-key \
  --user-data file://setup-script.sh
```

## 🔍 Verify Deployment

```bash
# Check health
curl http://your-server:5001/health

# Check PM2 status (if using PM2)
pm2 status

# Check Docker status (if using Docker)
docker ps

# View logs
# PM2: pm2 logs
# Docker: docker-compose logs -f api
```

## 🆘 Quick Troubleshooting

### Port Already in Use
```bash
# Find process
sudo lsof -i :5001
# Kill it
sudo kill -9 <PID>
```

### MongoDB Not Connecting
```bash
# Check MongoDB
sudo systemctl status mongod
sudo systemctl start mongod
```

### PM2 Not Starting
```bash
pm2 delete all
pm2 start ecosystem.config.js --env development
```

## 📱 Connect Frontend

Update your frontend configuration:

```javascript
// Frontend config
const API_URL = 'http://your-dev-server:5001/api';
const WS_URL = 'ws://your-dev-server:5001';
```

## 🔐 Security Reminders

1. Change all default passwords in `.env`
2. Set up firewall rules
3. Enable SSL (use Let's Encrypt)
4. Restrict database access
5. Set up monitoring

## 📞 Need Help?

1. Check logs first
2. Verify all services are running
3. Ensure ports are open
4. Check environment variables

For detailed setup, see [DEV_SERVER_SETUP.md](./DEV_SERVER_SETUP.md)