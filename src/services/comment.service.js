const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');

async function getCommentsByTask(taskId) {
  const { rows } = await pool.query(
    `SELECT id, task_id AS "taskId", author, text, created_at AS "createdAt"
     FROM comments
     WHERE task_id = $1
     ORDER BY created_at ASC`,
    [taskId]
  );
  return rows;
}

async function addComment(taskId, author, text) {
  if (!text || !text.trim()) {
    throw new Error('El comentario no puede estar vacío.');
  }

  const id = uuidv4();
  const now = new Date();
  const commentAuthor = author || 'Jesús';

  await pool.query(
    `INSERT INTO comments (id, task_id, author, text, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, taskId, commentAuthor, text.trim(), now]
  );

  return { id, taskId, author: commentAuthor, text: text.trim(), createdAt: now };
}

async function deleteComment(commentId) {
  const result = await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
  if (!result.rowCount) {
    throw new Error('Comentario no encontrado.');
  }
  return { ok: true };
}

module.exports = { getCommentsByTask, addComment, deleteComment };
