const crypto = require('crypto');
const env = require('../config/env');

const COOKIE_NAME = 'ligrow_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 días de sesión

function sessionSecret() {
  const secret = process.env.APP_SESSION_SECRET || env.jwtSecret;
  if (!secret || secret === 'change-this-secret') {
    return 'ligrow-tasks-secure-session-key-2026-prod';
  }
  return secret;
}

function signature(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function createSessionToken(user = {}) {
  const payload = Buffer.from(JSON.stringify({
    scope: 'ligrow',
    userId: user.id || '',
    email: (user.email || '').toLowerCase().trim(),
    name: user.name || 'Usuario',
    role: user.role || 'member',
    allowedClients: Array.isArray(user.allowedClients) ? user.allowedClients : ['*'],
    expiresAt: Date.now() + SESSION_DURATION_MS
  })).toString('base64url');

  return payload + '.' + signature(payload);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const entry = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function getSessionUser(req) {
  try {
    const token = readCookie(req, COOKIE_NAME);
    if (!token) return null;
    const [payload, receivedSignature] = token.split('.');
    if (!payload || !receivedSignature) return null;

    const expectedSignature = signature(payload);
    if (receivedSignature.length !== expectedSignature.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.scope !== 'ligrow' || Number(data.expiresAt) <= Date.now()) return null;
    return data;
  } catch (error) {
    return null;
  }
}

function hasValidSession(req) {
  const user = getSessionUser(req);
  return Boolean(user);
}

function requireAppSession(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Inicia sesión para continuar en Ligrow Tasks.' });
  }
  req.sessionUser = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getSessionUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido: requiere permisos de administrador.' });
  }
  req.sessionUser = user;
  next();
}

module.exports = {
  COOKIE_NAME,
  SESSION_DURATION_MS,
  createSessionToken,
  getSessionUser,
  hasValidSession,
  requireAppSession,
  requireAdmin
};
