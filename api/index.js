'use strict';

module.exports = (req, res) => {
  try {
    const app = require('../src/server');
    return app(req, res);
  } catch (err) {
    console.error('[SERVERLESS BOOT ERROR]', err);
    res.status(500).json({
      error: 'Serverless initialization error',
      message: err.message,
      stack: err.stack
    });
  }
};



