-- PRAQEN P2P Trading Platform - Complete Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  bitcoin_wallet_address VARCHAR(255) UNIQUE,
  phone_number VARCHAR(20),
  is_email_verified BOOLEAN DEFAULT false,
  is_id_verified BOOLEAN DEFAULT false,
  total_trades INTEGER DEFAULT 0,
  completion_rate DECIMAL DEFAULT 100,
  average_rating DECIMAL DEFAULT 0,
  last_login TIMESTAMP,
  account_status VARCHAR(50) DEFAULT 'active', -- active, suspended, banned
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. LISTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_type VARCHAR(50) NOT NULL, -- SELL_GIFT_CARD, BUY_GIFT_CARD
  gift_card_brand VARCHAR(100) NOT NULL, -- Amazon, Apple, Google, etc.
  amount_usd DECIMAL NOT NULL,
  bitcoin_price DECIMAL NOT NULL,
  processing_time_minutes INTEGER DEFAULT 15,
  status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, PAUSED, CLOSED
  payment_methods TEXT[], -- JSON array: ['bank', 'paypal', 'mobile_money']
  description TEXT,
  view_count INTEGER DEFAULT 0,
  trade_count INTEGER DEFAULT 0,
  stock_available INTEGER DEFAULT 1,

  -- Currency & Pricing
  currency VARCHAR(10) DEFAULT 'USD', -- USD, GHS, NGN, EUR, GBP
  currency_symbol VARCHAR(5) DEFAULT '$', -- $, ₵, ₦, €, £
  margin DECIMAL DEFAULT 0, -- percentage markup
  min_limit_usd DECIMAL DEFAULT 0,
  max_limit_usd DECIMAL DEFAULT 0,
  min_limit_local DECIMAL DEFAULT 0,
  max_limit_local DECIMAL DEFAULT 0,

  -- Trade Configuration
  time_limit INTEGER DEFAULT 45, -- minutes
  payment_method VARCHAR(100), -- primary payment method
  country VARCHAR(100),
  country_name VARCHAR(100),

  -- Gift Card specifics
  card_values   DECIMAL[]   DEFAULT NULL,   -- accepted denominations e.g. {10,20,50}
  card_type     VARCHAR(20) DEFAULT 'both', -- 'physical' | 'ecode' | 'both'
  face_value    DECIMAL     DEFAULT NULL,   -- single face value fallback
  pricing_type  VARCHAR(20) DEFAULT 'market',

  -- Terms & Instructions
  trade_instructions TEXT,
  listing_terms TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. TRADES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE SET NULL,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_type VARCHAR(50) NOT NULL, -- BUY, SELL
  amount_usd DECIMAL NOT NULL,
  amount_btc DECIMAL NOT NULL,
  status VARCHAR(50) DEFAULT 'ESCROW', -- ESCROW, AWAITING_CODE, CONFIRMING, COMPLETED, DISPUTED, REFUNDED
  
  -- Escrow Details
  escrow_wallet_address VARCHAR(255),
  escrow_received_at TIMESTAMP,
  escrow_locked_at TIMESTAMP,
  escrow_amount DECIMAL,
  
  -- Bitcoin Details
  buyer_btc_txhash VARCHAR(255),
  seller_btc_txhash VARCHAR(255),
  
  -- Code Details
  gift_card_code_encrypted VARCHAR(500),
  code_sent_at TIMESTAMP,
  
  -- Confirmations
  buyer_confirmed BOOLEAN DEFAULT false,
  buyer_confirmed_at TIMESTAMP,
  seller_confirmed BOOLEAN DEFAULT false,
  seller_confirmed_at TIMESTAMP,
  
  -- Fees
  platform_fee_btc DECIMAL DEFAULT 0,
  platform_fee_usd DECIMAL DEFAULT 0,
  fee_status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, COLLECTED, REFUNDED
  fee_collected_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancel_reason TEXT,
  expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours'
);

-- ============================================
-- ESCROW LOCKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS escrow_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_btc DECIMAL NOT NULL,
  status VARCHAR(50) DEFAULT 'LOCKED', -- LOCKED, RELEASED, REFUNDED
  locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP,
  refunded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 4. MESSAGES/CHAT TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  attachment_url VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  message_type VARCHAR(50) DEFAULT 'CHAT', -- CHAT, SYSTEM, DISPUTE
  sender_role TEXT DEFAULT 'user', -- user, moderator, system
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. REVIEWS/RATINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. DISPUTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  evidence_urls TEXT[], -- JSON array of image URLs
  status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, IN_REVIEW, RESOLVED
  resolution VARCHAR(50), -- SELLER_WINS, BUYER_WINS, REFUND
  moderator_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- ============================================
