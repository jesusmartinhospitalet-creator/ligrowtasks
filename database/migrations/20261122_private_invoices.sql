-- Ejecutar por un administrador de Supabase después de configurar la aplicación.
-- Las credenciales de servicio nunca deben exponerse al navegador.
create table if not exists public.private_invoices (
  id uuid primary key,
  owner_id text not null,
  direction text not null check (direction in ('issued','received')),
  invoice_number text not null,
  issue_date date not null,
  counterparty text not null,
  product text not null default '',
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  total numeric not null default 0 check (total >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid')),
  notes text not null default '',
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.private_invoices enable row level security;
-- No se conceden permisos de acceso directo: solo el servidor autorizado usa service_role.
revoke all on public.private_invoices from anon, authenticated;
insert into storage.buckets (id, name, public) values ('private-invoices','private-invoices',false)
on conflict (id) do update set public = false;
