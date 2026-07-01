-- ============================================================
-- PRAQEN — Hot Wallet Migration
-- Run ONCE in Supabase SQL Editor.
-- All statements are idempotent (safe to re-run).
-- ============================================================

-- ── 1. hot_wallet_sweeps — audit log of every USDT sweep ──────────────────────
-- Tracks when USDT moves from user deposit addresses → hot wallet.
-- status: PENDING (queued), COMPLETED (swept), FAILED (permanent fail), STALE (amount changed)
CREATE TABLE IF NOT EXISTS hot_wallet_sweeps (
  id              UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID           NOT NULL,
  from_address    TEXT           NOT NULL,
  amount_usdt     DECIMAL(18,6)  NOT NULL,
  status          TEXT           NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'STALE')),
  txid            TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ    DEFAULT now(),
  updated_at      TIMESTAMPTZ    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hws_status       ON hot_wallet_sweeps(status);
CREATE INDEX IF NOT EXISTS idx_hws_user_id      ON hot_wallet_sweeps(user_id);
CREATE INDEX IF NOT EXISTS idx_hws_from_address ON hot_wallet_sweeps(from_address);
CREATE INDEX IF NOT EXISTS idx_hws_created_at   ON hot_wallet_sweeps(created_at DESC);

-- ── 2. RLS — service role can write, users cannot read sweep internals ─────────
ALTER TABLE hot_wallet_sweeps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'hot_wallet_sweeps' AND policyname = 'Service role full access to hot_wallet_sweeps'
  ) THEN
    CREATE POLICY "Service role full access to hot_wallet_sweeps"
      ON hot_wallet_sweeps FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 3. Ensure company wallet row exists in wallets ─────────────────────────────
-- balance_usdt is where swap fees + withdrawal fees are accumulated.
-- The on-chain USDT lives in the hot wallet; this is the internal ledger.
INSERT INTO wallets (user_id, balance_usdt, locked_balance_usdt, balance_btc, locked_balance_btc, updated_at)
VALUES ('14762cd0-d3b2-474f-acab-fe0071961e9a', 0, 0, 0, 0, now())
ON CONFLICT (user_id) DO UPDATE
  SET balance_usdt        = COALESCE(wallets.balance_usdt, 0),
      locked_balance_usdt = COALESCE(wallets.locked_balance_usdt, 0),
      updated_at          = now();

-- ── 4. wallet_transactions — ensure currency column exists (from usdt_migration) ─
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS currency    TEXT DEFAULT 'BTC';
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,6);

-- ── Done ────────────────────────────────────────────────────────────────────────
-- After running:
--   1. Add these to backend/.env:
--        PRAQEN_HOT_WALLET_IDENTIFIER=praqen_hot_wallet_main
--        HOT_WALLET_MIN_TRX=100
--        HOT_WALLET_TRX_SWEEP=20
--        USDT_WITHDRAWAL_FEE=1.0
--   2. Restart backend — it logs the hot wallet Tron address on startup
--   3. Send at least 500 TRX + your USDT liquidity to that address
--   4. USDT withdrawals route through the hot wallet from that point on
-- ============================================================
