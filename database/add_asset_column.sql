-- Add the `asset` column to listings table (was missing, causing 42703 errors)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS asset VARCHAR(20) DEFAULT 'BTC' NOT NULL;
COMMENT ON COLUMN listings.asset IS 'The asset being traded: BTC, USDT, etc.';
