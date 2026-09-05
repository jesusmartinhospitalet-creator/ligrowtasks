// In-memory fallback database when DATABASE_URL is missing or PostgreSQL is unreachable
const { randomUUID: uuidv4 } = require('crypto');

const memoryStore = {
  clients: [
    {
      id: 'c1000000-0000-0000-0000-000000000010',
      name: 'AI Assistant Hub',
      code: 'AIHUB',
      concept: 'Plataforma personal de productividad con IA',
      summary: 'Desarrollo de centro de control personal con integración de agentes LLM y automatizaciones.',
      kickoff_date: '2026-05-01',
      category: 'personal',
      status: 'activo',
      color_accent: '#6366f1',
      progress_pct: 65,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'c1000000-0000-0000-0000-000000000011',
      name: 'Salud & Biohacking 2026',
      code: 'HEALTH',
      concept: 'Plan integral de salud, nutrición y entrenamiento',
      summary: 'Monitoreo de rutinas de fuerza, preparación de maratón y optimización de sueño y métricas.',
      kickoff_date: '2026-01-01',
      category: 'personal',
      status: 'activo',
      color_accent: '#10b981',
      progress_pct: 80,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'c1000000-0000-0000-0000-000000000012',
      name: 'Finanzas & Inversión',
      code: 'FIN',
      concept: 'Gestión de cartera y presupuestos personales',
      summary: 'Revisión mensual de patrimonio, seguimiento de carteras indexadas e inversiones.',
      kickoff_date: '2026-01-15',
      category: 'personal',
      status: 'activo',
      color_accent: '#f59e0b',
      progress_pct: 50,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'c1000000-0000-0000-0000-000000000001',
      name: 'Kōa Studio',
      code: 'KOA',
      concept: 'Diseño de marca y web',
      summary: 'Rediseño completo de identidad visual y sitio web para agencia de diseño.',
      kickoff_date: '2026-01-10',
      category: 'cliente',
      status: 'activo',
      color_accent: '#8b5cf6',
      progress_pct: 75,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'c1000000-0000-0000-0000-000000000002',
      name: 'Módulo Norte',
      code: 'MNOR',
      concept: 'Marketing digital y generación de leads',
      summary: 'Estrategia de captación de leads mediante Google Ads, contenido y CRO para promotora.',
      kickoff_date: '2026-02-15',
      category: 'cliente',
      status: 'activo',
      color_accent: '#06b6d4',
      progress_pct: 40,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  tasks: [
    {
      id: 'ta100000-0000-0000-0000-000000000001',
      task_code: 'AIHUB-001',
      client_id: 'c1000000-0000-0000-0000-000000000010',
      task_name: 'Diseñar Dashboard Principal con métricas clave',
      owner: 'Jesús',
      status: 'En curso',
      priority: 'Alta',
      task_type: 'puntual',
      category: 'personal',
      due_date: '2026-09-08',
      start_date: '2026-09-05',
      description: 'Construir el centro de mando unificado con selector de espacio de trabajo, vista Kanban y resumen visual.',
      subtasks_json: JSON.stringify([
        { id: 's1', text: 'Crear maquetación responsiva con CSS Grid', completed: true },
        { id: 's2', text: 'Conectar API de estadísticas generales', completed: true },
        { id: 's3', text: 'Implementar vista de Calendario', completed: false }
      ]),
      tags_json: JSON.stringify(['#ai', '#dev', '#personal']),
      attachments_json: JSON.stringify([]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'ta100000-0000-0000-0000-000000000002',
      task_code: 'HEALTH-001',
      client_id: 'c1000000-0000-0000-0000-000000000011',
      task_name: 'Planificación de tiradas largas de entrenamiento maratón',
      owner: 'Jesús',
      status: 'En curso',
      priority: 'Media',
      task_type: 'puntual',
      category: 'personal',
      due_date: '2026-09-12',
      start_date: '2026-09-06',
      description: 'Definir ritmo objetivo de 4:45/km y suplementación de geles de glucógeno.',
      subtasks_json: JSON.stringify([
        { id: 's1', text: 'Comprar geles glucógeno', completed: true },
        { id: 's2', text: 'Verificar zapatillas de entrenamiento', completed: false }
      ]),
      tags_json: JSON.stringify(['#salud', '#running', '#maraton']),
      attachments_json: JSON.stringify([]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'ta100000-0000-0000-0000-000000000003',
      task_code: 'FIN-001',
      client_id: 'c1000000-0000-0000-0000-000000000012',
      task_name: 'Rebalanceo de cartera de inversión Q3',
      owner: 'Jesús',
      status: 'Listo',
      priority: 'Alta',
      task_type: 'puntual',
      category: 'personal',
      due_date: '2026-09-02',
      start_date: '2026-08-28',
      end_date: '2026-09-02',
      description: 'Revisar desviación de pesos en fondos indexados globales y renta fija.',
      subtasks_json: JSON.stringify([
        { id: 's1', text: 'Calcular desviaciones por activo', completed: true },
        { id: 's2', text: 'Ejecutar orden de aportación', completed: true }
      ]),
      tags_json: JSON.stringify(['#finanzas', '#inversión']),
      attachments_json: JSON.stringify([]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'ta010000-0000-0000-0000-000000000004',
      task_code: 'KOA-004',
      client_id: 'c1000000-0000-0000-0000-000000000001',
      task_name: 'Revisión de contenido web Kōa Studio',
      owner: 'Blanca',
      status: 'En curso',
      priority: 'Alta',
      task_type: 'mensual',
      category: 'trabajo',
      task_month: '2026-06',
      due_date: '2026-09-10',
      start_date: '2026-09-02',
      description: 'Actualizar sección de servicios y añadir dos nuevos casos de éxito Q1-Q2.',
      subtasks_json: JSON.stringify([
        { id: 's1', text: 'Revisar textos de copy', completed: true },
        { id: 's2', text: 'Subir capturas de pantalla de proyectos', completed: false }
      ]),
      tags_json: JSON.stringify(['#web', '#branding']),
      attachments_json: JSON.stringify([]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  templates: [],
  client_months: [],
  comments: [
    {
      id: 'com10000-0000-0000-0000-000000000001',
      task_id: 'ta100000-0000-0000-0000-000000000001',
      author: 'Jesús',
      text: 'Diseño de la estructura inicial completado. Continuando con los endpoints backend.',
      created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    }
  ]
};

module.exports = memoryStore;
