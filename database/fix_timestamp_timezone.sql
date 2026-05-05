-- Fix: Convert TIMESTAMP columns to TIMESTAMPTZ so Supabase returns UTC-aware timestamps
-- This prevents JavaScript from misinterpreting timestamps as local time in non-UTC timezones

ALTER TABLE trades ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE trades ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE trades ALTER COLUMN completed_at TYPE TIMESTAMPTZ USING completed_at AT TIME ZONE 'UTC';
ALTER TABLE trades ALTER COLUMN cancelled_at TYPE TIMESTAMPTZ USING cancelled_at AT TIME ZONE 'UTC';
ALTER TABLE trades ALTER COLUMN escrow_locked_at TYPE TIMESTAMPTZ USING escrow_locked_at AT TIME ZONE 'UTC';
ALTER TABLE trades ALTER COLUMN buyer_confirmed_at TYPE TIMESTAMPTZ USING buyer_confirmed_at AT TIME ZONE 'UTC';
ALTER TABLE trades ALTER COLUMN seller_confirmed_at TYPE TIMESTAMPTZ USING seller_confirmed_at AT TIME ZONE 'UTC';
