const express = require('express');
const router = express.Router();

const userService = require('../services/user.service');
const {
  COOKIE_NAME,
  SESSION_DURATION_MS,
  createSessionToken,
  getSessionUser
} = require('../middleware/session-auth.middleware');

// 1. Iniciar sesión con email y contraseña
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Debes indicar email y contraseña.' });
  }

  try {
    const user = await userService.authenticate(email, password);

    res.cookie(COOKIE_NAME, createSessionToken(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DURATION_MS,
      path: '/'
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        allowedClients: user.allowedClients
      }
    });
  } catch (err) {
    res.status(401).json({ error: err.message || 'Error de autenticación.' });
  }
});

// 2. Obtener el usuario autenticado actual
router.get('/me', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return res.json({ user: null });
  }

  res.json({
    user: {
      id: sessionUser.userId,
      email: sessionUser.email,
      name: sessionUser.name,
      role: sessionUser.role,
      allowedClients: sessionUser.allowedClients
    }
  });
});

// 3. Cerrar sesión
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.status(204).end();
});

module.exports = router;
