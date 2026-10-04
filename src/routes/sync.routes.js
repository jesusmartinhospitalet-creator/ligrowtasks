const express = require('express');
const router = express.Router();

const syncService = require('../services/sync.service');
const { getSessionUser } = require('../middleware/session-auth.middleware');

function cleanUtf8(str = '') {
  return String(str || '')
    .replace(/Jes\uFFFD+s/gi, 'Jesús')
    .replace(/Jes[ï¿½\?]+s/gi, 'Jesús')
    .replace(/Jes\u00EF\u00BF\u00BDs/gi, 'Jesús');
}

// 1. Obtener datos sincronizados de un cliente (permitido para lectura multi-dispositivo)
router.get('/client/:clientId', async (req, res) => {
  const { clientId } = req.params;
  try {
    const workspace = await syncService.getClientWorkspace(clientId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ success: true, workspace });
  } catch (err) {
    console.error('[sync.routes] Error fetching workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Guardar cambios en un cliente (Kanban, tareas, checklist, recordatorios, recursos)
router.post('/client/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { payload, details, user: bodyUser } = req.body || {};

  const sessionUser = getSessionUser(req);
  const rawName = bodyUser?.name || details?.userName || sessionUser?.name || req.headers['x-user-name'] || 'Jesús';
  const rawEmail = bodyUser?.email || details?.userEmail || sessionUser?.email || req.headers['x-user-email'] || 'jesus.martin.hospitalet@gmail.com';

  const user = {
    name: cleanUtf8(rawName),
    email: rawEmail,
    role: sessionUser?.role || 'admin'
  };

  try {
    const record = await syncService.saveClientWorkspace(clientId, payload, user, details);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ success: true, record });
  } catch (err) {
    console.error('[sync.routes] Error saving workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Obtener todos los espacios
router.get('/all', async (req, res) => {
  try {
    const workspaces = await syncService.getAllWorkspaces();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ success: true, workspaces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
