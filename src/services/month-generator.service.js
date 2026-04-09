const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function buildDate(year, month, day) {
  if (!day) return null;
  const max = daysInMonth(year, month);
  const safeDay = Math.min(Math.max(day, 1), max);
  const d = new Date(Date.UTC(year, month - 1, safeDay));
  return d.toISOString().slice(0, 10);
}

async function ensureClientMonth(clientId, yearMonth) {
  const now = new Date();

  const [existing] = await pool.query(
    'SELECT id FROM client_months WHERE client_id = ? AND year_month = ? LIMIT 1',
    [clientId, yearMonth]
  );

  if (existing.length) return existing[0].id;

  const id = uuidv4();

  await pool.query(
    `INSERT INTO client_months (
      id, client_id, year_month, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'abierto', ?, ?)`,
    [id, clientId, yearMonth, now, now]
  );

  return id;
}

async function generateMonth(clientId, yearMonth) {
  if (!clientId) throw new Error('clientId requerido');
  if (!/^\\d{4}-\\d{2}$/.test(yearMonth)) throw new Error('Formato mes inválido (YYYY-MM)');

  const now = new Date();
  const [year, month] = yearMonth.split('-').map(Number);

  const monthId = await ensureClientMonth(clientId, yearMonth);

  const [templates] = await pool.query(
    `SELECT
      id,
      template_name,
      owner,
      priority,
      status_default,
      due_day
     FROM templates
     WHERE client_id = ? AND is_active = 1`,
    [clientId]
  );

  const created = [];

  for (const tpl of templates) {
    const taskId = uuidv4();
    const dueDate = buildDate(year, month, tpl.due_day);

    await pool.query(
      `INSERT INTO tasks (
        id, task_code, client_id, task_name, owner, status, priority,
        task_type, task_month, month_status, template_id,
        due_date, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'mensual', ?, 'abierto', ?, ?, '', ?, ?)`,
      [
        taskId,
        null,
        clientId,
        tpl.template_name,
        tpl.owner,
        tpl.status_default || 'En curso',
        tpl.priority || 'Media',
        yearMonth,
        tpl.id,
        dueDate,
        now,
        now
      ]
    );

    created.push({ taskId, name: tpl.template_name });
  }

  return {
    clientId,
    yearMonth,
    createdCount: created.length,
    tasks: created,
    monthId
  };
}

module.exports = {
  generateMonth
};
