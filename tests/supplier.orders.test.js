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

test('la fecha del pedido se lee tanto de order_date como de orderDate (no queda en blanco)', async () => {
  const svc = loadService({ rows: [
    { id: 'a', supplier_name: 'Realisaprint', concept: 'A', order_date: '2026-10-21', total_amount: 64, status: 'Pagado', files: [] },
    { id: 'b', supplierName: 'Realisaprint', concept: 'B', orderDate: '2026-10-23', totalAmount: 10, status: 'Pagado', files: [] }
  ] });
  const orders = await svc.listOrders();
  assert.deepEqual(orders.map((o) => o.orderDate), ['2026-10-21', '2026-10-23']);
});

/** Supabase falso que registra lo que se escribe en supplier_orders. */
function loadWritable({ failWith } = {}) {
  process.env.SUPABASE_URL = 'http://fake';
  process.env.SUPABASE_SERVICE_KEY = 'k';
  const written = [];
  const from = () => {
    let payload;
    const q = {
      upsert(row) { payload = row; return q; },
      update(row) { payload = row; return q; },
      eq() { return q; },
      select() { return q; },
      single() { return q.run(); },
      maybeSingle() { return q.run(); },
      run() {
        if (failWith) return Promise.resolve({ data: null, error: { message: failWith } });
        written.push(payload);
        return Promise.resolve({ data: payload, error: null });
      }
    };
    return q;
  };
  const dbPath = require.resolve('../src/config/database');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { from } };
  delete require.cache[require.resolve('../src/services/supplier.service')];
  return { svc: require('../src/services/supplier.service'), written };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test('un pedido con id «ord_…» se guarda con un uuid real y el servidor lo devuelve', async () => {
  const { svc, written } = loadWritable();
  const order = await svc.createOrder({ id: 'ord_123_abc', supplierId: 'p7', supplierName: 'Realisaprint', concept: 'Tarjetas', orderDate: '2026-10-21', totalAmount: 64 });
  assert.match(order.id, UUID_RE);
  assert.equal(order.replacesId, 'ord_123_abc');
  assert.match(written[0].id, UUID_RE);
  assert.equal(written[0].supplier_id, null, 'un supplier_id que no es uuid no debe romper la clave foránea');
});

test('si Supabase rechaza el pedido se avisa en lugar de darlo por guardado', async () => {
  const { svc } = loadWritable({ failWith: 'invalid input syntax for type uuid' });
  await assert.rejects(() => svc.createOrder({ supplierName: 'X', concept: 'Y' }), (e) => e.name === 'OrderStorageError' && /Supabase/.test(e.message));
});

test('actualizar un pedido con id antiguo lo crea y devuelve el id real', async () => {
  const { svc } = loadWritable();
  const order = await svc.updateOrder('ord_old_1', { supplierName: 'X', concept: 'Y', orderDate: '2026-01-02', totalAmount: 5 });
  assert.match(order.id, UUID_RE);
  assert.equal(order.replacesId, 'ord_old_1');
});
