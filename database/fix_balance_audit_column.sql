-- Fix: add missing change_btc column to balance_audit table
-- The praqen_release_escrow RPC inserts into this column.

ALTER TABLE balance_audit
ADD COLUMN IF NOT EXISTS change_btc DECIMAL;
