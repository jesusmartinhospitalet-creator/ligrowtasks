'use strict';

const app = require('../src/server');

module.exports = (req, res) => {
  try {
    return app(req, res);
  } catch (err) {
    console.error('[Vercel Lambda Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Serverless execution error', message: err.message });
    }
  }
};

