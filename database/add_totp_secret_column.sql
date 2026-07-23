-- Add TOTP secret column for authenticator app 2FA
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT DEFAULT NULL;
COMMENT ON COLUMN users.totp_secret IS 'Encrypted TOTP secret for authenticator app 2FA (speakeasy/otplib)';
