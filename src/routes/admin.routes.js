const express = require('express');
const router = express.Router();

const userService = require('../services/user.service');
const { requireAdmin } = require('../middleware/session-auth.middleware');

// Todas las rutas requieren rol de administrador
router.use(requireAdmin);

// Listar usuarios
router.get('/users', async (req, res) => {
  try {
    const users = await userService.listUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear nuevo usuario
router.post('/users', async (req, res) => {
  try {
    const { email, password, name, role, allowedClients } = req.body;
    const user = await userService.createUser({ email, password, name, role, allowedClients });
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Actualizar usuario (permisos, rol, contraseña)
router.put('/users/:id', async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar usuario
router.delete('/users/:id', async (req, res) => {
  try {
    const result = await userService.deleteUser(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
