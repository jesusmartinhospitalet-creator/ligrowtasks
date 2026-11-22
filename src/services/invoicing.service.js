/**
 * Facturación emitida: ajustes del emisor, clientes de facturación y facturas, guardados en Supabase
 * (tablas `invoice_settings`, `invoice_customers` e `invoices`; ver database/migrations/20261124_invoicing.sql).
 *
 * - El servidor es la autoridad: valida todo y VUELVE A CALCULAR base, IVA, IRPF y total con el mismo módulo de
 *   cálculo que usa el navegador (public/invoice-calc.js); nunca se guarda un importe que no cuadre.
 * - Si Supabase está configurado pero faltan las tablas (o falla), se devuelve un error explícito: no se finge
 *   que se ha guardado. Solo si Supabase NO está configurado (desarrollo local) se usa memoria, y la respuesta
 *   lo indica (`storage: 'memory'`) para que la interfaz avise de que es temporal.
 */
const calc = require('../../public/invoice-calc.js');

class InvoicingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const STATUSES = ['borrador', 'emitida', 'cobrada', 'anulada'];
const LANGUAGES = ['ca', 'es'];
const ID_RE = /^[A-Za-z0-9_-]{1,60}$/;

const text = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function numberIn(value, name, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new InvoicingError(400, 'invalid_request', 'Valor no válido para ' + name + '.');
  return n;
}

function checkId(id) {
  if (!ID_RE.test(String(id || ''))) throw new InvoicingError(400, 'invalid_request', 'Identificador no válido.');
  return String(id);
}

// ── Ajustes ─────────────────────────────────────────────────────────────────────────────────────────
const SETTINGS_TEXT = [
  ['companyName', 'company_name', 200], ['taxId', 'tax_id', 40], ['taxIdLabel', 'tax_id_label', 20], ['address', 'address', 300],
  ['postalCode', 'postal_code', 20], ['city', 'city', 120], ['country', 'country', 80], ['email', 'email', 200], ['phone', 'phone', 60],
  ['website', 'website', 200], ['iban', 'iban', 60], ['bankName', 'bank_name', 120], ['series', 'series', 6], ['paymentMethod', 'payment_method', 120],
  ['footerNote', 'footer_note', 500]
];

const SETTINGS_DEFAULTS = {
  companyName: '', taxId: '', taxIdLabel: 'NIF', address: '', postalCode: '', city: '', country: 'España', email: '', phone: '', website: '',
  iban: '', bankName: '', series: '', startNumber: 1, defaultVatRate: 21, defaultIrpfRate: 0, paymentDays: 30,
  paymentMethod: 'Transferencia bancaria', footerNote: '', invoiceLanguage: 'ca'
};

function cleanSettings(input) {
  if (!isObj(input)) throw new InvoicingError(400, 'invalid_request', 'Ajustes no válidos.');
  const merged = Object.assign({}, SETTINGS_DEFAULTS, input);
  const row = { id: 'default', updated_at: new Date().toISOString() };
  for (const [prop, col, max] of SETTINGS_TEXT) row[col] = text(merged[prop], max);
  if (row.series && !/^[A-Za-z0-9]{1,6}$/.test(row.series)) throw new InvoicingError(400, 'invalid_request', 'La serie debe tener 1-6 letras o números (o estar vacía).');
  row.tax_id_label = row.tax_id_label || 'NIF';
  row.start_number = Math.floor(numberIn(merged.startNumber, 'el número inicial', 1, 99999999, 1));
  row.default_vat_rate = numberIn(merged.defaultVatRate, 'el IVA por defecto', 0, 100, 21);
  row.default_irpf_rate = numberIn(merged.defaultIrpfRate, 'el IRPF por defecto', 0, 60, 0);
  row.payment_days = Math.floor(numberIn(merged.paymentDays, 'los días de pago', 0, 365, 30));
  if (!LANGUAGES.includes(merged.invoiceLanguage)) throw new InvoicingError(400, 'invalid_request', 'Idioma de factura no válido (ca o es).');
  row.invoice_language = merged.invoiceLanguage;
  return row;
}

