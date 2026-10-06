const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/database');

function cleanText(value, maxLength = 2000) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function normalizeRates(rates) {
  if (!Array.isArray(rates)) return [];

  return rates
    .map((rate) => ({
      prod: cleanText(rate?.prod, 300),
      qty: cleanText(rate?.qty, 120),
      price: cleanText(rate?.price, 120)
    }))
    .filter((rate) => rate.prod || rate.qty || rate.price);
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon || '📁',
    position: row.position
  };
}

function mapSupplier(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    supplierType: row.supplier_type || '',
    email: row.email || '',
    phone: row.phone || '',
    website: row.website || '',
    paymentTerms: row.payment_terms || '',
    leadTime: row.lead_time || '',
    rates: Array.isArray(row.rates) ? row.rates : [],
    productList: row.product_list || '',
    highlightNote: row.highlight_note || '',
    position: row.position
  };
}

async function listSupplierDirectory() {
  const [categoriesResult, suppliersResult] = await Promise.all([
    supabase.from('supplier_categories').select('*').order('position', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('suppliers').select('*').order('position', { ascending: true }).order('created_at', { ascending: true })
  ]);

  if (categoriesResult.error) throw categoriesResult.error;
  if (suppliersResult.error) throw suppliersResult.error;

  const suppliersByCategory = new Map();
  (suppliersResult.data || []).forEach((row) => {
    const supplier = mapSupplier(row);
    const current = suppliersByCategory.get(supplier.categoryId) || [];
    current.push(supplier);
    suppliersByCategory.set(supplier.categoryId, current);
  });

  return (categoriesResult.data || []).map((row) => {
    const category = mapCategory(row);
    return { ...category, suppliers: suppliersByCategory.get(category.id) || [] };
  });
}

async function nextPosition(table, filterColumn, filterValue) {
  let query = supabase.from(table).select('position').order('position', { ascending: false }).limit(1);
  if (filterColumn) query = query.eq(filterColumn, filterValue);
  const { data, error } = await query;
  if (error) throw error;
  return Number(data?.[0]?.position || 0) + 1;
}

async function createCategory(input) {
  const name = cleanText(input?.name, 120);
  if (!name) throw new Error('El nombre de la categoría es obligatorio.');

  const row = {
    id: uuidv4(),
    name,
    icon: cleanText(input?.icon, 16) || '📁',
    position: await nextPosition('supplier_categories')
  };

  const { data, error } = await supabase.from('supplier_categories').insert(row).select().single();
  if (error) throw error;
  return mapCategory(data);
}

async function removeCategory(categoryId) {
  const { error } = await supabase.from('supplier_categories').delete().eq('id', categoryId);
  if (error) throw error;
}

function supplierPayload(input, categoryId) {
  const name = cleanText(input?.name, 180);
  if (!name) throw new Error('El nombre del proveedor es obligatorio.');

  return {
    category_id: categoryId || input?.categoryId,
    name,
    supplier_type: cleanText(input?.supplierType, 180),
    email: cleanText(input?.email, 240),
    phone: cleanText(input?.phone, 120),
    website: cleanText(input?.website, 500),
    payment_terms: cleanText(input?.paymentTerms, 180),
    lead_time: cleanText(input?.leadTime, 180),
    rates: normalizeRates(input?.rates),
    product_list: cleanText(input?.productList, 5000),
    highlight_note: cleanText(input?.highlightNote, 1000)
  };
}

async function createSupplier(input) {
  const categoryId = cleanText(input?.categoryId, 80);
  if (!categoryId) throw new Error('Selecciona una categoría.');

  const row = {
    id: uuidv4(),
    ...supplierPayload(input, categoryId),
    position: await nextPosition('suppliers', 'category_id', categoryId)
  };

  const { data, error } = await supabase.from('suppliers').insert(row).select().single();
  if (error) throw error;
  return mapSupplier(data);
}

async function updateSupplier(supplierId, input) {
  const categoryId = cleanText(input?.categoryId, 80);
  if (!categoryId) throw new Error('Selecciona una categoría.');

  const { data, error } = await supabase
    .from('suppliers')
    .update(supplierPayload(input, categoryId))
    .eq('id', supplierId)
    .select()
    .single();

  if (error) throw error;
  return mapSupplier(data);
}

async function removeSupplier(supplierId) {
  const { error } = await supabase.from('suppliers').delete().eq('id', supplierId);
  if (error) throw error;
}

function mapOrder(row) {
  return {
    id: row.id,
    supplierId: row.supplier_id || row.supplierId || null,
    supplierName: row.supplier_name || row.supplierName || 'Proveedor',
    categoryName: row.category_name || row.categoryName || '',
    concept: row.concept || '',
    orderDate: row.order_date ? (typeof row.order_date === 'string' ? row.order_date.slice(0, 10) : new Date(row.order_date).toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10),
    totalAmount: Number(row.total_amount != null ? row.total_amount : (row.totalAmount || 0)),
    status: row.status || 'Pagado',
    invoiceNumber: row.invoice_number || row.invoiceNumber || '',
    notes: row.notes || '',
    files: Array.isArray(row.files) ? row.files : [],
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

const FALLBACK_ORDERS = [
  {
    id: '4a1e9b20-cc8d-4e1a-92de-002000000001',
    supplier_id: '3d5c8b9e-cc8d-4e1a-92de-001000000101',
    supplier_name: 'PrintOnDemand BCN',
    category_name: 'Impresión',
    concept: '500 Flyers A5 doble cara estucado mate 350g',
    order_date: '2026-03-24',
    total_amount: 38.00,
    status: 'Pagado',
    invoice_number: 'FAC-2026-0042',
    notes: 'Entrega completada en tiempo y forma. Excelente calidad de corte.',
    files: [
      { id: 'f1', name: 'Factura_FAC-2026-0042.pdf', type: 'application/pdf', size: 124500, url: '' },
      { id: 'f2', name: 'Muestra_Flyer_A5.jpg', type: 'image/jpeg', size: 248000, url: '' }
    ]
  },
  {
    id: '4a1e9b20-cc8d-4e1a-92de-002000000002',
    supplier_id: '3d5c8b9e-cc8d-4e1a-92de-001000000102',
    supplier_name: 'Grafisant',
    category_name: 'Impresión',
    concept: '2 Roll-ups 85×200 con estructura de aluminio y funda de transporte',
    order_date: '2026-03-15',
    total_amount: 178.00,
    status: 'Pagado',
    invoice_number: 'ALB-98124',
    notes: 'Material corporativo para ferias y stands de clientes.',
    files: [
      { id: 'f3', name: 'Diseno_Rollup_85x200.jpg', type: 'image/jpeg', size: 389000, url: '' }
    ]
  },
  {
    id: '4a1e9b20-cc8d-4e1a-92de-002000000003',
    supplier_id: '3d5c8b9e-cc8d-4e1a-92de-001000000201',
    supplier_name: 'Estudi Forma',
    category_name: 'Diseño',
    concept: 'Manual de identidad corporativa y adaptaciones web',
    order_date: '2026-02-28',
    total_amount: 1200.00,
    status: 'Recibido',
    invoice_number: 'EF-2026-08',
    notes: 'Incluye paleta cromática, tipografías corporativas y guía de estilo.',
    files: [
      { id: 'f4', name: 'Manual_Identidad_Ligrow.pdf', type: 'application/pdf', size: 450000, url: '' }
    ]
  }
];

let HAS_MODIFIED_ORDERS = false;

async function syncOrdersToWorkspaceSync(orders) {
  if (!supabase || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return;
  try {
    const { data: existing } = await supabase
      .from('workspace_sync')
      .select('payload, activity_log')
      .eq('client_id', 'pv')
      .maybeSingle();

    const existingPayload = (existing && existing.payload) || {};
    const updatedPayload = { ...existingPayload, orders: orders || [] };
    const now = new Date().toISOString();

    await supabase.from('workspace_sync').upsert({
      client_id: 'pv',
      payload: updatedPayload,
      last_modified_by: 'Jesús',
      last_modified_email: 'jesus.martin.hospitalet@gmail.com',
      activity_log: existing?.activity_log || [],
      updated_at: now
    });
  } catch (e) {
    console.warn('[supplier.service] syncOrdersToWorkspaceSync warning:', e.message);
  }
}

async function listOrders() {
  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    // 1. Intentar leer de la tabla dedicada supplier_orders
    try {
      const { data, error } = await supabase
        .from('supplier_orders')
        .select('*')
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && (data.length > 0 || HAS_MODIFIED_ORDERS)) {
        return data.map(mapOrder);
      }
    } catch (e) {
      console.warn('[supplier.service] listOrders Supabase query warning:', e.message);
    }

    // 2. Si la tabla no existe o no tiene registros aún, consultar workspace_sync para 'pv'
    try {
      const { data: syncRow, error: syncError } = await supabase
        .from('workspace_sync')
        .select('payload')
        .eq('client_id', 'pv')
        .maybeSingle();

      if (!syncError && syncRow?.payload && Array.isArray(syncRow.payload.orders)) {
        return syncRow.payload.orders.map(mapOrder);
      }
    } catch (e) {
      console.warn('[supplier.service] listOrders workspace_sync query warning:', e.message);
    }
  }

  // 3. Si ya se han modificado órdenes en esta sesión o servidor, respetar el estado actual (incluso si está vacío)
  if (HAS_MODIFIED_ORDERS) {
    return FALLBACK_ORDERS.map(mapOrder);
  }

  return FALLBACK_ORDERS.map(mapOrder);
}

async function createOrder(input) {
  HAS_MODIFIED_ORDERS = true;
  const supplierName = cleanText(input?.supplierName || input?.supplier_name, 180);
  const concept = cleanText(input?.concept, 300);
  if (!concept) throw new Error('El concepto del pedido es obligatorio.');
  if (!supplierName) throw new Error('El proveedor es obligatorio.');

  const row = {
    id: input?.id || uuidv4(),
    supplier_id: input?.supplierId || input?.supplier_id || null,
    supplier_name: supplierName,
    category_name: cleanText(input?.categoryName || input?.category_name, 100),
    concept,
    order_date: input?.orderDate || input?.order_date || new Date().toISOString().slice(0, 10),
    total_amount: Number(input?.totalAmount != null ? input.totalAmount : (input?.total_amount || 0)),
    status: cleanText(input?.status, 50) || 'Pagado',
    invoice_number: cleanText(input?.invoiceNumber || input?.invoice_number, 100),
    notes: cleanText(input?.notes, 5000),
    files: Array.isArray(input?.files) ? input.files : [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { data, error } = await supabase.from('supplier_orders').insert(row).select().single();
      if (!error && data) {
        FALLBACK_ORDERS.unshift(row);
        await syncOrdersToWorkspaceSync(FALLBACK_ORDERS);
        return mapOrder(data);
      }
    } catch (e) {
      console.warn('[supplier.service] createOrder Supabase insert warning:', e.message);
    }
  }

  FALLBACK_ORDERS.unshift(row);
  await syncOrdersToWorkspaceSync(FALLBACK_ORDERS);
  return mapOrder(row);
}

async function updateOrder(orderId, input) {
  HAS_MODIFIED_ORDERS = true;
  const existingIdx = FALLBACK_ORDERS.findIndex(o => o.id === orderId);
  const updateData = {
    supplier_id: input?.supplierId !== undefined ? input.supplierId : input?.supplier_id,
    supplier_name: input?.supplierName !== undefined ? cleanText(input.supplierName, 180) : cleanText(input?.supplier_name, 180),
    category_name: input?.categoryName !== undefined ? cleanText(input.categoryName, 100) : cleanText(input?.category_name, 100),
    concept: cleanText(input?.concept, 300),
    order_date: input?.orderDate || input?.order_date,
    total_amount: Number(input?.totalAmount != null ? input.totalAmount : (input?.total_amount || 0)),
    status: cleanText(input?.status, 50) || 'Pagado',
    invoice_number: cleanText(input?.invoiceNumber !== undefined ? input.invoiceNumber : input?.invoice_number, 100),
    notes: cleanText(input?.notes, 5000),
    files: Array.isArray(input?.files) ? input.files : [],
    updated_at: new Date().toISOString()
  };

  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { data, error } = await supabase
        .from('supplier_orders')
        .update(updateData)
        .eq('id', orderId)
        .select()
        .single();

      if (!error && data) {
        if (existingIdx !== -1) FALLBACK_ORDERS[existingIdx] = { ...FALLBACK_ORDERS[existingIdx], ...updateData };
        await syncOrdersToWorkspaceSync(FALLBACK_ORDERS);
        return mapOrder(data);
      }
    } catch (e) {
      console.warn('[supplier.service] updateOrder Supabase update warning:', e.message);
    }
  }

  if (existingIdx !== -1) {
    FALLBACK_ORDERS[existingIdx] = { ...FALLBACK_ORDERS[existingIdx], ...updateData };
    await syncOrdersToWorkspaceSync(FALLBACK_ORDERS);
    return mapOrder(FALLBACK_ORDERS[existingIdx]);
  }

  const updatedRecord = { id: orderId, ...updateData };
  FALLBACK_ORDERS.unshift(updatedRecord);
  await syncOrdersToWorkspaceSync(FALLBACK_ORDERS);
  return mapOrder(updatedRecord);
}

async function removeOrder(orderId) {
  HAS_MODIFIED_ORDERS = true;
  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      await supabase.from('supplier_orders').delete().eq('id', orderId);
    } catch (e) {
      console.warn('[supplier.service] removeOrder Supabase delete warning:', e.message);
    }
  }

  const idx = FALLBACK_ORDERS.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    FALLBACK_ORDERS.splice(idx, 1);
  }
  await syncOrdersToWorkspaceSync(FALLBACK_ORDERS);
}

module.exports = {
  listSupplierDirectory,
  createCategory,
  removeCategory,
  createSupplier,
  updateSupplier,
  removeSupplier,
  listOrders,
  createOrder,
  updateOrder,
  removeOrder
};
