# Docker & Redis Setup Guide for FoodXchange

## Quick Start (Recommended)

Run this single command to start everything:

```powershell
.\quick-start.ps1
```

For production mode:
```powershell
.\quick-start.ps1 -Mode prod
```

## System Requirements

- Windows 10/11 Pro, Enterprise, or Education
- Virtualization enabled in BIOS (Intel VT-x or AMD-V)
- Docker Desktop installed
- At least 8GB RAM (16GB recommended)
- 20GB free disk space

## Setup Steps

### 1. Check System Requirements

First, verify virtualization is enabled:
```powershell
wmic path win32_processor get VirtualizationFirmwareEnabled
```

If it shows `FALSE`, you MUST enable virtualization in BIOS first.

### 2. Optimize System (Run as Administrator)

```powershell
.\optimize-system.ps1
```

This script will:
- Enable required Windows features (Hyper-V, WSL2)
- Configure Docker for optimal performance
- Set up Redis with persistence and optimization
- Configure firewall rules
- Create health check scripts

### 3. Start Services

After system restart, use the quick-start script:
```powershell
.\quick-start.ps1
```

Or manually:
```powershell
# Development
docker-compose -f docker-compose.dev.yml up

# Production (optimized)
docker-compose -f docker-compose.optimized.yml up
```

### 4. Health Monitoring

Check service health anytime:
```powershell
.\check-health.ps1
```

## Configuration Files

### Docker Optimization
- `.docker/daemon.json` - Docker daemon settings
- `.wslconfig` - WSL2 memory limits (4GB RAM, 2GB Swap)
- `docker-compose.optimized.yml` - Production-ready compose file

### Redis Optimization
- `docker/redis/redis.conf` - Custom Redis configuration
  - 512MB memory limit
  - LRU eviction policy
  - Persistence enabled (RDB + AOF)
  - Optimized for performance

## Resource Limits

### Development Mode
- Backend: 0.5-1 CPU, 512MB-1GB RAM
- MongoDB: 0.25-1 CPU, 512MB-1GB RAM
- Redis: 0.1-0.5 CPU, 256MB-512MB RAM

### Production Mode
- Backend: 0.5-2 CPU, 512MB-1GB RAM
- MongoDB: 0.25-1 CPU, 512MB-1GB RAM
- Redis: 0.1-0.5 CPU, 256MB-512MB RAM
- Nginx: 0.1-0.5 CPU, 128MB-256MB RAM

## Troubleshooting

### Docker Desktop Won't Start
1. Ensure virtualization is enabled in BIOS
2. Run `.\optimize-system.ps1` as Administrator
3. Restart computer
4. Check `fix-docker-desktop.md` for detailed fixes

### Redis Connection Issues
```powershell
# Test Redis directly
docker exec foodxchange-redis redis-cli ping
```

### MongoDB Connection Issues
```powershell
# Test MongoDB directly
docker exec foodxchange-mongo mongosh --eval "db.adminCommand('ping')"
```

### Port Conflicts
Check if ports are in use:
```powershell
netstat -an | findstr "5000 6379 27017"
```

## Useful Commands

### View Logs
```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f redis
```

### Restart Services
```powershell
docker-compose restart
```

### Stop Everything
```powershell
docker-compose down
```

### Clean Up
```powershell
# Remove containers and networks
docker-compose down

# Remove everything including volumes
docker-compose down -v
```

## Performance Tips

1. **Use WSL2** - Better performance than Hyper-V backend
2. **Limit memory** - Configured via `.wslconfig`
3. **Use volumes** - Better performance than bind mounts
4. **Enable BuildKit** - Faster builds (already configured)

## Security Notes

- Change default passwords in production
- Use environment variables for secrets
- Enable firewall rules (done by optimization script)
- Regular backups of data volumes

## Data Persistence

Data is stored in:
- `./data/mongo/` - MongoDB data
- `./data/redis/` - Redis persistence files
- `./logs/` - Application logs
- `./uploads/` - User uploads

Back up these directories regularly in production.