let supabase = null;

try {
  supabase = require('../config/database');
} catch (e) {
  // Supabase not configured locally
}

// Memoria local de sincronización
const FALLBACK_SYNC = new Map();

function sanitizeUserString(str = '') {
  return String(str || '')
    .replace(/Jes\uFFFD+s/gi, 'Jesús')
    .replace(/Jes[ï¿½\?]+s/gi, 'Jesús')
    .replace(/Jes\u00EF\u00BF\u00BDs/gi, 'Jesús');
}

async function getClientWorkspace(clientId) {
  const cleanId = String(clientId || '').toLowerCase().trim();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('workspace_sync')
        .select('*')
        .eq('client_id', cleanId)
        .maybeSingle();

      if (!error && data) {
        return {
          clientId: data.client_id,
          payload: data.payload,
          lastModifiedBy: sanitizeUserString(data.last_modified_by),
          lastModifiedEmail: data.last_modified_email,
          activityLog: Array.isArray(data.activity_log) ? data.activity_log : [],
          updatedAt: data.updated_at
        };
      }
    } catch (e) {
      console.warn('[sync.service] Read fallback:', e.message);
    }
  }

  if (FALLBACK_SYNC.has(cleanId)) {
    const item = FALLBACK_SYNC.get(cleanId);
    return {
      ...item,
      lastModifiedBy: sanitizeUserString(item.lastModifiedBy)
    };
  }

  return null;
}

async function getAllWorkspaces() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('workspace_sync')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((d) => ({
          clientId: d.client_id,
          payload: d.payload,
          lastModifiedBy: sanitizeUserString(d.last_modified_by),
          lastModifiedEmail: d.last_modified_email,
          activityLog: Array.isArray(d.activity_log) ? d.activity_log : [],
          updatedAt: d.updated_at
        }));
      }
    } catch (e) {
      console.warn('[sync.service] GetAll fallback:', e.message);
    }
  }

  return Array.from(FALLBACK_SYNC.values());
}

async function saveClientWorkspace(clientId, payload, user = {}, details = {}) {
  const cleanId = String(clientId || '').toLowerCase().trim();
  const now = new Date().toISOString();
  const userName = sanitizeUserString(user.name || user.email || 'Jesús');
  const userEmail = user.email || '';

  // Obtener log existente
  const existing = await getClientWorkspace(cleanId);
  const currentLogs = existing?.activityLog || [];

  const newLogEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: now,
    user: userName,
    email: userEmail,
    action: details.action || 'Cambios guardados',
    summary: details.summary ? sanitizeUserString(details.summary) : 'Actualización de tareas y tablero'
  };

  // Mantener los últimos 50 eventos de actividad
  const updatedLogs = [newLogEntry, ...currentLogs].slice(0, 50);

  const row = {
    client_id: cleanId,
    payload: payload || {},
    last_modified_by: userName,
    last_modified_email: userEmail,
    activity_log: updatedLogs,
    updated_at: now
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('workspace_sync')
        .upsert(row, { onConflict: 'client_id' })
        .select()
        .single();

      if (!error && data) {
        const record = {
          clientId: data.client_id,
          payload: data.payload,
          lastModifiedBy: sanitizeUserString(data.last_modified_by),
          lastModifiedEmail: data.last_modified_email,
          activityLog: data.activity_log,
          updatedAt: data.updated_at
        };
        FALLBACK_SYNC.set(cleanId, record);
        return record;
      } else if (error) {
        console.warn('[sync.service] Supabase upsert notice:', error.message);
      }
    } catch (e) {
      console.warn('[sync.service] Write fallback:', e.message);
    }
  }

  const record = {
    clientId: cleanId,
    payload: payload || {},
    lastModifiedBy: userName,
    lastModifiedEmail: userEmail,
    activityLog: updatedLogs,
    updatedAt: now
  };

  FALLBACK_SYNC.set(cleanId, record);
  return record;
}

module.exports = {
  getClientWorkspace,
  getAllWorkspaces,
  saveClientWorkspace
};
