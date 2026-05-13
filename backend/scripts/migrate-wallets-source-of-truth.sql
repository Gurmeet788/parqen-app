-- ============================================================
-- PRAQEN — Wallet Source of Truth Migration
-- Run ONCE in Supabase SQL editor BEFORE deploying code changes.
-- SAFETY RULES:
--   - NEVER reduces any balance (only syncs upward)
--   - NEVER deletes or alters any table schema
--   - NEVER touches locked_balance_btc on existing rows
-- ============================================================

-- ── Step 1: Sync wallets upward from user_balances ────────────────────────────
-- If user_balances has a HIGHER value than wallets, bring wallets up to match.
-- Never reduce wallets.balance_btc below what it already shows.
UPDATE wallets w
SET
  balance_btc = ub.balance_btc,
  updated_at  = NOW()
FROM user_balances ub
WHERE w.user_id = ub.user_id
  AND ub.balance_btc > w.balance_btc;

-- ── Step 2: Create wallets rows for users who have user_balances but no wallets row
-- These users have a balance but were missed when the wallets table was introduced.
INSERT INTO wallets (user_id, balance_btc, locked_balance_btc, private_key, updated_at)
SELECT
  ub.user_id,
  COALESCE(ub.balance_btc, 0),
  0,
  'placeholder_private_key',
  NOW()
FROM user_balances ub
WHERE ub.user_id NOT IN (SELECT user_id FROM wallets WHERE user_id IS NOT NULL);

-- ── Step 3: Create wallets rows for ALL remaining users (zero balance) ────────
-- Every user on the platform must have a wallets row, even if they have never
-- deposited. This eliminates the "wallet not found" error on trade creation.
INSERT INTO wallets (user_id, balance_btc, locked_balance_btc, private_key, updated_at)
SELECT
  u.id,
  0,
  0,
  'placeholder_private_key',
  NOW()
FROM users u
WHERE u.id NOT IN (SELECT user_id FROM wallets WHERE user_id IS NOT NULL);

-- ── Verification: run after migration to confirm results ──────────────────────
-- SELECT
--   COUNT(*)                                              AS total_wallet_rows,
--   COUNT(*) FILTER (WHERE balance_btc < 0)              AS negative_balances,
--   COUNT(*) FILTER (WHERE balance_btc IS NULL)          AS null_balances,
--   SUM(balance_btc)                                     AS total_btc_in_wallets,
--   (SELECT SUM(balance_btc) FROM user_balances)         AS total_btc_in_user_balances
-- FROM wallets;
