-- User trust/block relationship table
CREATE TABLE IF NOT EXISTS user_trust (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(10) NOT NULL CHECK (type IN ('trust', 'block')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, target_id, type)
);

CREATE INDEX IF NOT EXISTS user_trust_user_idx   ON user_trust(user_id);
CREATE INDEX IF NOT EXISTS user_trust_target_idx ON user_trust(target_id);

-- Count columns on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_by_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_by_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_count    INT DEFAULT 0;
