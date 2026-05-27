-- ================================================================
-- WELCOME BONUS SYSTEM
-- Run this once in Supabase SQL editor
-- ================================================================

-- bonus_step: 0=no offer, 1=registered (awaiting verify), 2=verified ($1 locked), 3=traded ($2 unlocked)
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_step        INTEGER     DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_expires_at  TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_unlocked_at TIMESTAMPTZ DEFAULT NULL;
