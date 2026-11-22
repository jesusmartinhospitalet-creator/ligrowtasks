-- Migración: facturación emitida (clientes de facturación, ajustes del emisor y facturas)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
--
-- Las tres tablas las lee y escribe SOLO el servidor (clave de servicio). Se activa RLS sin políticas para que
-- la clave pública (anon) no pueda leer ni modificar nada; la clave de servicio ignora RLS.
-- Cada factura guarda una COPIA de los datos del emisor y del cliente en el momento de emitirla
-- (obligatorio fiscalmente: cambiar un cliente después no altera las facturas ya emitidas).

begin;

-- 1. Ajustes del emisor (una sola fila)
create table if not exists invoice_settings (
  id text primary key default 'default' check (id = 'default'),
  company_name text not null default '',
  tax_id text not null default '',
  tax_id_label text not null default 'NIF',        -- texto que se imprime: NIF, DNI, CIF…
  address text not null default '',
  postal_code text not null default '',
  city text not null default '',
  country text not null default 'España',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  iban text not null default '',
  bank_name text not null default '',
  series text not null default '',                  -- vacío = numeración simple (104, 105…)
  start_number integer not null default 1 check (start_number >= 1),
  default_vat_rate numeric(5,2) not null default 21 check (default_vat_rate between 0 and 100),
  default_irpf_rate numeric(5,2) not null default 0 check (default_irpf_rate between 0 and 60),
  payment_days integer not null default 30 check (payment_days between 0 and 365),
  payment_method text not null default 'Transferencia bancaria',
  footer_note text not null default '',
  invoice_language text not null default 'ca' check (invoice_language in ('ca', 'es')),
  updated_at timestamptz not null default now()
);

-- 2. Clientes de facturación
create table if not exists invoice_customers (
  id text primary key check (char_length(id) between 1 and 60),
  name text not null check (char_length(name) between 1 and 200),
  tax_id text not null default '',
  address text not null default '',
  postal_code text not null default '',
  city text not null default '',
  province text not null default '',
  country text not null default 'España',
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoice_customers_tax_id_idx on invoice_customers (lower(tax_id));
create index if not exists invoice_customers_name_idx on invoice_customers (lower(name));

-- 3. Facturas
create table if not exists invoices (
  id text primary key check (char_length(id) between 1 and 60),
  number text not null check (char_length(number) between 1 and 40),
  series text not null default '',
  status text not null default 'emitida' check (status in ('borrador', 'emitida', 'cobrada', 'anulada')),
  issue_date date not null,
  due_date date,
  paid_date date,
  customer_id text references invoice_customers(id) on delete set null,
  customer jsonb not null,                          -- copia de los datos del cliente al emitir
  issuer jsonb not null,                            -- copia de los datos del emisor al emitir
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  vat_rate numeric(5,2) not null default 21 check (vat_rate between 0 and 100),
  irpf_rate numeric(5,2) not null default 0 check (irpf_rate between 0 and 60),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  vat_breakdown jsonb not null default '[]'::jsonb,
  vat_total numeric(12,2) not null default 0,
  irpf numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  payment_method text not null default '',
  iban text not null default '',
  bank_name text not null default '',
  reference text not null default '',
  notes text not null default '',
  footer_note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_number_unique unique (number)
);
create index if not exists invoices_issue_date_idx on invoices (issue_date desc, number desc);
create index if not exists invoices_status_idx on invoices (status);
create index if not exists invoices_customer_idx on invoices (customer_id);

alter table invoice_settings enable row level security;
alter table invoice_customers enable row level security;
alter table invoices enable row level security;

commit;
