const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/database');

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

function mapTemplate(row) {
  if (!row) return null;
  return {
    templateId:    row.id,
    clientId:      row.client_id,
    templateName:  row.template_name,
    owner:         row.owner,
    priority:      row.priority,
    statusDefault: row.status_default,
    dueDay:        row.due_day,
    isActive:      normalizeBool(row.is_active, true),
    description:   row.description,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at
  };
}

async function listTemplatesByClient(clientId) {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('client_id', clientId)
    .order('template_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(mapTemplate);
}

async function upsertTemplate(payload) {
  const templateId   = payload.templateId || '';
  const clientId     = payload.clientId || '';
  const templateName = String(payload.templateName || '').trim();
  const owner        = OWNERS.includes(payload.owner) ? payload.owner : OWNERS[0];
  const priority     = PRIORITIES.includes(payload.priority) ? payload.priority : 'Media';
  const statusDefault = STATUSES.includes(payload.statusDefault) ? payload.statusDefault : 'En curso';
  const dueDay       = normalizeDueDay(payload.dueDay);
  const isActive     = normalizeBool(payload.isActive, true);
  const description  = String(payload.description || '');
  const now          = new Date().toISOString();

  if (!clientId) throw new Error('La plantilla necesita clientId.');
  if (!templateName) throw new Error('La plantilla necesita nombre.');

  if (!templateId) {
    const newId = uuidv4();

    const { data, error } = await supabase
      .from('templates')
      .insert({
        id:             newId,
        client_id:      clientId,
        template_name:  templateName,
        owner,
        priority,
        status_default: statusDefault,
        due_day:        dueDay,
        is_active:      isActive,
        description,
        created_at:     now,
        updated_at:     now
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapTemplate(data);
  }

  const { data, error } = await supabase
    .from('templates')
    .update({
      client_id:      clientId,
      template_name:  templateName,
      owner,
      priority,
      status_default: statusDefault,
      due_day:        dueDay,
      is_active:      isActive,
      description,
      updated_at:     now
    })
    .eq('id', templateId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Plantilla no encontrada.');
  return mapTemplate(data);
}

async function deleteTemplate(templateId) {
  const { error } = await supabase
    .from('templates')
    .delete()
    .eq('id', templateId);

  if (error) throw new Error(error.message);
  return { ok: true };
}

module.exports = {
  listTemplatesByClient,
  upsertTemplate,
  deleteTemplate
};
