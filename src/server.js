require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const authRoutes      = require('./routes/auth.routes');
const syncRoutes      = require('./routes/sync.routes');
const adminRoutes     = require('./routes/admin.routes');
const clientRoutes    = require('./routes/clients.routes');
const taskRoutes      = require('./routes/tasks.routes');
const templateRoutes  = require('./routes/templates.routes');
const monthRoutes     = require('./routes/months.routes');
const supplierRoutes  = require('./routes/suppliers.routes');

const app = express();

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API routes
app.use('/api/auth',      authRoutes);
app.use('/api/sync',      syncRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/clients',   clientRoutes);
app.use('/api/tasks',     taskRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/months',    monthRoutes);
app.use('/api/suppliers', supplierRoutes);

// Módulos nuevos: si alguno no se pudiera cargar (p. ej. un archivo que falta en el despliegue), el resto de la
// API (login, tareas, pedidos…) sigue funcionando y ese módulo responde 503 con el motivo.
// IMPORTANTE: cada require lleva la ruta escrita literalmente. Vercel empaqueta solo los archivos que ve en un
// require('...') con texto fijo; con la ruta en una variable el archivo no entra en el despliegue.
const modules = {};
function mountOptional(name, mountPath, load) {
  try {
    app.use(mountPath, load());
    modules[name] = 'ok';
  } catch (error) {
    console.error('[server] no se pudo cargar el módulo ' + name + ':', error);
    modules[name] = error.message;
    app.use(mountPath, (req, res) => res.status(503).json({ error: 'module_unavailable', message: 'El módulo «' + name + '» no se ha podido cargar en el servidor: ' + error.message }));
  }
}
mountOptional('assistant', '/api/assistant', () => require('./routes/assistant.routes'));
mountOptional('invoicing', '/api/invoicing', () => require('./routes/invoicing.routes'));

app.get('/api', (req, res) => {
  res.json({ app: 'Ligrow Tasks API', status: 'running' });
});

// Diagnóstico público (sin datos sensibles): qué versión está desplegada y qué está configurado.
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let supabaseConfigured = false;
  try { supabaseConfigured = Boolean(require('./config/database')); } catch (error) { supabaseConfigured = false; }
  res.json({
    ok: true,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null, // production | preview | development
    modules,
    env: {
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SERVICE_KEY: Boolean(process.env.SUPABASE_SERVICE_KEY),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY)
    },
    assistantConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY),
    supabaseConfigured
  });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  const previewPath = path.join(__dirname, '..', 'public', 'preview.html');
  if (fs.existsSync(previewPath)) {
    return res.sendFile(previewPath);
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Local dev: start server only when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Ligrow Tasks API running on port ${PORT}`);
  });
}

module.exports = app;
