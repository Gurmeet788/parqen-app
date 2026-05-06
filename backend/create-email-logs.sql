-- Run this in Supabase SQL Editor
-- Creates the email_logs table for PRAQEN email tracking

CREATE TABLE IF NOT EXISTS email_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES users(id) ON DELETE SET NULL,
  email         text        NOT NULL,
  subject       text        NOT NULL,
  type          text        NOT NULL,      -- welcome | verification | login_alert | kyc_approved | kyc_rejected | trade_confirmation | deposit_alert | withdrawal_alert | broadcast | trade_notification
  status        text        NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  message_id    text,                      -- SMTP message ID from Brevo
  error_message text,                      -- error detail if status = failed
  metadata      jsonb,                     -- extra context (trade_id, amount, etc.)
  sent_at       timestamptz,
  opened_at     timestamptz,               -- future: webhook tracking
  clicked_at    timestamptz,               -- future: webhook tracking
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast admin queries
CREATE INDEX IF NOT EXISTS email_logs_user_id_idx    ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS email_logs_email_idx      ON email_logs(email);
CREATE INDEX IF NOT EXISTS email_logs_type_idx       ON email_logs(type);
CREATE INDEX IF NOT EXISTS email_logs_status_idx     ON email_logs(status);
CREATE INDEX IF NOT EXISTS email_logs_created_at_idx ON email_logs(created_at DESC);

-- Optional: Row Level Security (admins only)
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON email_logs USING (true) WITH CHECK (true);
