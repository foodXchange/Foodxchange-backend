import Redis from 'ioredis';

async function testRedisConnection() {
  console.log('Testing Redis connection...');

  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3
  });

  redis.on('connect', () => {
    console.log('✅ Redis connected successfully!');
  });

  redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
  });

  try {
    // Test ping
    const pingResult = await redis.ping();
    console.log('✅ Redis PING:', pingResult);

    // Test set
    await redis.set('foodxchange:test', JSON.stringify({
      status: 'FoodXchange Redis Working!',
      timestamp: new Date().toISOString()
    }));
    console.log('✅ Redis SET successful');

    // Test get
    const value = await redis.get('foodxchange:test');
    console.log('✅ Redis GET:', JSON.parse(value));

    // Cleanup
    await redis.del('foodxchange:test');
    console.log('✅ Test key deleted');

    // Close connection
    redis.disconnect();
    console.log('\n🎉 Redis is working correctly with FoodXchange!');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Redis test failed:', error.message);
    redis.disconnect();
    process.exit(1);
  }
}

testRedisConnection();
