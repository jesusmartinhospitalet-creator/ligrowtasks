const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

const OWNERS = ['Jesús', 'Blanca', 'Alejandro'];
const STATUSES = ['En curso', 'Listo', 'Detenido'];
const PRIORITIES = ['Alta', 'Media', 'Baja'];
const TASK_TYPES = ['puntual', 'mensual'];
const MONTH_STATUSES = ['abierto', 'cerrado'];

function normalizeTask(task = {}) {
  let subtasks = task.subtasks || [];
  if (typeof task.subtasksJson === 'string') {
    try { subtasks = JSON.parse(task.subtasksJson); } catch (e) { subtasks = []; }
  }
  let tags = task.tags || [];
  if (typeof task.tagsJson === 'string') {
    try { tags = JSON.parse(task.tagsJson); } catch (e) { tags = []; }
  }

  return {
    taskId: task.taskId || '',
    taskCode: task.taskCode || '',
    clientId: task.clientId || '',
    taskName: String(task.taskName || '').trim(),
    owner: OWNERS.includes(task.owner) ? task.owner : OWNERS[0],
    status: STATUSES.includes(task.status) ? task.status : 'En curso',
    priority: PRIORITIES.includes(task.priority) ? task.priority : 'Media',
    taskType: TASK_TYPES.includes(task.taskType) ? task.taskType : 'puntual',
    category: task.category || 'personal',
    taskMonth: task.taskMonth || '',
    monthStatus: task.taskType === 'mensual'
      ? (MONTH_STATUSES.includes(task.monthStatus) ? task.monthStatus : 'abierto')
      : '',
    templateId: task.templateId || '',
    dueDate: task.dueDate || null,
    startDate: task.startDate || null,
    endDate: task.endDate || null,
    description: task.description || '',
    subtasksJson: JSON.stringify(subtasks),
    tagsJson: JSON.stringify(tags),
    attachmentsJson: task.attachmentsJson || JSON.stringify(task.attachments || []),
    subtasks,
    tags,
  };
}

async function getClientCode(clientId) {
  const { rows } = await pool.query('SELECT code, name FROM clients WHERE id = $1 LIMIT 1', [clientId]);
  if (!rows.length) return 'CLI';
  return rows[0].code || 'CLI';
}

