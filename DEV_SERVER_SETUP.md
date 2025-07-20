# FoodXchange Backend - Development Server Setup Guide

## 🚀 Quick Start

### Prerequisites on Dev Server
- Node.js 18+ and npm
- MongoDB 6.0+
- Redis 6.0+
- Nginx (optional, for reverse proxy)
- PM2 (will be installed automatically)
- Git

### 1. Initial Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Redis
sudo apt-get install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Install build tools
sudo apt-get install -y build-essential
```

### 2. Deploy Using Script

```bash
# On your local machine
chmod +x deploy-dev.sh

# Deploy to dev server
DEV_HOST=your-dev-server.com \
DEV_USER=your-username \
./deploy-dev.sh
```

### 3. Manual Deployment Steps

If you prefer manual deployment:

```bash
# On dev server
# 1. Create application directory
sudo mkdir -p /var/www/foodxchange-backend
sudo chown $USER:$USER /var/www/foodxchange-backend
cd /var/www/foodxchange-backend

# 2. Clone repository
git clone https://github.com/your-org/foodxchange-backend.git .
git checkout develop

# 3. Install dependencies
npm ci

# 4. Copy and configure environment
cp .env.development .env
nano .env  # Edit with your dev server settings

# 5. Build application
npm run build

# 6. Install PM2 globally
sudo npm install -g pm2

# 7. Start with PM2
pm2 start ecosystem.config.js --env development
pm2 save
pm2 startup  # Follow the instructions to enable auto-start
```

### 4. Nginx Configuration (Optional)

Create `/etc/nginx/sites-available/foodxchange-backend`:

```nginx
server {
    listen 80;
    server_name dev-api.foodxchange.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/foodxchange-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL Setup (Recommended)

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d dev-api.foodxchange.com
```

## 📊 Monitoring & Management

### PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs foodxchange-backend-dev

# Restart application
pm2 restart foodxchange-backend-dev

# Stop application
pm2 stop foodxchange-backend-dev

# Monitor resources
pm2 monit
```

### Health Checks

```bash
# Check API health
curl http://localhost:5001/health

# Check MongoDB
mongo --eval "db.adminCommand('ping')"

# Check Redis
redis-cli ping
```

### Log Files

- Application logs: `/var/www/foodxchange-backend/logs/`
- PM2 logs: `~/.pm2/logs/`
- Nginx logs: `/var/log/nginx/`

## 🔧 Environment Variables

Key environment variables for development:

```bash
# Core Settings
NODE_ENV=development
PORT=5001

# Database
MONGODB_URI=mongodb://localhost:27017/foodxchange_dev
REDIS_URL=redis://localhost:6379

# Security (Generate new values)
JWT_SECRET=<generate-32-char-secret>
JWT_REFRESH_SECRET=<generate-32-char-secret>

# Features
ENABLE_SWAGGER=true
ENABLE_GRAPHQL_PLAYGROUND=true
LOG_LEVEL=debug
```

## 🚨 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port
   sudo lsof -i :5001
   
   # Kill process
   sudo kill -9 <PID>
   ```

2. **MongoDB Connection Failed**
   ```bash
   # Check MongoDB status
   sudo systemctl status mongod
   
   # Restart MongoDB
   sudo systemctl restart mongod
   ```

3. **PM2 Process Not Starting**
   ```bash
   # Check PM2 logs
   pm2 logs --lines 100
   
   # Clear PM2
   pm2 delete all
   pm2 start ecosystem.config.js --env development
   ```

4. **Permission Issues**
   ```bash
   # Fix permissions
   sudo chown -R $USER:$USER /var/www/foodxchange-backend
   ```

## 🔄 Updates & Maintenance

### Update Application

```bash
# Pull latest changes
git pull origin develop

# Install new dependencies
npm ci

# Rebuild
npm run build

# Restart PM2
pm2 reload foodxchange-backend-dev
```

### Database Backup

```bash
# Backup MongoDB
mongodump --db foodxchange_dev --out ./backups/$(date +%Y%m%d)

# Backup Redis
redis-cli --rdb ./backups/redis-$(date +%Y%m%d).rdb
```

## 📱 Mobile App Configuration

For mobile app development, update the API endpoint:

```javascript
// In your mobile app config
const API_URL = 'https://dev-api.foodxchange.com/api';
const WS_URL = 'wss://dev-api.foodxchange.com';
```

## 🔐 Security Checklist

- [ ] Change all default passwords
- [ ] Enable firewall (ufw)
- [ ] Configure fail2ban
- [ ] Set up SSL certificate
- [ ] Restrict MongoDB access
- [ ] Configure Redis password
- [ ] Set up regular backups
- [ ] Monitor server resources

## 📞 Support

For issues or questions:
1. Check PM2 logs: `pm2 logs`
2. Check application logs: `tail -f logs/error.log`
3. Review this guide
4. Contact the development team