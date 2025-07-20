import { Logger } from '../core/logging/logger';
import { CacheService } from '../infrastructure/cache/CacheService';

const logger = new Logger('Redis Test');

async function testRedis() {
  try {
    const cache = cacheService;

    // Wait a bit for Redis to connect
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test setting a value
    logger.info('Testing Redis set operation...');
    const testKey = 'foodxchange:test:connection';
    const testValue = { status: 'FoodXchange Redis Connected', timestamp: new Date().toISOString() };

    const setResult = await cache.set(testKey, testValue, 60);
    logger.info('Set result:', { setResult });

    // Test getting the value
    logger.info('Testing Redis get operation...');
    const getValue = await cache.get(testKey);
    logger.info('Get result:', { getValue });

    // Test cache statistics
    const stats = cache.getStats();
    logger.info('Cache statistics:', stats);

    // Test health check
    const health = await cache.healthCheck();
    logger.info('Cache health check:', health);

    // Cleanup
    await cache.delete(testKey);
    logger.info('Test key deleted');

    process.exit(0);
  } catch (error) {
    logger.error('Redis test failed:', error);
    process.exit(1);
  }
}

testRedis();
