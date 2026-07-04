-- Run once in Supabase SQL Editor.
-- Lets loans be recorded in a local currency (e.g. GHS) while amount_usd
-- stays the authoritative USD figure used for all totals/math.

ALTER TABLE company_loans ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE company_loans ADD COLUMN IF NOT EXISTS original_amount DECIMAL(14,2);
ALTER TABLE company_loans ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(14,6);
