# Troubleshooting Guide

This comprehensive guide covers common issues and solutions for the FoodXchange Backend, including server, Docker, Redis, and MongoDB problems.

## Table of Contents
1. [Server Issues](#server-issues)
2. [Docker Issues](#docker-issues)
3. [Redis Issues](#redis-issues)
4. [MongoDB Issues](#mongodb-issues)
5. [Performance Issues](#performance-issues)
6. [Development Environment Issues](#development-environment-issues)
7. [Production Issues](#production-issues)
8. [Common Error Messages](#common-error-messages)

---

## Server Issues

### Server Won't Start

#### Symptom
```
Error: listen EADDRINUSE: address already in use :::5000
```

#### Solution
```bash
# Find process using port 5000
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :5000
kill -9 <PID>

# Or change port in .env
PORT=5001
```

### Node.js Memory Issues

#### Symptom
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

#### Solution
```bash
# Increase memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run dev

# Or in .env
NODE_OPTIONS=--max-old-space-size=4096

# For production
node --max-old-space-size=4096 dist/server.js
```

### TypeScript Compilation Errors

#### Symptom
```
TSError: ⨯ Unable to compile TypeScript
```

#### Solution
```bash
# Clear TypeScript cache
rm -rf node_modules/.cache
rm -rf dist

# Reinstall dependencies
npm ci

# Rebuild
npm run build
```

### Module Not Found Errors

#### Symptom
```
Error: Cannot find module 'express'
```

#### Solution
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

---

## Docker Issues

### Docker Desktop Not Starting (Windows)

#### Symptom
Docker Desktop fails to start or hangs on "Starting..."

#### Solution
```powershell
# Run as Administrator
# 1. Enable virtualization
.\enable-virtualization.ps1

# 2. Reset Docker Desktop
Stop-Service com.docker.service
Remove-Item "$env:APPDATA\Docker" -Recurse -Force
Remove-Item "$env:LOCALAPPDATA\Docker" -Recurse -Force

# 3. Restart Docker Desktop
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# 4. If still failing, reset WSL2
wsl --shutdown
wsl --unregister docker-desktop
wsl --unregister docker-desktop-data
```

### Docker Build Failures

#### Canvas Package Build Error
```
error /app/node_modules/canvas: Command failed
```

#### Solution
Update Dockerfile to include canvas dependencies:
```dockerfile
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    pkgconfig
```

### Docker Compose Connection Issues

#### Symptom
```
ERROR: for backend Cannot start service backend: driver failed programming external connectivity
```

#### Solution
```bash
# Stop all containers
docker-compose down

# Remove all containers
docker container prune -f

# Restart Docker
# Windows: Restart Docker Desktop
# Linux: sudo systemctl restart docker

# Start again
docker-compose up -d
```

### Docker Network Issues

#### Symptom
Services can't communicate with each other

#### Solution
```bash
# List networks
docker network ls

# Remove old network
docker network rm foodxchange-backend_foodxchange-network

# Recreate network
docker network create foodxchange-network

# Update docker-compose.yml to use external network
networks:
  foodxchange-network:
    external: true
```

---

## Redis Issues

### Redis Connection Refused

#### Symptom
```
[ioredis] Unhandled error event: Error: connect ECONNREFUSED 127.0.0.1:6379
```

#### Solution

1. **Check if Redis is running**
```bash
# Docker
docker ps | grep redis

# Local Redis (Windows)
redis-cli ping

# Start Redis if not running
docker-compose up -d redis
```

2. **Verify Redis configuration**
```bash
# Check Redis logs
docker logs foodxchange-redis

# Test connection
redis-cli -h localhost -p 6379 ping
```

3. **Use fallback mode**
```env
# In .env - disable Redis to use memory cache
DISABLE_REDIS=true
```

### Redis Memory Issues

#### Symptom
```
OOM command not allowed when used memory > 'maxmemory'
```

#### Solution
```bash
# Connect to Redis
redis-cli

# Check memory usage
INFO memory

# Clear cache
FLUSHDB

# Or increase memory limit in redis.conf
maxmemory 1gb
maxmemory-policy allkeys-lru
```

### Redis Persistence Issues

#### Symptom
Data lost after restart

#### Solution
```bash
# Enable AOF persistence
# In redis.conf or docker-compose.yml
appendonly yes
appendfsync everysec

# Check persistence files
docker exec foodxchange-redis ls /data

# Backup Redis data
docker exec foodxchange-redis redis-cli BGSAVE
```

---

## MongoDB Issues

### MongoDB Connection Failed

#### Symptom
```
MongoServerError: Authentication failed
MongoNetworkError: connect ECONNREFUSED 127.0.0.1:27017
```

#### Solution

1. **Check MongoDB is running**
```bash
# Docker
docker ps | grep mongo
docker logs foodxchange-mongo

# Start if not running
docker-compose up -d mongo
```

2. **Verify connection string**
```env
# For Docker
MONGODB_URI=mongodb://mongo:27017/foodxchange

# For local
MONGODB_URI=mongodb://localhost:27017/foodxchange

# With auth
MONGODB_URI=mongodb://admin:password@mongo:27017/foodxchange?authSource=admin
```

3. **Check MongoDB logs**
```bash
docker logs foodxchange-mongo

# Enter MongoDB shell
docker exec -it foodxchange-mongo mongosh
```

### MongoDB Performance Issues

#### Symptom
Slow queries, high CPU usage

#### Solution

1. **Check slow queries**
```javascript
// In MongoDB shell
db.setProfilingLevel(1, { slowms: 100 })
db.system.profile.find().limit(5).sort({ millis: -1 })
```

2. **Add indexes**
```javascript
// Check missing indexes
db.products.getIndexes()

// Add compound index
db.products.createIndex({ category: 1, status: 1, createdAt: -1 })
```

3. **Optimize connection pool**
```env
DB_POOL_SIZE=20
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10
```

### MongoDB Disk Space Issues

#### Symptom
```
MongoServerError: not enough disk space
```

#### Solution
```bash
# Check disk usage
docker exec foodxchange-mongo df -h

# Compact database
docker exec -it foodxchange-mongo mongosh
use foodxchange
db.runCommand({ compact: 'products' })

# Clean old data
db.products.deleteMany({ createdAt: { $lt: new Date(Date.now() - 90*24*60*60*1000) } })
```

---

## Performance Issues

### Slow API Response Times

#### Diagnosis
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:5000/api/health

# Monitor with logs
DEBUG=app:* npm run dev
```

#### Solutions

1. **Enable caching**
```env
ENABLE_CACHING=true
CACHE_TTL_DEFAULT=300
```

2. **Optimize database queries**
```typescript
// Use projection
await Product.find({}, 'name price status').limit(100)

// Use lean for read-only
await Product.find().lean()
```

3. **Enable compression**
```env
ENABLE_COMPRESSION=true
COMPRESSION_LEVEL=6
```

### High Memory Usage

#### Diagnosis
```bash
# Monitor memory
docker stats foodxchange-backend

# Node.js memory
node --trace-gc dist/server.js
```

#### Solutions
```javascript
// Fix memory leaks
// Clear intervals
const interval = setInterval(() => {}, 1000)
clearInterval(interval)

// Remove event listeners
emitter.removeAllListeners()

// Clear cache periodically
setInterval(() => {
  if (global.gc) {
    global.gc()
  }
}, 60000)
```

### High CPU Usage

#### Diagnosis
```bash
# Profile CPU
node --prof dist/server.js
node --prof-process isolate-*.log > profile.txt
```

#### Solutions
- Use worker threads for CPU-intensive tasks
- Implement request queuing
- Add rate limiting
- Use clustering

---

## Development Environment Issues

### Hot Reload Not Working

#### Solution
```bash
# Use tsx watch
npm run dev:tsx

# Or nodemon with ts-node
npm run dev:nodemon
```

### Port Already in Use

#### Solution
```bash
# Kill all Node processes
# Windows
taskkill /F /IM node.exe

# Linux/Mac
killall node
```

### Environment Variables Not Loading

#### Solution
```bash
# Check .env file exists
ls -la .env

# Copy from example
cp .env.example .env

# Verify loading
node -e "require('dotenv').config(); console.log(process.env.PORT)"
```

---

## Production Issues

### SSL/TLS Certificate Issues

#### Solution
```nginx
# In nginx.conf
ssl_certificate /etc/nginx/ssl/cert.pem;
ssl_certificate_key /etc/nginx/ssl/key.pem;
ssl_protocols TLSv1.2 TLSv1.3;
```

### Load Balancer Health Check Failures

#### Solution
```javascript
// Implement proper health check
app.get('/health', async (req, res) => {
  try {
    // Check dependencies
    await mongoose.connection.db.admin().ping()
    await redisClient.ping()
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    })
  }
})
```

### Graceful Shutdown Issues

#### Solution
```javascript
// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

async function gracefulShutdown() {
  console.log('Shutting down gracefully...')
  
  // Stop accepting new requests
  server.close(() => {
    console.log('HTTP server closed')
  })
  
  // Close database connections
  await mongoose.connection.close()
  await redisClient.quit()
  
  process.exit(0)
}
```

---

## Common Error Messages

### "Cannot find module" Errors
```bash
# Solution
npm rebuild
npm ci
```

### "ECONNREFUSED" Errors
- Check if services are running
- Verify connection strings
- Check firewall rules

### "ETIMEDOUT" Errors
- Increase timeout values
- Check network connectivity
- Verify service endpoints

### "EMFILE: too many open files"
```bash
# Increase ulimit
ulimit -n 4096

# Or in Docker
docker run --ulimit nofile=4096:4096 foodxchange-backend
```

---

## Quick Diagnostic Commands

```bash
# Check all services
docker-compose ps

# View all logs
docker-compose logs -f

# Check system resources
docker system df
docker stats

# Test endpoints
curl http://localhost:5000/health
curl http://localhost:5000/api/v1/products

# Database connections
docker exec -it foodxchange-mongo mongosh --eval "db.adminCommand('ping')"
docker exec -it foodxchange-redis redis-cli ping

# Clear everything and restart
docker-compose down -v
docker system prune -a
docker-compose up -d
```

---

## Getting Help

If you're still experiencing issues:

1. Check logs: `docker-compose logs -f <service>`
2. Enable debug mode: `DEBUG=* npm run dev`
3. Search [GitHub Issues](https://github.com/foodxchange/backend/issues)
4. Join our [Discord Community](https://discord.gg/foodxchange)
5. Contact support: support@foodxchange.com

Remember to include:
- Error messages
- Environment details
- Steps to reproduce
- Relevant logs