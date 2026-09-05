const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let html = '';
let css = '';
let js = '';

function loadStatic() {
  const dirs = [
    path.join(__dirname, '..'),
    path.join(__dirname, '../public'),
    process.cwd(),
    path.join(process.cwd(), 'public')
  ];
  for (const d of dirs) {
    if (!html && fs.existsSync(path.join(d, 'index.html'))) {
      try { html = fs.readFileSync(path.join(d, 'index.html'), 'utf-8'); } catch (_e) {}
    }
    if (!css && fs.existsSync(path.join(d, 'styles.css'))) {
      try { css = fs.readFileSync(path.join(d, 'styles.css'), 'utf-8'); } catch (_e) {}
    }
    if (!js && fs.existsSync(path.join(d, 'app-v3.js'))) {
      try { js = fs.readFileSync(path.join(d, 'app-v3.js'), 'utf-8'); } catch (_e) {}
    }
  }
}
loadStatic();

app.get('/styles.css', (req, res) => {
  if (!css) loadStatic();
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.send(css || '/* CSS */');
});

app.get(['/app-v3.js', '/dashboard-v3.js', '/ligrow-hub-v3.js', '/public/app-v3.js'], (req, res) => {
  if (!js) loadStatic();
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(js || 'console.log("App script");');
});

app.get(['/api/health', '/health'], (req, res) => {
  res.json({ app: 'Ligrow Tasks API', status: 'running', db: !!process.env.DATABASE_URL });
});

try {
  const authRoutes = require('../src/routes/auth.routes');
  const clientRoutes = require('../src/routes/clients.routes');
  const taskRoutes = require('../src/routes/tasks.routes');
  const templateRoutes = require('../src/routes/templates.routes');
  const monthRoutes = require('../src/routes/months.routes');
  const commentRoutes = require('../src/routes/comments.routes');

  app.use('/api/auth', authRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/months', monthRoutes);
  app.use('/api/comments', commentRoutes);
} catch (err) {
  console.warn('[Vercel Route Loading Warning]:', err.message);
}

app.get('*', (req, res) => {
  if (!html) loadStatic();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (html) return res.send(html);
  res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ligrow Tasks · Personal & Project Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=3.2" />
</head>
<body>
  <div id="app"></div>
  <script src="/app-v3.js?v=20.0"></script>
</body>
</html>`);
});

app.use((err, req, res, _next) => {
  console.error('[express error]', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

module.exports = app;
