-- Fix: praqen_release_escrow RPC fails with
--   "null value in column address of relation wallets violates not-null constraint"
-- Its internal INSERT ... ON CONFLICT (user_id) DO UPDATE omits the address
-- column, and Postgres enforces NOT NULL on the INSERT values before
-- conflict resolution even runs. wallets.address is write-once metadata set
-- by ensureWalletExists() and isn't read back anywhere in the app, so the
-- safe fix is to drop the NOT NULL constraint rather than edit the RPC.
-- Run ONCE in the Supabase SQL editor.

ALTER TABLE wallets ALTER COLUMN address DROP NOT NULL;
