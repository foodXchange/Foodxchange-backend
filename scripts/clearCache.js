// scripts/clearCache.js
require('dotenv').config();
const redis = require('../src/config/redis');

async function clearCache() {
  try {
    const keys = await redis.keys('search:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Cleared ${keys.length} cached search results`);
    } else {
      console.log('No cached results to clear');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Cache clear failed:', error.message);
    process.exit(1);
  }
}

clearCache();
