import path from 'path';

import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.development') });

// Set NODE_ENV to development to test fallback
process.env.NODE_ENV = 'development';

import { redisClient, cacheService } from '../config/redis';
import { Logger } from '../core/logging/logger';

const logger = new Logger('TestRedisFallback');

async function testRedisConnection() {
  logger.info('Testing Redis connection and fallback mechanism...');

  try {
    // Test 1: Basic ping
    logger.info('Test 1: Ping');
    const pong = await redisClient.ping();
    logger.info(`Ping result: ${pong}`);

    // Test 2: Set and get
    logger.info('Test 2: Set and Get');
    await redisClient.set('test:key', 'test value');
    const value = await redisClient.get('test:key');
    logger.info(`Get result: ${value}`);

    // Test 3: Cache service
    logger.info('Test 3: Cache Service');
    await cacheService.set('cache:test', { data: 'test data' }, 60);
    const cachedValue = await cacheService.get('cache:test');
    logger.info(`Cache result: ${JSON.stringify(cachedValue)}`);

    // Test 4: TTL
    logger.info('Test 4: TTL');
    const ttl = await redisClient.ttl('cache:test');
    logger.info(`TTL result: ${ttl} seconds`);

    // Test 5: Keys pattern
    logger.info('Test 5: Keys pattern');
    const keys = await redisClient.keys('test:*');
    logger.info(`Keys found: ${keys.join(', ')}`);

    // Test 6: Delete
    logger.info('Test 6: Delete');
    const deleted = await redisClient.del('test:key');
    logger.info(`Deleted: ${deleted} key(s)`);

    // Test 7: Increment
    logger.info('Test 7: Increment');
    const count = await redisClient.incr('counter:test');
    logger.info(`Counter value: ${count}`);

    // Check Redis status
    logger.info(`Redis client status: ${redisClient.status || 'ready (mock)'}`);

    logger.info('All tests completed successfully!');

  } catch (error) {
    logger.error('Test failed:', error);
  } finally {
    // Clean up
    try {
      await redisClient.del('test:key', 'cache:test', 'counter:test');
    } catch (e) {
      // Ignore cleanup errors
    }

    // Close connection if it's a real Redis client
    if (redisClient.quit && typeof redisClient.quit === 'function') {
      await redisClient.quit();
    }

    process.exit(0);
  }
}

// Run tests
testRedisConnection();
