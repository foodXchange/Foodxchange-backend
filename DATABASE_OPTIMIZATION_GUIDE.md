# MongoDB Connection Optimization Guide

## Overview

This guide documents the comprehensive MongoDB connection optimization implementation for the FoodXchange backend. The optimization includes advanced connection pooling, retry logic, monitoring, and environment-specific configurations.

## Features

### 🚀 Enhanced Connection Management
- **Connection Pooling**: Optimized pool sizes for different environments
- **Retry Logic**: Exponential backoff with jitter for connection failures
- **Health Monitoring**: Real-time connection health checks and metrics
- **Graceful Shutdown**: Proper cleanup and connection closure

### 📊 Monitoring & Diagnostics
- **Real-time Metrics**: Connection pool utilization, active operations
- **Performance Monitoring**: Query execution times, slow query detection
- **Health Checks**: Automated health status reporting
- **Diagnostics**: Comprehensive connection diagnostics

### ⚙️ Environment-Specific Configuration
- **Development**: Optimized for debugging with query profiling
- **Staging**: Production-like settings with enhanced monitoring
- **Production**: High-performance, secure configuration
- **Testing**: Fast, lightweight settings for CI/CD

## Configuration

### Environment Variables

The following environment variables can be configured in your `.env` file:

#### Connection Pool Settings
```env
DB_MAX_POOL_SIZE=10               # Maximum connections in pool
DB_MIN_POOL_SIZE=2                # Minimum connections in pool
DB_MAX_IDLE_TIME=10000            # Max idle time (ms)
DB_WAIT_QUEUE_TIMEOUT=5000        # Wait queue timeout (ms)
```

#### Connection Settings
```env
DB_SERVER_SELECTION_TIMEOUT=5000  # Server selection timeout (ms)
DB_SOCKET_TIMEOUT=45000           # Socket timeout (ms)
DB_CONNECT_TIMEOUT=10000          # Connection timeout (ms)
DB_HEARTBEAT_FREQUENCY=10000      # Heartbeat frequency (ms)
DB_HEARTBEAT_THRESHOLD=30000      # Heartbeat threshold (ms)
```

#### Write/Read Settings
```env
DB_WRITE_CONCERN=majority         # Write concern level
DB_WRITE_TIMEOUT=2500             # Write timeout (ms)
DB_JOURNAL=true                   # Enable journaling
DB_READ_PREFERENCE=primaryPreferred  # Read preference
DB_READ_CONCERN_LEVEL=majority    # Read concern level
DB_MAX_STALENESS_SECONDS=90       # Max staleness for secondary reads
```

#### Retry Settings
```env
DB_RETRY_WRITES=true              # Enable write retries
DB_RETRY_READS=true               # Enable read retries
DB_MAX_RETRIES=5                  # Maximum retry attempts
DB_RETRY_DELAY=5000               # Initial retry delay (ms)
DB_BACKOFF_MULTIPLIER=1.5         # Backoff multiplier
DB_MAX_RETRY_DELAY=30000          # Maximum retry delay (ms)
```

#### Monitoring Settings
```env
DB_MONITOR_COMMANDS=true          # Enable command monitoring
DB_MONITORING_INTERVAL=60000      # Performance monitoring interval (ms)
DB_CONNECTION_MONITOR_INTERVAL=30000  # Connection monitoring interval (ms)
DB_HEALTH_CHECK_INTERVAL=60000    # Health check interval (ms)
DB_SLOW_QUERY_THRESHOLD=100       # Slow query threshold (ms)
DB_ENABLE_DIAGNOSTICS=true        # Enable diagnostic features
DB_ENABLE_PROFILING=true          # Enable query profiling
DB_PROFILE_LEVEL=100              # Profiling level (0-2)
```

#### Compression Settings
```env
DB_COMPRESSORS=zlib,snappy        # Compression algorithms
DB_ZLIB_COMPRESSION_LEVEL=4       # Zlib compression level (1-9)
```

