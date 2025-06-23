require('dotenv').config();
const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  family: 4
});

redis.on('connect', () => console.log('Redis connected!'));
redis.on('error', (err) => console.error('Redis error:', err));

async function test() {
  try {
    await redis.set('test', 'Hello Redis!');
    const value = await redis.get('test');
    console.log('Redis test value:', value);
    await redis.del('test');
    console.log('Test complete!');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
