-- Atomic, race-safe balance debit for withdrawals / on-chain sends.
-- Mirrors the existing increment_balance_btc() convention (database/atomic_balance_increment.sql)
-- but for the DEBIT side, which additionally must refuse to go below zero.
--
-- Why this is needed: the current withdrawal code in routes/hdWalletRoutes.js does
-- SELECT balance_btc, compare in JS, then UPDATE balance_btc = <computed value> across
-- wallets / user_balances / user_wallets. Two concurrent requests can both read the same
-- balance, both pass the check, and the second UPDATE silently overwrites (loses) the
-- first one's deduction — this function fixes that by doing the check-and-decrement as a
-- single atomic SQL statement, so Postgres serializes concurrent calls on the same row.
--
-- Run this once in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION praqen_debit_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be positive';
  END IF;

  UPDATE wallets
  SET balance_btc = balance_btc - p_amount,
      updated_at  = now()
  WHERE user_id = p_user_id
    AND balance_btc >= p_amount
  RETURNING balance_btc INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: user % does not have % BTC available', p_user_id, p_amount;
  END IF;

  -- Keep legacy mirror tables in sync, inside the same atomic transaction.
  UPDATE user_balances SET balance_btc = v_new_balance, updated_at = now() WHERE user_id = p_user_id;
  UPDATE user_wallets   SET balance_btc = v_new_balance, updated_at = now() WHERE user_id = p_user_id;

  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION praqen_debit_balance(UUID, NUMERIC) TO service_role;