function settingsFromRow(row) {
  if (!row) return Object.assign({}, SETTINGS_DEFAULTS);
  const out = {};
  for (const [prop, col] of SETTINGS_TEXT) out[prop] = row[col] == null ? SETTINGS_DEFAULTS[prop] : row[col];
  out.taxIdLabel = out.taxIdLabel || 'NIF';
  out.startNumber = Number(row.start_number) || 1;
  out.defaultVatRate = Number(row.default_vat_rate);
  out.defaultIrpfRate = Number(row.default_irpf_rate);
  out.paymentDays = Number(row.payment_days);
  out.invoiceLanguage = row.invoice_language || 'ca';
  return out;
}

// ── Clientes ─────────────────────────────────────────────────────────────────────────────────────────
const CUSTOMER_FIELDS = [['name', 'name', 200], ['taxId', 'tax_id', 40], ['address', 'address', 300], ['postalCode', 'postal_code', 20], ['city', 'city', 120], ['province', 'province', 120], ['country', 'country', 80], ['email', 'email', 200], ['phone', 'phone', 60], ['notes', 'notes', 1000]];

function cleanCustomer(id, input) {
  checkId(id);
  if (!isObj(input)) throw new InvoicingError(400, 'invalid_request', 'Cliente no válido.');
  const row = { id, updated_at: new Date().toISOString() };
  for (const [prop, col, max] of CUSTOMER_FIELDS) row[col] = text(input[prop], max);
  if (!row.name) throw new InvoicingError(400, 'invalid_request', 'El cliente necesita un nombre.');
  row.country = row.country || 'España';
  return row;
}

function customerFromRow(r) {
  const out = { id: r.id, createdAt: r.created_at, updatedAt: r.updated_at };
  for (const [prop, col] of CUSTOMER_FIELDS) out[prop] = r[col] == null ? '' : r[col];
  return out;
}

// ── Facturas ──────────────────────────────────────────────────────────────────────────────────────────
const PARTY_FIELDS = ['id', 'name', 'companyName', 'taxId', 'taxIdLabel', 'language', 'address', 'postalCode', 'city', 'province', 'country', 'email', 'phone', 'website'];
const party = (value, label) => {
  if (!isObj(value)) throw new InvoicingError(400, 'invalid_request', 'Faltan los datos de ' + label + '.');
  const out = {};
  for (const k of PARTY_FIELDS) if (value[k] !== undefined && value[k] !== null) out[k] = text(value[k], 300);
  if (!(out.name || out.companyName)) throw new InvoicingError(400, 'invalid_request', 'Falta el nombre de ' + label + '.');
  return out;
};

function cleanLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 100) throw new InvoicingError(400, 'invalid_request', 'La factura necesita entre 1 y 100 líneas.');
  return lines.map((l, i) => {
    if (!isObj(l)) throw new InvoicingError(400, 'invalid_request', 'Línea ' + (i + 1) + ' no válida.');
    const description = text(l.description, 1000);
    if (!description) throw new InvoicingError(400, 'invalid_request', 'La línea ' + (i + 1) + ' no tiene descripción.');
    const quantity = numberIn(l.quantity, 'la cantidad', 0.0001, 1e9, 1);
    const net = numberIn(l.net, 'la base de la línea ' + (i + 1), 0, 1e9, undefined);
    const vat = numberIn(l.vat, 'el IVA de la línea ' + (i + 1), 0, 1e9, undefined);
    if (net === undefined || vat === undefined) throw new InvoicingError(400, 'invalid_request', 'Faltan la base o el IVA de la línea ' + (i + 1) + '.');
    return {
      description,
      quantity,
      unitPrice: calc.r4(numberIn(l.unitPrice, 'el precio unitario', 0, 1e9, net / quantity)),
      vatRate: numberIn(l.vatRate, 'el tipo de IVA', 0, 100, 21),
      net: calc.r2(net),
      vat: calc.r2(vat),
      total: calc.r2(calc.r2(net) + calc.r2(vat))
    };
  });
}

