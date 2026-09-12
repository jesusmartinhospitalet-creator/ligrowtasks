const crypto = require('crypto');
const env = require('../config/env');

const COOKIE_NAME = 'ligrow_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

function sessionSecret() {
  const secret = process.env.APP_SESSION_SECRET || env.jwtSecret;
  if (!secret || secret === 'change-this-secret') {
    throw new Error('APP_SESSION_SECRET o JWT_SECRET debe estar configurado.');
  }
  return secret;
}

function signature(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    scope: 'ligrow',
    expiresAt: Date.now() + SESSION_DURATION_MS
  })).toString('base64url');

  return payload + '.' + signature(payload);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const entry = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function hasValidSession(req) {
  try {
    const token = readCookie(req, COOKIE_NAME);
    const [payload, receivedSignature] = token.split('.');
    if (!payload || !receivedSignature) return false;

    const expectedSignature = signature(payload);
    if (receivedSignature.length !== expectedSignature.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))) return false;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.scope === 'ligrow' && Number(data.expiresAt) > Date.now();
  } catch (error) {
    return false;
  }
}

function requireAppSession(req, res, next) {
  if (!hasValidSession(req)) {
    return res.status(401).json({ error: 'Inicia sesión para acceder al directorio de proveedores.' });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  SESSION_DURATION_MS,
  createSessionToken,
  requireAppSession
};
