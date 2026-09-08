-- PostgreSQL schema for Ligrowtasks (Supabase)
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── clients ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255),
  code          VARCHAR(10),
  concept       TEXT,
  summary       TEXT,
  kickoff_date  DATE,
  ext_json      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── tasks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_code       VARCHAR(20),
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  task_name       VARCHAR(255),
  owner           VARCHAR(50),
  status          VARCHAR(50) DEFAULT 'En curso',
  priority        VARCHAR(50) DEFAULT 'Media',
  task_type       VARCHAR(20) DEFAULT 'puntual',   -- 'puntual' | 'mensual'
  task_month      VARCHAR(7),                       -- 'YYYY-MM'
  month_status    VARCHAR(20),                      -- 'abierto' | 'cerrado'
  template_id     UUID,
  due_date        DATE,
  start_date      DATE,
  end_date        DATE,
  description     TEXT DEFAULT '',
  attachments_json JSONB DEFAULT '[]',
  checklist       JSONB DEFAULT '[]',              -- [{text, done}]
  links           JSONB DEFAULT '[]',              -- [{name, href}]
  files           JSONB DEFAULT '[]',              -- [{name, href}]
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── templates ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  template_name   VARCHAR(255),
  owner           VARCHAR(50),
  priority        VARCHAR(50) DEFAULT 'Media',
  status_default  VARCHAR(50) DEFAULT 'En curso',
  due_day         INT,
  is_active       BOOLEAN DEFAULT true,
  description     TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── client_months ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_months (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  task_month    VARCHAR(7),                        -- 'YYYY-MM'
  month_status  VARCHAR(20) DEFAULT 'abierto',    -- 'abierto' | 'cerrado'
  generated_at  TIMESTAMPTZ DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── comments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
  author      VARCHAR(50),
  text        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_client_id   ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_month  ON tasks(task_month);
CREATE INDEX IF NOT EXISTS idx_tmpl_client_id    ON templates(client_id);
CREATE INDEX IF NOT EXISTS idx_cm_client_id      ON client_months(client_id);
CREATE INDEX IF NOT EXISTS idx_comments_task_id  ON comments(task_id);
