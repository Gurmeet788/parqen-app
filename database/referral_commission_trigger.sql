-- ================================================================
-- Referral Commission: DB trigger + migration
-- Run this in Supabase SQL Editor once.
-- Safe to run multiple times (uses CREATE OR REPLACE / IF NOT EXISTS).
-- ================================================================

-- Ensure referred_by column exists on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by         UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_earnings_btc DECIMAL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code       VARCHAR(100) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_referrals     INTEGER DEFAULT 0;

-- Ensure affiliate_earnings table exists with correct schema
CREATE TABLE IF NOT EXISTS affiliate_earnings (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id      UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id         UUID      REFERENCES trades(id) ON DELETE SET NULL,
  commission_btc   DECIMAL   NOT NULL,
  commission_usd   DECIMAL   NOT NULL DEFAULT 0,
  status           VARCHAR(50) DEFAULT 'PENDING',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at          TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_referrer_id     ON affiliate_earnings(referrer_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_referred_user_id ON affiliate_earnings(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_trade_id         ON affiliate_earnings(trade_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_status           ON affiliate_earnings(status);

-- ── DB trigger: auto-increment referral_earnings_btc on every CREDITED insert ──
-- This means payReferralCommissions() in the backend doesn't need an extra UPDATE call.

CREATE OR REPLACE FUNCTION fn_credit_referral_earnings()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CREDITED' THEN
    UPDATE users
    SET referral_earnings_btc = COALESCE(referral_earnings_btc, 0) + NEW.commission_btc
    WHERE id = NEW.referrer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_referral_earnings ON affiliate_earnings;

CREATE TRIGGER trg_credit_referral_earnings
AFTER INSERT ON affiliate_earnings
FOR EACH ROW
EXECUTE FUNCTION fn_credit_referral_earnings();
