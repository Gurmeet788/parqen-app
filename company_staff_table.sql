-- Run once in Supabase SQL Editor to create the Staff Directory table

CREATE TABLE IF NOT EXISTS company_staff (
  id                UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name         TEXT    NOT NULL,
  role              TEXT    NOT NULL,
  department        TEXT    NOT NULL DEFAULT 'General',
  official_email    TEXT,
  personal_email    TEXT,
  phone             TEXT,
  salary_usd        DECIMAL(12,2) NOT NULL DEFAULT 0,
  salary_period     TEXT    NOT NULL DEFAULT 'monthly',   -- monthly | yearly | weekly
  contract_type     TEXT    NOT NULL DEFAULT 'full-time', -- full-time | part-time | contract | intern
  contract_months   INTEGER,                              -- NULL = permanent
  start_date        DATE    NOT NULL DEFAULT CURRENT_DATE,
  end_date          DATE,
  status            TEXT    NOT NULL DEFAULT 'active',    -- active | on-leave | terminated
  avatar_url        TEXT,
  bio               TEXT,
  address           TEXT,
  emergency_contact TEXT,
  emergency_phone   TEXT,
  notes             TEXT,
  added_by          TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
