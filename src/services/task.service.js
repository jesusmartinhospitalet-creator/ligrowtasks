const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/database');

const OWNERS = ['Jesús', 'Blanca', 'Alejandro'];
const STATUSES = ['En curso', 'Listo', 'Detenido'];
const PRIORITIES = ['Alta', 'Media', 'Baja'];
const TASK_TYPES = ['puntual', 'mensual'];
const MONTH_STATUSES = ['abierto', 'cerrado'];

function mapTask(row) {
  if (!row) return null;
  return {
    taskId:          row.id,
    taskCode:        row.task_code,
    clientId:        row.client_id,
    taskName:        row.task_name,
    owner:           row.owner,
    status:          row.status,
    priority:        row.priority,
    taskType:        row.task_type,
    taskMonth:       row.task_month,
    monthStatus:     row.month_status,
    templateId:      row.template_id,
    dueDate:         row.due_date,
    startDate:       row.start_date,
    endDate:         row.end_date,
    description:     row.description,
    attachmentsJson: JSON.stringify(row.attachments_json || []),
    attachments:     row.attachments_json || [],
    checklist:       row.checklist || [],
    links:           row.links || [],
    files:           row.files || [],
    createdAt:       row.created_at,
    updatedAt:       row.updated_at
  };
}

function normalizeTask(task = {}) {
  return {
    taskId:      task.taskId || '',
    taskCode:    task.taskCode || '',
    clientId:    task.clientId || '',
    taskName:    String(task.taskName || '').trim(),
    owner:       OWNERS.includes(task.owner) ? task.owner : OWNERS[0],
    status:      STATUSES.includes(task.status) ? task.status : 'En curso',
    priority:    PRIORITIES.includes(task.priority) ? task.priority : 'Media',
    taskType:    TASK_TYPES.includes(task.taskType) ? task.taskType : 'puntual',
    taskMonth:   task.taskMonth || '',
    monthStatus: task.taskType === 'mensual'
      ? (MONTH_STATUSES.includes(task.monthStatus) ? task.monthStatus : 'abierto')
      : '',
    templateId:   task.templateId || '',
    dueDate:      task.dueDate || null,
    startDate:    task.startDate || null,
    endDate:      task.endDate || null,
    description:  task.description || '',
    attachmentsJson: task.attachmentsJson || JSON.stringify(task.attachments || []),
    checklist:    Array.isArray(task.checklist) ? task.checklist : [],
    links:        Array.isArray(task.links) ? task.links : [],
    files:        Array.isArray(task.files) ? task.files : []
  };
}

async function getClientCode(clientId) {
  const { data } = await supabase
    .from('clients')
    .select('code')
    .eq('id', clientId)
    .single();

  return data?.code || 'CLI';
}

async function nextTaskCode(clientId) {
  const prefix = await getClientCode(clientId);

  const { data } = await supabase
    .from('tasks')
    .select('task_code')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  let max = 0;
  for (const row of (data || [])) {
    const code = String(row.task_code || '');
    const match = code.match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }

  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

async function listAllTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapTask);
}

async function listTasksByClient(clientId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('client_id', clientId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapTask);
}

async function upsertTask(payload) {
  const task = normalizeTask(payload);

  if (!task.clientId) throw new Error('La tarea necesita clientId.');
  if (!task.taskName) throw new Error('La tarea necesita nombre.');

  const now = new Date().toISOString();

  let attachmentsArr;
  try {
    attachmentsArr = JSON.parse(task.attachmentsJson || '[]');
  } catch {
    attachmentsArr = [];
  }

  if (!task.taskId) {
    const taskId = uuidv4();
    const taskCode = await nextTaskCode(task.clientId);

    const row = {
      id:               taskId,
      task_code:        taskCode,
      client_id:        task.clientId,
      task_name:        task.taskName,
      owner:            task.owner,
      status:           task.status,
      priority:         task.priority,
      task_type:        task.taskType,
      task_month:       task.taskMonth || null,
      month_status:     task.monthStatus || null,
      template_id:      task.templateId || null,
      due_date:         task.dueDate,
      start_date:       task.startDate,
      end_date:         task.endDate,
      description:      task.description,
      attachments_json: attachmentsArr,
      checklist:        task.checklist,
      links:            task.links,
      files:            task.files,
      created_at:       now,
      updated_at:       now
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapTask(data);
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({
      client_id:        task.clientId,
      task_name:        task.taskName,
      owner:            task.owner,
      status:           task.status,
      priority:         task.priority,
      task_type:        task.taskType,
      task_month:       task.taskMonth || null,
      month_status:     task.monthStatus || null,
      template_id:      task.templateId || null,
      due_date:         task.dueDate,
      start_date:       task.startDate,
      end_date:         task.endDate,
      description:      task.description,
      attachments_json: attachmentsArr,
      checklist:        task.checklist,
      links:            task.links,
      files:            task.files,
      updated_at:       now
    })
    .eq('id', task.taskId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Tarea no encontrada.');
  return mapTask(data);
}

async function deleteTask(taskId) {
  // CASCADE on comments handled by FK
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw new Error(error.message);
  return { ok: true };
}

module.exports = {
  OWNERS,
  STATUSES,
  PRIORITIES,
  TASK_TYPES,
  MONTH_STATUSES,
  listAllTasks,
  listTasksByClient,
  upsertTask,
  deleteTask
};
