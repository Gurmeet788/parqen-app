-- ============================================================
-- praqen_release_escrow — Atomic escrow release function
--
-- Called by tradeEscrowService.js via:
--   supabaseAdmin.rpc('praqen_release_escrow', { ... })
--
-- Parameters:
--   p_trade_id    UUID   — trade being completed
--   p_receiver_id UUID   — buyer (gets the BTC)
--   p_company_id  UUID   — company wallet (gets platform fee)
--   p_amount_btc  NUMERIC — gross BTC amount (receiver + fee)
--   p_fee_btc     NUMERIC — platform fee in BTC
--   p_amount_usd  NUMERIC — USD equivalent (logged for audit)
--   p_tx_hash     TEXT   — release tx reference
--
-- What it does (all in one atomic transaction):
--   1. Atomic guard     — verify escrow_locks.status = 'LOCKED'
--   2. Guard: no double — reject if trades.status = 'COMPLETED'
--   3. Release escrow   — escrow_locks → status='RELEASED'
--   4. Credit buyer     — wallets.balance_btc += p_amount_btc
--   5. Credit company   — wallets.balance_btc += p_fee_btc
--   6. Debit seller     — wallets.locked_balance_btc -= p_amount_btc
--   7. Sync mirror      — user_balances.balance_btc += p_amount_btc
--   8. Complete trade   — trades → status='COMPLETED'
--   9. Audit log        — wallet_transactions rows
--
-- Seller locked_balance_btc note:
--   When escrow locked, the lock step moved p_amount_btc from
--   seller's balance_btc → locked_balance_btc. On release that
--   BTC goes to the buyer, so we reduce locked_balance_btc by
--   the same amount (the seller's available balance_btc was
--   already debited at lock time and is not touched here).
--
-- Run ONCE in the Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION praqen_release_escrow(
  p_trade_id    UUID,
  p_receiver_id UUID,
  p_company_id  UUID,
  p_amount_btc  NUMERIC,
  p_fee_btc     NUMERIC,
  p_amount_usd  NUMERIC,
  p_tx_hash     TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_status  TEXT;
  v_trade_status TEXT;
  v_seller_id    UUID;
BEGIN
  --
  -- ── Step 1: Atomic guard ────────────────────────────────────
  -- Lock the escrow_locks row for this trade (FOR UPDATE =
  -- row-level lock held until commit). If it doesn't exist or
  -- status isn't LOCKED, abort the entire transaction.
  --
  SELECT status INTO v_lock_status
  FROM escrow_locks
  WHERE trade_id = p_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESCROW_NOT_FOUND: No escrow lock for trade %', p_trade_id;
  END IF;

  IF v_lock_status != 'LOCKED' THEN
    RAISE EXCEPTION 'ESCROW_NOT_LOCKED: Escrow for trade % has status "%" (expected LOCKED)',
      p_trade_id, v_lock_status;
  END IF;

  --
  -- ── Step 2: Guard against double-completion ─────────────────
  --
  SELECT status, seller_id INTO v_trade_status, v_seller_id
  FROM trades
  WHERE id = p_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRADE_NOT_FOUND: No trade with id %', p_trade_id;
  END IF;

  IF v_trade_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'TRADE_ALREADY_COMPLETED: Trade % is already COMPLETED', p_trade_id;
  END IF;

  --
  -- ── Step 3: Release escrow lock ─────────────────────────────
  -- Mark the lock row as RELEASED so no future call can proceed.
  --
  UPDATE escrow_locks
  SET status = 'RELEASED',
      released_at = NOW()
  WHERE trade_id = p_trade_id;

  --
  -- ── Step 4: Credit buyer's wallet ───────────────────────────
  -- Upsert: INSERT if first-time buyer has no wallet row yet;
  -- otherwise increment balance_btc.
  --
  INSERT INTO wallets (user_id, balance_btc, updated_at)
  VALUES (p_receiver_id, p_amount_btc, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET balance_btc = wallets.balance_btc + p_amount_btc,
        updated_at  = NOW();

  --
  -- ── Step 5: Credit company wallet with platform fee ─────────
  --
  INSERT INTO wallets (user_id, balance_btc, updated_at)
  VALUES (p_company_id, p_fee_btc, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET balance_btc = wallets.balance_btc + p_fee_btc,
        updated_at  = NOW();

  --
  -- ── Step 6: Debit seller's locked_balance_btc ───────────────
  -- The lock step (lockFundsInEscrow) moved this amount from the
  -- seller's balance_btc → locked_balance_btc. The BTC now goes
  -- to the buyer, so we clear the lock. The seller's available
  -- balance_btc was already reduced at lock time and is not
  -- touched again here.
  --
  UPDATE wallets
  SET locked_balance_btc = GREATEST(0, locked_balance_btc - p_amount_btc),
      updated_at         = NOW()
  WHERE user_id = v_seller_id;

  --
  -- ── Step 7: Sync user_balances mirror table ─────────────────
  -- Profile display reads from user_balances.balance_btc.
  --
  INSERT INTO user_balances (user_id, balance_btc, updated_at)
  VALUES (p_receiver_id, p_amount_btc, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET balance_btc = user_balances.balance_btc + p_amount_btc,
        updated_at  = NOW();

  --
  -- ── Step 8: Mark trade COMPLETED ────────────────────────────
  --
  UPDATE trades
  SET status           = 'COMPLETED',
      buyer_btc_txhash = p_tx_hash,
      completed_at     = NOW()
  WHERE id = p_trade_id;

  --
  -- ── Step 9: Log audit trail ─────────────────────────────────
  -- Two wallet_transactions rows: one for the buyer's release
  -- credit, one for the company's fee collection.
  --
  INSERT INTO wallet_transactions
    (user_id, type, amount_btc, amount_usdt, currency, status, tx_hash, notes, created_at)
  VALUES
    (p_receiver_id, 'ESCROW_RELEASE',
     p_amount_btc, NULL, 'BTC', 'CONFIRMED', p_tx_hash,
     'Escrow release for trade ' || p_trade_id, NOW()),
    (p_company_id, 'PLATFORM_FEE',
     p_fee_btc, NULL, 'BTC', 'CONFIRMED', p_tx_hash,
     'Platform fee from escrow release for trade ' || p_trade_id, NOW());

END;
$$;

-- Grant execute to the service_role that the backend uses
GRANT EXECUTE ON FUNCTION praqen_release_escrow(
  UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT
) TO service_role;
