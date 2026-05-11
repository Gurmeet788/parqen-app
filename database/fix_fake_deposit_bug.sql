-- Fix: Fake BTC deposit bug
-- Root cause: depositMonitor compared on-chain balance vs operational balance_btc.
-- Escrow locks reduce balance_btc in DB without any on-chain movement, so the
-- monitor interpreted the gap as a new deposit every 5 minutes.
-- Fix: Track the real on-chain balance in last_onchain_btc. The monitor now
-- compares on-chain vs last_onchain_btc only (not the operational balance).

ALTER TABLE user_wallets
  ADD COLUMN IF NOT EXISTS last_onchain_btc NUMERIC(16,8) DEFAULT 0 NOT NULL;

-- Seed last_onchain_btc from the current on-chain-sourced balance for all existing users.
-- This prevents a one-time ghost deposit after the column is added.
-- If user_wallets.balance_btc reflects on-chain deposits (before any escrow deductions
-- were applied), you can use it as the seed. Adjust if needed.
UPDATE user_wallets
SET last_onchain_btc = COALESCE(balance_btc, 0)
WHERE last_onchain_btc = 0;

COMMENT ON COLUMN user_wallets.last_onchain_btc IS
  'Last confirmed on-chain BTC balance seen by depositMonitor. '
  'Only updated when real on-chain BTC arrives. Never modified by '
  'internal escrow operations (locks/releases/refunds). '
  'Used as the baseline for deposit detection to prevent fake credits.';