#### Security Settings (Production)
```env
DB_TLS=true                       # Enable TLS/SSL
DB_TLS_INSECURE=false             # Allow insecure TLS
DB_TLS_ALLOW_INVALID_CERTS=false  # Allow invalid certificates
DB_TLS_ALLOW_INVALID_HOSTNAMES=false  # Allow invalid hostnames
DB_AUTH_SOURCE=admin              # Authentication database
```

#### Advanced Settings
```env
DB_DIRECT_CONNECTION=false        # Use direct connection
DB_SERVER_API_VERSION=1           # MongoDB Server API version
DB_SHUTDOWN_TIMEOUT=30000         # Graceful shutdown timeout (ms)
```

## Environment-Specific Configurations

### Development
- **Pool Size**: 10 max, 2 min connections
- **Monitoring**: Full query profiling and debugging enabled
- **Indexes**: Auto-creation enabled
- **Compression**: Basic zlib compression
- **Security**: TLS disabled for local development

### Production
- **Pool Size**: 50 max, 10 min connections
- **Monitoring**: Minimal profiling, performance-focused
- **Indexes**: Manual index management
- **Compression**: Optimized snappy and zlib compression
- **Security**: Full TLS encryption enabled

### Testing
- **Pool Size**: 5 max, 1 min connections
- **Monitoring**: Disabled for speed
- **Timeouts**: Reduced for faster test execution
- **Compression**: Disabled for simplicity

## API Endpoints

The optimization includes comprehensive API endpoints for monitoring:

### Health Check Endpoints

#### Simple Health Check
```http
GET /api/database/health/simple
```
Returns basic health status for load balancers.

#### Detailed Health Status
```http
GET /api/database/health
```
Returns comprehensive health information including:
- Connection status and metrics
- Pool utilization
- Performance history
- Active alerts

### Monitoring Endpoints

#### Connection Pool Statistics
```http
GET /api/database/pool
```
Returns real-time connection pool statistics.

#### Performance Metrics
```http
GET /api/database/performance?hours=1
```
Returns performance history and metrics.

#### Diagnostics
```http
GET /api/database/diagnostics
```
Runs comprehensive connection diagnostics.

### Configuration Endpoints

#### Current Configuration
```http
GET /api/database/config
```
Returns current configuration and validation results.

#### Reload Configuration
```http
POST /api/database/config/reload
```
Reloads configuration from environment variables.

### Management Endpoints

#### Database Optimization
```http
POST /api/database/optimize
```
Triggers manual database optimization.

#### Query Statistics
```http
GET /api/database/queries
GET /api/database/queries?collection=users
```
Returns query performance statistics.

#### Index Analysis
```http
GET /api/database/indexes
```
Returns index usage analysis and recommendations.

#### Migration Management
```http
GET /api/database/migrations
POST /api/database/migrations/run
```
Manage database migrations.

## Usage Examples

### Basic Usage
```typescript
import { databaseManager } from './src/config/database';

// Connect to database
await databaseManager.connect();

// Check connection status
const isConnected = databaseManager.isConnectionActive();

// Get health status
const health = await databaseManager.getHealthStatus();

// Disconnect gracefully
await databaseManager.disconnect();
```

### Configuration Management
```typescript
import { databaseConfigManager } from './src/config/database-config';

// Get environment-specific configuration
const config = databaseConfigManager.getConfigForEnvironment('production');

// Validate configuration
const validation = databaseConfigManager.validateConfiguration(config);

// Get configuration summary
const summary = databaseConfigManager.getEnvironmentSummary();
```

### Connection Monitoring
```typescript
import { 
  getConnectionPoolStats, 
  getConnectionHealth,
  runConnectionDiagnostics 
} from './src/config/database-optimization';

// Get pool statistics
const poolStats = getConnectionPoolStats();

// Check connection health
const health = getConnectionHealth();

// Run diagnostics
const diagnostics = await runConnectionDiagnostics();
```

