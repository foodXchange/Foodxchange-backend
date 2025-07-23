# FoodXchange Backend - Comprehensive Troubleshooting Guide

This guide covers all common and advanced troubleshooting scenarios for the FoodXchange Backend platform.

## Table of Contents

1. [Server Startup Issues](#server-startup-issues)
2. [Docker Issues](#docker-issues)
3. [Redis Issues](#redis-issues)
4. [MongoDB Issues](#mongodb-issues)
5. [Common Error Messages](#common-error-messages)
6. [Development Environment Issues](#development-environment-issues)
7. [Production Deployment Problems](#production-deployment-problems)
8. [Performance Issues](#performance-issues)
9. [Security Issues](#security-issues)
10. [API Issues](#api-issues)
11. [WebSocket Issues](#websocket-issues)
12. [Integration Issues](#integration-issues)

## Server Startup Issues

### Server Won't Start

#### Symptom: "Cannot find module" errors

```bash
Error: Cannot find module './core/integration/ArchitectureIntegrator'
```

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# If TypeScript issues persist
npm run build
```

#### Symptom: "Port already in use"

```bash
Error: listen EADDRINUSE: address already in use :::5000
```

**Solution:**
```bash
# Find process using port
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :5000
kill -9 <PID>

# Or change port in .env
PORT=5001
```

#### Symptom: "ECONNREFUSED" on startup

**Solution:**
```bash
# Check if required services are running
docker-compose ps

# Start services if needed
docker-compose up -d mongo redis

# Or run without external dependencies
npm run dev:standalone
```

### TypeScript Compilation Errors

#### Symptom: "Type 'X' is not assignable to type 'Y'"

**Solution:**
```bash
# Clean build
npm run clean
npm run build

# Check TypeScript version
npm list typescript

# Update if needed
npm install typescript@latest
```

## Docker Issues

### Docker Desktop Not Starting (Windows)

#### Symptom: Docker Desktop hangs or crashes

**Solution:**
```powershell
# Run as Administrator
# Reset Docker Desktop
Stop-Service docker
Remove-Item "$env:APPDATA\Docker" -Recurse -Force
Remove-Item "$env:LOCALAPPDATA\Docker" -Recurse -Force

# Enable virtualization
.\enable-virtualization.ps1

# Restart Docker Desktop
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

#### Symptom: WSL 2 issues

**Solution:**
```powershell
# Update WSL
wsl --update

# Set default version
wsl --set-default-version 2

# Reset WSL
wsl --shutdown
wsl --unregister docker-desktop
wsl --unregister docker-desktop-data
```

### Docker Compose Issues

#### Symptom: "Cannot connect to Docker daemon"

**Solution:**
```bash
# Check Docker service
sudo systemctl status docker

# Start if needed
sudo systemctl start docker

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

#### Symptom: "No space left on device"

**Solution:**
```bash
# Clean Docker system
docker system prune -a --volumes

# Check disk space
df -h

# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune
```

### Container Build Failures

#### Symptom: "npm ERR! code ELIFECYCLE"

**Solution:**
```dockerfile
# Update Dockerfile to include build tools
RUN apk add --no-cache python3 make g++ \
    && npm install \
    && apk del python3 make g++
```

#### Symptom: ARM64/M1 Mac issues

**Solution:**
```yaml
# docker-compose.yml - specify platform
services:
  mongo:
    image: mongo:7.0
    platform: linux/amd64  # or linux/arm64
```

## Redis Issues

### Connection Issues

#### Symptom: "Redis connection to localhost:6379 failed"

**Solution:**
```bash
# Check if Redis is running
docker-compose ps redis

# Test connection
docker exec -it foodxchange-redis redis-cli ping

# Check Redis logs
docker logs foodxchange-redis

# Restart Redis
docker-compose restart redis
```

#### Symptom: "MISCONF Redis is configured to save RDB snapshots"

**Solution:**
```bash
# Connect to Redis
docker exec -it foodxchange-redis redis-cli

# Disable persistence temporarily
CONFIG SET stop-writes-on-bgsave-error no

# Or fix permissions
docker exec -it foodxchange-redis chown redis:redis /data
```

### Memory Issues

#### Symptom: "OOM command not allowed when used memory > 'maxmemory'"

**Solution:**
```bash
# Increase memory limit
docker exec -it foodxchange-redis redis-cli CONFIG SET maxmemory 512mb

# Set eviction policy
docker exec -it foodxchange-redis redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Or update docker-compose.yml
command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### Performance Issues

#### Symptom: Slow Redis operations

**Solution:**
```bash
# Monitor Redis
docker exec -it foodxchange-redis redis-cli MONITOR

# Check slow log
docker exec -it foodxchange-redis redis-cli SLOWLOG GET 10

# Optimize persistence
docker exec -it foodxchange-redis redis-cli CONFIG SET save ""
```

## MongoDB Issues

### Authentication Failures

#### Symptom: "MongoServerError: Authentication failed"

**Solution:**
```bash
# Check connection string
MONGODB_URI=mongodb://admin:password@localhost:27017/foodxchange?authSource=admin

# Create user if missing
docker exec -it foodxchange-mongo mongosh

use admin
db.createUser({
  user: "admin",
  pwd: "password",
  roles: ["root"]
})

use foodxchange
db.createUser({
  user: "foodxchange",
  pwd: "password",
  roles: ["readWrite"]
})
```

### Connection Issues

#### Symptom: "MongoNetworkError: connect ECONNREFUSED"

**Solution:**
```bash
# Check MongoDB status
docker-compose ps mongo
docker logs foodxchange-mongo

# Test connection
docker exec -it foodxchange-mongo mongosh --eval "db.adminCommand('ping')"

# Check firewall
sudo ufw allow 27017
```

### Performance Issues

#### Symptom: Slow queries

**Solution:**
```javascript
// Add indexes via mongosh
docker exec -it foodxchange-mongo mongosh foodxchange

// Check slow queries
db.setProfilingLevel(1, { slowms: 100 })
db.system.profile.find().limit(5).sort({ millis: -1 })

// Add indexes
db.products.createIndex({ name: "text", description: "text" })
db.products.createIndex({ category: 1, createdAt: -1 })
db.rfqs.createIndex({ status: 1, dueDate: 1 })
```

### Disk Space Issues

#### Symptom: "not enough disk space"

**Solution:**
```bash
# Check disk usage
docker exec -it foodxchange-mongo df -h

# Compact database
docker exec -it foodxchange-mongo mongosh foodxchange --eval "db.runCommand({ compact: 'products' })"

# Remove old data
docker exec -it foodxchange-mongo mongosh foodxchange --eval "db.logs.deleteMany({ createdAt: { \$lt: new Date(Date.now() - 30*24*60*60*1000) } })"
```

## Common Error Messages

### "Cannot read property 'x' of undefined"

**Cause:** Null reference error, usually missing data

**Solution:**
```javascript
// Add null checks
if (user && user.profile && user.profile.email) {
  // Safe to use user.profile.email
}

// Or use optional chaining
const email = user?.profile?.email || 'default@example.com';
```

### "JWT malformed"

**Cause:** Invalid JWT token format

**Solution:**
```bash
# Check JWT_SECRET in .env
JWT_SECRET=your-secret-key-here

# Verify token format
# Should be: Bearer eyJhbGciOiJIUzI1NiIs...
```

### "PayloadTooLargeError"

**Cause:** Request body exceeds limit

**Solution:**
```javascript
// Increase limit in server.ts
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
```

### "CORS error"

**Cause:** Cross-origin request blocked

**Solution:**
```javascript
// Update CORS config
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
```

## Development Environment Issues

### Node.js Version Issues

#### Symptom: "The engine 'node' is incompatible"

**Solution:**
```bash
# Check Node version
node --version

# Install correct version with nvm
nvm install 18
nvm use 18

# Or update .nvmrc
echo "18" > .nvmrc
```

### TypeScript Issues

#### Symptom: "Cannot use import statement outside a module"

**Solution:**
```json
// Update tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "esModuleInterop": true,
    "target": "ES2022"
  }
}
```

### Environment Variable Issues

#### Symptom: Environment variables not loading

**Solution:**
```bash
# Check .env file location
ls -la .env

# Load manually if needed
node -r dotenv/config dist/server-new.js

# Debug env vars
console.log('ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
```

## Production Deployment Problems

### Memory Leaks

#### Symptom: Increasing memory usage over time

**Solution:**
```javascript
// Add memory monitoring
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory Usage:', {
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`
  });
}, 60000);

// Fix common leaks
// 1. Clear intervals/timeouts
// 2. Remove event listeners
// 3. Close database connections
// 4. Limit cache sizes
```

### High CPU Usage

#### Symptom: CPU at 100%

**Solution:**
```bash
# Profile application
node --prof dist/server-new.js

# Analyze profile
node --prof-process isolate-*.log > profile.txt

# Common fixes:
# 1. Add indexes to database
# 2. Implement caching
# 3. Optimize algorithms
# 4. Use worker threads
```

### SSL/TLS Issues

#### Symptom: "SSL certificate problem"

**Solution:**
```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    ssl_certificate /etc/ssl/certs/foodxchange.crt;
    ssl_certificate_key /etc/ssl/private/foodxchange.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
}
```

## Performance Issues

### Slow API Responses

**Diagnosis:**
```javascript
// Add response time logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${duration}ms`);
  });
  next();
});
```

**Solutions:**
1. Enable caching
2. Add database indexes
3. Implement pagination
4. Use query optimization
5. Add Redis caching layer

### Database Query Optimization

```javascript
// Slow query
const products = await Product.find({
  category: 'beverages',
  isActive: true
}).populate('supplier').populate('reviews');

// Optimized query
const products = await Product.find({
  category: 'beverages',
  isActive: true
})
.select('name price description')
.populate('supplier', 'name email')
.lean()
.limit(50);
```

## Security Issues

### Authentication Failures

#### Symptom: "Invalid token" errors

**Solution:**
```javascript
// Verify JWT configuration
const token = jwt.sign(
  { userId: user._id },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

// Check token in requests
const authHeader = req.headers.authorization;
const token = authHeader && authHeader.split(' ')[1];
```

### Rate Limiting Issues

#### Symptom: "Too many requests" errors

**Solution:**
```javascript
// Adjust rate limits
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // increase limit
  skipSuccessfulRequests: true
});
```

## API Issues

### Request Validation Errors

#### Symptom: "Validation failed"

**Solution:**
```javascript
// Add detailed error messages
const validation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
];
```

### File Upload Issues

#### Symptom: "Multer error"

**Solution:**
```javascript
// Configure multer properly
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});
```

## WebSocket Issues

### Connection Failures

#### Symptom: "WebSocket connection failed"

**Solution:**
```javascript
// Check CORS for WebSocket
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});
```

### Event Not Received

#### Symptom: Events not reaching clients

**Solution:**
```javascript
// Ensure proper room joining
socket.join(`rfq-${rfqId}`);

