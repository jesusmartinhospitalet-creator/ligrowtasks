const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/database');

function normalizeClientCode(code = '', clientName = '') {
  const source = String(code || clientName || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return (source.substring(0, 6) || 'CLI');
}

function mapClient(row) {
  if (!row) return null;
  return {
    clientId:    row.id,
    clientName:  row.name,
    clientCode:  row.code,
    concept:     row.concept,
    summary:     row.summary,
    kickoffDate: row.kickoff_date,
    extJson:     row.ext_json,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at
  };
}

async function listClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data.map(mapClient);
}

async function createClient(payload) {
  const clientName = String(payload.clientName || '').trim();
  if (!clientName) throw new Error('El nombre del cliente es obligatorio.');

  const clientCode = normalizeClientCode(payload.clientCode, clientName);
  const now = new Date().toISOString();

  const row = {
    id:           uuidv4(),
    name:         clientName,
    code:         clientCode,
    concept:      payload.concept || '',
    summary:      payload.summary || '',
    kickoff_date: payload.kickoffDate || null,
    ext_json:     payload.extJson || {},
    created_at:   now,
    updated_at:   now
  };

  const { data, error } = await supabase
    .from('clients')
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapClient(data);
}

async function updateClient(clientId, payload) {
  const clientName = String(payload.clientName || '').trim();
  if (!clientName) throw new Error('El nombre del cliente es obligatorio.');

  const clientCode = normalizeClientCode(payload.clientCode, clientName);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('clients')
    .update({
      name:         clientName,
      code:         clientCode,
      concept:      payload.concept || '',
      summary:      payload.summary || '',
      kickoff_date: payload.kickoffDate || null,
      ext_json:     payload.extJson || {},
      updated_at:   now
    })
    .eq('id', clientId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Cliente no encontrado.');
  return mapClient(data);
}

async function deleteClient(clientId) {
  // CASCADE deletes handle comments → tasks, templates, client_months automatically
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId);

  if (error) throw new Error(error.message);
  return { ok: true };
}

module.exports = {
  listClients,
  createClient,
  updateClient,
  deleteClient
};
