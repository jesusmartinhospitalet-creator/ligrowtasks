const test = require('node:test');
const assert = require('node:assert/strict');
const { createInvoicingService, InvoicingError } = require('../src/services/invoicing.service');

/** Supabase falso con las restricciones relevantes de la migración (número único, FK de cliente, tablas). */
function fakeSupabase(opts = {}) {
  const tables = { invoice_settings: [], invoice_customers: [], invoices: [] };
  const log = [];
  const err = (code, message) => ({ data: null, error: { code, message } });
  function builder(table) {
    const st = { op: 'select', filters: [], order: [], payload: null, single: false, maybe: false };
    const run = () => {
      log.push({ table, op: st.op });
      if (opts.missing) return err('42P01', 'relation "public.' + table + '" does not exist');
      if (opts.denied) return err('42501', 'new row violates row-level security policy for table "' + table + '"');
      const rows = tables[table];
      const match = (r) => st.filters.every(([c, v]) => r[c] === v);
      if (st.op === 'select') {
        let out = rows.filter(match);
        for (const [c, asc] of st.order.slice().reverse()) out = out.slice().sort((a, b) => (asc ? 1 : -1) * String(a[c]).localeCompare(String(b[c]), undefined, { numeric: true }));
        if (st.maybe) return { data: out[0] || null, error: null };
        return { data: out, error: null };
      }
      if (st.op === 'delete') {
        tables[table] = rows.filter((r) => !match(r));
        if (table === 'invoice_customers') tables.invoices.forEach((i) => { if (!tables.invoice_customers.some((c) => c.id === i.customer_id)) i.customer_id = null; });
        return { data: null, error: null };
      }
      if (st.op === 'upsert') {
        const row = st.payload;
        if (table === 'invoices') {
          if (rows.some((r) => r.number === row.number && r.id !== row.id)) return err('23505', 'duplicate key value violates unique constraint "invoices_number_unique"');
          if (row.customer_id && !tables.invoice_customers.some((c) => c.id === row.customer_id)) return err('23503', 'violates foreign key constraint');
          if (!['borrador', 'emitida', 'cobrada', 'anulada'].includes(row.status)) return err('23514', 'check constraint invoices_status_check');
        }
        const i = rows.findIndex((r) => r.id === row.id);
        const merged = { created_at: '2026-01-01T00:00:00Z', ...(i >= 0 ? rows[i] : {}), ...row };
        if (i >= 0) rows[i] = merged; else rows.push(merged);
        return { data: merged, error: null };
      }
      return err('XX000', 'op desconocida');
    };
    const b = {
      select() { return b; },
      eq(c, v) { st.filters.push([c, v]); return b; },
      order(c, o) { st.order.push([c, !(o && o.ascending === false)]); return b; },
      maybeSingle() { st.maybe = true; return b; },
      single() { st.single = true; return b; },
      upsert(row) { st.op = 'upsert'; st.payload = row; return b; },
      delete() { st.op = 'delete'; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); }
    };
    return b;
  }
  return { from: builder, tables, log };
}

const issuer = { companyName: 'Jesús Amadeo Martín González', taxId: '46470752B', taxIdLabel: 'DNI', address: 'Avinguda Saloria 32', postalCode: '25700', city: "La Seu d'Urgell" };
const customer = { id: 'cus_1', name: 'La3Cultural Digital Studio, S.L.', taxId: 'B67377028', address: 'C/València 220, ppal 2', postalCode: '08011', city: 'Barcelona' };
const line104 = { description: 'Gestió, Publicació i Monitorització de Diferents Xarxes Socials i Continguts per a La3Cultural.', quantity: 1, unitPrice: 950, vatRate: 21, net: 950, vat: 199.5, total: 1149.5 };
const invoice = (extra = {}) => ({ number: '104', status: 'emitida', date: '2026-03-23', customer, customerId: 'cus_1', issuer, lines: [line104], vatRate: 21, irpfRate: 15, paymentMethod: 'Transferencia bancaria', iban: 'ES53 0182 3050 0002 0200 1810', bankName: 'BBVA', ...extra });

test('la factura 104 de la plantilla: 950 + 199,50 − 142,50 = 1007', async () => {
  const sb = fakeSupabase();
  const svc = createInvoicingService(sb);
  await svc.saveCustomer('cus_1', customer);
  const saved = await svc.saveInvoice('inv_104', invoice());
  assert.deepEqual([saved.subtotal, saved.vatTotal, saved.irpf, saved.total], [950, 199.5, 142.5, 1007]);
  assert.equal(sb.tables.invoices[0].total, 1007);
  assert.equal(sb.tables.invoices[0].issue_date, '2026-03-23');
  assert.deepEqual(saved.vatBreakdown, [{ rate: 21, base: 950, vat: 199.5 }]);
});

test('el servidor recalcula los importes: no se fía de los totales del cliente', async () => {
  const svc = createInvoicingService(fakeSupabase());
  const forged = invoice({ total: 1, subtotal: 1, vatTotal: 0, irpf: 0, lines: [{ ...line104, total: 5 }] });
  const saved = await svc.saveInvoice('inv_f', forged);
  assert.equal(saved.total, 1007);
  assert.equal(saved.lines[0].total, 1149.5);
});

