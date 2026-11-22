const test = require('node:test');
const assert = require('node:assert/strict');
const { calc } = require('../public/invoicing.js');

const line = (input, opts) => calc.buildLine(input, Object.assign({ includesVat: true, vatRate: 21 }, opts));

test('100 tarjetas por 30 € con IVA incluido: base 24,79 + IVA 5,21 = 30,00', () => {
  const l = line({ description: 'Tarjetas de visita', quantity: 100, total: 30 });
  assert.deepEqual([l.net, l.vat, l.total, l.unitPrice], [24.79, 5.21, 30, 0.2479]);
  const t = calc.computeTotals([l], 0);
  assert.deepEqual([t.subtotal, t.vatTotal, t.total], [24.79, 5.21, 30]);
  assert.deepEqual(t.vatBreakdown, [{ rate: 21, base: 24.79, vat: 5.21 }]);
});

test('el total bruto siempre coincide con lo pedido (sin descuadres de céntimos)', () => {
  for (const gross of [0.01, 1, 9.99, 29.99, 30, 99.95, 123.45, 1000, 4567.89]) {
    const l = line({ description: 'x', quantity: 3, total: gross });
    assert.equal(l.total, gross, 'bruto ' + gross);
    assert.equal(calc.r2(l.net + l.vat), gross);
  }
});

test('precios sin IVA: IVA y total correctos', () => {
  const l = line({ description: 'Diseño', quantity: 3, unitPrice: 9.99 }, { includesVat: false });
  assert.deepEqual([l.net, l.vat, l.total], [29.97, 6.29, 36.26]);
});

test('precio unitario con IVA incluido', () => {
  const l = line({ description: 'Flyer', quantity: 2, unitPrice: 12.1 }, { includesVat: true });
  assert.deepEqual([l.net, l.vat, l.total], [20, 4.2, 24.2]);
});

test('varios tipos de IVA e IRPF', () => {
  const a = line({ description: 'A', quantity: 1, unitPrice: 100 }, { includesVat: false });
  const b = line({ description: 'B', quantity: 1, unitPrice: 50, vatRate: 10 }, { includesVat: false });
  const t = calc.computeTotals([a, b], 15);
  assert.deepEqual(t.vatBreakdown, [{ rate: 21, base: 100, vat: 21 }, { rate: 10, base: 50, vat: 5 }]);
  assert.deepEqual([t.subtotal, t.vatTotal, t.irpf, t.total], [150, 26, 22.5, 153.5]);
});

test('validaciones de línea', () => {
  assert.throws(() => line({ description: '', total: 5 }), /descripción/);
  assert.throws(() => line({ description: 'x', quantity: 0, total: 5 }), /cantidad/);
  assert.throws(() => line({ description: 'x' }), /precio/);
  assert.throws(() => line({ description: 'x', total: -1 }), /importe/);
  assert.throws(() => line({ description: 'x', total: 5, vatRate: 200 }), /IVA/);
});

test('numeración correlativa por serie y año', () => {
  const inv = [{ number: 'F-2026-0007' }, { number: 'F-2026-0010' }, { number: 'F-2025-0099' }, { number: 'R-2026-0050' }];
  assert.equal(calc.nextNumber(inv, 'F', '2026-11-23'), 'F-2026-0011');
  assert.equal(calc.nextNumber(inv, 'F', '2027-01-02'), 'F-2027-0001');
  assert.equal(calc.nextNumber([], 'F', '2026-01-01'), 'F-2026-0001');
});

test('fechas', () => {
  assert.ok(calc.validDate('2026-02-28'));
  assert.ok(!calc.validDate('2026-02-30'));
  assert.ok(!calc.validDate('27/11/2026'));
  assert.equal(calc.addDays('2026-12-20', 30), '2027-01-19');
});
