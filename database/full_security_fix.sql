-- ============================================================
-- PRAQEN FULL SECURITY FIX
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- 1. Add last_onchain_btc column (stops fake deposit bug permanently)
ALTER TABLE user_wallets
  ADD COLUMN IF NOT EXISTS last_onchain_btc NUMERIC(16,8) DEFAULT 0 NOT NULL;

-- Seed it to 0 for all users — new HD addresses have no on-chain history yet
UPDATE user_wallets SET last_onchain_btc = 0;

-- 2. Recalculate every user's balance from REAL transactions only
--    Removes all fake DEPOSIT credits the buggy monitor added.
--    Keeps only trade-based earnings (ESCROW_RELEASE, ESCROW_REFUND, TRANSFER_IN).
WITH real_balances AS (
  SELECT
    user_id,
    GREATEST(0, SUM(
      CASE
        WHEN type IN ('ESCROW_RELEASE', 'ESCROW_REFUND', 'TRANSFER_IN') THEN amount_btc
        WHEN type IN ('ESCROW_LOCK', 'TRANSFER_OUT', 'WITHDRAWAL', 'FEE') THEN -amount_btc
        ELSE 0
      END
    )) AS clean_btc
  FROM wallet_transactions
  WHERE status = 'CONFIRMED'
  GROUP BY user_id
)
UPDATE user_balances ub
SET
  balance_btc = COALESCE(rb.clean_btc, 0),
  balance_usd = 0,
  updated_at  = NOW()
FROM real_balances rb
WHERE ub.user_id = rb.user_id;

-- 3. Sync user_wallets.balance_btc to match cleaned user_balances
UPDATE user_wallets uw
SET
  balance_btc = COALESCE(ub.balance_btc, 0),
  updated_at  = NOW()
FROM user_balances ub
WHERE uw.user_id = ub.user_id;

-- 4. Zero out any user_balances rows that had no wallet_transactions at all
UPDATE user_balances
SET balance_btc = 0, balance_usd = 0, updated_at = NOW()
WHERE balance_btc < 0;

-- 5. Remove fake DEPOSIT records from wallet_transactions
--    These are the ghost entries the buggy monitor inserted.
--    We keep DEPOSIT entries that have a tx_hash (real on-chain tx reference).
DELETE FROM wallet_transactions
WHERE type = 'DEPOSIT'
  AND (tx_hash IS NULL OR tx_hash = '')
  AND notes LIKE 'Auto-detected on-chain deposit%';

-- 6. Verify result — check cleaned balances
SELECT
  u.username,
  ROUND(ub.balance_btc::NUMERIC, 8) AS balance_btc,
  ROUND(ub.balance_usd::NUMERIC, 2) AS balance_usd,
  uw.btc_address
FROM users u
LEFT JOIN user_balances ub ON ub.user_id = u.id
LEFT JOIN user_wallets  uw ON uw.user_id = u.id
WHERE ub.balance_btc > 0
ORDER BY ub.balance_btc DESC;