function cleanInvoice(id, input) {
  checkId(id);
  if (!isObj(input)) throw new InvoicingError(400, 'invalid_request', 'Factura no válida.');
  const number = text(input.number, 40);
  if (!number) throw new InvoicingError(400, 'invalid_request', 'La factura necesita número.');
  const status = input.status || 'emitida';
  if (!STATUSES.includes(status)) throw new InvoicingError(400, 'invalid_request', 'Estado no válido.');
  if (!calc.validDate(input.date)) throw new InvoicingError(400, 'invalid_request', 'Fecha de factura no válida (AAAA-MM-DD).');
  const optionalDate = (v, name) => {
    if (v === undefined || v === null || v === '') return null;
    if (!calc.validDate(v)) throw new InvoicingError(400, 'invalid_request', name + ' no válida (AAAA-MM-DD).');
    return v;
  };
  const lines = cleanLines(input.lines);
  const irpfRate = numberIn(input.irpfRate, 'el IRPF', 0, 60, 0);
  const totals = calc.computeTotals(lines, irpfRate); // el servidor recalcula: no se fía del cliente
  const customer = party(input.customer, 'el cliente');
  const customerId = input.customerId || customer.id || null;
  return {
    id,
    number,
    series: text(input.series, 6),
    status,
    issue_date: input.date,
    due_date: optionalDate(input.dueDate, 'El vencimiento'),
    paid_date: status === 'cobrada' ? optionalDate(input.paidDate, 'La fecha de cobro') || calc.todayISO() : null,
    customer_id: customerId ? text(customerId, 60) : null,
    customer,
    issuer: party(input.issuer, 'el emisor'),
    lines,
    vat_rate: numberIn(input.vatRate, 'el IVA', 0, 100, 21),
    irpf_rate: irpfRate,
    subtotal: totals.subtotal,
    vat_breakdown: totals.vatBreakdown,
    vat_total: totals.vatTotal,
    irpf: totals.irpf,
    total: totals.total,
    payment_method: text(input.paymentMethod, 120),
    iban: text(input.iban, 60),
    bank_name: text(input.bankName, 120),
    reference: text(input.reference, 200),
    notes: text(input.notes, 3000),
    footer_note: text(input.footerNote, 500),
    created_by: text(input.createdBy, 200),
    updated_at: new Date().toISOString()
  };
}

