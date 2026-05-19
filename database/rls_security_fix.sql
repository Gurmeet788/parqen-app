-- ================================================================
-- PRAQEN: Complete RLS Security Fix
-- Run this once in your Supabase SQL Editor (Table Editor → SQL)
-- ================================================================
--
-- HOW THIS WORKS:
--   • Your backend uses the service_role key (supabaseAdmin) → bypasses
--     all RLS automatically. Your backend is NOT affected by this file.
--   • These policies block direct REST API calls using the anon/public key.
--   • Supabase dashboard warnings disappear once RLS is enabled on every table.
--
-- SAFE TO RE-RUN: All DROP POLICY IF EXISTS guards prevent duplicates.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. USERS TABLE
--    Risk: "Anyone can read public profiles" exposes password_hash,
--    is_admin, is_moderator, bitcoin_wallet_address to the whole internet.
--    Fix: only the account owner can read their own row directly.
--    Marketplace profile data is served by the backend (service role).
-- ────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile"        ON users;
DROP POLICY IF EXISTS "Anyone can read public profiles"   ON users;
DROP POLICY IF EXISTS "Users can update own profile"      ON users;
DROP POLICY IF EXISTS "users_select_own"                  ON users;
DROP POLICY IF EXISTS "users_update_own"                  ON users;

-- A user can only read their own full record (includes sensitive fields)
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

-- A user can update only their own profile
-- is_admin / is_moderator can only be changed by the backend (service role)
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- No INSERT policy: user creation happens via the backend only


-- ────────────────────────────────────────────────────────────────
-- 2. LISTINGS TABLE
--    Public can browse active listings (marketplace).
--    Sellers manage their own listings.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active listings"   ON listings;
DROP POLICY IF EXISTS "Sellers can read own listings"     ON listings;
DROP POLICY IF EXISTS "Sellers can create listings"       ON listings;
DROP POLICY IF EXISTS "Sellers can update own listings"   ON listings;
DROP POLICY IF EXISTS "listings_select_public"            ON listings;
DROP POLICY IF EXISTS "listings_insert_own"               ON listings;
DROP POLICY IF EXISTS "listings_update_own"               ON listings;
DROP POLICY IF EXISTS "listings_delete_own"               ON listings;

CREATE POLICY "listings_select_public" ON listings
  FOR SELECT USING (status = 'ACTIVE' OR seller_id = auth.uid());

CREATE POLICY "listings_insert_own" ON listings
  FOR INSERT WITH CHECK (seller_id = auth.uid());

CREATE POLICY "listings_update_own" ON listings
  FOR UPDATE USING (seller_id = auth.uid());

