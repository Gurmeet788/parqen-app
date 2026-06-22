-- ================================================================
-- FIX: Notifications blocked by type check constraint
-- The notifications_type_check constraint is too restrictive and
-- blocks 'offer_view', 'profile_view', 'system', and other valid
-- types — causing ALL notification inserts to fail silently.
--
-- Run this in Supabase → SQL Editor → New Query → Run
-- ================================================================

-- Drop the restrictive type check constraint entirely
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Confirm it's gone (optional — remove if you don't need it)
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'notifications'
  AND constraint_type = 'CHECK';
