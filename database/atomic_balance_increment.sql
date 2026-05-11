-- Atomic balance increment for user_balances
-- Prevents read-modify-write race conditions when auto-cancel, release, and depositMonitor
-- all touch the same user's balance_btc at the same time.
--
-- Run this once in Supabase SQL Editor, then the backend RPC calls will work.

CREATE OR REPLACE FUNCTION increment_balance_btc(p_user_id UUID, p_amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_balances
  SET balance_btc = balance_btc + p_amount,
      updated_at  = now()
  WHERE user_id = p_user_id;

  -- If no row exists yet, insert one
  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id, balance_btc, updated_at)
    VALUES (p_user_id, p_amount, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance_btc = user_balances.balance_btc + EXCLUDED.balance_btc,
          updated_at  = now();
  END IF;
END;
$$;

-- Grant execute to the service role used by the backend
GRANT EXECUTE ON FUNCTION increment_balance_btc(UUID, NUMERIC) TO service_role;
