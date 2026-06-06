require('dotenv').config();
const path = require('path');

process.on('uncaughtException', (err) => console.error('uncaughtException', err));
process.on('unhandledRejection', (r) => console.error('unhandledRejection', r));

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth.routes');
const clientRoutes = require('./routes/clients.routes');
const taskRoutes = require('./routes/tasks.routes');
const templateRoutes = require('./routes/templates.routes');
const monthRoutes = require('./routes/months.routes');

const app = express();

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (local dev; in production Vercel CDN handles this)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ app: 'Ligrow Tasks API', status: 'running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/months', monthRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Always export app for Lambda / require() usage
module.exports = app;

// Only start HTTP server when run directly (local dev)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Ligrow Tasks API running on port ${PORT}`));
}