function invoiceFromRow(r) {
  return {
    id: r.id,
    number: r.number,
    series: r.series || '',
    status: r.status,
    date: String(r.issue_date).slice(0, 10),
    dueDate: r.due_date ? String(r.due_date).slice(0, 10) : '',
    paidDate: r.paid_date ? String(r.paid_date).slice(0, 10) : '',
    customerId: r.customer_id || '',
    customer: r.customer,
    issuer: r.issuer,
    lines: r.lines,
    vatRate: Number(r.vat_rate),
    irpfRate: Number(r.irpf_rate),
    subtotal: Number(r.subtotal),
    vatBreakdown: r.vat_breakdown || [],
    vatTotal: Number(r.vat_total),
    irpf: Number(r.irpf),
    total: Number(r.total),
    paymentMethod: r.payment_method || '',
    iban: r.iban || '',
    bankName: r.bank_name || '',
    reference: r.reference || '',
    notes: r.notes || '',
    footerNote: r.footer_note || '',
    createdBy: r.created_by || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

// ── Errores de Supabase ───────────────────────────────────────────────────────────────────────────────
const MIGRATION = 'database/migrations/20261124_invoicing.sql';

function mapSupabaseError(error, context) {
  if (!error) return null;
  const msg = String(error.message || '');
  if (error.code === '42P01' || error.code === 'PGRST205' || /could not find the table|does not exist|schema cache/i.test(msg)) {
    return new InvoicingError(503, 'storage_not_ready', 'Faltan las tablas de facturación en Supabase. Ejecuta ' + MIGRATION + ' en Supabase → SQL Editor.');
  }
  if (error.code === '23505') return new InvoicingError(409, 'duplicate_number', 'Ya existe una factura con ese número' + (context && context.number ? ' (' + context.number + ')' : '') + '.');
  if (error.code === '23514') return new InvoicingError(400, 'invalid_request', 'Los datos no cumplen las restricciones de la base de datos: ' + msg);
  if (error.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return new InvoicingError(500, 'storage_denied', 'Supabase rechaza la escritura: el servidor necesita la clave de servicio (SUPABASE_SERVICE_KEY), no la pública.');
  }
  console.error('[invoicing] error de Supabase', error.code, msg);
  return new InvoicingError(500, 'storage_error', 'No se ha podido guardar en Supabase: ' + msg);
}

// ── Almacenes ──────────────────────────────────────────────────────────────────────────────────────────
function supabaseStore(client) {
  const must = (result, ctx) => { const e = mapSupabaseError(result.error, ctx); if (e) throw e; return result.data; };
  return {
    kind: 'supabase',
    async all() {
      const [s, c, i] = await Promise.all([
        client.from('invoice_settings').select('*').eq('id', 'default').maybeSingle(),
        client.from('invoice_customers').select('*').order('name', { ascending: true }),
        client.from('invoices').select('*').order('issue_date', { ascending: false }).order('number', { ascending: false })
      ]);
      return { settings: must(s), customers: must(c) || [], invoices: must(i) || [] };
    },
    async saveSettings(row) { return must(await client.from('invoice_settings').upsert(row, { onConflict: 'id' }).select().single()); },
    async saveCustomer(row) { return must(await client.from('invoice_customers').upsert(row, { onConflict: 'id' }).select().single()); },
    async deleteCustomer(id) { must(await client.from('invoice_customers').delete().eq('id', id)); },
    async saveInvoice(row) {
      let res = await client.from('invoices').upsert(row, { onConflict: 'id' }).select().single();
      // Si el cliente aún no existe (o se borró), la factura se guarda igualmente con su copia de datos.
      if (res.error && res.error.code === '23503' && row.customer_id) {
        res = await client.from('invoices').upsert({ ...row, customer_id: null }, { onConflict: 'id' }).select().single();
      }
      return must(res, { number: row.number });
    },
    async deleteInvoice(id) { must(await client.from('invoices').delete().eq('id', id)); }
  };
}

function memoryStore() {
  const db = { settings: null, customers: new Map(), invoices: new Map() };
  const now = () => new Date().toISOString();
  return {
    kind: 'memory',
    async all() { return { settings: db.settings, customers: [...db.customers.values()], invoices: [...db.invoices.values()] }; },
    async saveSettings(row) { db.settings = row; return row; },
    async saveCustomer(row) { const prev = db.customers.get(row.id); const out = { created_at: now(), ...prev, ...row }; db.customers.set(row.id, out); return out; },
    async deleteCustomer(id) {
      db.customers.delete(id);
      for (const inv of db.invoices.values()) if (inv.customer_id === id) inv.customer_id = null;
    },
    async saveInvoice(row) {
      for (const inv of db.invoices.values()) {
        if (inv.number === row.number && inv.id !== row.id) throw new InvoicingError(409, 'duplicate_number', 'Ya existe una factura con ese número (' + row.number + ').');
      }
      const prev = db.invoices.get(row.id);
      const out = { created_at: now(), ...prev, ...row };
      db.invoices.set(row.id, out);
      return out;
    },
    async deleteInvoice(id) { db.invoices.delete(id); }
  };
}

function createInvoicingService(client) {
  const store = client ? supabaseStore(client) : memoryStore();
  const sorted = (rows) => rows.slice().sort((a, b) => String(b.issue_date).localeCompare(String(a.issue_date)) || String(b.number).localeCompare(String(a.number), undefined, { numeric: true }));
  return {
    storage: store.kind,
    async getAll() {
      const { settings, customers, invoices } = await store.all();
      return {
        storage: store.kind,
        settings: settingsFromRow(settings),
        customers: customers.map(customerFromRow).sort((a, b) => a.name.localeCompare(b.name)),
        invoices: (store.kind === 'memory' ? sorted(invoices) : invoices).map(invoiceFromRow)
      };
    },
    async saveSettings(input) { return settingsFromRow(await store.saveSettings(cleanSettings(input))); },
    async saveCustomer(id, input) { return customerFromRow(await store.saveCustomer(cleanCustomer(id, input))); },
    async deleteCustomer(id) { await store.deleteCustomer(checkId(id)); },
    async saveInvoice(id, input) { return invoiceFromRow(await store.saveInvoice(cleanInvoice(id, input))); },
    async deleteInvoice(id) { await store.deleteInvoice(checkId(id)); }
  };
}

let defaultService = null;
function getInvoicingService() {
  if (!defaultService) {
    let client = null;
    try { client = require('../config/database'); } catch (error) { client = null; }
    defaultService = createInvoicingService(client);
  }
  return defaultService;
}

module.exports = { createInvoicingService, getInvoicingService, InvoicingError, cleanInvoice, cleanSettings, cleanCustomer, STATUSES };
