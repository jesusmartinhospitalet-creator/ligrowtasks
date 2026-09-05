const memoryStore = require('./mock-db');
const fallback = require('./database-fallback');

let realPool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    realPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
    });
    realPool.on('error', (err) => console.error('[pg pool error]', err.message));
  } catch (e) {
    console.error('[pg init error]', e.message);
  }
}

const pool = {
  query: async (text, params = []) => {
    if (realPool) {
      try {
        const res = await realPool.query(text, params);
        return res;
      } catch (err) {
        console.warn('[DB query failed, using in-memory store fallback]:', err.message);
      }
    }
    return fallback.query(text, params, memoryStore);
  },
  on: () => {}
};

module.exports = pool;
