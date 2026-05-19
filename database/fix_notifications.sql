-- ================================================================
-- FIX: Notifications not being received by users
-- Root cause: notifications table was missing the 'action' column.
-- Every notification insert included 'action' (the /trade/<id> link),
-- causing silent failures — no notifications were ever saved.
-- Run this in Supabase SQL Editor to fix immediately.
-- Safe to run multiple times.
-- ================================================================

-- Create notifications table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50),
  title      VARCHAR(255),
  message    TEXT,
  action     TEXT,
  data       JSONB,
  is_read    BOOLEAN     DEFAULT false,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing action column (the link to the trade page e.g. /trade/<uuid>)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action TEXT DEFAULT NULL;

-- Ensure indexes exist for fast queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read  ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON notifications(created_at DESC);

-- Enable RLS (safe no-op if already enabled)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS: users can read their own notifications
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- RLS: users can mark their own notifications as read
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (user_id = auth.uid());
