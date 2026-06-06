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

async function ensureClientMonth(clientId, taskMonth) {
  const { rows: existing } = await pool.query(
    'SELECT id FROM client_months WHERE client_id = $1 AND task_month = $2 LIMIT 1',
    [clientId, taskMonth]
  );
  if (existing.length) return existing[0].id;

  const now = new Date();
  const id = uuidv4();
  await pool.query(
    `INSERT INTO client_months (id, client_id, task_month, month_status, generated_at, closed_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'abierto', $4, NULL, $4, $4)`,
    [id, clientId, taskMonth, now]
  );
  return id;
}

async function generateMonth(clientId, taskMonth) {
  if (!clientId) throw new Error('clientId requerido');
  const mk = String(taskMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mk)) throw new Error('Formato mes inválido (YYYY-MM)');

  const now = new Date();
  const [year, month] = mk.split('-').map(Number);

  const monthId = await ensureClientMonth(clientId, mk);

  const { rows: templates } = await pool.query(
    `SELECT id, template_name, owner, priority, status_default, due_day
     FROM templates
     WHERE client_id = $1 AND is_active = true`,
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
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'mensual',$8,'abierto',$9,$10,'',$11,$11)`,
      [
        taskId, null, clientId,
        tpl.template_name, tpl.owner,
        tpl.status_default || 'En curso',
        tpl.priority || 'Media',
        mk, tpl.id, dueDate, now
      ]
    );

    created.push({ taskId, name: tpl.template_name });
  }

  return { clientId, taskMonth: mk, createdCount: created.length, tasks: created, monthId };
}

module.exports = { generateMonth };
