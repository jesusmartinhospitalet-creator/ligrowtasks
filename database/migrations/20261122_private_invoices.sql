-- Migración: Tabla de facturas privadas (emitidas y recibidas por Ligrow)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run

begin;

create extension if not exists "pgcrypto";

create table if not exists private_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  direction text not null check (direction in ('issued', 'received')),
  invoice_number text not null default '' check (char_length(invoice_number) <= 100),
  issue_date date not null,
  counterparty text not null check (char_length(counterparty) <= 200),
  product text not null default '' check (char_length(product) <= 500),
  quantity numeric(12,4) not null default 1,
  unit_price numeric(12,2) not null default 0.00,
  total numeric(12,2) not null default 0.00,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid')),
  notes text not null default '' check (char_length(notes) <= 3000),
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists private_invoices_owner_date_idx on private_invoices (owner_id, issue_date desc);
create index if not exists private_invoices_direction_idx on private_invoices (owner_id, direction);

-- Habilitar RLS (Row Level Security)
alter table private_invoices enable row level security;

-- Solo el owner_id configurado en INVOICES_OWNER_USER_ID puede acceder (vía service key)
-- El acceso se gestiona en el backend con la service key de Supabase, no con RLS de usuario

commit;
