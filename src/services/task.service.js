const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

const OWNERS = ['Jesús', 'Blanca', 'Alejandro'];
const STATUSES = ['En curso', 'Listo', 'Detenido'];
const PRIORITIES = ['Alta', 'Media', 'Baja'];
const TASK_TYPES = ['puntual', 'mensual'];
const MONTH_STATUSES = ['abierto', 'cerrado'];

function normalizeTask(task = {}) {
  return {
    taskId: task.taskId || '',
    taskCode: task.taskCode || '',
    clientId: task.clientId || '',
    taskName: String(task.taskName || '').trim(),
    owner: OWNERS.includes(task.owner) ? task.owner : OWNERS[0],
    status: STATUSES.includes(task.status) ? task.status : 'En curso',
    priority: PRIORITIES.includes(task.priority) ? task.priority : 'Media',
    taskType: TASK_TYPES.includes(task.taskType) ? task.taskType : 'puntual',
    taskMonth: task.taskMonth || '',
    monthStatus: task.taskType === 'mensual'
      ? (MONTH_STATUSES.includes(task.monthStatus) ? task.monthStatus : 'abierto')
      : '',
    templateId: task.templateId || '',
    dueDate: task.dueDate || null,
    startDate: task.startDate || null,
    endDate: task.endDate || null,
    description: task.description || '',
    attachmentsJson: task.attachmentsJson || JSON.stringify(task.attachments || []),
  };
}

async function getClientCode(clientId) {
  const [rows] = await pool.query('SELECT code, name FROM clients WHERE id = ? LIMIT 1', [clientId]);
  if (!rows.length) return 'CLI';
  return rows[0].code || 'CLI';
}

async function nextTaskCode(clientId) {
  const prefix = await getClientCode(clientId);
  const [rows] = await pool.query(
    'SELECT task_code FROM tasks WHERE client_id = ? ORDER BY created_at DESC',
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
  const [rows] = await pool.query(
    `SELECT
      id AS taskId,
      task_code AS taskCode,
      client_id AS clientId,
      task_name AS taskName,
      owner,
      status,
      priority,
      task_type AS taskType,
      task_month AS taskMonth,
      month_status AS monthStatus,
      template_id AS templateId,
      due_date AS dueDate,
      start_date AS startDate,
      end_date AS endDate,
      description,
      attachments_json AS attachmentsJson,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM tasks
     ORDER BY due_date IS NULL, due_date ASC, created_at DESC`
  );

  return rows.map((row) => ({
    ...row,
    attachments: JSON.parse(row.attachmentsJson || '[]')
  }));
}

async function listTasksByClient(clientId) {
  const [rows] = await pool.query(
    `SELECT
      id AS taskId,
      task_code AS taskCode,
      client_id AS clientId,
      task_name AS taskName,
      owner,
      status,
      priority,
      task_type AS taskType,
      task_month AS taskMonth,
      month_status AS monthStatus,
      template_id AS templateId,
      due_date AS dueDate,
      start_date AS startDate,
      end_date AS endDate,
      description,
      attachments_json AS attachmentsJson,
      created_at AS createdAt,
      updated_at AS updatedAt
     FROM tasks
     WHERE client_id = ?
     ORDER BY due_date IS NULL, due_date ASC, created_at DESC`,
    [clientId]
  );

  return rows.map((row) => ({
    ...row,
    attachments: JSON.parse(row.attachmentsJson || '[]')
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
        task_type, task_month, month_status, template_id,
        due_date, start_date, end_date, description, attachments_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        taskCode,
        task.clientId,
        task.taskName,
        task.owner,
        task.status,
        task.priority,
        task.taskType,
        task.taskMonth || null,
        task.monthStatus || null,
        task.templateId || null,
        task.dueDate,
        task.startDate,
        task.endDate,
        task.description,
        task.attachmentsJson,
        now,
        now
      ]
    );

    return {
      ...task,
      taskId,
      taskCode,
      createdAt: now,
      updatedAt: now,
      attachments: JSON.parse(task.attachmentsJson || '[]')
    };
  }

  const [result] = await pool.query(
    `UPDATE tasks
     SET client_id = ?, task_name = ?, owner = ?, status = ?, priority = ?,
         task_type = ?, task_month = ?, month_status = ?, template_id = ?,
         due_date = ?, start_date = ?, end_date = ?, description = ?, attachments_json = ?, updated_at = ?
     WHERE id = ?`,
    [
      task.clientId,
      task.taskName,
      task.owner,
      task.status,
      task.priority,
      task.taskType,
      task.taskMonth || null,
      task.monthStatus || null,
      task.templateId || null,
      task.dueDate,
      task.startDate,
      task.endDate,
      task.description,
      task.attachmentsJson,
      now,
      task.taskId
    ]
  );

  if (!result.affectedRows) {
    throw new Error('Tarea no encontrada.');
  }

  return {
    ...task,
    updatedAt: now,
    attachments: JSON.parse(task.attachmentsJson || '[]')
  };
}

async function deleteTask(taskId) {
  await pool.query('DELETE FROM comments WHERE task_id = ?', [taskId]);
  const [result] = await pool.query('DELETE FROM tasks WHERE id = ?', [taskId]);

  if (!result.affectedRows) {
    throw new Error('Tarea no encontrada.');
  }

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
