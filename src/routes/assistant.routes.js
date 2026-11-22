const express = require('express');
const { requireAppSession } = require('../middleware/session-auth.middleware');
const { handleAssistantRequest, getAssistantStatus } = require('../services/assistant.service');
const { getLinkPreview } = require('../services/link-preview.service');

const router = express.Router();

// Solo usuarios con sesión pueden usar el asistente: cada mensaje cuesta dinero.
router.use(requireAppSession);

router.get('/status', (req, res) => {
  const { configured, risks } = getAssistantStatus();
  res.json({ configured, risks });
});

// Vista previa de la página de un producto (título, imagen, precio) para los pedidos a proveedores.
const previewHits = new Map();
router.get('/link-preview', async (req, res) => {
  const key = (req.sessionUser && (req.sessionUser.email || req.sessionUser.userId)) || 'anon';
  const now = Date.now();
  const recent = (previewHits.get(key) || []).filter((t) => now - t < 5 * 60_000);
  if (recent.length >= 30) return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' });
  previewHits.set(key, [...recent, now]);
  try {
    res.json({ preview: await getLinkPreview(req.query.url) });
  } catch (error) {
    res.status(422).json({ error: error.message || 'No se ha podido leer la página.' });
  }
});

router.post('/', async (req, res, next) => {
  try {
    await handleAssistantRequest(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
