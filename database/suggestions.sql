-- ================================================================
-- PRAQEN: Community Suggestions Board
-- Run this in Supabase SQL Editor before using the feature
-- ================================================================

CREATE TABLE IF NOT EXISTS suggestions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         REFERENCES users(id) ON DELETE SET NULL,
  username         VARCHAR(100) NOT NULL DEFAULT 'Anonymous',
  category         VARCHAR(50)  NOT NULL DEFAULT 'feature',
  title            VARCHAR(200) NOT NULL,
  body             TEXT         DEFAULT NULL,
  upvotes          INTEGER      NOT NULL DEFAULT 0,
  status           VARCHAR(30)  NOT NULL DEFAULT 'open',
  admin_reply      TEXT         DEFAULT NULL,
  admin_replied_at TIMESTAMPTZ  DEFAULT NULL,
  is_pinned        BOOLEAN      NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suggestion_votes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID        NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(suggestion_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suggestions_status    ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_suggestions_category  ON suggestions(category);
CREATE INDEX IF NOT EXISTS idx_suggestions_upvotes   ON suggestions(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_pinned    ON suggestions(is_pinned);
CREATE INDEX IF NOT EXISTS idx_suggestion_votes_user ON suggestion_votes(user_id);

-- RLS
ALTER TABLE suggestions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_votes  ENABLE ROW LEVEL SECURITY;

-- Anyone can read suggestions (public board)
CREATE POLICY "suggestions_public_read"
  ON suggestions FOR SELECT USING (true);

-- Logged-in users can insert
CREATE POLICY "suggestions_auth_insert"
  ON suggestions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can only update/delete their own
CREATE POLICY "suggestions_own_update"
  ON suggestions FOR UPDATE
  USING (auth.uid() = user_id);

-- Public read votes
CREATE POLICY "votes_public_read"
  ON suggestion_votes FOR SELECT USING (true);

-- Auth insert votes
CREATE POLICY "votes_auth_insert"
  ON suggestion_votes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Own vote delete
CREATE POLICY "votes_own_delete"
  ON suggestion_votes FOR DELETE
  USING (auth.uid() = user_id);
