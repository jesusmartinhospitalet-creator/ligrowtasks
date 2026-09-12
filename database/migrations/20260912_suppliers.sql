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

commit;
