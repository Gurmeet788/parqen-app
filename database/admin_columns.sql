-- ================================================================
-- PRAQEN: Admin Dashboard — Missing Column Migrations
-- Run this in Supabase SQL Editor BEFORE using the admin panel
-- ================================================================

-- KYC tracking columns (needed by admin KYC review and KYC upload)
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status          VARCHAR(20)  DEFAULT NULL;  -- 'pending' | 'approved' | 'rejected'
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_type             VARCHAR(50)  DEFAULT NULL;  -- 'ghana_card' | 'passport' etc.
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_front_url        TEXT         DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_back_url         TEXT         DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS selfie_url          TEXT         DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at    TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_approved_at     TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT        DEFAULT NULL;

-- Rename old columns if they exist from a previous migration run (safe no-ops if already correct)
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

-- Trade admin fields
ALTER TABLE trades ADD COLUMN IF NOT EXISTS admin_notes        TEXT         DEFAULT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS dispute_reason     TEXT         DEFAULT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS dispute_resolution VARCHAR(50)  DEFAULT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS dispute_notes      TEXT         DEFAULT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS disputed_at        TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS resolved_by        UUID         REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS resolved_at        TIMESTAMPTZ  DEFAULT NULL;

-- User session tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at        TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_verified   BOOLEAN      DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by         UUID         REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country             VARCHAR(100) DEFAULT NULL;

-- Notifications: read_at column
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at     TIMESTAMPTZ  DEFAULT NULL;

-- Name display preference ('full' | 'initial' | 'hide')
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_full_name   BOOLEAN     DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_display     VARCHAR(10) DEFAULT 'full';

-- IP-based location columns (populated on login via ipapi.co — display only)
ALTER TABLE users ADD COLUMN IF NOT EXISTS city               VARCHAR(100) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_name       VARCHAR(100) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_location TEXT         DEFAULT NULL;

-- Backfill from existing hide_full_name boolean
UPDATE users SET name_display = 'hide' WHERE hide_full_name = true AND name_display = 'full';

-- Backfill kyc_status from existing is_id_verified
UPDATE users SET kyc_status = 'approved' WHERE is_id_verified = true AND kyc_status IS NULL;

-- Index for admin KYC queries
CREATE INDEX IF NOT EXISTS idx_users_kyc_status     ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_is_admin        ON users(is_admin);