-- 7. COMPANY PROFITS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS company_profits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  profit_btc DECIMAL NOT NULL,
  profit_usd DECIMAL NOT NULL,
  collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  blockchain_txhash VARCHAR(255),
  status VARCHAR(50) DEFAULT 'COLLECTED', -- COLLECTED, PENDING, FAILED
  notes TEXT
);

-- ============================================
-- USER BALANCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_btc DECIMAL DEFAULT 0,
  balance_usd DECIMAL DEFAULT 0,
  locked_btc DECIMAL DEFAULT 0,
  locked_usd DECIMAL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- ============================================
-- 8. MOCK WALLETS TABLE (For MVP Testing)
-- ============================================
CREATE TABLE IF NOT EXISTS mock_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) UNIQUE,
  balance_btc DECIMAL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES (For Performance)
-- ============================================
CREATE INDEX idx_listings_seller_id ON listings(seller_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_trades_buyer_id ON trades(buyer_id);
CREATE INDEX idx_trades_seller_id ON trades(seller_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_escrow_locks_trade_id ON escrow_locks(trade_id);
CREATE INDEX idx_escrow_locks_status ON escrow_locks(status);
CREATE INDEX idx_user_balances_user_id ON user_balances(user_id);
CREATE INDEX idx_messages_trade_id ON messages(trade_id);
CREATE INDEX idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX idx_disputes_trade_id ON disputes(trade_id);
CREATE INDEX idx_company_profits_trade_id ON company_profits(trade_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- USERS TABLE RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can only read their own profile (except public fields)
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Anyone can read public user profiles (for marketplace)
CREATE POLICY "Anyone can read public profiles" ON users
  FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- LISTINGS TABLE RLS
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Anyone can read active listings
CREATE POLICY "Anyone can read active listings" ON listings
  FOR SELECT USING (status = 'ACTIVE');

-- Sellers can read their own listings
CREATE POLICY "Sellers can read own listings" ON listings
  FOR SELECT USING (seller_id = auth.uid());

-- Sellers can create listings
CREATE POLICY "Sellers can create listings" ON listings
  FOR INSERT WITH CHECK (seller_id = auth.uid());

-- Sellers can update their own listings
CREATE POLICY "Sellers can update own listings" ON listings
  FOR UPDATE USING (seller_id = auth.uid());

-- TRADES TABLE RLS
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- Buyer and seller can read their own trades
CREATE POLICY "Users can read own trades" ON trades
  FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Buyers can create trades
CREATE POLICY "Buyers can create trades" ON trades
  FOR INSERT WITH CHECK (buyer_id = auth.uid());

-- Participants can update trades
CREATE POLICY "Participants can update trades" ON trades
  FOR UPDATE USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- MESSAGES TABLE RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Participants can read messages
CREATE POLICY "Participants can read messages" ON messages
  FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Participants can send messages
CREATE POLICY "Participants can send messages" ON messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- REVIEWS TABLE RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews
CREATE POLICY "Anyone can read reviews" ON reviews
  FOR SELECT USING (true);

-- Users can leave reviews
CREATE POLICY "Users can create reviews" ON reviews
  FOR INSERT WITH CHECK (reviewer_id = auth.uid());

-- DISPUTES TABLE RLS
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

-- Participants can read disputes
CREATE POLICY "Participants can read disputes" ON disputes
  FOR SELECT USING (
    trade_id IN (
      SELECT id FROM trades WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

-- ============================================
-- FUNCTIONS FOR CALCULATIONS
-- ============================================

-- Function to calculate fee (3%)
CREATE OR REPLACE FUNCTION calculate_platform_fee(amount_btc DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
  RETURN amount_btc * 0.03;
END;
$$ LANGUAGE plpgsql;

-- Function to update user completion rate
CREATE OR REPLACE FUNCTION update_user_completion_rate(user_id UUID)
RETURNS VOID AS $$
DECLARE
  total_trades INT;
  completed_trades INT;
BEGIN
  SELECT COUNT(*) INTO total_trades FROM trades 
  WHERE (seller_id = user_id OR buyer_id = user_id) AND status = 'COMPLETED';
  
  SELECT COUNT(*) INTO completed_trades FROM trades 
  WHERE (seller_id = user_id OR buyer_id = user_id);
  
  IF completed_trades > 0 THEN
    UPDATE users 
    SET completion_rate = (completed_trades::DECIMAL / total_trades::DECIMAL) * 100
    WHERE id = user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate average rating
CREATE OR REPLACE FUNCTION update_user_average_rating(user_id UUID)
RETURNS VOID AS $$
DECLARE
  avg_rating DECIMAL;
BEGIN
  SELECT AVG(rating) INTO avg_rating FROM reviews WHERE reviewee_id = user_id;
  
  UPDATE users SET average_rating = COALESCE(avg_rating, 0) WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS FOR AUTO-UPDATES
-- ============================================

-- Update average rating when review is created
CREATE OR REPLACE FUNCTION trigger_update_rating()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_user_average_rating(NEW.reviewee_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_review_created
AFTER INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION trigger_update_rating();

-- Update total trades count
CREATE OR REPLACE FUNCTION trigger_update_trade_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' THEN
    UPDATE users SET total_trades = total_trades + 1 WHERE id = NEW.seller_id;
    UPDATE users SET total_trades = total_trades + 1 WHERE id = NEW.buyer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_trade_completed
AFTER UPDATE ON trades
FOR EACH ROW
WHEN (OLD.status != 'COMPLETED' AND NEW.status = 'COMPLETED')
EXECUTE FUNCTION trigger_update_trade_count();

-- ============================================
-- ADD MISSING USER FIELDS FOR FEEDBACK SYSTEM
-- ============================================

-- Add feedback fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS positive_feedback INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS negative_feedback INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_feedback_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge VARCHAR(50) DEFAULT 'BEGINNER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(100) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_referrals INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_earnings_btc DECIMAL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS website VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_moderator BOOLEAN DEFAULT false;

-- ============================================
-- AFFILIATE SYSTEM TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS affiliate_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  commission_btc DECIMAL NOT NULL,
  commission_usd DECIMAL NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, COMPLETED, CANCELLED
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP
);

-- Indexes for affiliate system
CREATE INDEX idx_affiliate_earnings_referrer_id ON affiliate_earnings(referrer_id);
CREATE INDEX idx_affiliate_earnings_referred_user_id ON affiliate_earnings(referred_user_id);
CREATE INDEX idx_affiliate_earnings_status ON affiliate_earnings(status);

-- ============================================
-- FUNCTIONS FOR FEEDBACK CALCULATION
-- ============================================

-- Function to update user feedback counts
CREATE OR REPLACE FUNCTION update_user_feedback_counts(user_id UUID)
RETURNS VOID AS $$
DECLARE
  pos_count INT;
  neg_count INT;
BEGIN
  -- Count positive reviews (rating >= 4)
  SELECT COUNT(*) INTO pos_count FROM reviews 
  WHERE reviewee_id = user_id AND rating >= 4;
  
  -- Count negative reviews (rating <= 2)
  SELECT COUNT(*) INTO neg_count FROM reviews 
  WHERE reviewee_id = user_id AND rating <= 2;
  
  -- Update user feedback counts
  UPDATE users 
  SET positive_feedback = pos_count,
      negative_feedback = neg_count,
      total_feedback_count = pos_count + neg_count
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update feedback counts when review is created
CREATE OR REPLACE FUNCTION trigger_update_feedback_counts()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_user_feedback_counts(NEW.reviewee_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_review_created_update_feedback
AFTER INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION trigger_update_feedback_counts();

-- ============================================
-- UPDATE EXISTING USER 'ken' WITH FEEDBACK DATA
-- ============================================

-- Update the user 'ken' with feedback data
UPDATE users 
SET 
  positive_feedback = 5000,
  negative_feedback = 0,
  total_feedback_count = 5000,
  total_trades = 100,
  average_rating = 4.8,
  completion_rate = 98.5,
  badge = 'AMBASSADOR',
  referral_code = CASE WHEN referral_code IS NULL THEN CONCAT(username, '_', SUBSTRING(MD5(RANDOM()::TEXT), 1, 6)) ELSE referral_code END,
  total_referrals = 25,
  referral_earnings_btc = 0.025
WHERE username = 'ken';

-- If user 'ken' doesn't exist, create them
INSERT INTO users (
  email, password_hash, username, positive_feedback, negative_feedback, 
  total_feedback_count, total_trades, average_rating, completion_rate, 
  badge, referral_code, total_referrals, referral_earnings_btc
)
VALUES (
  'ken@example.com', 
  '$2b$10$dummy.hash.for.ken', 
  'ken', 
  5000, 
  0, 
  5000, 
  100, 
  4.8, 
  98.5, 
  'AMBASSADOR', 
  'ken_' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 6), 
  25, 
  0.025
)
ON CONFLICT (username) DO UPDATE SET
  positive_feedback = EXCLUDED.positive_feedback,
  negative_feedback = EXCLUDED.negative_feedback,
  total_feedback_count = EXCLUDED.total_feedback_count,
  total_trades = EXCLUDED.total_trades,
  average_rating = EXCLUDED.average_rating,
  completion_rate = EXCLUDED.completion_rate,
  badge = EXCLUDED.badge,
  total_referrals = EXCLUDED.total_referrals,
  referral_earnings_btc = EXCLUDED.referral_earnings_btc;
