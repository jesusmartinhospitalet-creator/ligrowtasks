const { Pool } = require('pg');

// Reuse pool across Lambda warm instances; prevent multiple pools on hot reloads
if (!global._pgPool) {
  global._pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  });
  // Without this listener an idle-client error crashes the process
  global._pgPool.on('error', (err) => {
    console.error('pg pool error:', err.message);
  });
}

module.exports = global._pgPool;
