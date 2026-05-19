-- ================================================================
-- FIX: KYC column names — run this in Supabase SQL Editor
-- This fixes "failed to submit KYC" errors caused by missing columns.
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS guards).
-- ================================================================

-- Add the KYC columns the backend expects
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status          VARCHAR(20)  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_type             VARCHAR(50)  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_front_url        TEXT         DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_back_url         TEXT         DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS selfie_url          TEXT         DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at    TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_approved_at     TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT        DEFAULT NULL;

-- Rename old columns if they were created with wrong names by a previous run of admin_columns.sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='kyc_id_type') THEN
    ALTER TABLE users RENAME COLUMN kyc_id_type TO id_type;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='kyc_id_url') THEN
    ALTER TABLE users RENAME COLUMN kyc_id_url TO id_front_url;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='kyc_id_back_url') THEN
    ALTER TABLE users RENAME COLUMN kyc_id_back_url TO id_back_url;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='kyc_selfie_url') THEN
    ALTER TABLE users RENAME COLUMN kyc_selfie_url TO selfie_url;
  END IF;
END $$;

-- Backfill kyc_status for already-verified users
UPDATE users SET kyc_status = 'approved' WHERE is_id_verified = true AND kyc_status IS NULL;
