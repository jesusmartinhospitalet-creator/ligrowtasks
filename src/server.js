require('dotenv').config();
const path = require('path');

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth.routes');
const clientRoutes = require('./routes/clients.routes');
const taskRoutes = require('./routes/tasks.routes');
const templateRoutes = require('./routes/templates.routes');
const monthRoutes = require('./routes/months.routes');

const app = express();

console.log('[boot] DATABASE_URL present:', !!process.env.DATABASE_URL);

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (local dev; in production Lambda serves them via express.static)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ app: 'Ligrow Tasks API', status: 'running', db: !!process.env.DATABASE_URL });
});

// Temporary one-shot seed endpoint — protected by token; remove after first use
app.get('/api/seed', async (req, res) => {
  const SEED_TOKEN = process.env.SEED_TOKEN || 'ligrow-seed-2026';
  if (req.query.token !== SEED_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const fs = require('fs');
  const pool = require('./config/database');
  const sqlPath = path.join(__dirname, '..', 'database', 'seed.sql');
  let sql;
  try {
    sql = fs.readFileSync(sqlPath, 'utf8');
  } catch (e) {
    return res.status(500).json({ error: 'seed.sql not found', detail: e.message });
  }
  try {
    await pool.query(sql);
    return res.json({ ok: true, message: '✓ Seed completado: 3 clientes, 9 plantillas, 6 meses y 27 tareas insertados' });
  } catch (e) {
    return res.status(500).json({ error: 'Seed failed', detail: e.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/months', monthRoutes);

app.get('*', (req, res, next) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => {
    if (err) next(err);
  });
});

// Global error handler — ensures no unhandled error crashes the Lambda
app.use((err, req, res, _next) => {
  console.error('[express error]', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Ligrow Tasks API running on port ${PORT}`));
}
