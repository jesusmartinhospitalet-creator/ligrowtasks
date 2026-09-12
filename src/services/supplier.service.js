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

module.exports = {
  listSupplierDirectory,
  createCategory,
  removeCategory,
  createSupplier,
  updateSupplier,
  removeSupplier
};
