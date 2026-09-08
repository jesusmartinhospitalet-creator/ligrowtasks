const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/database');

function normalizeMonthKey(monthKey) {
  const mk = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mk)) throw new Error('Mes inválido.');
  const month = Number(mk.slice(5, 7));
  if (month < 1 || month > 12) throw new Error('Mes inválido.');
  return mk;
}

function mapMonth(row) {
  if (!row) return null;
  return {
    monthId:     row.id,
    clientId:    row.client_id,
    taskMonth:   row.task_month,
    monthStatus: row.month_status,
    generatedAt: row.generated_at,
    closedAt:    row.closed_at,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at
  };
}

async function listClientMonths(clientId) {
  const { data, error } = await supabase
    .from('client_months')
    .select('*')
    .eq('client_id', clientId)
    .order('task_month', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapMonth);
}

async function getClientMonth(clientId, taskMonth) {
  const mk = normalizeMonthKey(taskMonth);

  const { data, error } = await supabase
    .from('client_months')
    .select('*')
    .eq('client_id', clientId)
    .eq('task_month', mk)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ? mapMonth(data) : null;
}

async function createClientMonthIfMissing(clientId, taskMonth, monthStatus = 'abierto') {
  const mk = normalizeMonthKey(taskMonth);
  const existing = await getClientMonth(clientId, mk);
  if (existing) return existing;

  const now = new Date().toISOString();
  const monthId = uuidv4();

  const { data, error } = await supabase
    .from('client_months')
    .insert({
      id:           monthId,
      client_id:    clientId,
      task_month:   mk,
      month_status: monthStatus,
      generated_at: now,
      closed_at:    null,
      created_at:   now,
      updated_at:   now
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapMonth(data);
}

async function closeClientMonth(clientId, taskMonth) {
  const mk = normalizeMonthKey(taskMonth);
  const now = new Date().toISOString();

  await createClientMonthIfMissing(clientId, mk, 'abierto');

  const { error: e1 } = await supabase
    .from('client_months')
    .update({ month_status: 'cerrado', closed_at: now, updated_at: now })
    .eq('client_id', clientId)
    .eq('task_month', mk);

  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from('tasks')
    .update({ month_status: 'cerrado', updated_at: now })
    .eq('client_id', clientId)
    .eq('task_type', 'mensual')
    .eq('task_month', mk);

  if (e2) throw new Error(e2.message);

  return { ok: true, clientId, taskMonth: mk, monthStatus: 'cerrado', closedAt: now };
}

async function reopenClientMonth(clientId, taskMonth) {
  const mk = normalizeMonthKey(taskMonth);
  const now = new Date().toISOString();

  await createClientMonthIfMissing(clientId, mk, 'abierto');

  const { error: e1 } = await supabase
    .from('client_months')
    .update({ month_status: 'abierto', closed_at: null, updated_at: now })
    .eq('client_id', clientId)
    .eq('task_month', mk);

  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from('tasks')
    .update({ month_status: 'abierto', updated_at: now })
    .eq('client_id', clientId)
    .eq('task_type', 'mensual')
    .eq('task_month', mk);

  if (e2) throw new Error(e2.message);

  return { ok: true, clientId, taskMonth: mk, monthStatus: 'abierto' };
}

module.exports = {
  normalizeMonthKey,
  listClientMonths,
  getClientMonth,
  createClientMonthIfMissing,
  closeClientMonth,
  reopenClientMonth
};
