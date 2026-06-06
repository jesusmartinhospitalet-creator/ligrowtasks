-- ═══════════════════════════════════════════════════════════════
-- LIGROW TASKS — SEED DATA (ejecutar en Supabase SQL editor)
-- Idempotente: ON CONFLICT DO NOTHING, seguro para re-ejecutar
-- ═══════════════════════════════════════════════════════════════

-- ── CLIENTES ────────────────────────────────────────────────────
INSERT INTO clients (id, name, code, concept, summary, kickoff_date, created_at, updated_at) VALUES
  ('c1000000-0000-0000-0000-000000000001',
   'Kōa Studio', 'KOA', 'Diseño de marca y web',
   'Rediseño completo de identidad visual y sitio web para agencia de diseño emergente en Barcelona. Incluye branding, UX/UI y posicionamiento SEO.',
   '2026-01-10', NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000002',
   'Módulo Norte', 'MNOR', 'Marketing digital y generación de leads',
   'Estrategia de captación de leads mediante Google Ads, contenido y CRO para promotora inmobiliaria del norte de España.',
   '2026-02-15', NOW(), NOW()),
  ('c1000000-0000-0000-0000-000000000003',
   'Tartaleta', 'TART', 'Branding, redes sociales y email marketing',
   'Gestión de imagen de marca y comunicación digital para cadena de pastelerías artesanales con presencia en Madrid y Valencia.',
   '2026-03-01', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── PLANTILLAS ──────────────────────────────────────────────────

-- KŌA STUDIO
INSERT INTO templates (id, client_id, template_name, owner, priority, status_default, due_day, is_active, description, created_at, updated_at) VALUES
  ('f2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Revisión de contenido web', 'Blanca', 'Alta', 'En curso', 5, true,
   'Revisión y actualización de textos, imágenes y páginas del sitio. Verificar enlaces, CTAs y velocidad.', NOW(), NOW()),
  ('f2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
   'Reporte mensual SEO', 'Jesús', 'Media', 'En curso', 10, true,
   'Análisis de posicionamiento, evolución de keywords, backlinks y propuestas de mejora para el mes siguiente.', NOW(), NOW()),
  ('f2000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001',
   'Post para blog', 'Blanca', 'Baja', 'En curso', 20, true,
   'Redacción y publicación de artículo de blog optimizado para SEO (mín. 1.000 palabras). Incluye revisión.', NOW(), NOW()),

-- MÓDULO NORTE
  ('f2000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002',
   'Optimización campañas Google Ads', 'Alejandro', 'Alta', 'En curso', 3, true,
   'Revisión de rendimiento, ajuste de pujas, actualización de copys y negativos. Incluye informe de gasto.', NOW(), NOW()),
  ('f2000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000002',
   'Informe mensual de leads', 'Jesús', 'Alta', 'En curso', 8, true,
   'Reporte de leads generados, calidad, tasa de conversión y coste por lead del mes. Comparativa con mes anterior.', NOW(), NOW()),
  ('f2000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000002',
   'Contenido redes sociales', 'Blanca', 'Media', 'En curso', 15, true,
   'Planificación y publicación de 12 posts para Instagram y 8 para LinkedIn. Incluye diseño y copywriting.', NOW(), NOW()),

-- TARTALETA
  ('f2000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000003',
   'Contenido Instagram mensual', 'Blanca', 'Alta', 'En curso', 1, true,
   'Creación y programación de 20 posts para el feed + 30 stories. Diseño, copywriting y hashtags.', NOW(), NOW()),
  ('f2000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000003',
   'Newsletter mensual', 'Blanca', 'Media', 'En curso', 7, true,
   'Diseño y envío de newsletter con novedades, recetas del mes y promociones. Objetivo: >28% open rate.', NOW(), NOW()),
  ('f2000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000003',
   'Análisis de métricas', 'Jesús', 'Baja', 'En curso', 25, true,
   'Revisión de resultados de Instagram, email y web del mes anterior. Comparativa y recomendaciones.', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── MESES ───────────────────────────────────────────────────────
INSERT INTO client_months (id, client_id, task_month, month_status, generated_at, closed_at, created_at, updated_at) VALUES
  ('m3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '2026-05', 'cerrado', '2026-05-01 09:00:00+00', '2026-06-01 09:00:00+00', NOW(), NOW()),
  ('m3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', '2026-06', 'abierto', '2026-06-01 09:00:00+00', NULL, NOW(), NOW()),
  ('m3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', '2026-05', 'cerrado', '2026-05-01 09:00:00+00', '2026-06-01 09:00:00+00', NOW(), NOW()),
  ('m3000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', '2026-06', 'abierto', '2026-06-01 09:00:00+00', NULL, NOW(), NOW()),
  ('m3000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000003', '2026-05', 'cerrado', '2026-05-01 09:00:00+00', '2026-06-01 09:00:00+00', NOW(), NOW()),
  ('m3000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000003', '2026-06', 'abierto', '2026-06-01 09:00:00+00', NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── TAREAS ──────────────────────────────────────────────────────
INSERT INTO tasks (id, task_code, client_id, task_name, owner, status, priority, task_type,
  task_month, month_status, template_id, due_date, start_date, end_date, description, attachments_json, created_at, updated_at)
VALUES

-- ────────────────── KŌA STUDIO · MAYO 2026 (cerrado) ────────────
('ta010000-0000-0000-0000-000000000001', 'KOA-001', 'c1000000-0000-0000-0000-000000000001',
 'Revisión de contenido web', 'Blanca', 'Listo', 'Alta', 'mensual', '2026-05', 'cerrado',
 'f2000000-0000-0000-0000-000000000001', '2026-05-05', '2026-05-02', '2026-05-05',
 'Revisión completa de todas las páginas del sitio. Actualizados textos de servicios y casos de éxito.', '[]', '2026-05-01 08:00:00+00', '2026-05-05 17:00:00+00'),

('ta010000-0000-0000-0000-000000000002', 'KOA-002', 'c1000000-0000-0000-0000-000000000001',
 'Reporte mensual SEO', 'Jesús', 'Listo', 'Media', 'mensual', '2026-05', 'cerrado',
 'f2000000-0000-0000-0000-000000000002', '2026-05-10', '2026-05-08', '2026-05-10',
 'Análisis de mayo: +12% impresiones orgánicas, 3 nuevas keywords en top-10. Propuesta de mejora aprobada.', '[]', '2026-05-01 08:00:00+00', '2026-05-10 17:00:00+00'),

('ta010000-0000-0000-0000-000000000003', 'KOA-003', 'c1000000-0000-0000-0000-000000000001',
 'Post para blog', 'Blanca', 'Listo', 'Baja', 'mensual', '2026-05', 'cerrado',
 'f2000000-0000-0000-0000-000000000003', '2026-05-20', '2026-05-16', '2026-05-20',
 'Publicado: "5 tendencias de diseño web para 2026". 1.200 palabras. 340 visitas en el primer día.', '[]', '2026-05-01 08:00:00+00', '2026-05-20 17:00:00+00'),

-- ────────────────── KŌA STUDIO · JUNIO 2026 (abierto) ───────────
('ta010000-0000-0000-0000-000000000004', 'KOA-004', 'c1000000-0000-0000-0000-000000000001',
 'Revisión de contenido web', 'Blanca', 'En curso', 'Alta', 'mensual', '2026-06', 'abierto',
 'f2000000-0000-0000-0000-000000000001', '2026-06-05', '2026-06-02', NULL,
 'Pendiente: actualizar sección de servicios y añadir dos nuevos casos de éxito Q1-Q2.', '[]', '2026-06-01 08:00:00+00', NOW()),

('ta010000-0000-0000-0000-000000000005', 'KOA-005', 'c1000000-0000-0000-0000-000000000001',
 'Reporte mensual SEO', 'Jesús', 'En curso', 'Media', 'mensual', '2026-06', 'abierto',
 'f2000000-0000-0000-0000-000000000002', '2026-06-10', '2026-06-07', NULL,
 'Análisis en progreso. Tendencia positiva en keywords de marca. CTR mejorando.', '[]', '2026-06-01 08:00:00+00', NOW()),

('ta010000-0000-0000-0000-000000000006', 'KOA-006', 'c1000000-0000-0000-0000-000000000001',
 'Post para blog', 'Blanca', 'En curso', 'Baja', 'mensual', '2026-06', 'abierto',
 'f2000000-0000-0000-0000-000000000003', '2026-06-20', '2026-06-15', NULL,
 'Tema confirmado: "Cómo crear una identidad visual coherente en 6 pasos". Borrador al 40%.', '[]', '2026-06-01 08:00:00+00', NOW()),

('ta010000-0000-0000-0000-000000000007', 'KOA-007', 'c1000000-0000-0000-0000-000000000001',
 'Diseño landing page producto verano', 'Blanca', 'En curso', 'Alta', 'puntual', NULL, NULL,
 NULL, '2026-06-10', '2026-06-03', NULL,
 'Landing page colección de verano. Mobile-first. Incluye animaciones hover y formulario de contacto.', '[]', '2026-06-03 08:00:00+00', NOW()),

('ta010000-0000-0000-0000-000000000008', 'KOA-008', 'c1000000-0000-0000-0000-000000000001',
 'Presentación deck cliente Q3', 'Blanca', 'En curso', 'Media', 'puntual', NULL, NULL,
 NULL, '2026-06-12', '2026-06-08', NULL,
 'Deck de 15 slides: resultados Q1-Q2 vs. objetivos y propuesta de estrategia para Q3.', '[]', '2026-06-05 08:00:00+00', NOW()),

('ta010000-0000-0000-0000-000000000009', 'KOA-009', 'c1000000-0000-0000-0000-000000000001',
 'Revisión paleta colores temporada', 'Jesús', 'Detenido', 'Baja', 'puntual', NULL, NULL,
 NULL, '2026-06-20', '2026-06-10', NULL,
 'Esperando feedback del cliente sobre las 3 propuestas de paleta enviadas el 2 de junio.', '[]', '2026-06-05 08:00:00+00', NOW()),

-- ────────────────── MÓDULO NORTE · MAYO 2026 (cerrado) ──────────
('ta020000-0000-0000-0000-000000000001', 'MNOR-001', 'c1000000-0000-0000-0000-000000000002',
 'Optimización campañas Google Ads', 'Alejandro', 'Listo', 'Alta', 'mensual', '2026-05', 'cerrado',
 'f2000000-0000-0000-0000-000000000004', '2026-05-03', '2026-05-01', '2026-05-03',
 'CTR mejorado +18%. CPC reducido 12% respecto a abril. ROAS: 4,2x.', '[]', '2026-05-01 08:00:00+00', '2026-05-03 17:00:00+00'),

('ta020000-0000-0000-0000-000000000002', 'MNOR-002', 'c1000000-0000-0000-0000-000000000002',
 'Informe mensual de leads', 'Jesús', 'Listo', 'Alta', 'mensual', '2026-05', 'cerrado',
 'f2000000-0000-0000-0000-000000000005', '2026-05-08', '2026-05-06', '2026-05-08',
 '47 leads en mayo. CPL: €22. Tasa conversión formulario: 4,2%. +31% vs. abril.', '[]', '2026-05-01 08:00:00+00', '2026-05-08 17:00:00+00'),

('ta020000-0000-0000-0000-000000000003', 'MNOR-003', 'c1000000-0000-0000-0000-000000000002',
 'Contenido redes sociales', 'Blanca', 'Listo', 'Media', 'mensual', '2026-05', 'cerrado',
 'f2000000-0000-0000-0000-000000000006', '2026-05-15', '2026-05-10', '2026-05-15',
 '12 posts Instagram + 8 LinkedIn publicados. Reach orgánico: +22% vs. mes anterior.', '[]', '2026-05-01 08:00:00+00', '2026-05-15 17:00:00+00'),

-- ────────────────── MÓDULO NORTE · JUNIO 2026 (abierto) ─────────
('ta020000-0000-0000-0000-000000000004', 'MNOR-004', 'c1000000-0000-0000-0000-000000000002',
 'Optimización campañas Google Ads', 'Alejandro', 'Listo', 'Alta', 'mensual', '2026-06', 'abierto',
 'f2000000-0000-0000-0000-000000000004', '2026-06-03', '2026-06-01', '2026-06-03',
 'Campañas ajustadas para verano. Budget redistribuido hacia búsquedas de segunda residencia.', '[]', '2026-06-01 08:00:00+00', '2026-06-03 17:00:00+00'),

('ta020000-0000-0000-0000-000000000005', 'MNOR-005', 'c1000000-0000-0000-0000-000000000002',
 'Informe mensual de leads', 'Jesús', 'En curso', 'Alta', 'mensual', '2026-06', 'abierto',
 'f2000000-0000-0000-0000-000000000005', '2026-06-08', '2026-06-06', NULL,
 'Recopilando datos del CRM. Previsión de 55+ leads este mes. Pendiente de validar calidad.', '[]', '2026-06-01 08:00:00+00', NOW()),

('ta020000-0000-0000-0000-000000000006', 'MNOR-006', 'c1000000-0000-0000-0000-000000000002',
 'Contenido redes sociales', 'Blanca', 'En curso', 'Media', 'mensual', '2026-06', 'abierto',
 'f2000000-0000-0000-0000-000000000006', '2026-06-15', '2026-06-08', NULL,
 'Diseños en Canva listos. Pendiente aprobación de textos por el cliente.', '[]', '2026-06-01 08:00:00+00', NOW()),

('ta020000-0000-0000-0000-000000000007', 'MNOR-007', 'c1000000-0000-0000-0000-000000000002',
 'Setup píxel Facebook e Instagram', 'Alejandro', 'En curso', 'Alta', 'puntual', NULL, NULL,
 NULL, '2026-06-08', '2026-06-05', NULL,
 'Implementar Meta Pixel en web y configurar eventos: vista de producto, solicitud de contacto y conversión.', '[]', '2026-06-04 08:00:00+00', NOW()),

('ta020000-0000-0000-0000-000000000008', 'MNOR-008', 'c1000000-0000-0000-0000-000000000002',
 'Auditoría web competencia', 'Jesús', 'En curso', 'Media', 'puntual', NULL, NULL,
 NULL, '2026-06-11', '2026-06-08', NULL,
 'Análisis de las 5 principales promotoras: SEO, UX, precios, propuesta de valor y lead gen.', '[]', '2026-06-05 08:00:00+00', NOW()),

('ta020000-0000-0000-0000-000000000009', 'MNOR-009', 'c1000000-0000-0000-0000-000000000002',
 'Vídeo presentación proyectos', 'Alejandro', 'Detenido', 'Media', 'puntual', NULL, NULL,
 NULL, '2026-06-25', '2026-06-15', NULL,
 'Pendiente confirmación de fecha de rodaje. Necesitamos acceso a los pisos en construcción de Bilbao.', '[]', '2026-06-04 08:00:00+00', NOW()),

-- ────────────────── TARTALETA · MAYO 2026 (cerrado) ─────────────
('ta030000-0000-0000-0000-000000000001', 'TART-001', 'c1000000-0000-0000-0000-000000000003',
 'Contenido Instagram mensual', 'Blanca', 'Listo', 'Alta', 'mensual', '2026-05', 'cerrado',
 'f2000000-0000-0000-0000-000000000007', '2026-05-01', '2026-04-28', '2026-05-01',
 '20 posts + 30 stories programados. Engagement rate: 7,2%. +450 seguidores en el mes.', '[]', '2026-05-01 08:00:00+00', '2026-05-01 17:00:00+00'),

('ta030000-0000-0000-0000-000000000002', 'TART-002', 'c1000000-0000-0000-0000-000000000003',
 'Newsletter mensual', 'Blanca', 'Listo', 'Media', 'mensual', '2026-05', 'cerrado',
 'f2000000-0000-0000-0000-000000000008', '2026-05-07', '2026-05-05', '2026-05-07',
 'Newsletter de mayo enviado a 3.800 suscriptores. Open rate: 31%. CTR: 5,8%.', '[]', '2026-05-01 08:00:00+00', '2026-05-07 17:00:00+00'),

('ta030000-0000-0000-0000-000000000003', 'TART-003', 'c1000000-0000-0000-0000-000000000003',
 'Análisis de métricas', 'Jesús', 'Listo', 'Baja', 'mensual', '2026-05', 'cerrado',
 'f2000000-0000-0000-0000-000000000009', '2026-05-25', '2026-05-23', '2026-05-25',
 'Informe abril entregado. Instagram +15% seguidores. Web: 2.400 sesiones, -8% rebote.', '[]', '2026-05-01 08:00:00+00', '2026-05-25 17:00:00+00'),

-- ────────────────── TARTALETA · JUNIO 2026 (abierto) ────────────
('ta030000-0000-0000-0000-000000000004', 'TART-004', 'c1000000-0000-0000-0000-000000000003',
 'Contenido Instagram mensual', 'Blanca', 'Listo', 'Alta', 'mensual', '2026-06', 'abierto',
 'f2000000-0000-0000-0000-000000000007', '2026-06-01', '2026-05-28', '2026-06-01',
 'Grid de junio programado. Temática: verano y strawberry season. Todo publicado.', '[]', '2026-06-01 08:00:00+00', '2026-06-01 17:00:00+00'),

('ta030000-0000-0000-0000-000000000005', 'TART-005', 'c1000000-0000-0000-0000-000000000003',
 'Newsletter junio', 'Blanca', 'En curso', 'Alta', 'mensual', '2026-06', 'abierto',
 'f2000000-0000-0000-0000-000000000008', '2026-06-07', '2026-06-05', NULL,
 'Temática "Verano en Tartaleta". Incluir promo 2x1 tartaletas de fruta y preview carta verano.', '[]', '2026-06-01 08:00:00+00', NOW()),

('ta030000-0000-0000-0000-000000000006', 'TART-006', 'c1000000-0000-0000-0000-000000000003',
 'Análisis de métricas', 'Jesús', 'En curso', 'Baja', 'mensual', '2026-06', 'abierto',
 'f2000000-0000-0000-0000-000000000009', '2026-06-25', '2026-06-23', NULL,
 'Esperando a que cierre el mes para tener datos completos de junio.', '[]', '2026-06-01 08:00:00+00', NOW()),

('ta030000-0000-0000-0000-000000000007', 'TART-007', 'c1000000-0000-0000-0000-000000000003',
 'Sesión fotos producto verano', 'Blanca', 'En curso', 'Alta', 'puntual', NULL, NULL,
 NULL, '2026-06-09', '2026-06-06', NULL,
 'Sesión fotográfica colección verano: tartaletas de frutas, helados artesanales y packaging nuevo. Estudio Barceloneta.', '[]', '2026-06-04 08:00:00+00', NOW()),

('ta030000-0000-0000-0000-000000000008', 'TART-008', 'c1000000-0000-0000-0000-000000000003',
 'Redacción copy carta verano', 'Blanca', 'En curso', 'Media', 'puntual', NULL, NULL,
 NULL, '2026-06-07', '2026-06-05', NULL,
 'Copywriting de la nueva carta de verano: 22 productos, alérgenos, claims de diferenciación y sugerencias del chef.', '[]', '2026-06-04 08:00:00+00', NOW()),

('ta030000-0000-0000-0000-000000000009', 'TART-009', 'c1000000-0000-0000-0000-000000000003',
 'Lanzamiento campaña fidelización', 'Jesús', 'En curso', 'Alta', 'puntual', NULL, NULL,
 NULL, '2026-06-15', '2026-06-10', NULL,
 'Setup "Tarjeta Tartaleta": segmentación, mecánica de puntos, email automation y landing page de registro.', '[]', '2026-06-04 08:00:00+00', NOW())

ON CONFLICT (id) DO NOTHING;
