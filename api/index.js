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

module.exports = app;
