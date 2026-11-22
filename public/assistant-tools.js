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

  // ── Adjuntos del chat (los registra assistant.js) ─────────────────────────────────────────────────────
  const attachments = new Map();
  const dataUrlOf = (a) => 'data:' + a.mediaType + ';base64,' + a.base64;
  function filesFromRefs(refs) {
    const files = [];
    for (const ref of Array.isArray(refs) ? refs : []) {
      const a = attachments.get(String(ref));
      if (!a) return { error: 'No existe el adjunto «' + ref + '». Los disponibles: ' + ([...attachments.keys()].join(', ') || 'ninguno') + '.' };
      files.push({ id: uid('f_'), name: a.name, type: a.mediaType, size: a.size || Math.round(a.base64.length * 0.75), data: dataUrlOf(a), createdAt: new Date().toISOString() });
    }
    return { files };
  }

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
    documents: (o.files || []).map((f) => f.name),
    product_url: o.productUrl || null,
    product_preview: o.previewImage ? true : false
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
    if (isAdmin() && window.LigrowInvoicing) {
      const inv = window.LigrowInvoicing.INV.invoices.filter((i) => i.status !== 'anulada' && i.status !== 'borrador');
      const pend = inv.filter((i) => i.status === 'emitida');
      summary.facturas_emitidas = {
        total: inv.length,
        facturado_eur: Math.round(inv.reduce((n, i) => n + i.total, 0) * 100) / 100,
        pendiente_de_cobro_eur: Math.round(pend.reduce((n, i) => n + i.total, 0) * 100) / 100,
        vencidas_sin_cobrar: pend.filter((i) => i.dueDate && i.dueDate < todayISO()).length
      };
    }
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
    } else if (S.navView === 'facturas' && window.LigrowInvoicing) {
      const I = window.LigrowInvoicing.INV;
      view.tab = S.facTab || 'facturas';
      view.invoices = { total: I.invoices.length, customers: I.customers.length, filters: { search: S.facSearch || '', status: S.facStatus || '' } };
    }
    if (S.modal === 'taskDetail' && S._taskDetail) {
      const c = DATA.find((p) => p.id === (S._taskDetail.clientId || S._taskDetail.clientid));
      const t = c && (c.tasks || []).find((x) => x.code === S._taskDetail.taskCode || x.id === S._taskDetail.taskCode);
      if (c && t) view.open_task = taskDetail(c, t);
    }
    return view;
  }

  function describeScreen() {
    const names = { dashboard: 'Dashboard', kanbanGlobal: 'Kanban Global', proyectos: 'Todos los proyectos', calendario: 'Calendario', facturas: 'Facturas › ' + ({ clientes: 'Clientes', ajustes: 'Ajustes' }[S.facTab] || 'Facturas') };
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
    const att = filesFromRefs(input.attachment_refs);
    if (att.error) return fail(att.error);
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
      files: att.files,
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
    if (Array.isArray(input.attachment_refs) && input.attachment_refs.length) {
      const att = filesFromRefs(input.attachment_refs);
      if (att.error) return fail(att.error);
      order.files = (order.files || []).concat(att.files);
      changes.push(att.files.length + ' archivo(s)');
    }
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

  // ── Leer documentos de pedidos y vista previa del producto ────────────────────────────────────────────
  const parseDataUrl = (d) => {
    const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ''));
    return m ? { mediaType: m[1], data: m[2] } : null;
  };

  function readOrderDocument(input) {
    const r = findOrder(input.order);
    if (!r.ok) return failed(r);
    const order = r.value;
    const files = order.files || [];
    if (!files.length) return fail('Este pedido no tiene archivos adjuntos.');
    let file = files[0];
    if (txt(input.document)) {
      const f = resolve(files, input.document, { ids: (x) => [x.id || ''], names: (x) => [x.name || ''], label: (x) => x.name, noun: 'el archivo' });
      if (!f.ok) return failed(f);
      file = f.value;
    }
    const parsed = parseDataUrl(file.data);
    if (!parsed) return fail('El archivo «' + file.name + '» no tiene el contenido guardado (solo se conservó su nombre), así que no puedo leerlo. Pídele al usuario que lo vuelva a adjuntar.');
    let block;
    if (parsed.mediaType === 'application/pdf') {
      if (parsed.data.length > 2000000) return fail('El PDF es demasiado grande para leerlo (máx. ~1,4 MB).');
      block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: parsed.data } };
    } else if (/^image\/(jpeg|png|webp|gif)$/.test(parsed.mediaType)) {
      if (parsed.data.length > 1500000) return fail('La imagen es demasiado grande para leerla.');
      block = { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data } };
    } else {
      return fail('Formato no legible: ' + parsed.mediaType + '.');
    }
    return { result: { order: order.concept, file: file.name, note: 'El contenido del archivo va a continuación.' }, content: [block] };
  }

  async function setOrderProduct(input) {
    const r = findOrder(input.order);
    if (!r.ok) return failed(r);
    const order = r.value;
    const pv = supplierProject();
    const url = txt(input.url);
    if (!url || !safeUrl(url)) return fail('La URL debe empezar por http:// o https://.');
    const given = txt(input.image_url);
    if (given && !safeUrl(given)) return fail('La URL de la imagen debe empezar por http:// o https://.');
    let preview = null;
    let previewError = '';
    try {
      // La pista (concepto del pedido) ayuda a distinguir la foto del producto de logos, menús y banners.
      const q = '/api/assistant/link-preview?url=' + encodeURIComponent(url) + '&hint=' + encodeURIComponent(order.concept || '') + (given ? '&image=' + encodeURIComponent(given) : '');
      const res = await fetch(q, { credentials: 'same-origin' });
      const body = await res.json().catch(() => null);
      if (res.ok && body && body.preview) preview = body.preview;
      else previewError = (body && body.error) || 'No se pudo leer la página.';
    } catch (e) { previewError = 'No se pudo conectar para leer la página.'; }
    if (!preview) return fail('No he podido leer la página del producto (' + previewError + '). Comprueba que la URL es correcta y pública, o prueba con otra.');
    const image = preview.image || '';
    if (!image) return fail('No he encontrado ninguna imagen utilizable en esa página' + (preview.imageError ? ' (' + preview.imageError + ')' : '') + '. Prueba con otra URL del producto o con image_url.', (preview.candidates || []).map((c) => c.url));
    const before = clone(order);
    order.productUrl = preview.url || url;
    order.productTitle = preview.title || '';
    order.previewImage = image;
    order.updatedAt = new Date().toISOString();
    commitOrders(pv, { action: 'Pedido actualizado', summary: say('añadió el enlace del producto al pedido "' + order.concept + '"') });
    syncOrder('PUT', order);
    const d = preview.imageData;
    const content = d && d.base64 ? [{ type: 'image', source: { type: 'base64', media_type: d.mediaType, data: d.base64 } }] : undefined;
    return {
      result: {
        order: order.concept,
        product_url: order.productUrl,
        title: order.productTitle || null,
        image_used: image,
        image_shown_below: !!content,
        price: preview.price ? preview.price + ' ' + (preview.currency || '') : null,
        candidates: (preview.candidates || []).filter((c) => c.url !== image).slice(0, 6).map((c) => ({ image_url: c.url, alt: c.alt })),
        note: content
          ? 'La imagen guardada se muestra a continuación. Compruébala: si es una foto del producto, termina; si es un logo u otra cosa, repite con image_url de otra candidata.'
          : 'No se pudo descargar la imagen para mostrártela, pero se ha guardado su dirección.'
      },
      content,
      mutated: true,
      summary: 'Vista previa del producto añadida a «' + trunc(order.concept, 44) + '»',
      undo: {
        label: 'añadir el producto a «' + trunc(order.concept, 40) + '»',
        run: async () => {
          const idx = pv.orders.findIndex((o) => o.id === before.id);
          if (idx >= 0) pv.orders[idx] = before;
          commitOrders(pv, { action: 'Pedido actualizado', summary: say('deshizo el enlace del producto de "' + before.concept + '"') });
          await syncOrder('PUT', before);
          return { ok: true };
        }
      }
    };
  }

  // ── Facturación emitida ─────────────────────────────────────────────────────────────────────────────────
  const FI = () => window.LigrowInvoicing;
  const needInvoicing = () => {
    if (!isAdmin()) return fail('Solo los administradores pueden gestionar la facturación.');
    if (!FI()) return fail('El módulo de facturación no está disponible.');
    return null;
  };
  const cents = (n) => Math.round(Number(n) * 100) / 100;
  const customerView = (c) => ({ id: c.id, name: c.name, tax_id: c.taxId, address: c.address, postal_code: c.postalCode, city: c.city, province: c.province || null, country: c.country || null, email: c.email || null, phone: c.phone || null });
  const settingsView = (s) => ({ company_name: s.companyName, tax_id: s.taxId, tax_id_label: s.taxIdLabel, address: s.address, postal_code: s.postalCode, city: s.city, country: s.country, email: s.email, phone: s.phone, website: s.website, iban: s.iban, bank_name: s.bankName, series: s.series, start_number: s.startNumber, default_vat_rate: s.defaultVatRate, default_irpf_rate: s.defaultIrpfRate, payment_days: s.paymentDays, payment_method: s.paymentMethod, footer_note: s.footerNote, invoice_language: s.invoiceLanguage });
  const syncNote = (okSaved) => (okSaved === false ? { warning: 'NO se ha guardado en Supabase: ' + (FI().ops.error() || 'error desconocido') + ' Díselo al usuario; el cambio solo existe en este navegador.' } : {});

  /** Deshace restaurando una copia de todo el almacén de facturación. */
  const inverse = (snap, label) => ({ label, run: async () => { await FI().ops.restore(snap); render(); FI().refresh(); return { ok: true }; } });

  async function getInvoiceSettings() {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load();
    const missing = FI().ops.missingIssuer();
    return ok({ settings: settingsView(FI().INV.settings), missing_required: missing, ready_to_invoice: !missing.length });
  }

  async function updateInvoiceSettings(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load(true);
    const map = { company_name: 'companyName', tax_id: 'taxId', tax_id_label: 'taxIdLabel', bank_name: 'bankName', address: 'address', postal_code: 'postalCode', city: 'city', country: 'country', email: 'email', phone: 'phone', website: 'website', iban: 'iban', series: 'series', payment_method: 'paymentMethod', footer_note: 'footerNote' };
    const numeric = { default_vat_rate: ['defaultVatRate', 0, 100], default_irpf_rate: ['defaultIrpfRate', 0, 60], payment_days: ['paymentDays', 0, 365], start_number: ['startNumber', 1, 99999999] };
    const snap = FI().ops.snapshot();
    const changes = [];
    const s = FI().INV.settings;
    for (const [k, prop] of Object.entries(map)) {
      if (input[k] !== undefined) { s[prop] = (str(input[k]) || '').trim(); changes.push(prop); }
    }
    for (const [k, [prop, lo, hi]] of Object.entries(numeric)) {
      if (input[k] !== undefined) {
        const v = Number(input[k]);
        if (!Number.isFinite(v) || v < lo || v > hi) { FI().ops.restore(snap); return fail('Valor no válido para ' + k + '.'); }
        s[prop] = v; changes.push(prop);
      }
    }
    if (input.invoice_language !== undefined) {
      if (!['ca', 'es'].includes(input.invoice_language)) { FI().ops.restore(snap); return fail('Idioma no válido (ca o es).'); }
      s.invoiceLanguage = input.invoice_language; changes.push('invoiceLanguage');
    }
    if (!changes.length) return fail('No se ha indicado ningún dato.');
    if (s.series && !/^[A-Za-z0-9]{1,6}$/.test(s.series)) { await FI().ops.restore(snap); return fail('La serie debe tener 1-6 letras o números.'); }
    const saved = await FI().ops.save();
    render();
    const missing = FI().ops.missingIssuer();
    return ok({ settings: settingsView(s), missing_required: missing, ...syncNote(saved) }, { mutated: true, summary: 'Datos de facturación actualizados', undo: inverse(snap, 'actualizar los datos de facturación') });
  }

  async function listCustomers(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load();
    const q = norm(input.query);
    const list = FI().INV.customers.filter((c) => !q || norm([c.name, c.taxId, c.city].join(' ')).includes(q));
    return ok({ total: list.length, customers: list.map(customerView) });
  }

  async function createCustomer(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load(true);
    const data = { name: txt(input.name), taxId: txt(input.tax_id), address: txt(input.address), postalCode: txt(input.postal_code), city: txt(input.city), province: txt(input.province) || '', country: txt(input.country) || 'España', email: txt(input.email) || '', phone: txt(input.phone) || '', notes: txt(input.notes) || '' };
    const faltan = FI().ops.missingCustomer(data);
    if (faltan.length) return fail('Faltan datos del cliente: ' + faltan.join(', ') + '. Pídeselos al usuario.');
    const dup = FI().INV.customers.find((c) => norm(c.taxId) === norm(data.taxId));
    if (dup) return fail('Ya existe un cliente con ese NIF: «' + dup.name + '». Úsalo o edítalo con update_customer.');
    const snap = FI().ops.snapshot();
    const c = FI().ops.addCustomer(data);
    const saved = await FI().ops.save();
    render();
    return ok({ customer: customerView(c), ...syncNote(saved) }, { mutated: true, summary: 'Cliente de facturación creado: ' + c.name, undo: inverse(snap, 'crear el cliente ' + c.name) });
  }

  async function updateCustomer(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load(true);
    const f = FI().ops.findCustomer(input.customer);
    if (!f.ok) return fail(f.error, f.candidates);
    const map = { name: 'name', tax_id: 'taxId', address: 'address', postal_code: 'postalCode', city: 'city', province: 'province', country: 'country', email: 'email', phone: 'phone', notes: 'notes' };
    const snap = FI().ops.snapshot();
    const changes = [];
    for (const [k, prop] of Object.entries(map)) if (input[k] !== undefined) { f.value[prop] = (str(input[k]) || '').trim(); changes.push(prop); }
    if (!changes.length) return fail('No se ha indicado ningún cambio.');
    const saved = await FI().ops.save();
    render();
    return ok({ customer: customerView(f.value), ...syncNote(saved) }, { mutated: true, summary: 'Cliente «' + f.value.name + '» actualizado', undo: inverse(snap, 'actualizar el cliente ' + f.value.name) });
  }

  async function deleteCustomer(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load(true);
    const f = FI().ops.findCustomer(input.customer);
    if (!f.ok) return fail(f.error, f.candidates);
    FI().INV.customers = FI().INV.customers.filter((c) => c.id !== f.value.id);
    await FI().ops.save();
    render();
    return ok({ deleted: f.value.name }, { mutated: true, summary: 'Cliente de facturación eliminado: ' + f.value.name });
  }

  async function listInvoices(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load();
    const q = norm(input.query);
    const cu = norm(input.customer);
    const rows = FI().INV.invoices.filter((i) => {
      if (input.status && i.status !== input.status) return false;
      if (cu && !norm(i.customer.name + ' ' + i.customer.taxId).includes(cu)) return false;
      if (input.from && i.date < input.from) return false;
      if (input.to && i.date > input.to) return false;
      if (q && !norm([i.number, i.customer.name, i.lines.map((l) => l.description).join(' ')].join(' ')).includes(q)) return false;
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.number).localeCompare(String(a.number)));
    const live = rows.filter((i) => i.status !== 'anulada' && i.status !== 'borrador');
    return ok({ total: rows.length, total_billed: cents(live.reduce((n, i) => n + i.total, 0)), pending_collection: cents(rows.filter((i) => i.status === 'emitida').reduce((n, i) => n + i.total, 0)), invoices: rows.slice(0, 40).map((i) => ({ number: i.number, status: i.status, date: i.date, due_date: i.dueDate, customer: i.customer.name, subtotal: i.subtotal, vat: i.vatTotal, total: i.total })) });
  }

  async function getInvoice(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load();
    const f = FI().ops.findInvoice(input.invoice);
    return f.ok ? ok(FI().ops.summary(f.value)) : fail(f.error, f.candidates);
  }

  const mapLines = (lines) => (Array.isArray(lines) ? lines : []).map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unit_price, total: l.total, vatRate: l.vat_rate }));

  async function createInvoice(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load(true); // numeración correlativa: siempre sobre lo último guardado
    const faltanEmisor = FI().ops.missingIssuer();
    if (faltanEmisor.length) return fail('Faltan datos del emisor para poder facturar: ' + faltanEmisor.join(', ') + '. Pídeselos al usuario y guárdalos con update_invoice_settings.');
    const f = FI().ops.findCustomer(input.customer);
    if (!f.ok) return fail(f.error + ' Pide al usuario sus datos y créalo con create_customer.', f.candidates);
    let inv;
    try {
      inv = FI().ops.buildInvoice({ customerObj: f.value, includesVat: input.amounts_include_vat, date: input.date, dueDate: input.due_date, vatRate: input.vat_rate, irpfRate: input.irpf_rate, number: txt(input.number), lines: mapLines(input.lines), paymentMethod: txt(input.payment_method), reference: txt(input.reference), notes: txt(input.notes), status: input.status });
    } catch (e) {
      return fail(e.message, e.candidates);
    }
    const snap = FI().ops.snapshot();
    const saved = await FI().ops.addInvoice(inv);
    render();
    return ok(Object.assign(FI().ops.summary(inv), syncNote(saved)), { mutated: true, summary: 'Factura ' + inv.number + ' creada · ' + inv.customer.name + ' · ' + FI().eur(inv.total), undo: inverse(snap, 'crear la factura ' + inv.number) });
  }

  async function updateInvoice(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load(true);
    const f = FI().ops.findInvoice(input.invoice);
    if (!f.ok) return fail(f.error, f.candidates);
    const inv = f.value;
    const snap = FI().ops.snapshot();
    const changes = [];
    try {
      if (input.customer !== undefined) {
        const c = FI().ops.findCustomer(input.customer);
        if (!c.ok) return fail(c.error, c.candidates);
        const faltan = FI().ops.missingCustomer(c.value);
        if (faltan.length) return fail('Al cliente «' + c.value.name + '» le faltan datos: ' + faltan.join(', ') + '.');
        inv.customerId = c.value.id;
        inv.customer = { id: c.value.id, name: c.value.name, taxId: c.value.taxId, address: c.value.address, postalCode: c.value.postalCode, city: c.value.city, province: c.value.province || '', country: c.value.country || 'España', email: c.value.email || '', phone: c.value.phone || '' };
        changes.push('cliente');
      }
      if (input.date !== undefined) {
        if (!FI().calc.validDate(input.date)) return fail('Fecha no válida. Usa AAAA-MM-DD.');
        if (input.date.slice(0, 4) !== inv.date.slice(0, 4)) return fail('No se puede cambiar el año de una factura ya numerada: anúlala y crea otra.');
        inv.date = input.date; changes.push('fecha');
      }
      if (input.due_date !== undefined) { if (!FI().calc.validDate(input.due_date)) return fail('Vencimiento no válido.'); inv.dueDate = input.due_date; changes.push('vencimiento'); }
      if (input.vat_rate !== undefined) { const v = Number(input.vat_rate); if (!Number.isFinite(v) || v < 0 || v > 100) return fail('IVA no válido.'); inv.vatRate = v; changes.push('IVA'); }
      if (input.irpf_rate !== undefined) { const v = Number(input.irpf_rate); if (!Number.isFinite(v) || v < 0 || v > 60) return fail('IRPF no válido.'); inv.irpfRate = v; changes.push('IRPF'); }
      if (input.lines !== undefined) {
        if (typeof input.amounts_include_vat !== 'boolean') return fail('Al cambiar las líneas indica si los importes incluyen IVA (amounts_include_vat).');
        if (!Array.isArray(input.lines) || !input.lines.length) return fail('La factura necesita al menos una línea.');
        inv.lines = mapLines(input.lines).map((l) => FI().calc.buildLine(l, { includesVat: input.amounts_include_vat, vatRate: inv.vatRate }));
        changes.push('líneas');
      } else if (input.vat_rate !== undefined) {
        return fail('Para cambiar el tipo de IVA vuelve a indicar las líneas (lines) con amounts_include_vat.');
      }
      if (input.payment_method !== undefined) { inv.paymentMethod = str(input.payment_method) || ''; changes.push('forma de pago'); }
      if (input.reference !== undefined) { inv.reference = str(input.reference) || ''; changes.push('referencia'); }
      if (input.notes !== undefined) { inv.notes = str(input.notes) || ''; changes.push('observaciones'); }
      if (input.status !== undefined) {
        if (!FI().STATUSES.includes(input.status)) return fail('Estado no válido.');
        inv.status = input.status;
        inv.paidDate = input.status === 'cobrada' ? (input.paid_date && FI().calc.validDate(input.paid_date) ? input.paid_date : inv.paidDate || todayISO()) : '';
        changes.push('estado ' + input.status);
      }
    } catch (e) {
      await FI().ops.restore(snap);
      return fail(e.message);
    }
    if (!changes.length) return fail('No se ha indicado ningún cambio.');
    FI().ops.recalc(inv);
    inv.updatedAt = new Date().toISOString();
    const saved = await FI().ops.save();
    render();
    return ok(Object.assign(FI().ops.summary(inv), syncNote(saved)), { mutated: true, summary: 'Factura ' + inv.number + ' actualizada (' + changes.join(', ') + ')', undo: inverse(snap, 'actualizar la factura ' + inv.number) });
  }

  async function deleteInvoice(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load(true);
    const f = FI().ops.findInvoice(input.invoice);
    if (!f.ok) return fail(f.error, f.candidates);
    const gone = await FI().ops.removeInvoice(f.value.id);
    render();
    return ok(Object.assign({ deleted: f.value.number }, syncNote(gone)), { mutated: true, summary: 'Factura eliminada: ' + f.value.number });
  }

  async function openInvoice(input) {
    const bad = needInvoicing(); if (bad) return bad;
    await FI().ops.load();
    const f = FI().ops.findInvoice(input.invoice);
    if (!f.ok) return fail(f.error, f.candidates);
    S.facTab = 'facturas';
    setNavView('facturas');
    FI().view(f.value.id);
    return ok({ opened: f.value.number, note: 'La factura está abierta en pantalla: el usuario puede pulsar «PDF / Imprimir» para guardarla como PDF.' });
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
    if (screen === 'invoices' || screen === 'customers') {
      if (!isAdmin()) return fail('Solo los administradores pueden acceder a la facturación.');
      S.facTab = screen === 'customers' ? 'clientes' : 'facturas';
      setNavView('facturas');
      return ok({ navigated: describeScreen() });
    }
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
      case 'delete_invoice': { const I = window.LigrowInvoicing; const f = I && I.ops.findInvoice(input.invoice); return f && f.ok ? '¿Eliminar la factura «' + f.value.number + '» de ' + f.value.customer.name + ' (' + I.eur(f.value.total) + ')? Dejará un hueco en la numeración y no se podrá deshacer.' : null; }
      case 'delete_customer': { const I = window.LigrowInvoicing; const f = I && I.ops.findCustomer(input.customer); return f && f.ok ? '¿Eliminar al cliente de facturación «' + f.value.name + '»? Sus facturas se conservan.' : null; }
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
    read_order_document: readOrderDocument,
    set_order_product: setOrderProduct,
    get_invoice_settings: getInvoiceSettings,
    update_invoice_settings: updateInvoiceSettings,
    list_customers: listCustomers,
    create_customer: createCustomer,
    update_customer: updateCustomer,
    delete_customer: deleteCustomer,
    list_invoices: listInvoices,
    get_invoice: getInvoice,
    create_invoice: createInvoice,
    update_invoice: updateInvoice,
    delete_invoice: deleteInvoice,
    open_invoice: openInvoice,
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

  window.LigrowAITools = { runTool, describeConfirmation, describeScreen, currentSnapshot, todayISO, attachments };
})();
