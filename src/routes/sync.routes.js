const express = require('express');
const router = express.Router();

const syncService = require('../services/sync.service');
const { requireAppSession } = require('../middleware/session-auth.middleware');

function canAccessClient(sessionUser, clientId) {
  if (!sessionUser) return false;
  if (sessionUser.role === 'admin') return true;
  if (String(clientId).toLowerCase() === 'pv' || String(clientId).toLowerCase() === 'proveedor') return true;
  const allowed = Array.isArray(sessionUser.allowedClients) ? sessionUser.allowedClients : [];
  if (allowed.includes('*')) return true;
  return allowed.map(x => String(x).toLowerCase()).includes(String(clientId).toLowerCase());
}

// 1. Obtener datos sincronizados de un cliente
router.get('/client/:clientId', requireAppSession, async (req, res) => {
  const { clientId } = req.params;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (!canAccessClient(req.sessionUser, clientId)) {
    return res.status(403).json({ error: 'No tienes permisos para ver este espacio de cliente.' });
  }

  try {
    const workspace = await syncService.getClientWorkspace(clientId);
    res.json({ success: true, workspace });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Guardar cambios en un cliente (Kanban, tareas, checklist, recordatorios)
router.post('/client/:clientId', requireAppSession, async (req, res) => {
  const { clientId } = req.params;
  const { payload, details } = req.body;

  if (!canAccessClient(req.sessionUser, clientId)) {
    return res.status(403).json({ error: 'No tienes permisos para modificar este espacio de cliente.' });
  }

  try {
    const record = await syncService.saveClientWorkspace(clientId, payload, req.sessionUser, details);
    res.json({ success: true, record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Obtener todos los espacios (para admin o sincronización global)
router.get('/all', requireAppSession, async (req, res) => {
  try {
    const all = await syncService.getAllWorkspaces();
    // Filtrar según permisos del usuario si no es admin
    const filtered = req.sessionUser.role === 'admin'
      ? all
      : all.filter(w => canAccessClient(req.sessionUser, w.clientId));

    res.json({ success: true, workspaces: filtered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
