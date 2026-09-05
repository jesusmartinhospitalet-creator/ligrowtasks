const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());

// Preload HTML, CSS, JS in memory
let html = '';
let css = '';
let js = '';

try { html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8'); } catch (_e) {
  try { html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8'); } catch (_e2) {}
}
try { css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf-8'); } catch (_e) {
  try { css = fs.readFileSync(path.join(process.cwd(), 'styles.css'), 'utf-8'); } catch (_e2) {}
}
try { js = fs.readFileSync(path.join(__dirname, '../public/app-v3.js'), 'utf-8'); } catch (_e) {
  try { js = fs.readFileSync(path.join(process.cwd(), 'app-v3.js'), 'utf-8'); } catch (_e2) {}
}

// Safely require routes if available
let authRoutes, clientRoutes, taskRoutes, templateRoutes, monthRoutes, commentRoutes;
try {
  authRoutes = require('../src/routes/auth.routes');
  clientRoutes = require('../src/routes/clients.routes');
  taskRoutes = require('../src/routes/tasks.routes');
  templateRoutes = require('../src/routes/templates.routes');
  monthRoutes = require('../src/routes/months.routes');
  commentRoutes = require('../src/routes/comments.routes');
} catch (err) {
  console.warn('[Vercel Route Loading Warning]:', err.message);
}

app.get('/styles.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.send(css || '/* CSS */');
});

app.get(['/app-v3.js', '/dashboard-v3.js', '/ligrow-hub-v3.js', '/public/app-v3.js'], (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(js || 'console.log("App bundle");');
});

app.get(['/api/health', '/health'], (req, res) => {
  res.json({ app: 'Ligrow Tasks API', status: 'running', db: !!process.env.DATABASE_URL });
});

if (authRoutes) app.use('/api/auth', authRoutes);
if (clientRoutes) app.use('/api/clients', clientRoutes);
if (taskRoutes) app.use('/api/tasks', taskRoutes);
if (templateRoutes) app.use('/api/templates', templateRoutes);
if (monthRoutes) app.use('/api/months', monthRoutes);
if (commentRoutes) app.use('/api/comments', commentRoutes);

app.get('*', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (html) return res.send(html);
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Ligrow Tasks · Personal & Project Hub</title><link rel="stylesheet" href="/styles.css?v=3.2"/></head><body><div id="app"></div><script src="/app-v3.js?v=20.0"></script></body></html>`);
});

app.use((err, req, res, _next) => {
  console.error('[express error]', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

module.exports = app;
