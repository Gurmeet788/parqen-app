-- ================================================================
-- PRAQEN: 3-of-4 Moderator Dispute Voting — Schema
-- Run once in Supabase SQL Editor before restarting the backend.
-- Safe to run multiple times (all statements are idempotent).
-- ================================================================

-- One row per moderator per trade — their vote on how the dispute resolves.
CREATE TABLE IF NOT EXISTS dispute_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id     UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote         TEXT NOT NULL,           -- BUYER_WINS | SELLER_WINS | CANCEL
  reasoning    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trade_id, moderator_id)
);

-- Open, threaded team discussion on a dispute — separate from the buyer/seller trade chat.
CREATE TABLE IF NOT EXISTS dispute_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id          UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES dispute_comments(id) ON DELETE CASCADE,
  message           TEXT NOT NULL,
  is_admin_override BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- One-time, versioned, append-only signature — never overwritten, re-signed on version bump.
CREATE TABLE IF NOT EXISTS moderator_oaths (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oath_version INTEGER NOT NULL,
  signed_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, oath_version)
);

ALTER TABLE trades ADD COLUMN IF NOT EXISTS resolved_via    TEXT;  -- 'QUORUM' | 'ADMIN_OVERRIDE'
ALTER TABLE trades ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS disputed_by     UUID REFERENCES users(id) ON DELETE SET NULL; -- who opened the dispute

CREATE INDEX IF NOT EXISTS dispute_votes_trade_idx    ON dispute_votes(trade_id);
CREATE INDEX IF NOT EXISTS dispute_comments_trade_idx ON dispute_comments(trade_id);
CREATE INDEX IF NOT EXISTS dispute_comments_parent_idx ON dispute_comments(parent_id);
