-- Run this once in your Supabase SQL editor to create the Company Books tables

CREATE TABLE IF NOT EXISTS company_loans (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title            TEXT NOT NULL,
  lender           TEXT NOT NULL,
  amount_usd       DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid_usd  DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_date         DATE,
  status           TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'paid'
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_expenses (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category      TEXT NOT NULL DEFAULT 'other',  -- salary | tools | software | marketing | operations | other
  title         TEXT NOT NULL,
  amount_usd    DECIMAL(12,2) NOT NULL DEFAULT 0,
  expense_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by       TEXT,
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the existing $200 standing loan
INSERT INTO company_loans (title, lender, amount_usd, amount_paid_usd, status, notes)
VALUES ('Standing Business Loan', 'Investor', 200.00, 0.00, 'active', 'Initial company standing loan — $200 to be paid back')
ON CONFLICT DO NOTHING;
