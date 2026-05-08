-- ============================================================
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.phone_verification_requests (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID         NOT NULL,
  phone           TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  submitted_at    TIMESTAMPTZ  DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID,
  rejection_reason TEXT,
  CONSTRAINT pvr_user_fk     FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT pvr_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_pvr_status       ON public.phone_verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_pvr_submitted_at ON public.phone_verification_requests(submitted_at DESC);

-- Disable RLS so the service role can read/write freely
ALTER TABLE public.phone_verification_requests DISABLE ROW LEVEL SECURITY;

-- Grant access to the service role (usually already set, but explicit is safer)
GRANT ALL ON public.phone_verification_requests TO service_role;
GRANT ALL ON public.phone_verification_requests TO authenticated;
