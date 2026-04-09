const { v4: uuidv4 } = require('uuid');
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
  const [rows] = await pool.query(
    `SELECT
      id AS clientId,
      name AS clientName,
      code AS clientCode,
      concept,
      summary,
      kickoff_date AS kickoffDate,
      ext_json AS extJson,
      created_at AS createdAt,
      updated_at AS updatedAt
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
    throw new Error('El nombre del cliente es obligatorio.');
  }

  const clientCode = normalizeClientCode(payload.clientCode, clientName);
  const concept = payload.concept || '';
  const summary = payload.summary || '';
  const kickoffDate = payload.kickoffDate || null;
  const extJson = payload.extJson || '{}';

  await pool.query(
    `INSERT INTO clients (
      id, name, code, concept, summary, kickoff_date, ext_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [clientId, clientName, clientCode, concept, summary, kickoffDate, extJson, now, now]
  );

  return {
    clientId,
    clientName,
    clientCode,
    concept,
    summary,
    kickoffDate,
    extJson,
    createdAt: now,
    updatedAt: now
  };
}

async function updateClient(clientId, payload) {
  const now = new Date();
  const clientName = String(payload.clientName || '').trim();

  if (!clientName) {
    throw new Error('El nombre del cliente es obligatorio.');
  }

  const clientCode = normalizeClientCode(payload.clientCode, clientName);
  const concept = payload.concept || '';
  const summary = payload.summary || '';
  const kickoffDate = payload.kickoffDate || null;
  const extJson = payload.extJson || '{}';

  const [result] = await pool.query(
    `UPDATE clients
     SET name = ?, code = ?, concept = ?, summary = ?, kickoff_date = ?, ext_json = ?, updated_at = ?
     WHERE id = ?`,
    [clientName, clientCode, concept, summary, kickoffDate, extJson, now, clientId]
  );

  if (!result.affectedRows) {
    throw new Error('Cliente no encontrado.');
  }

  return {
    clientId,
    clientName,
    clientCode,
    concept,
    summary,
    kickoffDate,
    extJson,
    updatedAt: now
  };
}

async function deleteClient(clientId) {
  await pool.query('DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE client_id = ?)', [clientId]);
  await pool.query('DELETE FROM tasks WHERE client_id = ?', [clientId]);
  await pool.query('DELETE FROM templates WHERE client_id = ?', [clientId]);
  await pool.query('DELETE FROM client_months WHERE client_id = ?', [clientId]);
  const [result] = await pool.query('DELETE FROM clients WHERE id = ?', [clientId]);

  if (!result.affectedRows) {
    throw new Error('Cliente no encontrado.');
  }

  return { ok: true };
}

module.exports = {
  listClients,
  createClient,
  updateClient,
  deleteClient
};
