const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

const OWNERS = ['Jesús', 'Blanca', 'Alejandro'];
const STATUSES = ['En curso', 'Listo', 'Detenido'];
const PRIORITIES = ['Alta', 'Media', 'Baja'];

function normalizeBool(value, fallback = true) {
  if (value === true || value === false) return value;
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  return fallback;
}

function normalizeDueDay(value) {
  const n = Number(value);
  if (!n || Number.isNaN(n)) return null;
  if (n < 1) return 1;
  if (n > 31) return 31;
  return Math.floor(n);
}

async function listTemplatesByClient(clientId) {
  const [rows] = await pool.query(
    `SELECT
      id AS templateId,
      client_id AS clientId,
      template_name AS templateName,
      owner,
      priority,
      status_default AS statusDefault,
      due_day AS dueDay,
      is_active AS isActive,
      description,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM templates
     WHERE client_id = ?
     ORDER BY template_name ASC`,
    [clientId]
  );

  return rows.map((row) => ({
    ...row,
    isActive: normalizeBool(row.isActive, true)
  }));
}

async function upsertTemplate(payload) {
  const now = new Date();
  const templateId = payload.templateId || '';
  const clientId = payload.clientId || '';
  const templateName = String(payload.templateName || '').trim();
  const owner = OWNERS.includes(payload.owner) ? payload.owner : OWNERS[0];
  const priority = PRIORITIES.includes(payload.priority) ? payload.priority : 'Media';
  const statusDefault = STATUSES.includes(payload.statusDefault) ? payload.statusDefault : 'En curso';
  const dueDay = normalizeDueDay(payload.dueDay);
  const isActive = normalizeBool(payload.isActive, true);
  const description = String(payload.description || '');

  if (!clientId) throw new Error('La plantilla necesita clientId.');
  if (!templateName) throw new Error('La plantilla necesita nombre.');

  if (!templateId) {
    const newId = uuidv4();

    await pool.query(
      `INSERT INTO templates (
        id, client_id, template_name, owner, priority, status_default,
        due_day, is_active, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, clientId, templateName, owner, priority, statusDefault, dueDay, isActive ? 1 : 0, description, now, now]
    );

    return {
      templateId: newId,
      clientId,
      templateName,
      owner,
      priority,
      statusDefault,
      dueDay,
      isActive,
      description,
      createdAt: now,
      updatedAt: now
    };
  }

  const [result] = await pool.query(
    `UPDATE templates
     SET client_id = ?, template_name = ?, owner = ?, priority = ?, status_default = ?, due_day = ?, is_active = ?, description = ?, updated_at = ?
     WHERE id = ?`,
    [clientId, templateName, owner, priority, statusDefault, dueDay, isActive ? 1 : 0, description, now, templateId]
  );

  if (!result.affectedRows) throw new Error('Plantilla no encontrada.');

  return {
    templateId,
    clientId,
    templateName,
    owner,
    priority,
    statusDefault,
    dueDay,
    isActive,
    description,
    updatedAt: now
  };
}

async function deleteTemplate(templateId) {
  const [result] = await pool.query('DELETE FROM templates WHERE id = ?', [templateId]);
  if (!result.affectedRows) throw new Error('Plantilla no encontrada.');
  return { ok: true };
}

module.exports = {
  listTemplatesByClient,
  upsertTemplate,
  deleteTemplate
};
