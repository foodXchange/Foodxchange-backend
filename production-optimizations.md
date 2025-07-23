# Production Optimizations for FoodXchange Backend

## Overview
This document outlines the optimizations implemented for improving development server startup time and production deployment performance.

## 1. Docker Optimizations

### Multi-stage Build Optimization
- **Separate dependency installation**: Dependencies are cached in a separate stage
- **Build artifact optimization**: Source maps removed in production
- **Minimal production image**: Only necessary runtime dependencies included
- **Non-root user**: Enhanced security with dedicated nodejs user

### Container Resource Management
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '1'
      memory: 1G
```

### Health Checks
- All services have proper health checks
- Service dependencies ensure proper startup order
- Graceful startup with condition-based dependencies

## 2. Redis Optimizations

### Memory Management
- **Max memory**: Set to 512MB with LRU eviction policy
- **Lazy freeing**: Enabled for background deletion (better performance)
- **Threaded I/O**: Enabled with 4 threads for better throughput

### Persistence Optimization
- **RDB snapshots**: Less frequent saves for better performance
- **AOF**: Append-only file with everysec fsync
- **Compression**: Enabled for both RDB and AOF

### Performance Features
- **Active defragmentation**: Reduces memory fragmentation
- **Jemalloc background thread**: Better memory allocation
- **Client output buffer limits**: Prevents memory exhaustion

### Security Hardening
- Dangerous commands disabled (FLUSHDB, FLUSHALL, KEYS, CONFIG)
- Password authentication required
- Protected mode enabled

## 3. MongoDB Optimizations

### WiredTiger Configuration
```bash
--wiredTigerCacheSizeGB 1
--wiredTigerJournalCompressor zstd
--wiredTigerCollectionBlockCompressor zstd
--wiredTigerIndexPrefixCompression true
```

### Connection Pooling
- Pool size: 20 (default), max 50, min 10
- Optimized for concurrent connections

## 4. Application Optimizations

### Node.js Runtime
- **Memory allocation**: 2GB heap size (--max-old-space-size=2048)
- **Thread pool**: 16 threads (UV_THREADPOOL_SIZE=16)
- **Source maps**: Enabled for better debugging

### Caching Strategy
- **Multi-level caching**: L1 (in-memory), L2 (Redis), L3 (CDN/DB)
- **Compression**: Automatic for values > 1KB
- **Cache warming**: Background warming for frequently accessed data
- **Tag-based invalidation**: Efficient cache management

### Connection Management
- **Redis connection pooling**: Retry strategy with exponential backoff
- **MongoDB connection pooling**: Configurable pool sizes
- **Graceful degradation**: Fallback to in-memory cache if Redis unavailable

## 5. Nginx Optimizations

### Performance Tuning
- **Worker processes**: Auto-detected based on CPU cores
- **Worker connections**: 4096 per worker
- **Keepalive**: Enabled for backend connections
- **Gzip compression**: Enabled for text content

### Caching
- **Proxy cache**: 100MB cache zone for API responses
- **Cache validity**: 10 minutes for successful responses
- **Stale content**: Serves stale content during backend errors

### Rate Limiting
- **API endpoints**: 100 requests/second
- **Auth endpoints**: 5 requests/second
- **Connection limiting**: 100 concurrent connections per IP

## 6. Startup Performance

### Development Mode
1. **Lazy connections**: Redis connects on-demand
2. **Mock fallback**: In-memory cache if Redis unavailable
3. **Hot reloading**: Faster development iteration

### Production Mode
1. **Pre-built images**: Use Docker layer caching
2. **Health checks**: Ensure dependencies are ready
3. **Resource allocation**: Proper CPU and memory limits

## 7. Monitoring & Observability

### Metrics Collection
- Prometheus metrics endpoint
- Custom application metrics
- Resource usage tracking

### Health Monitoring
- Comprehensive health checks
- Dependency status monitoring
- Performance threshold alerts

## Usage

### Development
```powershell
# Quick start with optimizations
.\start-optimized.ps1 -Detached

# Build and start
.\start-optimized.ps1 -Build -Detached
```

### Production
```powershell
# Production deployment
.\start-optimized.ps1 -Production -Build -Detached

# Using docker-compose directly
docker-compose -f docker-compose.optimized.yml up -d
```

## Environment Variables

Key performance-related variables:
```env
# Node.js
NODE_OPTIONS=--max-old-space-size=2048
UV_THREADPOOL_SIZE=16

# Database
DB_POOL_SIZE=20
DB_MAX_POOL_SIZE=50
DB_MIN_POOL_SIZE=10

# Redis
REDIS_MAX_RETRIES=5
REDIS_ENABLE_OFFLINE_QUEUE=true
REDIS_CONNECT_TIMEOUT=10000

# Caching
CACHE_TTL_DEFAULT=300
CACHE_TTL_USER_SESSION=1800
CACHE_TTL_PRODUCT_DATA=3600
```

## Performance Benchmarks

Expected improvements:
- **Startup time**: 30-50% faster with optimized images
- **Memory usage**: 20-30% reduction with proper limits
- **Response time**: 40-60% improvement with caching
- **Throughput**: 2-3x increase with connection pooling

## Best Practices

1. **Regular monitoring**: Check Grafana dashboards
2. **Cache warming**: Pre-populate critical data
3. **Resource tuning**: Adjust based on actual usage
4. **Security updates**: Keep base images updated
5. **Load testing**: Validate performance under load