-- PRAQEN — admin_audit_log table
-- Tracks every privilege/verification change made through the admin routes:
-- make-admin, KYC approve, ban/unban, and the generic admin user-update route.
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  target_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(50) NOT NULL, -- MAKE_ADMIN | KYC_APPROVE | BAN | UNBAN | USER_UPDATE | VERIFY_EMAIL | VERIFY_PHONE
  details     JSONB,                -- e.g. { "is_admin": true } or the fields changed
  ip_address  VARCHAR(64),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_audit_admin_id  ON admin_audit_log(admin_id);
CREATE INDEX idx_admin_audit_target_id ON admin_audit_log(target_id);
CREATE INDEX idx_admin_audit_created   ON admin_audit_log(created_at DESC);

-- Lock this down entirely — only the backend's service role (which bypasses RLS)
-- should ever read or write this table. No end user, including admins, can read
-- it through the anon/authenticated Supabase client.
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
