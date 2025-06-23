// Export all configs from one place
const database = require('./db');
const elasticsearch = require('./elasticsearch');
const redis = require('./redis');

module.exports = {
  database,
  elasticsearch,
  redis
};