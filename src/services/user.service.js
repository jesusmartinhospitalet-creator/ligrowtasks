const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
let supabase = null;

try {
  supabase = require('../config/database');
} catch (e) {
  // Supabase not configured locally
}

// Almacén en memoria por si Supabase aún no tiene la tabla o no está configurado localmente
const FALLBACK_USERS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'jesus.martin.hospitalet@gmail.com',
    name: 'Jesús (Admin)',
    role: 'admin',
    allowed_clients: ['*'],
    password_hash: bcrypt.hashSync('ligrow26', 10),
    is_active: true,
    created_at: new Date().toISOString()
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'blancaamartiin04@gmail.com',
    name: 'Blanca',
    role: 'member',
    allowed_clients: ['cpb'],
    password_hash: bcrypt.hashSync('ligrow26', 10),
    is_active: true,
    created_at: new Date().toISOString()
  }
];

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role || 'member',
    allowedClients: Array.isArray(u.allowed_clients) ? u.allowed_clients : (u.allowedClients || ['cpb']),
    isActive: u.is_active !== false,
    createdAt: u.created_at
  };
}

async function authenticate(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '');

  if (!cleanEmail || !cleanPass) {
    throw new Error('Email y contraseña requeridos.');
  }

  // 1. Intentar buscar en Supabase
  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!error && data) {
        if (!data.is_active) {
          throw new Error('Esta cuenta ha sido desactivada por el administrador.');
        }
        const match = await bcrypt.compare(cleanPass, data.password_hash);
        if (match) {
          return sanitizeUser(data);
        } else {
          throw new Error('Contraseña incorrecta.');
        }
      }
    } catch (dbError) {
      if (dbError.message === 'Contraseña incorrecta.' || dbError.message.includes('desactivada')) {
        throw dbError;
      }
      console.warn('[user.service] Supabase no disponible o tabla no creada aún, usando fallback:', dbError.message);
    }
  }

  // 2. Fallback local / en memoria
  const fallback = FALLBACK_USERS.find(u => u.email.toLowerCase() === cleanEmail);
  if (!fallback) {
    // Si es un admin intentando entrar con el email general o admin@
    if (cleanEmail === 'admin@ligrow.com' && cleanPass === 'ligrow26') {
      return {
        id: 'admin-master',
        email: 'admin@ligrow.com',
        name: 'Administrador',
        role: 'admin',
        allowedClients: ['*'],
        isActive: true
      };
    }
    throw new Error('Usuario no encontrado.');
  }

  if (!fallback.is_active) {
    throw new Error('Esta cuenta ha sido desactivada por el administrador.');
  }

  const valid = await bcrypt.compare(cleanPass, fallback.password_hash);
  if (!valid) {
    throw new Error('Contraseña incorrecta.');
  }

  return sanitizeUser(fallback);
}

async function listUsers() {
  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(sanitizeUser);
      }
    } catch (e) {
      console.warn('[user.service] List fallback:', e.message);
    }
  }

  return FALLBACK_USERS.map(sanitizeUser);
}

async function createUser({ email, password, name, role = 'member', allowedClients = ['cpb'] }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('El email es obligatorio.');
  if (!password || password.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.');

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = {
    id: uuidv4(),
    email: cleanEmail,
    name: String(name || cleanEmail.split('@')[0]).trim(),
    role: role === 'admin' ? 'admin' : 'member',
    allowed_clients: Array.isArray(allowedClients) ? allowedClients : ['cpb'],
    password_hash: passwordHash,
    is_active: true,
    created_at: new Date().toISOString()
  };

  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .insert(newUser)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return sanitizeUser(data);
    } catch (e) {
      console.warn('[user.service] Insert fallback:', e.message);
    }
  }

  // Guardar en fallback
  const existingIdx = FALLBACK_USERS.findIndex(u => u.email === cleanEmail);
  if (existingIdx !== -1) {
    FALLBACK_USERS[existingIdx] = newUser;
  } else {
    FALLBACK_USERS.push(newUser);
  }

  return sanitizeUser(newUser);
}

async function updateUser(id, updates = {}) {
  const allowed = {};
  if (updates.name) allowed.name = String(updates.name).trim();
  if (updates.role) allowed.role = updates.role === 'admin' ? 'admin' : 'member';
  if (Array.isArray(updates.allowedClients)) allowed.allowed_clients = updates.allowedClients;
  if (typeof updates.isActive === 'boolean') allowed.is_active = updates.isActive;
  if (updates.password && updates.password.length >= 4) {
    allowed.password_hash = await bcrypt.hash(updates.password, 10);
  }
  allowed.updated_at = new Date().toISOString();

  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .update(allowed)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return sanitizeUser(data);
    } catch (e) {
      console.warn('[user.service] Update fallback:', e.message);
    }
  }

  const idx = FALLBACK_USERS.findIndex(u => u.id === id);
  if (idx !== -1) {
    FALLBACK_USERS[idx] = { ...FALLBACK_USERS[idx], ...allowed };
    return sanitizeUser(FALLBACK_USERS[idx]);
  }

  throw new Error('Usuario no encontrado para actualizar.');
}

async function deleteUser(id) {
  if (supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      await supabase.from('app_users').delete().eq('id', id);
    } catch (e) {}
  }

  const idx = FALLBACK_USERS.findIndex(u => u.id === id);
  if (idx !== -1) {
    FALLBACK_USERS.splice(idx, 1);
  }
  return { success: true };
}

module.exports = {
  authenticate,
  listUsers,
  createUser,
  updateUser,
  deleteUser
};
