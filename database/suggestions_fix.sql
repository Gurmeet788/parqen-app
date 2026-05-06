-- ================================================================
-- PRAQEN: Suggestions table — safe column patch
-- Run this in Supabase SQL Editor.
-- Uses IF NOT EXISTS everywhere so it's safe to run multiple times.
-- ================================================================

-- Core columns
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS user_id          UUID         REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS username         VARCHAR(100) NOT NULL DEFAULT 'Anonymous';
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS category         VARCHAR(50)  NOT NULL DEFAULT 'feature';
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS title            VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS body             TEXT         DEFAULT NULL;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS upvotes          INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS status           VARCHAR(30)  NOT NULL DEFAULT 'open';
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS admin_reply      TEXT         DEFAULT NULL;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS is_pinned        BOOLEAN      NOT NULL DEFAULT false;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW();
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW();

-- Fix any NULL upvotes from the partial-table state
UPDATE suggestions SET upvotes = 0   WHERE upvotes   IS NULL;
UPDATE suggestions SET status  = 'open' WHERE status IS NULL;
UPDATE suggestions SET is_pinned = false WHERE is_pinned IS NULL;

-- Votes table (safe create)
CREATE TABLE IF NOT EXISTS suggestion_votes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID        NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(suggestion_id, user_id)
);

-- Indexes (safe)
CREATE INDEX IF NOT EXISTS idx_suggestions_status    ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_category  ON suggestions(category);
CREATE INDEX IF NOT EXISTS idx_suggestions_upvotes   ON suggestions(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_pinned    ON suggestions(is_pinned);
CREATE INDEX IF NOT EXISTS idx_suggestion_votes_user ON suggestion_votes(user_id);

-- RLS (safe — enabling twice is harmless)
ALTER TABLE suggestions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_votes ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies so re-runs don't error
DROP POLICY IF EXISTS "suggestions_public_read"   ON suggestions;
DROP POLICY IF EXISTS "suggestions_auth_insert"   ON suggestions;
DROP POLICY IF EXISTS "suggestions_own_update"    ON suggestions;
DROP POLICY IF EXISTS "votes_public_read"         ON suggestion_votes;
DROP POLICY IF EXISTS "votes_auth_insert"         ON suggestion_votes;
DROP POLICY IF EXISTS "votes_own_delete"          ON suggestion_votes;

CREATE POLICY "suggestions_public_read"  ON suggestions      FOR SELECT USING (true);
CREATE POLICY "suggestions_auth_insert"  ON suggestions      FOR INSERT WITH CHECK (true);
CREATE POLICY "suggestions_own_update"   ON suggestions      FOR UPDATE USING (true);
CREATE POLICY "votes_public_read"        ON suggestion_votes FOR SELECT USING (true);
CREATE POLICY "votes_auth_insert"        ON suggestion_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "votes_own_delete"         ON suggestion_votes FOR DELETE USING (true);
