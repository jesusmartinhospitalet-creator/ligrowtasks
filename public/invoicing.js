/* Ligrow Tasks · Facturación emitida
 *
 * - El cálculo (base, IVA, IRPF, total, numeración) vive en invoice-calc.js, el MISMO código que usa el servidor.
 * - Almacén (INV): facturas, clientes de facturación y ajustes del emisor, guardados en SUPABASE a través de
 *   /api/invoicing (tablas invoice_settings, invoice_customers e invoices). El navegador solo conserva una copia
 *   local de apoyo. Cada cambio se envía por diferencias (solo lo modificado) y, si falla, se avisa: nunca se
 *   da por guardado algo que el servidor ha rechazado.
 * - Vistas: Facturas, Clientes y Ajustes (sección «Facturas» del menú) + vista previa/PDF + editor.
 * - ops: operaciones con validación que usan tanto la interfaz como el asistente de IA.
 */
(function (root) {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.LigrowInvoiceCalc) return;

  const calc = window.LigrowInvoiceCalc;
  const { r2, r4, buildLine, computeTotals, recomputeLine, nextNumber, validDate, addDays, todayISO } = calc;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // ══ Almacén ═════════════════════════════════════════════════════════════════════════════════════
  const STORE_KEY = 'ligrow_invoicing_v2';
  const API = '/api/invoicing';
  const STATUSES = ['borrador', 'emitida', 'cobrada', 'anulada'];
  const STATUS_LABEL = { borrador: 'Borrador', emitida: 'Emitida', cobrada: 'Cobrada', anulada: 'Anulada' };

  const defaultSettings = () => ({
    companyName: '', taxId: '', taxIdLabel: 'NIF', address: '', postalCode: '', city: '', country: 'España',
    email: '', phone: '', website: '', iban: '', bankName: '', series: '', startNumber: 1, defaultVatRate: 21,
    defaultIrpfRate: 0, paymentDays: 30, paymentMethod: 'Transferencia bancaria', footerNote: '', invoiceLanguage: 'ca'
  });

  // storage: 'supabase' | 'memory' (solo desarrollo local) | '' (aún sin saber) · error: último fallo al guardar/cargar
  const INV = { invoices: [], customers: [], settings: defaultSettings(), loaded: false, storage: '', error: '' };
  let saveChain = Promise.resolve(true);
  let loadPromise = null;
  // Lo último que se sabe que tiene el servidor (id → JSON) para enviar solo lo que cambia.
  const synced = { invoices: new Map(), customers: new Map(), settings: '' };

  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const sig = (o) => JSON.stringify(o);
  const eur = (n) => (typeof fmtEUR === 'function' ? fmtEUR(n, true) : r2(n).toFixed(2).replace('.', ',') + ' €');
  const eurUnit = (n) => { const v = r4(n); const s = (Math.abs(v - r2(v)) < 1e-9 ? v.toFixed(2) : String(v)).replace('.', ','); return s + ' €'; };
  const fmtDate = (iso) => (validDate(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : iso || '');
  const num = (n) => String(r2(n).toFixed(2)).replace('.', ',');
  const isAdmin = () => !S.currentUser || S.currentUser.role === 'admin';

  function applyPayload(p) {
    if (!p || typeof p !== 'object') return false;
    INV.invoices = Array.isArray(p.invoices) ? p.invoices : [];
    INV.customers = Array.isArray(p.customers) ? p.customers : [];
    INV.settings = Object.assign(defaultSettings(), p.settings || {});
    return true;
  }
  const payload = () => ({ invoices: INV.invoices, customers: INV.customers, settings: INV.settings });

  // Copia local de apoyo (para ver algo si el servidor no responde); la fuente de verdad es Supabase.
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) applyPayload(JSON.parse(raw));
  } catch (e) { /* sin copia local */ }

  function saveLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(payload())); } catch (e) { /* almacenamiento lleno o bloqueado */ }
  }

  function markSynced() {
    synced.invoices = new Map(INV.invoices.map((i) => [i.id, sig(i)]));
    synced.customers = new Map(INV.customers.map((c) => [c.id, sig(c)]));
    synced.settings = sig(INV.settings);
  }

  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(API + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      return { ok: false, status: 0, message: 'No se ha podido conectar con el servidor.' };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, code: data && data.error, message: (data && data.message) || 'Error ' + res.status + ' del servidor.' };
    return { ok: true, status: res.status, data };
  }

  /** Envía a Supabase lo que haya cambiado (clientes → ajustes → facturas → borrados). Devuelve true si todo quedó guardado. */
  async function flush() {
    if (window.location.protocol === 'file:') return true;
    const errors = [];
    const run = async (promise, onOk) => { const r = await promise; if (r.ok) onOk(r); else errors.push(r.message); return r.ok; };
    for (const c of INV.customers) {
      const s = sig(c);
      if (synced.customers.get(c.id) !== s) await run(call('PUT', '/customers/' + encodeURIComponent(c.id), c), () => synced.customers.set(c.id, s));
    }
    if (synced.settings !== sig(INV.settings)) {
      const s = sig(INV.settings);
      await run(call('PUT', '/settings', INV.settings), () => { synced.settings = s; });
    }
    for (const i of INV.invoices) {
      const s = sig(i);
      if (synced.invoices.get(i.id) !== s) await run(call('PUT', '/invoices/' + encodeURIComponent(i.id), i), () => synced.invoices.set(i.id, s));
    }
    for (const id of [...synced.invoices.keys()]) {
      if (!INV.invoices.some((i) => i.id === id)) await run(call('DELETE', '/invoices/' + encodeURIComponent(id)), () => synced.invoices.delete(id));
    }
    for (const id of [...synced.customers.keys()]) {
      if (!INV.customers.some((c) => c.id === id)) await run(call('DELETE', '/customers/' + encodeURIComponent(id)), () => synced.customers.delete(id));
    }
    INV.error = errors[0] || '';
    return !errors.length;
  }

  /** Guarda (copia local + Supabase, en orden). Devuelve una promesa con true si quedó guardado en Supabase. */
  function save() {
    saveLocal();
    saveChain = saveChain.then(flush, flush);
    return saveChain.then((ok) => { if (!ok) refreshBanner(); return ok; });
  }

  /** Lee de Supabase (fuente de verdad entre dispositivos). Antes envía lo pendiente para no perderlo. */
  function load(force) {
    if (window.location.protocol === 'file:') { INV.loaded = true; return Promise.resolve(); }
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
      await saveChain.catch(() => false);
      const pending = INV.invoices.some((i) => synced.invoices.get(i.id) !== sig(i)) || INV.customers.some((c) => synced.customers.get(c.id) !== sig(c)) || synced.settings !== sig(INV.settings);
      const r = await call('GET', '');
      INV.loaded = true;
      if (!r.ok) {
        if (r.status !== 401 && r.status !== 403) INV.error = r.message;
        refreshView();
        return;
      }
      INV.storage = r.data.storage || '';
      if (pending) { await flush(); refreshView(); return; } // hay cambios locales sin enviar: se conservan
      const before = sig(payload());
      applyPayload({ invoices: r.data.invoices, customers: r.data.customers, settings: r.data.settings });
      markSynced();
      saveLocal();
      INV.error = '';
      if (sig(payload()) !== before || INV.storage === 'memory') refreshView();
    })().catch(() => { INV.loaded = true; }).finally(() => { setTimeout(() => { loadPromise = null; }, 4000); });
    return loadPromise;
  }

  function refreshView() {
    if (typeof S !== 'undefined' && S.navView === 'facturas' && !overlay) render();
  }
  function refreshBanner() {
    if (typeof S !== 'undefined' && S.navView === 'facturas' && !overlay) render();
  }

  // ══ Operaciones (usadas por la interfaz y por el asistente) ══════════════════════════════════════════
  const ISSUER_REQUIRED = [['companyName', 'nombre o razón social'], ['taxId', 'NIF/CIF'], ['address', 'dirección'], ['postalCode', 'código postal'], ['city', 'población']];
  const CUSTOMER_REQUIRED = [['name', 'nombre o razón social'], ['taxId', 'NIF/CIF/NIE'], ['address', 'dirección'], ['postalCode', 'código postal'], ['city', 'población']];
  const missing = (obj, spec) => spec.filter(([k]) => !String((obj && obj[k]) || '').trim()).map(([, label]) => label);

  const findCustomer = (ref) => {
    const q = norm(ref);
    if (!q) return { ok: false, error: 'Indica el cliente.' };
    const by = (fn) => INV.customers.filter(fn);
    let hit = by((c) => c.id === ref || norm(c.taxId) === q);
    if (hit.length === 1) return { ok: true, value: hit[0] };
    hit = by((c) => norm(c.name) === q);
    if (hit.length === 1) return { ok: true, value: hit[0] };
    hit = by((c) => norm(c.name).includes(q) || norm(c.taxId).includes(q));
    if (hit.length === 1) return { ok: true, value: hit[0] };
    if (hit.length > 1) return { ok: false, error: 'Hay varios clientes que coinciden con «' + ref + '». Pregunta cuál.', candidates: hit.slice(0, 8).map((c) => c.name + ' (' + c.taxId + ')') };
    return { ok: false, error: 'No hay ningún cliente de facturación «' + ref + '».', candidates: INV.customers.slice(0, 8).map((c) => c.name) };
  };

  const findInvoice = (ref) => {
    const q = norm(ref);
    if (!q) return { ok: false, error: 'Indica la factura (número o id).' };
    let hit = INV.invoices.filter((i) => i.id === ref || norm(i.number) === q);
    if (hit.length === 1) return { ok: true, value: hit[0] };
    hit = INV.invoices.filter((i) => norm(i.number).includes(q) || norm(i.customer && i.customer.name).includes(q));
    if (hit.length === 1) return { ok: true, value: hit[0] };
    if (hit.length > 1) return { ok: false, error: 'Hay varias facturas que coinciden con «' + ref + '». Pregunta cuál.', candidates: hit.slice(0, 8).map((i) => i.number + ' · ' + (i.customer && i.customer.name)) };
    return { ok: false, error: 'No encuentro la factura «' + ref + '».', candidates: INV.invoices.slice(0, 8).map((i) => i.number) };
  };

  const customerSnapshot = (c) => ({ id: c.id, name: c.name, taxId: c.taxId, address: c.address, postalCode: c.postalCode, city: c.city, province: c.province || '', country: c.country || 'España', email: c.email || '', phone: c.phone || '' });
  const issuerSnapshot = () => ({ companyName: INV.settings.companyName, taxId: INV.settings.taxId, taxIdLabel: INV.settings.taxIdLabel || 'NIF', language: INV.settings.invoiceLanguage || 'ca', address: INV.settings.address, postalCode: INV.settings.postalCode, city: INV.settings.city, country: INV.settings.country, email: INV.settings.email, phone: INV.settings.phone, website: INV.settings.website });

  function recalc(inv) {
    const t = computeTotals(inv.lines, inv.irpfRate);
    inv.subtotal = t.subtotal;
    inv.vatBreakdown = t.vatBreakdown;
    inv.vatTotal = t.vatTotal;
    inv.irpf = t.irpf;
    inv.total = t.total;
    return inv;
  }

  function checkInvoiceInput(input, current) {
    const date = input.date !== undefined ? input.date : (current && current.date) || todayISO();
    if (!validDate(date)) throw new Error('Fecha no válida «' + date + '». Usa AAAA-MM-DD.');
    if (input.dueDate && !validDate(input.dueDate)) throw new Error('Vencimiento no válido «' + input.dueDate + '».');
    if (input.paidDate && !validDate(input.paidDate)) throw new Error('Fecha de cobro no válida.');
    if (input.vatRate !== undefined && (!isNum(Number(input.vatRate)) || input.vatRate < 0 || input.vatRate > 100)) throw new Error('IVA no válido.');
    if (input.irpfRate !== undefined && (!isNum(Number(input.irpfRate)) || input.irpfRate < 0 || input.irpfRate > 60)) throw new Error('IRPF no válido.');
    if (input.status !== undefined && !STATUSES.includes(input.status)) throw new Error('Estado no válido. Valores: ' + STATUSES.join(', ') + '.');
    return date;
  }

  /** Crea (sin guardar) una factura validada y calculada. Lanza Error con un mensaje claro si falta algo. */
  function buildInvoice(input) {
    const faltanEmisor = missing(INV.settings, ISSUER_REQUIRED);
    if (faltanEmisor.length) {
      const e = new Error('Faltan datos del emisor para poder facturar: ' + faltanEmisor.join(', ') + '. Pídeselos al usuario y guárdalos con update_invoice_settings.');
      e.code = 'issuer_incomplete';
      throw e;
    }
    let c = input.customerObj;
    if (!c) {
      const f = findCustomer(input.customer);
      if (!f.ok) { const e = new Error(f.error); e.candidates = f.candidates; throw e; }
      c = f.value;
    }
    const faltanCliente = missing(c, CUSTOMER_REQUIRED);
    if (faltanCliente.length) {
      const e = new Error('Al cliente «' + c.name + '» le faltan datos: ' + faltanCliente.join(', ') + '. Pídeselos al usuario y complétalos con update_customer.');
      e.code = 'customer_incomplete';
      throw e;
    }
    if (typeof input.includesVat !== 'boolean') throw new Error('Indica si los importes incluyen IVA (amounts_include_vat).');
    if (!Array.isArray(input.lines) || !input.lines.length) throw new Error('La factura necesita al menos una línea.');
    const date = checkInvoiceInput(input);
    const vatRate = input.vatRate !== undefined ? Number(input.vatRate) : Number(INV.settings.defaultVatRate);
    const irpfRate = input.irpfRate !== undefined ? Number(input.irpfRate) : Number(INV.settings.defaultIrpfRate || 0);
    const lines = input.lines.map((l) => buildLine(l, { includesVat: input.includesVat, vatRate }));
    const status = input.status || 'emitida';
    const series = String(INV.settings.series || '').trim();
    const now = new Date().toISOString();
    // Número propio solo para registrar una factura ya emitida fuera de la app (p. ej. la 104); debe ser único.
    let number = String(input.number == null ? '' : input.number).trim();
    if (number) {
      if (number.length > 40) throw new Error('El número de factura es demasiado largo.');
      if (INV.invoices.some((i) => String(i.number) === number)) throw new Error('Ya existe una factura con el número ' + number + '.');
    } else {
      number = nextNumber(INV.invoices, series, date, INV.settings.startNumber);
    }
    const inv = {
      id: uid('inv_'),
      number,
      series,
      status,
      date,
      dueDate: input.dueDate || addDays(date, INV.settings.paymentDays),
      paidDate: status === 'cobrada' ? input.paidDate || todayISO() : '',
      customerId: c.id,
      customer: customerSnapshot(c),
      issuer: issuerSnapshot(),
      lines,
      vatRate,
      irpfRate,
      paymentMethod: input.paymentMethod || INV.settings.paymentMethod || '',
      iban: INV.settings.iban || '',
      bankName: INV.settings.bankName || '',
      reference: input.reference || '',
      notes: input.notes || '',
      footerNote: INV.settings.footerNote || '',
      createdAt: now,
      updatedAt: now,
      createdBy: (S.currentUser && S.currentUser.name) || ''
    };
    return recalc(inv);
  }

  const summary = (inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    date: inv.date,
    due_date: inv.dueDate,
    paid_date: inv.paidDate || null,
    customer: inv.customer && inv.customer.name,
    customer_tax_id: inv.customer && inv.customer.taxId,
    lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_price_net: l.unitPrice, vat_rate: l.vatRate, net: l.net, vat: l.vat, total: l.total })),
    subtotal: inv.subtotal,
    vat: inv.vatBreakdown.map((b) => ({ rate: b.rate, base: b.base, vat: b.vat })),
    vat_total: inv.vatTotal,
    irpf: inv.irpf,
    total: inv.total,
    payment_method: inv.paymentMethod,
    reference: inv.reference || null,
    notes: inv.notes || null
  });

  const ops = {
    findCustomer, findInvoice, buildInvoice, summary, recalc, missingIssuer: () => missing(INV.settings, ISSUER_REQUIRED), missingCustomer: (c) => missing(c, CUSTOMER_REQUIRED),
    snapshot: () => clone(payload()),
    restore: (snap) => { applyPayload(snap); return save(); },
    addInvoice(inv) { INV.invoices.unshift(inv); return save(); },
    removeInvoice(id) { INV.invoices = INV.invoices.filter((i) => i.id !== id); return save(); },
    addCustomer(data) {
      const c = Object.assign({ id: uid('cus_'), country: 'España', createdAt: new Date().toISOString() }, data);
      INV.customers.push(c);
      return c;
    },
    save,
    load,
    error: () => INV.error
  };

  // ══ Documento de factura (HTML) ════════════════════════════════════════════════════════════════════
  // Diseño de la plantilla de Ligrow: minimalista, tipografía espaciada, filas finas y etiquetas en catalán
  // (o castellano, según los ajustes). Cifras como en la plantilla: «950», «199.50», «-142.50», «1007€».
  const LABELS = {
    ca: { to: 'FACTURA A:', no: 'FACTURA Nº', desc: 'DESCRIPCIÓ DELS SERVEIS PRESTATS', total: 'TOTAL', base: 'Base', vat: 'IVA', irpf: 'IRPF', billing: 'DADES DE FACTURACIÓ', account: 'Compte', taxId: 'NIF', ref: 'Ref.', cancelled: 'ANUL·LADA' },
    es: { to: 'FACTURA A:', no: 'FACTURA Nº', desc: 'DESCRIPCIÓN DE LOS SERVICIOS PRESTADOS', total: 'TOTAL', base: 'Base', vat: 'IVA', irpf: 'IRPF', billing: 'DATOS DE FACTURACIÓN', account: 'Cuenta', taxId: 'NIF', ref: 'Ref.', cancelled: 'ANULADA' }
  };

  const DOC_CSS = `
.inv-doc{--ink:#3a3a3a;--rule:#4d4d4d;width:210mm;max-width:100%;min-height:297mm;margin:0 auto;background:#fff;color:var(--ink);font-family:'Montserrat','DM Sans',system-ui,sans-serif;font-size:3.55mm;line-height:1.7;letter-spacing:.14em;padding:58mm 17mm 16mm;box-sizing:border-box;position:relative;display:flex;flex-direction:column}
.inv-doc *{box-sizing:border-box}
.inv-doc h4{margin:0 0 3mm;font-size:3.5mm;font-weight:700;letter-spacing:.17em;text-transform:uppercase;line-height:1.4}
.inv-doc p{margin:0}
.inv-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm}
.inv-to p{line-height:1.75}
.inv-no{text-align:right;padding-top:5mm}
.inv-no .n{font-size:3.6mm;font-weight:700;margin:2mm 0 3mm}
.inv-no .d{margin-top:1mm}
.inv-no .r{margin-top:1.5mm;font-size:3mm;letter-spacing:.1em}
.inv-rule{border:0;border-top:.3mm solid var(--rule);margin:0}
.inv-dhead{display:flex;justify-content:space-between;align-items:center;gap:8mm;font-weight:700;font-size:3.5mm;letter-spacing:.17em;padding:5.5mm 1mm 5.5mm 0;margin-top:9mm;border-top:.3mm solid var(--rule);border-bottom:.3mm solid var(--rule)}
.inv-lines{padding:6mm 1mm 4mm 0;min-height:62mm}
.inv-line{display:flex;justify-content:space-between;gap:8mm;margin-bottom:4mm}
.inv-line-d{flex:1}
.inv-line-d small{display:block;font-size:3mm;letter-spacing:.1em;opacity:.8}
.inv-line-a{white-space:nowrap;text-align:right}
.inv-totals{border-top:.3mm solid var(--rule);margin-top:8mm;padding-top:5mm;display:flex;flex-direction:column;align-items:flex-end}
.inv-trow{display:flex;gap:7mm;justify-content:flex-end;width:100%;padding:1.6mm 0}
.inv-trow span:first-child{flex:1;text-align:right}
.inv-trow span:last-child{min-width:26mm;text-align:right}
.inv-grand{border-top:.3mm solid var(--rule);margin-top:3.5mm;padding-top:4mm;font-weight:700;font-size:5.4mm;letter-spacing:.14em}
.inv-bill{margin-top:15mm}
.inv-notes{margin-top:9mm;font-size:3.1mm;letter-spacing:.08em;opacity:.85}
.inv-grow{flex:1}
.inv-foot{margin-top:10mm;font-size:2.8mm;letter-spacing:.08em;opacity:.7}
.inv-watermark{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%) rotate(-24deg);font-weight:800;font-size:26mm;letter-spacing:.1em;color:rgba(197,48,48,.12);pointer-events:none;white-space:nowrap}
@media print{.inv-doc{box-shadow:none;margin:0}}
`;
  const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&display=swap';

  /** Cifras como en la plantilla: enteros sin decimales y decimales con punto. */
  const amt = (n) => { const v = r2(n); return Number.isInteger(v) ? String(v) : v.toFixed(2); };
  const dmy = (iso) => (validDate(iso) ? Number(iso.slice(8, 10)) + '/' + Number(iso.slice(5, 7)) + '/' + iso.slice(0, 4) : iso || '');
  const fmtIban = (v) => String(v || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
  const nl = (v) => esc(v).replace(/\n/g, '<br>');

  function invoiceHtml(inv) {
    const lang = LABELS[(inv.issuer && inv.issuer.language) || INV.settings.invoiceLanguage] || LABELS.ca;
    const iss = inv.issuer || {};
    const cus = inv.customer || {};
    const showAmounts = inv.lines.length > 1 || inv.lines.some((l) => Number(l.quantity) !== 1);
    const lines = inv.lines.map((l) => '<div class="inv-line"><div class="inv-line-d">' + nl(l.description) +
      (Number(l.quantity) !== 1 ? '<small>' + esc(String(l.quantity).replace('.', ',')) + ' × ' + esc(amt(l.unitPrice)) + ' €</small>' : '') + '</div>' +
      (showAmounts ? '<div class="inv-line-a">' + amt(l.net) + '</div>' : '') + '</div>').join('');
    const vatRows = (inv.vatBreakdown || []).map((b) => '<div class="inv-trow"><span>' + lang.vat + ' (' + amt(b.rate) + '%)</span><span>' + amt(b.vat) + '</span></div>').join('');
    const toLines = [cus.name, cus.address, [cus.postalCode, cus.city].filter(Boolean).join(' '), cus.taxId ? lang.taxId + ': ' + cus.taxId : ''].filter(Boolean).map(esc).join('<br>');
    const billLines = [iss.companyName || iss.name, iss.taxId ? (iss.taxIdLabel || 'NIF') + ' ' + iss.taxId : '', iss.address, [iss.city, iss.postalCode].filter(Boolean).join(' - '), inv.bankName ? lang.account + ' ' + inv.bankName : '', fmtIban(inv.iban)].filter(Boolean).map(esc).join('<br>');
    return '<div class="inv-doc">' +
      (inv.status === 'anulada' ? '<div class="inv-watermark">' + lang.cancelled + '</div>' : '') +
      '<div class="inv-top"><div class="inv-to"><h4>' + lang.to + '</h4><p>' + toLines + '</p></div>' +
      '<div class="inv-no"><h4>' + lang.no + '</h4><div class="n">' + esc(inv.number) + '</div><div class="d">' + dmy(inv.date) + '</div>' + (inv.reference ? '<div class="r">' + lang.ref + ' ' + esc(inv.reference) + '</div>' : '') + '</div></div>' +
      '<div class="inv-dhead"><span>' + lang.desc + '</span><span>' + lang.total + '</span></div>' +
      '<div class="inv-lines">' + lines + '</div>' +
      '<div class="inv-totals"><div class="inv-trow"><span>' + lang.base + '</span><span>' + amt(inv.subtotal) + '</span></div>' + vatRows +
      (inv.irpf ? '<div class="inv-trow"><span>' + lang.irpf + ' (' + amt(inv.irpfRate) + '%)</span><span>-' + amt(inv.irpf) + '</span></div>' : '') +
      '<div class="inv-trow inv-grand"><span>' + lang.total + '</span><span>' + amt(inv.total) + '€</span></div></div>' +
      '<div class="inv-bill"><h4>' + lang.billing + '</h4><p>' + billLines + '</p></div>' +
      (inv.notes ? '<div class="inv-notes">' + nl(inv.notes) + '</div>' : '') +
      '<div class="inv-grow"></div>' +
      (inv.footerNote ? '<div class="inv-foot">' + esc(inv.footerNote) + '</div>' : '') + '</div>';
  }

  /** Imprime / guarda como PDF la factura sin abrir ventanas emergentes (iframe oculto). */
  function printInvoice(id) {
    const r = findInvoice(id);
    if (!r.ok) return;
    const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ' + esc(r.value.number) + '</title>' +
      '<link href="' + FONT_LINK + '" rel="stylesheet">' +
      '<style>@page{size:A4;margin:0}html,body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}' + DOC_CSS + '</style></head><body>' + invoiceHtml(r.value) + '</body></html>';
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const w = frame.contentWindow;
    w.document.open();
    w.document.write(html);
    w.document.close();
    const go = () => { try { w.focus(); w.print(); } finally { setTimeout(() => frame.remove(), 60000); } };
    const ready = w.document.fonts && w.document.fonts.ready ? Promise.race([w.document.fonts.ready, new Promise((x) => setTimeout(x, 2000))]) : Promise.resolve();
    ready.then(() => setTimeout(go, 150));
  }

  // ══ Interfaz ═══════════════════════════════════════════════════════════════════════════════════════
  let overlay = null;
  const ensureStyles = () => {
    if (document.getElementById('inv-doc-css')) return;
    const style = document.createElement('style');
    style.id = 'inv-doc-css';
    style.textContent = DOC_CSS;
    document.head.appendChild(style);
    if (!document.querySelector('link[href*="Montserrat"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  };

  const openOverlay = (inner, wide) => {
    ensureStyles();
    closeOverlay();
    overlay = document.createElement('div');
    overlay.id = 'inv-root';
    overlay.className = 'inv-overlay';
    overlay.innerHTML = '<div class="inv-dialog' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + inner + '</div>';
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeOverlay(); });
    document.body.appendChild(overlay);
    return overlay;
  };
  function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay) { closeOverlay(); e.stopPropagation(); } }, true);

  const statusPill = (s) => {
    const cls = { borrador: 'idle', emitida: 'violet', cobrada: 'ok', anulada: 'danger' }[s] || 'idle';
    return '<span class="pill ' + cls + '">' + (s === 'cobrada' ? '<svg class="oi" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : '<span class="dot"></span>') + STATUS_LABEL[s] + '</span>';
  };

  const ico = (d, s) => '<svg class="oi" width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICO = {
    plus: '<path d="M5 12h14M12 5v14"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    coins: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'
  };

  const tabBtn = (id, label, count) => '<button class="tab ' + ((S.facTab || 'facturas') === id ? 'on' : '') + '" onclick="LigrowInvoicing.ui.tab(\'' + id + '\')">' + label + (count != null ? ' <span class="inv-count">' + count + '</span>' : '') + '</button>';

  function kpis() {
    const year = String(new Date().getFullYear());
    const live = INV.invoices.filter((i) => i.status !== 'anulada' && i.status !== 'borrador');
    const ofYear = live.filter((i) => String(i.date).startsWith(year));
    const billed = ofYear.reduce((n, i) => n + i.total, 0);
    const paid = ofYear.filter((i) => i.status === 'cobrada').reduce((n, i) => n + i.total, 0);
    const pend = live.filter((i) => i.status === 'emitida');
    const pendSum = pend.reduce((n, i) => n + i.total, 0);
    const overdue = pend.filter((i) => i.dueDate && i.dueDate < todayISO()).length;
    const vatYear = ofYear.reduce((n, i) => n + i.vatTotal, 0);
    return '<div class="pedidos-stats">' +
      '<div class="pk green"><div class="pk-body"><div class="pk-lbl">' + ico(ICO.coins, 18) + 'Facturado ' + year + '</div><div class="pk-val">' + eur(billed).replace(',00', '') + '</div><div class="pk-sub">' + ofYear.length + (ofYear.length === 1 ? ' factura emitida' : ' facturas emitidas') + '</div></div></div>' +
      '<div class="pk green"><div class="pk-body"><div class="pk-lbl">' + ico(ICO.check, 18) + 'Cobrado</div><div class="pk-val">' + eur(paid).replace(',00', '') + '</div><div class="pk-sub">' + ofYear.filter((i) => i.status === 'cobrada').length + ' cobradas</div></div></div>' +
      '<div class="pk amber"><div class="pk-body"><div class="pk-lbl">' + ico(ICO.clock, 18) + 'Pendiente de cobro</div><div class="pk-val">' + eur(pendSum).replace(',00', '') + '</div><div class="pk-sub">' + pend.length + ' por cobrar' + (overdue ? ' · ' + overdue + ' vencidas' : '') + '</div></div></div>' +
      '<div class="pk neutral"><div class="pk-body"><div class="pk-lbl">' + ico(ICO.file, 18) + 'IVA repercutido</div><div class="pk-val">' + eur(vatYear).replace(',00', '') + '</div><div class="pk-sub">En lo que va de ' + year + '</div></div></div></div>';
  }

  function listTab() {
    const q = norm(S.facSearch);
    const st = S.facStatus || '';
    const rows = INV.invoices
      .filter((i) => (!st || i.status === st) && (!q || norm([i.number, i.customer && i.customer.name, i.lines.map((l) => l.description).join(' ')].join(' ')).includes(q)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.number).localeCompare(String(a.number)));
    const body = rows.length
      ? '<div class="inv-table"><div class="inv-row inv-head-row"><div>Nº</div><div>Fecha</div><div>Cliente</div><div>Concepto</div><div class="r">Base</div><div class="r">IVA</div><div class="r">Total</div><div class="c">Estado</div><div class="r">Acciones</div></div>' +
        rows.map((i) => '<div class="inv-row" onclick="LigrowInvoicing.ui.view(\'' + i.id + '\')"><div class="inv-num-c">' + esc(i.number) + '</div><div>' + fmtDate(i.date) + '</div><div class="inv-cust">' + esc(i.customer.name) + '<small>' + esc(i.customer.taxId) + '</small></div><div class="inv-desc">' + esc(i.lines.map((l) => l.description).join(' · ')) + '</div><div class="r">' + eur(i.subtotal) + '</div><div class="r">' + eur(i.vatTotal) + '</div><div class="r inv-total">' + eur(i.total) + '</div><div class="c">' + statusPill(i.status) + '</div><div class="r inv-acts" onclick="event.stopPropagation()"><button class="ord-btn" onclick="LigrowInvoicing.ui.view(\'' + i.id + '\')">' + ico(ICO.eye) + 'Ver</button><button class="ord-btn ord-kebab" title="Imprimir / guardar PDF" onclick="LigrowInvoicing.print(\'' + i.id + '\')">' + ico(ICO.print) + '</button></div></div>').join('') + '</div>'
      : '<div class="pedidos-empty"><div class="pedidos-empty-ico">' + ico(ICO.file, 30) + '</div><div class="pedidos-empty-title">' + (INV.invoices.length ? 'No hay facturas con esos filtros' : 'Todavía no hay facturas') + '</div><div class="pedidos-empty-desc">' + (INV.invoices.length ? 'Prueba con otra búsqueda o quita el filtro.' : 'Crea la primera o pídeselo al asistente: «crea una factura de hoy de 100 tarjetas, total 30 €».') + '</div><button class="pedidos-btn-primary" onclick="LigrowInvoicing.ui.edit()">' + ico(ICO.plus) + 'Nueva factura</button></div>';
    return kpis() +
      '<div class="pedidos-toolbar"><div class="ped-search">' + ico(ICO.search) + '<input id="inv-search-in" type="text" placeholder="Buscar por número, cliente o concepto…" value="' + esc(S.facSearch || '') + '" oninput="LigrowInvoicing.ui.search(this)" autocomplete="off"></div>' +
      '<label class="ped-sel"><b>Estado:</b><select onchange="S.facStatus=this.value;render()"><option value="">Todos</option>' + STATUSES.map((s) => '<option value="' + s + '"' + (st === s ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>').join('') + '</select>' + ico(ICO.chev, 16).replace('class="oi"', 'class="oi chev"') + '</label></div>' + body;
  }

  function customersTab() {
    const rows = INV.customers.map((c) => '<div class="inv-row cus" onclick="LigrowInvoicing.ui.customer(\'' + c.id + '\')"><div class="inv-cust">' + esc(c.name) + '<small>' + esc(c.taxId) + '</small></div><div>' + esc([c.address, c.postalCode, c.city].filter(Boolean).join(', ')) + '</div><div>' + esc(c.email || '') + '</div><div>' + INV.invoices.filter((i) => i.customerId === c.id).length + ' facturas</div><div class="r" onclick="event.stopPropagation()"><button class="ord-btn" onclick="LigrowInvoicing.ui.customer(\'' + c.id + '\')">' + ico(ICO.edit) + 'Editar</button></div></div>').join('');
    return '<div class="pedidos-toolbar"><div style="flex:1;font-size:13px;color:var(--text-2)">Personas y empresas a las que facturas. Sus datos fiscales salen en cada factura.</div><button class="pedidos-btn-primary" onclick="LigrowInvoicing.ui.customer()">' + ico(ICO.plus) + 'Nuevo cliente</button></div>' +
      (INV.customers.length ? '<div class="inv-table"><div class="inv-row cus inv-head-row"><div>Cliente</div><div>Dirección</div><div>Email</div><div>Facturas</div><div class="r">Acciones</div></div>' + rows + '</div>' : '<div class="pedidos-empty"><div class="pedidos-empty-title">Aún no hay clientes de facturación</div><div class="pedidos-empty-desc">Se crean al facturar (el asistente te pedirá los datos) o con el botón «Nuevo cliente».</div></div>');
  }

  const field = (label, name, value, attrs) => '<div class="modal-field"><div class="modal-lbl">' + label + '</div><input class="modal-in" data-f="' + name + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '></div>';

  function settingsTab() {
    const s = INV.settings;
    const miss = ops.missingIssuer();
    return (miss.length ? '<div class="ai-warn" style="display:block;margin:0 0 14px">Faltan datos del emisor para poder facturar: <b>' + miss.join(', ') + '</b>.</div>' : '') +
      '<div class="card inv-settings" id="inv-settings-form"><div class="card-head">Datos del emisor (aparecen en «Dades de facturació»)</div><div class="inv-grid">' +
      field('Nombre o razón social *', 'companyName', s.companyName) + field('NIF/CIF/DNI *', 'taxId', s.taxId) + field('Se imprime como', 'taxIdLabel', s.taxIdLabel, 'placeholder="NIF, DNI, CIF…"') + field('Dirección *', 'address', s.address) + field('Código postal *', 'postalCode', s.postalCode) + field('Población *', 'city', s.city) + field('País', 'country', s.country) + field('Email', 'email', s.email) + field('Teléfono', 'phone', s.phone) + field('Web', 'website', s.website) + '</div>' +
      '<div class="card-head" style="margin-top:18px">Cobro y numeración</div><div class="inv-grid">' +
      field('Banco', 'bankName', s.bankName) + field('IBAN para cobros', 'iban', s.iban) +
      field('Serie (vacía = 104, 105, 106…)', 'series', s.series, 'placeholder="vacía"') +
      field('Numerar desde (mínimo)', 'startNumber', s.startNumber, 'type="number" min="1"') +
      field('IVA por defecto (%)', 'defaultVatRate', s.defaultVatRate, 'type="number" step="0.01"') + field('IRPF por defecto (%)', 'defaultIrpfRate', s.defaultIrpfRate, 'type="number" step="0.01"') +
      field('Días de pago', 'paymentDays', s.paymentDays, 'type="number" min="0"') + field('Forma de pago', 'paymentMethod', s.paymentMethod) +
      '<div class="modal-field"><div class="modal-lbl">Idioma de la factura</div><select class="modal-in" data-f="invoiceLanguage"><option value="ca"' + (s.invoiceLanguage === 'ca' ? ' selected' : '') + '>Català</option><option value="es"' + (s.invoiceLanguage === 'es' ? ' selected' : '') + '>Castellano</option></select></div></div>' +
      '<div class="modal-field" style="margin-top:6px"><div class="modal-lbl">Texto al pie de las facturas (opcional)</div><input class="modal-in" data-f="footerNote" value="' + esc(s.footerNote) + '"></div>' +
      '<p style="font-size:12px;color:var(--text-3);margin:10px 0 0">Con la serie vacía, cada factura nueva usa el número siguiente al mayor que exista, sin bajar nunca del que indiques en «Numerar desde» (por ejemplo, 106).</p>' +
      '<div style="margin-top:14px"><button class="pedidos-btn-primary" onclick="LigrowInvoicing.ui.saveSettings()">Guardar ajustes</button></div></div>';
  }

  /** Aviso de estado del guardado (Supabase). */
  function storageBanner() {
    if (INV.error) return '<div class="inv-banner err"><b>No se ha guardado en Supabase.</b> ' + esc(INV.error) + '</div>';
    if (INV.storage === 'memory') return '<div class="inv-banner warn"><b>Guardado temporal.</b> El servidor no tiene Supabase configurado: lo que hagas aquí se pierde al reiniciarlo.</div>';
    return '';
  }

  function nav() {
    if (!INV.loaded && isAdmin()) load();
    if (!isAdmin()) return '<div class="mn"><div class="ct"><p style="color:var(--text-3)">No tienes acceso a la facturación.</p></div></div>';
    const tab = S.facTab || 'facturas';
    return '<div class="mn"><div class="tb"><div class="tb-row1"><div style="flex:1"><div class="proj-title-row"><h1 class="proj-title">Facturas</h1><span class="type-pill">Facturación</span></div><div class="proj-sub-text">Emite, guarda y descarga facturas para tus clientes</div></div>' +
      '<div class="tb-actions-group"><button type="button" class="tb-btn-pri" onclick="LigrowInvoicing.ui.edit()">' + ico(ICO.plus) + 'Nueva factura</button></div></div>' +
      '<div class="tb-tabs-bar"><div class="tabs">' + tabBtn('facturas', 'Facturas', INV.invoices.length) + tabBtn('clientes', 'Clientes', INV.customers.length) + tabBtn('ajustes', 'Ajustes') + '</div></div></div>' +
      '<div class="ct"><div class="pedidos-layout">' + storageBanner() + (tab === 'clientes' ? customersTab() : tab === 'ajustes' ? settingsTab() : listTab()) + '</div></div></div>';
  }

  // ── Vista previa ──────────────────────────────────────────────────────────────────────────────────
  function viewModal(id) {
    const r = findInvoice(id);
    if (!r.ok) return;
    const i = r.value;
    openOverlay(
      '<div class="inv-bar"><div><div class="inv-bar-t">' + esc(i.number) + ' ' + statusPill(i.status) + '</div><div class="inv-bar-s">' + esc(i.customer.name) + ' · ' + eur(i.total) + '</div></div><div class="inv-bar-a">' +
      '<button class="tb-btn-pri" onclick="LigrowInvoicing.print(\'' + i.id + '\')">' + ico(ICO.print) + 'PDF / Imprimir</button>' +
      '<button class="tb-btn-sec" onclick="LigrowInvoicing.ui.edit(\'' + i.id + '\')">' + ico(ICO.edit) + 'Editar</button>' +
      (i.status === 'cobrada' ? '' : i.status === 'anulada' ? '' : '<button class="tb-btn-sec" onclick="LigrowInvoicing.ui.setStatus(\'' + i.id + '\',\'cobrada\')">' + ico(ICO.check) + 'Marcar cobrada</button>') +
      (i.status === 'anulada' ? '<button class="tb-btn-sec" onclick="LigrowInvoicing.ui.setStatus(\'' + i.id + '\',\'emitida\')">Reactivar</button>' : '<button class="tb-btn-sec" onclick="LigrowInvoicing.ui.setStatus(\'' + i.id + '\',\'anulada\')">Anular</button>') +
      '<button class="tb-btn-sec danger" onclick="LigrowInvoicing.ui.del(\'' + i.id + '\')" title="Eliminar">' + ico(ICO.trash) + '</button>' +
      '<button class="inv-x" onclick="LigrowInvoicing.ui.close()" aria-label="Cerrar">×</button></div></div>' +
      '<div class="inv-scroll">' + invoiceHtml(i) + '</div>', true);
  }

  // ── Editor ────────────────────────────────────────────────────────────────────────────────────────
  let draft = null;

  const lineRow = (l, idx) => '<div class="inv-line" data-i="' + idx + '"><input class="modal-in" data-l="description" placeholder="Descripción" value="' + esc(l.description) + '"><input class="modal-in" data-l="quantity" type="number" step="0.01" min="0" value="' + esc(l.quantity) + '"><input class="modal-in" data-l="unitPrice" type="number" step="0.0001" min="0" value="' + esc(l.unitPrice) + '"><input class="modal-in" data-l="vatRate" type="number" step="0.01" min="0" value="' + esc(l.vatRate) + '"><div class="inv-line-t" data-t>' + eur(l.net) + '</div><button class="inv-line-x" onclick="LigrowInvoicing.ui.rmLine(' + idx + ')" aria-label="Quitar línea">×</button></div>';

  function editorHtml() {
    const d = draft;
    const t = computeTotals(d.lines, d.irpfRate);
    return '<div class="inv-bar"><div><div class="inv-bar-t">' + (d.id ? 'Editar ' + esc(d.number) : 'Nueva factura') + '</div><div class="inv-bar-s">Los importes se calculan solos</div></div><div class="inv-bar-a"><button class="inv-x" onclick="LigrowInvoicing.ui.close()" aria-label="Cerrar">×</button></div></div>' +
      '<div class="inv-scroll inv-form" id="inv-form">' +
      '<div class="inv-grid"><div class="modal-field"><div class="modal-lbl">Cliente *</div><select class="modal-in" data-f="customerId"><option value="">Selecciona…</option>' + INV.customers.map((c) => '<option value="' + c.id + '"' + (d.customerId === c.id ? ' selected' : '') + '>' + esc(c.name) + ' (' + esc(c.taxId) + ')</option>').join('') + '</select><button class="inv-link" onclick="LigrowInvoicing.ui.newCustomerFromEditor()">+ Nuevo cliente</button></div>' +
      field('Fecha *', 'date', d.date, 'type="date"') + field('Vencimiento', 'dueDate', d.dueDate, 'type="date"') + field('Forma de pago', 'paymentMethod', d.paymentMethod) + field('IVA general (%)', 'vatRate', d.vatRate, 'type="number" step="0.01"') + field('IRPF (%)', 'irpfRate', d.irpfRate, 'type="number" step="0.01"') + field('Referencia del cliente', 'reference', d.reference) +
      '<div class="modal-field"><div class="modal-lbl">Estado</div><select class="modal-in" data-f="status">' + STATUSES.map((s) => '<option value="' + s + '"' + (d.status === s ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>').join('') + '</select></div></div>' +
      '<div class="modal-lbl" style="margin-top:14px">Líneas (precio unitario SIN IVA)</div><div class="inv-line inv-line-h"><span>Descripción</span><span>Cant.</span><span>Precio</span><span>IVA %</span><span>Importe</span><span></span></div><div id="inv-lines">' + d.lines.map(lineRow).join('') + '</div>' +
      '<button class="inv-link" onclick="LigrowInvoicing.ui.addLine()">+ Añadir línea</button>' +
      '<div class="modal-field" style="margin-top:12px"><div class="modal-lbl">Observaciones</div><textarea class="modal-in" data-f="notes" rows="2">' + esc(d.notes) + '</textarea></div>' +
      '<div class="inv-sum" id="inv-sum">' + sumHtml(t) + '</div>' +
      '<div class="inv-actions"><button class="modal-cancel" onclick="LigrowInvoicing.ui.close()">Cancelar</button><button class="modal-ok" onclick="LigrowInvoicing.ui.saveInvoice()">' + (d.id ? 'Guardar cambios' : 'Crear factura') + '</button></div></div>';
  }

  const sumHtml = (t) => '<div>Base imponible <b>' + eur(t.subtotal) + '</b></div>' + t.vatBreakdown.map((b) => '<div>IVA ' + num(b.rate) + ' % <b>' + eur(b.vat) + '</b></div>').join('') + (t.irpf ? '<div>IRPF <b>−' + eur(t.irpf) + '</b></div>' : '') + '<div class="grand">Total <b>' + eur(t.total) + '</b></div>';

  function readEditor() {
    const form = document.getElementById('inv-form');
    if (!form || !draft) return;
    form.querySelectorAll('[data-f]').forEach((el) => { draft[el.getAttribute('data-f')] = el.value; });
    form.querySelectorAll('.inv-line[data-i]').forEach((row) => {
      const i = Number(row.getAttribute('data-i'));
      row.querySelectorAll('[data-l]').forEach((el) => { draft.lines[i][el.getAttribute('data-l')] = el.value; });
      const l = draft.lines[i];
      const parsed = { description: l.description, quantity: parseFloat(l.quantity) || 0, unitPrice: parseFloat(l.unitPrice) || 0, vatRate: parseFloat(l.vatRate) || 0 };
      draft.lines[i] = Object.assign(parsed, recomputeLine(parsed));
      const t = row.querySelector('[data-t]');
      if (t) t.textContent = eur(draft.lines[i].net);
    });
    const sum = document.getElementById('inv-sum');
    if (sum) sum.innerHTML = sumHtml(computeTotals(draft.lines, parseFloat(draft.irpfRate) || 0));
  }

  function openEditor(id) {
    ensureStyles();
    if (id) {
      const r = findInvoice(id);
      if (!r.ok) return;
      draft = clone(r.value);
      draft.lines = draft.lines.map((l) => Object.assign({}, l));
    } else {
      const s = INV.settings;
      const date = todayISO();
      draft = { id: '', number: '', status: 'emitida', date, dueDate: addDays(date, s.paymentDays), customerId: INV.customers.length === 1 ? INV.customers[0].id : '', paymentMethod: s.paymentMethod, vatRate: s.defaultVatRate, irpfRate: s.defaultIrpfRate || 0, reference: '', notes: '', lines: [Object.assign({ description: '', quantity: 1, unitPrice: 0, vatRate: s.defaultVatRate }, { net: 0, vat: 0, total: 0 })] };
    }
    const o = openOverlay(editorHtml(), true);
    o.addEventListener('input', readEditor);
  }

  function saveInvoiceFromEditor() {
    readEditor();
    const d = draft;
    if (!d.customerId) return alert('Selecciona el cliente de la factura.');
    const lines = d.lines.filter((l) => String(l.description || '').trim());
    if (!lines.length) return alert('Añade al menos una línea con descripción.');
    const cust = INV.customers.find((c) => c.id === d.customerId);
    const faltan = ops.missingCustomer(cust);
    if (faltan.length) return alert('Al cliente le faltan datos: ' + faltan.join(', ') + '. Complétalos en la pestaña Clientes.');
    if (ops.missingIssuer().length) return alert('Faltan datos del emisor en Ajustes: ' + ops.missingIssuer().join(', ') + '.');
    if (!validDate(d.date)) return alert('La fecha no es válida.');
    const built = lines.map((l) => buildLine({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate }, { includesVat: false, vatRate: parseFloat(d.vatRate) || 0 }));
    const now = new Date().toISOString();
    let inv;
    if (d.id) {
      inv = INV.invoices.find((i) => i.id === d.id);
      if (!inv) return;
      if (inv.date.slice(0, 4) !== d.date.slice(0, 4)) return alert('No se puede cambiar el año de una factura ya numerada.');
      Object.assign(inv, { date: d.date, dueDate: d.dueDate || addDays(d.date, INV.settings.paymentDays), customerId: cust.id, customer: customerSnapshot(cust), lines: built, vatRate: parseFloat(d.vatRate) || 0, irpfRate: parseFloat(d.irpfRate) || 0, paymentMethod: d.paymentMethod, reference: d.reference, notes: d.notes, status: d.status, paidDate: d.status === 'cobrada' ? inv.paidDate || todayISO() : '', updatedAt: now });
      recalc(inv);
      saveUI();
    } else {
      inv = buildInvoice({ customerObj: cust, includesVat: false, date: d.date, dueDate: d.dueDate, vatRate: parseFloat(d.vatRate) || 0, irpfRate: parseFloat(d.irpfRate) || 0, lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate })), paymentMethod: d.paymentMethod, reference: d.reference, notes: d.notes, status: d.status });
      ops.addInvoice(inv);
    }
    closeOverlay();
    render();
    viewModal(inv.id);
  }

  // ── Cliente (modal) ───────────────────────────────────────────────────────────────────────────────────
  let customerCb = null;
  function customerModal(id, cb) {
    const c = id ? INV.customers.find((x) => x.id === id) : null;
    customerCb = cb || null;
    openOverlay(
      '<div class="inv-bar"><div><div class="inv-bar-t">' + (c ? 'Editar cliente' : 'Nuevo cliente de facturación') + '</div><div class="inv-bar-s">Estos datos salen en la factura</div></div><div class="inv-bar-a"><button class="inv-x" onclick="LigrowInvoicing.ui.close()" aria-label="Cerrar">×</button></div></div>' +
      '<div class="inv-scroll inv-form" id="inv-cform" data-id="' + (c ? c.id : '') + '"><div class="inv-grid">' +
      field('Nombre o razón social *', 'name', c && c.name) + field('NIF/CIF/NIE *', 'taxId', c && c.taxId) + field('Dirección *', 'address', c && c.address) + field('Código postal *', 'postalCode', c && c.postalCode) + field('Población *', 'city', c && c.city) + field('Provincia', 'province', c && c.province) + field('País', 'country', (c && c.country) || 'España') + field('Email', 'email', c && c.email) + field('Teléfono', 'phone', c && c.phone) + '</div>' +
      '<div class="inv-actions">' + (c ? '<button class="modal-cancel danger" onclick="LigrowInvoicing.ui.delCustomer(\'' + c.id + '\')">Eliminar</button>' : '') + '<button class="modal-cancel" onclick="LigrowInvoicing.ui.close()">Cancelar</button><button class="modal-ok" onclick="LigrowInvoicing.ui.saveCustomer()">Guardar cliente</button></div></div>');
  }

  const readForm = (id) => { const out = {}; document.querySelectorAll('#' + id + ' [data-f]').forEach((el) => { out[el.getAttribute('data-f')] = el.value.trim(); }); return out; };

  /** Guarda desde la interfaz: si Supabase rechaza algo, se le dice al usuario (nunca en silencio). */
  function saveUI() {
    return save().then((ok) => { if (!ok && INV.error) alert('No se ha guardado en Supabase: ' + INV.error); return ok; });
  }

  const ui = {
    tab(t) { S.facTab = t; render(); },
    search(el) { S.facSearch = el.value; const pos = el.selectionStart; render(); const n = document.getElementById('inv-search-in'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* */ } } },
    view: viewModal,
    edit: openEditor,
    close: closeOverlay,
    addLine() { readEditor(); draft.lines.push({ description: '', quantity: 1, unitPrice: 0, vatRate: parseFloat(draft.vatRate) || 0, net: 0, vat: 0, total: 0 }); document.getElementById('inv-lines').innerHTML = draft.lines.map(lineRow).join(''); },
    rmLine(i) { readEditor(); if (draft.lines.length > 1) draft.lines.splice(i, 1); document.getElementById('inv-lines').innerHTML = draft.lines.map(lineRow).join(''); readEditor(); },
    saveInvoice: saveInvoiceFromEditor,
    setStatus(id, status) {
      const r = findInvoice(id);
      if (!r.ok) return;
      r.value.status = status;
      r.value.paidDate = status === 'cobrada' ? todayISO() : '';
      r.value.updatedAt = new Date().toISOString();
      saveUI();
      render();
      viewModal(id);
    },
    del(id) {
      const r = findInvoice(id);
      if (!r.ok) return;
      if (!confirm('¿Eliminar la factura ' + r.value.number + '? Dejará un hueco en la numeración; para descartarla es mejor anularla.')) return;
      ops.removeInvoice(id).then((ok) => { if (!ok && INV.error) alert('No se ha podido eliminar en Supabase: ' + INV.error); });
      closeOverlay();
      render();
    },
    customer: (id) => customerModal(id),
    newCustomerFromEditor() { readEditor(); const keep = clone(draft); customerModal(null, (c) => { draft = keep; draft.customerId = c.id; const o = openOverlay(editorHtml(), true); o.addEventListener('input', readEditor); }); },
    saveCustomer() {
      const data = readForm('inv-cform');
      const faltan = missing(data, CUSTOMER_REQUIRED);
      if (faltan.length) return alert('Faltan datos: ' + faltan.join(', ') + '.');
      const id = document.getElementById('inv-cform').getAttribute('data-id');
      let c;
      if (id) { c = INV.customers.find((x) => x.id === id); Object.assign(c, data); }
      else c = ops.addCustomer(data);
      saveUI();
      const cb = customerCb;
      customerCb = null;
      closeOverlay();
      render();
      if (cb) cb(c);
    },
    delCustomer(id) {
      const c = INV.customers.find((x) => x.id === id);
      if (!c || !confirm('¿Eliminar al cliente «' + c.name + '»? Sus facturas se conservan.')) return;
      INV.customers = INV.customers.filter((x) => x.id !== id);
      saveUI();
      closeOverlay();
      render();
    },
    saveSettings() {
      const f = readForm('inv-settings-form');
      ['defaultVatRate', 'defaultIrpfRate', 'paymentDays', 'startNumber'].forEach((k) => { f[k] = Number(f[k]); if (!Number.isFinite(f[k])) delete f[k]; });
      Object.assign(INV.settings, f);
      saveUI().then(() => alert(INV.error ? '' : 'Ajustes guardados.'));
      render();
    }
  };

  window.LigrowInvoicing = { INV, calc, ops, ui, nav, print: printInvoice, invoiceHtml, view: viewModal, load, save, STATUSES, STATUS_LABEL, eur, fmtDate, refresh: () => { if (S.navView === 'facturas') render(); } };
  // La sección del menú llama a navFacturas() / invoicingBadge() desde index.html
  window.navFacturas = nav;
  window.invoicingBadge = () => INV.invoices.filter((i) => i.status === 'emitida').length;

  if (S.navView === 'facturas') setTimeout(() => render(), 0);

  // Sincronización entre dispositivos mientras se mira la sección de facturas
  setInterval(() => { if (S.currentUser && S.currentUser.role === 'admin' && S.navView === 'facturas' && !overlay) load(true); }, 30000);
})(typeof window !== 'undefined' ? window : globalThis);
