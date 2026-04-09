require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const authRoutes      = require('./routes/auth.routes');
const clientRoutes    = require('./routes/clients.routes');
const taskRoutes      = require('./routes/tasks.routes');
const templateRoutes  = require('./routes/templates.routes');
const monthRoutes     = require('./routes/months.routes');

const app = express();

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

// API routes
app.use('/api/auth',      authRoutes);
app.use('/api/clients',   clientRoutes);
app.use('/api/tasks',     taskRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/months',    monthRoutes);

app.get('/api', (req, res) => {
  res.json({ app: 'Ligrow Tasks API', status: 'running' });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Local dev: start server only when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Ligrow Tasks API running on port ${PORT}`);
  });
}

module.exports = app;
