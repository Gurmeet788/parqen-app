-- Add multi-currency support to gift card listings
-- Each entry: { "region": "iTunes Germany", "currency": "EUR", "symbol": "€", "flag": "🇩🇪" }
-- Max 10 entries per listing
ALTER TABLE listings ADD COLUMN IF NOT EXISTS gift_card_currencies JSONB DEFAULT NULL;
