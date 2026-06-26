-- Run this in your Supabase SQL editor to enable referral chat

CREATE TABLE IF NOT EXISTS referral_messages (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id    UUID NOT NULL,
  recipient_id UUID NOT NULL,
  message      TEXT NOT NULL,
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refmsgs_sender_recipient ON referral_messages (sender_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_refmsgs_created_at       ON referral_messages (created_at);
