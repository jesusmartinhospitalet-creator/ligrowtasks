const express = require('express');
const router = express.Router();

const { verifyPassword } = require('../utils/hash.utils');
const env = require('../config/env');
const { COOKIE_NAME, SESSION_DURATION_MS, createSessionToken } = require('../middleware/session-auth.middleware');

router.post('/login', async (req, res) => {

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const valid = await verifyPassword(password, env.appPasswordHash);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  res.cookie(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DURATION_MS,
    path: '/'
  });

  res.json({ success: true });

});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.status(204).end();
});

module.exports = router;
