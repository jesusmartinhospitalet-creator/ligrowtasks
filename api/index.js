const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('../src/routes/auth.routes');
const clientRoutes = require('../src/routes/clients.routes');
const taskRoutes = require('../src/routes/tasks.routes');
const templateRoutes = require('../src/routes/templates.routes');
const monthRoutes = require('../src/routes/months.routes');
const commentRoutes = require('../src/routes/comments.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, '..', 'public');

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
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(fs.readFileSync(indexPath, 'utf-8'));
  }
  const rootIndexPath = path.join(__dirname, '..', 'index.html');
  if (fs.existsSync(rootIndexPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(fs.readFileSync(rootIndexPath, 'utf-8'));
  }
  res.status(404).send('Index not found');
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[express error]', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

module.exports = app;
