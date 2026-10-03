let supabase = null;

try {
  supabase = require('../config/database');
} catch (e) {
  // Supabase not configured locally
}

// Memoria local de sincronización
const FALLBACK_SYNC = new Map();

async function getClientWorkspace(clientId) {
  const cleanId = String(clientId || '').toLowerCase().trim();

  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
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
          lastModifiedBy: data.last_modified_by,
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
    return FALLBACK_SYNC.get(cleanId);
  }

  return null;
}

async function getAllWorkspaces() {
  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { data, error } = await supabase
        .from('workspace_sync')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((d) => ({
          clientId: d.client_id,
          payload: d.payload,
          lastModifiedBy: d.last_modified_by,
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
  const userName = user.name || user.email || 'Usuario';
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
    summary: details.summary || 'Actualización de tareas y tablero'
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

  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { data, error } = await supabase
        .from('workspace_sync')
        .upsert(row, { onConflict: 'client_id' })
        .select()
        .single();

      if (!error && data) {
        return {
          clientId: data.client_id,
          payload: data.payload,
          lastModifiedBy: data.last_modified_by,
          lastModifiedEmail: data.last_modified_email,
          activityLog: data.activity_log,
          updatedAt: data.updated_at
        };
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
