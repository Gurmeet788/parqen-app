-- ============================================================
-- PRAQEN: Create messages table + RLS policies
-- Run this ONCE in your Supabase SQL Editor (Table Editor → SQL)
-- ============================================================
--
-- The messages table was defined in schema.sql but was never
-- actually created in the Supabase project. This script:
--   1. Creates the messages table (with sender_role column)
--   2. Adds the trade_id index
--   3. Enables RLS
--   4. Applies SELECT/INSERT policies
--   5. Reloads PostgREST schema cache
--   6. Verifies everything
-- ============================================================

-- ============================================
-- 1. CREATE MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  attachment_url VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  message_type VARCHAR(50) DEFAULT 'CHAT', -- CHAT, SYSTEM, DISPUTE
  sender_role TEXT DEFAULT 'user',          -- user, moderator, system
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. ADD INDEX ON trade_id (for fast chat loading)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_messages_trade_id ON messages(trade_id);

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. RLS POLICIES
-- ============================================

-- Participants can read messages
CREATE POLICY "Participants can read messages" ON messages
  FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Participants can send messages
CREATE POLICY "Participants can send messages" ON messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- ============================================
-- 5. RELOAD PostgREST SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 6. VERIFICATION
-- ============================================
SELECT '✅ messages table created' AS result
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'messages'
);

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'messages'
ORDER BY ordinal_position;

SELECT '✅ RLS enabled' AS rls_status
WHERE EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'messages' AND rowsecurity = true
);

SELECT '✅ RLS policies applied' AS policy_status
WHERE EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'messages'
);
