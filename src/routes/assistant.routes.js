const express = require('express');
const { requireAppSession } = require('../middleware/session-auth.middleware');
const { handleAssistantRequest, getAssistantStatus } = require('../services/assistant.service');

const router = express.Router();

// Solo usuarios con sesión pueden usar el asistente: cada mensaje cuesta dinero.
router.use(requireAppSession);

router.get('/status', (req, res) => {
  const { configured, risks } = getAssistantStatus();
  res.json({ configured, risks });
});

router.post('/', async (req, res, next) => {
  try {
    await handleAssistantRequest(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
