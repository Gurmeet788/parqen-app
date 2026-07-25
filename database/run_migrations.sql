-- ============================================================
-- TOTP / 2FA Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Add 2FA columns to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_method TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS totp_secret TEXT DEFAULT NULL;

COMMENT ON COLUMN users.two_factor_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN users.two_factor_method IS '2FA method: email, sms, whatsapp, or totp';
COMMENT ON COLUMN users.totp_secret IS 'TOTP secret for authenticator app 2FA (speakeasy/otplib)';

-- Verify columns exist
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('two_factor_enabled', 'two_factor_method', 'totp_secret');
