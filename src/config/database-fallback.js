async function query(text, params = [], memoryStore) {
  const sql = text.trim();

  // CLIENTS
  if (sql.startsWith('SELECT') && sql.includes('FROM clients')) {
    let rows = [...memoryStore.clients];
    if (sql.includes('WHERE id = $1')) {
      rows = rows.filter(c => c.id === params[0]);
    }
    return { rows, rowCount: rows.length };
  }

  if (sql.startsWith('INSERT INTO clients')) {
    const newClient = {
      id: params[0],
      name: params[1],
      code: params[2],
      concept: params[3],
      summary: params[4],
      kickoff_date: params[5],
      category: params[6] || 'personal',
      status: params[7] || 'activo',
      color_accent: params[8] || '#6366f1',
      progress_pct: params[9] || 0,
      ext_json: params[10],
      created_at: params[11],
      updated_at: params[12]
    };
    memoryStore.clients.push(newClient);
    return { rows: [newClient], rowCount: 1 };
  }

  if (sql.startsWith('UPDATE clients')) {
    const idx = memoryStore.clients.findIndex(c => c.id === params[11]);
    if (idx !== -1) {
      memoryStore.clients[idx] = {
        ...memoryStore.clients[idx],
        name: params[0],
        code: params[1],
        concept: params[2],
        summary: params[3],
        kickoff_date: params[4],
        category: params[5],
        status: params[6],
        color_accent: params[7],
        progress_pct: params[8],
        ext_json: params[9],
        updated_at: params[10]
      };
      return { rowCount: 1 };
    }
    return { rowCount: 0 };
  }

  if (sql.startsWith('DELETE FROM clients')) {
    memoryStore.clients = memoryStore.clients.filter(c => c.id !== params[0]);
    return { rowCount: 1 };
  }

  // TASKS
  if (sql.startsWith('SELECT') && sql.includes('FROM tasks')) {
    let rows = [...memoryStore.tasks];
    if (sql.includes('WHERE client_id = $1')) {
      rows = rows.filter(t => t.client_id === params[0]);
    }
    if (sql.includes('WHERE id = $1')) {
      rows = rows.filter(t => t.id === params[0]);
    }
    return { rows, rowCount: rows.length };
  }

  if (sql.startsWith('INSERT INTO tasks')) {
    const newTask = {
      id: params[0],
      task_code: params[1],
      client_id: params[2],
      task_name: params[3],
      owner: params[4],
      status: params[5],
      priority: params[6],
      task_type: params[7],
      category: params[8],
      task_month: params[9],
      month_status: params[10],
      template_id: params[11],
      due_date: params[12],
      start_date: params[13],
      end_date: params[14],
      description: params[15],
      subtasks_json: params[16],
      tags_json: params[17],
      attachments_json: params[18],
      created_at: params[19],
      updated_at: params[20]
    };
    memoryStore.tasks.push(newTask);
    return { rows: [newTask], rowCount: 1 };
  }

  if (sql.startsWith('UPDATE tasks')) {
    const taskId = params[18];
    const idx = memoryStore.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) {
      memoryStore.tasks[idx] = {
        ...memoryStore.tasks[idx],
        client_id: params[0],
        task_name: params[1],
        owner: params[2],
        status: params[3],
        priority: params[4],
        task_type: params[5],
        category: params[6],
        task_month: params[7],
        month_status: params[8],
        template_id: params[9],
        due_date: params[10],
        start_date: params[11],
        end_date: params[12],
        description: params[13],
        subtasks_json: params[14],
        tags_json: params[15],
        attachments_json: params[16],
        updated_at: params[17]
      };
      return { rowCount: 1 };
    }
    return { rowCount: 0 };
  }

  if (sql.startsWith('DELETE FROM tasks')) {
    memoryStore.tasks = memoryStore.tasks.filter(t => t.id !== params[0] && t.client_id !== params[0]);
    return { rowCount: 1 };
  }

  // COMMENTS
  if (sql.startsWith('SELECT') && sql.includes('FROM comments')) {
    let rows = memoryStore.comments.filter(c => c.task_id === params[0]);
    return { rows, rowCount: rows.length };
  }

  if (sql.startsWith('INSERT INTO comments')) {
    const newComment = {
      id: params[0],
      task_id: params[1],
      author: params[2],
      text: params[3],
      created_at: params[4]
    };
    memoryStore.comments.push(newComment);
    return { rows: [newComment], rowCount: 1 };
  }

  if (sql.startsWith('DELETE FROM comments')) {
    memoryStore.comments = memoryStore.comments.filter(c => c.id !== params[0] && c.task_id !== params[0]);
    return { rowCount: 1 };
  }

  // TEMPLATES & MONTHS
  if (sql.includes('FROM templates')) {
    let rows = memoryStore.templates.filter(t => !params[0] || t.client_id === params[0]);
    return { rows, rowCount: rows.length };
  }

  if (sql.includes('FROM client_months')) {
    let rows = memoryStore.client_months.filter(m => !params[0] || m.client_id === params[0]);
    return { rows, rowCount: rows.length };
  }

  return { rows: [], rowCount: 0 };
}

module.exports = { query };
