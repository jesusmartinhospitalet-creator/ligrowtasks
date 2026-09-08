-- ═══════════════════════════════════════════════════════════════
-- LIGROW TASKS — SEED DATA ENRIQUECIDO
-- Proyectos Personales + Proyectos Cliente + Tareas + Subtareas + Tags
-- ═══════════════════════════════════════════════════════════════

-- ── CLIENTES & PROYECTOS ─────────────────────────────────────────
INSERT INTO clients (id, name, code, concept, summary, kickoff_date, category, status, color_accent, progress_pct, created_at, updated_at) VALUES
  -- PROYECTOS PERSONALES
  ('c1000000-0000-0000-0000-000000000010',
   'AI Assistant Hub', 'AIHUB', 'Plataforma personal de productividad con IA',
   'Desarrollo de centro de control personal con integración de agentes LLM, automatizaciones y cuadro de mando personal.',
   '2026-05-01', 'personal', 'activo', '#6366f1', 65, NOW(), NOW()),

  ('c1000000-0000-0000-0000-000000000011',
   'Salud & Biohacking 2026', 'HEALTH', 'Plan integral de salud, nutrición y entrenamiento',
   'Monitoreo de rutinas de fuerza, preparación de maratón y optimización de sueño y métricas biométricas.',
   '2026-01-01', 'personal', 'activo', '#10b981', 80, NOW(), NOW()),

  ('c1000000-0000-0000-0000-000000000012',
   'Finanzas & Inversión', 'FIN', 'Gestión de cartera y presupuestos personales',
   'Revisión mensual de patrimonio, seguimiento de carteras indexadas e inversiones inmobiliarias.',
   '2026-01-15', 'personal', 'activo', '#f59e0b', 50, NOW(), NOW()),

  -- PROYECTOS / CLIENTES PROFESIONALES
  ('c1000000-0000-0000-0000-000000000001',
   'Kōa Studio', 'KOA', 'Diseño de marca y web',
   'Rediseño completo de identidad visual y sitio web para agencia de diseño emergente en Barcelona.',
   '2026-01-10', 'cliente', 'activo', '#8b5cf6', 75, NOW(), NOW()),

  ('c1000000-0000-0000-0000-000000000002',
   'Módulo Norte', 'MNOR', 'Marketing digital y generación de leads',
   'Estrategia de captación de leads mediante Google Ads, contenido y CRO para promotora inmobiliaria.',
   '2026-02-15', 'cliente', 'activo', '#06b6d4', 40, NOW(), NOW()),

  ('c1000000-0000-0000-0000-000000000003',
   'Tartaleta', 'TART', 'Branding, redes sociales y email marketing',
   'Gestión de imagen de marca y comunicación digital para cadena de pastelerías artesanales en Madrid y Valencia.',
   '2026-03-01', 'cliente', 'activo', '#ec4899', 90, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── PLANTILLAS ──────────────────────────────────────────────────
INSERT INTO templates (id, client_id, template_name, owner, priority, status_default, due_day, is_active, description, created_at, updated_at) VALUES
  ('f2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Revisión de contenido web', 'Blanca', 'Alta', 'En curso', 5, true,
   'Revisión y actualización de textos, imágenes y páginas del sitio. Verificar enlaces, CTAs y velocidad.', NOW(), NOW()),
  ('f2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
   'Reporte mensual SEO', 'Jesús', 'Media', 'En curso', 10, true,
   'Análisis de posicionamiento, evolución de keywords, backlinks y propuestas de mejora.', NOW(), NOW()),
  ('f2000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002',
   'Optimización campañas Google Ads', 'Alejandro', 'Alta', 'En curso', 3, true,
   'Revisión de rendimiento, ajuste de pujas, actualización de copys y negativos.', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── MESES ───────────────────────────────────────────────────────
INSERT INTO client_months (id, client_id, task_month, month_status, generated_at, closed_at, created_at, updated_at) VALUES
  ('m3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '2026-05', 'cerrado', '2026-05-01 09:00:00+00', '2026-06-01 09:00:00+00', NOW(), NOW()),
  ('m3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', '2026-06', 'abierto', '2026-06-01 09:00:00+00', NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── TAREAS ──────────────────────────────────────────────────────
INSERT INTO tasks (id, task_code, client_id, task_name, owner, status, priority, task_type, category,
  task_month, month_status, template_id, due_date, start_date, end_date, description, subtasks_json, tags_json, attachments_json, created_at, updated_at)
VALUES

-- ────────────────── TAREAS PERSONALES ──────────────────────────
('ta100000-0000-0000-0000-000000000001', 'AIHUB-001', 'c1000000-0000-0000-0000-000000000010',
 'Diseñar Dashboard Principal con métricas clave', 'Jesús', 'En curso', 'Alta', 'puntual', 'personal',
 NULL, NULL, NULL, '2026-09-08', '2026-09-05', NULL,
 'Construir el centro de mando unificado con selector de espacio de trabajo, vista Kanban y resumen visual.',
 '[{"id":"s1","text":"Crear maquetación responsiva con CSS Grid","completed":true},{"id":"s2","text":"Conectar API de estadísticas generales","completed":true},{"id":"s3","text":"Implementar vista de Calendario","completed":false}]'::jsonb,
 '["#ai", "#dev", "#personal"]'::jsonb, '[]'::jsonb, NOW(), NOW()),

('ta100000-0000-0000-0000-000000000002', 'HEALTH-001', 'c1000000-0000-0000-0000-000000000011',
 'Planificación de tiradas largas de entrenamiento maratón', 'Jesús', 'En curso', 'Media', 'puntual', 'personal',
 NULL, NULL, NULL, '2026-09-12', '2026-09-06', NULL,
 'Definir ritmo objetivo de 4:45/km y suplementación de geles de glucógeno.',
 '[{"id":"s1","text":"Comprar geles glucógeno","completed":true},{"id":"s2","text":"Verificar zapatillas de entrenamiento","completed":false}]'::jsonb,
 '["#salud", "#running", "#maraton"]'::jsonb, '[]'::jsonb, NOW(), NOW()),

('ta100000-0000-0000-0000-000000000003', 'FIN-001', 'c1000000-0000-0000-0000-000000000012',
 'Rebalanceo de cartera de inversión Q3', 'Jesús', 'Listo', 'Alta', 'puntual', 'personal',
 NULL, NULL, NULL, '2026-09-02', '2026-08-28', '2026-09-02',
 'Revisar desviación de pesos en fondos indexados globales y renta fija.',
 '[{"id":"s1","text":"Calcular desviaciones por activo","completed":true},{"id":"s2","text":"Ejecutar orden de aportación","completed":true}]'::jsonb,
 '["#finanzas", "#inversión"]'::jsonb, '[]'::jsonb, NOW(), NOW()),

-- ────────────────── TAREAS DE CLIENTES / TRABAJO ───────────────
('ta010000-0000-0000-0000-000000000004', 'KOA-004', 'c1000000-0000-0000-0000-000000000001',
 'Revisión de contenido web Kōa Studio', 'Blanca', 'En curso', 'Alta', 'mensual', 'trabajo',
 '2026-06', 'abierto', 'f2000000-0000-0000-0000-000000000001', '2026-09-10', '2026-09-02', NULL,
 'Actualizar sección de servicios y añadir dos nuevos casos de éxito Q1-Q2.',
 '[{"id":"s1","text":"Revisar textos de copy","completed":true},{"id":"s2","text":"Subir capturas de pantalla de proyectos","completed":false}]'::jsonb,
 '["#web", "#branding"]'::jsonb, '[]'::jsonb, NOW(), NOW()),

('ta020000-0000-0000-0000-000000000004', 'MNOR-004', 'c1000000-0000-0000-0000-000000000002',
 'Optimización campañas Google Ads Módulo Norte', 'Alejandro', 'Listo', 'Alta', 'mensual', 'trabajo',
 '2026-06', 'abierto', 'f2000000-0000-0000-0000-000000000004', '2026-09-04', '2026-09-01', '2026-09-04',
 'Campañas ajustadas para promociones inmobiliarias. Budget óptimo.',
 '[{"id":"s1","text":"Ajustar palabras clave negativas","completed":true},{"id":"s2","text":"Revisar conversiones","completed":true}]'::jsonb,
 '["#ads", "#leads"]'::jsonb, '[]'::jsonb, NOW(), NOW())

ON CONFLICT (id) DO NOTHING;

-- ── COMENTARIOS ─────────────────────────────────────────────────
INSERT INTO comments (id, task_id, author, text, created_at) VALUES
  ('com10000-0000-0000-0000-000000000001', 'ta100000-0000-0000-0000-000000000001', 'Jesús', 'Diseño de la estructura inicial completado. Continuando con los endpoints backend.', NOW() - INTERVAL '2 days'),
  ('com10000-0000-0000-0000-000000000002', 'ta100000-0000-0000-0000-000000000001', 'Blanca', 'Me encanta el enfoque visual con Space Grotesk. Recomiendo agregar el filtro por etiqueta.', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;
