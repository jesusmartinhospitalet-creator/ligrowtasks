/* Ligrow Tasks · Facturación emitida
 *
 * - Cálculo con precisión de céntimos (calc): línea → base, IVA y total; desglose por tipo de IVA; IRPF.
 * - Almacén (INV): facturas, clientes de facturación y ajustes del emisor. Se guarda en el navegador y se
 *   sincroniza con el servidor como espacio «facturacion» (mismo mecanismo que los demás espacios).
 * - Vistas: Facturas, Clientes y Ajustes (sección «Facturas» del menú) + vista previa/PDF + editor.
 * - ops: operaciones con validación que usan tanto la interfaz como el asistente de IA.
 *
 * El módulo de cálculo es puro (sin DOM) y también se exporta para los tests de Node.
 */
(function (root) {
  'use strict';

  // ══ Cálculo ═════════════════════════════════════════════════════════════════════════════════════
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const r4 = (n) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  /**
   * Construye una línea de factura. Admite el precio de UNA unidad (unitPrice) o el importe de TODA la línea
   * (total). `includesVat` indica si esos importes ya llevan IVA. El IVA de una línea con importe bruto es
   * «bruto − base», así el total facturado coincide exactamente con lo que pidió el usuario.
   */
  function buildLine(input, opts) {
    const description = String((input && input.description) || '').trim();
    if (!description) throw new Error('Falta la descripción de una línea.');
    const quantity = input.quantity === undefined || input.quantity === null ? 1 : Number(input.quantity);
    if (!isNum(quantity) || quantity <= 0) throw new Error('La cantidad de «' + description + '» no es válida.');
    const rate = isNum(Number(input.vatRate)) && input.vatRate !== undefined && input.vatRate !== null && input.vatRate !== '' ? Number(input.vatRate) : opts.vatRate;
    if (!isNum(rate) || rate < 0 || rate > 100) throw new Error('El tipo de IVA no es válido.');
    const gross = !!opts.includesVat;
    const hasTotal = input.total !== undefined && input.total !== null && input.total !== '';
    const hasUnit = input.unitPrice !== undefined && input.unitPrice !== null && input.unitPrice !== '';
    if (!hasTotal && !hasUnit) throw new Error('Falta el precio de «' + description + '».');
    const amount = Number(hasTotal ? input.total : input.unitPrice);
    if (!isNum(amount) || amount < 0) throw new Error('El importe de «' + description + '» no es válido.');
    const factor = 1 + rate / 100;
    let net;
    let vat;
    let unitPrice;
    if (hasTotal) {
      if (gross) { const total = r2(amount); net = r2(total / factor); vat = r2(total - net); }
      else { net = r2(amount); vat = r2(net * rate / 100); }
      unitPrice = r4(net / quantity);
    } else if (gross) {
      const total = r2(quantity * amount);
      net = r2(total / factor); vat = r2(total - net);
      unitPrice = r4(amount / factor);
    } else {
      net = r2(quantity * amount); vat = r2(net * rate / 100);
      unitPrice = r4(amount);
    }
    return { description, quantity, unitPrice, vatRate: rate, net, vat, total: r2(net + vat) };
  }

  /** Totales: base, IVA por tipo, IRPF y total. */
  function computeTotals(lines, irpfRate) {
    const byRate = new Map();
    let subtotal = 0;
    let vatTotal = 0;
    for (const line of lines) {
      subtotal += line.net;
      vatTotal += line.vat;
      const entry = byRate.get(line.vatRate) || { rate: line.vatRate, base: 0, vat: 0 };
      entry.base += line.net;
      entry.vat += line.vat;
      byRate.set(line.vatRate, entry);
    }
    const breakdown = [...byRate.values()].sort((a, b) => b.rate - a.rate).map((e) => ({ rate: e.rate, base: r2(e.base), vat: r2(e.vat) }));
    const sub = r2(subtotal);
    const vat = r2(vatTotal);
    const irpfPct = isNum(Number(irpfRate)) ? Number(irpfRate) : 0;
    const irpf = r2(sub * irpfPct / 100);
    return { subtotal: sub, vatBreakdown: breakdown, vatTotal: vat, irpf, total: r2(sub + vat - irpf) };
  }

  /** Recalcula una línea editada a mano (precio unitario sin IVA × cantidad). */
  function recomputeLine(line) {
    const net = r2(Number(line.quantity) * Number(line.unitPrice));
    const vat = r2(net * Number(line.vatRate) / 100);
    return Object.assign({}, line, { net, vat, total: r2(net + vat) });
  }

  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const toISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayISO = () => toISO(new Date());
  function validDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00:00');
    return !isNaN(d.getTime()) && toISO(d) === v;
  }
  function addDays(iso, days) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + Number(days || 0));
    return toISO(d);
  }

  /** Siguiente número correlativo de la serie y el año de la fecha: F-2026-0001. */
  function nextNumber(invoices, series, dateISO) {
    const year = String(dateISO).slice(0, 4);
    const prefix = (series || 'F') + '-' + year + '-';
    let max = 0;
    for (const inv of invoices) {
      if (typeof inv.number === 'string' && inv.number.startsWith(prefix)) {
        const n = parseInt(inv.number.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return prefix + pad(max + 1, 4);
  }

  const calc = { r2, r4, buildLine, computeTotals, recomputeLine, nextNumber, validDate, addDays, todayISO };

  if (typeof module !== 'undefined' && module.exports) module.exports = { calc };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // ══ Almacén ═════════════════════════════════════════════════════════════════════════════════════
  const STORE_KEY = 'ligrow_invoicing_v1';
  const WS_ID = 'facturacion';
  const STATUSES = ['borrador', 'emitida', 'cobrada', 'anulada'];
  const STATUS_LABEL = { borrador: 'Borrador', emitida: 'Emitida', cobrada: 'Cobrada', anulada: 'Anulada' };

  const defaultSettings = () => ({
    companyName: 'Ligrow', taxId: '', address: '', postalCode: '', city: '', country: 'España',
    email: '', phone: '', website: '', iban: '', series: 'F', defaultVatRate: 21, defaultIrpfRate: 0,
    paymentDays: 30, paymentMethod: 'Transferencia bancaria', footerNote: ''
  });

  const INV = { invoices: [], customers: [], settings: defaultSettings(), loaded: false };
  let saveChain = Promise.resolve();
  let loadPromise = null;

  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const eur = (n) => (typeof fmtEUR === 'function' ? fmtEUR(n, true) : r2(n).toFixed(2).replace('.', ',') + ' €');
  const eurUnit = (n) => { const v = r4(n); const s = (Math.abs(v - r2(v)) < 1e-9 ? v.toFixed(2) : String(v)).replace('.', ','); return s + ' €'; };
  const fmtDate = (iso) => (validDate(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : iso || '');
  const num = (n) => String(r2(n).toFixed(2)).replace('.', ',');
  const isAdmin = () => !S.currentUser || S.currentUser.role === 'admin';

  function applyPayload(p) {
    if (!p || typeof p !== 'object') return false;
    if (!Array.isArray(p.invoices) && !Array.isArray(p.customers) && !p.settings) return false;
    INV.invoices = Array.isArray(p.invoices) ? p.invoices : [];
    INV.customers = Array.isArray(p.customers) ? p.customers : [];
    INV.settings = Object.assign(defaultSettings(), p.settings || {});
    return true;
  }
  const payload = () => ({ invoices: INV.invoices, customers: INV.customers, settings: INV.settings });

  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) applyPayload(JSON.parse(raw));
  } catch (e) { /* sin datos locales */ }

  function saveLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(payload())); } catch (e) { /* almacenamiento lleno o bloqueado */ }
  }

  /** Guarda en local y en el servidor (en orden). Devuelve una promesa que se resuelve al terminar. */
  function save(details) {
    saveLocal();
    if (window.location.protocol === 'file:') return Promise.resolve(true);
    const body = JSON.stringify({ payload: payload(), details: details || { action: 'Facturación', summary: 'Actualización de facturas' } });
    saveChain = saveChain.then(() =>
      fetch('/api/sync/client/' + WS_ID, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body })
        .then((r) => r.ok)
        .catch(() => false)
    );
    return saveChain;
  }

  /** Lee del servidor (la fuente de verdad entre dispositivos). */
  function load(force) {
    if (window.location.protocol === 'file:') { INV.loaded = true; return Promise.resolve(); }
    if (loadPromise && !force) return loadPromise;
    loadPromise = fetch('/api/sync/client/' + WS_ID + '?_t=' + Date.now(), { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const ws = data && data.workspace;
        const before = JSON.stringify(payload());
        if (ws && applyPayload(ws.payload)) {
          saveLocal();
          if (JSON.stringify(payload()) !== before) refreshView();
        }
        INV.loaded = true;
      })
      .catch(() => { INV.loaded = true; })
      .finally(() => { setTimeout(() => { loadPromise = null; }, 4000); });
    return loadPromise;
  }

  function refreshView() {
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
  const issuerSnapshot = () => ({ companyName: INV.settings.companyName, taxId: INV.settings.taxId, address: INV.settings.address, postalCode: INV.settings.postalCode, city: INV.settings.city, country: INV.settings.country, email: INV.settings.email, phone: INV.settings.phone, website: INV.settings.website });

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
      const e = new Error('Faltan datos del emisor (Ligrow) para poder facturar: ' + faltanEmisor.join(', ') + '. Pídeselos al usuario y guárdalos con update_invoice_settings.');
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
    const series = INV.settings.series || 'F';
    const now = new Date().toISOString();
    const inv = {
      id: uid('inv_'),
      number: nextNumber(INV.invoices, series, date),
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
    restore: (snap) => { applyPayload(snap); return save({ action: 'Facturación', summary: 'Cambio deshecho' }); },
    addInvoice(inv, details) { INV.invoices.unshift(inv); return save(details || { action: 'Nueva factura', summary: 'Factura ' + inv.number + ' para ' + inv.customer.name + ' (' + eur(inv.total) + ')' }); },
    removeInvoice(id, details) { INV.invoices = INV.invoices.filter((i) => i.id !== id); return save(details || { action: 'Eliminar factura', summary: 'Factura eliminada' }); },
    addCustomer(data) {
      const c = Object.assign({ id: uid('cus_'), country: 'España', createdAt: new Date().toISOString() }, data);
      INV.customers.push(c);
      return c;
    },
    save,
    load
  };

  // ══ Documento de factura (HTML) ════════════════════════════════════════════════════════════════════
  const DOC_CSS = `
.inv-doc{--ink:#171614;--mut:#6f6c64;--line:#e6e3dd;--brand:#F04E23;width:794px;max-width:100%;margin:0 auto;background:#fff;color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;font-size:12.5px;line-height:1.45;padding:44px 48px 36px;box-sizing:border-box;position:relative;min-height:1050px;display:flex;flex-direction:column}
.inv-doc *{box-sizing:border-box}
.inv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:22px;border-bottom:3px solid var(--brand)}
.inv-logo{font-family:'Syne','DM Sans',sans-serif;font-weight:800;font-size:30px;letter-spacing:-.5px;color:var(--brand);line-height:1}
.inv-brand-sub{margin-top:6px;color:var(--mut);font-size:12px}
.inv-title{text-align:right}
.inv-title h1{margin:0;font-family:'Syne','DM Sans',sans-serif;font-weight:800;font-size:28px;letter-spacing:1px;line-height:1}
.inv-num{margin-top:6px;font-size:15px;font-weight:700}
.inv-badge{display:inline-block;margin-top:8px;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;background:#f3f1ec;color:#57554e}
.inv-badge.cobrada{background:#e6f6ee;color:#0c8a57}
.inv-badge.anulada{background:#fdecec;color:#c53030}
.inv-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:22px 0 4px}
.inv-meta div span{display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mut);margin-bottom:3px}
.inv-meta div b{font-size:13px;font-weight:600}
.inv-parties{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:22px 0}
.inv-party{border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.inv-party h4{margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--brand)}
.inv-party strong{display:block;font-size:14px;margin-bottom:3px}
.inv-party p{margin:0;color:#3d3b36}
.inv-lines{width:100%;border-collapse:collapse;margin-top:6px}
.inv-lines th{text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mut);padding:9px 10px;border-bottom:1.5px solid var(--ink)}
.inv-lines td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.inv-lines .r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.inv-totals{display:flex;justify-content:flex-end;margin-top:20px}
.inv-totals table{width:330px;border-collapse:collapse}
.inv-totals td{padding:6px 10px;font-variant-numeric:tabular-nums}
.inv-totals td:last-child{text-align:right}
.inv-totals tr.grand td{border-top:2px solid var(--ink);padding-top:11px;font-size:17px;font-weight:800}
.inv-totals tr.grand td:last-child{color:var(--brand)}
.inv-info{margin-top:26px;display:grid;grid-template-columns:1fr 1fr;gap:18px}
.inv-box{background:#faf9f6;border-radius:12px;padding:13px 16px}
.inv-box h4{margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut)}
.inv-box p{margin:0}
.inv-grow{flex:1}
.inv-foot{margin-top:28px;padding-top:12px;border-top:1px solid var(--line);color:var(--mut);font-size:11px;text-align:center}
.inv-watermark{position:absolute;top:38%;left:50%;transform:translate(-50%,-50%) rotate(-24deg);font-family:'Syne',sans-serif;font-weight:800;font-size:110px;letter-spacing:6px;color:rgba(197,48,48,.13);pointer-events:none}
@media print{.inv-doc{box-shadow:none;margin:0;min-height:auto;padding:0}}
`;

  const addr = (p) => [p.address, [p.postalCode, p.city].filter(Boolean).join(' '), [p.province, p.country].filter(Boolean).join(', ')].filter(Boolean).map(esc).join('<br>');

  function invoiceHtml(inv) {
    const b = inv.vatBreakdown || [];
    const rows = inv.lines.map((l) => '<tr><td>' + esc(l.description) + '</td><td class="r">' + esc(String(l.quantity).replace('.', ',')) + '</td><td class="r">' + eurUnit(l.unitPrice) + '</td><td class="r">' + num(l.vatRate) + ' %</td><td class="r">' + eur(l.net) + '</td></tr>').join('');
    const totals =
      '<tr><td>Base imponible</td><td>' + eur(inv.subtotal) + '</td></tr>' +
      b.map((x) => '<tr><td>IVA ' + num(x.rate) + ' % <small style="color:#6f6c64">(s/ ' + eur(x.base) + ')</small></td><td>' + eur(x.vat) + '</td></tr>').join('') +
      (inv.irpf ? '<tr><td>Retención IRPF ' + num(inv.irpfRate) + ' %</td><td>−' + eur(inv.irpf) + '</td></tr>' : '') +
      '<tr class="grand"><td>TOTAL</td><td>' + eur(inv.total) + '</td></tr>';
    const iss = inv.issuer || {};
    const cus = inv.customer || {};
    return '<div class="inv-doc">' +
      (inv.status === 'anulada' ? '<div class="inv-watermark">ANULADA</div>' : '') +
      '<header class="inv-head"><div><div class="inv-logo">LIGROW</div><div class="inv-brand-sub">' + esc(iss.companyName) + '</div></div>' +
      '<div class="inv-title"><h1>FACTURA</h1><div class="inv-num">Nº ' + esc(inv.number) + '</div>' +
      (inv.status === 'cobrada' || inv.status === 'anulada' ? '<span class="inv-badge ' + inv.status + '">' + STATUS_LABEL[inv.status] + '</span>' : '') + '</div></header>' +
      '<section class="inv-meta"><div><span>Fecha de emisión</span><b>' + fmtDate(inv.date) + '</b></div><div><span>Vencimiento</span><b>' + fmtDate(inv.dueDate) + '</b></div><div><span>Forma de pago</span><b>' + esc(inv.paymentMethod || '—') + '</b></div><div><span>Referencia</span><b>' + esc(inv.reference || '—') + '</b></div></section>' +
      '<section class="inv-parties"><div class="inv-party"><h4>Emisor</h4><strong>' + esc(iss.companyName) + '</strong><p>NIF/CIF: ' + esc(iss.taxId) + '<br>' + addr(iss) + (iss.email ? '<br>' + esc(iss.email) : '') + (iss.phone ? ' · ' + esc(iss.phone) : '') + '</p></div>' +
      '<div class="inv-party"><h4>Facturar a</h4><strong>' + esc(cus.name) + '</strong><p>NIF/CIF: ' + esc(cus.taxId) + '<br>' + addr(cus) + (cus.email ? '<br>' + esc(cus.email) : '') + '</p></div></section>' +
      '<table class="inv-lines"><thead><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">Precio unit.</th><th class="r">IVA</th><th class="r">Importe</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="inv-totals"><table>' + totals + '</table></div>' +
      '<section class="inv-info"><div class="inv-box"><h4>Datos de pago</h4><p>' + esc(inv.paymentMethod || '') + (inv.iban ? '<br><b>IBAN:</b> ' + esc(inv.iban) : '') + '<br>Vence el ' + fmtDate(inv.dueDate) + '</p></div>' +
      (inv.notes ? '<div class="inv-box"><h4>Observaciones</h4><p>' + esc(inv.notes).replace(/\n/g, '<br>') + '</p></div>' : '<div></div>') + '</section>' +
      '<div class="inv-grow"></div>' +
      '<footer class="inv-foot">' + esc(inv.footerNote || (iss.companyName + (iss.website ? ' · ' + iss.website : ''))) + '</footer></div>';
  }

  /** Imprime / guarda como PDF la factura sin abrir ventanas emergentes (iframe oculto). */
  function printInvoice(id) {
    const r = findInvoice(id);
    if (!r.ok) return;
    const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + esc(r.value.number) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">' +
      '<style>@page{size:A4;margin:14mm}html,body{margin:0;background:#fff}' + DOC_CSS + '</style></head><body>' + invoiceHtml(r.value) + '</body></html>';
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const w = frame.contentWindow;
    w.document.open();
    w.document.write(html);
    w.document.close();
    const go = () => { try { w.focus(); w.print(); } finally { setTimeout(() => frame.remove(), 60000); } };
    const ready = w.document.fonts && w.document.fonts.ready ? Promise.race([w.document.fonts.ready, new Promise((x) => setTimeout(x, 1500))]) : Promise.resolve();
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
      '<div class="card inv-settings" id="inv-settings-form"><div class="card-head">Datos del emisor</div><div class="inv-grid">' +
      field('Razón social *', 'companyName', s.companyName) + field('NIF/CIF *', 'taxId', s.taxId) + field('Dirección *', 'address', s.address) + field('Código postal *', 'postalCode', s.postalCode) + field('Población *', 'city', s.city) + field('País', 'country', s.country) + field('Email', 'email', s.email) + field('Teléfono', 'phone', s.phone) + field('Web', 'website', s.website) + '</div>' +
      '<div class="card-head" style="margin-top:18px">Facturación</div><div class="inv-grid">' +
      field('IBAN para cobros', 'iban', s.iban) + field('Serie', 'series', s.series) + field('IVA por defecto (%)', 'defaultVatRate', s.defaultVatRate, 'type="number" step="0.01"') + field('IRPF por defecto (%)', 'defaultIrpfRate', s.defaultIrpfRate, 'type="number" step="0.01"') + field('Días de pago', 'paymentDays', s.paymentDays, 'type="number" min="0"') + field('Forma de pago', 'paymentMethod', s.paymentMethod) + '</div>' +
      '<div class="modal-field" style="margin-top:6px"><div class="modal-lbl">Texto al pie de las facturas</div><input class="modal-in" data-f="footerNote" value="' + esc(s.footerNote) + '"></div>' +
      '<div style="margin-top:14px"><button class="pedidos-btn-primary" onclick="LigrowInvoicing.ui.saveSettings()">Guardar ajustes</button></div></div>';
  }

  function nav() {
    if (!INV.loaded && isAdmin()) load();
    if (!isAdmin()) return '<div class="mn"><div class="ct"><p style="color:var(--text-3)">No tienes acceso a la facturación.</p></div></div>';
    const tab = S.facTab || 'facturas';
    return '<div class="mn"><div class="tb"><div class="tb-row1"><div style="flex:1"><div class="proj-title-row"><h1 class="proj-title">Facturas</h1><span class="type-pill">Facturación</span></div><div class="proj-sub-text">Emite, guarda y descarga facturas para tus clientes</div></div>' +
      '<div class="tb-actions-group"><button type="button" class="tb-btn-pri" onclick="LigrowInvoicing.ui.edit()">' + ico(ICO.plus) + 'Nueva factura</button></div></div>' +
      '<div class="tb-tabs-bar"><div class="tabs">' + tabBtn('facturas', 'Facturas', INV.invoices.length) + tabBtn('clientes', 'Clientes', INV.customers.length) + tabBtn('ajustes', 'Ajustes') + '</div></div></div>' +
      '<div class="ct"><div class="pedidos-layout">' + (tab === 'clientes' ? customersTab() : tab === 'ajustes' ? settingsTab() : listTab()) + '</div></div></div>';
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
      save({ action: 'Factura actualizada', summary: 'Factura ' + inv.number + ' actualizada' });
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
      save({ action: 'Factura actualizada', summary: 'Factura ' + r.value.number + ' → ' + STATUS_LABEL[status] });
      render();
      viewModal(id);
    },
    del(id) {
      const r = findInvoice(id);
      if (!r.ok) return;
      if (!confirm('¿Eliminar la factura ' + r.value.number + '? Dejará un hueco en la numeración; para descartarla es mejor anularla.')) return;
      ops.removeInvoice(id, { action: 'Eliminar factura', summary: 'Factura ' + r.value.number + ' eliminada' });
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
      save({ action: id ? 'Cliente actualizado' : 'Nuevo cliente de facturación', summary: c.name });
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
      save({ action: 'Cliente eliminado', summary: c.name });
      closeOverlay();
      render();
    },
    saveSettings() {
      const f = readForm('inv-settings-form');
      ['defaultVatRate', 'defaultIrpfRate', 'paymentDays'].forEach((k) => { f[k] = Number(f[k]); if (!Number.isFinite(f[k])) delete f[k]; });
      Object.assign(INV.settings, f);
      save({ action: 'Ajustes de facturación', summary: 'Datos del emisor actualizados' });
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
