/* ── State ─────────────────────────────────────── */
const S = {
  clients:     [],
  tasks:       [],
  templates:   [],
  months:      [],
  allTasks:    [],
  activeClient: null,
  view:        'home',
  loading:     false,
  modal:       null,
};

const OWNERS     = ['Jesús', 'Blanca', 'Alejandro'];
const STATUSES   = ['En curso', 'Detenido', 'Listo'];
const PRIORITIES = ['Alta', 'Media', 'Baja'];
const VIEWS      = ['kanban', 'table', 'gantt', 'templates', 'months'];
const VIEW_LABELS = { kanban:'Kanban', table:'Tabla', gantt:'Gantt', templates:'Plantillas', months:'Meses' };

const app = document.getElementById('app');

/* ── API ───────────────────────────────────────── */
async function api(url, opts = {}) {
  const res = await fetch('/api' + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return res.json();
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
function openModal(type, data = {}) {
  S.modal = { type, data };
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
  const isEdit = !!d.taskId;
  const opt = (arr, val) => arr.map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('');
  const val = k => d[k] ? ` value="${esc(d[k])}"` : '';
  return `
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Editar tarea' : 'Nueva tarea'}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form id="task-form" data-type="task">
        <input type="hidden" name="taskId" value="${d.taskId || ''}">
        <input type="hidden" name="clientId" value="${S.activeClient?.clientId || ''}">
        <div class="form-grid">
          <div class="form-field full">
            <label class="form-label">Nombre de la tarea *</label>
            <input class="form-input" name="taskName" required placeholder="¿Qué hay que hacer?"${val('taskName')}>
          </div>
          <div class="form-field">
            <label class="form-label">Responsable</label>
            <select class="form-input" name="owner">${opt(OWNERS, d.owner || OWNERS[0])}</select>
          </div>
          <div class="form-field">
            <label class="form-label">Estado</label>
            <select class="form-input" name="status">${opt(STATUSES, d.status || 'En curso')}</select>
          </div>
          <div class="form-field">
            <label class="form-label">Prioridad</label>
            <select class="form-input" name="priority">${opt(PRIORITIES, d.priority || 'Media')}</select>
          </div>
          <div class="form-field">
            <label class="form-label">Tipo</label>
            <select class="form-input" name="taskType" onchange="toggleMonthField(this)">
              <option value="puntual"${d.taskType !== 'mensual' ? ' selected' : ''}>Puntual</option>
              <option value="mensual"${d.taskType === 'mensual' ? ' selected' : ''}>Mensual</option>
            </select>
          </div>
          <div class="form-field" id="field-taskMonth" style="display:none">
            <label class="form-label">Mes (YYYY-MM)</label>
            <input class="form-input" name="taskMonth" type="month"${val('taskMonth')}>
          </div>
          <div class="form-field">
            <label class="form-label">Fecha de vencimiento</label>
            <input class="form-input" name="dueDate" type="date"${val('dueDate')}>
          </div>
          <div class="form-field">
            <label class="form-label">Fecha de inicio</label>
            <input class="form-input" name="startDate" type="date"${val('startDate')}>
          </div>
          <div class="form-field">
            <label class="form-label">Fecha de fin</label>
            <input class="form-input" name="endDate" type="date"${val('endDate')}>
          </div>
          <div class="form-field full">
            <label class="form-label">Descripción</label>
            <textarea class="form-input" name="description" rows="3" placeholder="Detalles opcionales…">${esc(d.description || '')}</textarea>
          </div>
        </div>
        <div class="form-actions">
          ${isEdit ? `<button type="button" class="btn-danger btn-sm" onclick="confirmDelete('task','${d.taskId}')">Eliminar</button>` : ''}
          <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn-primary">Guardar</button>
        </div>
      </form>
    </div>
  </div>`;
}

function toggleMonthField(sel) {
  const f = document.getElementById('field-taskMonth');
  if (f) f.style.display = sel.value === 'mensual' ? 'flex' : 'none';
}

/* ── Modal: Client ─────────────────────────────── */
function modalClient(d = {}) {
  const isEdit = !!d.clientId;
  const val = k => d[k] ? ` value="${esc(d[k])}"` : '';
  return `
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Editar cliente' : 'Nuevo cliente'}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <form id="client-form" data-type="client">
        <input type="hidden" name="clientId" value="${d.clientId || ''}">
        <div class="form-grid">
          <div class="form-field full">
            <label class="form-label">Nombre del cliente *</label>
            <input class="form-input" name="clientName" required placeholder="Nombre de la marca o empresa"${val('clientName')}>
          </div>
          <div class="form-field">
            <label class="form-label">Código (auto si vacío)</label>
            <input class="form-input" name="clientCode" placeholder="BRAND" maxlength="6"${val('clientCode')}>
          </div>
          <div class="form-field">
            <label class="form-label">Fecha de inicio</label>
            <input class="form-input" name="kickoffDate" type="date"${val('kickoffDate')}>
          </div>
          <div class="form-field full">
            <label class="form-label">Concepto / Servicio</label>
            <input class="form-input" name="concept" placeholder="ej: SEO + Diseño web"${val('concept')}>
          </div>
          <div class="form-field full">
            <label class="form-label">Resumen</label>
            <textarea class="form-input" name="summary" rows="3" placeholder="Descripción breve del proyecto…">${esc(d.summary || '')}</textarea>
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

/* ── Modal: Template ───────────────────────────── */
function modalTemplate(d = {}) {
  const isEdit = !!d.templateId;
  const opt = (arr, val) => arr.map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('');
  const v = k => d[k] ? ` value="${esc(d[k])}"` : '';
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
            <input class="form-input" name="templateName" required placeholder="ej: Informe mensual de resultados"${v('templateName')}>
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
            <select class="form-input" name="statusDefault">${opt(STATUSES, d.statusDefault || 'En curso')}</select>
          </div>
          <div class="form-field">
            <label class="form-label">Día de vencimiento (1–31)</label>
            <input class="form-input" name="dueDay" type="number" min="1" max="31" placeholder="5"${v('dueDay')}>
          </div>
          <div class="form-field full">
            <label class="form-label">Descripción</label>
            <textarea class="form-input" name="description" rows="2" placeholder="Detalles de la tarea mensual…">${esc(d.description || '')}</textarea>
          </div>
          <div class="form-field full" style="flex-direction:row;align-items:center;gap:10px;">
            <input type="checkbox" name="isActive" id="chk-active" style="width:16px;height:16px;accent-color:var(--orange);"${d.isActive !== false ? ' checked' : ''}>
            <label for="chk-active" class="form-label" style="margin:0;cursor:pointer;">Plantilla activa</label>
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

/* ── Modal: Confirm ────────────────────────────── */
function modalConfirm(d = {}) {
  return `
  <div class="modal modal-sm">
    <div class="modal-header">
      <div class="modal-title">Confirmar eliminación</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="confirm-icon">🗑️</div>
      <p class="confirm-msg">${d.msg || '¿Eliminar este elemento?'}</p>
      <p class="confirm-sub">Esta acción no se puede deshacer.</p>
      <div class="form-actions" style="justify-content:center;">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-danger" onclick="(${d.onConfirm})()">Eliminar</button>
      </div>
    </div>
  </div>`;
}

function confirmDelete(type, id) {
  const msgs = { task: 'Se eliminará la tarea y sus comentarios.', client: 'Se eliminará el cliente y TODAS sus tareas, plantillas y meses.', template: 'Se eliminará la plantilla.' };
  const actions = {
    task:     `async function(){ closeModal(); const r=await api('/tasks/${id}',{method:'DELETE'}); if(r.ok){toast('Tarea eliminada'); await loadClientData(S.activeClient.clientId); render();} else toast(r.error||'Error','err'); }`,
    client:   `async function(){ closeModal(); const r=await api('/clients/${id}',{method:'DELETE'}); if(r.ok){toast('Cliente eliminado'); S.activeClient=null; await loadClients(); render();} else toast(r.error||'Error','err'); }`,
    template: `async function(){ closeModal(); const r=await api('/templates/${id}',{method:'DELETE'}); if(r.ok){toast('Plantilla eliminada'); await loadClientData(S.activeClient.clientId); render();} else toast(r.error||'Error','err'); }`,
  };
  openModal('confirm', { msg: msgs[type], onConfirm: actions[type] });
}

/* ── Form submit handler ───────────────────────── */
async function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const type = form.dataset.type;
  const data = Object.fromEntries(new FormData(form));

  if (type === 'task') {
    if (!data.taskId) delete data.taskId;
    if (data.taskType !== 'mensual') { data.taskMonth = ''; data.monthStatus = ''; }
    const r = await api('/tasks', { method: 'POST', body: JSON.stringify(data) });
    if (r.error) { toast(r.error, 'err'); return; }
    toast(data.taskId ? 'Tarea actualizada' : 'Tarea creada');
    closeModal();
    await loadClientData(S.activeClient.clientId);
    await refreshAllTasks();
    render();
  }

  if (type === 'client') {
    const isEdit = !!data.clientId;
    const url = isEdit ? `/clients/${data.clientId}` : '/clients';
    const method = isEdit ? 'PUT' : 'POST';
    if (!isEdit) delete data.clientId;
    const r = await api(url, { method, body: JSON.stringify(data) });
    if (r.error) { toast(r.error, 'err'); return; }
    toast(isEdit ? 'Cliente actualizado' : 'Cliente creado');
    closeModal();
    await loadClients();
    if (!isEdit) { S.activeClient = S.clients.find(c => c.clientId === r.clientId) || null; }
    if (S.activeClient) await loadClientData(S.activeClient.clientId);
    render();
  }

  if (type === 'template') {
    data.isActive = form.querySelector('[name="isActive"]').checked;
    if (!data.templateId) delete data.templateId;
    const r = await api('/templates', { method: 'POST', body: JSON.stringify(data) });
    if (r.error) { toast(r.error, 'err'); return; }
    toast(data.templateId ? 'Plantilla actualizada' : 'Plantilla creada');
    closeModal();
    await loadClientData(S.activeClient.clientId);
    render();
  }
}

/* ── Data loading ──────────────────────────────── */
async function loadClients() {
  const r = await api('/clients');
  S.clients = Array.isArray(r) ? r : [];
  if (S.activeClient) {
    S.activeClient = S.clients.find(c => c.clientId === S.activeClient.clientId) || null;
  }
}

async function loadClientData(clientId) {
  const [tasks, templates, months] = await Promise.all([
    api('/tasks/client/' + clientId),
    api('/templates/' + clientId),
    api('/months/' + clientId),
  ]);
  S.tasks     = Array.isArray(tasks)     ? tasks     : [];
  S.templates = Array.isArray(templates) ? templates : [];
  S.months    = Array.isArray(months)    ? months    : [];
}

async function refreshAllTasks() {
  const r = await api('/tasks');
  S.allTasks = Array.isArray(r) ? r : [];
}

async function selectClient(id) {
  S.activeClient = S.clients.find(c => c.clientId === id) || null;
  S.view = 'kanban';
  S.loading = true;
  render();
  await loadClientData(id);
  S.loading = false;
  render();
}

function setView(v) { S.view = v; render(); }

/* ── Inicio / Home ─────────────────────────────── */
async function goHome() {
  S.activeClient = null;
  S.view = 'home';
  S.loading = true;
  render();
  await Promise.all([loadClients(), refreshAllTasks()]);
  S.loading = false;
  render();
}

function togglePin(taskId) {
  const pins = new Set(JSON.parse(localStorage.getItem('lg-pins') || '[]'));
  if (pins.has(taskId)) pins.delete(taskId); else pins.add(taskId);
  localStorage.setItem('lg-pins', JSON.stringify([...pins]));
  render();
}

/* ── Render ────────────────────────────────────── */
function render() {
  if (S.view === 'home') {
    app.innerHTML = renderSidebar() + renderHome();
  } else {
    app.innerHTML = renderSidebar() + renderMain();
  }
}

/* ── Sidebar ───────────────────────────────────── */
function renderSidebar() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdueCount = S.allTasks.filter(t => t.status !== 'Listo' && t.dueDate && new Date(t.dueDate) < today).length;
  const isHome = S.view === 'home';

  const items = S.clients.map(c => {
    const active = S.activeClient?.clientId === c.clientId;
    const initials = (c.clientName || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return `
    <div class="client-item${active ? ' active' : ''}" onclick="selectClient('${c.clientId}')">
      <div class="client-avatar">${initials}</div>
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
      <div class="sidebar-logo-sub">Tasks</div>
    </div>
    <div class="sidebar-home-btn${isHome ? ' active' : ''}" onclick="goHome()">
      <span class="sidebar-home-icon">⌂</span>
      <span>Inicio</span>
      ${overdueCount ? `<span class="sidebar-badge">${overdueCount}</span>` : ''}
    </div>
    <div class="sidebar-section">Clientes</div>
    <div class="sidebar-clients">
      ${S.clients.length ? items : '<div style="padding:12px 10px;font-size:12px;color:var(--text4);">Sin clientes todavía</div>'}
    </div>
    <div class="sidebar-footer">
      <button class="btn-new-client" onclick="openModal('client')">＋ Nuevo cliente</button>
    </div>
  </div>`;
}

/* ── Home view ─────────────────────────────────── */
function renderHome() {
  if (S.loading) {
    return `<div class="main"><div class="loading"><div class="spinner"></div>Cargando…</div></div>`;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7   = new Date(today); in7.setDate(today.getDate() + 7);
  const in14  = new Date(today); in14.setDate(today.getDate() + 14);

  const active  = S.allTasks.filter(t => t.status !== 'Listo');
  const overdue = active.filter(t => t.dueDate && new Date(t.dueDate) < today)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const thisWeek = active.filter(t => t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) <= in7)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const nextWeek = active.filter(t => t.dueDate && new Date(t.dueDate) > in7 && new Date(t.dueDate) <= in14)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const pins   = new Set(JSON.parse(localStorage.getItem('lg-pins') || '[]'));
  const pinned = S.allTasks.filter(t => pins.has(t.taskId) && t.status !== 'Listo')
    .sort((a, b) => (a.dueDate || '9') < (b.dueDate || '9') ? -1 : 1);

  const clientName = id => (S.clients.find(c => c.clientId === id) || {}).clientName || '—';
  const clientCode = id => (S.clients.find(c => c.clientId === id) || {}).clientCode || id.slice(0, 4).toUpperCase();

  const hour  = new Date().getHours();
  const greet = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const dateStr = today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  function taskRow(t) {
    const isPinned = pins.has(t.taskId);
    const isOver   = t.dueDate && new Date(t.dueDate) < today;
    const dueTxt   = t.dueDate ? fmtDate(t.dueDate) : '—';
    return `
    <div class="home-task-row" onclick="selectClient('${t.clientId}')">
      <div class="home-task-date${isOver ? ' overdue' : ''}">${dueTxt}</div>
      <div class="home-task-name">${esc(t.taskName)}</div>
      <span class="home-tag">${esc(clientCode(t.clientId))}</span>
      <span class="owner-dot ${ownerCls(t.owner)}" title="${esc(t.owner || '')}">${ownerInitials(t.owner)}</span>
      <span class="badge ${priBadge(t.priority)}">${t.priority || '—'}</span>
      <button class="pin-btn${isPinned ? ' pinned' : ''}" title="${isPinned ? 'Desanclar' : 'Anclar como compromiso'}"
        onclick="event.stopPropagation();togglePin('${t.taskId}')">${isPinned ? '★' : '☆'}</button>
    </div>`;
  }

  return `
  <div class="main">
    <div class="main-header">
      <div class="main-header-top">
        <div>
          <div class="main-title">${greet}</div>
          <div class="main-subtitle" style="text-transform:capitalize;">${dateStr}</div>
        </div>
        <div class="main-actions">
          <button class="btn-secondary btn-sm" onclick="goHome()">↺ Actualizar</button>
        </div>
      </div>
    </div>
    <div class="main-content">
      <div class="home-wrap">

        <!-- Stats -->
        <div class="home-stats">
          <div class="home-stat${overdue.length ? ' home-stat-alert' : ''}">
            <div class="home-stat-num">${overdue.length}</div>
            <div class="home-stat-label">Vencidas</div>
          </div>
          <div class="home-stat home-stat-warn">
            <div class="home-stat-num">${thisWeek.length}</div>
            <div class="home-stat-label">Esta semana</div>
          </div>
          <div class="home-stat">
            <div class="home-stat-num">${active.length}</div>
            <div class="home-stat-label">En activo</div>
          </div>
          <div class="home-stat">
            <div class="home-stat-num">${S.clients.length}</div>
            <div class="home-stat-label">Clientes</div>
          </div>
        </div>

        <!-- Compromisos de la semana (tareas ancladas) -->
        ${pinned.length ? `
        <div class="home-section">
          <div class="home-section-title">
            <span>⭐ Compromisos de la semana</span>
            <span class="home-section-hint">Haz clic en ☆ de cualquier tarea para anclarla aquí</span>
          </div>
          <div class="home-task-list">${pinned.map(t => taskRow(t)).join('')}</div>
        </div>` : `
        <div class="home-section home-section-empty-pins">
          <div class="home-section-title">
            <span>☆ Compromisos de la semana</span>
            <span class="home-section-hint">Marca tareas con ☆ para fijar las prioridades del equipo</span>
          </div>
        </div>`}

        <!-- Vencidas -->
        ${overdue.length ? `
        <div class="home-section">
          <div class="home-section-title home-section-alert">⚠ Vencidas · ${overdue.length}</div>
          <div class="home-task-list">${overdue.map(t => taskRow(t)).join('')}</div>
        </div>` : ''}

        <!-- Esta semana -->
        <div class="home-section">
          <div class="home-section-title">Esta semana · ${thisWeek.length} tarea${thisWeek.length !== 1 ? 's' : ''} pendiente${thisWeek.length !== 1 ? 's' : ''}</div>
          ${thisWeek.length
            ? `<div class="home-task-list">${thisWeek.map(t => taskRow(t)).join('')}</div>`
            : '<div class="home-empty">Sin tareas que venzan esta semana 🎉</div>'}
        </div>

        <!-- Próxima semana -->
        ${nextWeek.length ? `
        <div class="home-section">
          <div class="home-section-title home-section-dim">Próxima semana · ${nextWeek.length}</div>
          <div class="home-task-list">${nextWeek.map(t => taskRow(t)).join('')}</div>
        </div>` : ''}

        <!-- Resumen por cliente -->
        <div class="home-section">
          <div class="home-section-title">Resumen por cliente</div>
          <div class="home-clients-grid">
            ${S.clients.map(c => {
              const cActive  = active.filter(t => t.clientId === c.clientId);
              const cOverdue = cActive.filter(t => t.dueDate && new Date(t.dueDate) < today);
              const cWeek    = cActive.filter(t => t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) <= in7);
              const ini = (c.clientName || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
              return `
              <div class="home-client-card" onclick="selectClient('${c.clientId}')">
                <div class="home-client-header">
                  <div class="client-avatar" style="flex-shrink:0;">${ini}</div>
                  <div style="min-width:0;">
                    <div class="home-client-name">${esc(c.clientName)}</div>
                    <div style="font-size:11px;color:var(--text4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(c.concept || '')}</div>
                  </div>
                </div>
                <div class="home-client-stats">
                  <div class="home-client-stat">
                    <div class="home-client-num">${cActive.length}</div>
                    <div class="home-client-label">Activas</div>
                  </div>
                  <div class="home-client-stat">
                    <div class="home-client-num${cWeek.length ? ' home-num-warn' : ''}">${cWeek.length}</div>
                    <div class="home-client-label">Esta semana</div>
                  </div>
                  <div class="home-client-stat">
                    <div class="home-client-num${cOverdue.length ? ' home-num-alert' : ''}">${cOverdue.length}</div>
                    <div class="home-client-label">Vencidas</div>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

      </div>
    </div>
  </div>`;
}

/* ── Main (client view) ────────────────────────── */
function renderMain() {
  if (!S.activeClient) {
    return `
    <div class="main">
      <div class="empty-state" style="height:100%;justify-content:center;">
        <div class="empty-state-icon">←</div>
        <h3>Selecciona un cliente</h3>
        <p>Elige un cliente en el panel izquierdo o vuelve al Inicio.</p>
      </div>
    </div>`;
  }

  const tabs = VIEWS.map(v => `<button class="tab${S.view === v ? ' active' : ''}" onclick="setView('${v}')">${VIEW_LABELS[v]}</button>`).join('');

  return `
  <div class="main">
    <div class="main-header">
      <div class="main-header-top">
        <div>
          <div class="main-title">${esc(S.activeClient.clientName)}</div>
          ${S.activeClient.concept ? `<div class="main-subtitle">${esc(S.activeClient.concept)}</div>` : ''}
        </div>
        <div class="main-actions">
          <button class="btn-secondary btn-sm" onclick="openModal('client',${JSON.stringify(S.activeClient).replace(/"/g,'&quot;')})">✎ Editar</button>
          ${S.view === 'kanban' || S.view === 'table' ? `<button class="btn-primary" onclick="openModal('task')">＋ Nueva tarea</button>` : ''}
          ${S.view === 'templates' ? `<button class="btn-primary" onclick="openModal('template')">＋ Nueva plantilla</button>` : ''}
          ${S.view === 'months'    ? `<button class="btn-primary" onclick="promptGenerateMonth()">＋ Generar mes</button>` : ''}
        </div>
      </div>
      <div class="tabs">${tabs}</div>
    </div>
    <div class="main-content">
      ${S.loading ? '<div class="loading"><div class="spinner"></div>Cargando…</div>' : renderView()}
    </div>
  </div>`;
}

function renderView() {
  if (S.view === 'kanban')    return renderKanban();
  if (S.view === 'table')     return renderTable();
  if (S.view === 'gantt')     return renderGantt();
  if (S.view === 'templates') return renderTemplates();
  if (S.view === 'months')    return renderMonths();
  return '';
}

/* ── Kanban ────────────────────────────────────── */
function renderKanban() {
  return `<div class="kanban">
    ${STATUSES.map(s => renderKanbanCol(s)).join('')}
  </div>`;
}

function renderKanbanCol(status) {
  const tasks = S.tasks.filter(t => t.status === status);
  const colClass = { 'En curso': 'col-curso', 'Detenido': 'col-detenido', 'Listo': 'col-listo' }[status] || '';
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
  const pri = (t.priority || 'media').toLowerCase();
  const ownerClass = ownerCls(t.owner);
  const due = t.dueDate ? new Date(t.dueDate) : null;
  const today = new Date(); today.setHours(0,0,0,0);
  const overdue = due && due < today && t.status !== 'Listo';
  const dueStr = due ? due.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '';
  const initials = ownerInitials(t.owner);
  return `
  <div class="task-card pri-${pri}" onclick='openModal("task",${JSON.stringify(t)})'>
    <div class="task-card-name">${esc(t.taskName)}</div>
    <div class="task-card-meta">
      <span class="task-card-code">${esc(t.taskCode || '')}</span>
      <div style="display:flex;align-items:center;gap:6px;">
        ${dueStr ? `<span class="task-card-dates${overdue ? ' overdue' : ''}">📅 ${dueStr}</span>` : ''}
        <span class="owner-dot ${ownerClass}" title="${esc(t.owner || '')}">${initials}</span>
      </div>
    </div>
  </div>`;
}

/* ── Table ─────────────────────────────────────── */
function renderTable() {
  if (!S.tasks.length) return emptyState('Sin tareas', 'Crea la primera tarea con el botón "Nueva tarea".');
  return `
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Tarea</th>
          <th>Responsable</th>
          <th>Estado</th>
          <th>Prioridad</th>
          <th>Vencimiento</th>
          <th>Tipo</th>
        </tr>
      </thead>
      <tbody>
        ${S.tasks.map(t => {
          const due = t.dueDate ? new Date(t.dueDate) : null;
          const today = new Date(); today.setHours(0,0,0,0);
          const overdue = due && due < today && t.status !== 'Listo';
          const dueStr = due ? due.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'2-digit' }) : '—';
          return `
          <tr onclick='openModal("task",${JSON.stringify(t)})'>
            <td style="color:var(--text3);font-size:12px;">${esc(t.taskCode || '—')}</td>
            <td class="task-name-cell">${esc(t.taskName)}</td>
            <td><div style="display:flex;align-items:center;gap:6px;"><span class="owner-dot ${ownerCls(t.owner)}">${ownerInitials(t.owner)}</span><span style="color:var(--text2)">${esc(t.owner || '—')}</span></div></td>
            <td><span class="badge ${statusBadge(t.status)}">${t.status || '—'}</span></td>
            <td><span class="badge ${priBadge(t.priority)}">${t.priority || '—'}</span></td>
            <td class="${overdue ? 'due-date-overdue' : ''}">${dueStr}</td>
            <td style="color:var(--text3);font-size:12px;text-transform:capitalize;">${t.taskType || '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ── Gantt ─────────────────────────────────────── */
function renderGantt() {
  const tasks = S.tasks.filter(t => t.startDate && t.endDate);
  if (!tasks.length) return emptyState('Sin datos de Gantt', 'Añade fechas de inicio y fin a las tareas para verlas aquí.');
  return `
  <div class="gantt-wrap">
    <div class="gantt-header">Diagrama de Gantt — ${esc(S.activeClient.clientName)}</div>
    ${tasks.map(t => {
      const s = new Date(t.startDate), e = new Date(t.endDate);
      const fmt = d => d.toLocaleDateString('es-ES', { day:'2-digit', month:'short' });
      return `
      <div class="gantt-row">
        <div class="gantt-row-name" title="${esc(t.taskName)}">${esc(t.taskName)}</div>
        <div class="gantt-bar-cell">
          <div class="gantt-bar">${fmt(s)} → ${fmt(e)}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ── Templates ─────────────────────────────────── */
function renderTemplates() {
  if (!S.templates.length) return emptyState('Sin plantillas', 'Crea plantillas mensuales para generar tareas recurrentes automáticamente.');
  return `
  <div class="templates-grid">
    ${S.templates.map(t => `
    <div class="template-card${t.isActive === false ? ' template-inactive' : ''}">
      <div class="template-card-header">
        <div class="template-card-name">${esc(t.templateName)}</div>
        <div class="template-card-actions">
          <button class="btn-icon" onclick='openModal("template",${JSON.stringify(t)})' title="Editar">✎</button>
        </div>
      </div>
      ${t.description ? `<div style="font-size:12px;color:var(--text3);line-height:1.5;margin-bottom:8px;">${esc(t.description)}</div>` : ''}
      <div class="template-card-meta">
        <span class="badge ${priBadge(t.priority)}">${t.priority || '—'}</span>
        <span class="badge ${statusBadge(t.statusDefault)}">${t.statusDefault || '—'}</span>
        <span class="owner-dot ${ownerCls(t.owner)}" title="${esc(t.owner || '')}">${ownerInitials(t.owner)}</span>
        ${t.dueDay ? `<span class="badge-tag badge" style="font-size:10px;">Día ${t.dueDay}</span>` : ''}
        ${t.isActive === false ? `<span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text4);">Inactiva</span>` : ''}
      </div>
    </div>`).join('')}
  </div>`;
}

/* ── Months ────────────────────────────────────── */
function renderMonths() {
  if (!S.months.length) return emptyState('Sin meses generados', 'Genera el mes actual para crear las tareas mensuales de las plantillas activas.');
  return `
  <div class="months-grid">
    ${S.months.map(m => {
      const isOpen = m.monthStatus === 'abierto';
      return `
      <div class="month-card">
        <div class="month-card-title">${esc(m.taskMonth)}</div>
        <div class="month-card-status">
          <span class="badge ${isOpen ? 'badge-curso' : 'badge-listo'}">${isOpen ? 'Abierto' : 'Cerrado'}</span>
        </div>
        <div class="month-card-actions">
          ${isOpen
            ? `<button class="btn-secondary btn-sm" onclick="doCloseMonth('${m.taskMonth}')">Cerrar mes</button>`
            : `<button class="btn-secondary btn-sm" onclick="doReopenMonth('${m.taskMonth}')">Reabrir mes</button>`}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ── Month actions ─────────────────────────────── */
async function promptGenerateMonth() {
  const now = new Date();
  const def = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  openModal('confirm', {
    msg: `<b>Generar mes</b><br>Se crearán tareas para todas las plantillas activas.`,
    onConfirm: `async function(){
      closeModal();
      const taskMonth = prompt('Mes a generar (YYYY-MM)', '${def}');
      if(!taskMonth) return;
      const r = await api('/months/generate', {method:'POST', body:JSON.stringify({clientId:S.activeClient.clientId, taskMonth})});
      if(r.error){ toast(r.error,'err'); return; }
      toast('Mes ' + taskMonth + ' generado');
      await loadClientData(S.activeClient.clientId);
      await refreshAllTasks();
      render();
    }`,
  });
}

async function doCloseMonth(taskMonth) {
  const r = await api('/months/close', { method: 'POST', body: JSON.stringify({ clientId: S.activeClient.clientId, taskMonth }) });
  if (r.error) { toast(r.error, 'err'); return; }
  toast('Mes ' + taskMonth + ' cerrado');
  await loadClientData(S.activeClient.clientId);
  render();
}

async function doReopenMonth(taskMonth) {
  const r = await api('/months/reopen', { method: 'POST', body: JSON.stringify({ clientId: S.activeClient.clientId, taskMonth }) });
  if (r.error) { toast(r.error, 'err'); return; }
  toast('Mes ' + taskMonth + ' reabierto');
  await loadClientData(S.activeClient.clientId);
  render();
}

/* ── Helpers ───────────────────────────────────── */
function emptyState(title, msg) {
  return `<div class="empty-state"><div class="empty-state-icon">📭</div><h3>${title}</h3><p>${msg}</p></div>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(s) {
  return { 'En curso': 'badge-curso', 'Listo': 'badge-listo', 'Detenido': 'badge-detenido' }[s] || '';
}

function priBadge(p) {
  return { 'Alta': 'badge-alta', 'Media': 'badge-media', 'Baja': 'badge-baja' }[p] || '';
}

function ownerCls(o) {
  return { 'Jesús': 'owner-jesus', 'Blanca': 'owner-blanca', 'Alejandro': 'owner-alejandro' }[o] || 'owner-default';
}

function ownerInitials(o) {
  if (!o) return '?';
  return o.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/* ── Init ──────────────────────────────────────── */
(async () => {
  S.view = 'home';
  S.loading = true;
  render();
  const [, allTasksR] = await Promise.all([loadClients(), api('/tasks')]);
  S.allTasks = Array.isArray(allTasksR) ? allTasksR : [];
  S.loading = false;
  render();
})();