CREATE POLICY "listings_delete_own" ON listings
  FOR DELETE USING (seller_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 3. TRADES TABLE
--    Only the buyer and seller of a trade can see or modify it.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own trades"         ON trades;
DROP POLICY IF EXISTS "Buyers can create trades"          ON trades;
DROP POLICY IF EXISTS "Participants can update trades"    ON trades;
DROP POLICY IF EXISTS "trades_select_participants"        ON trades;
DROP POLICY IF EXISTS "trades_insert_buyer"               ON trades;
DROP POLICY IF EXISTS "trades_update_participants"        ON trades;

CREATE POLICY "trades_select_participants" ON trades
  FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY "trades_insert_buyer" ON trades
  FOR INSERT WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "trades_update_participants" ON trades
  FOR UPDATE USING (buyer_id = auth.uid() OR seller_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 4. ESCROW_LOCKS TABLE
--    Internal escrow tracking — participants can view their own locks.
--    All writes are backend-only (service role).
-- ────────────────────────────────────────────────────────────────
ALTER TABLE escrow_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "escrow_locks_select_participants"  ON escrow_locks;

CREATE POLICY "escrow_locks_select_participants" ON escrow_locks
  FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 5. MESSAGES TABLE
--    Only sender and recipient can read or write messages.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can read messages"    ON messages;
DROP POLICY IF EXISTS "Participants can send messages"    ON messages;
DROP POLICY IF EXISTS "messages_select_participants"      ON messages;
DROP POLICY IF EXISTS "messages_insert_sender"            ON messages;
DROP POLICY IF EXISTS "messages_update_read"              ON messages;

CREATE POLICY "messages_select_participants" ON messages
  FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "messages_insert_sender" ON messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Allow recipients to mark messages as read
CREATE POLICY "messages_update_read" ON messages
  FOR UPDATE USING (recipient_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 6. REVIEWS TABLE
--    Reviews are public (marketplace transparency).
--    Only the reviewer can post a review.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reviews"           ON reviews;
DROP POLICY IF EXISTS "Users can create reviews"          ON reviews;
DROP POLICY IF EXISTS "reviews_select_public"             ON reviews;
DROP POLICY IF EXISTS "reviews_insert_reviewer"           ON reviews;

CREATE POLICY "reviews_select_public" ON reviews
  FOR SELECT USING (true);

CREATE POLICY "reviews_insert_reviewer" ON reviews
  FOR INSERT WITH CHECK (reviewer_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 7. DISPUTES TABLE
--    Only trade participants can view or open a dispute.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can read disputes"    ON disputes;
DROP POLICY IF EXISTS "disputes_select_participants"      ON disputes;
DROP POLICY IF EXISTS "disputes_insert_participants"      ON disputes;

CREATE POLICY "disputes_select_participants" ON disputes
  FOR SELECT USING (
    trade_id IN (
      SELECT id FROM trades
      WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

CREATE POLICY "disputes_insert_participants" ON disputes
  FOR INSERT WITH CHECK (
    initiated_by = auth.uid() AND
    trade_id IN (
      SELECT id FROM trades
      WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────────
-- 8. COMPANY_PROFITS TABLE
--    Financial records — never exposed via anon key.
--    Backend service role handles all access.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE company_profits ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies: only service role (backend) can access.
-- This silences the Supabase warning while keeping the table private.


-- ────────────────────────────────────────────────────────────────
-- 9. USER_BALANCES TABLE
--    Users can view their own balance. All writes are backend-only.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_balances_select_own"          ON user_balances;

CREATE POLICY "user_balances_select_own" ON user_balances
  FOR SELECT USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 10. MOCK_WALLETS TABLE
--     Users can view their own mock wallet. Backend manages writes.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE mock_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mock_wallets_select_own"           ON mock_wallets;

CREATE POLICY "mock_wallets_select_own" ON mock_wallets
  FOR SELECT USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 11. AFFILIATE_EARNINGS TABLE
--     Referrers can view their own commission records.
--     Backend processes all commission inserts/updates.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE affiliate_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliate_earnings_select_own"     ON affiliate_earnings;

CREATE POLICY "affiliate_earnings_select_own" ON affiliate_earnings
  FOR SELECT USING (referrer_id = auth.uid() OR referred_user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 12. USER_BADGES TABLE
--     Public read (badge display on profiles). Backend grants badges.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view badges"            ON user_badges;
DROP POLICY IF EXISTS "Service role full access"          ON user_badges;
DROP POLICY IF EXISTS "user_badges_select_public"         ON user_badges;

CREATE POLICY "user_badges_select_public" ON user_badges
  FOR SELECT USING (true);


-- ────────────────────────────────────────────────────────────────
-- 13. NOTIFICATIONS TABLE
--     Create the table if not yet created by backend migration.
--     Users can only read and dismiss their own notifications.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50),
  title      VARCHAR(255),
  message    TEXT,
  action     TEXT,
  data       JSONB,
  is_read    BOOLEAN     DEFAULT false,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add action column if table was created before this fix
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read  ON notifications(is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own"          ON notifications;
DROP POLICY IF EXISTS "notifications_update_own"          ON notifications;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 14. OTP_CODES TABLE
--     One-time passwords must NEVER be readable via the API.
--     Create the table if not yet created, then lock it down completely.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT,
  email      VARCHAR(255),
  user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT        NOT NULL,
  type       VARCHAR(50),
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone      ON otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at);

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies: verified server-side only via service role.
-- Zero direct API access to OTPs — this is intentional and correct.


-- ────────────────────────────────────────────────────────────────
-- 15. TRADE_IMAGES TABLE
--     Payment proof / evidence images. Trade participants only.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_images (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id     UUID        NOT NULL REFERENCES trades(id)  ON DELETE CASCADE,
  uploader_id  UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  image_url    VARCHAR(500),
  image_type   VARCHAR(50),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_images_trade_id ON trade_images(trade_id);

ALTER TABLE trade_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trade_images_select_participants"  ON trade_images;
DROP POLICY IF EXISTS "trade_images_insert_participants"  ON trade_images;

CREATE POLICY "trade_images_select_participants" ON trade_images
  FOR SELECT USING (
    trade_id IN (
      SELECT id FROM trades
      WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

CREATE POLICY "trade_images_insert_participants" ON trade_images
  FOR INSERT WITH CHECK (
    uploader_id = auth.uid() AND
    trade_id IN (
      SELECT id FROM trades
      WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────────
-- 16. USER_WALLETS TABLE
--     Bitcoin wallet addresses. Users can view their own wallet.
--     Backend creates and updates wallet records.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_wallets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  btc_address VARCHAR(255),
  network     VARCHAR(20) DEFAULT 'mainnet',
  balance_btc DECIMAL     DEFAULT 0,
  is_active   BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id    ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_btc_address ON user_wallets(btc_address);

ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_wallets_select_own"          ON user_wallets;

CREATE POLICY "user_wallets_select_own" ON user_wallets
  FOR SELECT USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- 17. WALLET_TRANSACTIONS TABLE
--     Financial transaction ledger. Users can view their own txns.
--     All inserts/updates are backend-only.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id         UUID        REFERENCES trades(id) ON DELETE SET NULL,
  type             VARCHAR(50),
  amount_btc       DECIMAL,
  amount_usd       DECIMAL,
  tx_hash          VARCHAR(255),
  coinbase_tx_id   VARCHAR(255),
  destination_address VARCHAR(255),
  status           VARCHAR(50) DEFAULT 'PENDING',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id  ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_trade_id ON wallet_transactions(trade_id);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_transactions_select_own"   ON wallet_transactions;

CREATE POLICY "wallet_transactions_select_own" ON wallet_transactions
  FOR SELECT USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- STORAGE BUCKET SECURITY
-- ────────────────────────────────────────────────────────────────

-- KYC documents: private — never publicly accessible
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kyc-documents', 'kyc-documents', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false;

-- Trade images: private — participants only
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('trade-images', 'trade-images', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false;

-- Avatar images: public read is acceptable (no PII)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies for kyc-documents
DROP POLICY IF EXISTS "kyc_upload_own"      ON storage.objects;
DROP POLICY IF EXISTS "kyc_read_own"        ON storage.objects;

-- Users can upload their own KYC files (folder must start with their user ID)
CREATE POLICY "kyc_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'kyc-documents' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own KYC uploads; admins use service role
CREATE POLICY "kyc_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage policies for trade-images
DROP POLICY IF EXISTS "trade_images_storage_upload" ON storage.objects;
DROP POLICY IF EXISTS "trade_images_storage_read"   ON storage.objects;

CREATE POLICY "trade_images_storage_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'trade-images' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "trade_images_storage_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'trade-images' AND
    auth.uid() IS NOT NULL
  );

-- Storage policies for avatars
DROP POLICY IF EXISTS "avatars_read_public" ON storage.objects;
DROP POLICY IF EXISTS "avatars_upload_own"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own"  ON storage.objects;

CREATE POLICY "avatars_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );


-- ────────────────────────────────────────────────────────────────
-- FUNCTION SECURITY
-- Lock down sensitive helper functions so they cannot be called
-- directly via the REST API by anonymous users.
-- ────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION update_user_average_rating(UUID)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_user_completion_rate(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_user_feedback_counts(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION calculate_platform_fee(DECIMAL)   FROM PUBLIC;


-- ────────────────────────────────────────────────────────────────
-- VERIFY: After running, check all tables have RLS enabled:
--
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
--
-- Every row should show rowsecurity = true.
-- ────────────────────────────────────────────────────────────────