test('ida y vuelta de ajustes, clientes y facturas', async () => {
  const svc = createInvoicingService(fakeSupabase());
  assert.equal((await svc.getAll()).storage, 'supabase');
  assert.equal((await svc.getAll()).settings.invoiceLanguage, 'ca');
  await svc.saveSettings({ companyName: 'Jesús', taxId: '46470752B', taxIdLabel: 'DNI', bankName: 'BBVA', iban: 'ES53 0182 3050 0002 0200 1810', series: '', startNumber: 106, defaultIrpfRate: 15, paymentDays: 30, invoiceLanguage: 'ca' });
  await svc.saveCustomer('cus_1', customer);
  await svc.saveInvoice('inv_104', invoice());
  const all = await svc.getAll();
  assert.equal(all.settings.startNumber, 106);
  assert.equal(all.settings.defaultIrpfRate, 15);
  assert.equal(all.settings.taxIdLabel, 'DNI');
  assert.equal(all.customers[0].taxId, 'B67377028');
  assert.equal(all.invoices[0].number, '104');
  assert.equal(all.invoices[0].customer.name, customer.name);
  assert.equal(all.invoices[0].dueDate, '');
});

test('número duplicado → 409 y la factura original no se toca', async () => {
  const sb = fakeSupabase();
  const svc = createInvoicingService(sb);
  await svc.saveInvoice('a', invoice({ customerId: '', customer: { name: 'X' } }));
  await assert.rejects(svc.saveInvoice('b', invoice({ customerId: '', customer: { name: 'Y' } })), (e) => e instanceof InvoicingError && e.status === 409 && e.code === 'duplicate_number');
  assert.equal(sb.tables.invoices.length, 1);
  // Actualizar la misma factura con su mismo número sí es válido.
  await svc.saveInvoice('a', invoice({ customerId: '', customer: { name: 'X' }, notes: 'editada' }));
  assert.equal(sb.tables.invoices[0].notes, 'editada');
});

test('si el cliente no existe aún, la factura se guarda con su copia de datos', async () => {
  const sb = fakeSupabase();
  const svc = createInvoicingService(sb);
  const saved = await svc.saveInvoice('inv', invoice({ customerId: 'cus_inexistente' }));
  assert.equal(saved.customerId, '');
  assert.equal(saved.customer.name, customer.name);
});

test('borrar el cliente conserva la factura', async () => {
  const sb = fakeSupabase();
  const svc = createInvoicingService(sb);
  await svc.saveCustomer('cus_1', customer);
  await svc.saveInvoice('inv', invoice());
  await svc.deleteCustomer('cus_1');
  const all = await svc.getAll();
  assert.equal(all.customers.length, 0);
  assert.equal(all.invoices.length, 1);
  await svc.deleteInvoice('inv');
  assert.equal((await svc.getAll()).invoices.length, 0);
});

test('rechaza datos no válidos con 400', async () => {
  const svc = createInvoicingService(fakeSupabase());
  const bad = [
    ['id con caracteres raros', () => svc.saveInvoice('a/b', invoice())],
    ['estado', () => svc.saveInvoice('x', invoice({ status: 'pagada' }))],
    ['fecha', () => svc.saveInvoice('x', invoice({ date: '23/3/2026' }))],
    ['sin líneas', () => svc.saveInvoice('x', invoice({ lines: [] }))],
    ['línea sin descripción', () => svc.saveInvoice('x', invoice({ lines: [{ ...line104, description: ' ' }] }))],
    ['importe negativo', () => svc.saveInvoice('x', invoice({ lines: [{ ...line104, net: -5 }] }))],
    ['línea sin base', () => svc.saveInvoice('x', invoice({ lines: [{ description: 'x', quantity: 1 }] }))],
    ['IRPF fuera de rango', () => svc.saveInvoice('x', invoice({ irpfRate: 80 }))],
    ['sin número', () => svc.saveInvoice('x', invoice({ number: '' }))],
    ['sin cliente', () => svc.saveInvoice('x', invoice({ customer: null }))],
    ['serie inválida', () => svc.saveSettings({ series: 'F-26!' })],
    ['IVA por defecto', () => svc.saveSettings({ defaultVatRate: 300 })],
    ['idioma', () => svc.saveSettings({ invoiceLanguage: 'fr' })],
    ['cliente sin nombre', () => svc.saveCustomer('c', { taxId: '1' })]
  ];
  for (const [name, fn] of bad) await assert.rejects(fn(), (e) => e instanceof InvoicingError && e.status === 400, name);
});

test('sin las tablas de Supabase falla con un error claro (no finge guardar)', async () => {
  const svc = createInvoicingService(fakeSupabase({ missing: true }));
  for (const fn of [() => svc.getAll(), () => svc.saveInvoice('x', invoice()), () => svc.saveSettings({})]) {
    await assert.rejects(fn(), (e) => e.status === 503 && e.code === 'storage_not_ready' && /20261124_invoicing\.sql/.test(e.message));
  }
});

test('clave pública (RLS) → error explícito', async () => {
  const svc = createInvoicingService(fakeSupabase({ denied: true }));
  await assert.rejects(svc.saveInvoice('x', invoice()), (e) => e.code === 'storage_denied' && /SUPABASE_SERVICE_KEY/.test(e.message));
});

test('sin Supabase configurado usa memoria y lo indica', async () => {
  const svc = createInvoicingService(null);
  assert.equal(svc.storage, 'memory');
  await svc.saveInvoice('a', invoice({ customerId: '', customer: { name: 'X' } }));
  const all = await svc.getAll();
  assert.equal(all.storage, 'memory');
  assert.equal(all.invoices.length, 1);
  await assert.rejects(svc.saveInvoice('b', invoice({ customerId: '', customer: { name: 'Y' } })), (e) => e.status === 409);
});
