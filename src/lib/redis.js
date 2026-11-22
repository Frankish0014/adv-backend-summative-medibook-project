require('dotenv').config();
const Redis = require('ioredis');

const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

function createClient(extra = {}) {
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    ...extra,
  });
  client.on('error', (err) => console.error('[redis]', err.message));
  return client;
}

// Shared client used by the web server for short commands (LPUSH, RPUSH, LRANGE ...).
const redis = createClient();

module.exports = { redis, createClient };