async function nextTaskCode(clientId) {
  const prefix = await getClientCode(clientId);
  const { rows } = await pool.query(
    'SELECT task_code FROM tasks WHERE client_id = $1 ORDER BY created_at DESC',
    [clientId]
  );

  let max = 0;
  for (const row of rows) {
    const code = String(row.task_code || '');
    const match = code.match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }

  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

async function listAllTasks() {
  const { rows } = await pool.query(
    `SELECT
      id AS "taskId",
      task_code AS "taskCode",
      client_id AS "clientId",
      task_name AS "taskName",
      owner,
      status,
      priority,
      task_type AS "taskType",
      COALESCE(category, 'personal') AS "category",
      task_month AS "taskMonth",
      month_status AS "monthStatus",
      template_id AS "templateId",
      due_date AS "dueDate",
      start_date AS "startDate",
      end_date AS "endDate",
      description,
      COALESCE(subtasks_json, '[]'::jsonb) AS "subtasksJson",
      COALESCE(tags_json, '[]'::jsonb) AS "tagsJson",
      attachments_json AS "attachmentsJson",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
     FROM tasks
     ORDER BY due_date ASC NULLS LAST, created_at DESC`
  );

  return rows.map((row) => ({
    ...row,
    subtasks: typeof row.subtasksJson === 'string' ? JSON.parse(row.subtasksJson || '[]') : (row.subtasksJson || []),
    tags: typeof row.tagsJson === 'string' ? JSON.parse(row.tagsJson || '[]') : (row.tagsJson || []),
    attachments: typeof row.attachmentsJson === 'string' ? JSON.parse(row.attachmentsJson || '[]') : (row.attachmentsJson || []),
  }));
}

async function listTasksByClient(clientId) {
  const { rows } = await pool.query(
    `SELECT
      id AS "taskId",
      task_code AS "taskCode",
      client_id AS "clientId",
      task_name AS "taskName",
      owner,
      status,
      priority,
      task_type AS "taskType",
      COALESCE(category, 'personal') AS "category",
      task_month AS "taskMonth",
      month_status AS "monthStatus",
      template_id AS "templateId",
      due_date AS "dueDate",
      start_date AS "startDate",
      end_date AS "endDate",
      description,
      COALESCE(subtasks_json, '[]'::jsonb) AS "subtasksJson",
      COALESCE(tags_json, '[]'::jsonb) AS "tagsJson",
      attachments_json AS "attachmentsJson",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
     FROM tasks
     WHERE client_id = $1
     ORDER BY due_date ASC NULLS LAST, created_at DESC`,
    [clientId]
  );

  return rows.map((row) => ({
    ...row,
    subtasks: typeof row.subtasksJson === 'string' ? JSON.parse(row.subtasksJson || '[]') : (row.subtasksJson || []),
    tags: typeof row.tagsJson === 'string' ? JSON.parse(row.tagsJson || '[]') : (row.tagsJson || []),
    attachments: typeof row.attachmentsJson === 'string' ? JSON.parse(row.attachmentsJson || '[]') : (row.attachmentsJson || []),
  }));
}

async function upsertTask(payload) {
  const task = normalizeTask(payload);

  if (!task.clientId) throw new Error('La tarea necesita clientId.');
  if (!task.taskName) throw new Error('La tarea necesita nombre.');

  const now = new Date();

  if (!task.taskId) {
    const taskId = uuidv4();
    const taskCode = await nextTaskCode(task.clientId);

    await pool.query(
      `INSERT INTO tasks (
        id, task_code, client_id, task_name, owner, status, priority,
        task_type, category, task_month, month_status, template_id,
        due_date, start_date, end_date, description, subtasks_json, tags_json, attachments_json,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        taskId, taskCode, task.clientId, task.taskName, task.owner, task.status, task.priority,
        task.taskType, task.category, task.taskMonth || null, task.monthStatus || null, task.templateId || null,
        task.dueDate, task.startDate, task.endDate, task.description, task.subtasksJson, task.tagsJson, task.attachmentsJson,
        now, now
      ]
    );

    return { ...task, taskId, taskCode, createdAt: now, updatedAt: now };
  }

  const result = await pool.query(
    `UPDATE tasks
     SET client_id=$1, task_name=$2, owner=$3, status=$4, priority=$5,
         task_type=$6, category=$7, task_month=$8, month_status=$9, template_id=$10,
         due_date=$11, start_date=$12, end_date=$13, description=$14, subtasks_json=$15, tags_json=$16, attachments_json=$17, updated_at=$18
     WHERE id=$19`,
    [
      task.clientId, task.taskName, task.owner, task.status, task.priority,
      task.taskType, task.category, task.taskMonth || null, task.monthStatus || null, task.templateId || null,
      task.dueDate, task.startDate, task.endDate, task.description, task.subtasksJson, task.tagsJson, task.attachmentsJson,
      now, task.taskId
    ]
  );

  if (!result.rowCount) throw new Error('Tarea no encontrada.');

  return { ...task, updatedAt: now };
}

async function deleteTask(taskId) {
  await pool.query('DELETE FROM comments WHERE task_id = $1', [taskId]);
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);

  if (!result.rowCount) throw new Error('Tarea no encontrada.');

  return { ok: true };
}

async function getTaskStats() {
  const { rows } = await pool.query('SELECT status, priority, owner, due_date FROM tasks');
  const nowStr = new Date().toISOString().substring(0, 10);
  let total = rows.length;
  let ready = 0;
  let inProgress = 0;
  let stopped = 0;
  let overdue = 0;
  let byOwner = {};
  let byPriority = {};

  rows.forEach(r => {
    if (r.status === 'Listo') ready++;
    else if (r.status === 'En curso') inProgress++;
    else if (r.status === 'Detenido') stopped++;

    if (r.status !== 'Listo' && r.due_date && r.due_date.toISOString().substring(0, 10) < nowStr) {
      overdue++;
    }

    if (r.owner) byOwner[r.owner] = (byOwner[r.owner] || 0) + 1;
    if (r.priority) byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
  });

  return { total, ready, inProgress, stopped, overdue, byOwner, byPriority };
}

module.exports = { OWNERS, STATUSES, PRIORITIES, TASK_TYPES, MONTH_STATUSES, listAllTasks, listTasksByClient, upsertTask, deleteTask, getTaskStats };
