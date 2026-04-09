const express = require('express');
const router = express.Router();

const { verifyPassword } = require('../utils/hash.utils');
const env = require('../config/env');

router.post('/login', async (req, res) => {

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const valid = await verifyPassword(password, env.appPasswordHash);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  res.json({
    success: true
  });

});

module.exports = router;
