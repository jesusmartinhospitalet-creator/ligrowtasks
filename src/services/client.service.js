const { randomUUID: uuidv4 } = require('crypto');
const pool = require('../config/database');

function normalizeClientCode(code = '', clientName = '') {
  const source = String(code || clientName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return (source.substring(0, 6) || 'CLI');
}

async function listClients() {
  const { rows } = await pool.query(
    `SELECT
      id AS "clientId",
      name AS "clientName",
      code AS "clientCode",
      concept,
      summary,
      kickoff_date AS "kickoffDate",
      COALESCE(category, 'personal') AS "category",
      COALESCE(status, 'activo') AS "status",
      COALESCE(color_accent, '#6366f1') AS "colorAccent",
      COALESCE(progress_pct, 0) AS "progressPct",
      ext_json AS "extJson",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
     FROM clients
     ORDER BY name ASC`
  );

  return rows;
}

async function createClient(payload) {
  const now = new Date();
  const clientId = uuidv4();
  const clientName = String(payload.clientName || '').trim();

  if (!clientName) {
    throw new Error('El nombre del cliente/proyecto es obligatorio.');
  }

  const clientCode = normalizeClientCode(payload.clientCode, clientName);
  const concept = payload.concept || '';
  const summary = payload.summary || '';
  const kickoffDate = payload.kickoffDate || null;
  const category = payload.category || 'personal';
  const status = payload.status || 'activo';
  const colorAccent = payload.colorAccent || '#6366f1';
  const progressPct = parseInt(payload.progressPct, 10) || 0;
  const extJson = payload.extJson || '{}';

  await pool.query(
    `INSERT INTO clients (
      id, name, code, concept, summary, kickoff_date, category, status, color_accent, progress_pct, ext_json, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [clientId, clientName, clientCode, concept, summary, kickoffDate, category, status, colorAccent, progressPct, extJson, now, now]
  );

  return { clientId, clientName, clientCode, concept, summary, kickoffDate, category, status, colorAccent, progressPct, extJson, createdAt: now, updatedAt: now };
}

async function updateClient(clientId, payload) {
  const now = new Date();
  const clientName = String(payload.clientName || '').trim();

  if (!clientName) {
    throw new Error('El nombre del cliente/proyecto es obligatorio.');
  }

  const clientCode = normalizeClientCode(payload.clientCode, clientName);
  const concept = payload.concept || '';
  const summary = payload.summary || '';
  const kickoffDate = payload.kickoffDate || null;
  const category = payload.category || 'personal';
  const status = payload.status || 'activo';
  const colorAccent = payload.colorAccent || '#6366f1';
  const progressPct = parseInt(payload.progressPct, 10) || 0;
  const extJson = payload.extJson || '{}';

  const result = await pool.query(
    `UPDATE clients
     SET name = $1, code = $2, concept = $3, summary = $4, kickoff_date = $5, category = $6, status = $7, color_accent = $8, progress_pct = $9, ext_json = $10, updated_at = $11
     WHERE id = $12`,
    [clientName, clientCode, concept, summary, kickoffDate, category, status, colorAccent, progressPct, extJson, now, clientId]
  );

  if (!result.rowCount) {
    throw new Error('Proyecto no encontrado.');
  }

  return { clientId, clientName, clientCode, concept, summary, kickoffDate, category, status, colorAccent, progressPct, extJson, updatedAt: now };
}

async function deleteClient(clientId) {
  await pool.query('DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE client_id = $1)', [clientId]);
  await pool.query('DELETE FROM tasks WHERE client_id = $1', [clientId]);
  await pool.query('DELETE FROM templates WHERE client_id = $1', [clientId]);
  await pool.query('DELETE FROM client_months WHERE client_id = $1', [clientId]);
  const result = await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);

  if (!result.rowCount) {
    throw new Error('Cliente no encontrado.');
  }

  return { ok: true };
}

module.exports = { listClients, createClient, updateClient, deleteClient };
