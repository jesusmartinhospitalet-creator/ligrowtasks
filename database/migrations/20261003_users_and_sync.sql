-- Migración: Usuarios con control de acceso por cliente y sincronización de espacios de trabajo
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run

begin;

-- 1. Tabla de usuarios del sistema
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  name text not null,
  role text not null default 'member', -- 'admin' | 'member'
  allowed_clients jsonb not null default '[]'::jsonb, -- ej: ["cpb"] o ["*"] para admin
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Tabla de sincronización de datos de clientes (workspaces) y auditoría
create table if not exists workspace_sync (
  client_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  last_modified_by text not null default 'Sistema',
  last_modified_email text not null default '',
  activity_log jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists app_users_email_idx on app_users (lower(email));
create index if not exists workspace_sync_updated_at_idx on workspace_sync (updated_at desc);

-- 3. Semilla de usuarios iniciales:
-- Hash bcrypt para 'ligrow26': $2a$10$fV8g5iH0bH036vX4tD8h7OMM.LhB9R9KxT3uGjS9P5k5.8MsqoYtC
insert into app_users (id, email, password_hash, name, role, allowed_clients, is_active) values
  (
    '00000000-0000-0000-0000-000000000001',
    'jesus.martin.hospitalet@gmail.com',
    '$2a$10$fV8g5iH0bH036vX4tD8h7OMM.LhB9R9KxT3uGjS9P5k5.8MsqoYtC',
    'Jesús (Admin)',
    'admin',
    '["*"]'::jsonb,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'blancaamartiin04@gmail.com',
    '$2a$10$fV8g5iH0bH036vX4tD8h7OMM.LhB9R9KxT3uGjS9P5k5.8MsqoYtC',
    'Blanca',
    'member',
    '["cpb"]'::jsonb,
    true
  )
on conflict (email) do update set
  password_hash = excluded.password_hash,
  name = excluded.name,
  role = excluded.role,
  allowed_clients = excluded.allowed_clients,
  is_active = excluded.is_active,
  updated_at = now();

commit;
