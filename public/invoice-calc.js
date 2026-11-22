/* Ligrow Tasks · cálculo de facturas (módulo puro, sin DOM)
 *
 * Lo cargan el navegador (window.LigrowInvoiceCalc) y el servidor (require), de modo que los importes se
 * calculan con EXACTAMENTE el mismo código en los dos sitios: el servidor vuelve a calcular los totales
 * antes de guardar en Supabase y no se fía de lo que envíe el cliente.
 *
 * Todo se redondea a céntimos en cada paso (r2). El precio unitario se guarda con 4 decimales (r4) solo
 * para mostrarlo: lo que manda es la base («net») de cada línea.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LigrowInvoiceCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const r4 = (n) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const has = (v) => v !== undefined && v !== null && v !== '';

  /**
   * Construye una línea de factura. Admite el precio de UNA unidad (unitPrice) o el importe de TODA la línea
   * (total). `includesVat` indica si esos importes ya llevan IVA. El IVA de una línea con importe bruto es
   * «bruto − base», así el total facturado coincide exactamente con lo que pidió el usuario.
   */
  function buildLine(input, opts) {
    const description = String((input && input.description) || '').trim();
    if (!description) throw new Error('Falta la descripción de una línea.');
    const quantity = has(input.quantity) ? Number(input.quantity) : 1;
    if (!isNum(quantity) || quantity <= 0) throw new Error('La cantidad de «' + description + '» no es válida.');
    const rate = has(input.vatRate) ? Number(input.vatRate) : opts.vatRate;
    if (!isNum(rate) || rate < 0 || rate > 100) throw new Error('El tipo de IVA no es válido.');
    const gross = !!opts.includesVat;
    const hasTotal = has(input.total);
    const hasUnit = has(input.unitPrice);
    if (!hasTotal && !hasUnit) throw new Error('Falta el precio de «' + description + '».');
    const amount = Number(hasTotal ? input.total : input.unitPrice);
    if (!isNum(amount) || amount < 0) throw new Error('El importe de «' + description + '» no es válido.');
    const factor = 1 + rate / 100;
    let net;
    let vat;
    let unitPrice;
    if (hasTotal) {
      if (gross) { const total = r2(amount); net = r2(total / factor); vat = r2(total - net); }
      else { net = r2(amount); vat = r2((net * rate) / 100); }
      unitPrice = r4(net / quantity);
    } else if (gross) {
      const total = r2(quantity * amount);
      net = r2(total / factor); vat = r2(total - net);
      unitPrice = r4(amount / factor);
    } else {
      net = r2(quantity * amount); vat = r2((net * rate) / 100);
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
    const pct = isNum(Number(irpfRate)) ? Number(irpfRate) : 0;
    const irpf = r2((sub * pct) / 100);
    return { subtotal: sub, vatBreakdown: breakdown, vatTotal: vat, irpf, total: r2(sub + vat - irpf) };
  }

  /** Recalcula una línea editada a mano (precio unitario sin IVA × cantidad). */
  function recomputeLine(line) {
    const net = r2(Number(line.quantity) * Number(line.unitPrice));
    const vat = r2((net * Number(line.vatRate)) / 100);
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

  /**
   * Siguiente número de factura correlativo.
   *  - Serie vacía  → numeración simple: 104, 105… (continúa desde el mayor número existente y nunca baja de `startNumber`).
   *  - Con serie    → F-2026-0001 (correlativo por serie y año).
   */
  function nextNumber(invoices, series, dateISO, startNumber) {
    const serie = String(series || '').trim();
    if (!serie) {
      let max = Math.max(0, Math.floor(Number(startNumber) || 1) - 1);
      for (const inv of invoices) {
        if (/^\d+$/.test(String(inv.number || ''))) max = Math.max(max, parseInt(inv.number, 10));
      }
      return String(max + 1);
    }
    const prefix = serie + '-' + String(dateISO).slice(0, 4) + '-';
    let max = 0;
    for (const inv of invoices) {
      if (typeof inv.number === 'string' && inv.number.startsWith(prefix)) {
        const n = parseInt(inv.number.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return prefix + pad(max + 1, 4);
  }

  return { r2, r4, buildLine, computeTotals, recomputeLine, nextNumber, validDate, addDays, todayISO, toISO };
});
