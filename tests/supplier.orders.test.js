const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const DEMO = ['4a1e9b20-cc8d-4e1a-92de-002000000001', '4a1e9b20-cc8d-4e1a-92de-002000000002', '4a1e9b20-cc8d-4e1a-92de-002000000003'];

/** Carga supplier.service con un Supabase falso (tabla de pedidos y espacio sincronizado). */
function loadService({ rows, syncOrders, tableError }) {
  process.env.SUPABASE_URL = 'http://fake';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  const query = (table) => {
    const q = {
      select() { return q; }, order() { return q; }, eq() { return q; },
      maybeSingle() { return Promise.resolve({ data: { payload: { orders: syncOrders } }, error: null }); },
      then(res, rej) {
        const out = table === 'supplier_orders' ? (tableError ? { data: null, error: { message: 'relation does not exist' } } : { data: rows, error: null }) : { data: [], error: null };
        return Promise.resolve(out).then(res, rej);
      }
    };
    return q;
  };
  const dbPath = require.resolve('../src/config/database');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { from: query } };
  delete require.cache[require.resolve('../src/services/supplier.service')];
  return require('../src/services/supplier.service');
}

const row = (id, concept) => ({ id, supplier_name: 'X', concept, order_date: '2026-01-01', total_amount: 10, status: 'Pagado', files: [] });

test('los pedidos de demostración ya no se muestran, aunque sigan en la base de datos', async () => {
  const svc = loadService({ rows: [row(DEMO[0], 'demo'), row('real-1', 'REAL'), row(DEMO[2], 'demo')] });
  const orders = await svc.listOrders();
  assert.deepEqual(orders.map((o) => o.concept), ['REAL']);
});

test('con la tabla vacía no reaparecen los pedidos antiguos del espacio sincronizado', async () => {
  const svc = loadService({ rows: [], syncOrders: [row(DEMO[1], 'demo')] });
  assert.deepEqual(await svc.listOrders(), []);
});

test('si la tabla no existe se usa el espacio sincronizado (sin los de demostración)', async () => {
  const svc = loadService({ tableError: true, syncOrders: [row(DEMO[0], 'demo'), row('real-2', 'REAL 2')] });
  assert.deepEqual((await svc.listOrders()).map((o) => o.concept), ['REAL 2']);
});

test('sin Supabase y sin pedidos, la lista empieza vacía', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  const svc = loadService({ rows: [] });
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  assert.deepEqual(await svc.listOrders(), []);
});