// Emit to room
io.to(`rfq-${rfqId}`).emit('rfq_update', data);

// Debug connections
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);
  console.log('Rooms:', socket.rooms);
});
```

## Integration Issues

### Azure Service Issues

#### Symptom: "Azure authentication failed"

**Solution:**
```bash
# Check Azure credentials
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=your-tenant-id

# Test connection
az login --service-principal \
  -u $AZURE_CLIENT_ID \
  -p $AZURE_CLIENT_SECRET \
  --tenant $AZURE_TENANT_ID
```

### Email Service Issues

#### Symptom: "Failed to send email"

**Solution:**
```javascript
// Check SMTP configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test email
transporter.verify((error, success) => {
  if (error) console.error('SMTP Error:', error);
  else console.log('SMTP Ready');
});
```

## Quick Debugging Commands

```bash
# Check all services
docker-compose ps

# View logs
docker-compose logs -f foodxchange-backend

# Test database connection
docker exec -it foodxchange-mongo mongosh --eval "db.adminCommand('ping')"

# Test Redis connection
docker exec -it foodxchange-redis redis-cli ping

# Check disk space
df -h

# Check memory usage
free -m

# Check port usage
netstat -tlnp

# Test API endpoint
curl -X GET http://localhost:5000/health

# Monitor real-time logs
tail -f logs/app.log | grep ERROR
```

## Emergency Recovery

### Complete System Reset

```bash
# Stop all services
docker-compose down -v

# Clean everything
docker system prune -a --volumes
rm -rf node_modules dist logs

# Fresh start
npm install
docker-compose up -d
npm run dev
```

### Database Recovery

```bash
# Backup database
docker exec foodxchange-mongo mongodump --out /backup

# Restore database
docker exec foodxchange-mongo mongorestore /backup

# Export specific collection
docker exec foodxchange-mongo mongoexport \
  --collection=products \
  --out=/backup/products.json
```

## Getting Help

If you continue to experience issues:

1. Check the [GitHub Issues](https://github.com/foodxchange/backend/issues)
2. Join our [Discord Community](https://discord.gg/foodxchange)
3. Contact support: support@foodxchange.com
4. For critical issues: emergency@foodxchange.com

Remember to include:
- Error messages
- Log files
- Environment details
- Steps to reproduce

---

**Last Updated**: January 2025  
**Version**: 2.0.0