# Redis Fallback for Development

## Overview

The FoodXchange backend now includes a Redis fallback mechanism that allows the application to run in development environments without requiring a Redis server. When Redis is unavailable, the system automatically switches to an in-memory mock implementation.

## How It Works

### Automatic Detection
- In development mode (`NODE_ENV=development`), if Redis connection fails, the system automatically switches to a mock implementation
- The mock provides all essential Redis operations using an in-memory Map
- Rate limiting falls back to in-memory storage when Redis is unavailable

### Manual Configuration
You can force the use of the mock implementation by setting:
```bash
DISABLE_REDIS=true
```

## Features Supported by Mock

The mock Redis implementation supports:
- Basic operations: `get`, `set`, `del`, `exists`
- TTL operations: `setex`, `expire`, `ttl`
- Counter operations: `incr`
- Key patterns: `keys`
- Multi operations: `mget`, `multi`, `pipeline`
- Info command (returns mock statistics)

## Testing the Fallback

Run the test script to verify the fallback mechanism:
```bash
npm run ts-node src/scripts/test-redis-fallback.ts
```

## Development Workflow

1. **With Redis running**: The application uses the real Redis server
2. **Without Redis**: The application automatically uses the mock implementation
3. **Force mock**: Set `DISABLE_REDIS=true` in your `.env` file

## Important Notes

- The mock implementation is **only for development**
- Data is stored in-memory and will be lost when the server restarts
- Rate limiting uses in-memory storage when Redis is unavailable
- Some advanced Redis features may not be available in the mock

## Configuration

In your `.env.development` file:
```env
# Redis Configuration
# Note: In development, if Redis is not available, the app will use an in-memory mock
# Set DISABLE_REDIS=true to force using the mock implementation
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
# DISABLE_REDIS=true
```

## Logs

When using the mock implementation, you'll see these log messages:
- `Redis is disabled or not configured for development. Using in-memory mock.`
- `Using in-memory rate limiting (Redis mock detected)`

## Production

**Important**: The fallback mechanism is disabled in production. The application will fail to start if Redis is not available in production environments.