## Performance Optimizations

### Connection Pooling
- **Development**: Small pool for resource efficiency
- **Production**: Large pool for high concurrency
- **Automatic scaling**: Pool size adjusts based on load

### Query Optimization
- **Slow query detection**: Configurable thresholds
- **Query profiling**: Environment-specific profiling levels
- **Index monitoring**: Automatic index usage analysis

### Compression
- **Development**: Basic compression for debugging
- **Production**: High-performance compression algorithms
- **Bandwidth savings**: Significant reduction in network traffic

### Retry Logic
- **Exponential backoff**: Prevents thundering herd problems
- **Jitter**: Randomization to spread retry attempts
- **Circuit breaker**: Prevents cascading failures

## Monitoring and Alerting

### Built-in Alerts
- **Connection failures**: Automatic alert generation
- **Pool exhaustion**: Warning when pool is fully utilized
- **Slow queries**: Alerts for queries exceeding thresholds
- **Heartbeat failures**: Monitoring of database connectivity

### Metrics Collection
- **Connection metrics**: Pool utilization, active connections
- **Performance metrics**: Query execution times, throughput
- **Health metrics**: Uptime, error rates, response times

### Integration
- **Logging**: Structured logging with correlation IDs
- **Metrics export**: Compatible with Prometheus/Grafana
- **Alerting**: Integration with notification services

## Best Practices

### Development
1. Enable query profiling for debugging
2. Use smaller connection pools
3. Monitor slow queries actively
4. Test with realistic data volumes

### Production
1. Disable auto-indexing
2. Use optimized compression settings
3. Enable TLS encryption
4. Monitor connection pool utilization
5. Set up automated alerting
6. Regular health check monitoring

### Security
1. Always use TLS in production
2. Implement proper authentication
3. Restrict database access
4. Monitor for suspicious queries
5. Regular security audits

## Troubleshooting

### Common Issues

#### Connection Pool Exhaustion
```
Error: Connection pool exhausted
```
**Solution**: Increase `DB_MAX_POOL_SIZE` or optimize query performance.

#### Slow Queries
```
Warning: Slow query detected (>100ms)
```
**Solution**: Add appropriate indexes or optimize query structure.

#### Connection Timeouts
```
Error: Server selection timeout
```
**Solution**: Check network connectivity and increase timeout values.

#### Heartbeat Failures
```
Warning: Database heartbeat unhealthy
```
**Solution**: Check database server status and network stability.

### Diagnostic Tools

#### Health Check
```bash
curl http://localhost:5000/api/database/health/simple
```

#### Connection Diagnostics
```bash
curl http://localhost:5000/api/database/diagnostics
```

#### Performance Analysis
```bash
curl http://localhost:5000/api/database/performance
```

## Migration Guide

### Upgrading from Basic Configuration

1. **Update Environment Variables**: Add new MongoDB configuration variables
2. **Update Code**: Replace basic connection logic with optimized manager
3. **Test Configuration**: Validate configuration in development
4. **Monitor Performance**: Use new monitoring endpoints
5. **Gradual Rollout**: Deploy to staging before production

### Configuration Migration
```typescript
// Old configuration
await mongoose.connect(uri, basicOptions);

// New optimized configuration
import { databaseManager } from './config/database';
await databaseManager.connect();
```

## Contributing

When contributing to the database optimization features:

1. **Test thoroughly**: Verify changes in all environments
2. **Update documentation**: Keep this guide current
3. **Monitor impact**: Check performance metrics
4. **Security review**: Ensure security best practices
5. **Backward compatibility**: Maintain existing functionality

## Support

For issues related to the MongoDB optimization:

1. Check the health endpoints for diagnostics
2. Review application logs for error details
3. Validate environment configuration
4. Test with simplified configuration
5. Consult MongoDB documentation for advanced features

---

This optimization provides a robust, scalable, and maintainable MongoDB connection layer for the FoodXchange backend application.