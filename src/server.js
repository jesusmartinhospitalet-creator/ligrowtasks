try { require('dotenv').config(); } catch (_e) {}
const path = require('path');

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const clientRoutes = require('./routes/clients.routes');
const taskRoutes = require('./routes/tasks.routes');
const templateRoutes = require('./routes/templates.routes');
const monthRoutes = require('./routes/months.routes');
const commentRoutes = require('./routes/comments.routes');

const app = express();

console.log('[boot] DATABASE_URL present:', !!process.env.DATABASE_URL);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const fs = require('fs');

// Preload static assets into memory to guarantee zero-fail serving in Vercel Lambdas
function loadFileContent(filenames = []) {
  const dirs = [
    path.join(__dirname, '..'),
    path.join(__dirname, '../public'),
    process.cwd(),
    path.join(process.cwd(), 'public')
  ];
  for (const filename of filenames) {
    for (const dir of dirs) {
      const fullPath = path.join(dir, filename);
      if (fs.existsSync(fullPath)) {
        try {
          return fs.readFileSync(fullPath, 'utf-8');
        } catch (_e) {}
      }
    }
  }
  return '';
}

const MEM_STYLES = loadFileContent(['styles.css']);
const MEM_APP_JS = loadFileContent(['app-v3.js', 'dashboard-v3.js', 'ligrow-hub-v3.js']);
const MEM_INDEX_HTML = loadFileContent(['index.html']);

app.get('/styles.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.send(MEM_STYLES || '/* CSS */');
});

app.get(['/app-v3.js', '/dashboard-v3.js', '/ligrow-hub-v3.js', '/public/app-v3.js'], (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(MEM_APP_JS || 'console.log("bundle loaded");');
});

app.get(['/api/health', '/health'], (req, res) => {
  res.json({ app: 'Ligrow Tasks API', status: 'running', db: !!process.env.DATABASE_URL });
});

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/months', monthRoutes);
app.use('/api/comments', commentRoutes);

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.get('*', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (MEM_INDEX_HTML) {
    return res.send(MEM_INDEX_HTML);
  }
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

// Global error handler — ensures no unhandled error crashes the Lambda
app.use((err, req, res, _next) => {
  console.error('[express error]', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

module.exports = app;

if (require.main === module && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Ligrow Tasks API running on port ${PORT}`));
}
