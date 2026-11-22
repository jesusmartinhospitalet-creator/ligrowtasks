const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const supabase = require('../config/database');

function database() {
  if (!supabase || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('El servicio de usuarios no está disponible.');
  }
  return supabase;
}
function sanitizeUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role || 'member',
    allowedClients: Array.isArray(u.allowed_clients) ? u.allowed_clients : [],
    isActive: u.is_active !== false, createdAt: u.created_at };
}
async function authenticate(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) throw new Error('Email y contraseña requeridos.');
  const { data, error } = await database().from('app_users').select('*').eq('email', cleanEmail).maybeSingle();
  if (error) throw new Error('El servicio de usuarios no está disponible.');
  if (!data || !data.is_active || !(await bcrypt.compare(String(password), data.password_hash))) {
    throw new Error('Email o contraseña incorrectos.');
  }
  return sanitizeUser(data);
}
async function listUsers() {
  const { data, error } = await database().from('app_users').select('*').order('created_at', { ascending: true });
  if (error) throw new Error('No se pueden consultar los usuarios.');
  return (data || []).map(sanitizeUser);
}
async function createUser({ email, password, name, role = 'member', allowedClients = ['cpb'] }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('El email es obligatorio.');
  if (!password || password.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres.');
  const newUser = { id: uuidv4(), email: cleanEmail, name: String(name || cleanEmail.split('@')[0]).trim(),
    role: role === 'admin' ? 'admin' : 'member', allowed_clients: Array.isArray(allowedClients) ? allowedClients : [],
    password_hash: await bcrypt.hash(password, 10), is_active: true, created_at: new Date().toISOString() };
  const { data, error } = await database().from('app_users').insert(newUser).select().single();
  if (error) throw new Error('No se puede crear el usuario.');
  return sanitizeUser(data);
}
async function updateUser(id, updates = {}) {
  const allowed = {};
  if (updates.name) allowed.name = String(updates.name).trim();
  if (updates.role) allowed.role = updates.role === 'admin' ? 'admin' : 'member';
  if (Array.isArray(updates.allowedClients)) allowed.allowed_clients = updates.allowedClients;
  if (typeof updates.isActive === 'boolean') allowed.is_active = updates.isActive;
  if (updates.password) {
    if (updates.password.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres.');
    allowed.password_hash = await bcrypt.hash(updates.password, 10);
  }
  allowed.updated_at = new Date().toISOString();
  const { data, error } = await database().from('app_users').update(allowed).eq('id', id).select().single();
  if (error || !data) throw new Error('No se puede actualizar el usuario.');
  return sanitizeUser(data);
}
async function deleteUser(id) {
  const { error } = await database().from('app_users').delete().eq('id', id);
  if (error) throw new Error('No se puede eliminar el usuario.');
  return { success: true };
}
module.exports = { authenticate, listUsers, createUser, updateUser, deleteUser };
