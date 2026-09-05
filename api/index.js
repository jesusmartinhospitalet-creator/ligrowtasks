'use strict';

let app;
let bootError;

try {
  app = require('../src/server');
} catch (err) {
  bootError = err;
  console.error('[boot error]', err);
}

module.exports = (req, res) => {
  if (bootError || !app) {
    return res.status(500).json({
      error: 'Server Boot Error on Vercel',
      message: bootError ? bootError.message : 'App not initialized',
      stack: bootError ? bootError.stack : null
    });
  }

  try {
    return app(req, res);
  } catch (err) {
    return res.status(500).json({
      error: 'Request Execution Error',
      message: err.message,
      stack: err.stack
    });
  }
};
