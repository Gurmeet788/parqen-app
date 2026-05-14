-- Fix escrow_lock_status_check constraint to allow intermediate states
-- The service uses RELEASING and REFUNDING as atomic-claim sentinels
-- to prevent double-release/double-refund under concurrent requests.

ALTER TABLE escrow_locks
DROP CONSTRAINT IF EXISTS escrow_locks_status_check;

ALTER TABLE escrow_locks
ADD CONSTRAINT escrow_locks_status_check
CHECK (status IN ('LOCKED', 'RELEASING', 'RELEASED', 'REFUNDING', 'REFUNDED'));
