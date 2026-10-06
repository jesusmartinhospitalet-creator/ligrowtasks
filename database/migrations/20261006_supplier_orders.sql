-- Migración: Tabla de pedidos a proveedores con soporte para fecha, importe, estado y archivos adjuntos (PDF, JPG, PNG)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run

begin;

-- Habilitar extensión UUID si no está activa
create extension if not exists "pgcrypto";

create table if not exists supplier_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text not null check (char_length(supplier_name) <= 180),
  category_name text not null default '',
  concept text not null check (char_length(concept) <= 300),
  order_date date not null default current_date,
  total_amount numeric(12,2) not null default 0.00,
  status text not null default 'Pagado', -- 'Pagado', 'Pendiente', 'En producción', 'Recibido'
  invoice_number text not null default '',
  notes text not null default '',
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_orders_date_idx on supplier_orders (order_date desc, created_at desc);
create index if not exists supplier_orders_supplier_idx on supplier_orders (supplier_name);
create index if not exists supplier_orders_status_idx on supplier_orders (status);

-- Seed de pedidos iniciales para demostración (supplier_id = null para evitar conflictos de claves foráneas)
insert into supplier_orders (
  id, supplier_id, supplier_name, category_name, concept, order_date, total_amount, status, invoice_number, notes, files
) values
  (
    '4a1e9b20-cc8d-4e1a-92de-002000000001',
    null,
    'PrintOnDemand BCN',
    'Impresión',
    '500 Flyers A5 doble cara estucado mate 350g',
    '2026-03-24',
    38.00,
    'Pagado',
    'FAC-2026-0042',
    'Entrega completada en tiempo y forma. Excelente calidad de corte.',
    '[{"id":"f1","name":"Factura_FAC-2026-0042.pdf","type":"application/pdf","size":124500,"url":""},{"id":"f2","name":"Muestra_Flyer_A5.jpg","type":"image/jpeg","size":248000,"url":""}]'::jsonb
  ),
  (
    '4a1e9b20-cc8d-4e1a-92de-002000000002',
    null,
    'Grafisant',
    'Impresión',
    '2 Roll-ups 85×200 con estructura de aluminio y funda de transporte',
    '2026-03-15',
    178.00,
    'Pagado',
    'ALB-98124',
    'Material corporativo para ferias y stands de clientes.',
    '[{"id":"f3","name":"Diseno_Rollup_85x200.jpg","type":"image/jpeg","size":389000,"url":""}]'::jsonb
  ),
  (
    '4a1e9b20-cc8d-4e1a-92de-002000000003',
    null,
    'Estudi Forma',
    'Diseño',
    'Manual de identidad corporativa y adaptaciones web',
    '2026-02-28',
    1200.00,
    'Recibido',
    'EF-2026-08',
    'Incluye paleta cromática, tipografías corporativas y guía de estilo.',
    '[{"id":"f4","name":"Manual_Identidad_Ligrow.pdf","type":"application/pdf","size":450000,"url":""}]'::jsonb
  )
on conflict (id) do nothing;

commit;
