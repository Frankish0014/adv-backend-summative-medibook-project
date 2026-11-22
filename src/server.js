require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/db');
const { redis } = require('./lib/redis');

const port = Number(process.env.PORT || 3000);

async function start() {
  await pool.query('SELECT 1'); // fail fast if MySQL is unreachable
  try {
    await redis.connect();
  } catch (err) {
    // Booking still works without Redis; queue features degrade (see README).
    console.error('[redis] not reachable at start-up:', err.message);
  }
  const server = app.listen(port, () => console.log(`MediBook API listening on http://localhost:${port}`));

  const shutdown = () => server.close(async () => {
    await pool.end();
    redis.disconnect();
    process.exit(0);
  });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => { console.error('Failed to start:', err.message); process.exit(1); });
