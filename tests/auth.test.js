const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const EMAIL = 'jesus.martin.hospitalet@gmail.com';
const INVALID_SEED_HASH = '$2a$10$fV8g5iH0bH036vX4tD8h7OMM.LhB9R9KxT3uGjS9P5k5.8MsqoYtC'; // el que traía la migración: no valida «ligrow26»

/** Carga user.service con un Supabase falso y el entorno indicado. */
function load({ env, row, error }) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) if (env[k] === undefined) delete process.env[k];
  const client = { from: () => { const q = { select() { return q; }, eq() { return q; }, maybeSingle: () => Promise.resolve({ data: row || null, error: error || null }) }; return q; } };
  const dbPath = require.resolve('../src/config/database');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: env.SUPABASE_URL ? client : null };
  delete require.cache[require.resolve('../src/services/user.service')];
  const service = require('../src/services/user.service');
  return { service, restore: () => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); } };
}
const PROD = { NODE_ENV: 'production', SUPABASE_URL: 'http://fake', SUPABASE_SERVICE_KEY: 'k' };

test('el hash de ejemplo de la migración no valida «ligrow26» (causa del login roto)', () => {
  assert.equal(bcrypt.compareSync('ligrow26', INVALID_SEED_HASH), false);
});

test('producción + Supabase: entra con el hash de la base de datos', async () => {
  const row = { id: 'u1', email: EMAIL, name: 'Jesús', role: 'admin', allowed_clients: ['*'], is_active: true, password_hash: bcrypt.hashSync('Contraseña-Larga-2026', 10) };
  const { service, restore } = load({ env: PROD, row });
  try {
    const user = await service.authenticate(EMAIL, 'Contraseña-Larga-2026');
    assert.equal(user.role, 'admin');
    await assert.rejects(service.authenticate(EMAIL, 'ligrow26'), /Contraseña incorrecta/);
  } finally { restore(); }
});

test('producción + Supabase: «ligrow26» NO abre ninguna puerta (usuario inexistente, error de BD o hash inválido)', async () => {
  for (const scenario of [
    { row: null, expect: /Usuario no encontrado/ },
    { row: null, error: { code: '42P01', message: 'relation does not exist' }, expect: /Falta la tabla de usuarios/ },
    { row: null, error: { code: 'XX000', message: 'boom' }, expect: /No se ha podido comprobar/ },
    { row: { id: 'u', email: EMAIL, name: 'x', role: 'admin', is_active: true, password_hash: INVALID_SEED_HASH }, expect: /Contraseña incorrecta/ }
  ]) {
    const { service, restore } = load({ env: PROD, row: scenario.row, error: scenario.error });
    try {
      await assert.rejects(service.authenticate(EMAIL, 'ligrow26'), scenario.expect);
      await assert.rejects(service.authenticate('admin@ligrow.com', 'ligrow26'), /./);
    } finally { restore(); }
  }
});

test('desarrollo sin Supabase: los usuarios de respaldo siguen funcionando', async () => {
  const { service, restore } = load({ env: { NODE_ENV: 'development' } });
  try {
    assert.equal((await service.authenticate(EMAIL, 'ligrow26')).email, EMAIL);
    assert.equal((await service.authenticate('admin@ligrow.com', 'ligrow26')).role, 'admin');
  } finally { restore(); }
});

test('producción SIN Supabase configurado: tampoco hay puerta trasera', async () => {
  const { service, restore } = load({ env: { NODE_ENV: 'production' } });
  try {
    await assert.rejects(service.authenticate(EMAIL, 'ligrow26'), /Supabase configurado/);
  } finally { restore(); }
});
