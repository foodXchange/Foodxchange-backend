# Redis Setup for Windows

## Option 1: Using WSL2 (Recommended)

### Install WSL2 and Ubuntu
```powershell
# In PowerShell as Administrator
wsl --install

# Restart your computer, then:
wsl --install -d Ubuntu
```

### Install Redis in WSL2
```bash
# In WSL2 Ubuntu terminal
sudo apt update
sudo apt install redis-server

# Start Redis
sudo service redis-server start

# Test Redis
redis-cli ping
# Should return: PONG
```

### Configure Redis for Development
```bash
# Edit Redis config
sudo nano /etc/redis/redis.conf

# Change these settings:
# bind 127.0.0.1 ::1
# protected-mode yes
# port 6379

# Restart Redis
sudo service redis-server restart
```

## Option 2: Using Docker (Alternative)

### Install Docker Desktop
1. Download from: https://www.docker.com/products/docker-desktop/
2. Install and restart

### Run Redis Container
```powershell
# Run Redis with persistence
docker run -d `
  --name foodxchange-redis `
  -p 6379:6379 `
  -v redis-data:/data `
  redis:7-alpine `
  redis-server --appendonly yes

# Check if running
docker ps

# View logs
docker logs foodxchange-redis
```

## Option 3: Windows Native (Not Recommended)

### Using Memurai (Redis for Windows)
1. Download from: https://www.memurai.com/get-memurai
2. Install as Windows Service
3. Default port: 6379

## Enable Redis in Application

Update your `.env` file:
```env
# Enable caching
ENABLE_CACHING=true

# Redis configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
```

## Test Redis Connection

Create `test-redis.js`:
```javascript
const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

async function testRedis() {
  try {
    await redis.set('test', 'Hello Redis!');
    const value = await redis.get('test');
    console.log('Redis test:', value);
    
    await redis.del('test');
    console.log('Redis is working!');
    
    redis.disconnect();
  } catch (error) {
    console.error('Redis error:', error);
  }
}

testRedis();
```

Run test:
```bash
node test-redis.js
```

## Redis GUI Tools

1. **RedisInsight** (Official)
   - Download: https://redis.io/insight/
   - Free and feature-rich

2. **Another Redis Desktop Manager**
   - Download: https://github.com/qishibo/AnotherRedisDesktopManager
   - Open source

## Common Redis Commands

```bash
# Connect to Redis CLI
redis-cli

# Basic commands
SET key "value"
GET key
DEL key
EXISTS key
KEYS *
FLUSHALL  # Clear all data

# Check info
INFO
PING
```

## Production Considerations

1. **Security**
   - Set a strong password
   - Use SSL/TLS
   - Limit network access

2. **Persistence**
   - Enable AOF (Append Only File)
   - Configure RDB snapshots
   - Regular backups

3. **Memory Management**
   - Set maxmemory limit
   - Configure eviction policy
   - Monitor memory usage

4. **High Availability**
   - Use Redis Sentinel
   - Set up replication
   - Consider Redis Cluster

## Troubleshooting

### Connection Refused
```bash
# Check if Redis is running
ps aux | grep redis

# Start Redis
sudo service redis-server start  # WSL2
docker start foodxchange-redis   # Docker
```

### Permission Denied
```bash
# Fix permissions
sudo chown redis:redis /var/lib/redis
sudo chmod 755 /var/lib/redis
```

### Port Already in Use
```bash
# Find process using port 6379
netstat -ano | findstr :6379

# Kill process (use PID from above)
taskkill /PID <PID> /F
```