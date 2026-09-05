'use strict';

const SEED_CLIENTS = [
  { clientId: 'cli-01', clientName: 'Pic Negre - Campaña Invierno', clientCode: 'PICNEG', concept: 'Marketing Hub V2', summary: 'Gestión integral de campaña nieve y activaciones digitales', kickoffDate: '2026-09-01', category: 'cliente', status: 'activo', colorAccent: '#f97316', progressPct: 65, tasksCount: 4 },
  { clientId: 'cli-02', clientName: 'Ligrow Hub - Infraestructura', clientCode: 'LIGROW', concept: 'Sistemas Internos', summary: 'Refactorización a Node.js Express y despliegue Vercel', kickoffDate: '2026-08-15', category: 'personal', status: 'activo', colorAccent: '#3b82f6', progressPct: 80, tasksCount: 3 },
  { clientId: 'cli-03', clientName: 'Andorra Ecommerce - Rediseño', clientCode: 'ANDOEE', concept: 'Rediseño UX/UI Store', summary: 'Optimización de embudo de venta y migración a Shopify Plus', kickoffDate: '2026-09-10', category: 'cliente', status: 'activo', colorAccent: '#10b981', progressPct: 40, tasksCount: 2 }
];

const SEED_TASKS = [
  { id: 'tsk-01', taskCode: 'PIC-101', clientId: 'cli-01', clientName: 'Pic Negre - Campaña Invierno', taskName: 'Revisión final de copies creativos', owner: 'Jesús', status: 'En curso', priority: 'Alta', taskType: 'Puntual', category: 'Marketing', dueDate: '2026-09-06', description: 'Supervisar copies para redes sociales y soportes impresos.', subtasks: [{ id: 'sub-1', title: 'Banner Google Ads', completed: true }, { id: 'sub-2', title: 'Post Instagram Feed', completed: false }], tags: ['Copywriting', 'Urgente'], attachments: [{ name: 'Briefing_Copies.pdf', url: '#' }] },
  { id: 'tsk-02', taskCode: 'LIG-201', clientId: 'cli-02', clientName: 'Ligrow Hub - Infraestructura', taskName: 'Despliegue y prueba en Vercel', owner: 'Jesús', status: 'En curso', priority: 'Alta', taskType: 'Puntual', category: 'Desarrollo', dueDate: '2026-09-05', description: 'Verificar despliegue continuo en Vercel preview.', subtasks: [{ id: 'sub-3', title: 'Configurar vercel.json', completed: true }, { id: 'sub-4', title: 'Prueba preview URL', completed: true }], tags: ['Vercel', 'DevOps'], attachments: [{ name: 'Vercel_Config.json', url: '#' }] },
  { id: 'tsk-03', taskCode: 'PIC-102', clientId: 'cli-01', clientName: 'Pic Negre - Campaña Invierno', taskName: 'Configuración Pixel Meta y TikTok Ads', owner: 'Alejandro', status: 'Detenido', priority: 'Media', taskType: 'Puntual', category: 'Analytics', dueDate: '2026-09-08', description: 'Pendiente acceso a la cuenta publicitaria.', subtasks: [], tags: ['Pixel', 'Paid Media'], attachments: [] },
  { id: 'tsk-04', taskCode: 'AND-301', clientId: 'cli-03', clientName: 'Andorra Ecommerce - Rediseño', taskName: 'Aprobación Wireframes UX/UI Mobile', owner: 'Blanca', status: 'Listo', priority: 'Media', taskType: 'Puntual', category: 'Diseño', dueDate: '2026-09-04', description: 'Diseños aceptados por cliente.', subtasks: [{ id: 'sub-5', title: 'Figma prototype', completed: true }], tags: ['Figma', 'UI/UX'], attachments: [] }
];

const INDEX_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ligrow Tasks · Personal & Project Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=17.0" />
</head>
<body>
  <div id="app"></div>
  <script src="/app-v3.js?v=17.0"></script>
</body>
</html>`;

module.exports = function handler(req, res) {
  res.statusCode = 200;
  const url = req.url || '';

  if (url.includes('/api/health') || url.includes('/health')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ status: 'running', app: 'Ligrow Tasks API' }));
  }

  if (url.includes('/api/clients') || url.includes('/clients')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(SEED_CLIENTS));
  }

  if (url.includes('/api/tasks') || url.includes('/tasks')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(SEED_TASKS));
  }

  if (url.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify([]));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(INDEX_HTML);
};
