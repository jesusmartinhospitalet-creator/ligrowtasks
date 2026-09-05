/* ── Seed Fallback Data ────────────────────────── */
const SEED_CLIENTS = [
  { clientId: 'cli-01', clientName: 'Pic Negre - Campaña Invierno', clientCode: 'PICNEG', concept: 'Marketing Hub V2', summary: 'Gestión integral de campaña nieve y activaciones digitales', kickoffDate: '2026-09-01', category: 'cliente', status: 'activo', colorAccent: '#f97316', progressPct: 65, tasksCount: 4 },
  { clientId: 'cli-02', clientName: 'Ligrow Hub - Infraestructura', clientCode: 'LIGROW', concept: 'Sistemas Internos', summary: 'Refactorización a Node.js Express y despliegue Vercel', kickoffDate: '2026-08-15', category: 'personal', status: 'activo', colorAccent: '#3b82f6', progressPct: 80, tasksCount: 3 },
  { clientId: 'cli-03', clientName: 'Andorra Ecommerce - Rediseño', clientCode: 'ANDOEE', concept: 'Rediseño UX/UI Store', summary: 'Optimización de embudo de venta y migración a Shopify Plus', kickoffDate: '2026-09-10', category: 'cliente', status: 'activo', colorAccent: '#10b981', progressPct: 40, tasksCount: 2 }
];

const SEED_TASKS = [
  { id: 'tsk-01', taskCode: 'PIC-101', clientId: 'cli-01', clientName: 'Pic Negre - Campaña Invierno', taskName: 'Revisión final de copies creativos', owner: 'Jesús', status: 'En edición', priority: 'Alta', taskType: 'Puntual', category: 'Marketing', dueDate: '2026-09-06', endDate: '2026-09-06', description: 'Supervisar copies para redes sociales y soportes impresos.', subtasks: [{ id: 'sub-1', title: 'Banner Google Ads', completed: true }, { id: 'sub-2', title: 'Post Instagram Feed', completed: false }], tags: ['Copywriting', 'Urgente'], attachments: [{ name: 'Briefing_Copies.pdf', url: '#' }] },
  { id: 'tsk-02', taskCode: 'LIG-201', clientId: 'cli-02', clientName: 'Ligrow Hub - Infraestructura', taskName: 'Despliegue y prueba en Vercel', owner: 'Jesús', status: 'En producción', priority: 'Alta', taskType: 'Puntual', category: 'Desarrollo', dueDate: '2026-09-05', endDate: '2026-09-05', description: 'Verificar despliegue continuo en Vercel preview.', subtasks: [{ id: 'sub-3', title: 'Configurar vercel.json', completed: true }, { id: 'sub-4', title: 'Prueba preview URL', completed: true }], tags: ['Vercel', 'DevOps'], attachments: [{ name: 'Vercel_Config.json', url: '#' }] },
  { id: 'tsk-03', taskCode: 'PIC-102', clientId: 'cli-01', clientName: 'Pic Negre - Campaña Invierno', taskName: 'Configuración Pixel Meta y TikTok Ads', owner: 'Alejandro', status: 'Sin empezar', priority: 'Media', taskType: 'Puntual', category: 'Analytics', dueDate: '2026-09-08', endDate: '2026-09-08', description: 'Pendiente acceso a la cuenta publicitaria.', subtasks: [], tags: ['Pixel', 'Paid Media'], attachments: [] },
  { id: 'tsk-04', taskCode: 'AND-301', clientId: 'cli-03', clientName: 'Andorra Ecommerce - Rediseño', taskName: 'Aprobación Wireframes UX/UI Mobile', owner: 'Blanca', status: 'Finalizada', priority: 'Media', taskType: 'Puntual', category: 'Diseño', dueDate: '2026-09-04', endDate: '2026-09-04', description: 'Diseños aceptados por cliente.', subtasks: [{ id: 'sub-5', title: 'Figma prototype', completed: true }], tags: ['Figma', 'UI/UX'], attachments: [] }
];

/* ── State ─────────────────────────────────────── */
const S = {
  clients:         SEED_CLIENTS,
  tasks:           SEED_TASKS,
  templates:       [],
  months:          [],
  allTasks:        SEED_TASKS,
  activeClient:    null,
  view:            'home', // 'home' | 'projects' | 'project' | 'calendar' | 'kanban' | 'table' | 'gantt' | 'templates' | 'months'
  workspace:       'all',  // 'all' | 'personal' | 'cliente'
  searchQuery:     '',
  selectedTag:     '',
  loading:         false,
  modal:           null,
  comments:        {},     // { [taskId]: [...] }
  calendarDate:    new Date(),
  expandedTaskId:  null,
  projectFilters:  { status: '', priority: '' },
};

const OWNERS        = ['Jesús', 'Blanca', 'Alejandro'];
const STATUSES      = ['Sin empezar', 'En edición', 'En producción', 'Finalizada'];
const PRIORITIES    = ['Alta', 'Media', 'Baja'];
const VIEWS_CLIENT  = ['project', 'kanban', 'table', 'gantt', 'templates', 'months'];
const VIEWS_GLOBAL  = ['home', 'projects', 'calendar', 'kanban', 'table'];
const VIEW_LABELS   = {
  home: 'Dashboard',
  projects: 'Proyectos',
  project: 'Resumen',
  calendar: 'Calendario',
  kanban: 'Kanban',
  table: 'Tabla',
  gantt: 'Gantt',
  templates: 'Plantillas',
  months: 'Meses'
};

/* ── Helpers ───────────────────────────────────── */
function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── Semáforo de Salud de Proyecto ──────────────── */
function getProjectHealth(clientId) {
  const projectTasks = S.allTasks.filter(t => t.clientId === clientId && t.status !== 'Finalizada');
  const todayStr = new Date().toISOString().substring(0, 10);
  const hasOverdue = projectTasks.some(t => t.dueDate && t.dueDate < todayStr);
  const hasCritical = projectTasks.some(t => t.priority === 'Alta');

  if (hasOverdue || hasCritical) {
    return { status: 'Atención', code: 'atencion', label: 'Atención', emoji: '🔴' };
  }
  if (projectTasks.length >= 3) {
    return { status: 'Carga alta', code: 'carga-alta', label: 'Carga Alta', emoji: '🟡' };
  }
  return { status: 'En edición', code: 'en-curso', label: 'En marcha', emoji: '🟢' };
}

/* ── API ───────────────────────────────────────── */
const IS_PREVIEW = typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');

function getMockForUrl(url = '') {
  if (url.startsWith('/tasks') || url.includes('/tasks/')) return SEED_TASKS;
  if (url.startsWith('/clients') || url.includes('/clients/')) return SEED_CLIENTS;
  return [];
}

