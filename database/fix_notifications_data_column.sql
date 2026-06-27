-- ================================================================
-- FIX: Trade notifications not appearing for either user
-- Root cause: notifications table is missing the 'data' JSONB column.
-- Trade notifications always include actor_id / trade_id in the data
-- payload, so their INSERT silently fails if this column is absent.
-- Profile/offer-view notifications don't use data, so they still work.
--
-- Run in Supabase → SQL Editor → New Query → Run
-- Safe to run multiple times.
-- ================================================================

-- Add data column if missing
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT NULL;

-- Also ensure action and read_at are present (safe no-ops if they exist)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action  TEXT        DEFAULT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;

-- Drop the restrictive type check constraint if it still exists
-- (it blocks 'trade', 'trade_cancel', 'cancelled', 'offer_view', etc.)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Ensure fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id  ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read  ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON notifications(created_at DESC);

-- Confirm columns now present
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;
