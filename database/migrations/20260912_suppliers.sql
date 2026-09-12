-- Directorio de proveedores: categorías, fichas, tarifas y notas libres.
-- Ejecutar una vez en el proyecto de Supabase asociado a Ligrow Tasks.

begin;

create table if not exists supplier_categories (
  id uuid primary key,
  name text not null check (char_length(name) <= 120),
  icon text not null default '📁' check (char_length(icon) <= 16),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists suppliers (
  id uuid primary key,
  category_id uuid not null references supplier_categories(id) on delete cascade,
  name text not null check (char_length(name) <= 180),
  supplier_type text not null default '',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  payment_terms text not null default '',
  lead_time text not null default '',
  rates jsonb not null default '[]'::jsonb check (jsonb_typeof(rates) = 'array'),
  product_list text not null default '',
  highlight_note text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_categories_position_idx
  on supplier_categories (position, created_at);

create index if not exists suppliers_category_position_idx
  on suppliers (category_id, position, created_at);


-- Seed the directory currently shown in the preview. Existing data is never overwritten.
insert into supplier_categories (id, name, icon, position) values
  ('3d5c8b9e-cc8d-4e1a-92de-001000000001', 'Impresión', '🖨️', 1),
  ('3d5c8b9e-cc8d-4e1a-92de-001000000002', 'Diseño', '🎨', 2),
  ('3d5c8b9e-cc8d-4e1a-92de-001000000003', 'Desarrollo', '💻', 3),
  ('3d5c8b9e-cc8d-4e1a-92de-001000000004', 'Fotografía', '📷', 4)
on conflict (id) do nothing;

insert into suppliers (
  id, category_id, name, supplier_type, email, phone, website, payment_terms, lead_time,
  rates, product_list, highlight_note, position
) values
  (
    '3d5c8b9e-cc8d-4e1a-92de-001000000101', '3d5c8b9e-cc8d-4e1a-92de-001000000001',
    'PrintOnDemand BCN', 'Imprenta digital', 'info@printondemand.es', '+34 93 123 45 67',
    'https://printondemand.es', 'Tarjeta / Transferencia', '3–5 días laborables',
    '[{"prod":"Flyer A5 / 2 caras","qty":"500 uds","price":"€38"},{"prod":"Flyer A5 / 2 caras","qty":"1.000 uds","price":"€55"},{"prod":"Díptico A4","qty":"500 uds","price":"€72"},{"prod":"Tarjeta 9×5 cm","qty":"500 uds","price":"€29"}]'::jsonb,
    '', '', 1
  ),
  (
    '3d5c8b9e-cc8d-4e1a-92de-001000000102', '3d5c8b9e-cc8d-4e1a-92de-001000000001',
    'Grafisant', 'Imprenta offset + gran formato', 'ventas@grafisant.com', '+34 93 987 65 43',
    '', '30 días / Contado −5%', '5–8 días laborables',
    '[{"prod":"Banner lona 150×60","qty":"1 ud","price":"€45"},{"prod":"Roll-up 85×200","qty":"1 ud","price":"€89"},{"prod":"Catálogo A4 12 pág","qty":"200 uds","price":"€210"}]'::jsonb,
    '', '', 2
  ),
  (
    '3d5c8b9e-cc8d-4e1a-92de-001000000103', '3d5c8b9e-cc8d-4e1a-92de-001000000001',
    'Vistaprint', 'Online · Pequeñas tiradas', '', '', 'https://vistaprint.es',
    'Tarjeta online', '5–10 días',
    '[{"prod":"Tarjeta premium","qty":"250 uds","price":"€19"},{"prod":"Flyer A6","qty":"500 uds","price":"€32"}]'::jsonb,
    '', '', 3
  ),
  (
    '3d5c8b9e-cc8d-4e1a-92de-001000000201', '3d5c8b9e-cc8d-4e1a-92de-001000000002',
    'Estudi Forma', 'Agencia diseño gráfico', 'hola@estudiform.es', '', '',
    '', '', '[{"prod":"Identidad corporativa","qty":"completa","price":"€1.200"},{"prod":"Diseño flyer","qty":"1 cara","price":"€180"},{"prod":"Diseño díptico","qty":"2 caras","price":"€280"}]'::jsonb,
    'Tarifa: €65 / hora\nMínimo: 8 horas', '', 1
  ),
  (
    '3d5c8b9e-cc8d-4e1a-92de-001000000202', '3d5c8b9e-cc8d-4e1a-92de-001000000002',
    'María G. — Freelance', 'Diseñadora independiente', 'mg.design@gmail.com', '+34 612 345 678', '',
    '', '', '[{"prod":"Pack 10 posts Instagram","qty":"","price":"€150"},{"prod":"Portada newsletter","qty":"","price":"€60"}]'::jsonb,
    'Tarifa: €40 / hora\nEspecialidad: Social media · Branding', '', 2
  ),
  (
    '3d5c8b9e-cc8d-4e1a-92de-001000000301', '3d5c8b9e-cc8d-4e1a-92de-001000000003',
    'TechCraft Studio', 'Agencia desarrollo web', 'hello@techcraft.io', '', '',
    '', '', '[{"prod":"Landing page","qty":"","price":"desde €800"},{"prod":"Ecommerce Shopify","qty":"","price":"desde €2.500"},{"prod":"Integración API","qty":"","price":"desde €400"}]'::jsonb,
    'Tarifa: €85 / hora\nStack: React · Node.js · Shopify', '', 1
  ),
  (
    '3d5c8b9e-cc8d-4e1a-92de-001000000302', '3d5c8b9e-cc8d-4e1a-92de-001000000003',
    'Carlos M. — Freelance', 'Desarrollador Shopify', 'carlos@dev.me', '', '',
    '', '', '[{"prod":"Custom theme","qty":"","price":"€600–1.200"},{"prod":"App integration","qty":"","price":"€200–500"}]'::jsonb,
    'Tarifa: €50 / hora\nEspecialidad: Shopify Plus · Liquid', '', 2
  ),
  (
    '3d5c8b9e-cc8d-4e1a-92de-001000000401', '3d5c8b9e-cc8d-4e1a-92de-001000000004',
    'Laia Fotografia', 'Producto & lifestyle', 'info@laiafoto.es', '+34 655 432 100',
    'https://laiafoto.es', '', '',
    '[{"prod":"Sesión producto ½ día","qty":"hasta 30 productos","price":"€350"},{"prod":"Sesión lifestyle 1 día","qty":"","price":"€750"},{"prod":"Retoque fotográfico","qty":"por imagen","price":"€8"}]'::jsonb,
    '', '', 1
  )
on conflict (id) do nothing;

commit;