async function api(url, opts = {}) {
  if (IS_PREVIEW) {
    if (!opts.method || opts.method === 'GET') {
      return getMockForUrl(url);
    }
    return { success: true };
  }

  try {
    const res = await fetch('/api' + url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    try {
      return JSON.parse(text);
    } catch (_jsonErr) {
      return getMockForUrl(url);
    }
  } catch (err) {
    console.warn(`[API Fallback for ${url}]:`, err.message);
    return getMockForUrl(url);
  }
}

/* ── Toast ─────────────────────────────────────── */
let toastEl = document.createElement('div');
toastEl.id = 'toast-container';
document.body.appendChild(toastEl);

function toast(msg, type = 'ok') {
  const icons = { ok: '✓', err: '✕', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || '•'}</span><span>${msg}</span>`;
  toastEl.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, 3200);
}

/* ── Modal ─────────────────────────────────────── */
async function openModal(type, data = {}) {
  S.modal = { type, data };
  if (type === 'task' && data.taskId) {
    try {
      const comments = await api('/comments/task/' + data.taskId);
      S.comments[data.taskId] = comments;
    } catch (e) {
      console.error('Error fetching comments:', e);
    }
  }
  renderModal();
}

function closeModal() {
  S.modal = null;
  const el = document.getElementById('modal-overlay');
  if (el) el.remove();
}

function renderModal() {
  const old = document.getElementById('modal-overlay');
  if (old) old.remove();
  if (!S.modal) return;

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = buildModal(S.modal.type, S.modal.data);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', escListener);

  const form = overlay.querySelector('form');
  if (form) form.addEventListener('submit', handleFormSubmit);

  const typeSelect = overlay.querySelector('[name="taskType"]');
  if (typeSelect) toggleMonthField(typeSelect);
}

function escListener(e) {
  if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escListener); }
}

function buildModal(type, data) {
  if (type === 'task')     return modalTask(data);
  if (type === 'client')   return modalClient(data);
  if (type === 'template') return modalTemplate(data);
  if (type === 'confirm')  return modalConfirm(data);
  return '';
}

/* ── Modal: Task ───────────────────────────────── */
function modalTask(d = {}) {
  const taskId = d.taskId || d.id || '';
  const isEdit = !!taskId;
  const clientId = d.clientId || S.activeClient?.clientId || '';
  const project = S.clients.find(client => client.clientId === clientId);

  if (!clientId) {
    return `
    <div class="modal modal-compact">
      <div class="modal-header">
        <div><div class="modal-kicker">Organización</div><div class="modal-title">Elige un proyecto</div></div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body empty-modal-copy">
        <p>Las tareas se crean dentro de una carpeta de proyecto para que queden ordenadas desde el inicio.</p>
        <button class="btn-primary" onclick="closeModal();setView('projects')">Ver proyectos</button>
      </div>
    </div>`;
  }

  return `
  <div class="modal modal-compact" style="max-width: 560px;">
    <div class="modal-header">
      <div><div class="modal-kicker">${esc(project?.clientName || 'Proyecto')}</div><div class="modal-title">${isEdit ? 'Editar tarea' : 'Nueva tarea'}</div></div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form id="task-form" data-type="task">
        <input type="hidden" name="taskId" value="${taskId}">
        <input type="hidden" name="clientId" value="${clientId}">
        <div class="form-grid">
          <div class="form-field full">
            <label class="form-label">Título *</label>
            <input class="form-input" name="taskName" required placeholder="¿Qué hay que hacer?" value="${esc(d.taskName || '')}">
          </div>
          <div class="form-field full">
            <label class="form-label">Descripción</label>
            <textarea class="form-input" name="description" rows="4" placeholder="Añade el contexto necesario para realizarla.">${esc(d.description || '')}</textarea>
          </div>
        </div>
        <p class="form-help">La prioridad, el estado y la fecha de fin se definen directamente en la tarea.</p>
        <div class="form-actions" style="margin-top:16px;">
          <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Guardar cambios' : 'Crear tarea'}</button>
        </div>
      </form>
    </div>
  </div>`;
}

function addModalSubtask() {
  const inp = document.getElementById('new-subtask-input');
  if (!inp || !inp.value.trim()) return;
  const list = document.getElementById('modal-subtask-list');
  const div = document.createElement('div');
  div.className = 'subtask-item';
  div.innerHTML = `
    <input type="checkbox">
    <span style="flex:1;">${esc(inp.value.trim())}</span>
    <button type="button" class="pin-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  list.appendChild(div);
  inp.value = '';
}

function addModalAttachment() {
  const tInp = document.getElementById('new-attachment-title');
  const uInp = document.getElementById('new-attachment-url');
  if (!uInp || !uInp.value.trim()) return;
  const title = tInp?.value.trim() || uInp.value.trim();
  const url = uInp.value.trim();

  const list = document.getElementById('modal-attachment-list');
  const div = document.createElement('div');
  div.className = 'attachment-chip';
  div.innerHTML = `
    <span>📎</span>
    <a href="${esc(url)}" target="_blank" style="flex:1;" data-url="${esc(url)}">${esc(title)}</a>
    <button type="button" class="pin-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  list.appendChild(div);
  if (tInp) tInp.value = '';
  uInp.value = '';
}

async function submitComment(taskId) {
  const inp = document.getElementById('new-comment-text');
  if (!inp || !inp.value.trim()) return;
  try {
    const comment = await api(`/comments/task/${taskId}`, {
      method: 'POST',
      body: JSON.stringify({ author: 'Jesús', text: inp.value.trim() })
    });
    if (!S.comments[taskId]) S.comments[taskId] = [];
    S.comments[taskId].push(comment);
    inp.value = '';
    renderModal();
    toast('Comentario añadido');
  } catch (e) {
    toast(e.message, 'err');
  }
}

function toggleMonthField(sel) {
  const f = document.getElementById('field-taskMonth');
  if (f) f.style.display = sel.value === 'mensual' ? 'flex' : 'none';
}

/* ── Modal: Client / Project ───────────────────── */
function modalClient(d = {}) {
  const isEdit = !!d.clientId;
  const val = k => d[k] ? ` value="${esc(d[k])}"` : '';
  const category = d.category || 'personal';

  return `
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto'}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form id="client-form" data-type="client">
        <input type="hidden" name="clientId" value="${d.clientId || ''}">
        <div class="form-grid">
          <div class="form-field full">
            <label class="form-label">Nombre del proyecto *</label>
            <input class="form-input" name="clientName" required placeholder="Nombre del proyecto o marca"${val('clientName')}>
          </div>
          <div class="form-field">
            <label class="form-label">Categoría / Espacio</label>
            <select class="form-input" name="category">
              <option value="personal"${category === 'personal' ? ' selected' : ''}>Personal</option>
              <option value="cliente"${category === 'cliente' ? ' selected' : ''}>Cliente / Trabajo</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Código</label>
            <input class="form-input" name="clientCode" placeholder="PROJ" maxlength="6"${val('clientCode')}>
          </div>
          <div class="form-field">
            <label class="form-label">Color de acento</label>
            <input class="form-input" name="colorAccent" type="color" value="${d.colorAccent || '#6366f1'}">
          </div>
          <div class="form-field">
            <label class="form-label">Fecha de inicio</label>
            <input class="form-input" name="kickoffDate" type="date"${val('kickoffDate')}>
          </div>
          <div class="form-field full">
            <label class="form-label">Concepto / Descripción corta</label>
            <input class="form-input" name="concept" placeholder="ej: Productividad personal y automatizaciones"${val('concept')}>
          </div>
          <div class="form-field full">
            <label class="form-label">Resumen / Objetivos</label>
            <textarea class="form-input" name="summary" rows="3" placeholder="Detalles del proyecto…">${esc(d.summary || '')}</textarea>
          </div>
        </div>
        <div class="form-actions">
          ${isEdit ? `<button type="button" class="btn-danger btn-sm" onclick="confirmDelete('client','${d.clientId}')">Eliminar</button>` : ''}
          <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar</button>
        </div>
      </form>
    </div>
  </div>`;
}

function modalTemplate(d = {}) {
  const isEdit = !!d.templateId;
  const opt = (arr, val) => arr.map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('');
  const val = k => d[k] ? ` value="${esc(d[k])}"` : '';
  return `
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Editar plantilla' : 'Nueva plantilla'}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form id="template-form" data-type="template">
        <input type="hidden" name="templateId" value="${d.templateId || ''}">
        <input type="hidden" name="clientId" value="${S.activeClient?.clientId || ''}">
        <div class="form-grid">
          <div class="form-field full">
            <label class="form-label">Nombre de la plantilla *</label>
            <input class="form-input" name="templateName" required placeholder="Nombre de la tarea recurrente"${val('templateName')}>
          </div>
          <div class="form-field">
            <label class="form-label">Responsable</label>
            <select class="form-input" name="owner">${opt(OWNERS, d.owner || OWNERS[0])}</select>
          </div>
          <div class="form-field">
            <label class="form-label">Prioridad</label>
            <select class="form-input" name="priority">${opt(PRIORITIES, d.priority || 'Media')}</select>
          </div>
          <div class="form-field">
            <label class="form-label">Estado por defecto</label>
            <select class="form-input" name="statusDefault">${opt(STATUSES, d.statusDefault || 'Sin empezar')}</select>
          </div>
          <div class="form-field">
            <label class="form-label">Día del mes (1-28)</label>
            <input class="form-input" name="dueDay" type="number" min="1" max="28" value="${d.dueDay || 5}">
          </div>
          <div class="form-field full">
            <label class="form-label">Descripción</label>
            <textarea class="form-input" name="description" rows="3">${esc(d.description || '')}</textarea>
          </div>
        </div>
        <div class="form-actions">
          ${isEdit ? `<button type="button" class="btn-danger btn-sm" onclick="confirmDelete('template','${d.templateId}')">Eliminar</button>` : ''}
          <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar</button>
        </div>
      </form>
    </div>
  </div>`;
}

function modalConfirm(d) {
  return `
  <div class="modal" style="max-width:400px">
    <div class="modal-header">
      <div class="modal-title">${esc(d.title || 'Confirmar')}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-size:14px;color:var(--text2);margin-bottom:20px">${esc(d.message || '¿Seguro?')}</p>
      <div class="form-actions">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-danger" onclick="executeDelete('${d.entity}','${d.id}')">Eliminar</button>
      </div>
    </div>
  </div>`;
}

function confirmDelete(entity, id) {
  const names = { task: 'esta tarea', client: 'este proyecto', template: 'esta plantilla' };
  openModal('confirm', { entity, id, title: 'Eliminar', message: `¿Estás seguro de que quieres eliminar ${names[entity] || 'este elemento'}?` });
}

async function executeDelete(entity, id) {
  closeModal();
  try {
    if (entity === 'task')     await api(`/tasks/${id}`, { method: 'DELETE' });
    if (entity === 'client')   await api(`/clients/${id}`, { method: 'DELETE' });
    if (entity === 'template') await api(`/templates/${id}`, { method: 'DELETE' });

    toast('Eliminado correctamente');
    if (entity === 'client' && S.activeClient?.clientId === id) {
      S.activeClient = null;
      S.view = 'home';
    }
    await loadAll();
  } catch (err) {
    toast(err.message || 'Error al eliminar', 'err');
  }
}

/* ── Form Submit Handler ───────────────────────── */
async function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const type = form.dataset.type;
  const fd = new FormData(form);
  let data = Object.fromEntries(fd.entries());

  if (type === 'task') {
    const existing = data.taskId ? findTask(data.taskId) : null;
    data = {
      ...(existing || {}),
      ...data,
      taskId: data.taskId || '',
      owner: existing?.owner || OWNERS[0],
      status: existing?.status || 'Sin empezar',
      priority: existing?.priority || 'Media',
      taskType: existing?.taskType || 'puntual',
      category: existing?.category || 'personal',
      taskMonth: existing?.taskMonth || '',
      monthStatus: existing?.monthStatus || '',
      templateId: existing?.templateId || '',
      dueDate: existing?.dueDate || null,
      startDate: existing?.startDate || null,
      endDate: existing?.endDate || existing?.dueDate || null,
      subtasks: existing?.subtasks || [],
      tags: existing?.tags || [],
      attachments: existing?.attachments || [],
    };
  }

  try {
    if (type === 'task' && IS_PREVIEW) {
      const localTask = data.taskId
        ? { ...findTask(data.taskId), ...data }
        : { ...data, id: `local-${Date.now()}`, taskCode: 'NUEVA' };
      const foundIndex = S.allTasks.findIndex(task => (task.taskId || task.id) === (localTask.taskId || localTask.id));
      if (foundIndex >= 0) S.allTasks[foundIndex] = localTask;
      else S.allTasks = [localTask, ...S.allTasks];
      S.tasks = S.activeClient ? S.allTasks.filter(task => task.clientId === S.activeClient.clientId) : S.allTasks;
      closeModal();
      toast(data.taskId ? 'Guardado correctamente' : 'Tarea creada');
      render();
      return;
    }

    if (type === 'task')     await api('/tasks',     { method: 'POST', body: JSON.stringify(data) });
    if (type === 'client')   await api('/clients',   { method: 'POST', body: JSON.stringify(data) });
    if (type === 'template') await api('/templates', { method: 'POST', body: JSON.stringify(data) });

    closeModal();
    toast(data.taskId || data.clientId || data.templateId ? 'Guardado correctamente' : 'Creado correctamente');
    await loadAll();
  } catch (err) {
    toast(err.message || 'Error al guardar', 'err');
  }
}

/* ── Pins (Pinned tasks) ───────────────────────── */
function getPins() {
  try { return new Set(JSON.parse(localStorage.getItem('lg-pins') || '[]')); }
  catch (e) { return new Set(); }
}
function togglePin(taskId, e) {
  if (e) e.stopPropagation();
  const pins = getPins();
  if (pins.has(taskId)) pins.delete(taskId); else pins.add(taskId);
  localStorage.setItem('lg-pins', JSON.stringify([...pins]));
  render();
}

/* ── Filtering Logic ────────────────────────────── */
function getFilteredTasks() {
  let list = S.activeClient ? S.tasks : S.allTasks;

  // Workspace filter
  if (S.workspace !== 'all') {
    const clientMap = new Map(S.clients.map(c => [c.clientId, c.category || 'personal']));
    list = list.filter(t => clientMap.get(t.clientId) === S.workspace);
  }

  // Search filter
  if (S.searchQuery.trim()) {
    const q = S.searchQuery.toLowerCase();
    list = list.filter(t =>
      (t.taskName || '').toLowerCase().includes(q) ||
      (t.taskCode || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))
    );
  }

  // Tag filter
  if (S.selectedTag) {
    list = list.filter(t => (t.tags || []).includes(S.selectedTag));
  }

  return list;
}

/* ── Navigation ────────────────────────────────── */
function setView(v) {
  S.view = v;
  render();
}

function setWorkspace(ws) {
  S.workspace = ws;
  render();
}

function setTagFilter(tag) {
  S.selectedTag = S.selectedTag === tag ? '' : tag;
  render();
}

function selectClient(clientId) {
  const c = S.clients.find(x => x.clientId === clientId);
  if (!c) return;
  S.activeClient = c;
  S.view = 'project';
  S.expandedTaskId = null;
  S.tasks = S.allTasks.filter(task => task.clientId === clientId);
  render();
  loadClientTasks(clientId);
}

function goHome() {
  S.activeClient = null;
  S.view = 'home';
  render();
}

/* ── Data Fetching ─────────────────────────────── */
async function loadAll() {
  S.loading = true;
  render();
  try {
    const [clients, tasks] = await Promise.all([
      api('/clients'),
      api('/tasks'),
    ]);
    S.clients  = Array.isArray(clients) && clients.length ? clients : SEED_CLIENTS;
    S.allTasks = Array.isArray(tasks) && tasks.length ? tasks : SEED_TASKS;

    if (S.activeClient) {
      const updated = S.clients.find(c => c.clientId === S.activeClient.clientId);
      S.activeClient = updated || null;
      if (S.activeClient) await loadClientTasks(S.activeClient.clientId);
    }
  } catch (err) {
    console.error('Error loading data:', err);
    S.clients = SEED_CLIENTS;
    S.allTasks = SEED_TASKS;
  } finally {
    S.loading = false;
    render();
  }
}

async function loadClientTasks(clientId) {
  try {
    const [tasks, templates, months] = await Promise.all([
      api('/tasks/client/' + clientId),
      api('/templates/client/' + clientId),
      api('/months/client/' + clientId),
    ]);
    S.tasks     = (Array.isArray(tasks) ? tasks : []).filter(task => task.clientId === clientId);
    S.templates = templates;
    S.months    = months;
  } catch (err) {
    toast('Error cargando datos del cliente: ' + err.message, 'err');
  } finally {
    render();
  }
}

/* ── Render Main Root ──────────────────────────── */
function render() {
  const container = document.getElementById('app');
  if (container) {
    container.innerHTML = renderSidebar() + renderContent();
  }
}

/* ── Sidebar Component ─────────────────────────── */
function renderSidebar() {
  const todayStr = new Date().toISOString().substring(0, 10);

  const activeTasks = S.allTasks.filter(t => t.status !== 'Finalizada');
  const criticalCount = activeTasks.filter(t => t.priority === 'Alta' || (t.dueDate && t.dueDate < todayStr)).length;
  const pendingCount = activeTasks.length;

  const filteredClients = S.clients.filter(c => {
    if (S.workspace === 'personal') return c.category === 'personal';
    if (S.workspace === 'cliente') return c.category === 'cliente';
    return true;
  });

  const clientItems = filteredClients.map(c => {
    const active = S.activeClient?.clientId === c.clientId;
    const initials = (c.clientName || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const health = getProjectHealth(c.clientId);

    return `
    <div class="client-item${active ? ' active' : ''}" onclick="selectClient('${c.clientId}')">
      <div class="health-dot ${health.code}" title="Estado: ${health.label}"></div>
      <div class="client-avatar" style="background:${c.colorAccent || '#6366f1'}">${initials}</div>
      <span class="client-name">${esc(c.clientName)}</span>
      <div class="client-actions" onclick="event.stopPropagation()">
        <button class="client-action-btn" onclick="openModal('client',${JSON.stringify(c).replace(/"/g,'&quot;')})" title="Editar">✎</button>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="sidebar">
    <div class="sidebar-logo">
      <div class="sidebar-logo-text">LIGROW</div>
      <div class="sidebar-logo-sub">Task & Project Hub</div>
    </div>

    <!-- Selector Espacio de Trabajo -->
    <div style="padding: 12px 14px 4px;">
      <div class="workspace-tabs">
        <div class="workspace-tab ${S.workspace === 'all' ? 'active' : ''}" onclick="setWorkspace('all')">Todos</div>
        <div class="workspace-tab ${S.workspace === 'personal' ? 'active' : ''}" onclick="setWorkspace('personal')">Personal</div>
        <div class="workspace-tab ${S.workspace === 'cliente' ? 'active' : ''}" onclick="setWorkspace('cliente')">Clientes</div>
      </div>
    </div>

    <!-- Navegación Estricta: Dashboard, Proyectos, Calendario -->
    <div style="padding: 8px 8px 0;">
      <div class="sidebar-home-btn ${S.view === 'home' ? 'active' : ''}" onclick="goHome()">
        <span class="sidebar-home-icon">⌂</span>
        <span>Dashboard</span>
        ${criticalCount ? `<span class="sidebar-badge">${criticalCount}</span>` : ''}
      </div>
      <div class="sidebar-home-btn ${S.view === 'projects' ? 'active' : ''}" onclick="setView('projects')">
        <span class="sidebar-home-icon">📁</span>
        <span>Proyectos</span>
        <span style="font-size:11px;font-weight:700;color:var(--text3);margin-left:auto;">${filteredClients.length}</span>
      </div>
      <div class="sidebar-home-btn ${S.view === 'calendar' ? 'active' : ''}" onclick="setView('calendar')">
        <span class="sidebar-home-icon">📅</span>
        <span>Calendario</span>
        ${pendingCount ? `<span style="font-size:11px;font-weight:700;color:var(--text4);margin-left:auto;">${pendingCount}</span>` : ''}
      </div>
    </div>

    <div class="sidebar-section">${S.workspace === 'personal' ? 'Proyectos Personales' : S.workspace === 'cliente' ? 'Proyectos Cliente' : 'Todos los Proyectos'}</div>
    <div class="sidebar-clients">
      ${filteredClients.length ? clientItems : '<div style="padding:12px 10px;font-size:12px;color:var(--text4);">Sin proyectos</div>'}
    </div>
    <div class="sidebar-footer">
      <button class="btn-new-client" onclick="openModal('client')">＋ Nuevo proyecto</button>
    </div>
  </div>`;
}

/* ── Content Container ─────────────────────────── */
function renderContent() {
  const activeTitle = S.activeClient ? S.activeClient.clientName : (VIEW_LABELS[S.view] || 'Dashboard');

  const tabs = S.activeClient
    ? VIEWS_CLIENT.map(v => `<button class="tab ${S.view === v ? 'active' : ''}" onclick="setView('${v}')">${VIEW_LABELS[v]}</button>`).join('')
    : VIEWS_GLOBAL.map(v => `<button class="tab ${S.view === v ? 'active' : ''}" onclick="setView('${v}')">${VIEW_LABELS[v]}</button>`).join('');

  return `
  <div class="main">
    <div class="main-header">
      <div class="main-header-top">
        <div>
          <div class="main-title">${esc(activeTitle)}</div>
          ${S.activeClient?.concept ? `<div class="main-subtitle">${esc(S.activeClient.concept)}</div>` : '<div class="main-subtitle">Gestión Integral de Proyectos y Tareas Personales</div>'}
        </div>

        <!-- Buscador Global & Acción Rápida -->
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="search-box">
            <span>🔍</span>
            <input placeholder="Buscar tareas, archivos, #tags..." value="${esc(S.searchQuery)}" oninput="S.searchQuery=this.value;render();">
          </div>
          ${S.activeClient ? `<button class="btn-primary" onclick="openModal('task',{clientId:'${S.activeClient.clientId}'})">＋ Nueva tarea</button>` : ''}
        </div>
      </div>
      <div class="tabs">${tabs}</div>
    </div>
    <div class="main-content">
      ${S.loading ? '<div class="loading"><div class="spinner"></div>Cargando…</div>' : renderActiveView()}
    </div>
  </div>`;
}

function renderActiveView() {
  if (S.view === 'home')      return renderHome();
  if (S.view === 'projects')  return renderProjects();
  if (S.view === 'project')   return renderProjectWorkspace();
  if (S.view === 'calendar')  return renderCalendar();
  if (S.view === 'kanban')    return renderKanban();
  if (S.view === 'table')     return renderTable();
  if (S.view === 'gantt')     return renderGantt();
  if (S.view === 'templates') return renderTemplates();
  if (S.view === 'months')    return renderMonths();
  return '';
}

/* ── Home / Dashboard View (Limpio y Minimalista) ─────────── */
function renderLegacyHome() {
  const tasks = getFilteredTasks();
  const todayStr = new Date().toISOString().substring(0, 10);
  const in7Str   = new Date(Date.now() + 7*84600000).toISOString().substring(0, 10);

  const active = tasks.filter(t => t.status !== 'Finalizada');
  const overdue = active.filter(t => t.dueDate && t.dueDate < todayStr);
  const critical = active.filter(t => t.priority === 'Alta');
  const thisWeek = active.filter(t => t.dueDate && t.dueDate >= todayStr && t.dueDate <= in7Str);

  return `
  <div class="home-grid">
    <!-- Stat Banner Limpio -->
    <div class="home-banner">
      <div class="home-stat-card ${overdue.length ? 'home-stat-alert' : ''}">
        <div class="home-stat-num">${overdue.length}</div>
        <div class="home-stat-label">Vencidas / Críticas</div>
      </div>
      <div class="home-stat-card">
        <div class="home-stat-num">${thisWeek.length}</div>
        <div class="home-stat-label">Próximos 7 Días</div>
      </div>
      <div class="home-stat-card">
        <div class="home-stat-num">${active.length}</div>
        <div class="home-stat-label">Tareas Abiertas</div>
      </div>
      <div class="home-stat-card">
        <div class="home-stat-num">${tasks.filter(t => t.status === 'Finalizada').length}</div>
        <div class="home-stat-label">Completadas</div>
      </div>
    </div>

    <!-- Tareas Vencidas y Críticas -->
    <div style="display:flex;flex-direction:column;gap:20px;">
      ${overdue.length || critical.length ? `
        <div class="home-section">
          <div class="home-section-title home-section-alert">🚨 Prioridades Críticas & Vencidas (${overdue.length + critical.length})</div>
          <div class="home-task-list">
            ${[...new Set([...overdue, ...critical])].map(t => renderHomeTaskRow(t, true)).join('')}
          </div>
        </div>
      ` : ''}

      <div class="home-section">
        <div class="home-section-title">📋 Tareas para esta semana (${thisWeek.length})</div>
        <div class="home-task-list">
          ${thisWeek.length ? thisWeek.map(t => renderHomeTaskRow(t)).join('') : '<div class="home-empty">No hay tareas urgentes programadas. ¡Todo ordenado!</div>'}
        </div>
      </div>
    </div>
  </div>`;
}

function renderHomeTaskRow(t, isAlert = false) {
  const pins = getPins();
  const isPinned = pins.has(t.taskId);
  const subtasks = t.subtasks || [];
  const completedSub = subtasks.filter(s => s.completed).length;
  const attachments = t.attachments || [];

  return `
  <div class="home-task-row" onclick="openModal('task', ${JSON.stringify(t).replace(/"/g,'&quot;')})">
    <div class="home-task-date ${isAlert ? 'overdue' : ''}">${t.dueDate || 'Sin fecha'}</div>
    <div>
      <div class="home-task-name">${esc(t.taskName)}</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:4px;">
        ${subtasks.length ? `
          <div class="subtasks-progress" style="margin-top:0;">
            <div class="progress-bar-sm"><div class="progress-fill-sm" style="width:${(completedSub/subtasks.length)*100}%"></div></div>
            <span>${completedSub}/${subtasks.length}</span>
          </div>
        ` : ''}
        ${attachments.length ? `<span style="font-size:11px;color:var(--text3);">📎 ${attachments.length} adjuntos</span>` : ''}
      </div>
    </div>
    <div class="badge badge-pri-${(t.priority || 'media').toLowerCase()}">${t.priority}</div>
    <div class="home-tag">${t.owner || '—'}</div>
    <button class="pin-btn ${isPinned ? 'pinned' : ''}" onclick="togglePin('${t.taskId}', event)">★</button>
  </div>`;
}

/* ── Projects View (Project Hub con Semáforo) ──── */
function renderProjectFolders() {
  const filtered = S.clients.filter(c => {
    if (S.workspace === 'personal') return c.category === 'personal';
    if (S.workspace === 'cliente') return c.category === 'cliente';
    return true;
  });

  return `
  <div class="home-clients-grid">
    ${filtered.map(c => {
      const clientTasks = S.allTasks.filter(t => t.clientId === c.clientId);
      const ready = clientTasks.filter(t => t.status === 'Finalizada').length;
      const pct = clientTasks.length ? Math.round((ready / clientTasks.length) * 100) : (c.progressPct || 0);
      const health = getProjectHealth(c.clientId);

      return `
      <div class="home-client-card" onclick="selectClient('${c.clientId}')">
        <div class="home-client-header">
          <div class="client-avatar" style="background:${c.colorAccent || '#6366f1'}">${c.clientCode || 'PROJ'}</div>
          <div style="flex:1;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div class="home-client-name">${esc(c.clientName)}</div>
              <span class="health-badge ${health.code}">${health.label}</span>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;">${c.category === 'personal' ? 'Proyecto Personal' : 'Proyecto Cliente'}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:12px;">${esc(c.concept || 'Sin descripción')}</div>

        <!-- Barra de Progreso -->
        <div class="bar-item" style="margin-bottom:12px;">
          <div class="bar-info"><span>Progreso</span><span>${pct}%</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>

        <div class="home-client-stats">
          <div class="home-client-stat">
            <div class="home-client-num">${clientTasks.length}</div>
            <div class="home-client-label">Total Tareas</div>
          </div>
          <div class="home-client-stat">
            <div class="home-client-num home-num-warn">${clientTasks.filter(t => t.status === 'En edición').length}</div>
            <div class="home-client-label">En edición</div>
          </div>
          <div class="home-client-stat">
            <div class="home-client-num" style="color:var(--status-listo)">${ready}</div>
            <div class="home-client-label">Completadas</div>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderHome() {
  return `
  <div class="projects-home">
    <div class="projects-home-intro">
      <div>
        <div class="eyebrow">Espacio de trabajo</div>
        <h2>Carpetas de proyectos</h2>
        <p>Entra en una carpeta para consultar el contexto, los recursos y todas las tareas operativas.</p>
      </div>
      <button class="btn-primary" onclick="openModal('client')">＋ Nuevo proyecto</button>
    </div>
    ${renderProjectFolders()}
  </div>`;
}

function renderProjects() {
  return `<div class="projects-home compact"><div class="projects-home-intro"><div><div class="eyebrow">Organización</div><h2>Todos los proyectos</h2></div></div>${renderProjectFolders()}</div>`;
}

function taskCount(task, completed = false) {
  const items = task.subtasks || [];
  return completed ? items.filter(item => item.completed).length : items.length;
}

function formatTaskDate(value) {
  if (!value) return 'Sin fecha';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function getTaskEndDate(task = {}) {
  return task.endDate || task.dueDate || '';
}

function taskTone(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function getProjectTasks() {
  const status = S.projectFilters.status;
  const priority = S.projectFilters.priority;
  const query = S.searchQuery.trim().toLowerCase();
  const source = S.activeClient
    ? S.allTasks.filter(task => task.clientId === S.activeClient.clientId)
    : getFilteredTasks();
  return source.filter(task =>
    (!status || task.status === status) &&
    (!priority || task.priority === priority) &&
    (!query || `${task.taskName || ''} ${task.description || ''}`.toLowerCase().includes(query))
  );
}

function setProjectFilter(field, value) {
  S.projectFilters[field] = value;
  render();
}

function toggleProjectTask(taskId) {
  S.expandedTaskId = S.expandedTaskId === taskId ? null : taskId;
  render();
}

function findTask(taskId) {
  return S.allTasks.find(task => task.taskId === taskId || task.id === taskId) || S.tasks.find(task => task.taskId === taskId || task.id === taskId);
}

async function persistInlineTask(task) {
  try {
    await api('/tasks', { method: 'POST', body: JSON.stringify(task) });
  } catch (error) {
    toast(error.message || 'No se ha podido guardar la tarea', 'err');
  }
}

async function updateInlineTask(taskId, field, value) {
  const task = findTask(taskId);
  if (!task) return;
  task[field] = value;
  await persistInlineTask(task);
  render();
}

async function updateTaskEndDate(taskId, value) {
  const task = findTask(taskId);
  if (!task) return;
  task.endDate = value || null;
  task.dueDate = value || null;
  await persistInlineTask(task);
  render();
}

async function toggleInlineSubtask(taskId, subtaskId) {
  const task = findTask(taskId);
  const item = task?.subtasks?.find(subtask => subtask.id === subtaskId);
  if (!item) return;
  item.completed = !item.completed;
  await persistInlineTask(task);
  render();
}

async function addInlineSubtask(event, taskId) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('input');
  const task = findTask(taskId);
  if (!task || !input?.value.trim()) return;
  task.subtasks = [...(task.subtasks || []), { id: `sub-${Date.now()}`, text: input.value.trim(), completed: false }];
  await persistInlineTask(task);
  render();
}

async function addInlineAttachment(event, taskId, kind = 'link') {
  event.preventDefault();
  const form = event.currentTarget;
  const [title, url] = form.querySelectorAll('input');
  const task = findTask(taskId);
  if (!task || !url?.value.trim()) return;
  task.attachments = [...(task.attachments || []), { title: title.value.trim() || url.value.trim(), url: url.value.trim(), kind }];
  await persistInlineTask(task);
  render();
}

function splitTaskAttachments(task = {}) {
  const attachments = task.attachments || [];
  const isLink = item => item.kind === 'link' || (!item.kind && /^https?:\/\//i.test(item.url || ''));
  return {
    files: attachments.filter(item => !isLink(item)),
    links: attachments.filter(isLink),
  };
}

function renderProjectWorkspace() {
  const client = S.activeClient;
  if (!client) return renderHome();

  const allTasks = S.allTasks.filter(task => task.clientId === client.clientId);
  const tasks = getProjectTasks();
  const today = new Date().toISOString().slice(0, 10);
  const open = allTasks.filter(task => task.status !== 'Finalizada');
  const endingSoon = open.filter(task => getTaskEndDate(task) && getTaskEndDate(task) < today);
  const resources = allTasks.flatMap(task => (task.attachments || []).map(file => ({ ...file, taskName: task.taskName })));
  const health = getProjectHealth(client.clientId);

  return `
  <div class="project-workspace minimal-workspace">
    <section class="project-hero">
      <div>
        <div class="eyebrow">Proyecto</div>
        <div class="project-heading"><span class="project-folder-icon">⌁</span><h2>${esc(client.clientName)}</h2></div>
        <p>${esc(client.summary || client.concept || 'Centraliza las tareas, documentación y seguimiento del proyecto.')}</p>
      </div>
      <div class="project-hero-side"><span class="health-badge ${health.code}">${health.label}</span><span class="project-code">${esc(client.clientCode || 'PROY')}</span></div>
    </section>

    <div class="project-overview-grid project-context-grid">
      <section class="project-panel resource-panel">
        <div class="panel-heading"><span>▧</span><h3>Documentos y recursos</h3><small>${resources.length} vinculados</small></div>
        ${resources.length ? `<div class="resource-list">${resources.slice(0, 3).map(resource => `<a class="resource-item" href="${esc(resource.url || '#')}" target="_blank" onclick="event.stopPropagation()"><span>${resource.kind === 'link' || /^https?:\/\//i.test(resource.url || '') ? '↗' : '▧'}</span><strong>${esc(resource.title || resource.name || resource.url || 'Recurso')}</strong><small>${esc(resource.taskName)}</small></a>`).join('')}</div>` : '<div class="panel-empty">Los archivos y enlaces de las tareas aparecerán aquí.</div>'}
      </section>
      <section class="project-panel reminders-panel">
        <div class="panel-heading"><span>◷</span><h3>Recordatorios</h3><small>${open.length} activos</small></div>
        <div class="reminder-list">${open.length ? open.slice(0, 3).map(task => `<button class="reminder-item" onclick="toggleProjectTask('${task.taskId || task.id}')"><span class="priority-dot ${(task.priority || 'Media').toLowerCase()}"></span><strong>${esc(task.taskName)}</strong><small>${formatTaskDate(getTaskEndDate(task))}</small></button>`).join('') : '<div class="panel-empty">No hay recordatorios activos.</div>'}</div>
      </section>
    </div>

    <div class="project-metrics project-state-summary">
      <button type="button" class="project-metric" onclick="setProjectFilter('status','')"><strong>${allTasks.length}</strong><span>Total</span></button>
      <button type="button" class="project-metric" onclick="setProjectFilter('status','Sin empezar')"><strong>${allTasks.filter(task => task.status === 'Sin empezar').length}</strong><span>Sin empezar</span></button>
      <button type="button" class="project-metric" onclick="setProjectFilter('status','En edición')"><strong>${allTasks.filter(task => task.status === 'En edición').length}</strong><span>En edición</span></button>
      <button type="button" class="project-metric" onclick="setProjectFilter('status','En producción')"><strong>${allTasks.filter(task => task.status === 'En producción').length}</strong><span>En producción</span></button>
      <button type="button" class="project-metric" onclick="setProjectFilter('status','Finalizada')"><strong>${allTasks.filter(task => task.status === 'Finalizada').length}</strong><span>Finalizadas</span></button>
    </div>

    <section class="project-tasks-section">
      <div class="tasks-section-heading"><div><div class="eyebrow">Seguimiento</div><h3>Tareas</h3><p>${open.length} activas${endingSoon.length ? ` · ${endingSoon.length} con fecha vencida` : ''}</p></div><div class="task-view-actions"><button class="btn-primary" onclick="openModal('task',{clientId:'${client.clientId}'})">＋ Nueva tarea</button><button class="btn-secondary btn-sm" onclick="setView('kanban')">Ver Kanban</button></div></div>
      <div class="project-filter-bar"><div class="inline-search">⌕<input placeholder="Buscar tareas…" value="${esc(S.searchQuery)}" oninput="S.searchQuery=this.value;render()"></div><select onchange="setProjectFilter('status',this.value)"><option value="">Estado: todos</option>${STATUSES.map(status => `<option value="${status}"${S.projectFilters.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select><select onchange="setProjectFilter('priority',this.value)"><option value="">Prioridad: todas</option>${PRIORITIES.map(priority => `<option value="${priority}"${S.projectFilters.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}</select></div>
      <div class="project-task-list"><div class="project-task-list-head"><span>Tarea</span><span>Fecha de fin</span><span>Prioridad</span><span>Estado</span></div>${tasks.length ? tasks.map(renderProjectTask).join('') : '<div class="panel-empty">No hay tareas que coincidan con los filtros.</div>'}</div>
    </section>
  </div>`;
}

function renderProjectTask(task) {
  const taskId = task.taskId || task.id;
  const isExpanded = S.expandedTaskId === taskId;
  const endDate = getTaskEndDate(task);
  const statusTone = taskTone(task.status);
  const priorityTone = taskTone(task.priority);
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(item => item.completed).length;
  const { files, links } = splitTaskAttachments(task);
  return `
  <article class="project-task ${isExpanded ? 'expanded' : ''}">
    <div class="project-task-row">
      <button class="task-expand" aria-label="Desplegar tarea" onclick="toggleProjectTask('${taskId}')">${isExpanded ? '⌃' : '⌄'}</button>
      <div class="project-task-main">
        <button class="project-task-name" onclick="toggleProjectTask('${taskId}')"><strong>${esc(task.taskName)}</strong><span>${esc(task.description || 'Añade una breve descripción para dar contexto a la tarea.')}</span></button>
        <div class="task-elements" aria-label="Elementos de la tarea">
          <button type="button" onclick="toggleProjectTask('${taskId}')">☑ Checklist ${completedSubtasks}/${subtasks.length}</button>
          <button type="button" onclick="toggleProjectTask('${taskId}')">↗ Enlaces ${links.length}</button>
          <button type="button" onclick="toggleProjectTask('${taskId}')">▧ Archivos ${files.length}</button>
        </div>
      </div>
      <label class="task-date-control"><span>Fecha de fin</span><input type="date" value="${esc(endDate)}" onchange="updateTaskEndDate('${taskId}',this.value)"></label>
      <select class="task-inline-select priority-select priority-${priorityTone}" aria-label="Prioridad" onclick="event.stopPropagation()" onchange="updateInlineTask('${taskId}','priority',this.value)">${PRIORITIES.map(priority => `<option${task.priority === priority ? ' selected' : ''}>${priority}</option>`).join('')}</select>
      <select class="task-inline-select status-select status-${statusTone}" aria-label="Estado" onclick="event.stopPropagation()" onchange="updateInlineTask('${taskId}','status',this.value)">${STATUSES.map(status => `<option${task.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select>
    </div>
    ${isExpanded ? `<div class="project-task-detail project-task-detail-rich">
      <div class="task-detail-card"><h4>Descripción</h4><textarea placeholder="Explica el objetivo y el resultado esperado." onchange="updateInlineTask('${taskId}','description',this.value)">${esc(task.description || '')}</textarea><p>Los cambios se guardan al salir del campo.</p></div>
      <div class="task-detail-card"><h4>Checklist</h4><div class="inline-checklist">${subtasks.length ? subtasks.map(item => `<label><input type="checkbox"${item.completed ? ' checked' : ''} onchange="toggleInlineSubtask('${taskId}','${item.id}')"><span>${esc(item.text || item.title || '')}</span></label>`).join('') : '<p>Sin elementos todavía.</p>'}</div><form class="inline-add" onsubmit="addInlineSubtask(event,'${taskId}')"><input placeholder="Añadir elemento…"><button type="submit" aria-label="Añadir elemento">＋</button></form></div>
      <div class="task-detail-card"><h4>Archivos</h4>${files.length ? `<div class="inline-resource-list">${files.map(file => `<a href="${esc(file.url || '#')}" target="_blank">▧ ${esc(file.title || file.name || file.url)}</a>`).join('')}</div>` : '<p>Sin archivos vinculados.</p>'}<form class="inline-link-form" onsubmit="addInlineAttachment(event,'${taskId}','file')"><input placeholder="Nombre del archivo"><input placeholder="URL del archivo"><button type="submit" aria-label="Añadir archivo">＋</button></form></div>
      <div class="task-detail-card"><h4>Enlaces</h4>${links.length ? `<div class="inline-resource-list">${links.map(link => `<a href="${esc(link.url || '#')}" target="_blank">↗ ${esc(link.title || link.name || link.url)}</a>`).join('')}</div>` : '<p>Sin enlaces vinculados.</p>'}<form class="inline-link-form" onsubmit="addInlineAttachment(event,'${taskId}','link')"><input placeholder="Nombre del enlace"><input placeholder="https://…"><button type="submit" aria-label="Añadir enlace">＋</button></form></div>
    </div>` : ''}
  </article>`;
}

/* ── Calendar View ─────────────────────────────── */
function renderCalendar() {
  const date = S.calendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const tasks = getFilteredTasks();
  const todayStr = new Date().toISOString().substring(0, 10);

  let cells = [];

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1;
    const isCurrentMonth = dayNum > 0 && dayNum <= lastDay.getDate();
    let cellDateStr = '';

    if (isCurrentMonth) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(dayNum).padStart(2, '0');
      cellDateStr = `${year}-${mStr}-${dStr}`;
    }

    const dayTasks = isCurrentMonth ? tasks.filter(t => t.dueDate === cellDateStr) : [];
    const isToday = cellDateStr === todayStr;

    cells.push(`
      <div class="calendar-cell ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''}">
        <div class="calendar-date-num">${isCurrentMonth ? dayNum : ''}</div>
        ${dayTasks.map(t => `
          <div class="calendar-task-chip ${t.status.toLowerCase().replace(' ', '-')}" onclick="openModal('task',${JSON.stringify(t).replace(/"/g,'&quot;')})">
            ${esc(t.taskName)}
          </div>
        `).join('')}
      </div>
    `);
  }

  return `
  <div class="calendar-view">
    <div class="calendar-header">
      <div class="calendar-title">${monthNames[month]} ${year}</div>
      <div class="calendar-controls">
        <button class="btn-secondary btn-sm" onclick="changeMonth(-1)">◀ Anterior</button>
        <button class="btn-secondary btn-sm" onclick="S.calendarDate=new Date();render();">Hoy</button>
        <button class="btn-secondary btn-sm" onclick="changeMonth(1)">Siguiente ▶</button>
      </div>
    </div>
    <div class="calendar-grid">
      <div class="calendar-day-header">Lun</div>
      <div class="calendar-day-header">Mar</div>
      <div class="calendar-day-header">Mié</div>
      <div class="calendar-day-header">Jue</div>
      <div class="calendar-day-header">Vie</div>
      <div class="calendar-day-header">Sáb</div>
      <div class="calendar-day-header">Dom</div>
      ${cells.join('')}
    </div>
  </div>`;
}

function changeMonth(delta) {
  const d = new Date(S.calendarDate);
  d.setMonth(d.getMonth() + delta);
  S.calendarDate = d;
  render();
}

/* ── Kanban View ───────────────────────────────── */
function renderKanban() {
  return `<div class="kanban">
    ${STATUSES.map(s => renderKanbanCol(s)).join('')}
  </div>`;
}

function renderKanbanCol(status) {
  const allTasks = getFilteredTasks();
  const tasks = allTasks.filter(t => t.status === status);
  const colClass = { 'Sin empezar': 'col-sin-empezar', 'En edición': 'col-edicion', 'En producción': 'col-produccion', 'Finalizada': 'col-finalizada' }[status] || '';
  return `
  <div class="kanban-col ${colClass}">
    <div class="kanban-col-header">
      <div class="kanban-col-title">
        <div class="kanban-col-dot"></div>
        ${status}
      </div>
      <span class="kanban-count">${tasks.length}</span>
    </div>
    <div class="kanban-cards">
      ${tasks.length ? tasks.map(t => renderTaskCard(t)).join('') : `<div style="padding:16px 6px;font-size:12px;color:var(--text4);text-align:center;">Sin tareas</div>`}
    </div>
    <button class="kanban-add-btn" onclick="openModal('task',{status:'${status}'})">＋ Añadir tarea</button>
  </div>`;
}

function renderTaskCard(t) {
  const pins = getPins();
  const isPinned = pins.has(t.taskId);
  const subtasks = t.subtasks || [];
  const completedSub = subtasks.filter(s => s.completed).length;
  const tags = t.tags || [];
  const attachments = t.attachments || [];

  return `
  <div class="kanban-card" onclick="openModal('task', ${JSON.stringify(t).replace(/"/g,'&quot;')})">
    <div class="kanban-card-top">
      <span class="kanban-card-code">${t.taskCode || ''}</span>
      <button class="pin-btn ${isPinned ? 'pinned' : ''}" onclick="togglePin('${t.taskId}', event)">★</button>
    </div>
    <div class="kanban-card-title">${esc(t.taskName)}</div>

    ${subtasks.length ? `
      <div class="subtasks-progress" onclick="event.stopPropagation()">
        <div class="progress-bar-sm"><div class="progress-fill-sm" style="width:${(completedSub/subtasks.length)*100}%"></div></div>
        <span>${completedSub}/${subtasks.length}</span>
      </div>
    ` : ''}

    ${attachments.length ? `
      <div style="font-size:11px;color:var(--text3);margin-top:6px;">📎 ${attachments.length} archivo(s)/enlace(s)</div>
    ` : ''}

    ${tags.length ? `
      <div class="task-tags">
        ${tags.map(tg => `<span class="tag-badge" onclick="event.stopPropagation();setTagFilter('${tg}')">${esc(tg)}</span>`).join('')}
      </div>
    ` : ''}

    <div class="kanban-card-footer">
      <div class="badge badge-pri-${(t.priority || 'media').toLowerCase()}">${t.priority}</div>
      <div style="font-size:11px;color:var(--text3);">${t.owner || ''}</div>
    </div>
  </div>`;
}

/* ── Table View ────────────────────────────────── */
function renderTable() {
  const tasks = getFilteredTasks();
  return `
  <div style="overflow-x:auto;">
    <table class="table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Tarea</th>
          <th>Responsable</th>
          <th>Estado</th>
          <th>Prioridad</th>
          <th>Vencimiento</th>
          <th>Subtareas</th>
          <th>Adjuntos</th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(t => {
          const subtasks = t.subtasks || [];
          const completedSub = subtasks.filter(s => s.completed).length;
          const attachments = t.attachments || [];
          return `
          <tr onclick="openModal('task', ${JSON.stringify(t).replace(/"/g,'&quot;')})" style="cursor:pointer">
            <td style="font-weight:700;color:var(--orange)">${t.taskCode || '—'}</td>
            <td style="font-weight:600">${esc(t.taskName)}</td>
            <td>${t.owner || '—'}</td>
            <td><span class="badge badge-status-${t.status.toLowerCase().replace(' ', '-')}">${t.status}</span></td>
            <td><span class="badge badge-pri-${t.priority.toLowerCase()}">${t.priority}</span></td>
            <td>${t.dueDate || '—'}</td>
            <td>${subtasks.length ? `${completedSub}/${subtasks.length}` : '—'}</td>
            <td>${attachments.length ? `📎 ${attachments.length}` : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ── Gantt View ────────────────────────────────── */
function renderGantt() {
  const tasks = getFilteredTasks().filter(t => t.startDate && t.dueDate);
  if (!tasks.length) return `<div class="empty-state"><h3>Sin fechas de cronograma</h3><p>Asigna fecha de inicio y entrega a las tareas para ver el cronograma.</p></div>`;

  return `
  <div style="display:flex;flex-direction:column;gap:12px;">
    ${tasks.map(t => `
      <div style="background:var(--card);padding:12px 16px;border-radius:var(--radius);border:1px solid var(--border);display:flex;align-items:center;gap:16px;">
        <div style="width:200px;font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.taskName)}</div>
        <div style="flex:1;background:rgba(255,255,255,0.05);height:24px;border-radius:12px;position:relative;overflow:hidden;">
          <div style="position:absolute;left:10%;width:60%;height:100%;background:var(--grad);border-radius:12px;display:flex;align-items:center;padding:0 12px;font-size:11px;font-weight:700;">
            ${t.startDate} → ${t.dueDate}
          </div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

/* ── Templates & Months Views ──────────────────── */
function renderTemplates() {
  return `<div class="home-empty">Plantillas de tareas cargadas.</div>`;
}
function renderMonths() {
  return `<div class="home-empty">Historial mensual cargado.</div>`;
}

/* ── Init App ──────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAll);
} else {
  loadAll();
}
