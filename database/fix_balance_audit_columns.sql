-- Fix: ensure all required columns exist on balance_audit
ALTER TABLE balance_audit ADD COLUMN IF NOT EXISTS change_btc  DECIMAL;
ALTER TABLE balance_audit ADD COLUMN IF NOT EXISTS new_balance DECIMAL;
ALTER TABLE balance_audit ADD COLUMN IF NOT EXISTS reason      VARCHAR(50);
ALTER TABLE balance_audit ADD COLUMN IF NOT EXISTS trade_id    UUID REFERENCES trades(id) ON DELETE SET NULL;
