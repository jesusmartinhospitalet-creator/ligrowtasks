'use strict';

let app;
try {
  app = require('../src/server');
  console.log('[boot] server module loaded OK');
} catch (err) {
  console.error('[boot] FATAL: server module failed to load:', err);
  const express = require('express');
  app = express();
  app.use((_req, res) => res.status(500).json({ error: 'Server failed to initialize', detail: err.message }));
}

module.exports = app;
