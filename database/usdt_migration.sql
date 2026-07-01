-- ============================================================
-- PRAQEN — USDT TRC-20 Migration
-- Run this entire file in Supabase SQL Editor (once only).
-- All statements use IF NOT EXISTS / DO NOTHING so re-running
-- is safe and idempotent.
-- ============================================================

-- ── 1. wallets table — add USDT balance columns ───────────────────────────
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS balance_usdt        DECIMAL(18,6) DEFAULT 0;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_balance_usdt DECIMAL(18,6) DEFAULT 0;

-- ── 2. user_wallets table — add Tron address + last-seen USDT balance ─────
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS tron_address      TEXT;
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS last_onchain_usdt DECIMAL(18,6) DEFAULT 0;

-- Index for fast deposit monitor scanning
CREATE INDEX IF NOT EXISTS idx_user_wallets_tron_address ON user_wallets(tron_address) WHERE tron_address IS NOT NULL;

-- ── 3. wallet_transactions — add currency + USDT amount ──────────────────
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS currency    TEXT DEFAULT 'BTC';
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,6);

-- ── 4. trades — add USDT trade columns ───────────────────────────────────
-- currency: 'BTC' (default, existing trades) or 'USDT'
ALTER TABLE trades ADD COLUMN IF NOT EXISTS currency          TEXT DEFAULT 'BTC';
ALTER TABLE trades ADD COLUMN IF NOT EXISTS amount_usdt       DECIMAL(18,6);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS platform_fee_usdt DECIMAL(18,6);

-- ── 5. escrow_locks — add currency + USDT amount ─────────────────────────
ALTER TABLE escrow_locks ADD COLUMN IF NOT EXISTS currency    TEXT DEFAULT 'BTC';
ALTER TABLE escrow_locks ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,6);

-- ── 6. company_profits — add USDT profit column ──────────────────────────
ALTER TABLE company_profits ADD COLUMN IF NOT EXISTS profit_usdt DECIMAL(18,6);

-- ── 7. swap_transactions — new table for BTC↔USDT swaps ──────────────────
CREATE TABLE IF NOT EXISTS swap_transactions (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID          NOT NULL,
  from_currency TEXT          NOT NULL CHECK (from_currency IN ('BTC','USDT')),
  to_currency   TEXT          NOT NULL CHECK (to_currency   IN ('BTC','USDT')),
  from_amount   DECIMAL(18,8) NOT NULL,
  to_amount     DECIMAL(18,8) NOT NULL,
  rate          DECIMAL(18,2) NOT NULL,  -- BTC/USDT price at time of swap
  fee_pct       DECIMAL(5,4)  DEFAULT 0.01,
  fee_amount    DECIMAL(18,8) NOT NULL,
  swap_ref      TEXT          UNIQUE,
  status        TEXT          DEFAULT 'COMPLETED',
  created_at    TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_transactions_user_id    ON swap_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_swap_transactions_created_at ON swap_transactions(created_at DESC);

-- ── 8. RLS policies for swap_transactions ────────────────────────────────
ALTER TABLE swap_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own swap history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'swap_transactions' AND policyname = 'Users can view own swaps'
  ) THEN
    CREATE POLICY "Users can view own swaps"
      ON swap_transactions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role (backend) can insert/update
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'swap_transactions' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access"
      ON swap_transactions FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── 9. Seed company wallet USDT balance to 0 (if row exists) ─────────────
UPDATE wallets
SET balance_usdt = COALESCE(balance_usdt, 0),
    locked_balance_usdt = COALESCE(locked_balance_usdt, 0)
WHERE user_id = '14762cd0-d3b2-474f-acab-fe0071961e9a';

-- ── Done ──────────────────────────────────────────────────────────────────
-- After running this migration:
--   1. Add your TronGrid API key to backend/.env as TRONGRID_API_KEY=xxx
--   2. Restart the backend server — USDT monitor starts automatically
--   3. Users call GET /api/wallet/usdt to see their Tron deposit address
--   4. Swaps: POST /api/swap/btc-to-usdt  |  POST /api/swap/usdt-to-btc
--   5. Rate:  GET  /api/swap/rate
-- ============================================================
