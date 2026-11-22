/* Ligrow Tasks · Asistente de IA · ejecutor de herramientas
 *
 * El modelo corre en el servidor (/api/assistant), pero las herramientas se ejecutan AQUÍ, en el navegador,
 * sobre las mismas estructuras de datos y funciones que usan los botones de la app (DATA, S, save(),
 * normTask(), render()…). No hay una segunda vía de escritura: la sincronización con Supabase, los permisos
 * por cliente (canAccessClient) y el historial de actividad se aplican igual que en una acción manual.
 *
 * Cada herramienta devuelve un «outcome»:
 *   { result, isError?, summary?, undo?: { label, run }, mutated? }
 * `result` es el JSON que ve el modelo; `summary` es la frase de la tarjeta de acción del chat;
 * `undo` es cómo revertirlo (si falta, la acción no se puede deshacer).
 */
(function () {
  'use strict';

  // ── Utilidades ────────────────────────────────────────────────────────────────────────────────
  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v));
  const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const str = (v) => (typeof v === 'string' ? v : undefined);
  const txt = (v) => (str(v) || '').trim() || undefined;
  const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const fail = (error, candidates) => ({ isError: true, result: Object.assign({ error }, candidates ? { candidates } : {}) });
  const ok = (result, extra) => Object.assign({ result }, extra || {});

  const STATUSES = ['Sin empezar', 'Trabajando', 'Esperando feedback', 'Listo'];
  const PRIORITIES = ['Alta', 'Media', 'Baja'];
  const LIGHTS = ['verde', 'naranja', 'rojo'];
  const PAYS = ['Pagado', 'Recibido', 'Pendiente'];
  const DELIVERIES = ['Entregado', 'En curso', 'Pendiente'];
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const userName = () => (S.currentUser && S.currentUser.name ? S.currentUser.name.replace(/\s*\(Admin\)/i, '').trim() : S.defaultUser || 'Usuario');
  const isAdmin = () => !S.currentUser || S.currentUser.role === 'admin';
  const trunc = (s, n) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));

  // ── Fechas ────────────────────────────────────────────────────────────────────────────────────
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayISO = () => toISO(new Date());
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00');
    return !isNaN(d.getTime()) && toISO(d) === value;
  }

  /** Las fechas de la app pueden ser «2026-10-05» o texto tipo «5 Oct». Devuelve un Date (o null). */
  function parseDue(raw) {
    const v = String(raw || '').trim();
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
      const d = new Date(v.slice(0, 10) + 'T00:00:00');
      return isNaN(d.getTime()) ? null : d;
    }
    const m = v.match(/^(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3})/);
    if (m) {
      const mi = MONTHS.indexOf(norm(m[2]));
      if (mi >= 0) return new Date(new Date().getFullYear(), mi, +m[1]);
    }
    return null;
  }

  /** overdue | today | next7 | later | none (las completadas no cuentan como vencidas). */
  function dueGroup(t) {
    const d = parseDue(t.due);
    if (!d) return 'none';
    const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    if (diff < 0) return t.status === 'Listo' ? 'later' : 'overdue';
    if (diff === 0) return 'today';
    if (diff <= 7) return 'next7';
    return 'later';
  }

  // ── Resolución de referencias ─────────────────────────────────────────────────────────────────────
  function resolve(pool, ref, o) {
    const q = norm(ref);
    if (!q) return { ok: false, error: 'Indica ' + o.noun + '.' };
    const labels = (list) => list.slice(0, 8).map(o.label);
    const byId = pool.filter((x) => o.ids(x).some((i) => norm(i) === q));
    if (byId.length === 1) return { ok: true, value: byId[0] };
    const exact = pool.filter((x) => o.names(x).some((n) => norm(n) === q));
    if (exact.length === 1) return { ok: true, value: exact[0] };
    if (exact.length > 1) return { ok: false, error: 'Hay varias coincidencias para ' + o.noun + ' «' + ref + '». Pregunta al usuario cuál.', candidates: labels(exact) };
    const partial = pool.filter((x) => o.names(x).some((n) => norm(n).includes(q)) || o.ids(x).some((i) => norm(i).includes(q)));
    if (partial.length === 1) return { ok: true, value: partial[0] };
    if (partial.length > 1) return { ok: false, error: 'Hay varias coincidencias para ' + o.noun + ' «' + ref + '». Pregunta al usuario cuál.', candidates: labels(partial) };
    return { ok: false, error: 'No encuentro ' + o.noun + ' «' + ref + '».', candidates: labels(pool) };
  }
  const failed = (r) => (r.ok ? null : fail(r.error, r.candidates));

  const clientsScope = () => DATA.filter((p) => p.type === 'cliente' && canAccessClient(p.id));
  const appsScope = () => DATA.filter((p) => p.type === 'app' && canAccessClient(p.id));
  const supplierProject = () => {
    const p = DATA.find((x) => x.type === 'proveedor');
    return p && canAccessClient(p.id) ? p : null;
  };

  const resolveClient = (ref) =>
    resolve(clientsScope(), ref, { ids: (c) => [c.id, c.initials || ''], names: (c) => [c.name], label: (c) => c.name, noun: 'el cliente' });

  /** Cliente indicado, o el abierto en pantalla, o el único accesible. */
  function clientFrom(ref) {
    if (txt(ref)) return resolveClient(ref);
    const open = S.proj && S.proj.type === 'cliente' && canAccessClient(S.proj.id) && S.navView == null ? S.proj : null;
    if (open) return { ok: true, value: open };
    const all = clientsScope();
    if (all.length === 1) return { ok: true, value: all[0] };
    return { ok: false, error: 'Indica el cliente (no hay ninguno abierto en pantalla).', candidates: all.map((c) => c.name) };
  }

  function findTask(input) {
    let pool;
    if (txt(input.client)) {
      const c = resolveClient(input.client);
      if (!c.ok) return c;
      pool = (c.value.tasks || []).map((t) => ({ t, c: c.value }));
    } else {
      pool = clientsScope().flatMap((c) => (c.tasks || []).map((t) => ({ t, c })));
    }
    return resolve(pool, txt(input.task) || '', {
      ids: (x) => [x.t.code || '', x.t.id || ''],
      names: (x) => [x.t.title || x.t.name || ''],
      label: (x) => x.t.code + ' · ' + (x.t.title || x.t.name) + ' (' + x.c.name + ')',
      noun: 'la tarea'
    });
  }

  const findByText = (list, ref, getText, noun) =>
    resolve(list.map((x, i) => ({ x, i })), ref, { ids: () => [], names: (e) => [getText(e.x)], label: (e) => getText(e.x), noun });

  // ── Vistas compactas para el modelo ───────────────────────────────────────────────────────────────
  function taskView(c, t) {
    normTask(t, 0, c);
    const done = (t.checklist || []).filter((i) => i.done).length;
    return {
      code: t.code,
      title: t.title || t.name,
      client: c.name,
      status: t.status,
      priority: t.priority,
      owner: t.owner || null,
      due: t.due || null,
      plazo: dueGroup(t),
      tag: t.tag || null,
      checklist: (t.checklist || []).length ? done + '/' + t.checklist.length : null
    };
  }

  function taskDetail(c, t) {
    normTask(t, 0, c);
    return Object.assign(taskView(c, t), {
      id: t.id,
      description: t.desc || t.description || '',
      checklist: (t.checklist || []).map((i) => ({ text: i.text, done: !!i.done })),
      links: (t.links || []).map((l) => ({ label: l.label || l.name, url: l.url || l.href })),
      files: (t.files || []).map((f) => f.name),
      comments: (t.comments || []).map((m) => ({ author: m.author, text: m.text, date: m.date }))
    });
  }

  const clientCounts = (c) => {
    const tasks = c.tasks || [];
    const by = (s) => tasks.filter((t) => normTask(t, 0, c).status === s).length;
    return { total: tasks.length, sin_empezar: by('Sin empezar'), trabajando: by('Trabajando'), esperando_feedback: by('Esperando feedback'), listo: by('Listo') };
  };

  const clientView = (c) => ({
    id: c.id,
    name: c.name,
    initials: c.initials,
    description: c.sub || '',
    responsable: c.responsable || '',
    semaforo: c.semaforo || null,
    tareas: clientCounts(c),
    recordatorios_pendientes: (c.recordatorios || []).filter((r) => !r.done).length
  });

  const reminderView = (r) => ({ text: r.text, detail: r.detail || '', due: r.due || null, done: !!r.done });
  const docView = (d) => ({ name: d.name, url: d.href, description: d.desc || '', type: d.type || 'link' });

  const orderPay = (o) => (typeof orderPayStatus === 'function' ? orderPayStatus(o) : o.status);
  const orderDel = (o) => (typeof orderDeliveryStatus === 'function' ? orderDeliveryStatus(o) : o.deliveryStatus);
  const orderView = (o) => ({
    id: o.id,
    date: o.orderDate,
    supplier: o.supplierName,
    category: o.categoryName || null,
    concept: o.concept,
    amount_eur: Number(o.totalAmount || 0),
    payment_status: orderPay(o),
    delivery_status: orderDel(o),
    invoice_number: o.invoiceNumber || null,
    notes: o.notes || '',
    documents: (o.files || []).map((f) => f.name)
  });

  // ── Persistencia ───────────────────────────────────────────────────────────────────────────────────
  /**
   * Guarda como lo haría la app. Si el proyecto no es el abierto en pantalla, el registro de actividad y la
   * sincronización con la nube se hacen igualmente sobre ESE proyecto (sin cambiar lo que ve el usuario).
   */
  function persist(p, details) {
    details = details || {};
    if (!p || p === S.proj) {
      save(details);
      return;
    }
    if (details.action) logActivity(p, details.action, details.summary, details);
    save();
    if ((p.type === 'cliente' || p.id === 'pv') && details.action) syncSaveCurrentProject(details, p);
  }
  const say = (msg) => userName() + ' (asistente IA): ' + msg;

  // ── Lectura ────────────────────────────────────────────────────────────────────────────────────────
  function ordersAccessible() {
    const pv = supplierProject();
    return pv ? pv.orders || [] : null;
  }

  function getWorkspaceSummary() {
    const clients = clientsScope();
    const groups = { overdue: 0, today: 0, next7: 0 };
    let open = 0;
    clients.forEach((c) => (c.tasks || []).forEach((t) => {
      normTask(t, 0, c);
      if (t.status !== 'Listo') open += 1;
      const g = dueGroup(t);
      if (t.status !== 'Listo' && groups[g] != null) groups[g] += 1;
    }));
    const orders = ordersAccessible();
    const summary = {
      fecha: todayISO(),
      clientes: clients.map((c) => ({ name: c.name, semaforo: c.semaforo || null, tareas: clientCounts(c) })),
      tareas_abiertas: open,
      vencidas: groups.overdue,
      para_hoy: groups.today,
      proximos_7_dias: groups.next7,
      recordatorios_pendientes: clients.reduce((n, c) => n + (c.recordatorios || []).filter((r) => !r.done).length, 0)
    };
    if (orders) {
      summary.pedidos = {
        total: orders.length,
        por_pagar_eur: orders.filter((o) => orderPay(o) !== 'Pagado').reduce((n, o) => n + Number(o.totalAmount || 0), 0),
        sin_entregar: orders.filter((o) => orderDel(o) !== 'Entregado').length
      };
    }
    return ok(summary);
  }

  function getDashboard() {
    const clients = clientsScope();
    const all = clients.flatMap((c) => (c.tasks || []).map((t) => (normTask(t, 0, c), t)));
    const by = (s) => all.filter((t) => t.status === s).length;
    return ok({
      clientes_activos: clients.length,
      sin_empezar: by('Sin empezar'),
      trabajando: by('Trabajando'),
      esperando_cliente: by('Esperando feedback'),
      completadas: by('Listo'),
      por_cliente: clients.map((c) => ({
        client: c.name,
        trabajando: (c.tasks || []).filter((t) => t.status === 'Trabajando').map((t) => taskView(c, t)),
        esperando_feedback: (c.tasks || []).filter((t) => t.status === 'Esperando feedback').map((t) => taskView(c, t))
      }))
    });
  }

  function currentSnapshot() {
    const view = { screen: describeScreen() };
    if (S.navView == null && S.proj) {
      if (S.proj.type === 'cliente') {
        view.client = clientView(S.proj);
        view.tab = S.view;
        if (S.view === 'kanban') view.kanban_owner_filter = S.kanbanOwnerFilter || 'all';
      } else if (S.proj.type === 'proveedor') {
        view.tab = S.view;
        if (S.view === 'pedidos') {
          view.orders_filters = { search: S.pedidosSearch || '', supplier: S.pedidosFilterSupplier || '', status: S.pedidosFilterStatus || '', sort: S.pedidosSort || 'recientes' };
        }
      } else {
        view.app = S.proj.name;
      }
    } else if (S.navView === 'kanbanGlobal') {
      view.kanban_owner_filter = S.kanbanOwnerFilter || 'all';
    }
    if (S.modal === 'taskDetail' && S._taskDetail) {
      const c = DATA.find((p) => p.id === (S._taskDetail.clientId || S._taskDetail.clientid));
      const t = c && (c.tasks || []).find((x) => x.code === S._taskDetail.taskCode || x.id === S._taskDetail.taskCode);
      if (c && t) view.open_task = taskDetail(c, t);
    }
    return view;
  }

  function describeScreen() {
    const names = { dashboard: 'Dashboard', kanbanGlobal: 'Kanban Global', proyectos: 'Todos los proyectos', calendario: 'Calendario' };
    if (S.navView) return names[S.navView] || S.navView;
    const p = S.proj;
    if (!p) return 'Sin proyecto abierto';
    if (p.type === 'cliente') return 'Cliente «' + p.name + '» › ' + ({ resumen: 'Resumen', kanban: 'Kanban', actividad: 'Historial y Auditoría' }[S.view] || S.view);
    if (p.type === 'proveedor') return 'Proveedores › ' + (S.view === 'pedidos' ? 'Pedidos' : 'Catálogo');
    return 'App «' + p.name + '»';
  }

  function searchTasks(input) {
    let scope = clientsScope();
    if (txt(input.client)) {
      const c = resolveClient(input.client);
      if (!c.ok) return failed(c);
      scope = [c.value];
    }
    const q = norm(input.query);
    const owner = norm(input.owner);
    const limit = Math.max(1, Math.min(50, int(input.limit) || 25));
    const rows = [];
    scope.forEach((c) => (c.tasks || []).forEach((t) => {
      normTask(t, 0, c);
      if (!input.include_done && t.status === 'Listo' && input.status !== 'Listo') return;
      if (input.status && t.status !== input.status) return;
      if (input.priority && t.priority !== input.priority) return;
      if (owner && norm(t.owner) !== owner) return;
      if (q && !norm([t.code, t.title, t.desc, t.tag].join(' ')).includes(q)) return;
      const g = dueGroup(t);
      if (input.due && input.due !== 'any' && g !== input.due) return;
      rows.push(taskView(c, t));
    }));
    return ok({ total: rows.length, tasks: rows.slice(0, limit) });
  }

  function getCalendar(input) {
    const from = validDate(input.from) ? input.from : todayISO();
    const toDefault = new Date();
    toDefault.setDate(toDefault.getDate() + 30);
    const to = validDate(input.to) ? input.to : toISO(toDefault);
    const items = [];
    clientsScope().forEach((c) => {
      (c.tasks || []).forEach((t) => {
        normTask(t, 0, c);
        const d = parseDue(t.due);
        if (!d || t.status === 'Listo') return;
        const iso = toISO(d);
        if (iso >= from && iso <= to) items.push({ date: iso, type: 'tarea', client: c.name, title: t.code + ' · ' + (t.title || t.name), status: t.status, priority: t.priority });
      });
      (c.recordatorios || []).forEach((r) => {
        const d = parseDue(r.due);
        if (!d || r.done) return;
        const iso = toISO(d);
        if (iso >= from && iso <= to) items.push({ date: iso, type: 'recordatorio', client: c.name, title: r.text });
      });
    });
    items.sort((a, b) => a.date.localeCompare(b.date));
    return ok({ from, to, total: items.length, items: items.slice(0, 80) });
  }

  function listSuppliers(input) {
    const pv = supplierProject();
    if (!pv) return fail('No tienes acceso al espacio de proveedores.');
    const q = norm(input.query);
    const cat = norm(input.category);
    const out = [];
    (pv.cats || []).forEach((c) => {
      if (cat && !norm(c.name).includes(cat)) return;
      (c.provs || []).forEach((p) => {
        if (q && !norm([p.name, p.type, p.productList].join(' ')).includes(q)) return;
        out.push({ category: c.name, name: p.name, type: p.type, email: p.email || null, phone: p.phone || null, website: p.website || null, payment_terms: p.payment || null, lead_time: p.leadTime || null, products: p.productList || '', rates: p.prices || [] });
      });
    });
    return ok({ categories: (pv.cats || []).map((c) => c.name), total: out.length, suppliers: out.slice(0, 60) });
  }

  function listOrders(input) {
    const orders = ordersAccessible();
    if (!orders) return fail('No tienes acceso al espacio de proveedores.');
    const q = norm(input.query);
    const sup = norm(input.supplier);
    const rows = orders.filter((o) => {
      if (q && !norm([o.concept, o.supplierName, o.invoiceNumber].join(' ')).includes(q)) return false;
      if (sup && !norm(o.supplierName).includes(sup)) return false;
      if (input.payment_status && orderPay(o) !== input.payment_status) return false;
      if (input.delivery_status && orderDel(o) !== input.delivery_status) return false;
      return true;
    });
    rows.sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
    return ok({ total: rows.length, total_amount_eur: rows.reduce((n, o) => n + Number(o.totalAmount || 0), 0), orders: rows.slice(0, 40).map(orderView) });
  }

  // ── Tareas ────────────────────────────────────────────────────────────────────────────────────────
  function nextTaskCode(c) {
    const prefix = c.initials || c.id.toUpperCase().slice(0, 3);
    const nums = (c.tasks || []).map((t) => parseInt(String(t.code || '').split('-').pop(), 10)).filter((n) => Number.isFinite(n));
    return prefix + '-' + pad(Math.max(nums.length ? Math.max.apply(null, nums) : 0, (c.tasks || []).length) + 1);
  }

  function setPriority(t, value) {
    t.priority = value;
    t.pri = value;
    t.semaforo = value === 'Alta' ? 'rojo' : value === 'Baja' ? 'verde' : 'naranja';
  }

  /** Restaura una tarea a una copia anterior (o la quita si no existía). */
  function restoreTask(c, id, snap) {
    c.tasks = c.tasks || [];
    const idx = c.tasks.findIndex((x) => x.id === id);
    if (snap == null) {
      if (idx >= 0) c.tasks.splice(idx, 1);
    } else if (idx >= 0) c.tasks[idx] = snap;
    else c.tasks.push(snap);
    persist(c, { action: 'Edición de tarea', summary: say('deshizo un cambio en la tarea') });
    render();
    return { ok: true };
  }

  function createTask(input) {
    const title = txt(input.title);
    if (!title) return fail('Falta el título de la tarea.');
    const c = clientFrom(input.client);
    if (!c.ok) return failed(c);
    const client = c.value;
    if (input.due_date && !validDate(input.due_date)) return fail('Fecha no válida «' + input.due_date + '». Usa AAAA-MM-DD.');
    if (input.priority && !PRIORITIES.includes(input.priority)) return fail('Prioridad no válida. Valores: ' + PRIORITIES.join(', ') + '.');
    if (input.status && !STATUSES.includes(input.status)) return fail('Estado no válido. Valores: ' + STATUSES.join(', ') + '.');
    const items = (Array.isArray(input.checklist) ? input.checklist : []).map((x) => txt(x)).filter(Boolean).map((text) => ({ text, done: false }));
    const code = nextTaskCode(client);
    const owner = txt(input.owner) || client.responsable || S.defaultUser || 'Jesús';
    const t = {
      id: uid('t_'),
      code,
      title,
      name: title,
      owner,
      status: input.status || 'Sin empezar',
      priority: input.priority || 'Media',
      pri: input.priority || 'Media',
      due: input.due_date || '',
      tag: txt(input.tag) || '',
      desc: txt(input.description) || '',
      description: txt(input.description) || '',
      checklist: items,
      checklists: clone(items),
      links: [],
      files: [],
      comments: []
    };
    client.tasks = client.tasks || [];
    client.tasks.push(t);
    normTask(t, 0, client);
    persist(client, { action: 'Nueva tarea', summary: say('creó la tarea "' + title + '" (' + code + ') - Asignada a: ' + owner), taskCode: code, taskName: title, status: t.status });
    render();
    return ok(taskView(client, t), {
      mutated: true,
      summary: 'Tarea creada: ' + code + ' · ' + title + ' (' + client.name + ')',
      undo: { label: 'crear la tarea ' + code, run: async () => restoreTask(client, t.id, null) }
    });
  }

  function editTask(input, label, apply, action) {
    const r = findTask(input);
    if (!r.ok) return failed(r);
    const { t, c } = r.value;
    normTask(t, 0, c);
    const before = clone(t);
    const err = apply(t, c);
    if (err) return err;
    normTask(t, 0, c);
    persist(c, { action: action || 'Edición de tarea', summary: say(label(t)), taskCode: t.code, taskName: t.title || t.name, status: t.status });
    render();
    return ok(taskDetail(c, t), {
      mutated: true,
      summary: label(t),
      undo: { label: label(t), run: async () => restoreTask(c, t.id, before) }
    });
  }

  function updateTask(input) {
    const changes = [];
    return editTask(
      input,
      (t) => 'Tarea ' + t.code + ' actualizada (' + changes.join(', ') + ')',
      (t) => {
        if (input.title !== undefined) {
          const v = txt(input.title);
          if (!v) return fail('El título no puede estar vacío.');
          t.title = v; t.name = v; changes.push('título');
        }
        if (input.description !== undefined) { t.desc = str(input.description) || ''; t.description = t.desc; changes.push('descripción'); }
        if (input.due_date !== undefined) {
          if (input.due_date !== '' && !validDate(input.due_date)) return fail('Fecha no válida «' + input.due_date + '». Usa AAAA-MM-DD.');
          t.due = input.due_date; changes.push(input.due_date ? 'fecha ' + input.due_date : 'sin fecha');
        }
        if (input.priority !== undefined) {
          if (!PRIORITIES.includes(input.priority)) return fail('Prioridad no válida. Valores: ' + PRIORITIES.join(', ') + '.');
          setPriority(t, input.priority); changes.push('prioridad ' + input.priority);
        }
        if (input.status !== undefined) {
          if (!STATUSES.includes(input.status)) return fail('Estado no válido. Valores: ' + STATUSES.join(', ') + '.');
          t.status = input.status; changes.push('estado ' + input.status);
        }
        if (input.owner !== undefined) { t.owner = txt(input.owner) || t.owner; changes.push('responsable ' + t.owner); }
        if (input.tag !== undefined) { t.tag = str(input.tag) || ''; changes.push('etiqueta'); }
        if (!changes.length) return fail('No se ha indicado ningún cambio.');
        return null;
      },
      input.status !== undefined && changes.length === 0 ? 'Cambio de estado' : 'Edición de tarea'
    );
  }

  function addChecklistItem(input) {
    const text = txt(input.text);
    if (!text) return fail('Falta el texto del elemento.');
    return editTask(input, (t) => 'Añadido «' + text + '» a la checklist de ' + t.code, (t) => { t.checklist.push({ text, done: false }); return null; }, 'Checklist');
  }

  function toggleChecklistItem(input) {
    let last = input.item;
    return editTask(input, (t) => 'Checklist de ' + t.code + ': «' + last + '»', (t) => {
      const r = findByText(t.checklist, input.item, (i) => i.text, 'el elemento');
      if (!r.ok) return failed(r);
      const item = t.checklist[r.value.i];
      item.done = !item.done;
      last = item.text + (item.done ? ' ✓' : ' (pendiente)');
      return null;
    }, 'Checklist');
  }

  function removeChecklistItem(input) {
    let last = input.item;
    return editTask(input, (t) => 'Quitado «' + last + '» de la checklist de ' + t.code, (t) => {
      const r = findByText(t.checklist, input.item, (i) => i.text, 'el elemento');
      if (!r.ok) return failed(r);
      last = t.checklist[r.value.i].text;
      t.checklist.splice(r.value.i, 1);
      return null;
    }, 'Checklist');
  }

  const safeUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || '').trim());

  function addTaskLink(input) {
    const url = txt(input.url);
    if (!url || !safeUrl(url)) return fail('El enlace debe empezar por http:// o https://.');
    const label = txt(input.label) || url.replace(/^https?:\/\//, '').split('/')[0];
    return editTask(input, (t) => 'Enlace «' + label + '» añadido a ' + t.code, (t) => { t.links.push({ label, url, href: url, name: label }); return null; }, 'Edición de tarea');
  }

  function removeTaskLink(input) {
    let last = input.link;
    return editTask(input, (t) => 'Enlace «' + last + '» quitado de ' + t.code, (t) => {
      const r = findByText(t.links, input.link, (l) => l.label || l.name || l.url || '', 'el enlace');
      if (!r.ok) return failed(r);
      last = t.links[r.value.i].label || t.links[r.value.i].name || last;
      t.links.splice(r.value.i, 1);
      return null;
    }, 'Edición de tarea');
  }

  function addTaskComment(input) {
    const text = txt(input.text);
    if (!text) return fail('Falta el comentario.');
    return editTask(input, (t) => 'Comentario añadido a ' + t.code, (t) => {
      const now = new Date();
      t.comments.push({ author: userName(), text, date: 'Hoy a las ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) });
      return null;
    }, 'Comentario');
  }

  function deleteTask(input) {
    const r = findTask(input);
    if (!r.ok) return failed(r);
    const { t, c } = r.value;
    const title = t.title || t.name;
    c.tasks = (c.tasks || []).filter((x) => x.id !== t.id);
    persist(c, { action: 'Eliminar tarea', summary: say('eliminó la tarea "' + title + '" (' + t.code + ')'), taskCode: t.code, taskName: title });
    render();
    return ok({ deleted: t.code }, { mutated: true, summary: 'Tarea eliminada: ' + t.code + ' · ' + title });
  }

  // ── Clientes, recordatorios, documentos ────────────────────────────────────────────────────────────
  function createClient(input) {
    if (!isAdmin()) return fail('Solo los administradores pueden crear clientes.');
    const name = txt(input.name);
    if (!name) return fail('Falta el nombre del cliente.');
    const colors = typeof CLIENT_COLORS !== 'undefined' ? CLIENT_COLORS : ['#004E9C'];
    const client = {
      id: 'c_' + Date.now().toString(36),
      type: 'cliente',
      color: colors[DATA.filter((p) => p.type === 'cliente').length % colors.length],
      initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'CL',
      name,
      sub: txt(input.description) || '',
      responsable: txt(input.responsable) || S.defaultUser || 'Jesús',
      proyectosCount: 1,
      ultimaActividad: 'Creado hoy',
      semaforo: 'verde',
      description: '',
      recordatorios: [],
      tasks: []
    };
    DATA.unshift(client);
    save();
    render();
    return ok(clientView(client), {
      mutated: true,
      summary: 'Cliente creado: ' + name,
      undo: {
        label: 'crear el cliente ' + name,
        run: async () => {
          DATA = DATA.filter((p) => p.id !== client.id);
          if (S.proj && S.proj.id === client.id) { S.proj = DATA.find((p) => p.type === 'cliente') || DATA[0] || null; S.view = S.proj ? defaultView(S.proj) : 'resumen'; }
          save();
          render();
          return { ok: true };
        }
      }
    });
  }

  function updateClient(input) {
    const c = clientFrom(input.client);
    if (!c.ok) return failed(c);
    const client = c.value;
    const before = { name: client.name, sub: client.sub, responsable: client.responsable, semaforo: client.semaforo };
    const changes = [];
    if (input.name !== undefined) { const v = txt(input.name); if (!v) return fail('El nombre no puede estar vacío.'); client.name = v; changes.push('nombre'); }
    if (input.description !== undefined) { client.sub = str(input.description) || ''; changes.push('descripción'); }
    if (input.responsable !== undefined) { client.responsable = txt(input.responsable) || client.responsable; changes.push('responsable'); }
    if (input.traffic_light !== undefined) {
      if (!LIGHTS.includes(input.traffic_light)) return fail('Semáforo no válido. Valores: ' + LIGHTS.join(', ') + '.');
      client.semaforo = input.traffic_light; changes.push('semáforo ' + input.traffic_light);
    }
    if (!changes.length) return fail('No se ha indicado ningún cambio.');
    persist(client, { action: 'Editar cliente', summary: say('modificó ' + changes.join(', ') + ' de ' + client.name) });
    render();
    return ok(clientView(client), {
      mutated: true,
      summary: 'Cliente ' + client.name + ' actualizado (' + changes.join(', ') + ')',
      undo: { label: 'actualizar el cliente ' + client.name, run: async () => { Object.assign(client, before); persist(client, { action: 'Editar cliente', summary: say('deshizo un cambio en ' + client.name) }); render(); return { ok: true }; } }
    });
  }

  function deleteClient(input) {
    const c = resolveClient(input.client);
    if (!c.ok) return failed(c);
    if (!isAdmin()) return fail('Solo los administradores pueden eliminar clientes.');
    const client = c.value;
    DATA = DATA.filter((p) => p.id !== client.id);
    if (S.proj && S.proj.id === client.id) {
      const next = DATA.find((p) => p.type === 'cliente') || DATA[0] || null;
      S.proj = next;
      S.view = next ? defaultView(next) : 'resumen';
    }
    save();
    render();
    return ok({ deleted: client.name }, { mutated: true, summary: 'Cliente eliminado: ' + client.name });
  }

  /** Recordatorios y documentos: se guarda una copia de la lista para poder deshacer. */
  function editList(input, key, label, apply, action) {
    const c = clientFrom(input.client);
    if (!c.ok) return failed(c);
    const client = c.value;
    client[key] = client[key] || [];
    const before = clone(client[key]);
    const err = apply(client[key], client);
    if (err) return err;
    persist(client, { action, summary: say(label) });
    render();
    return ok({ ok: true, client: client.name }, {
      mutated: true,
      summary: label + ' (' + client.name + ')',
      undo: { label, run: async () => { client[key] = before; persist(client, { action, summary: say('deshizo: ' + label) }); render(); return { ok: true }; } }
    });
  }

  const reminderRef = (list, ref) => findByText(list, ref, (r) => r.text, 'el recordatorio');

  function addReminder(input) {
    const text = txt(input.text);
    if (!text) return fail('Falta el título del recordatorio.');
    return editList(input, 'recordatorios', 'Recordatorio añadido: «' + text + '»', (list) => { list.push({ id: uid('r'), text, detail: txt(input.detail) || '', due: txt(input.due) || '', done: false }); return null; }, 'Nuevo recordatorio');
  }
  function updateReminder(input) {
    return editList(input, 'recordatorios', 'Recordatorio «' + trunc(input.reminder, 40) + '» actualizado', (list) => {
      const r = reminderRef(list, input.reminder);
      if (!r.ok) return failed(r);
      const item = list[r.value.i];
      if (input.text !== undefined) item.text = txt(input.text) || item.text;
      if (input.detail !== undefined) item.detail = str(input.detail) || '';
      if (input.due !== undefined) item.due = str(input.due) || '';
      return null;
    }, 'Recordatorio');
  }
  function toggleReminder(input) {
    return editList(input, 'recordatorios', 'Recordatorio «' + trunc(input.reminder, 40) + '» marcado/desmarcado', (list) => {
      const r = reminderRef(list, input.reminder);
      if (!r.ok) return failed(r);
      list[r.value.i].done = !list[r.value.i].done;
      return null;
    }, 'Recordatorio');
  }
  function deleteReminder(input) {
    const c = clientFrom(input.client);
    if (!c.ok) return failed(c);
    const list = c.value.recordatorios || [];
    const r = reminderRef(list, input.reminder);
    if (!r.ok) return failed(r);
    const text = list[r.value.i].text;
    list.splice(r.value.i, 1);
    persist(c.value, { action: 'Eliminar recordatorio', summary: say('eliminó el recordatorio "' + text + '"') });
    render();
    return ok({ deleted: text }, { mutated: true, summary: 'Recordatorio eliminado: «' + text + '»' });
  }

  function addDocument(input) {
    const name = txt(input.name);
    const url = txt(input.url);
    if (!name) return fail('Falta el nombre del recurso.');
    if (!url || !safeUrl(url)) return fail('El enlace debe empezar por http:// o https://.');
    return editList(input, 'docs', 'Recurso añadido: «' + name + '»', (list) => { list.push({ id: uid('doc_'), name, href: url, desc: txt(input.description) || '', type: 'link' }); return null; }, 'Nuevo recurso');
  }
  function deleteDocument(input) {
    const c = clientFrom(input.client);
    if (!c.ok) return failed(c);
    const list = c.value.docs || [];
    const r = findByText(list, input.document, (d) => d.name, 'el recurso');
    if (!r.ok) return failed(r);
    const name = list[r.value.i].name;
    list.splice(r.value.i, 1);
    persist(c.value, { action: 'Eliminar recurso', summary: say('eliminó el recurso "' + name + '"') });
    render();
    return ok({ deleted: name }, { mutated: true, summary: 'Recurso eliminado: «' + name + '»' });
  }

  // ── Pedidos y proveedores ─────────────────────────────────────────────────────────────────────────────
  const syncOrder = async (method, order) => {
    if (window.location.protocol === 'file:') return;
    try {
      const url = method === 'POST' ? '/api/suppliers/orders' : '/api/suppliers/orders/' + encodeURIComponent(order.id);
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: method === 'DELETE' ? undefined : JSON.stringify(order) });
    } catch (e) { console.warn('[assistant] sync pedido', e); }
  };

  const findOrder = (ref) => {
    const orders = ordersAccessible();
    if (!orders) return { ok: false, error: 'No tienes acceso al espacio de proveedores.' };
    return resolve(orders, ref, { ids: (o) => [o.id, o.invoiceNumber || ''], names: (o) => [o.concept], label: (o) => o.supplierName + ' · ' + o.concept + ' (' + o.orderDate + ')', noun: 'el pedido' });
  };

  function findSupplier(pv, ref) {
    const pool = [];
    (pv.cats || []).forEach((c) => (c.provs || []).forEach((p) => pool.push({ p, c })));
    return resolve(pool, ref, { ids: (e) => [e.p.id || ''], names: (e) => [e.p.name], label: (e) => e.p.name + ' (' + e.c.name + ')', noun: 'el proveedor' });
  }

  function commitOrders(pv, details) {
    if (typeof persistSupplierOrdersLocally === 'function') persistSupplierOrdersLocally(pv.orders);
    persist(pv, details);
    render();
  }

  function createOrder(input) {
    const pv = supplierProject();
    if (!pv) return fail('No tienes acceso al espacio de proveedores.');
    const concept = txt(input.concept);
    if (!concept) return fail('Falta el concepto del pedido.');
    const s = findSupplier(pv, input.supplier);
    if (!s.ok) return fail(s.error + ' Si es nuevo, créalo antes con create_supplier.', s.candidates);
    if (input.order_date && !validDate(input.order_date)) return fail('Fecha no válida «' + input.order_date + '». Usa AAAA-MM-DD.');
    if (input.payment_status && !PAYS.includes(input.payment_status)) return fail('Estado de pago no válido. Valores: ' + PAYS.join(', ') + '.');
    if (input.delivery_status && !DELIVERIES.includes(input.delivery_status)) return fail('Estado de entrega no válido. Valores: ' + DELIVERIES.join(', ') + '.');
    const amount = typeof input.amount === 'number' && Number.isFinite(input.amount) && input.amount >= 0 ? Math.round(input.amount * 100) / 100 : 0;
    const now = new Date().toISOString();
    const order = {
      id: uid('ord_'),
      supplierId: s.value.p.id || null,
      supplierName: s.value.p.name,
      categoryName: s.value.c.name,
      concept,
      orderDate: input.order_date || todayISO(),
      totalAmount: amount,
      status: input.payment_status || 'Pendiente',
      deliveryStatus: input.delivery_status || 'En curso',
      invoiceNumber: txt(input.invoice_number) || '',
      notes: txt(input.notes) || '',
      files: [],
      createdAt: now,
      updatedAt: now
    };
    pv.orders = pv.orders || [];
    pv.orders.unshift(order);
    commitOrders(pv, { action: 'Nuevo pedido', summary: say('registró el pedido a ' + order.supplierName + ': ' + concept) });
    syncOrder('POST', order);
    return ok(orderView(order), {
      mutated: true,
      summary: 'Pedido creado: ' + order.supplierName + ' · ' + concept + ' (' + (typeof fmtEUR === 'function' ? fmtEUR(amount, true) : amount + ' €') + ')',
      undo: {
        label: 'crear el pedido «' + concept + '»',
        run: async () => {
          pv.orders = pv.orders.filter((o) => o.id !== order.id);
          commitOrders(pv, { action: 'Pedido eliminado', summary: say('deshizo el pedido "' + concept + '"') });
          await syncOrder('DELETE', order);
          return { ok: true };
        }
      }
    });
  }

  function updateOrder(input) {
    const r = findOrder(input.order);
    if (!r.ok) return failed(r);
    const order = r.value;
    const pv = supplierProject();
    const before = clone(order);
    const changes = [];
    if (input.concept !== undefined) { const v = txt(input.concept); if (!v) return fail('El concepto no puede estar vacío.'); order.concept = v; changes.push('concepto'); }
    if (input.amount !== undefined) {
      if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount < 0) return fail('Importe no válido.');
      order.totalAmount = Math.round(input.amount * 100) / 100; changes.push('importe');
    }
    if (input.order_date !== undefined) { if (!validDate(input.order_date)) return fail('Fecha no válida. Usa AAAA-MM-DD.'); order.orderDate = input.order_date; changes.push('fecha'); }
    if (input.payment_status !== undefined) { if (!PAYS.includes(input.payment_status)) return fail('Estado de pago no válido. Valores: ' + PAYS.join(', ') + '.'); order.status = input.payment_status; changes.push('pago ' + input.payment_status); }
    if (input.delivery_status !== undefined) { if (!DELIVERIES.includes(input.delivery_status)) return fail('Estado de entrega no válido. Valores: ' + DELIVERIES.join(', ') + '.'); order.deliveryStatus = input.delivery_status; changes.push('entrega ' + input.delivery_status); }
    if (input.invoice_number !== undefined) { order.invoiceNumber = str(input.invoice_number) || ''; changes.push('referencia'); }
    if (input.notes !== undefined) { order.notes = str(input.notes) || ''; changes.push('notas'); }
    if (!changes.length) return fail('No se ha indicado ningún cambio.');
    order.updatedAt = new Date().toISOString();
    commitOrders(pv, { action: 'Pedido actualizado', summary: say('actualizó el pedido "' + order.concept + '" (' + changes.join(', ') + ')') });
    syncOrder('PUT', order);
    return ok(orderView(order), {
      mutated: true,
      summary: 'Pedido «' + trunc(order.concept, 48) + '» actualizado (' + changes.join(', ') + ')',
      undo: {
        label: 'actualizar el pedido «' + trunc(order.concept, 40) + '»',
        run: async () => {
          const idx = pv.orders.findIndex((o) => o.id === before.id);
          if (idx >= 0) pv.orders[idx] = before;
          commitOrders(pv, { action: 'Pedido actualizado', summary: say('deshizo un cambio en el pedido "' + before.concept + '"') });
          await syncOrder('PUT', before);
          return { ok: true };
        }
      }
    });
  }

  function deleteOrder(input) {
    const r = findOrder(input.order);
    if (!r.ok) return failed(r);
    const order = r.value;
    const pv = supplierProject();
    pv.orders = pv.orders.filter((o) => o.id !== order.id);
    commitOrders(pv, { action: 'Pedido eliminado', summary: say('eliminó el pedido a ' + order.supplierName + ': ' + order.concept) });
    syncOrder('DELETE', order);
    return ok({ deleted: order.concept }, { mutated: true, summary: 'Pedido eliminado: ' + order.supplierName + ' · ' + trunc(order.concept, 48) });
  }

  async function createSupplierCategory(input) {
    const pv = supplierProject();
    if (!pv) return fail('No tienes acceso al espacio de proveedores.');
    const name = txt(input.name);
    if (!name) return fail('Falta el nombre de la categoría.');
    if ((pv.cats || []).some((c) => norm(c.name) === norm(name))) return fail('Ya existe la categoría «' + name + '».');
    try {
      const res = await supplierRequest('/categories', { method: 'POST', body: JSON.stringify({ name, icon: categoryIcon(name) }) });
      const id = res && res.category && res.category.id;
      await loadSupplierDirectory();
      return ok({ category: name }, {
        mutated: true,
        summary: 'Categoría creada: ' + name,
        undo: id ? { label: 'crear la categoría ' + name, run: async () => { await supplierRequest('/categories/' + encodeURIComponent(id), { method: 'DELETE' }); await loadSupplierDirectory(); return { ok: true }; } } : undefined
      });
    } catch (e) {
      return fail('No se ha podido crear la categoría: ' + e.message);
    }
  }

  async function createSupplier(input) {
    const pv = supplierProject();
    if (!pv) return fail('No tienes acceso al espacio de proveedores.');
    const name = txt(input.name);
    if (!name) return fail('Falta el nombre del proveedor.');
    const cat = resolve(pv.cats || [], input.category, { ids: (c) => [c.id], names: (c) => [c.name], label: (c) => c.name, noun: 'la categoría' });
    if (!cat.ok) return fail(cat.error + ' Puedes crearla con create_supplier_category.', cat.candidates);
    const payload = {
      categoryId: cat.value.id,
      name,
      supplierType: txt(input.type) || 'Proveedor',
      email: txt(input.email) || '',
      phone: txt(input.phone) || '',
      website: txt(input.website) || '',
      paymentTerms: txt(input.payment_terms) || '',
      leadTime: txt(input.lead_time) || '',
      highlightNote: txt(input.notes) || '',
      productList: '',
      rates: []
    };
    try {
      const res = await supplierRequest('/', { method: 'POST', body: JSON.stringify(payload) });
      const id = res && res.supplier && res.supplier.id;
      await loadSupplierDirectory();
      return ok({ supplier: name, category: cat.value.name }, {
        mutated: true,
        summary: 'Proveedor creado: ' + name + ' (' + cat.value.name + ')',
        undo: id ? { label: 'crear el proveedor ' + name, run: async () => { await supplierRequest('/' + encodeURIComponent(id), { method: 'DELETE' }); await loadSupplierDirectory(); return { ok: true }; } } : undefined
      });
    } catch (e) {
      return fail('No se ha podido crear el proveedor: ' + e.message);
    }
  }

  async function deleteSupplier(input) {
    const pv = supplierProject();
    if (!pv) return fail('No tienes acceso al espacio de proveedores.');
    const s = findSupplier(pv, input.supplier);
    if (!s.ok) return failed(s);
    if (!s.value.p.id) return fail('Este proveedor no está guardado en la base de datos y no se puede eliminar desde aquí.');
    try {
      await supplierRequest('/' + encodeURIComponent(s.value.p.id), { method: 'DELETE' });
      await loadSupplierDirectory();
      return ok({ deleted: s.value.p.name }, { mutated: true, summary: 'Proveedor eliminado: ' + s.value.p.name });
    } catch (e) {
      return fail('No se ha podido eliminar el proveedor: ' + e.message);
    }
  }

  // ── Navegación ──────────────────────────────────────────────────────────────────────────────────────────
  function navigateTo(input) {
    const screen = input.screen;
    if (['dashboard', 'kanban_global', 'projects', 'calendar', 'settings'].includes(screen) && S.currentUser && S.currentUser.role !== 'admin') {
      return fail('Tu usuario no tiene acceso a esa pantalla.');
    }
    const nav = { dashboard: 'dashboard', kanban_global: 'kanbanGlobal', projects: 'proyectos', calendar: 'calendario' };
    if (nav[screen]) { setNavView(nav[screen]); return ok({ navigated: describeScreen() }); }
    if (screen === 'settings') { openConfigModal(); return ok({ navigated: 'Ajustes' }); }
    if (screen === 'suppliers' || screen === 'orders') {
      const pv = supplierProject();
      if (!pv) return fail('No tienes acceso al espacio de proveedores.');
      selectProj(pv.id);
      setView(screen === 'orders' ? 'pedidos' : 'catalogo');
      return ok({ navigated: describeScreen() });
    }
    if (screen === 'app') {
      const r = resolve(appsScope(), input.app, { ids: (a) => [a.id], names: (a) => [a.name], label: (a) => a.name, noun: 'la app' });
      if (!r.ok) return failed(r);
      selectProj(r.value.id);
      return ok({ navigated: describeScreen() });
    }
    // Cliente (por defecto) o tarea concreta
    let c;
    let task = null;
    if (txt(input.task) && !txt(input.client)) {
      const tr = findTask({ task: input.task });
      if (!tr.ok) return failed(tr);
      c = { ok: true, value: tr.value.c };
      task = tr.value.t;
    } else {
      c = clientFrom(input.client);
      if (!c.ok) return failed(c);
      if (txt(input.task)) {
        const tr = findTask({ task: input.task, client: c.value.id });
        if (!tr.ok) return failed(tr);
        task = tr.value.t;
      }
    }
    selectProj(c.value.id);
    if (input.view && ['resumen', 'kanban', 'actividad'].includes(input.view)) setView(input.view);
    else if (task) setView('kanban');
    if (task) openTaskDetail(c.value.id, task.code);
    return ok({ navigated: describeScreen() + (task ? ' · tarea ' + task.code : '') });
  }

  function setKanbanFilter(input) {
    const q = norm(input.owner);
    if (!q || q === 'todos' || q === 'todas' || q === 'all') { setKanbanOwnerFilter('all'); return ok({ kanban_owner_filter: 'all' }); }
    const owners = new Set();
    clientsScope().forEach((c) => (c.tasks || []).forEach((t) => { if (t.owner) owners.add(t.owner); }));
    const match = [...owners].find((o) => norm(o) === q) || [...owners].find((o) => norm(o).includes(q));
    if (!match) return fail('No hay tareas asignadas a «' + input.owner + '».', [...owners]);
    setKanbanOwnerFilter(match);
    return ok({ kanban_owner_filter: match });
  }

  // ── Deshacer ────────────────────────────────────────────────────────────────────────────────────────────────
  async function undoLastActions(input, runtime) {
    const count = Math.max(1, Math.min(10, int(input.count) || 1));
    const undone = [];
    const skipped = [];
    const stack = runtime.undoStack.filter((e) => !e.undone).reverse();
    for (const entry of stack.slice(0, count)) {
      try {
        const res = await entry.run();
        if (res && res.ok) { entry.undone = true; undone.push(entry.label); }
        else skipped.push((res && res.message) || 'No se pudo deshacer: ' + entry.label);
      } catch (e) { skipped.push('No se pudo deshacer: ' + entry.label); }
    }
    if (!undone.length && !skipped.length) return ok({ undone: [], message: 'No hay acciones reversibles que deshacer en esta conversación (los borrados no se pueden deshacer).' });
    return ok({ undone, skipped }, undone.length ? { mutated: true, summary: 'Deshecho: ' + undone.join('; ') } : {});
  }

  // ── Confirmaciones legibles ───────────────────────────────────────────────────────────────────────────────────
  function describeConfirmation(name, input) {
    const label = (r, fn) => (r && r.ok ? fn(r.value) : null);
    switch (name) {
      case 'delete_task': return label(findTask(input), (x) => '¿Eliminar la tarea «' + x.t.code + ' · ' + (x.t.title || x.t.name) + '» de ' + x.c.name + '? No se podrá deshacer.');
      case 'delete_client': return label(resolveClient(input.client), (c) => '¿Eliminar el cliente «' + c.name + '» con sus ' + (c.tasks || []).length + ' tareas, recordatorios y documentos? No se podrá deshacer.');
      case 'delete_reminder': { const c = clientFrom(input.client); return c.ok ? '¿Eliminar el recordatorio «' + trunc(input.reminder, 60) + '» de ' + c.value.name + '?' : null; }
      case 'delete_document': { const c = clientFrom(input.client); return c.ok ? '¿Eliminar el recurso «' + trunc(input.document, 60) + '» de ' + c.value.name + '?' : null; }
      case 'delete_order': return label(findOrder(input.order), (o) => '¿Eliminar el pedido «' + trunc(o.concept, 60) + '» de ' + o.supplierName + ' (' + (typeof fmtEUR === 'function' ? fmtEUR(o.totalAmount, true) : o.totalAmount) + ') con sus documentos? No se podrá deshacer.');
      case 'delete_supplier': { const pv = supplierProject(); return pv ? label(findSupplier(pv, input.supplier), (e) => '¿Eliminar el proveedor «' + e.p.name + '» del catálogo?') : null; }
      default: return null;
    }
  }

  // ── Registro de herramientas ────────────────────────────────────────────────────────────────────────────────
  const tools = {
    get_workspace_summary: getWorkspaceSummary,
    get_current_view: () => ok(currentSnapshot()),
    get_dashboard: getDashboard,
    list_clients: () => ok({ clients: clientsScope().map(clientView) }),
    get_client: (i) => {
      const c = clientFrom(i.client);
      if (!c.ok) return failed(c);
      const cl = c.value;
      return ok(Object.assign(clientView(cl), {
        tasks: (cl.tasks || []).map((t) => taskView(cl, t)),
        reminders: (cl.recordatorios || []).map(reminderView),
        documents: (cl.docs || []).map(docView)
      }));
    },
    search_tasks: searchTasks,
    get_task: (i) => { const r = findTask(i); return r.ok ? ok(taskDetail(r.value.c, r.value.t)) : failed(r); },
    get_calendar: getCalendar,
    list_activity: (i) => {
      const c = clientFrom(i.client);
      if (!c.ok) return failed(c);
      const n = Math.max(1, Math.min(30, int(i.limit) || 15));
      return ok({ client: c.value.name, activity: (c.value.activityLog || []).slice(0, n).map((a) => ({ when: a.timestamp, user: a.user, action: a.action, summary: a.summary })) });
    },
    list_documents: (i) => {
      const c = clientFrom(i.client);
      if (!c.ok) return failed(c);
      const q = norm(i.query);
      return ok({ client: c.value.name, documents: (c.value.docs || []).filter((d) => !q || norm(d.name + ' ' + d.desc).includes(q)).map(docView) });
    },
    list_apps: () => ok({ apps: appsScope().map((a) => ({ name: a.name, description: a.sub || '', connections: (a.conns || []).map((x) => x.name + ' — ' + x.detail) })) }),
    list_suppliers: listSuppliers,
    list_orders: listOrders,
    create_task: createTask,
    update_task: updateTask,
    add_checklist_item: addChecklistItem,
    toggle_checklist_item: toggleChecklistItem,
    remove_checklist_item: removeChecklistItem,
    add_task_link: addTaskLink,
    remove_task_link: removeTaskLink,
    add_task_comment: addTaskComment,
    create_client: createClient,
    update_client: updateClient,
    add_reminder: addReminder,
    update_reminder: updateReminder,
    toggle_reminder: toggleReminder,
    add_document: addDocument,
    create_order: createOrder,
    update_order: updateOrder,
    create_supplier: createSupplier,
    create_supplier_category: createSupplierCategory,
    navigate_to: navigateTo,
    set_kanban_filter: setKanbanFilter,
    delete_task: deleteTask,
    delete_client: deleteClient,
    delete_reminder: deleteReminder,
    delete_document: deleteDocument,
    delete_order: deleteOrder,
    delete_supplier: deleteSupplier,
    undo_last_actions: undoLastActions
  };

  /** Ejecuta una herramienta. Nunca lanza: un fallo se devuelve como error al modelo. */
  async function runTool(name, input, runtime) {
    const fn = tools[name];
    if (!fn) return fail('Herramienta desconocida: ' + name + '.');
    try {
      return await fn(input || {}, runtime);
    } catch (e) {
      console.error('[assistant] error en ' + name, e);
      return fail('Error al ejecutar ' + name + ': ' + (e && e.message ? e.message : e));
    }
  }

  window.LigrowAITools = { runTool, describeConfirmation, describeScreen, currentSnapshot, todayISO };
})();
