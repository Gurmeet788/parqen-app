-- Support ticket system tables
-- Run this in Supabase SQL Editor

-- ── Support Tickets ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  category    VARCHAR(50) DEFAULT 'general',
  status      VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'active', 'resolved', 'closed')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx   ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_updated_idx ON support_tickets(updated_at DESC);

-- ── Support Messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_admin    BOOLEAN DEFAULT false,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS support_messages_created_idx ON support_messages(created_at ASC);
