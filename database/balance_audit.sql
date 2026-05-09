-- PRAQEN — balance_audit table
-- Tracks every balance change: deposits, escrow locks, releases, refunds.
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS balance_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id    UUID REFERENCES trades(id) ON DELETE SET NULL,
  reason      VARCHAR(50) NOT NULL, -- DEPOSIT | ESCROW_LOCK | ESCROW_RELEASE | ESCROW_REFUND
  change_btc  DECIMAL NOT NULL,     -- positive = credit, negative = debit
  new_balance DECIMAL NOT NULL,     -- user_balances.balance_btc after the change
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_balance_audit_user_id  ON balance_audit(user_id);
CREATE INDEX idx_balance_audit_trade_id ON balance_audit(trade_id);
CREATE INDEX idx_balance_audit_created  ON balance_audit(created_at DESC);

-- Allow service role full access; users can read their own rows
ALTER TABLE balance_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own audit log" ON balance_audit
  FOR SELECT USING (auth.uid() = user_id);

-- Service role bypasses RLS automatically, so no INSERT policy needed for the backend.
