-- Run once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS team_announcements (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'normal',  -- low | normal | high | urgent
  pinned      BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_tasks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT,
  assigned_to    TEXT,
  priority       TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high | urgent
  status         TEXT NOT NULL DEFAULT 'todo',    -- todo | in-progress | done
  due_date       DATE,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_activity_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  details     TEXT,
  category    TEXT NOT NULL DEFAULT 'general',  -- general | trade | finance | user | dispute
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_shifts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_name  TEXT NOT NULL,
  day_of_week  TEXT NOT NULL,   -- Monday ... Sunday
  start_time   TEXT NOT NULL,   -- HH:MM
  end_time     TEXT NOT NULL,
  timezone     TEXT DEFAULT 'WAT',
  notes        TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_knowledge_base (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'General',
  content     TEXT NOT NULL,
  tags        TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
