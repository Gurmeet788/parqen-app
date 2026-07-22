-- Adds a coin/asset column to listings so offers can be BTC or USDT.
-- Existing rows default to 'BTC', preserving current behavior.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS asset TEXT NOT NULL DEFAULT 'BTC'
  CHECK (asset IN ('BTC', 'USDT'));

CREATE INDEX IF NOT EXISTS idx_listings_asset ON listings(asset);
