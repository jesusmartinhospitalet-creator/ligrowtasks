const { Pool } = require('pg');
const memoryStore = require('./mock-db');
const fallback = require('./database-fallback');

let pool;

if (process.env.DATABASE_URL) {
  if (!global._pgPool) {
    global._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    global._pgPool.on('error', (err) => {
      console.error('[pg pool error]', err.message);
    });
  }
  pool = global._pgPool;
} else {
  console.log('[db] DATABASE_URL missing, using in-memory store fallback');
  pool = {
    query: async (text, params = []) => {
      return fallback.query(text, params, memoryStore);
    },
    on: () => {}
  };
}

module.exports = pool;
