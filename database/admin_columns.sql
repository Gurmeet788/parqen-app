-- ================================================================
-- PRAQEN: Admin Dashboard — Missing Column Migrations
-- Run this in Supabase SQL Editor BEFORE using the admin panel
-- ================================================================

-- KYC tracking columns (needed by admin KYC review)
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status          VARCHAR(20)  DEFAULT NULL;  -- 'pending' | 'approved' | 'rejected'
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_id_type         VARCHAR(50)  DEFAULT NULL;  -- 'ghana_card' | 'passport' etc.
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_id_url          TEXT         DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_id_back_url     TEXT         DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_selfie_url      TEXT         DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at    TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_approved_at     TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT        DEFAULT NULL;

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

-- Backfill kyc_status from existing is_id_verified
UPDATE users SET kyc_status = 'approved' WHERE is_id_verified = true AND kyc_status IS NULL;

-- Index for admin KYC queries
CREATE INDEX IF NOT EXISTS idx_users_kyc_status     ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_is_admin        ON users(is_admin);
