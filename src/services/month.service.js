const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

function normalizeMonthKey(monthKey) {
  const mk = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mk)) throw new Error('Mes inválido.');
  const month = Number(mk.slice(5, 7));
  if (month < 1 || month > 12) throw new Error('Mes inválido.');
  return mk;
}

async function listClientMonths(clientId) {
  const [rows] = await pool.query(
    `SELECT
      id AS monthId,
      client_id AS clientId,
      task_month AS taskMonth,
      month_status AS monthStatus,
      generated_at AS generatedAt,
      closed_at AS closedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM client_months
     WHERE client_id = ?
     ORDER BY task_month DESC`,
    [clientId]
  );

  return rows;
}

async function getClientMonth(clientId, taskMonth) {
  const mk = normalizeMonthKey(taskMonth);
  const [rows] = await pool.query(
    `SELECT
      id AS monthId,
      client_id AS clientId,
      task_month AS taskMonth,
      month_status AS monthStatus,
      generated_at AS generatedAt,
      closed_at AS closedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM client_months
     WHERE client_id = ? AND task_month = ?
     LIMIT 1`,
    [clientId, mk]
  );

  return rows[0] || null;
}

async function createClientMonthIfMissing(clientId, taskMonth, monthStatus = 'abierto') {
  const mk = normalizeMonthKey(taskMonth);
  const existing = await getClientMonth(clientId, mk);
  if (existing) return existing;

  const now = new Date();
  const monthId = uuidv4();

  await pool.query(
    `INSERT INTO client_months (
      id, client_id, task_month, month_status, generated_at, closed_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [monthId, clientId, mk, monthStatus, now, null, now, now]
  );

  return {
    monthId,
    clientId,
    taskMonth: mk,
    monthStatus,
    generatedAt: now,
    closedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

async function closeClientMonth(clientId, taskMonth) {
  const mk = normalizeMonthKey(taskMonth);
  const now = new Date();

  await createClientMonthIfMissing(clientId, mk, 'abierto');

  await pool.query(
    `UPDATE client_months
     SET month_status = 'cerrado', closed_at = ?, updated_at = ?
     WHERE client_id = ? AND task_month = ?`,
    [now, now, clientId, mk]
  );

  await pool.query(
    `UPDATE tasks
     SET month_status = 'cerrado', updated_at = ?
     WHERE client_id = ? AND task_type = 'mensual' AND task_month = ?`,
    [now, clientId, mk]
  );

  return {
    ok: true,
    clientId,
    taskMonth: mk,
    monthStatus: 'cerrado',
    closedAt: now
  };
}

async function reopenClientMonth(clientId, taskMonth) {
  const mk = normalizeMonthKey(taskMonth);
  const now = new Date();

  await createClientMonthIfMissing(clientId, mk, 'abierto');

  await pool.query(
    `UPDATE client_months
     SET month_status = 'abierto', closed_at = NULL, updated_at = ?
     WHERE client_id = ? AND task_month = ?`,
    [now, clientId, mk]
  );

  await pool.query(
    `UPDATE tasks
     SET month_status = 'abierto', updated_at = ?
     WHERE client_id = ? AND task_type = 'mensual' AND task_month = ?`,
    [now, clientId, mk]
  );

  return {
    ok: true,
    clientId,
    taskMonth: mk,
    monthStatus: 'abierto'
  };
}

module.exports = {
  normalizeMonthKey,
  listClientMonths,
  getClientMonth,
  createClientMonthIfMissing,
  closeClientMonth,
  reopenClientMonth
};
