const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/database');

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
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('client_months')
    .select('id')
    .eq('client_id', clientId)
    .eq('task_month', yearMonth)
    .single();

  if (existing) return existing.id;

  const id = uuidv4();

  const { error } = await supabase
    .from('client_months')
    .insert({
      id,
      client_id:    clientId,
      task_month:   yearMonth,
      month_status: 'abierto',
      generated_at: now,
      created_at:   now,
      updated_at:   now
    });

  if (error) throw new Error(error.message);
  return id;
}

async function generateMonth(clientId, yearMonth) {
  if (!clientId) throw new Error('clientId requerido');
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error('Formato mes inválido (YYYY-MM)');

  const now = new Date().toISOString();
  const [year, month] = yearMonth.split('-').map(Number);

  const monthId = await ensureClientMonth(clientId, yearMonth);

  const { data: templates, error: tErr } = await supabase
    .from('templates')
    .select('id, template_name, owner, priority, status_default, due_day')
    .eq('client_id', clientId)
    .eq('is_active', true);

  if (tErr) throw new Error(tErr.message);

  const created = [];

  for (const tpl of (templates || [])) {
    const taskId = uuidv4();
    const dueDate = buildDate(year, month, tpl.due_day);

    const { error: iErr } = await supabase
      .from('tasks')
      .insert({
        id:           taskId,
        task_code:    null,
        client_id:    clientId,
        task_name:    tpl.template_name,
        owner:        tpl.owner,
        status:       tpl.status_default || 'En curso',
        priority:     tpl.priority || 'Media',
        task_type:    'mensual',
        task_month:   yearMonth,
        month_status: 'abierto',
        template_id:  tpl.id,
        due_date:     dueDate,
        description:  '',
        checklist:    [],
        links:        [],
        files:        [],
        created_at:   now,
        updated_at:   now
      });

    if (iErr) throw new Error(iErr.message);
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
