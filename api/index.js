'use strict';

const express = require('express');
const cors = require('cors');

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

app.get(['/api/health', '/health'], (req, res) => {
  res.json({ app: 'Ligrow Tasks API', status: 'running', db: !!process.env.DATABASE_URL });
});

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/months', monthRoutes);
app.use('/api/comments', commentRoutes);

app.get('*', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ligrow Tasks · Personal & Project Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=13.0" />
</head>
<body>
  <div id="app"></div>
  <script src="/ligrow-hub-v3.js?v=13.0"></script>
</body>
</html>`);
});

module.exports = app;
