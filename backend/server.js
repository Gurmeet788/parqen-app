// PRAQEN Backend Server - COMPLETE FIXED VERSION
const path   = require('path');
const dotenv = require('dotenv');

// ── 1. Load .env FIRST — before anything else ──────────────────────────────
const envResult = dotenv.config();
if (envResult.error) {
  console.warn('⚠️  No .env in backend folder, trying parent...');
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const twilio = require('twilio');
const twilioClient = (process.env.TWILIO_SID && process.env.TWILIO_TOKEN)
  ? twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN) : null;
const twilioVerifySid = process.env.TWILIO_VERIFY_SID || 'VAddba23c45841679ed249d49be8a90bbe';
// Strip any accidental text after the phone number (e.g. from copy-paste errors in .env)
const TWILIO_PHONE = (process.env.TWILIO_PHONE || '').split(',')[0].trim();
const TWILIO_WA_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'; // sandbox default

// ── OneSignal Push Notifications ────────────────────────────────────────────
const { sendTradeAlert, sendSystemAlert, sendBroadcastPush } = require('./services/pushNotificationService');

// ── Africa's Talking (primary SMS for African numbers) ───────────────────────
let atSms = null;
try {
  if (process.env.AFRICASTALKING_API_KEY) {
    const AfricasTalking = require('africastalking');
    const atClient = AfricasTalking({
      apiKey:   process.env.AFRICASTALKING_API_KEY,
      username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
    });
    atSms = atClient.SMS;
    const atMode = (process.env.AFRICASTALKING_USERNAME || 'sandbox') === 'sandbox' ? '🟡 SANDBOX' : '🟢 LIVE';
    console.log(`[AT] Africa's Talking SMS initialized ${atMode}`);
  } else {
    console.warn('[AT] No AFRICASTALKING_API_KEY — AT SMS disabled');
  }
} catch (atInitErr) {
  console.error('[AT] Init error:', atInitErr.message);
}
// CoinbaseWalletService REMOVED — Coinbase held custody of private keys.
// All wallet operations now use hdWalletService (self-custody, keys in .env MNEMONIC).
const quoteService          = require('./services/quoteService');
const { E, S }              = require('./utils/apiErrors');
const emailService          = require('./services/emailService');

// In-memory typing state: 'tradeId:userId' -> expiresAt timestamp
const typingState = {};
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(typingState)) { if (typingState[key] < now) delete typingState[key]; }
}, 10000);

// Twilio Verify pending — tracks which phone numbers are awaiting a Twilio Verify OTP
// Key: e164 phone, Value: { expires: timestamp }
const twilioVerifyPending = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of twilioVerifyPending) { if (v.expires < now) twilioVerifyPending.delete(k); }
}, 60000);

// In-memory market cache — serves offers/listings without hitting DB on every page load
const _marketCache = new Map(); // key -> { data, ts }
const MARKET_CACHE_TTL = 300000; // 5 minutes
function getCached(key) {
  const c = _marketCache.get(key);
  return c && Date.now() - c.ts < MARKET_CACHE_TTL ? c.data : null;
}
function setCached(key, data) { _marketCache.set(key, { data, ts: Date.now() }); }

// When something changes (trade started, listing updated), clear the cache but immediately
// kick off a background refresh so the NEXT user request hits a warm cache.
let _cacheRefreshTimer = null;
function bustCache() {
  _marketCache.clear();
  // Debounce: wait 1s then warm up the default listings key in the background
  clearTimeout(_cacheRefreshTimer);
  _cacheRefreshTimer = setTimeout(() => _warmListingsCache(), 1000);
}

async function _warmListingsCache() {
  try {
    const { data: rawListings } = await Promise.race([
      supabaseAdmin.from('listings').select(
        'id, seller_id, listing_type, gift_card_brand, status, bitcoin_price, margin, pricing_type, currency, currency_symbol, country, country_name, payment_method, payment_methods, amount_usd, min_limit_usd, max_limit_usd, min_limit_local, max_limit_local, time_limit, trade_instructions, listing_terms, description, created_at, card_values, card_type, face_value'
      ).eq('status', 'ACTIVE').order('created_at', { ascending: false }).limit(200),
      new Promise(resolve => setTimeout(() => resolve({ data: [] }), 6000)),
    ]);
    if (!rawListings || rawListings.length === 0) return;

    const sellerIdSet = [...new Set(rawListings.map(l => l.seller_id).filter(Boolean))];
    if (sellerIdSet.length === 0) return;

    const { data: usersData } = await Promise.race([
      supabaseAdmin.from('users').select(
        'id, username, full_name, average_rating, total_trades, completion_rate, is_id_verified, is_email_verified, last_login, last_seen_at, total_feedback_count, positive_feedback, negative_feedback, country, bio, badge, avatar_url'
      ).in('id', sellerIdSet),
      new Promise(resolve => setTimeout(() => resolve({ data: [] }), 5000)),
    ]);

    // Safety: if users query failed or returned nothing, do NOT cache — better to let the
    // main /api/listings route handle it with a fresh full query.
    if (!usersData || usersData.length === 0) return;

    const userMap = {};
    usersData.forEach(u => { userMap[u.id] = u; });

    // Only include listings whose seller data was successfully fetched
    const listings = rawListings
      .filter(l => userMap[l.seller_id]) // skip any listing with no user data
      .map(l => {
        const u = userMap[l.seller_id];
        return { ...l, users: { ...u, display_name: computeDisplayName(u), country: u.country || null } };
      });

    if (listings.length === 0) return; // nothing valid to cache
    setCached('listings|||', listings);
  } catch (e) {
    console.error('[_warmListingsCache] error:', e.message);
  }
}

// ── 2. Read & validate env vars immediately after loading ──────────────────
const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY         = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔑 ENV check:');
console.log('   SUPABASE_URL:              ', SUPABASE_URL             ? '✅ FOUND' : '❌ MISSING');
console.log('   SUPABASE_ANON_KEY:         ', SUPABASE_ANON_KEY        ? '✅ FOUND' : '❌ MISSING');
console.log('   SUPABASE_SERVICE_ROLE_KEY: ', SUPABASE_SERVICE_ROLE_KEY? '✅ FOUND' : '⚠️  MISSING (using anon key)');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ FATAL: Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

// ── 3. Initialize Supabase BEFORE any route files ──────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
);

// ── 4. Other services ──────────────────────────────────────────────────────

// Show the user's username (handle) in market cards.
function computeDisplayName(user) {
  if (!user) return '';
  return user.username || '';
}

// ── 5. Express ─────────────────────────────────────────────────────────────
const app = express();

// Security headers — applied before everything else
app.use(helmet({
  contentSecurityPolicy:      false, // pure API server, no HTML pages served
  crossOriginEmbedderPolicy:  false, // allow API calls from the frontend
  crossOriginResourcePolicy:  false, // allow cross-origin fetch from browser
}));

// CORS — only allow requests from our own frontend domain
const _allowedOrigins = (process.env.FRONTEND_URL || 'https://praqen.com')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // No origin = mobile app or server-to-server call — always allow
    if (!origin) return callback(null, true);
    // Allow listed production origins
    if (_allowedOrigins.some(a => origin === a)) return callback(null, true);
    // Allow localhost in development only
    if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }
    callback(new Error('CORS: origin not allowed — ' + origin));
  },
  methods:          ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders:   ['Content-Type', 'Authorization'],
  credentials:      true,
  maxAge:           86400, // browser caches preflight for 24 hours
}));

app.use(express.json({ limit: '2mb' })); // 10mb was dangerously large for a JSON API

// ── Rate Limiters ──────────────────────────────────────────────────────────
const rateLimit = require('express-rate-limit');

// Auth endpoints: 10 attempts per 15 minutes per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// OTP/verification: 5 requests per 10 minutes per IP (code-flooding protection)
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Too many verification requests. Please wait 10 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Trade actions: 30 per minute per IP (spam protection)
const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many trade requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── 6. HD Wallet + Deposit Monitor ────────────────────────────────────────
const hdWalletService        = require('./services/hdWalletService');
const depositMonitor         = require('./services/depositMonitor');
const realtimeDepositService = require('./services/realtimeDepositService');
const sweepService           = require('./services/sweepService');
const hdWalletRoutes         = require('./routes/hdWalletRoutes');
const tradeEscrowService    = require('./services/tradeEscrowService');
const actionCodeService     = require('./services/actionCodeService');
const balanceIntegrity      = require('./services/balanceIntegrityService');
const { checkAndAwardBadges } = require('./services/badgeService');
const { syncAllOfferStatuses } = require('./services/offerStatusService');
app.use('/api/hd-wallet', hdWalletRoutes);

// NOTE: walletRoutes removed — wallet routes are defined inline below
// to avoid Supabase-not-initialized errors in external route files.

const JWT_SECRET = process.env.JWT_SECRET || 'praqen-secret-change-in-production';
const otpStore          = new Map();
const verificationCodes = new Map();

// Phone dial code → ISO country code map (sorted longest-first for prefix matching)
const PHONE_DIAL_TO_CC = {
  '+1':'+1',   // resolved below with special case
  '+7':'RU', '+20':'EG', '+27':'ZA', '+30':'GR', '+31':'NL', '+32':'BE', '+33':'FR',
  '+34':'ES', '+36':'HU', '+39':'IT', '+40':'RO', '+41':'CH', '+43':'AT', '+44':'GB',
  '+45':'DK', '+46':'SE', '+47':'NO', '+48':'PL', '+49':'DE', '+51':'PE', '+52':'MX',
  '+53':'CU', '+54':'AR', '+55':'BR', '+56':'CL', '+57':'CO', '+58':'VE', '+60':'MY',
  '+61':'AU', '+62':'ID', '+63':'PH', '+64':'NZ', '+65':'SG', '+66':'TH', '+81':'JP',
  '+82':'KR', '+84':'VN', '+86':'CN', '+90':'TR', '+91':'IN', '+92':'PK', '+93':'AF',
  '+94':'LK', '+95':'MM', '+98':'IR',
  '+212':'MA', '+213':'DZ', '+216':'TN', '+218':'LY', '+220':'GM', '+221':'SN',
  '+222':'MR', '+223':'ML', '+224':'GN', '+225':'CI', '+226':'BF', '+227':'NE',
  '+228':'TG', '+229':'BJ', '+230':'MU', '+231':'LR', '+232':'SL', '+233':'GH',
  '+234':'NG', '+235':'TD', '+236':'CF', '+237':'CM', '+238':'CV', '+239':'ST',
  '+240':'GQ', '+241':'GA', '+242':'CG', '+243':'CD', '+244':'AO', '+245':'GW',
  '+248':'SC', '+249':'SD', '+250':'RW', '+251':'ET', '+252':'SO', '+253':'DJ',
  '+254':'KE', '+255':'TZ', '+256':'UG', '+257':'BI', '+258':'MZ', '+260':'ZM',
  '+261':'MG', '+263':'ZW', '+264':'NA', '+265':'MW', '+266':'LS', '+267':'BW',
  '+268':'SZ', '+269':'KM', '+291':'ER', '+297':'AW', '+350':'GI', '+351':'PT',
  '+352':'LU', '+353':'IE', '+354':'IS', '+355':'AL', '+356':'MT', '+357':'CY',
  '+358':'FI', '+359':'BG', '+370':'LT', '+371':'LV', '+372':'EE', '+373':'MD',
  '+374':'AM', '+375':'BY', '+376':'AD', '+377':'MC', '+380':'UA', '+381':'RS',
  '+385':'HR', '+386':'SI', '+387':'BA', '+389':'MK', '+420':'CZ', '+421':'SK',
  '+501':'BZ', '+502':'GT', '+503':'SV', '+504':'HN', '+505':'NI', '+506':'CR',
  '+507':'PA', '+509':'HT', '+591':'BO', '+592':'GY', '+593':'EC', '+595':'PY',
  '+597':'SR', '+598':'UY', '+670':'TL', '+673':'BN', '+675':'PG', '+676':'TO',
  '+677':'SB', '+678':'VU', '+679':'FJ', '+686':'KI', '+688':'TV', '+691':'FM',
  '+850':'KP', '+852':'HK', '+853':'MO', '+855':'KH', '+856':'LA', '+880':'BD',
  '+886':'TW', '+960':'MV', '+961':'LB', '+962':'JO', '+963':'SY', '+964':'IQ',
  '+965':'KW', '+966':'SA', '+967':'YE', '+968':'OM', '+971':'AE', '+972':'IL',
  '+973':'BH', '+974':'QA', '+975':'BT', '+976':'MN', '+977':'NP', '+992':'TJ',
  '+993':'TM', '+994':'AZ', '+995':'GE', '+996':'KG', '+998':'UZ',
};

function phoneToCountryCode(phone) {
  if (!phone) return null;
  const normalized = String(phone).trim();
  const withPlus   = normalized.startsWith('+') ? normalized : `+${normalized}`;
  // Try longest prefix first so +233 matches before +2
  const prefixes = Object.keys(PHONE_DIAL_TO_CC).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (withPlus.startsWith(prefix)) {
      const cc = PHONE_DIAL_TO_CC[prefix];
      if (cc === '+1') return 'US'; // simplification — +1 covers US/CA
      return cc;
    }
  }
  return null;
}

// Resolve client IP + phone → ISO country code (fire-and-forget, never blocks login)
// Priority: KYC country > phone number > IP geolocation — NEVER default to any country
async function detectAndSaveCountry(userId, req, phoneNumber) {
  try {
    if (!userId) return;

    // Fetch current stored values
    const { data: existing } = await supabaseAdmin
      .from('users').select('country, phone').eq('id', userId).single();

    // ── Priority 1: Phone country code ────────────────────────────────────
    const phone  = phoneNumber || existing?.phone;
    const phoneCC = phoneToCountryCode(phone);
    if (phoneCC && !existing?.country) {
      await supabaseAdmin.from('users')
        .update({ country: phoneCC })
        .eq('id', userId)
        .or('country.is.null,country.eq.');
      console.log(`[GeoIP] user ${String(userId).slice(0,8)} → ${phoneCC} (phone)`);
    }

    // ── Priority 3: IP geolocation ────────────────────────────────────────
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || '';
    // Skip loopback / private / empty (avoids looking up server's own IP)
    if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('::ffff:')) return;

    const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(4000) });
    const geo    = await geoRes.json();
    if (geo?.country_code && geo.country_code.length === 2 && !geo.error) {
      const cc   = geo.country_code.toUpperCase();
      const city = geo.city || null;
      const name = geo.country_name || null;
      const loc  = city ? `${name} (${city})` : name;

      // Always refresh city/name/location (UI always benefits from fresh geo data)
      await supabaseAdmin.from('users')
        .update({ city, country_name: name, last_seen_location: loc })
        .eq('id', userId);

      // Set country code only if not already set by phone
      await supabaseAdmin.from('users')
        .update({ country: cc })
        .eq('id', userId)
        .or('country.is.null,country.eq.');

      console.log(`[GeoIP] user ${String(userId).slice(0,8)} → ${cc}${city ? ` / ${city}` : ''} (IP: ${ip})`);
    }
  } catch (_) { /* geo lookup failure never breaks login */ }
}

// ── Phone rate limiting (anti-abuse for OTP / phone verification) ────────────
const phoneRateLimits = new Map();

function getPhoneLimitRecord(phone) {
  const today = new Date().toDateString();
  let rec = phoneRateLimits.get(phone) || { requestsToday: 0, failedAttempts: 0, lastRequest: 0, lockedUntil: 0, requestsDate: today };
  if (rec.requestsDate !== today) {
    rec = { ...rec, requestsToday: 0, requestsDate: today };
    phoneRateLimits.set(phone, rec);
  }
  return rec;
}

function checkPhoneRateLimit(phone) {
  const now = Date.now();
  const rec = getPhoneLimitRecord(phone);
  if (rec.lockedUntil > now) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60000);
    return { blocked: true, error: `Too many attempts. Phone locked — try again in ${mins} minute(s).` };
  }
  if (rec.requestsToday >= 3) {
    rec.lockedUntil = now + 24 * 60 * 60 * 1000;
    phoneRateLimits.set(phone, rec);
    return { blocked: true, error: 'Maximum OTP requests reached. Try again in 24 hours.' };
  }
  if (rec.lastRequest > 0 && now - rec.lastRequest < 60 * 1000) {
    const secs = Math.ceil((60 * 1000 - (now - rec.lastRequest)) / 1000);
    return { blocked: true, error: `Please wait ${secs} second(s) before requesting another code.` };
  }
  return { blocked: false };
}

function recordPhoneRequest(phone) {
  const rec = getPhoneLimitRecord(phone);
  rec.requestsToday += 1;
  rec.lastRequest = Date.now();
  phoneRateLimits.set(phone, rec);
}

function recordPhoneFailure(phone) {
  const rec = getPhoneLimitRecord(phone);
  rec.failedAttempts = (rec.failedAttempts || 0) + 1;
  if (rec.failedAttempts >= 3) {
    rec.lockedUntil = Date.now() + 24 * 60 * 60 * 1000;
  }
  phoneRateLimits.set(phone, rec);
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

// ── Trade Notification Helpers ───────────────────────────────────────────────

function tradeEmailTemplate(subject, title, message, tradeRef, amount, actionUrl) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F4F1;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(27,67,50,0.10);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);padding:36px 32px 28px;text-align:center;">
              <div style="display:inline-block;background:#F4A422;border-radius:18px;width:60px;height:60px;line-height:60px;text-align:center;margin-bottom:14px;">
                <span style="font-size:32px;font-weight:900;color:#1B4332;font-family:Georgia,serif;line-height:60px;">P</span>
              </div>
              <h1 style="color:#FFFFFF;font-size:26px;font-weight:900;margin:0 0 4px 0;letter-spacing:-0.5px;">PRAQEN</h1>
              <p style="color:#95C4AE;font-size:12px;margin:0;letter-spacing:1px;text-transform:uppercase;">Africa's Trusted P2P Platform</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:36px 32px 28px;">
              <h2 style="color:#1B4332;font-size:20px;font-weight:800;margin:0 0 10px 0;">${title}</h2>
              <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px 0;">${message}</p>

              ${(tradeRef || amount) ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F1;border-radius:14px;margin-bottom:24px;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;">
                    ${tradeRef ? `
                    <table width="100%" style="margin-bottom:10px;">
                      <tr>
                        <td style="color:#64748B;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Trade Reference</td>
                        <td style="text-align:right;">
                          <span style="background:#1B4332;color:#FFFFFF;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;letter-spacing:0.5px;">#${tradeRef}</span>
                        </td>
                      </tr>
                    </table>` : ''}
                    ${amount ? `
                    <table width="100%">
                      <tr>
                        <td style="color:#64748B;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Amount</td>
                        <td style="text-align:right;color:#1B4332;font-size:18px;font-weight:900;">₿ ${amount}</td>
                      </tr>
                    </table>` : ''}
                  </td>
                </tr>
              </table>` : ''}

              ${actionUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <a href="${actionUrl}" style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#FFFFFF;text-align:center;padding:15px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.2px;">View on PRAQEN →</a>
                  </td>
                </tr>
              </table>` : ''}

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid #E8F0EB;padding-top:20px;">
                    <p style="color:#94A3B8;font-size:11px;margin:0;line-height:1.6;">
                      🔒 This is an automated message from PRAQEN. Your funds are always protected by our escrow system. Never share your login credentials with anyone.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#F0F4F1;padding:18px 32px;text-align:center;">
              <p style="color:#64748B;font-size:11px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.5px;">PRAQEN — SECURE P2P BITCOIN TRADING</p>
              <p style="color:#94A3B8;font-size:10px;margin:0;">Escrow Protected · 0.5% Fee · Trusted by traders across Africa</p>
              <p style="color:#CBD5E1;font-size:10px;margin:8px 0 0 0;">© ${year} PRAQEN. All rights reserved. Do not reply to this email.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function notifyUserSMS(userId, message) {
  try {
    const { data: user, error: dbErr } = await supabaseAdmin.from('users').select('phone').eq('id', userId).single();
    if (dbErr) { console.error(`[SMS] DB lookup failed for ${userId}:`, dbErr.message); return; }
    if (!user?.phone) { console.warn(`[SMS] No phone on file for user ${userId} — skipping`); return; }
    if (!twilioClient) { console.error('[SMS] twilioClient not initialized'); return; }
    const phone = user.phone.startsWith('+') ? user.phone : `+${user.phone}`;
    await sendSmsOtp(phone, `[PRAQEN ⚡] ${message}`);
    console.log(`📱 SMS sent to user ${userId} (${phone})`);
  } catch (err) {
    console.error(`[SMS] Failed for user ${userId}:`, err.message, err.code || '');
  }
}

async function notifyUserEmail(userId, subject, htmlContent) {
  try {
    const { data: user, error: dbErr } = await supabaseAdmin.from('users').select('email').eq('id', userId).single();
    if (dbErr) { console.error(`[Email] DB lookup failed for ${userId}:`, dbErr.message); return; }
    if (!user?.email) { console.warn(`[Email] No email on file for user ${userId} — skipping`); return; }
    await emailService.sendEmail({ userId, to: user.email, subject, html: htmlContent, type: 'trade_notification' });
  } catch (err) {
    console.error(`[Email] notifyUserEmail error for ${userId}:`, err.message);
  }
}

async function notifyTradeParties(trade, subject, _smsMessage, htmlContent) {
  const ids = [trade.buyer_id, trade.seller_id].filter(Boolean);
  await Promise.allSettled(ids.map(id => notifyUserEmail(id, subject, htmlContent)));
}

// ────────────────────────────────────────────────────────────────────────────

// ── Branded email HTML builders ──────────────────────────────────────────────
function buildVerificationEmailHtml(code) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRAQEN Verification Code</title></head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,67,50,0.10);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%);padding:32px 40px;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:#F4A422;border-radius:14px;line-height:56px;font-size:28px;font-weight:900;color:#1B4332;font-family:Georgia,serif;text-align:center;">P</div>
          <p style="margin:12px 0 0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:3px;font-family:Georgia,serif;">PRAQEN</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;letter-spacing:1px;">Africa's Safest Bitcoin Marketplace</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px 40px 32px;text-align:center;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#334155;">Your Verification Code</p>
          <p style="margin:0 0 28px;font-size:13px;color:#64748B;line-height:1.6;">Use the code below to verify your account. It expires in <strong>10 minutes</strong>.</p>
          <!-- Code box -->
          <div style="display:inline-block;background:#F0FAF5;border:2px solid #2D6A4F;border-radius:12px;padding:20px 48px;margin-bottom:28px;">
            <span style="font-size:42px;font-weight:900;letter-spacing:10px;color:#1B4332;font-family:'Courier New',monospace;">${code}</span>
          </div>
          <p style="margin:0 0 8px;font-size:12px;color:#94A3B8;">If you didn't request this, you can safely ignore this email.</p>
          <p style="margin:0;font-size:12px;color:#94A3B8;">Never share this code with anyone — PRAQEN will never ask for it.</p>
        </td></tr>
        <!-- Warning -->
        <tr><td style="padding:0 40px 24px;">
          <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;text-align:center;">
            <p style="margin:0;font-size:12px;font-weight:700;color:#92400E;">⚠️ Always trade within PRAQEN — never outside our platform</p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8FAFC;padding:20px 40px;text-align:center;border-top:1px solid #E2E8F0;">
          <p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">Need help? Contact us at <a href="mailto:hello@hellopraqen.com" style="color:#2D6A4F;font-weight:700;">hello@hellopraqen.com</a></p>
          <p style="margin:0;font-size:11px;color:#CBD5E1;">© 2025 PRAQEN · Africa's Safest P2P Bitcoin Marketplace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildWelcomeEmailHtml(username) {
  const name = username || 'Trader';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to PRAQEN!</title></head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,67,50,0.10);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%);padding:40px 40px 32px;text-align:center;">
          <div style="display:inline-block;width:64px;height:64px;background:#F4A422;border-radius:16px;line-height:64px;font-size:32px;font-weight:900;color:#1B4332;font-family:Georgia,serif;text-align:center;">P</div>
          <p style="margin:14px 0 4px;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:3px;font-family:Georgia,serif;">PRAQEN</p>
          <p style="margin:0;color:rgba(255,255,255,0.70);font-size:13px;letter-spacing:1px;">Africa's Safest Bitcoin Marketplace</p>
        </td></tr>
        <!-- Welcome headline -->
        <tr><td style="padding:36px 40px 8px;text-align:center;">
          <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#1B4332;">Welcome aboard, ${name}! 🎉</p>
          <p style="margin:0;font-size:14px;color:#64748B;line-height:1.7;">You've just joined <strong>Africa's safest peer-to-peer Bitcoin marketplace</strong>. We're so glad you're here — think of PRAQEN as your secure home to buy, sell and trade Bitcoin freely and confidently.</p>
        </td></tr>
        <!-- Steps -->
        <tr><td style="padding:28px 40px;">
          <!-- Step 1 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="48" valign="top"><div style="width:40px;height:40px;background:#EFF6FF;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">🔐</div></td>
              <td style="padding-left:14px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1B4332;">Verify Your Details</p>
                <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">Go to <strong>Settings → Verification</strong> to verify your email, phone and ID. This keeps you protected and unlocks higher trade limits.</p>
              </td>
            </tr>
          </table>
          <!-- Step 2 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="48" valign="top"><div style="width:40px;height:40px;background:#FEF3C7;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">₿</div></td>
              <td style="padding-left:14px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1B4332;">Buy Bitcoin Easily</p>
                <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">Visit the <strong>Buy Bitcoin</strong> page, pick a trusted vendor, choose your payment method (Mobile Money, bank transfer & more) and open a trade. Your Bitcoin is held in escrow until payment is confirmed.</p>
              </td>
            </tr>
          </table>
          <!-- Step 3 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="48" valign="top"><div style="width:40px;height:40px;background:#F3E8FF;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">🎁</div></td>
              <td style="padding-left:14px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1B4332;">Cash In Gift Cards</p>
                <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">Turn unused gift cards into Bitcoin in minutes on the <strong>Gift Card Marketplace</strong>. Amazon, iTunes, Steam and many more accepted!</p>
              </td>
            </tr>
          </table>
          <!-- Step 4 -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48" valign="top"><div style="width:40px;height:40px;background:#F0FAF5;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">💸</div></td>
              <td style="padding-left:14px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1B4332;">Sell Bitcoin & Create Offers</p>
                <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">Load your wallet and create your own buy/sell offers at your own rates. Build your reputation and earn more profit every trade!</p>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- CTA -->
        <tr><td style="padding:8px 40px 32px;text-align:center;">
          <a href="https://praqen.com/buy-bitcoin" style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:14px 36px;border-radius:10px;letter-spacing:0.5px;">🚀 Start Trading Now</a>
        </td></tr>
        <!-- Warning -->
        <tr><td style="padding:0 40px 24px;">
          <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;text-align:center;">
            <p style="margin:0;font-size:12px;font-weight:700;color:#92400E;">⚠️ Always trade within PRAQEN — never share your OTP or trade outside the platform</p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8FAFC;padding:20px 40px;text-align:center;border-top:1px solid #E2E8F0;">
          <p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">Questions? Reach us at <a href="mailto:hello@hellopraqen.com" style="color:#2D6A4F;font-weight:700;">hello@hellopraqen.com</a></p>
          <p style="margin:0;font-size:11px;color:#CBD5E1;">© 2025 PRAQEN · Africa's Safest P2P Bitcoin Marketplace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// NOTE: For Resend to deliver to real inboxes, verify hellopraqen.com in your Resend dashboard
// then set RESEND_FROM=hello@hellopraqen.com in .env
const RESEND_FROM_ADDR = process.env.RESEND_FROM || 'PRAQEN <hello@hellopraqen.com>';

async function sendVerificationEmail(email, code, subject = 'Your PRAQEN Verification Code') {
  console.log(`📧 Sending verification to ${email}`);
  const html = buildVerificationEmailHtml(code);

  // ── PRIMARY: Gmail SMTP (works for ALL email addresses, no domain restriction) ──
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      const info = await transporter.sendMail({
        from: `"PRAQEN" <${process.env.EMAIL_USER}>`,
        to: email,
        subject,
        html,
      });
      console.log(`✅ Verification email sent via Gmail to ${email}`, info.messageId);
      return true;
    } catch (gmailErr) {
      console.error(`❌ Gmail error:`, gmailErr.message);
    }
  }

  // ── FALLBACK: Resend API ─────────────────────────────────────────────────
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: RESEND_FROM_ADDR,
          to: email,
          subject,
          html,
        }),
      });
      const data = await response.json();
      if (data.id) {
        console.log(`✅ Verification email sent via Resend: ${data.id}`);
        return true;
      }
      throw new Error(`Resend error: ${JSON.stringify(data)}`);
    } catch (resendErr) {
      console.error('❌ Resend failed:', resendErr.message);
    }
  }

  throw new Error(`All email providers failed for ${email}`);
}

async function sendWelcomeEmail(email, username) {
  const html = buildWelcomeEmailHtml(username);
  const subject = `Welcome to PRAQEN, ${username || 'Trader'}! 🎉`;

  // Try Resend first
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: RESEND_FROM_ADDR, to: email, subject, html }),
    });
    const data = await response.json();
    if (data.id) { console.log(`✅ Welcome email sent via Resend to ${email}`); return; }
    throw new Error(JSON.stringify(data));
  } catch (e) {
    console.warn(`[Welcome email] Resend failed for ${email}:`, e.message);
  }

  // Fallback: Gmail SMTP
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"PRAQEN" <${process.env.EMAIL_USER}>`,
      to: email, subject, html,
    });
    console.log(`✅ Welcome email sent via Gmail to ${email}`);
  } catch (e) {
    console.warn(`[Welcome email] Gmail also failed for ${email}:`, e.message);
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function generateMockWallet() {
  // ── DEPRECATED: returns placeholder — real address generated by HD wallet below
  return '';
}

// ── Is this a MAINNET-only Bitcoin address? ───────────────────────────────
// SECURITY: tb1/mn/2 are TESTNET prefixes — NEVER allow on mainnet.
// Sending mainnet BTC to a testnet address = permanent irreversible loss.
function isRealBtcAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  // bc1q / bc1p = native SegWit mainnet ONLY
  // 1... = legacy P2PKH mainnet ONLY
  // 3... = P2SH mainnet ONLY
  // tb1, m, n, 2 are TESTNET — explicitly BLOCKED
  return /^(bc1[a-z0-9]{25,87}|[13][a-zA-HJ-NP-Z1-9]{25,34})$/.test(addr);
}

// ── Upgrade a user's fake mock address to a real HD wallet address ────────
async function upgradeToHDAddress(userId, username) {
  try {
    const real = hdWalletService.generateUserAddress(userId);
    await supabaseAdmin.from('users').update({
      bitcoin_wallet_address: real.address,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    console.log(`✅ [upgrade] ${username} → ${real.address}`);
    return real.address;
  } catch (e) {
    console.error(`[upgrade] Failed for ${username}:`, e.message);
    return null;
  }
}

async function generateUniqueReferralCode(username) {
  const cleanedName = (username || 'user').replace(/\W/g, '').toLowerCase().slice(0, 8) || 'user';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    const code = `${cleanedName}_${suffix}`;
    const { data, error } = await supabaseAdmin.from('users').select('id').eq('referral_code', code).maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error('Could not generate a unique referral code. Please try again.');
}

function encryptCode(code, key = 'mock-encryption-key') {
  const cipher = crypto.createCipher('aes-256-cbc', key);
  return cipher.update(code, 'utf8', 'hex') + cipher.final('hex');
}

function calculateFee(btcAmount) {
  return (parseFloat(btcAmount) * 0.005).toFixed(8);
}

async function getCurrentBTCPrice() {
  try {
    const response = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    const data = await response.json();
    return parseFloat(data.data.amount);
  } catch {
    return 88000;
  }
}

// Live FX rates cache — refreshed every 5 minutes
const _fxCache = { rates: null, fetchedAt: 0 };
const FX_FALLBACK = {
  GHS:11.06, NGN:1610, KES:129, ZAR:18.2, UGX:3720,
  TZS:2680,  USD:1,    GBP:0.79, EUR:0.92, XAF:612,
  XOF:612,   RWF:1320, ETB:58,  AUD:1.55, CAD:1.36,
  SGD:1.35,  INR:83,
};

async function getLiveFXRates() {
  const now = Date.now();
  if (_fxCache.rates && (now - _fxCache.fetchedAt) < 5 * 60 * 1000) {
    return _fxCache.rates;
  }
  try {
    // Fetch base rates from open.er-api.com + live GHS/NGN from Frankfurter (same as frontend)
    const [fxRes, ghsRes, ngnRes] = await Promise.all([
      fetch('https://open.er-api.com/v6/latest/USD'),
      fetch('https://api.frankfurter.app/latest?from=USD&to=GHS'),
      fetch('https://api.frankfurter.app/latest?from=USD&to=NGN'),
    ]);

    if (fxRes.ok) {
      const fxData = await fxRes.json();
      if (fxData.result === 'success' && fxData.rates) {
        _fxCache.rates = { ...FX_FALLBACK, ...fxData.rates };
      }
    }

    // Fetch live GHS rate from Frankfurter (overrides any API or fallback value)
    if (ghsRes.ok) {
      const ghsData = await ghsRes.json();
      if (ghsData && ghsData.rates && ghsData.rates.GHS) {
        _fxCache.rates.GHS = ghsData.rates.GHS;
        console.log('✅ Live GHS rate updated from Frankfurter:', _fxCache.rates.GHS);
      }
    } else {
      _fxCache.rates.GHS = FX_FALLBACK.GHS;
      console.warn('⚠️ Could not fetch live GHS rate from Frankfurter, using fallback:', _fxCache.rates.GHS);
    }

    // Fetch live NGN rate from Frankfurter (overrides any API or fallback value)
    if (ngnRes.ok) {
      const ngnData = await ngnRes.json();
      if (ngnData && ngnData.rates && ngnData.rates.NGN) {
        _fxCache.rates.NGN = ngnData.rates.NGN;
        console.log('✅ Live NGN rate updated from Frankfurter:', _fxCache.rates.NGN);
      }
    } else {
      _fxCache.rates.NGN = FX_FALLBACK.NGN;
      console.warn('⚠️ Could not fetch live NGN rate from Frankfurter, using fallback:', _fxCache.rates.NGN);
    }

    _fxCache.fetchedAt = now;
    console.log(`[FX] rates refreshed — GHS:${_fxCache.rates.GHS} NGN:${_fxCache.rates.NGN}`);
    return _fxCache.rates;
  } catch (e) {
    console.warn('[FX] fetch failed, using fallback:', e.message);
  }
  return _fxCache.rates || FX_FALLBACK;
}

async function getModeratorUserIds() {
  const { data, error } = await supabaseAdmin.from('users').select('id').or('is_moderator.eq.true,is_admin.eq.true');
  if (error) { console.error('Error fetching moderators:', error); return []; }
  return data.map(u => u.id);
}

async function notifyModerators(tradeId, trade, reason) {
  const ids = await getModeratorUserIds();
  for (const id of ids) {
    await createNotification(id, 'dispute', '🚨 New Dispute Opened',
      `Dispute opened for trade #${tradeId.slice(0, 8)}. Reason: ${reason.substring(0, 100)}`,
      `/admin/disputes/${tradeId}`);
  }
  console.log(`✅ Notified ${ids.length} moderators about dispute on trade ${tradeId}`);
}

async function createNotification(userId, type, title, message, action) {
  try {
    const { data } = await supabaseAdmin.from('notifications').insert({
      user_id: userId, type, title, message, action, created_at: new Date(), is_read: false,
    }).select();
    return data?.[0] || null;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
}

async function updateUserTradeStats(userId) {
  try {
    // Atomic +1 — never recounts from trades table so historical totals are preserved.
    // If the RPC isn't deployed yet, fall back to a safe read-then-increment (not a table recount).
    const { error: rpcErr } = await supabaseAdmin.rpc('praqen_increment_trades', { p_user_id: userId });
    if (rpcErr) {
      const { data: cur } = await supabaseAdmin.from('users').select('total_trades').eq('id', userId).single();
      const safePrev = parseInt(cur?.total_trades || 0);
      await supabaseAdmin.from('users').update({ total_trades: safePrev + 1 }).eq('id', userId);
    }

    // Completion rate uses actual trade rows but does NOT touch total_trades.
    const { data: all } = await supabaseAdmin.from('trades').select('status').or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);
    if (all && all.length > 0) {
      const completed = all.filter(t => t.status === 'COMPLETED').length;
      const rate = Math.round((completed / all.length) * 100);
      await supabaseAdmin.from('users').update({ completion_rate: rate }).eq('id', userId);
    }

    checkAndAwardBadges(userId).catch(() => {});
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}

async function createAffiliateEarning(tradeId, buyerId, tradeAmountBtc, tradeAmountUsd) {
  try {
    const { data: buyer, error: buyerError } = await supabaseAdmin.from('users').select('referred_by').eq('id', buyerId).single();
    if (buyerError || !buyer?.referred_by) return;
    const { data: referrer } = await supabaseAdmin.from('users').select('total_referrals').eq('id', buyer.referred_by).single();
    let commissionRate = 0.2;
    const referralCount = referrer?.total_referrals || 0;
    if (referralCount >= 100) commissionRate = 0.5;
    else if (referralCount >= 50) commissionRate = 0.4;
    else if (referralCount >= 25) commissionRate = 0.35;
    else if (referralCount >= 10) commissionRate = 0.25;
    const commissionBtc = parseFloat(tradeAmountBtc || 0) * (commissionRate / 100);
    const { error } = await supabaseAdmin.from('affiliate_earnings').insert({
      referrer_id: buyer.referred_by, referred_user_id: buyerId, trade_id: tradeId,
      commission_btc: commissionBtc, trade_amount_btc: tradeAmountBtc, trade_amount_usd: tradeAmountUsd,
      commission_rate: commissionRate, status: 'COMPLETED', created_at: new Date()
    });
    if (error) throw error;
    // Update referral_earnings_btc directly — sum all earnings for this referrer
    const { data: allE } = await supabaseAdmin.from('affiliate_earnings').select('commission_btc').eq('referrer_id', buyer.referred_by);
    const newTotal = (allE || []).reduce((s, e) => s + parseFloat(e.commission_btc || 0), 0);
    await supabaseAdmin.from('users').update({ referral_earnings_btc: parseFloat(newTotal.toFixed(8)) }).eq('id', buyer.referred_by);
    console.log(`✅ Affiliate commission: ${commissionBtc} BTC for referrer ${buyer.referred_by}`);
  } catch (error) {
    console.error('Create affiliate earning error:', error);
  }
}

// Pays 0.01% referral commission to whoever referred the buyer and/or seller.
// If both share the same referrer, only one payout is made (no double-dipping).
// The DB trigger on affiliate_earnings auto-increments referral_earnings_btc.
async function payReferralCommissions(tradeId, buyerId, sellerId, amountBtc, amountUsd) {
  try {
    const RATE = 0.0001; // 0.01%
    const commissionBtc = parseFloat(amountBtc || 0) * RATE;
    const commissionUsd = parseFloat(amountUsd || 0) * RATE;

    if (commissionBtc <= 0) return;

    const { data: traders } = await supabaseAdmin
      .from('users')
      .select('id, referred_by')
      .in('id', [buyerId, sellerId]);

    if (!traders || traders.length === 0) return;

    const buyerRow  = traders.find(u => String(u.id) === String(buyerId));
    const sellerRow = traders.find(u => String(u.id) === String(sellerId));

    // Build unique referrer → referred_user_id map (first seen wins for dedup)
    const payouts = new Map();
    if (buyerRow?.referred_by)  payouts.set(buyerRow.referred_by,  buyerId);
    if (sellerRow?.referred_by && !payouts.has(sellerRow.referred_by)) {
      payouts.set(sellerRow.referred_by, sellerId);
    }

    if (payouts.size === 0) return;

    const rows = [];
    for (const [referrerId, referredUserId] of payouts) {
      rows.push({
        referrer_id:      referrerId,
        referred_user_id: referredUserId,
        trade_id:         tradeId,
        commission_btc:   commissionBtc,
        commission_usd:   commissionUsd,
        status:           'CREDITED',
        created_at:       new Date().toISOString(),
      });
    }

    const { error } = await supabaseAdmin.from('affiliate_earnings').insert(rows);
    if (error) {
      console.error('[referral] Commission insert failed:', error.message);
      return;
    }

    // Update referral_earnings_btc for each referrer directly
    for (const [referrerId] of payouts) {
      const { data: allE } = await supabaseAdmin.from('affiliate_earnings').select('commission_btc').eq('referrer_id', referrerId);
      const newTotal = (allE || []).reduce((s, e) => s + parseFloat(e.commission_btc || 0), 0);
      await supabaseAdmin.from('users').update({ referral_earnings_btc: parseFloat(newTotal.toFixed(8)) }).eq('id', referrerId);
    }

    console.log(`✅ [referral] Trade ${tradeId.slice(0, 8)}: paid ₿${commissionBtc.toFixed(8)} to ${rows.length} referrer(s)`);
  } catch (e) {
    console.error('[referral] payReferralCommissions error:', e.message);
  }
}

async function ensureWallet(userId, username) {
  const { data: user, error } = await supabaseAdmin.from('users')
    .select('bitcoin_wallet_address, username').eq('id', userId).single();
  if (error) throw new Error('User not found');

  // Always use HD wallet — derive address from master seed + userId
  const hdWallet = require('./services/hdWalletService');
  const addrData = hdWallet.generateUserAddress(userId);
  const address  = addrData.address;

  // If the stored address already matches the HD wallet address, nothing to do
  if (user.bitcoin_wallet_address === address) {
    return { address, isNew: false };
  }

  // Save HD wallet address to both tables
  await Promise.all([
    supabaseAdmin.from('users').update({
      bitcoin_wallet_address: address,
      updated_at: new Date().toISOString(),
    }).eq('id', userId),
    supabaseAdmin.from('user_wallets').upsert({
      user_id:     userId,
      btc_address: address,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'user_id' }),
  ]);

  return { address, isNew: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY lockFundsInEscrow() and releaseFundsToBuyer() REMOVED.
// All escrow operations must go through tradeEscrowService (imported at line 107).
// Using these old functions caused double-balance-credits and missing wallet syncs.
// ─────────────────────────────────────────────────────────────────────────────

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: E.NO_TOKEN });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: E.INVALID_TOKEN });
  }
}

// Optional auth — attaches userId if token present, but never blocks the request
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
    } catch {}
  }
  next();
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

app.post('/api/test-notify', async (req, res) => {
  const { userId, phone } = req.body;
  const results = {};

  // 1. Check Twilio config
  results.twilio_sid    = process.env.TWILIO_SID    ? '✅ set' : '❌ missing';
  results.twilio_token  = process.env.TWILIO_TOKEN  ? '✅ set' : '❌ missing';
  results.twilio_phone  = process.env.TWILIO_PHONE  || '❌ missing';
  results.twilio_client = twilioClient              ? '✅ initialized' : '❌ null';

  // 2. Check user phone in DB
  if (userId) {
    const { data: user, error } = await supabaseAdmin.from('users').select('phone, email').eq('id', userId).single();
    results.db_phone = user?.phone || '❌ null — user has no phone saved';
    results.db_email = user?.email || '❌ null';
    results.db_error = error?.message || null;
  }

  // 3. Try sending a real test SMS
  const testTo = phone || (userId && (await supabaseAdmin.from('users').select('phone').eq('id', userId).single()).data?.phone);
  if (testTo) {
    try {
      const to = testTo.startsWith('+') ? testTo : `+${testTo}`;
      await twilioClient.messages.create({
        body: '[PRAQEN] Test notification — SMS is working!',
        from: process.env.TWILIO_PHONE,
        to
      });
      results.sms_test = `✅ SMS sent to ${to}`;
    } catch (err) {
      results.sms_test = `❌ ${err.message} (code: ${err.code})`;
    }
  } else {
    results.sms_test = '⚠️ No phone provided — pass userId or phone in body';
  }

  res.json(results);
});

// ============================================================
// AUTH ROUTES
// ============================================================

// Public endpoint — returns referrer info from a referral code (used to show banner on signup page)
app.get('/api/auth/referrer', async (req, res) => {
  try {
    const code = (req.query.code || '').toLowerCase().trim();
    if (!code) return res.json({ success: false });
    const { data } = await supabaseAdmin
      .from('users')
      .select('username, full_name, avatar_url, total_trades, badge, total_referrals')
      .eq('referral_code', code)
      .maybeSingle();
    if (!data) return res.json({ success: false });
    res.json({
      success: true,
      referrer: {
        username:       data.username,
        full_name:      data.full_name,
        avatar_url:     data.avatar_url || null,
        total_trades:   data.total_trades || 0,
        badge:          data.badge || 'BEGINNER',
        total_referrals: data.total_referrals || 0,
      },
    });
  } catch (e) {
    res.json({ success: false });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, phone, password, username, fullName, referralCode } = req.body;

    // ── Validate inputs ────────────────────────────────────────────────────
    if ((!email && !phone) || !password || !username) {
      return res.status(400).json({ error: E.MISSING_FIELDS });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: E.PASSWORD_TOO_SHORT });
    }

    // ── Check uniqueness (fast DB lookups) ─────────────────────────────────
    if (email) {
      const { data: existingUser } = await supabaseAdmin
        .from('users').select('email').eq('email', email.toLowerCase().trim()).single();
      if (existingUser) return res.status(400).json({ error: E.EMAIL_TAKEN });
    }

    if (phone) {
      const { data: existingPhone } = await supabaseAdmin
        .from('users').select('id').eq('phone', phone.trim()).single();
      if (existingPhone) return res.status(400).json({ error: 'An account with this phone number already exists. Try logging in or use a different number.' });
    }

    const { data: existingUsername } = await supabaseAdmin
      .from('users').select('id').eq('username', username.trim()).single();
    if (existingUsername) return res.status(400).json({ error: E.USERNAME_TAKEN });

    // ── Referral lookup ────────────────────────────────────────────────────
    let referrerId = null;
    if (referralCode) {
      const normalized = referralCode.toLowerCase().trim();
      const { data: referrer } = await supabaseAdmin
        .from('users').select('id').eq('referral_code', normalized).maybeSingle();
      if (referrer) {
        referrerId = referrer.id;
        console.log(`[Register] Referral matched: code=${normalized} → referrer=${referrerId}`);
      } else {
        console.log(`[Register] Referral code not found: ${normalized}`);
      }
    }

    // ── Create user ────────────────────────────────────────────────────────
    const passwordHash      = await bcrypt.hash(password, 10);
    const referralCodeValue = await generateUniqueReferralCode(username);

    const { data, error } = await supabaseAdmin.from('users').insert([{
      email:                  email ? email.toLowerCase().trim() : null,
      phone:                  phone ? phone.trim() : null,
      password_hash:          passwordHash,
      username:               username.trim(),
      full_name:              fullName || username.trim(),
      bitcoin_wallet_address: null,       // HD address generated async below
      is_email_verified:      false,
      average_rating:         0,
      total_trades:           0,
      completion_rate:        100,
      account_status:         'ACTIVE',
      created_at:             new Date(),
      avatar_url:             null,
      is_admin:               false,
      is_moderator:           false,
      referred_by:            referrerId,
      referral_code:          referralCodeValue,
      badge:                  'BEGINNER',
    }]).select();

    if (error) {
      console.error('[Register] DB insert error:', error);
      const isDuplicate = error.message?.includes('duplicate') || error.code === '23505';
      return res.status(400).json({ error: isDuplicate ? 'An account with this email or username already exists.' : 'Registration failed. Please try again.' });
    }
    if (!data || data.length === 0) return res.status(400).json({ error: E.REGISTER_FAILED });

    const newUser = data[0];

    // ── Seed balance rows — both tables must exist before any trade ───────
    await Promise.all([
      supabaseAdmin.from('user_balances').insert([{ user_id: newUser.id, balance_btc: 0, balance_usd: 0 }])
        .catch(() => {}),
      supabaseAdmin.from('wallets').insert({
        user_id: newUser.id, balance_btc: 0, locked_balance_btc: 0, updated_at: new Date().toISOString(),
      }).catch(() => {}), // ignore duplicate if row already exists
    ]);

    // ── Generate 6-digit verification code & save to DB (email users only) ──
    let emailVerifyCode = null;
    if (email) {
      emailVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      verificationCodes.set(email, { code: emailVerifyCode, expiresAt: Date.now() + 10 * 60 * 1000, userId: newUser.id });
      await supabaseAdmin.from('users').update({
        verification_code:         emailVerifyCode,
        verification_code_expires: new Date(Date.now() + 10 * 60 * 1000),
      }).eq('id', newUser.id);
    }

    // ── Sign JWT ───────────────────────────────────────────────────────────
    const token = jwt.sign({ userId: newUser.id, email: email || null }, JWT_SECRET, { expiresIn: '7d' });

    // ── RESPOND IMMEDIATELY — never block on email or external APIs ────────
    res.json({
      success: true,
      token,
      user: {
        id:                     newUser.id,
        email:                  newUser.email,
        username:               newUser.username,
        full_name:              newUser.full_name,
        average_rating:         0,
        total_trades:           0,
        avatar_url:             null,
        is_admin:               false,
        is_moderator:           false,
        referral_code:          referralCodeValue,
        bitcoin_wallet_address: null,
      },
      message: 'Account created! Check your email for the verification code.',
    });

    // ── BACKGROUND WORK (runs after response is sent) ──────────────────────
    // 1. Welcome bonus — step 1 (registered, awaiting verification), 30-day window
    const bonusExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    supabaseAdmin.from('users').update({ bonus_step: 1, bonus_expires_at: bonusExpires })
      .eq('id', newUser.id).catch(() => {});

    // 2. Detect and save country from IP (fire and forget)
    detectAndSaveCountry(newUser.id, req).catch(() => {});

    // 2. Send verification + welcome email (email users only)
    if (email && emailVerifyCode) {
      emailService.sendVerificationEmail(email, emailVerifyCode, newUser.id)
        .catch(e => console.error('[Register] Verification email failed:', e.message));
      emailService.sendWelcomeEmail({ id: newUser.id, email, username })
        .catch(e => console.error('[Register] Welcome email failed:', e.message));
    }

    // 2. Generate HD wallet address for this user
    Promise.resolve().then(async () => {
      try {
        const hdAddrData = hdWalletService.generateUserAddress(newUser.id);
        await supabaseAdmin.from('users').update({
          bitcoin_wallet_address: hdAddrData.address,
          updated_at: new Date().toISOString(),
        }).eq('id', newUser.id);
        await supabaseAdmin.from('user_wallets').upsert({
          user_id:    newUser.id,
          btc_address: hdAddrData.address,
          network:    'mainnet',
          balance_btc: 0,
          created_at: new Date().toISOString(),
        });
        console.log(`[Register] HD wallet generated for ${newUser.username}: ${hdAddrData.address}`);
        // Subscribe to real-time WebSocket monitoring immediately
        realtimeDepositService.subscribeAddress(newUser.id, hdAddrData.address);
      } catch (e) {
        console.error('[Register] HD wallet generation failed:', e.message);
      }
    });

    // 3. Increment referrer's total_referrals count (non-critical, direct update)
    if (referrerId) {
      (async () => {
        try {
          const { data: ref } = await supabaseAdmin.from('users').select('total_referrals').eq('id', referrerId).single();
          const newCount = (ref?.total_referrals || 0) + 1;
          await supabaseAdmin.from('users').update({ total_referrals: newCount }).eq('id', referrerId);
          console.log(`[Register] Referral count updated for ${referrerId}: ${newCount}`);
        } catch (e) {
          console.error('[Register] Referral count update failed:', e.message);
        }
      })();
    }

    // 4. HD wallet address — assign immediately on registration
    try {
      const hdWallet  = require('./services/hdWalletService');
      const addrData  = hdWallet.generateUserAddress(newUser.id);
      await Promise.all([
        supabaseAdmin.from('users').update({
          bitcoin_wallet_address: addrData.address,
          wallet_created_at:      new Date().toISOString(),
        }).eq('id', newUser.id),
        supabaseAdmin.from('user_wallets').upsert({
          user_id:          newUser.id,
          btc_address:      addrData.address,
          balance_btc:      0,
          last_onchain_btc: 0,
          updated_at:       new Date().toISOString(),
        }, { onConflict: 'user_id' }),
        supabaseAdmin.from('wallets').upsert({
          user_id:            newUser.id,
          address:            addrData.address,
          balance_btc:        0,
          locked_balance_btc: 0,
          updated_at:         new Date().toISOString(),
        }, { onConflict: 'user_id' }),
      ]);
      console.log(`[Register] HD wallet address assigned for ${newUser.username}: ${addrData.address}`);
    } catch (e) {
      console.error('[Register] HD wallet address failed (non-critical):', e.message);
    }

  } catch (error) {
    console.error('[Register] Unexpected error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/register-with-referral', authLimiter, async (req, res) => {
  // same as /register — just alias it
  req.url = '/api/auth/register';
  app._router.handle(req, res);
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, phone, method } = req.body;

    // ── Phone login (OTP already verified before this call) ──────────────────
    if (method === 'phone' || (phone && !email)) {
      if (!phone) return res.status(400).json({ error: 'Phone number is required' });

      // Try every common storage format so we find the user regardless of how
      // they registered (with +, without +, with leading 0, etc.)
      const stripped   = String(phone).replace(/^\+/, '');           // '233595367270'
      const withPlus   = `+${stripped}`;                             // '+233595367270'
      const localZero  = stripped.replace(/^233/, '0');              // '0595367270' (Ghana eg)
      const candidates = [...new Set([phone, withPlus, stripped, localZero])];

      console.log(`[phone login] trying formats:`, candidates);

      let data = null;
      for (const candidate of candidates) {
        const { data: row } = await supabaseAdmin.from('users').select('*').eq('phone', candidate).single();
        if (row) { data = row; break; }
      }
      if (!data) return res.status(404).json({ error: 'No account found for this phone number. Please register first.' });
      const token = jwt.sign({ userId: data.id, email: data.email }, JWT_SECRET, { expiresIn: '7d' });
      const nowPhone = new Date().toISOString();
      await supabaseAdmin.from('users').update({ last_login: nowPhone, last_seen_at: nowPhone }).eq('id', data.id);
      detectAndSaveCountry(data.id, req, phone).catch(() => {});
      let btcAddress = data.bitcoin_wallet_address;
      if (!isRealBtcAddress(btcAddress)) {
        btcAddress = await upgradeToHDAddress(data.id, data.username) || btcAddress;
      }
      return res.json({
        success: true,
        user: { id: data.id, email: data.email, username: data.username, full_name: data.full_name,
          average_rating: data.average_rating || 0, total_trades: data.total_trades || 0,
          avatar_url: data.avatar_url || null, is_admin: data.is_admin || false,
          is_moderator: data.is_moderator || false, referral_code: data.referral_code || null,
          bitcoin_wallet_address: btcAddress,
          total_referrals: data.total_referrals || 0,
          referral_earnings_btc: data.referral_earnings_btc || 0 },
        token,
      });
    }

    // ── Email + password login ────────────────────────────────────────────────
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('email', email).single();
    if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });
    const validPassword = await bcrypt.compare(password, data.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: data.id, email }, JWT_SECRET, { expiresIn: '7d' });
    const now = new Date().toISOString();
    await supabaseAdmin.from('users').update({ last_login: now, last_seen_at: now }).eq('id', data.id);
    detectAndSaveCountry(data.id, req).catch(() => {});

    // ── Auto-upgrade fake mock address to real HD wallet address ──────────
    let btcAddress = data.bitcoin_wallet_address;
    if (!isRealBtcAddress(btcAddress)) {
      console.log(`[login] Upgrading ${data.username} from fake address to real HD address`);
      btcAddress = await upgradeToHDAddress(data.id, data.username) || btcAddress;
    }

    res.json({
      success: true,
      user: { id: data.id, email: data.email, username: data.username, full_name: data.full_name,
        average_rating: data.average_rating || 0, total_trades: data.total_trades || 0,
        avatar_url: data.avatar_url || null, is_admin: data.is_admin || false,
        is_moderator: data.is_moderator || false, referral_code: data.referral_code || null,
        bitcoin_wallet_address: btcAddress,
        total_referrals: data.total_referrals || 0,
        referral_earnings_btc: data.referral_earnings_btc || 0 },
      token,
    });

    // Login alert email (fire and forget — never block login)
    emailService.sendLoginAlertEmail({ id: data.id, email: data.email, username: data.username })
      .catch(() => {});

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/auth/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const { data: user, error } = await supabaseAdmin.from('users').select('password_hash').eq('id', req.userId).single();
    if (error || !user) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const newHash = await bcrypt.hash(newPassword, 10);
    await supabaseAdmin.from('users').update({ password_hash: newHash, updated_at: new Date() }).eq('id', req.userId);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('[change-password]', error.message);
    res.status(500).json({ error: 'Password change failed. Please try again.' });
  }
});

// ── OTP (Twilio Verify) ───────────────────────────────────────────────────────

const toE164 = raw => {
  if (!raw) return null;
  const s = String(raw).trim();
  return s.startsWith('+') ? s : `+${s}`;
};

// Diagnostic endpoint — protected so only logged-in users can access
app.get('/api/auth/twilio-check', verifyToken, async (req, res) => {
  try {
    const sid = process.env.TWILIO_SID;
    const token = process.env.TWILIO_TOKEN;
    res.json({
      twilio_sid_set:   !!sid,
      twilio_token_set: !!token,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── OTP helpers ──────────────────────────────────────────────────────────────
// Uses local generation + Supabase otp_codes table + plain Twilio SMS.
// Run this SQL in Supabase once if the table doesn't exist:
//   create table if not exists otp_codes (
//     id         uuid primary key default gen_random_uuid(),
//     phone      text not null,
//     code       text not null,
//     expires_at timestamptz not null,
//     used       boolean not null default false,
//     created_at timestamptz not null default now()
//   );

async function storeOtp(contact, otp) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from('otp_codes')
    .insert({ phone: contact, code: otp, expires_at: expiresAt, used: false });
  if (error) throw new Error(`OTP store failed: ${error.message}`);
}

// ── Multi-channel OTP delivery: AT → Twilio SMS → Twilio WhatsApp ────────────
async function sendSmsOtp(phone, message) {
  const errs = [];

  // ── Channel 1: Africa's Talking (best delivery for GH/NG/KE/UG/TZ) ─────────
  if (atSms) {
    const senderId = process.env.AFRICASTALKING_SENDER_ID;
    // Try with custom sender ID first; if rejected, retry with AT default shortcode.
    // Custom sender IDs need carrier approval — unapproved IDs are silently dropped.
    const atAttempts = senderId ? [{ from: senderId }, {}] : [{}];
    let atDelivered = false;
    for (const extra of atAttempts) {
      try {
        const result = await atSms.send({ to: [phone], message, ...extra });
        const recip  = result?.SMSMessageData?.Recipients?.[0];
        console.log(`[SMS] AT attempt (sender=${extra.from || 'default'}):`, JSON.stringify(recip));
        if (recip?.statusCode === 101 || (recip?.status || '').toLowerCase() === 'success') {
          console.log(`[SMS] ✅ Africa's Talking → ${phone} via ${extra.from || 'default shortcode'}`);
          atDelivered = true;
          break;
        }
        const atErr = recip?.status || JSON.stringify(result?.SMSMessageData);
        console.warn(`[SMS] AT non-success (sender=${extra.from || 'default'}): ${atErr}`);
        errs.push(`AT(${extra.from || 'default'}): ${atErr}`);
      } catch (atErr) {
        console.warn(`[SMS] AT error (sender=${extra.from || 'default'}): ${atErr.message}`);
        errs.push(`AT: ${atErr.message}`);
      }
    }
    if (atDelivered) return;
  } else {
    errs.push('AT: not configured');
  }

  // ── Channel 2: Twilio SMS ────────────────────────────────────────────────────
  if (twilioClient && TWILIO_PHONE) {
    try {
      await twilioClient.messages.create({ body: message, from: TWILIO_PHONE, to: phone });
      console.log(`[SMS] ✅ Twilio SMS → ${phone}`);
      return;
    } catch (twilioErr) {
      console.warn(`[SMS] Twilio SMS failed (${twilioErr.code}): ${twilioErr.message}`);
      errs.push(`Twilio: ${twilioErr.message}`);
    }
  } else {
    errs.push('Twilio: not configured');
  }

  // ── Channel 3: Twilio WhatsApp (last resort — works if user has WhatsApp) ───
  if (twilioClient) {
    try {
      await twilioClient.messages.create({
        body: `*PRAQEN Verification* ⚡\n${message}`,
        from: TWILIO_WA_FROM,
        to:   `whatsapp:${phone}`,
      });
      console.log(`[SMS] ✅ Twilio WhatsApp → ${phone}`);
      return;
    } catch (waErr) {
      console.warn(`[SMS] Twilio WhatsApp failed: ${waErr.message}`);
      errs.push(`WhatsApp: ${waErr.message}`);
    }
  }

  throw new Error(`All SMS channels failed — ${errs.join(' | ')}`);
}

async function checkOtp(contact, token) {
  const { data, error } = await supabaseAdmin
    .from('otp_codes')
    .select('*')
    .eq('phone', contact)
    .eq('code', token)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;
  // mark used immediately so replay attacks fail
  await supabaseAdmin.from('otp_codes').update({ used: true }).eq('id', data.id);
  return data;
}

app.post('/api/auth/send-otp', otpLimiter, async (req, res) => {
  try {
    const { phone, email, channel } = req.body;
    const ch      = channel || 'email';
    const contact = ch === 'email' ? email : toE164(phone);
    if (!contact) return res.status(400).json({ error: 'Phone or email required' });

    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    const isDev = process.env.NODE_ENV !== 'production';

    if (ch === 'email') {
      // Store in all three places — any failure is non-fatal so email always fires
      verificationCodes.set(contact, { code: otp, expiresAt });
      storeOtp(contact, otp).catch(e => console.warn('[send-otp] DB store warn:', e.message));
      try {
        await supabaseAdmin.from('users').update({
          verification_code:         otp,
          verification_code_expires: new Date(expiresAt).toISOString(),
        }).eq('email', contact);
      } catch (e) {
        console.warn('[send-otp] User update warn:', e.message);
      }

      let emailSent = false;
      try {
        await sendVerificationEmail(contact, otp);
        emailSent = true;
      } catch (emailErr) {
        console.error('[send-otp email] failed:', emailErr.message);
      }

      console.log(`[OTP send] email to=${contact} sent=${emailSent} code=${otp}`);
      return res.json({
        success:  true,
        message:  emailSent ? 'Code sent! Check your inbox and spam folder.' : 'Email delivery issue — check spam, or use the code below if in dev mode.',
        devCode:  isDev ? otp : undefined,
        _hint:    isDev && !emailSent ? 'Dev mode: use devCode above to complete verification' : undefined,
      });
    } else {
      const limit = checkPhoneRateLimit(contact);
      if (limit.blocked) return res.status(429).json({ error: limit.error });

      let smsSent = false;
      try {
        await sendSmsOtp(contact, `Your PRAQEN code is: ${otp}. Valid 10 min. Do not share.`);
        smsSent = true;
      } catch (smsErr) {
        console.error('[send-otp sms] failed:', smsErr.message);
      }

      recordPhoneRequest(contact);
      console.log(`[OTP send] sms to=${contact} sent=${smsSent} code=${otp}`);
      return res.json({
        success: true,
        message: smsSent ? 'Code sent to your phone!' : 'SMS delivery issue. Check dev console for code.',
        devCode: isDev ? otp : undefined,
      });
    }
  } catch (error) {
    console.error('[OTP send error]', error);
    res.status(500).json({ error: 'Failed to send code. Please try again.' });
  }
});

app.post('/api/auth/send-phone-otp', otpLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const contact = toE164(phone);

    const limit = checkPhoneRateLimit(contact);
    if (limit.blocked) return res.status(429).json({ error: limit.error });

    // Block only if this phone is already verified by an account — not if it's merely saved/unverified
    const { data: existing } = await supabaseAdmin
      .from('users').select('id')
      .eq('phone', contact)
      .eq('is_phone_verified', true)
      .maybeSingle();
    if (existing) return res.status(400).json({ error: 'This phone number is already verified by another account.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    storeOtp(contact, otp).catch(e => console.warn('[send-phone-otp] DB store warn:', e.message));

    await sendSmsOtp(contact, `Your PRAQEN code is: ${otp}. Valid 10 min. Do not share.`);

    recordPhoneRequest(contact);
    console.log(`[OTP send-phone] to=${contact}`);
    res.json({ success: true, message: 'Code sent!' });
  } catch (error) {
    console.error('[OTP send-phone error]', error.message);
    res.status(500).json({ error: 'Failed to send code. Please try again.' });
  }
});

app.post('/api/auth/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { phone, email, code, channel, contact, otp } = req.body;
    const ch = channel || 'sms';
    const rawContact = ch === 'email' ? (email || contact) : (phone || contact);
    const normalizedContact = ch === 'email' ? rawContact : toE164(rawContact);
    const token = (code || otp || '').trim();

    if (!normalizedContact || !token) {
      return res.status(400).json({ error: 'Phone/email and code are required' });
    }
    if (token.length !== 6) {
      return res.status(400).json({ error: 'Enter the full 6-digit code' });
    }

    console.log(`[OTP verify] channel=${ch} contact=${normalizedContact} token=${token}`);

    // Lock check for SMS channel
    if (ch !== 'email') {
      const limit = checkPhoneRateLimit(normalizedContact);
      if (limit.blocked) return res.status(429).json({ error: limit.error });
    }

    const record = await checkOtp(normalizedContact, token);
    if (!record) {
      if (ch !== 'email') recordPhoneFailure(normalizedContact);
      return res.status(400).json({ error: 'Code expired or already used. Tap "Resend code" to get a new one.' });
    }

    // Update phone_verified flag for SMS verifications
    if (ch !== 'email') {
      try {
        await supabaseAdmin.from('users')
          .update({ phone_verified: true, phone: normalizedContact })
          .eq('phone', normalizedContact);
      } catch (_) {}
    }

    // Advance welcome bonus: step 1 (registered) → step 2 (verified, $1 locked)
    setImmediate(async () => {
      try {
        let q = supabaseAdmin.from('users').select('id, bonus_step, bonus_expires_at');
        q = ch !== 'email' ? q.eq('phone', normalizedContact) : q.eq('email', normalizedContact);
        const { data: bonusUser } = await q.single();
        if (bonusUser?.id && bonusUser.bonus_step === 1 &&
            bonusUser.bonus_expires_at && new Date(bonusUser.bonus_expires_at) > new Date()) {
          supabaseAdmin.from('users').update({ bonus_step: 2 }).eq('id', bonusUser.id).catch(() => {});
        }
      } catch (_) {}
    });

    console.log(`[OTP verify] success for ${normalizedContact}`);
    return res.json({ success: true, message: 'Verified!' });
  } catch (error) {
    console.error('[OTP verify unexpected error]', error.message);
    res.status(500).json({ error: `Verification failed: ${error.message}` });
  }
});

// ── Action 2FA — high-risk operations (release BTC, send BTC) ────────────────
// Step 1: request a one-time code   → POST /api/auth/send-action-code
// Step 2: include the code in the protected request body (actionCode field)

app.post('/api/auth/send-action-code', otpLimiter, verifyToken, async (req, res) => {
  try {
    const { action } = req.body;
    if (!actionCodeService.VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ error: 'Invalid action type.' });
    }

    const { data: user } = await supabaseAdmin
      .from('users').select('email, username').eq('id', req.userId).single();
    if (!user?.email) {
      return res.status(400).json({ error: 'No email address on your account. Please add one in Settings.' });
    }

    const code = actionCodeService.generate(req.userId, action);

    const actionLabels = { release_btc: 'Release Bitcoin', send_btc: 'Send Bitcoin' };
    const label = actionLabels[action] || action;

    await sendVerificationEmail(user.email, code,
      `PRAQEN Security Code — ${label}`);

    console.log(`[2FA] Action code sent to ${user.email} for action=${action} user=${req.userId.slice(0,8)}`);
    res.json({ success: true, message: `Security code sent to ${user.email}` });
  } catch (err) {
    console.error('[2FA send-action-code]', err.message);
    res.status(500).json({ error: 'Failed to send security code. Please try again.' });
  }
});

// ── Email Verification ────────────────────────────────────────────────────────

app.post('/api/auth/send-verification', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' });
    const code      = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Store in memory AND database so server restarts don't lose the code
    verificationCodes.set(email, { code, expiresAt });
    await supabaseAdmin.from('users').update({
      verification_code:         code,
      verification_code_expires: new Date(expiresAt).toISOString(),
    }).eq('email', email).throwOnError().catch(() => {}); // non-fatal if user not created yet

    let emailSent = false;
    let emailError = null;
    try {
      await sendVerificationEmail(email, code);
      emailSent = true;
    } catch (emailErr) {
      emailError = emailErr.message;
      console.error('❌ Send verification error:', emailErr.message);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    if (emailSent) {
      return res.json({ success: true, message: 'Verification code sent! Check your inbox (and spam/junk folder).', devCode: isDev ? code : undefined });
    }
    // Email failed but code is stored — return it in dev, show helpful message in prod
    return res.status(emailSent ? 200 : 500).json({
      success: false,
      error: 'We could not send the email right now. Please check your spam folder or try again in a moment.',
      devCode: isDev ? code : undefined, // dev only — never expose in production
    });
  } catch (error) {
    console.error('❌ Send verification error:', error);
    res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
    const codeStr = String(code).trim();
    if (codeStr.length !== 6) return res.status(400).json({ error: 'Enter the full 6-digit code' });

    let verified = false;

    // ── Tier 1: in-memory map ─────────────────────────────────────────────
    const mem = verificationCodes.get(email);
    if (mem) {
      if (Date.now() > mem.expiresAt) {
        verificationCodes.delete(email);
      } else if (mem.code === codeStr) {
        verificationCodes.delete(email);
        verified = true;
      } else {
        return res.status(400).json({ error: 'Invalid verification code.' });
      }
    }

    // ── Tier 2: users table (verification_code column) ────────────────────
    if (!verified) {
      const { data: dbUser } = await supabaseAdmin
        .from('users')
        .select('verification_code, verification_code_expires, is_email_verified')
        .eq('email', email).single();

      if (!dbUser) return res.status(400).json({ error: 'Account not found.' });
      if (dbUser.is_email_verified) return res.json({ success: true, message: 'Already verified. Please login.' });

      if (dbUser.verification_code && String(dbUser.verification_code) === codeStr) {
        if (new Date() <= new Date(dbUser.verification_code_expires)) {
          verified = true;
        } else {
          return res.status(400).json({ error: 'Verification code expired. Request a new one.' });
        }
      }
    }

    // ── Tier 3: otp_codes table (used by send-otp endpoint) ───────────────
    if (!verified) {
      const dbOtp = await checkOtp(email, codeStr);
      if (dbOtp) {
        verified = true;
      }
    }

    if (!verified) {
      return res.status(400).json({ error: 'Invalid or expired code. Request a new one.' });
    }

    // Mark user verified and clear the stored code
    await supabaseAdmin
      .from('users')
      .update({ is_email_verified: true, verification_code: null, verification_code_expires: null })
      .eq('email', email);

    const { data: user } = await supabaseAdmin.from('users').select('*').eq('email', email).single();
    const token = user ? jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '7d' }) : null;

    res.json({
      success: true,
      message: 'Email verified successfully!',
      token,
      user: user ? {
        id: user.id, email: user.email, username: user.username, full_name: user.full_name,
        average_rating: user.average_rating || 0, total_trades: user.total_trades || 0,
        avatar_url: user.avatar_url || null, is_admin: user.is_admin || false,
        is_moderator: user.is_moderator || false, referral_code: user.referral_code || null,
      } : null,
    });
  } catch (error) {
    console.error('Verify-code error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Aliases so both naming conventions work
app.post('/api/auth/send-verification-email', (req, res, next) => {
  req.url = '/api/auth/send-verification';
  app._router.handle(req, res, next);
});
app.post('/api/auth/verify-email', (req, res, next) => {
  req.url = '/api/auth/verify-code';
  app._router.handle(req, res, next);
});

// ============================================================
// AUTHENTICATED VERIFICATION ENDPOINTS
// Called from Profile page after user is logged in
// ============================================================

// POST /api/users/resend-verification — send email verification code to logged-in user
app.post('/api/users/resend-verification', verifyToken, async (req, res) => {
  try {
    const { data: user } = await supabaseAdmin
      .from('users').select('email, is_email_verified').eq('id', req.userId).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_email_verified) return res.json({ success: true, message: 'Email already verified' });
    if (!user.email) return res.status(400).json({ error: 'No email address on your account.' });

    const code      = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Store in memory and DB before sending
    verificationCodes.set(user.email, { code, expiresAt, userId: req.userId });
    await supabaseAdmin.from('users').update({
      verification_code:         code,
      verification_code_expires: new Date(expiresAt).toISOString(),
    }).eq('id', req.userId);

    let emailSent = false;
    try {
      await sendVerificationEmail(user.email, code);
      emailSent = true;
    } catch (emailErr) {
      console.error('[resend-verification] email failed:', emailErr.message);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`[resend-verification] Code for ${user.email}: ${code} | sent=${emailSent}`);

    if (emailSent) {
      return res.json({ success: true, message: 'Code sent! Check your inbox and spam/junk folder.', devCode: isDev ? code : undefined });
    }
    // Code stored in DB — user can still verify, and we show code in dev
    return res.json({
      success: true,
      message: 'Email delivery had an issue. If you don\'t see an email within 2 minutes, check your spam folder and try again.',
      devCode: isDev ? code : undefined,
      _hint: isDev ? 'Dev mode: use devCode above to bypass email' : undefined,
    });
  } catch (err) {
    console.error('[resend-verification]', err.message);
    res.status(500).json({ error: 'Could not send verification email. Please try again.' });
  }
});

// POST /api/users/verify-email-code — verify code entered from profile
app.post('/api/users/verify-email-code', verifyToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || String(code).length !== 6) return res.status(400).json({ error: 'Enter the full 6-digit code' });

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('email, verification_code, verification_code_expires, is_email_verified')
      .eq('id', req.userId).single();

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_email_verified) return res.json({ success: true, message: 'Already verified' });

    // In-memory check first (fast path)
    const mem = verificationCodes.get(user.email);
    if (mem) {
      if (Date.now() > mem.expiresAt) {
        verificationCodes.delete(user.email);
        return res.status(400).json({ error: 'Code expired. Request a new one.' });
      }
      if (mem.code !== String(code)) return res.status(400).json({ error: 'Invalid code. Check and try again.' });
      verificationCodes.delete(user.email);
    } else {
      // DB fallback (handles server restarts)
      if (!user.verification_code) return res.status(400).json({ error: 'No code found. Request a new one.' });
      if (new Date() > new Date(user.verification_code_expires)) return res.status(400).json({ error: 'Code expired. Request a new one.' });
      if (String(user.verification_code) !== String(code)) return res.status(400).json({ error: 'Invalid code. Check and try again.' });
    }

    await supabaseAdmin.from('users').update({
      is_email_verified:         true,
      email_verified:            true,
      verification_code:         null,
      verification_code_expires: null,
    }).eq('id', req.userId);

    res.json({ success: true, message: 'Email verified successfully!' });
  } catch (err) {
    console.error('[verify-email-code]', err.message);
    res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

// POST /api/users/send-phone-otp
// method: 'email'     -> 6-digit code sent to the user's registered email
// method: 'whatsapp'  -> 6-digit code sent via Twilio WhatsApp
// Phone is NOT saved here — it is saved only when the user successfully verifies (verify-phone-otp).
app.post('/api/users/send-phone-otp', otpLimiter, verifyToken, async (req, res) => {
  try {
    const { phone, method = 'email' } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    if (!['email', 'sms', 'whatsapp'].includes(method)) {
      return res.status(400).json({ error: 'Delivery method must be "email", "sms", or "whatsapp"' });
    }

    // Normalise: strip spaces/dashes/parens, add + if missing, strip leading 0
    const cleaned = String(phone).replace(/[\s\-()]/g, '');
    const e164    = cleaned.startsWith('+') ? cleaned : `+${cleaned.replace(/^0+/, '')}`;

    if (!/^\+[1-9]\d{6,14}$/.test(e164)) {
      return res.status(400).json({ error: 'Invalid phone number. Use international format, e.g. +233XXXXXXXXX for Ghana or +234XXXXXXXXXX for Nigeria.' });
    }

    const limit = checkPhoneRateLimit(e164);
    if (limit.blocked) return res.status(429).json({ error: limit.error });

    // Block only if THIS number is VERIFIED on another account (unverified is OK)
    const { data: claimedByOther } = await supabaseAdmin.from('users')
      .select('id').eq('phone', e164).eq('is_phone_verified', true).neq('id', req.userId).maybeSingle();
    if (claimedByOther) {
      return res.status(400).json({ error: 'This phone number is already verified on another account.' });
    }

    // Generate OTP and store in memory (primary) — DB store is best-effort
    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresMs = Date.now() + 10 * 60 * 1000;
    otpStore.set(e164, { otp, expires: expiresMs });

    // Best-effort DB backup so OTP survives a server restart
    supabaseAdmin.from('otp_codes').insert({
      phone: e164, code: otp, expires_at: new Date(expiresMs).toISOString(), used: false,
    }).then(() => {}).catch(dbErr => console.warn('[send-phone-otp] DB backup warn:', dbErr.message));

    recordPhoneRequest(e164);
    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`[send-phone-otp] method=${method} e164=${e164}`);

    // ── Email ──────────────────────────────────────────────────────────────────
    if (method === 'email') {
      const { data: userRow, error: userErr } = await supabaseAdmin
        .from('users').select('email').eq('id', req.userId).single();
      if (userErr) {
        console.error('[send-phone-otp] DB lookup failed:', userErr.message);
        return res.status(500).json({ error: 'Could not look up your account. Please try again.' });
      }
      if (!userRow?.email) {
        return res.status(400).json({ error: 'No email address found on your account.' });
      }
      try {
        await sendVerificationEmail(userRow.email, otp);
        console.log(`[send-phone-otp] Email OTP → ${userRow.email}`);
        return res.json({
          success: true,
          message: `Verification code sent to ${userRow.email}`,
          devCode: isDev ? otp : undefined,
        });
      } catch (emailErr) {
        console.error('[send-phone-otp] Email send error:', emailErr.message);
        return res.status(500).json({
          error: 'Email delivery failed. Check your spam folder or try the WhatsApp option.',
          devCode: isDev ? otp : undefined,
        });
      }
    }

    // ── SMS ────────────────────────────────────────────────────────────────────
    if (method === 'sms') {
      // ── Primary: Twilio Verify (best international OTP delivery) ────────────
      if (twilioClient && twilioVerifySid) {
        try {
          await twilioClient.verify.v2.services(twilioVerifySid).verifications.create({ to: e164, channel: 'sms' });
          // Twilio manages the OTP code — mark this number as pending Twilio Verify
          twilioVerifyPending.set(e164, { expires: Date.now() + 10 * 60 * 1000 });
          console.log(`[send-phone-otp] ✅ Twilio Verify SMS → ${e164}`);
          return res.json({ success: true, message: `Verification code sent via SMS to ${e164}` });
        } catch (verifyErr) {
          console.warn(`[send-phone-otp] Twilio Verify failed (${verifyErr.code}): ${verifyErr.message} — falling back`);
        }
      }
      // ── Fallback: Africa's Talking / Twilio direct ────────────────────────
      try {
        await sendSmsOtp(e164, `Your PRAQEN code is: ${otp}. Valid 10 min. Do not share.`);
        console.log(`[send-phone-otp] SMS OTP (fallback) → ${e164}`);
        return res.json({
          success: true,
          message: `Code sent via SMS to ${e164}`,
          devCode: isDev ? otp : undefined,
        });
      } catch (smsErr) {
        console.error('[send-phone-otp] SMS error:', smsErr.message);
        return res.status(500).json({
          error: 'SMS delivery failed. Please try the email option instead.',
          devCode: isDev ? otp : undefined,
        });
      }
    }

    // ── WhatsApp ───────────────────────────────────────────────────────────────
    if (method === 'whatsapp') {
      if (!twilioClient) {
        return res.status(500).json({
          error: 'WhatsApp is not configured on this server. Please use the email option.',
          devCode: isDev ? otp : undefined,
        });
      }
      // ── Primary: Twilio Verify WhatsApp (more reliable than sandbox) ────────
      if (twilioVerifySid) {
        try {
          await twilioClient.verify.v2.services(twilioVerifySid).verifications.create({ to: e164, channel: 'whatsapp' });
          twilioVerifyPending.set(e164, { expires: Date.now() + 10 * 60 * 1000 });
          console.log(`[send-phone-otp] ✅ Twilio Verify WhatsApp → ${e164}`);
          return res.json({ success: true, message: 'Verification code sent via WhatsApp' });
        } catch (verifyWaErr) {
          console.warn(`[send-phone-otp] Twilio Verify WhatsApp failed (${verifyWaErr.code}): ${verifyWaErr.message} — falling back to sandbox`);
        }
      }
      // ── Fallback: Twilio WhatsApp sandbox ─────────────────────────────────
      try {
        await twilioClient.messages.create({
          body: `*PRAQEN Phone Verification*\n\nYour code: *${otp}*\n\nValid 10 minutes. Never share this code.`,
          from: TWILIO_WA_FROM,
          to:   `whatsapp:${e164}`,
        });
        console.log(`[send-phone-otp] WhatsApp OTP (sandbox) → ${e164}`);
        return res.json({
          success: true,
          message: 'Code sent via WhatsApp',
          devCode: isDev ? otp : undefined,
        });
      } catch (waErr) {
        console.error('[send-phone-otp] WhatsApp error:', waErr.message);
        return res.status(500).json({
          error: 'WhatsApp delivery failed. Please use the email option instead.',
          devCode: isDev ? otp : undefined,
        });
      }
    }

  } catch (err) {
    console.error('[send-phone-otp] OUTER ERROR:', err.message, err.stack);
    res.status(500).json({ error: `OTP send failed: ${err.message}` });
  }
});

// POST /api/users/submit-phone — save phone for manual admin review (no OTP)
// User submits their number → saved to users.phone + phone_verification_requests → admin approves → user notified.
app.post('/api/users/submit-phone', verifyToken, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    // Clean the number — strip spaces, dashes, parentheses
    let e164 = phone.trim().replace(/[\s\-()]/g, '');
    if (!e164.startsWith('+')) {
      return res.status(400).json({ error: 'Please include your country code. Use international format, e.g. +233XXXXXXXXX for Ghana or +234XXXXXXXXXX for Nigeria.' });
    }

    // Check if THIS user already has a phone saved — once submitted, it cannot be changed
    const { data: currentUser, error: fetchErr } = await supabaseAdmin
      .from('users').select('id, phone, is_phone_verified').eq('id', req.userId).maybeSingle();
    if (fetchErr) {
      console.error('[submit-phone] fetch user failed:', fetchErr.message);
      return res.status(500).json({ error: 'Could not verify account. Please try again.' });
    }
    if (currentUser?.phone) {
      if (currentUser.phone === e164) {
        // Idempotent: same number already saved — ensure request row exists and return success
        await supabaseAdmin.from('phone_verification_requests').upsert(
          { user_id: req.userId, phone: e164, status: currentUser.is_phone_verified ? 'approved' : 'pending' },
          { onConflict: 'user_id', ignoreDuplicates: true }
        ).catch(() => {});
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'A phone number has already been submitted for your account. It cannot be changed while under review.' });
    }

    // One phone = one account — block if number belongs to someone else
    const { data: existing } = await supabaseAdmin
      .from('users').select('id').eq('phone', e164).neq('id', req.userId).maybeSingle();
    if (existing) return res.status(400).json({ error: 'This number is already registered to another account.' });

    // ── Step 1: Save phone to users table ───────────────────────────────────
    const { data: savedUser, error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ phone: e164, updated_at: new Date().toISOString() })
      .eq('id', req.userId)
      .select('id, phone')
      .single();

    if (updateErr) {
      console.error('[submit-phone] users.update failed:', updateErr.message, '| code:', updateErr.code);
      return res.status(400).json({ error: 'Could not save phone number: ' + updateErr.message });
    }
    if (!savedUser?.phone) {
      console.error('[submit-phone] update returned no row — user may not exist:', req.userId);
      return res.status(400).json({ error: 'Could not save phone number. Please try again.' });
    }

    // ── Step 2: Track in phone_verification_requests ──────────────────────
    const { error: reqErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .upsert(
        { user_id: req.userId, phone: e164, status: 'pending', submitted_at: new Date().toISOString() },
        { onConflict: 'user_id', ignoreDuplicates: false }
      );
    if (reqErr) {
      // Table may not exist yet — log but don't fail the request
      console.warn('[submit-phone] phone_verification_requests upsert failed (table may not exist yet):', reqErr.message);
    }

    // ── Step 3: In-app notification ───────────────────────────────────────
    try {
      await createNotification(
        req.userId, 'kyc',
        '📱 Phone Number Received',
        `We've received your number (${e164}) and it's now under review. You'll be notified once it's approved — usually within 24 hours.`,
        '/settings?tab=verification'
      );
    } catch (_) {}

    console.log(`[submit-phone] ✅ ${req.userId.slice(0,8)} submitted ${e164} — saved to users.phone and phone_verification_requests`);
    res.json({ success: true, phone: savedUser.phone });
  } catch (err) {
    console.error('[submit-phone] unexpected error:', err.message);
    res.status(500).json({ error: 'Could not save phone number. Please try again.' });
  }
});

// POST /api/users/verify-phone-otp — verify phone OTP and mark phone verified
app.post('/api/users/verify-phone-otp', verifyToken, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });

    // Normalise phone the same way send-phone-otp does (strip spaces/dashes, add +, remove leading 0)
    const cleaned = String(phone).replace(/[\s\-()]/g, '');
    const e164    = cleaned.startsWith('+') ? cleaned : `+${cleaned.replace(/^0+/, '')}`;
    const code    = String(otp).trim();

    if (code.length !== 6) return res.status(400).json({ error: 'Enter the full 6-digit code' });

    // Only block if the account is locked due to too many failed attempts.
    // Do NOT apply the send-cooldown here — the user just received an OTP and
    // needs to verify it immediately, often within the same 60-second window.
    const limRec = phoneRateLimits.get(e164);
    if (limRec?.lockedUntil && Date.now() < limRec.lockedUntil) {
      const mins = Math.ceil((limRec.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${mins} minute(s).` });
    }

    let verified = false;

    // ── Path 1: Twilio Verify (used when SMS/WhatsApp sent via Twilio Verify) ─
    const tvPending = twilioVerifyPending.get(e164);
    if (tvPending && twilioClient && twilioVerifySid) {
      try {
        const check = await twilioClient.verify.v2.services(twilioVerifySid)
          .verificationChecks.create({ to: e164, code });
        if (check.status === 'approved') {
          twilioVerifyPending.delete(e164);
          verified = true;
          console.log(`[verify-phone-otp] ✅ Twilio Verify approved for ${e164}`);
        } else {
          console.warn(`[verify-phone-otp] Twilio Verify status: ${check.status} for ${e164}`);
        }
      } catch (tvErr) {
        console.warn(`[verify-phone-otp] Twilio Verify check error: ${tvErr.message} — falling back to stored OTP`);
      }
    }

    // ── Path 2: In-memory OTP (fast path, used when sent via AT/direct SMS) ───
    if (!verified) {
      const stored = otpStore.get(e164);
      if (stored && String(stored.otp) === code && Date.now() <= stored.expires) {
        otpStore.delete(e164);
        verified = true;
      }
    }

    // ── Path 3: DB fallback (handles server restarts) ─────────────────────────
    if (!verified) {
      const dbRecord = await checkOtp(e164, code);
      if (dbRecord) verified = true;
    }

    if (!verified) {
      recordPhoneFailure(e164);
      return res.status(400).json({ error: 'Invalid or expired code. Tap "Resend" to get a new one.' });
    }

    await supabaseAdmin.from('users').update({
      phone:             e164,
      is_phone_verified: true,
      phone_verified:    true,
      updated_at:        new Date().toISOString(),
    }).eq('id', req.userId);

    res.json({ success: true, message: 'Phone number verified!' });
  } catch (err) {
    console.error('[verify-phone-otp]', err.message);
    res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

// POST /api/kyc/upload — receive base64 ID front + back, store in Supabase Storage, set status pending
app.post('/api/kyc/upload', verifyToken, async (req, res) => {
  try {
    const { idImage, idImageBack, idType = 'national_id' } = req.body;
    if (!idImage)     return res.status(400).json({ error: 'Front of ID card is required' });
    if (!idImageBack) return res.status(400).json({ error: 'Back of ID card is required — please upload both front and back' });

    const userId    = req.userId;
    const timestamp = Date.now();

    // Strip base64 prefix and convert to buffer
    const toBuffer = (b64) => Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    let idUrl     = null;
    let idBackUrl = null;

    // Try Supabase Storage upload (bucket: kyc-documents)
    try {
      const { error: idErr } = await supabaseAdmin.storage
        .from('kyc-documents')
        .upload(`${userId}/id_front_${timestamp}.jpg`, toBuffer(idImage), { contentType: 'image/jpeg', upsert: true });

      const { error: idBackErr } = await supabaseAdmin.storage
        .from('kyc-documents')
        .upload(`${userId}/id_back_${timestamp}.jpg`, toBuffer(idImageBack), { contentType: 'image/jpeg', upsert: true });

      if (!idErr) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from('kyc-documents').getPublicUrl(`${userId}/id_front_${timestamp}.jpg`);
        idUrl = publicUrl;
      }
      if (!idBackErr) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from('kyc-documents').getPublicUrl(`${userId}/id_back_${timestamp}.jpg`);
        idBackUrl = publicUrl;
      }
    } catch (storageErr) {
      console.warn('[kyc/upload] Storage upload failed (bucket may not exist):', storageErr.message);
    }

    // Always mark user as pending regardless of storage success
    // DB columns: id_front_url, id_back_url, id_type, selfie_url
    const { error: dbErr } = await supabaseAdmin.from('users').update({
      kyc_status:       'pending',
      id_type:          idType,
      kyc_submitted_at: new Date().toISOString(),
      id_front_url:     idUrl,
      id_back_url:      idBackUrl,
      selfie_url:       null,
      updated_at:       new Date().toISOString(),
    }).eq('id', userId);
    if (dbErr) {
      console.error('[kyc/upload] DB update failed:', dbErr.message);
      const { error: minErr } = await supabaseAdmin.from('users').update({
        kyc_status: 'pending',
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
      if (minErr) {
        console.error('[kyc/upload] Minimal DB update also failed:', minErr.message);
        return res.status(500).json({ error: 'Database not ready. Please contact support.' });
      }
    }

    // In-app notification for user
    await supabaseAdmin.from('notifications').insert({
      user_id:    userId,
      type:       'kyc',
      title:      '📋 KYC Submitted — Under Review',
      message:    'Your identity documents have been submitted. We will review within 24 hours and update your profile.',
      action:     '/profile',
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    console.log(`[kyc/upload] KYC submitted by user ${userId}`);
    res.json({ success: true, message: 'Documents submitted! We will review within 24 hours.' });
  } catch (err) {
    console.error('[kyc/upload]', err.message);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// GET /api/kyc/status — returns current KYC status for the logged-in user
app.get('/api/kyc/status', verifyToken, async (req, res) => {
  try {
    let { data, error } = await supabaseAdmin.from('users')
      .select('kyc_status, id_type, kyc_submitted_at, id_front_url, id_back_url, kyc_rejection_reason, is_id_verified')
      .eq('id', req.userId).single();
    if (error) {
      const fallback = await supabaseAdmin.from('users')
        .select('is_id_verified, kyc_status')
        .eq('id', req.userId).single();
      if (fallback.error) return res.status(500).json({ error: fallback.error.message });
      data = fallback.data;
    }
    res.json({
      kyc_status:           data?.kyc_status           || null,
      kyc_id_type:          data?.id_type              || null,
      kyc_submitted_at:     data?.kyc_submitted_at     || null,
      kyc_id_url:           data?.id_front_url         || null,
      kyc_id_back_url:      data?.id_back_url          || null,
      kyc_rejection_reason: data?.kyc_rejection_reason || null,
      is_id_verified:       data?.is_id_verified       || false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Resend verification code
app.post('/api/auth/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { data: user } = await supabaseAdmin.from('users').select('id, is_email_verified').eq('email', email).single();
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.is_email_verified) return res.status(400).json({ error: 'Email is already verified' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    verificationCodes.set(email, { code, expiresAt, userId: user.id });
    await supabaseAdmin.from('users').update({
      verification_code: code,
      verification_code_expires: new Date(expiresAt).toISOString(),
    }).eq('email', email).catch(() => {});

    let emailSent = false;
    try {
      await sendVerificationEmail(email, code);
      emailSent = true;
    } catch (emailErr) {
      console.error('[resend-code email] failed:', emailErr.message);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`[resend-code] email=${email} sent=${emailSent} code=${code}`);
    res.json({
      success: true,
      message: emailSent ? 'New verification code sent — check your inbox' : 'Email delivery issue — use devCode if in dev mode',
      devCode: isDev ? code : undefined,
    });
  } catch (error) {
    console.error('Resend-code error:', error);
    res.status(500).json({ error: 'Failed to resend code' });
  }
});

// ============================================================
// USER ROUTES
// ============================================================

// Trigger badge check + return current badge status for logged-in user
app.post('/api/users/check-badges', verifyToken, async (req, res) => {
  try {
    await checkAndAwardBadges(req.userId);
    const { data } = await supabaseAdmin
      .from('user_badges')
      .select('badge_name, is_unlocked, unlocked_at')
      .eq('user_id', req.userId);
    res.json({ success: true, badges: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/heartbeat', verifyToken, async (req, res) => {
  try {
    await supabaseAdmin.from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', req.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lightweight batch endpoint — returns fresh last_seen_at for a list of user IDs.
// Used by marketplace pages to show real-time online status without re-fetching full listings.
app.get('/api/users/online-status', async (req, res) => {
  try {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(id => UUID_RE.test(id)).slice(0, 100);
    if (ids.length === 0) return res.json({ status: {} });
    const { data } = await supabaseAdmin.from('users').select('id, last_seen_at, last_login').in('id', ids);
    const status = {};
    (data || []).forEach(u => { status[u.id] = u.last_seen_at || u.last_login || null; });
    res.json({ status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/me/security — returns caller's real IP + geo for the Settings page
app.get('/api/me/security', verifyToken, async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || '';

    // Strip IPv6 loopback wrapper
    const cleanIp = ip.replace(/^::ffff:/, '');

    const isPrivate = !cleanIp || cleanIp === '::1'
      || cleanIp.startsWith('127.')
      || cleanIp.startsWith('192.168.')
      || cleanIp.startsWith('10.')
      || cleanIp.startsWith('172.');

    if (isPrivate) {
      // Running locally — return stored user data instead
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('country, country_name, city, last_seen_location')
        .eq('id', req.userId).single();
      return res.json({
        ip: cleanIp || '127.0.0.1 (local)',
        country_code: u?.country || null,
        country: u?.country_name || null,
        city: u?.city || null,
        location: u?.last_seen_location || null,
        source: 'stored',
      });
    }

    // Fetch live geo from ipapi.co (same service used during login)
    const geoRes = await fetch(`https://ipapi.co/${cleanIp}/json/`, { signal: AbortSignal.timeout(5000) });
    const geo = await geoRes.json();

    if (geo?.country_code && !geo.error) {
      const cc   = geo.country_code.toUpperCase();
      const city = geo.city || null;
      const name = geo.country_name || null;
      const loc  = city ? `${name} (${city})` : name;

      // Save fresh geo to user profile in background
      supabaseAdmin.from('users')
        .update({ city, country_name: name, last_seen_location: loc, country: cc })
        .eq('id', req.userId)
        .or('country.is.null,country.eq.')
        .then(() => {}).catch(() => {});

      return res.json({ ip: cleanIp, country_code: cc, country: name, city, location: loc, source: 'live' });
    }

    // ipapi.co gave no result — return stored data
    const { data: u } = await supabaseAdmin
      .from('users')
      .select('country, country_name, city, last_seen_location')
      .eq('id', req.userId).single();
    res.json({
      ip: cleanIp,
      country_code: u?.country || null,
      country: u?.country_name || null,
      city: u?.city || null,
      location: u?.last_seen_location || null,
      source: 'stored',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Welcome bonus status ────────────────────────────────────────────────────────
app.get('/api/bonus/status', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users')
      .select('bonus_step, bonus_expires_at, bonus_unlocked_at')
      .eq('id', req.userId).single();
    if (error || !data) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const expires = data.bonus_expires_at ? new Date(data.bonus_expires_at) : null;
    const expired = expires ? now > expires : false;
    const msLeft = expires ? Math.max(0, expires - now) : 0;

    // Fetch BTC price for USD→BTC conversion
    let btcPrice = 88000;
    try {
      const pr = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      const pd = await pr.json();
      btcPrice = parseFloat(pd.data.amount) || 88000;
    } catch (_) {}

    const step = expired && data.bonus_step < 3 ? 0 : (data.bonus_step || 0);
    const bonusBtcLocked  = parseFloat((1 / btcPrice).toFixed(8));
    const bonusBtcTotal   = parseFloat((2 / btcPrice).toFixed(8));

    res.json({
      step,
      bonus_expires_at:  data.bonus_expires_at,
      bonus_unlocked_at: data.bonus_unlocked_at,
      expired,
      ms_remaining: msLeft,
      btc_price: btcPrice,
      locked_btc:   step === 2 ? bonusBtcLocked : 0,
      unlocked_btc: step === 3 ? bonusBtcTotal  : 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/profile', verifyToken, async (req, res) => {
  try {
    // Core columns — confirmed to exist in every PRAQEN DB schema
    const { data, error } = await supabaseAdmin.from('users')
      .select('id, email, username, full_name, bio, location, website, phone, avatar_url, average_rating, total_trades, completion_rate, created_at, is_admin, is_moderator, is_id_verified, is_email_verified, is_phone_verified, total_feedback_count, positive_feedback, negative_feedback, last_login, last_seen_at, badge, country')
      .eq('id', req.userId).single();
    if (error) {
      console.error('[GET /api/users/profile] DB error:', error.message);
      return res.status(500).json({ error: 'Could not load your profile. Please try again.' });
    }
    if (!data) return res.status(404).json({ error: 'Profile not found.' });

    // Optional columns — isolated so a missing column never breaks the response
    let extraFields = {};
    try {
      const { data: extra } = await supabaseAdmin.from('users')
        .select('email_verified, is_phone_verified, phone_verified, kyc_verified, kyc_status, id_type, kyc_submitted_at, id_front_url, id_back_url, selfie_url, kyc_rejection_reason, username_changed, preferred_currency, preferred_language, timezone, hide_full_name, name_display, city, country_name, last_seen_location, referral_code, total_referrals, referral_earnings_btc')
        .eq('id', req.userId).single();
      if (extra) extraFields = extra;
    } catch {}

    // Balance — non-critical, silently ignored on error
    let balance = { balance_btc: 0, balance_usd: 0 };
    try {
      const { data: bal } = await supabaseAdmin.from('user_balances').select('balance_btc, balance_usd').eq('user_id', req.userId).single();
      if (bal) balance = bal;
    } catch {}

    res.json({
      user: {
        ...data,
        ...extraFields,
        is_admin: data.is_admin || false,
        is_moderator: data.is_moderator || false,
      },
      balance,
    });
  } catch (error) {
    console.error('[GET /api/users/profile] Unexpected error:', error.message);
    res.status(500).json({ error: 'Could not load your profile. Please try again.' });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  try {
    const param  = req.params.userId?.trim();
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
    // Core fields — referral fields included directly to avoid silent failure in secondary query
    const coreFields = 'id, username, full_name, bio, location, website, avatar_url, average_rating, total_trades, completion_rate, created_at, is_admin, is_moderator, is_id_verified, is_email_verified, is_phone_verified, total_feedback_count, positive_feedback, negative_feedback, last_login, last_seen_at, badge, country, referral_code, total_referrals, referral_earnings_btc';

    let data = null;

    // Try UUID lookup first
    if (isUUID) {
      const { data: byId } = await supabaseAdmin.from('users').select(coreFields).eq('id', param).single();
      data = byId;
    }

    // Fall back to username lookup (handles /profile/username URLs)
    if (!data) {
      const { data: byUsername } = await supabaseAdmin.from('users').select(coreFields).eq('username', param).single();
      data = byUsername;
    }

    if (!data) return res.status(404).json({ error: 'User not found. They may have changed their username or the profile may no longer exist.' });

    // Optional extra fields — silently ignored if columns don't exist
    let extraFields = {};
    try {
      const { data: extra } = await supabaseAdmin.from('users')
        .select('referral_code, total_referrals, referral_earnings_btc')
        .eq('id', data.id).single();
      if (extra) extraFields = extra;
    } catch {}

    // Affiliate trade count — how many commission-generating trades their referrals made
    let referral_trade_count = 0;
    try {
      const { count } = await supabaseAdmin
        .from('affiliate_earnings')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', data.id);
      if (count != null) referral_trade_count = count;
    } catch {}

    // Reviews — silently ignored if table doesn't exist
    let reviews = [];
    try {
      const { data: rv } = await supabaseAdmin.from('reviews')
        .select('*, reviewer:reviewer_id(id, username)').eq('reviewee_id', data.id)
        .order('created_at', { ascending: false }).limit(20);
      reviews = rv || [];
    } catch {}

    res.json({ user: { ...data, ...extraFields, referral_trade_count }, reviews });
  } catch (error) {
    console.error('[GET /api/users/:userId]', error.message);
    res.status(500).json({ error: 'We couldn\'t load this profile right now. Please try again.' });
  }
});

app.put('/api/users/profile', verifyToken, async (req, res) => {
  try {
    const { username, full_name, fullName, bio, location, website, phone, hide_full_name, name_display } = req.body;

    // Fetch current user to enforce rules
    const { data: current } = await supabaseAdmin.from('users').select('username, full_name, username_changed_at, is_id_verified, full_name_changed_at').eq('id', req.userId).single();

    const updateData = {};

    // Username: allowed only if never changed before
    if (username !== undefined && username.trim() !== current?.username) {
      if (current?.username_changed_at) {
        return res.status(403).json({ error: 'Username can only be changed once.' });
      }
      updateData.username            = username.trim();
      updateData.username_changed_at = new Date().toISOString();
    }

    // Full name: locked after first change OR after ID verification
    if (full_name !== undefined || fullName !== undefined) {
      const newName = full_name ?? fullName;
      if (current?.is_id_verified) {
        return res.status(403).json({ error: 'Full name cannot be changed after ID verification.' });
      }
      if (current?.full_name_changed_at && newName !== current?.full_name) {
        return res.status(403).json({ error: 'Full name can only be changed once.' });
      }
      if (newName !== current?.full_name) {
        updateData.full_name_changed_at = new Date().toISOString();
      }
      updateData.full_name = newName;
    }

    if (bio            !== undefined) updateData.bio            = bio;
    if (location       !== undefined) updateData.location       = location;
    if (website        !== undefined) updateData.website        = website;
    if (phone          !== undefined) updateData.phone          = phone;
    if (hide_full_name !== undefined) updateData.hide_full_name = hide_full_name;
    if (name_display   !== undefined) updateData.name_display   = name_display;
    updateData.updated_at = new Date().toISOString();

    let { data, error } = await supabaseAdmin.from('users').update(updateData).eq('id', req.userId).select().single();
    // Retry up to 3 times, stripping any column the DB says doesn't exist
    for (let i = 0; i < 3 && error; i++) {
      const missing = error.message?.match(/['"]?([\w_]+)['"]?\s+column[^']*(?:schema cache|not found|does not exist)/i) ||
                     error.message?.match(/find the ['"]?([\w_]+)['"]?\s+column/i);
      if (!missing) break;
      const col = missing[1];
      if (!updateData[col]) break;
      console.warn(`[profile PUT] Column '${col}' not in schema — retrying without it`);
      delete updateData[col];
      ({ data, error } = await supabaseAdmin.from('users').update(updateData).eq('id', req.userId).select().single());
    }
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, user: data });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/payment-methods', verifyToken, async (req, res) => {
  try {
    const { bankName, accountNumber, mobileProvider, mobileNumber, bankAccount, mobileMoney, mobileMoneyNumber } = req.body;
    const updateData = {
      bank_name:       bankName       || bankAccount       || null,
      account_number:  accountNumber                       || null,
      mobile_provider: mobileProvider || mobileMoney       || null,
      mobile_number:   mobileNumber   || mobileMoneyNumber || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from('users').update(updateData).eq('id', req.userId).select().single();
    if (error) { console.warn('[payment-methods] Column may not exist yet:', error.message); return res.json({ success: true }); }
    res.json({ success: true, user: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/upload-avatar', verifyToken, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });
    if (!image.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image format' });
    const { data, error } = await supabaseAdmin.from('users')
      .update({ avatar_url: image, updated_at: new Date().toISOString() })
      .eq('id', req.userId).select('id, username, avatar_url').single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'User not found' });
    // Bust the per-user avatar cache so the new photo shows immediately
    delete _avatarCache[req.userId];
    res.json({ success: true, avatar_url: data.avatar_url, message: 'Profile picture updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// In-memory per-user avatar cache (1-hour TTL) — prevents re-fetching large base64 blobs
const _avatarCache = {};
app.get('/api/users/:userId/avatar', async (req, res) => {
  try {
    const { userId } = req.params;
    const cached = _avatarCache[userId];
    if (cached && Date.now() - cached.ts < 3600000) {
      return res.json({ avatar_url: cached.url });
    }
    const { data } = await supabaseAdmin.from('users').select('avatar_url').eq('id', userId).maybeSingle();
    const url = data?.avatar_url || null;
    _avatarCache[userId] = { url, ts: Date.now() };
    res.json({ avatar_url: url });
  } catch { res.json({ avatar_url: null }); }
});

app.get('/api/users/:userId/reviews', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('reviews')
      .select('*, reviewer:reviewer_id(username)').eq('reviewee_id', req.params.userId)
      .order('created_at', { ascending: false });
    if (error) return res.json({ reviews: [] });
    res.json({ reviews: data || [] });  // ← FIXED: was `reviews` (undefined), now `data`
  } catch { res.json({ reviews: [] }); }
});

// ============================================================
// BALANCE ROUTES
// ============================================================

app.get('/api/user/balance', verifyToken, async (req, res) => {
  try {
    const [{ data, error }, btcPrice] = await Promise.all([
      supabaseAdmin.from('user_balances').select('balance_btc').eq('user_id', req.userId).single(),
      getCurrentBTCPrice().catch(() => 88000),
    ]);
    if (error && error.code === 'PGRST116') {
      await supabaseAdmin.from('user_balances').insert([{ user_id: req.userId, balance_btc: 0, balance_usd: 0 }]);
      return res.json({ balance_btc: 0, balance_usd: 0, btc_price: btcPrice });
    }
    if (error) return res.status(400).json({ error: error.message });
    const balBtc = parseFloat(data?.balance_btc || 0);
    const balUsd = parseFloat((balBtc * btcPrice).toFixed(2));
    console.log(`[/api/user/balance] user=${req.userId.slice(0,8)} btc=${balBtc} price=${btcPrice} usd=${balUsd}`);
    res.json({ balance_btc: balBtc, balance_usd: balUsd, btc_price: btcPrice });
  } catch (error) {
    res.json({ balance_btc: 0, balance_usd: 0, btc_price: 88000 });
  }
});

// DEV ENDPOINT DISABLED — manual balance injection is not allowed in production.
// All BTC balances must come from real on-chain deposits monitored by depositMonitor.js.
app.post('/api/user/add-balance', verifyToken, (req, res) => {
  res.status(403).json({ error: 'This endpoint is disabled. Deposit real Bitcoin to your wallet address.' });
});

// ============================================================
// LISTINGS ROUTES
// ============================================================

app.post('/api/listings', verifyToken, async (req, res) => {
  try {
    const b = req.body;
    const listingType = b.listing_type || 'SELL';
    const brand       = b.giftCardBrand || b.gift_card_brand || (listingType === 'SELL' ? 'Sell Bitcoin' : 'Buy Bitcoin');
    const btcPriceUSD = parseFloat(b.bitcoinPrice || b.bitcoin_price) || 0;
    const marginPct   = parseFloat(b.margin) || 0;
    const payMethod   = b.paymentMethod || b.payment_method || '';
    const timeLimit   = parseInt(b.time_limit || b.processingTime || 30);
    const minUSD      = parseFloat(b.min_limit_usd || b.minAmount) || 0;
    const maxUSD      = parseFloat(b.max_limit_usd || b.maxAmount || b.amountUsd) || 0;
    const minLocal    = parseFloat(b.min_limit_local) || 0;
    const maxLocal    = parseFloat(b.max_limit_local) || 0;

    // ── Verification level checks ──────────────────────────────────────────────
    // Use only columns confirmed to exist in the DB schema
    const { data: listingUser, error: listingUserErr } = await supabaseAdmin
      .from('users').select('is_email_verified, is_phone_verified, is_id_verified, phone')
      .eq('id', req.userId).single();

    let hasEmail = false, hasPhone = false, hasKyc = false;
    if (listingUserErr) {
      // Fallback: column mismatch — try bare minimum safe columns
      const { data: safeUser } = await supabaseAdmin
        .from('users').select('is_email_verified, is_id_verified, phone')
        .eq('id', req.userId).single();
      hasEmail = !!(safeUser?.is_email_verified);
      hasKyc   = !!(safeUser?.is_id_verified);
      hasPhone = !!(safeUser?.phone);
    } else {
      hasEmail = !!(listingUser?.is_email_verified);
      hasPhone = !!(listingUser?.is_phone_verified || listingUser?.phone);
      hasKyc   = !!(listingUser?.is_id_verified);
    }
    // Email verification is the only requirement to create offers.
    // Phone is optional (unlocks higher trade limits when added).
    if (!hasEmail) {
      return res.status(403).json({
        error: 'Please verify your email address to create offers.',
        requireVerification: 'email',
      });
    }

    const isGiftCard = listingType === 'BUY_GIFT_CARD' || listingType === 'SELL_GIFT_CARD' || listingType === 'GIFT_CARD';
    const verifCount = [hasEmail, hasPhone, hasKyc].filter(Boolean).length;

    // Very large offers ($10k+) still require KYC (identity) verification
    if (maxUSD >= 10000 && !hasKyc) {
      return res.status(403).json({
        error: 'Offers over $10,000 require identity (KYC) verification.',
        requireVerification: 'kyc',
      });
    }

    // Enforce $10 USD minimum trade amount for non-gift-card offers
    if (!isGiftCard && minUSD < 10) {
      return res.status(400).json({ error: 'Minimum trade amount must be at least $10 USD.' });
    }

    // BUY_GIFT_CARD offers lock BTC in escrow — creator must have >= $10 BTC
    if (listingType === 'BUY_GIFT_CARD') {
      const { data: creatorWallet } = await supabaseAdmin
        .from('wallets').select('balance_btc').eq('user_id', req.userId).maybeSingle();
      const creatorBalUsd = parseFloat(creatorWallet?.balance_btc || 0) * 88000;
      if (creatorBalUsd < 10) {
        return res.status(400).json({
          error: 'You need at least $10 worth of Bitcoin in your PRAQEN wallet to create a gift card buying offer. Please top up your wallet first.',
        });
      }
    }

    // Block duplicate offers: same payment method + same currency + same type (skip gift cards)
    if (!isGiftCard) {
      const { data: dupCheck } = await supabaseAdmin
        .from('listings')
        .select('id, status')
        .eq('seller_id', req.userId)
        .eq('payment_method', payMethod)
        .eq('listing_type', listingType)
        .eq('currency', b.currency || 'USD')
        .in('status', ['ACTIVE', 'PAUSED'])
        .limit(1);
      if (dupCheck && dupCheck.length > 0) {
        const existing = dupCheck[0];
        const isPaused = existing.status === 'PAUSED';
        return res.status(400).json({
          error: isPaused
            ? `You already have a paused ${payMethod} (${b.currency || 'USD'}) offer. Activate it from your Dashboard instead.`
            : `You already have an active ${payMethod} (${b.currency || 'USD'}) offer. Edit it from your Dashboard instead.`,
          existingOfferId: existing.id,
          existingOfferStatus: existing.status,
        });
      }
    }

    // Offers are preferences only — no per-offer balance locking.
    // Sellers can create multiple offers for the same BTC; escrow locks at trade time.
    const cur         = b.currency || 'USD';
    const curSym      = b.currency_symbol || (cur === 'GHS' ? '₵' : cur === 'NGN' ? '₦' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$');
    const amtUsd      = parseFloat(b.amountUsd || b.amount_usd || minUSD) || 0;
    const { data, error } = await supabaseAdmin.from('listings').insert([{
      seller_id: req.userId, listing_type: listingType, gift_card_brand: brand, status: 'ACTIVE',
      bitcoin_price: btcPriceUSD, margin: marginPct, pricing_type: b.pricing_type || b.pricingType || 'market',
      currency: cur, currency_symbol: curSym, country: b.country || '', country_name: b.country_name || '',
      payment_method: payMethod, payment_methods: b.paymentMethods || [payMethod],
      amount_usd: amtUsd, min_limit_usd: minUSD, max_limit_usd: maxUSD, min_limit_local: minLocal, max_limit_local: maxLocal,
      time_limit: timeLimit, processing_time_minutes: timeLimit,
      trade_instructions: b.trade_instructions || '', listing_terms: b.listing_terms || '',
      description: b.description || `${brand} via ${payMethod}`,
      card_values: Array.isArray(b.card_values) && b.card_values.length > 0
        ? b.card_values.map(v => String(parseFloat(v))).filter(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0)
        : null,
      card_type:   b.card_type || 'both',
      face_value:  b.face_value || (Array.isArray(b.card_values) && b.card_values[0] ? parseFloat(b.card_values[0]) : null) || null,
    }]).select();
    if (error) { console.error('[POST /listings]', error.message); return res.status(400).json({ error: error.message }); }
    bustCache();
    res.json({ success: true, listing: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Featured Offers of the Week ──────────────────────────────────────────────
app.get('/api/featured-offers', async (req, res) => {
  try {
    const weekAgo  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Try last 7 days first, fall back to last 30 days so MVP always has data
    let { data: trades } = await supabaseAdmin
      .from('trades')
      .select('seller_id, amount_usd, created_at')
      .eq('status', 'COMPLETED')
      .gte('created_at', weekAgo);

    if (!trades || !trades.length) {
      const { data: older } = await supabaseAdmin
        .from('trades')
        .select('seller_id, amount_usd, created_at')
        .eq('status', 'COMPLETED')
        .gte('created_at', monthAgo);
      trades = older || [];
    }

    // Build per-seller stats (empty object is fine — we fall back to profile metrics)
    const stats = {};
    for (const t of trades || []) {
      const id = t.seller_id;
      if (!id) continue;
      if (!stats[id]) stats[id] = { trades: 0, volume: 0 };
      stats[id].trades++;
      stats[id].volume += parseFloat(t.amount_usd || 0);
    }

    // Fetch ALL active listings (BTC + gift cards)
    const { data: listings } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('status', 'ACTIVE')
      .limit(300);

    if (!listings || !listings.length) return res.json({ featured: [] });

    const allSellerIds = [...new Set(listings.map(l => l.seller_id).filter(Boolean))];

    // Fetch seller profiles — same fields as /api/listings so the query is known-good
    let userMap = {};
    if (allSellerIds.length > 0) {
      const [profilesResult, avatarResult] = await Promise.all([
        supabaseAdmin.from('users').select(
          'id, username, full_name, average_rating, total_trades, completion_rate, is_id_verified, is_email_verified, last_login, last_seen_at, total_feedback_count, positive_feedback, negative_feedback, country, bio, badge'
        ).in('id', allSellerIds),
        supabaseAdmin.from('users').select('id, avatar_url').in('id', allSellerIds),
      ]);
      console.log('[featured] sellerIds:', allSellerIds.length, '| profilesResult count:', (profilesResult.data||[]).length, '| err:', profilesResult.error?.message);
      (profilesResult.data || []).forEach(u => { userMap[u.id] = u; });
      (avatarResult.data || []).forEach(u => { if (userMap[u.id]) userMap[u.id].avatar_url = u.avatar_url || null; });
    }

    const enriched = listings.map(l => ({ ...l, users: userMap[l.seller_id] || {} }));

    // Pick the best listing for a seller, preferring certain types first
    const bestListing = (sellerId, preferTypes) => {
      const sl = enriched.filter(l => l.seller_id === sellerId);
      const preferred = preferTypes ? sl.filter(l => preferTypes.includes(l.listing_type)) : [];
      const pool = preferred.length ? preferred : sl;
      return pool.sort((a, b) => parseFloat(a.margin || 0) - parseFloat(b.margin || 0))[0];
    };

    // Rank sellers: trade stats first, fall back to profile total_trades
    const rank = (ids, key) => [...ids].sort((a, b) => {
      const sa = stats[a]?.[key] ?? (key === 'trades' ? (userMap[a]?.total_trades || 0) : 0);
      const sb = stats[b]?.[key] ?? (key === 'trades' ? (userMap[b]?.total_trades || 0) : 0);
      return sb - sa;
    });

    // Winner 1: most trades — BTC seller
    const btcSellerIds = [...new Set(enriched.filter(l => l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN').map(l => l.seller_id))];
    const [activeSellerId] = rank(btcSellerIds.length ? btcSellerIds : allSellerIds, 'trades');

    // Winner 2: fastest responder — gift card seller, rank by avg_response_time then positive_feedback
    const gcSellerIds = [...new Set(enriched.filter(l => l.listing_type === 'SELL_GIFT_CARD' || l.listing_type === 'BUY_GIFT_CARD').map(l => l.seller_id))];
    const gcPool = (gcSellerIds.length ? gcSellerIds : allSellerIds).filter(id => id !== activeSellerId);
    // fast_responder: gift card seller with most positive feedback (best trust score)
    const [fastSellerId] = gcPool.sort((a, b) =>
      (userMap[b]?.positive_feedback || 0) - (userMap[a]?.positive_feedback || 0)
    );

    // Winner 3: highest volume
    const [hotSellerId] = rank(
      allSellerIds.filter(id => id !== activeSellerId && id !== fastSellerId),
      'volume'
    );

    const featured = [];
    const push = (sellerId, type, preferTypes) => {
      if (!sellerId) return;
      const listing = bestListing(sellerId, preferTypes);
      if (!listing) return;
      featured.push({
        ...listing,
        users: userMap[sellerId] || {},
        featured_type: type,
        week_trades:  stats[sellerId]?.trades || 0,
        week_volume:  Math.round(stats[sellerId]?.volume || 0),
      });
    };

    push(activeSellerId, 'active_trader',  ['SELL', 'SELL_BITCOIN']);
    push(fastSellerId,   'fast_responder', ['SELL_GIFT_CARD', 'BUY_GIFT_CARD']);
    push(hotSellerId,    'hot_offer',      ['SELL', 'SELL_BITCOIN', 'SELL_GIFT_CARD']);

    res.json({ featured });
  } catch (e) {
    console.error('[featured-offers]', e.message);
    res.json({ featured: [] });
  }
});

app.get('/api/listings', async (req, res) => {
  try {
    const { brand, minPrice, maxPrice } = req.query;
    const cacheKey = `listings|${brand||''}|${minPrice||''}|${maxPrice||''}`;
    const hit = getCached(cacheKey);
    if (hit) return res.json({ listings: hit });

    // Step 1: fetch listings only (no join) — fast
    let listingsQ = supabaseAdmin.from('listings').select(
      'id, seller_id, listing_type, gift_card_brand, status, bitcoin_price, margin, pricing_type, currency, currency_symbol, country, country_name, payment_method, payment_methods, amount_usd, min_limit_usd, max_limit_usd, min_limit_local, max_limit_local, time_limit, trade_instructions, listing_terms, description, created_at, card_values, card_type, face_value'
    ).eq('status', 'ACTIVE').order('created_at', { ascending: false }).limit(200);
    if (brand)    listingsQ = listingsQ.ilike('gift_card_brand', `%${brand}%`);
    if (minPrice) listingsQ = listingsQ.gte('bitcoin_price', parseFloat(minPrice));
    if (maxPrice) listingsQ = listingsQ.lte('bitcoin_price', parseFloat(maxPrice));

    const { data: rawListings, error: listErr } = await Promise.race([
      listingsQ,
      new Promise(resolve => setTimeout(() => resolve({ data: [], error: null }), 5000)),
    ]);
    if (listErr) return res.status(400).json({ error: listErr.message });

    // Step 2+3: fetch user profiles AND wallet balances in parallel (not sequential)
    const sellerIdSet = [...new Set((rawListings || []).map(l => l.seller_id).filter(Boolean))];
    const btcRequiredTypes = ['SELL', 'SELL_BITCOIN', 'BUY_GIFT_CARD'];
    const btcSellerIds = [...new Set((rawListings || []).filter(l => btcRequiredTypes.includes(l.listing_type)).map(l => l.seller_id).filter(Boolean))];

    let userMap = {};
    let walletRows = [];

    if (sellerIdSet.length > 0) {
      const [usersResult, walletsResult] = await Promise.all([
        Promise.race([
          supabaseAdmin.from('users').select(
            'id, username, full_name, average_rating, total_trades, completion_rate, is_id_verified, is_email_verified, last_login, last_seen_at, total_feedback_count, positive_feedback, negative_feedback, country, bio, badge, avatar_url'
          ).in('id', sellerIdSet),
          new Promise(resolve => setTimeout(() => resolve({ data: [] }), 10000)),
        ]),
        btcSellerIds.length > 0
          ? Promise.race([
              supabaseAdmin.from('wallets').select('user_id, balance_btc').in('user_id', btcSellerIds),
              new Promise(resolve => setTimeout(() => resolve({ data: [] }), 4000)),
            ])
          : Promise.resolve({ data: [] }),
      ]);
      if (usersResult.error) {
        console.error('[/api/listings] Users query FAILED:', usersResult.error.message, '| code:', usersResult.error.code);
        return res.status(503).json({ error: 'Could not load seller profiles. Please retry in a moment.' });
      }
      if (!usersResult.data || usersResult.data.length === 0) {
        // Users query timed out or returned nothing — don't serve/cache null-user cards
        console.warn('[/api/listings] Users query returned 0 rows for', sellerIdSet.length, 'seller IDs. Timed out or RLS blocking. Returning 503.');
        return res.status(503).json({ error: 'Could not load seller profiles. Please retry in a moment.' });
      }
      (usersResult.data || []).forEach(u => { userMap[u.id] = u; });
      walletRows = walletsResult.data || [];
    }

    let listings = (rawListings || []).map(l => ({ ...l, users: userMap[l.seller_id] || null }));

    const balanceCheckedListings = listings.filter(l => btcRequiredTypes.includes(l.listing_type));

    if (balanceCheckedListings.length > 0) {
      const balMap = {};
      (walletRows || []).forEach(w => { balMap[w.user_id] = parseFloat(w.balance_btc || 0); });

      // For SELL offers: cap displayed limits to seller's actual balance
      listings = listings.map(l => {
        if (l.listing_type !== 'SELL' && l.listing_type !== 'SELL_BITCOIN') return l;
        const sellerBtc    = balMap[l.seller_id] || 0;
        const btcPriceVal  = parseFloat(l.bitcoin_price) || 88000;
        const balanceUsd   = sellerBtc * btcPriceVal;
        const origMaxUsd   = parseFloat(l.max_limit_usd || 0);
        const origMaxLocal = parseFloat(l.max_limit_local || 0);

        // Cap displayed max to what the seller actually holds
        const cappedMaxUsd   = origMaxUsd > 0 && balanceUsd > 0 ? Math.min(origMaxUsd, balanceUsd) : balanceUsd;
        // Scale local max proportionally using the listing's implicit rate
        const localRate      = origMaxUsd > 0 && origMaxLocal > 0 ? origMaxLocal / origMaxUsd : 1;
        const cappedMaxLocal = parseFloat((cappedMaxUsd * localRate).toFixed(2));

        return {
          ...l,
          seller_balance_btc: sellerBtc,
          effective_max_usd:  cappedMaxUsd,
          max_limit_usd:      cappedMaxUsd,
          max_limit_local:    cappedMaxLocal,
        };
      });

      // Hide BTC-required offers where seller has < $10 OR can't fulfil the minimum trade amount
      const toPauseIds = [];
      listings = listings.filter(l => {
        if (!btcRequiredTypes.includes(l.listing_type)) return true;
        const sellerBtc   = balMap[l.seller_id] || 0;
        const btcPriceVal = parseFloat(l.bitcoin_price) || 88000;
        const balanceUsd  = sellerBtc * btcPriceVal;
        const minUsd      = parseFloat(l.min_limit_usd || 0);

        const tooLow    = balanceUsd < 10;
        const cantDoMin = minUsd > 0 && balanceUsd < minUsd;

        if (tooLow || cantDoMin) { toPauseIds.push(l.id); return false; }
        return true;
      });

      // Auto-pause in DB any offer that shouldn't be showing (fire-and-forget)
      if (toPauseIds.length > 0) {
        supabaseAdmin.from('listings')
          .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
          .in('id', toPauseIds)
          .then(() => {})
          .catch(e => console.error('[listings] auto-pause low-balance:', e.message));
      }
    }

    // Attach display_name and resolve best country for each listing's embedded user
    listings = listings.map(l => {
      if (!l.users) return l;
      const u = Array.isArray(l.users) ? l.users[0] : l.users;
      const resolvedCountry = u.country || null;
      return { ...l, users: { ...u, display_name: computeDisplayName(u), country: resolvedCountry } };
    });

    setCached(cacheKey, listings);
    res.json({ listings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/listings/:id', async (req, res) => {
  try {
    // Get the listing
    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (listingError || !listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Fetch seller info and live balance in parallel — never use cached balance for the detail view
    const [{ data: seller }, { data: walletRow }] = await Promise.all([
      supabaseAdmin.from('users')
        .select('id, username, badge, country, average_rating, total_trades, completion_rate, avatar_url, created_at, total_feedback_count, positive_feedback, negative_feedback, last_login, last_seen_at, is_id_verified, is_email_verified, is_phone_verified, bio, trust_score, blocks_received, avg_response_time')
        .eq('id', listing.seller_id).single(),
      supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', listing.seller_id).maybeSingle(),
    ]);

    const sellerBalanceBtc = parseFloat(walletRow?.balance_btc || 0);
    const btcPriceVal = parseFloat(listing.bitcoin_price) || 88000;
    const effectiveMaxUsd = sellerBalanceBtc > 0
      ? Math.min(sellerBalanceBtc * btcPriceVal, parseFloat(listing.max_limit_usd || 0) || sellerBalanceBtc * btcPriceVal)
      : parseFloat(listing.max_limit_usd || 0);

    res.json({ listing: { ...listing, users: seller ? [seller] : [], seller_balance_btc: sellerBalanceBtc, effective_max_usd: effectiveMaxUsd } });
  } catch (error) {
    console.error('Listing error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/my-listings', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('listings').select('*').eq('seller_id', req.userId).order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ listings: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/listings/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { margin, min_limit_usd, max_limit_usd, min_limit_local, max_limit_local,
            payment_method, trade_instructions, listing_terms, time_limit, status } = req.body;
    const { data: listing, error: findError } = await supabaseAdmin.from('listings').select('seller_id, listing_type').eq('id', id).single();
    if (findError || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.seller_id !== req.userId) return res.status(403).json({ error: 'You can only edit your own listings' });
    if (min_limit_usd !== undefined && parseFloat(min_limit_usd) < 10) {
      return res.status(400).json({ error: 'Minimum trade amount must be at least $10 USD.' });
    }
    // For SELL offers: cap max_limit_usd at seller's actual wallet balance
    if (max_limit_usd !== undefined) {
      const isSellListing = ['SELL', 'SELL_BITCOIN'].includes((listing.listing_type || '').toUpperCase());
      if (isSellListing) {
        const { data: sellerWallet } = await supabaseAdmin
          .from('wallets').select('balance_btc').eq('user_id', req.userId).maybeSingle();
        const sellerBalUsd = parseFloat(sellerWallet?.balance_btc || 0) * 88000;
        if (parseFloat(max_limit_usd) > sellerBalUsd && sellerBalUsd > 0) {
          return res.status(400).json({
            error: `Maximum trade limit ($${parseFloat(max_limit_usd).toFixed(0)}) exceeds your wallet balance ($${sellerBalUsd.toFixed(0)}). Please top up or lower the maximum.`,
          });
        }
      }
    }
    const updateData = { updated_at: new Date().toISOString() };
    if (margin !== undefined) updateData.margin = margin;
    if (min_limit_usd !== undefined) updateData.min_limit_usd = min_limit_usd;
    if (max_limit_usd !== undefined) updateData.max_limit_usd = max_limit_usd;
    if (min_limit_local !== undefined) updateData.min_limit_local = min_limit_local;
    if (max_limit_local !== undefined) updateData.max_limit_local = max_limit_local;
    if (payment_method !== undefined) updateData.payment_method = payment_method;
    if (trade_instructions !== undefined) updateData.trade_instructions = trade_instructions;
    if (listing_terms !== undefined) updateData.listing_terms = listing_terms;
    if (time_limit !== undefined) updateData.time_limit = time_limit;
    if (status !== undefined) updateData.status = status;
    const { data, error } = await supabaseAdmin.from('listings').update(updateData).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    bustCache();
    res.json({ success: true, listing: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/listings/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: listing, error: findError } = await supabaseAdmin.from('listings').select('seller_id').eq('id', id).single();
    if (findError || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.seller_id !== req.userId) return res.status(403).json({ error: 'You can only delete your own listings' });
    const { error } = await supabaseAdmin.from('listings').update({ status: 'DELETED', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    bustCache();
    res.json({ success: true, message: 'Listing deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Increment view count — fires whenever a marketplace card is clicked
app.post('/api/listings/:id/view', async (req, res) => {
  try {
    const { data: row } = await supabaseAdmin
      .from('listings').select('view_count').eq('id', req.params.id).single();
    const next = (parseInt(row?.view_count) || 0) + 1;
    const { error } = await supabaseAdmin
      .from('listings').update({ view_count: next }).eq('id', req.params.id);
    if (error) return res.json({ success: false, error: error.message });
    res.json({ success: true, views: next });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.patch('/api/listings/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const validStatuses = ['ACTIVE', 'PAUSED', 'CLOSED', 'DELETED'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });

    const { data: listing, error: findError } = await supabaseAdmin
      .from('listings')
      .select('seller_id, listing_type, min_limit_usd, bitcoin_price')
      .eq('id', id).single();
    if (findError || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.seller_id !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    // No balance check needed — offers are just preferences, escrow locks at trade time.
    const { data, error } = await supabaseAdmin
      .from('listings').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    bustCache();
    res.json({ success: true, listing: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all active offers for the market — reads from listings (canonical table)
app.get('/api/offers', async (req, res) => {
  try {
    const { type, country, limit = 100 } = req.query;
    const cacheKey = `offers|${type||'all'}|${country||'all'}|${limit}`;
    const hit = getCached(cacheKey);
    if (hit) return res.json({ success: true, offers: hit });

    const typeMap = { sell: 'SELL', sell_bitcoin: 'SELL_BITCOIN', buy: 'BUY', buy_bitcoin: 'BUY_BITCOIN', gc_buy: 'BUY_GIFT_CARD', gc_sell: 'SELL_GIFT_CARD' };
    const listingTypeFilter = type ? (typeMap[type.toLowerCase()] || type.toUpperCase()) : null;

    let query = supabaseAdmin
      .from('listings')
      .select('*')
      .eq('status', 'ACTIVE');

    if (listingTypeFilter) query = query.eq('listing_type', listingTypeFilter);
    if (country) query = query.eq('country', country);

    const { data: listings, error } = await query
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    const userIds = [...new Set((listings || []).map(l => l.seller_id).filter(Boolean))];

    if (userIds.length === 0) { setCached(cacheKey, []); return res.json({ success: true, offers: [] }); }

    let { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, username, full_name, name_display, hide_full_name, badge, country, country_name, city, total_trades, positive_feedback, negative_feedback, average_rating, avatar_url, last_seen_at, last_login, completion_rate')
      .in('id', userIds);

    if (userError) {
      // Retry without unmigrated columns
      console.warn('[offers] Retrying users select without optional columns:', userError.message);
      ({ data: users, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, username, full_name, badge, country, total_trades, positive_feedback, negative_feedback, average_rating, avatar_url, last_seen_at, last_login, completion_rate')
        .in('id', userIds));
      if (userError) throw userError;
    }

    const userMap = Object.fromEntries((users || []).map(u => [u.id, {
      ...u,
      display_name: computeDisplayName(u),
      country: u.country || null,
    }]));

    // Fetch BTC balances for SELL offer owners so we can hide low-balance offers
    const sellSellerIds = [...new Set(
      (listings || [])
        .filter(l => l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN')
        .map(l => l.seller_id)
    )];
    let balMap = {};
    if (sellSellerIds.length > 0) {
      const { data: walBals } = await supabaseAdmin
        .from('wallets').select('user_id, balance_btc').in('user_id', sellSellerIds);
      (walBals || []).forEach(b => { balMap[b.user_id] = parseFloat(b.balance_btc || 0); });
    }

    const offers = (listings || [])
      .filter(l => {
        // Hide SELL offers where seller has < $10 BTC — offer stays ACTIVE in DB
        // and reappears automatically once they top up their wallet.
        if (l.listing_type !== 'SELL' && l.listing_type !== 'SELL_BITCOIN') return true;
        const sellerBtc   = balMap[l.seller_id] || 0;
        const btcPriceVal = parseFloat(l.bitcoin_price) || 88000;
        return sellerBtc * btcPriceVal >= 10;
      })
      .map(l => ({
        ...l,
        type: (l.listing_type || '').toLowerCase(),
        user_id: l.seller_id,
        seller_balance_btc: balMap[l.seller_id] || undefined,
        users: userMap[l.seller_id] || null,
      }));

    setCached(cacheKey, offers);
    res.json({ success: true, offers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single offer by ID — reads from listings (canonical table)
app.get('/api/offers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: offer, error: offerError } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', id)
      .single();

    if (offerError || !offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const { data: seller } = await supabaseAdmin
      .from('users')
      .select('id, username, badge, country, average_rating, total_trades, completion_rate, avatar_url, created_at, total_feedback_count, positive_feedback, negative_feedback, last_login, last_seen_at, is_id_verified, is_email_verified, is_phone_verified, bio')
      .eq('id', offer.seller_id)
      .single();

    res.json({ offer: { ...offer, type: (offer.listing_type || '').toLowerCase(), user_id: offer.seller_id, seller } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Track offer views — proxies to listings view_count
app.post('/api/offers/:id/view', async (req, res) => {
  try {
    const { data: row } = await supabaseAdmin.from('listings').select('view_count').eq('id', req.params.id).single();
    const next = (parseInt(row?.view_count) || 0) + 1;
    await supabaseAdmin.from('listings').update({ view_count: next }).eq('id', req.params.id);
    res.json({ success: true, views: next });
  } catch (e) { res.json({ success: false }); }
});

// POST create new offer
app.post('/api/offers', verifyToken, async (req, res) => {
  try {
    const {
      type,
      amount_usd,
      bitcoin_price,
      payment_method,
      country,
      min_amount,
      max_amount,
      margin,
      listing_type,
      gift_card_brand,
      currency,
      currency_symbol,
      min_limit_usd,
      max_limit_usd,
      min_limit_local,
      max_limit_local,
      pricing_type,
      time_limit,
      trade_instructions,
      listing_terms,
      description,
      card_values,
      card_type,
      gift_card_currencies
    } = req.body;

    const userId = req.userId;

    // Validation: check required fields
    if (!type && !listing_type) {
      return res.status(400).json({ error: 'Missing offer type (type or listing_type)' });
    }

    if (!payment_method) {
      return res.status(400).json({ error: 'Missing payment_method' });
    }

    // Verify user has at least 1 verification
    const { data: listingUser, error: listingUserErr } = await supabaseAdmin
      .from('users').select('is_email_verified, is_phone_verified, is_id_verified, phone')
      .eq('id', userId).single();

    let hasEmail = false, hasPhone = false, hasKyc = false;
    if (listingUserErr) {
      const { data: safeUser } = await supabaseAdmin
        .from('users').select('is_email_verified, is_id_verified, phone')
        .eq('id', userId).single();
      hasEmail = !!(safeUser?.is_email_verified);
      hasKyc   = !!(safeUser?.is_id_verified);
      hasPhone = !!(safeUser?.phone);
    } else {
      hasEmail = !!(listingUser?.is_email_verified);
      hasPhone = !!(listingUser?.is_phone_verified || listingUser?.phone);
      hasKyc   = !!(listingUser?.is_id_verified);
    }
    // Email verification is the only requirement to create offers.
    // Phone is optional (unlocks higher trade limits when added).
    if (!hasEmail) {
      return res.status(403).json({
        error: 'Please verify your email address to create offers.',
        requireVerification: 'email',
      });
    }

    // Determine listing type
    const offerTypeMap = { 'sell': 'SELL', 'buy': 'BUY', 'gc_buy': 'BUY_GIFT_CARD' };
    const mappedType = offerTypeMap[type] || listing_type || 'SELL';
    const verifCount = [hasEmail, hasPhone, hasKyc].filter(Boolean).length;
    const isGiftCard = mappedType === 'BUY_GIFT_CARD' || mappedType === 'SELL_GIFT_CARD';

    // Enforce $10 USD minimum trade limit for non-gift-card offers
    if (!isGiftCard && parseFloat(min_limit_usd || 0) < 10) {
      return res.status(400).json({ error: 'Minimum trade amount must be at least $10 USD.' });
    }

    // Default gift_card_brand for non-GC offers (column is NOT NULL in schema)
    const brandDefault = mappedType === 'SELL' ? 'Sell Bitcoin' : mappedType === 'BUY' ? 'Buy Bitcoin' : '';
    const cur = currency || 'USD';
    const curSym = currency_symbol || (cur === 'GHS' ? '₵' : cur === 'NGN' ? '₦' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$');

    // For SELL offers: max_limit_usd must not exceed the seller's BTC wallet balance
    if ((mappedType === 'SELL' || mappedType === 'SELL_BITCOIN') && max_limit_usd) {
      const { data: sellerWallet } = await supabaseAdmin
        .from('wallets').select('balance_btc').eq('user_id', userId).maybeSingle();
      const sellerBalUsd = parseFloat(sellerWallet?.balance_btc || 0) * 88000; // approximate BTC price for cap
      if (parseFloat(max_limit_usd) > sellerBalUsd && sellerBalUsd > 0) {
        return res.status(400).json({
          error: `Maximum trade limit ($${parseFloat(max_limit_usd).toFixed(0)}) exceeds your wallet balance ($${sellerBalUsd.toFixed(0)}). Please top up or lower the maximum.`,
        });
      }
    }

    // Block duplicate active offers: same payment method + same currency + same type (skip gift cards)
    if (mappedType !== 'BUY_GIFT_CARD') {
      const { data: dupCheck2 } = await supabaseAdmin
        .from('listings')
        .select('id')
        .eq('seller_id', userId)
        .eq('payment_method', payment_method)
        .eq('listing_type', mappedType)
        .eq('currency', currency || 'USD')
        .eq('status', 'ACTIVE')
        .limit(1);
      if (dupCheck2 && dupCheck2.length > 0) {
        return res.status(400).json({
          error: `You already have an active ${mappedType} offer for ${payment_method} in ${currency || 'USD'}. Edit it from your Dashboard instead.`,
        });
      }
    }

    // Create offer in listings table (single source of truth for all marketplace pages)
    const { data, error } = await supabaseAdmin
      .from('listings')
      .insert({
        seller_id:           userId,
        listing_type:        mappedType,
        gift_card_brand:     gift_card_brand || brandDefault,
        status:              'ACTIVE',
        bitcoin_price:       bitcoin_price || 88000,
        margin:              margin || 0,
        pricing_type:        pricing_type || 'market',
        currency:            cur,
        currency_symbol:     curSym,
        country:             country || 'GH',
        payment_method:      payment_method,
        amount_usd:          amount_usd || min_limit_usd || 100,
        min_limit_usd:       min_limit_usd || amount_usd || 10,
        max_limit_usd:       max_limit_usd || amount_usd || 100000,
        min_limit_local:     min_limit_local || 10,
        max_limit_local:     max_limit_local || 100000,
        time_limit:          time_limit || 30,
        trade_instructions:  trade_instructions || description || '',
        listing_terms:       listing_terms || '',
        card_values:         Array.isArray(card_values) && card_values.length > 0 ? card_values.map(Number) : null,
        card_type:           card_type || 'both',
        face_value:          Array.isArray(card_values) && card_values[0] ? parseFloat(card_values[0]) : null,
        gift_card_currencies: Array.isArray(gift_card_currencies) && gift_card_currencies.length > 0 ? gift_card_currencies : null,
        created_at:          new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Offer creation error:', error);
      return res.status(500).json({ error: error.message });
    }

    bustCache();
    res.json({ success: true, offer: data, listing: data });
  } catch (err) {
    console.error('Offer creation exception:', err);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoints
app.get('/api/debug/listings', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('listings')
      .select('id,listing_type,gift_card_brand,margin,currency,currency_symbol,payment_method,min_limit_local,max_limit_local,min_limit_usd,max_limit_usd,time_limit,bitcoin_price,status,created_at')
      .order('created_at', { ascending: false }).limit(10);
    res.json({ count: data?.length, listings: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/debug/update-feedback/:username', async (req, res) => {
  try {
    const { positive_feedback, negative_feedback } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({
      positive_feedback: positive_feedback || 0, negative_feedback: negative_feedback || 0,
      total_feedback_count: (positive_feedback || 0) + (negative_feedback || 0)
    }).eq('username', req.params.username).select('id, username, positive_feedback, negative_feedback, total_feedback_count').single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, user: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// TRADES ROUTES
// ============================================================

app.get('/api/my-trades', verifyToken, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin.from('trades')
      .select(
        `id, status, trade_type, trade_ref, amount_btc, amount_usd, amount_local,
         local_currency, currency_symbol, payment_method, gift_card_brand,
         buyer_id, seller_id, created_at, expires_at, completed_at, cancelled_at,
         buyer_confirmed, cancel_reason,
         listing:listing_id(id, listing_type, gift_card_brand, payment_method, time_limit, currency, currency_symbol),
         buyer:buyer_id(id, username, avatar_url, badge, total_trades, completion_rate, positive_feedback, negative_feedback, last_login, last_seen_at, country),
         seller:seller_id(id, username, avatar_url, badge, total_trades, completion_rate, positive_feedback, negative_feedback, last_login, last_seen_at, country)`,
        { count: 'exact' }
      )
      .or(`buyer_id.eq.${req.userId},seller_id.eq.${req.userId}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ trades: data || [], total: count || 0, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trades/active', verifyToken, async (req, res) => {
  try {
    const { data: trades, error } = await supabaseAdmin
      .from('trades')
      .select(`*, listing:listing_id(id, time_limit, payment_method, listing_type, gift_card_brand), buyer:buyer_id(id, username, badge, completion_rate, positive_feedback, negative_feedback, country, avatar_url, total_trades, average_rating), seller:seller_id(id, username, badge, completion_rate, positive_feedback, negative_feedback, country, avatar_url, total_trades, average_rating)`)
      .or(`buyer_id.eq.${req.userId},seller_id.eq.${req.userId}`)
      .in('status', ['CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });

    const ACTIVE_STATUSES = ['CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED'];
    const activeTrades = (trades || []).filter(t => ACTIVE_STATUSES.includes(t.status));

    res.json({ success: true, trades: activeTrades, total: activeTrades.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trades/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('trades')
      .select(`*, listing:listing_id(*), buyer:buyer_id(id, username, avatar_url, average_rating, total_trades, completion_rate, last_login, last_seen_at, badge, positive_feedback, negative_feedback, country), seller:seller_id(id, username, avatar_url, average_rating, total_trades, completion_rate, last_login, last_seen_at, badge, positive_feedback, negative_feedback, country)`)
      .eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Trade not found' });
    if (data.buyer_id !== req.userId && data.seller_id !== req.userId) return res.status(403).json({ error: 'Unauthorized' });

    // If Supabase join didn't return listing data, fall back to direct lookup
    if (!data.listing && data.listing_id) {
      const { data: listing } = await supabaseAdmin.from('listings').select('*').eq('id', data.listing_id).single();
      if (listing) data.listing = listing;
    }

    // Inject whether the current user has already submitted feedback for this trade
    const { data: myReview } = await supabaseAdmin
      .from('reviews').select('id')
      .eq('trade_id', req.params.id)
      .eq('reviewer_id', req.userId)
      .maybeSingle();
    if (myReview) data.user_gave_feedback = true;

    res.json({ trade: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Freeze the exchange rate for 30 seconds so listing preview == escrow amount
app.post('/api/quotes', async (req, res) => {
  try {
    const { listingId } = req.body;
    if (!listingId) return res.status(400).json({ error: 'Missing listingId' });
    const { data: listing } = await supabaseAdmin.from('listings').select('*').eq('id', listingId).single();
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    const quote = await quoteService.createQuote(listing);
    res.json(quote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades', verifyToken, async (req, res) => {
  try {
    const { offerId: rawOfferId, listingId: rawListingId, amountBtc, amount, paymentMethod, trade_type, amountLocal, currency, currencySymbol, quoteId } = req.body;
    const listingId = rawOfferId || rawListingId;
    if (!listingId) return res.status(400).json({ error: 'Missing listing id' });
    const parsedAmountBtc = parseFloat(amountBtc || (amount ? String(amount).replace(/[^\d.]/g, '') : 0));
    if (isNaN(parsedAmountBtc) || parsedAmountBtc <= 0) return res.status(400).json({ error: 'Invalid BTC amount' });
    const { data: listing } = await supabaseAdmin.from('listings').select('*').eq('id', listingId).single();
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.seller_id === req.userId) return res.status(400).json({ error: 'Cannot trade with yourself' });
    const fee = calculateFee(parsedAmountBtc);

    // GOLDEN RULE: The offer CREATOR always has the Bitcoin.
    // The trade OPENER always brings what the creator wants (cash, MTN, or a gift card).
    // Backend infers roles from listing_type — never trusts frontend trade_type.
    const listingTypeUpper = (listing.listing_type || '').toUpperCase();

    let buyerId, sellerId, btcProviderId, resolvedType;

    if (listingTypeUpper === 'SELL' || listingTypeUpper === 'SELL_BITCOIN') {
      // ── BUY BITCOIN PAGE ────────────────────────────────────────────────────
      // Offer creator (vendor) posted "I have Bitcoin, I want cash/MTN."
      // Trade opener comes to buy Bitcoin — they bring cash/MTN.
      //
      // listing.seller_id = offer creator = vendor = has BTC → BTC LOCKS
      // req.userId        = trade opener  = cash/MTN holder  → receives BTC
      sellerId      = listing.seller_id;  // vendor — has BTC, BTC locks in escrow
      buyerId       = req.userId;          // trade opener — brings cash/MTN
      btcProviderId = sellerId;            // offer creator's BTC ALWAYS locks on BUY page
      resolvedType  = 'BUY';

    } else if (listingTypeUpper === 'BUY_GIFT_CARD') {
      // ── GIFT CARD MARKET: offer creator wants a card, has BTC ───────────────
      // Offer creator (e.g. Kenneth) posted "I have Bitcoin, I want a gift card."
      // Trade opener (e.g. Alice) sees the offer and brings the gift card.
      //
      // listing.seller_id = Kenneth = offer creator = has BTC → BTC LOCKS
      // req.userId        = Alice   = trade opener  = has gift card → receives BTC
      buyerId       = listing.seller_id;  // offer creator — has BTC, BTC locks in escrow
      sellerId      = req.userId;          // trade opener  — brings gift card
      btcProviderId = buyerId;             // offer creator's BTC ALWAYS locks
      resolvedType  = 'SELL';

    } else if (listingTypeUpper === 'SELL_GIFT_CARD') {
      // ── GIFT CARD MARKET: offer creator has a card, wants BTC ───────────────
      // Offer creator (e.g. Kenneth) posted "I have a gift card, I want Bitcoin."
      // Trade opener (e.g. Alice) has Bitcoin and wants the gift card.
      //
      // req.userId        = Alice   = trade opener  = has BTC → BTC LOCKS
      // listing.seller_id = Kenneth = offer creator = has gift card → receives BTC
      buyerId       = req.userId;          // trade opener  — has BTC, BTC locks in escrow
      sellerId      = listing.seller_id;  // offer creator — has gift card
      btcProviderId = buyerId;             // trade opener's BTC locks
      resolvedType  = 'BUY';

    } else {
      // ── FALLBACK: BUY / BUY_BITCOIN or unknown ──────────────────────────────
      // Offer creator wants to buy BTC with cash. Trade opener has BTC.
      buyerId       = listing.seller_id;  // offer creator — wants BTC (cash holder)
      sellerId      = req.userId;          // trade opener  — has BTC, BTC locks
      btcProviderId = sellerId;
      resolvedType  = 'SELL';
    }

    console.log(`[Trade] type:${listingTypeUpper} → buyer:${buyerId.slice(0,8)} seller:${sellerId.slice(0,8)} btcProvider:${btcProviderId.slice(0,8)}`);

    // All registered users can open trades — no verification gate for buyers.
    // Gift card trades and large trades ($10k+) retain their checks below.

    // Resolve trade currency + local amount
    const tradeLocalAmt       = parseFloat(amountLocal) || 0;
    const frontendRateLocal   = parseFloat(req.body.sellerRateLocal) || 0; // rate buyer saw on listing page
    const frontendRateUsd     = parseFloat(req.body.sellerRateUsd)   || 0;
    const tradeCur      = (currency && currency !== 'USD') ? currency
                        : (listing.currency && listing.currency !== 'USD') ? listing.currency
                        : currency || listing.currency || null;
    const tradeSym      = currencySymbol || listing.currency_symbol || (tradeCur ? null : null);

    let tradeAmountUsd, verifiedAmountBtc;

    if (quoteId && tradeLocalAmt > 0 && !listingTypeUpper.includes('GIFT_CARD')) {
      // ── QUOTE PATH: rate was frozen at listing-preview time ────────────────
      const quote = quoteService.consumeQuote(quoteId); // throws if expired/used
      if (String(quote.listingId) !== String(listingId)) {
        return res.status(400).json({ error: 'Rate quote does not match this listing' });
      }
      verifiedAmountBtc = parseFloat((tradeLocalAmt / quote.executableRate).toFixed(8));
      tradeAmountUsd    = parseFloat((verifiedAmountBtc * quote.components.btcUsd).toFixed(2));
      console.log(`[Quote] id=${quoteId.slice(0,8)} rate=${quote.executableRate.toFixed(2)} btc=${verifiedAmountBtc}`);
    } else {
      // ── FALLBACK PATH: live rate re-fetch (no quoteId or gift-card trade) ─
      const FX_API_KEY = 'd51dba3e8a731b12d73e8d72';
      let fxApiData;
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        fxApiData = await res.json();
      } catch (e) {
        // Fallback to ExchangeRate-API if open.er-api.com is down
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/USD`);
        fxApiData = await res.json();
      }
      const btcApiRes = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      if (fxApiData.result !== 'success') throw new Error('FX rate fetch failed');
      const fxRates       = fxApiData.rates;
      const btcApiData    = await btcApiRes.json();
      const marketRateUSD = parseFloat(btcApiData.data.amount) || await getCurrentBTCPrice();
      const tradeCurRate  = (tradeCur && fxRates[tradeCur]) ? fxRates[tradeCur] : 1;

      tradeAmountUsd = tradeLocalAmt > 0
        ? parseFloat((tradeLocalAmt / (frontendRateUsd > 0 ? (frontendRateLocal / frontendRateUsd) : tradeCurRate)).toFixed(2))
        : parseFloat(listing.amount_usd || 0);

      verifiedAmountBtc = parsedAmountBtc;
      if (tradeLocalAmt > 0 && !listingTypeUpper.includes('GIFT_CARD')) {
        const listingMargin        = parseFloat(listing.margin || 0);
        const backendSellerRateUSD = (listing.pricing_type === 'fixed' && parseFloat(listing.bitcoin_price || 0) > 100)
          ? parseFloat(listing.bitcoin_price)
          : marketRateUSD * (1 + listingMargin / 100);
        const backendSellerRateLocal = backendSellerRateUSD * tradeCurRate;

        let finalSellerRateLocal = backendSellerRateLocal;
        if (frontendRateLocal > 0 && backendSellerRateLocal > 0) {
          const drift = Math.abs(frontendRateLocal - backendSellerRateLocal) / backendSellerRateLocal;
          if (drift <= 0.03) {
            finalSellerRateLocal = frontendRateLocal;
            console.log(`[Rate] Using frontend rate ${tradeCur}${frontendRateLocal.toFixed(0)} (drift ${(drift * 100).toFixed(2)}% — within tolerance)`);
          } else {
            console.warn(`[Rate] Frontend rate drifted ${(drift * 100).toFixed(2)}% — using backend rate ${tradeCur}${backendSellerRateLocal.toFixed(0)}`);
          }
        }
        verifiedAmountBtc = parseFloat((tradeLocalAmt / finalSellerRateLocal).toFixed(8));
        console.log(`[Rate] market:$${marketRateUSD} btc:${verifiedAmountBtc}`);
      }
    }

    const verifiedFee = parseFloat(calculateFee(verifiedAmountBtc));
    const tradeRef = 'PRAQ-' + require('crypto').randomBytes(4).toString('hex').toUpperCase();

    // Pre-check: ensure BTC provider has enough balance before creating the trade.
    // wallets is the single source of truth — read only from there.
    const { data: providerWallet } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', btcProviderId).maybeSingle();
    const availableBtc = parseFloat(providerWallet?.balance_btc || 0);
    if (availableBtc < verifiedAmountBtc) {
      const isOwnBalance = btcProviderId === req.userId;
      // Auto-pause the offer if the balance problem is on the offer creator's side
      if (!isOwnBalance) {
        supabaseAdmin.from('listings')
          .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
          .eq('id', listingId)
          .then(() => {}).catch(() => {});
      }
      const availableUsd = (availableBtc * (verifiedAmountBtc > 0 ? (tradeAmountUsd / verifiedAmountBtc) : 88000)).toFixed(2);
      const msg = isOwnBalance
        ? `You don't have enough Bitcoin in your PRAQEN wallet to open this trade. You need ${verifiedAmountBtc.toFixed(6)} BTC. Please top up your wallet first.`
        : `This seller doesn't have enough Bitcoin to complete this trade right now. Their offer has been paused automatically. Please choose a different offer.`;
      return res.status(400).json({ error: msg });
    }

    // Large trades ($10k+) require KYC to protect the platform
    if (tradeAmountUsd >= 10000) {
      const { data: bigTrader } = await supabaseAdmin
        .from('users').select('is_id_verified').eq('id', req.userId).single();
      if (!bigTrader?.is_id_verified) {
        return res.status(403).json({
          error: 'Trades of $10,000 or more require ID verification. Please complete KYC in your profile.',
          requireVerification: 'kyc',
        });
      }
    }

    const { data: trade, error } = await supabaseAdmin.from('trades').insert([{
      listing_id: listingId, buyer_id: buyerId, seller_id: sellerId, trade_type: resolvedType,
      amount_btc: verifiedAmountBtc, status: 'CREATED',
      amount_usd:      tradeAmountUsd,
      amount_local:    tradeLocalAmt > 0 ? tradeLocalAmt : null,
      local_currency:  tradeCur || null,
      currency_symbol: tradeSym || null,
      platform_fee_btc: verifiedFee,
      platform_fee_usd: (tradeAmountUsd * 0.005).toFixed(2), fee_status: 'PENDING',
      payment_method: paymentMethod || listing.payment_method,
      gift_card_brand: listingTypeUpper.includes('GIFT_CARD') ? (listing.gift_card_brand || null) : null,
      trade_ref: tradeRef,
      expires_at: new Date(Date.now() + Math.max(parseInt(listing.time_limit) || 30, 15) * 60 * 1000),
    }]).select();
    if (error) return res.status(400).json({ error: error.message });

    // ── Push notification debug (fires immediately after DB insert) ──────────
    console.error('[DEBUG] Trade saved to DB — id:', trade[0].id, '| ref:', trade[0].trade_ref);
    console.error('[DEBUG] Seller ID:', sellerId, '| Buyer ID:', buyerId);
    if (sellerId) {
      console.error('[DEBUG] Calling sendTradeAlert for new_trade...');
      try {
        await sendTradeAlert(sellerId, trade[0], 'new_trade');
        console.error('[DEBUG] sendTradeAlert completed successfully');
      } catch (pushError) {
        console.error('[DEBUG] sendTradeAlert failed:', pushError.message, pushError.stack);
      }
    } else {
      console.error('[DEBUG] No seller_id — skipping push notification');
    }
    // ─────────────────────────────────────────────────────────────────────────

    console.log(`[BTC Lock] btcProvider:${btcProviderId.slice(0,8)} locking ${verifiedAmountBtc} BTC`);






    let escrowResult;
    try {
      escrowResult = await tradeEscrowService.lockFundsInEscrow(trade[0].id, btcProviderId, verifiedAmountBtc, listing.time_limit || 30);
    } catch (lockError) {
      console.error('❌ lockFundsInEscrow failed:', lockError.message);
      await supabaseAdmin.from('trades').update({
        status: 'CANCELLED',
        cancel_reason: `Escrow lock failed: ${lockError.message}`,
        cancelled_at: new Date().toISOString(),
      }).eq('id', trade[0].id);
      return res.status(400).json({
        error: 'Could not lock Bitcoin in escrow. The seller may have insufficient funds. Please try a different offer.'
      });
    }
    // Invalidate marketplace cache so seller's reduced BTC balance shows immediately
    bustCache();
    // Respond immediately — escrow is locked, trade is live. Do NOT block on emails.
    res.json({ success: true, trade: trade[0], escrowAddress: escrowResult.escrowAddress, fee });

    // Fire notifications in the background — never let email delay the user
    setImmediate(async () => {
      try {
        const { data: buyerUser } = await supabaseAdmin.from('users').select('username').eq('id', buyerId).single();
        const buyerName  = buyerUser?.username || 'Someone';
        const fmtLocalN  = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n||0);
        const localDisp  = tradeLocalAmt > 0 && tradeCur
          ? `${tradeSym||''}${fmtLocalN(tradeLocalAmt)} ${tradeCur}`
          : `$${fmtLocalN(tradeAmountUsd)} USD`;
        const pmDisp     = paymentMethod || listing.payment_method || 'Mobile Money';
        const assetLabel = listing.gift_card_brand
          ? `${listing.gift_card_brand} Gift Card`
          : 'Bitcoin';
        await createNotification(sellerId, 'trade', '💰 New Trade Request',
          `${buyerName} wants to buy ${assetLabel} · ${localDisp} via ${pmDisp}`,
          `/trade/${trade[0].id}`);
        // Send personalized emails to buyer and seller in parallel
        const [buyerEmailRes, sellerEmailRes] = await Promise.allSettled([
          supabaseAdmin.from('users').select('id, email, username').eq('id', buyerId).single(),
          supabaseAdmin.from('users').select('id, email, username').eq('id', sellerId).single(),
        ]);
        const buyerEmailUser  = buyerEmailRes.value?.data;
        const sellerEmailUser = sellerEmailRes.value?.data;
        if (buyerEmailUser?.email)
          emailService.sendTradeOpenedEmail(buyerEmailUser,  trade[0], 'buyer').catch(e => console.error('[TradeOpen] buyer email:', e.message));
        if (sellerEmailUser?.email)
          emailService.sendTradeOpenedEmail(sellerEmailUser, trade[0], 'seller').catch(e => console.error('[TradeOpen] seller email:', e.message));
      } catch (notifyErr) {
        console.error('[Trade Open] Background notification failed:', notifyErr.message);
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/mark-paid', tradeLimiter, verifyToken, async (req, res) => {
  try {
    const { data: trade, error: fetchError } = await supabaseAdmin
      .from('trades').select('*').eq('id', req.params.id).single();
    if (fetchError || !trade) return res.status(404).json({ error: 'Trade not found' });

    // Detect gift card trade from listing_type (authoritative — never use gift_card_brand alone)
    let listingType = '';
    let listingCreatorId = '';
    if (trade.listing_id) {
      const { data: listing } = await supabaseAdmin
        .from('listings').select('listing_type, seller_id').eq('id', trade.listing_id).single();
      listingType      = listing?.listing_type  || '';
      listingCreatorId = listing?.seller_id     || '';
    }
    const isGiftCardTrade = listingType.toUpperCase().includes('GIFT_CARD');

    const isParticipant    = String(trade.buyer_id)  === String(req.userId) ||
                             String(trade.seller_id) === String(req.userId);
    const isListingCreator = listingCreatorId && String(listingCreatorId) === String(req.userId);

    console.log(`[mark-paid] trade=${req.params.id.slice(0,8)} isGiftCard=${isGiftCardTrade} buyer=${String(trade.buyer_id).slice(0,8)} seller=${String(trade.seller_id).slice(0,8)} reqUser=${String(req.userId).slice(0,8)}`);

    if (isGiftCardTrade) {
      // Gift card trade: the card SELLER marks "I sent the code"
      if (String(trade.seller_id) !== String(req.userId)) {
        return res.status(403).json({ error: 'Only the card seller can mark as sent' });
      }
    } else {
      // Bitcoin trade (BUY page or SELL page):
      // buyer_id is always the cash payer — the one who marks "I have paid".
      // On BUY page: buyer_id = trade opener (brings cash).
      // On SELL page: buyer_id = listing creator (has cash, wants BTC).
      if (String(trade.buyer_id) !== String(req.userId)) {
        return res.status(403).json({ error: 'Only the buyer can mark as paid' });
      }
    }

    const allowedStatuses = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN'];
    if (!allowedStatuses.includes(trade.status)) return res.status(400).json({ error: `Cannot mark as paid — trade status is ${trade.status}` });

    // Atomic update — only flips to PAYMENT_SENT if status is still in allowedStatuses.
    // Prevents a race where auto-cancel fires between our status check above and this write.
    // expires_at is cleared so no cron job or timer can ever expire a paid trade.
    const { data, error } = await supabaseAdmin.from('trades')
      .update({ status: 'PAYMENT_SENT', buyer_confirmed: true, buyer_confirmed_at: new Date(), expires_at: null })
      .eq('id', req.params.id)
      .in('status', allowedStatuses)
      .select().single();
    if (!data) return res.status(409).json({ error: 'Trade status changed before payment could be confirmed. Please refresh and try again.' });
    if (error) return res.status(400).json({ error: error.message });

    // Notify whoever needs to act next
    // Gift card: notify Alice (buyer) to verify the code and release BTC
    // BTC trade: notify seller to verify fiat and release BTC
    const notifyId = isGiftCardTrade ? trade.buyer_id : trade.seller_id;
    const { data: actorUser } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const actorName  = actorUser?.username || 'Buyer';
    const fmtN       = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n||0);
    const paidLocal  = trade.amount_local || 0;
    const paidCur    = trade.local_currency || 'USD';
    const paidPM     = trade.payment_method || 'Mobile Money';
    const paidDisp   = paidLocal > 0 ? `${fmtN(paidLocal)} ${paidCur}` : `$${fmtN(trade.amount_usd)} USD`;
    res.json({ success: true, trade: data });

    setImmediate(async () => {
      try {
        const notifyMsg = isGiftCardTrade
          ? `${actorName} sent the gift card code · Verify and release Bitcoin`
          : `${actorName} sent ${paidDisp} via ${paidPM} · Verify and release Bitcoin`;
        await createNotification(notifyId, 'payment', '💳 Payment Sent', notifyMsg, `/trade/${req.params.id}`);
        sendTradeAlert(notifyId, trade, 'payment_sent').catch(() => {});
        // Email only the party who needs to act next (seller for BTC trade, buyer for gift card)
        const { data: notifyEmailUser } = await supabaseAdmin
          .from('users').select('id, email, username').eq('id', notifyId).single();
        if (notifyEmailUser?.email)
          emailService.sendPaymentSentEmail(notifyEmailUser, trade)
            .catch(e => console.error('[mark-paid] notify email:', e.message));
      } catch (e) { console.error('[mark-paid] Background notify failed:', e.message); }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/release', tradeLimiter, verifyToken, async (req, res) => {
  try {
    // ── 2FA: require email action code before releasing BTC ─────────────────
    const { actionCode } = req.body;
    if (!actionCode) {
      return res.status(403).json({
        error: 'Security verification required.',
        requireActionCode: true,
        action: 'release_btc',
      });
    }
    const codeCheck = actionCodeService.verify(req.userId, 'release_btc', actionCode);
    if (!codeCheck.valid) return res.status(403).json({ error: codeCheck.error });

    const { data: releasedTrade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    const result = await tradeEscrowService.releaseBitcoinToBuyer(req.params.id, req.userId);
    res.json(result);

    if (releasedTrade) {
      setImmediate(async () => {
        try {
          updateUserTradeStats(releasedTrade.seller_id).catch(() => {});
          updateUserTradeStats(releasedTrade.buyer_id).catch(() => {});
          // Welcome bonus: buyer at step 2 → step 3, credit $2 in BTC
          try {
            const { data: bonusBuyer } = await supabaseAdmin.from('users')
              .select('id, bonus_step, bonus_expires_at')
              .eq('id', releasedTrade.buyer_id).single();
            if (bonusBuyer?.bonus_step === 2 && bonusBuyer?.bonus_expires_at &&
                new Date(bonusBuyer.bonus_expires_at) > new Date()) {
              const btcPx = await getCurrentBTCPrice();
              const bonusBtc = parseFloat((2 / btcPx).toFixed(8));
              const { data: wal } = await supabaseAdmin.from('wallets')
                .select('balance_btc').eq('user_id', releasedTrade.buyer_id).maybeSingle();
              const newBal = parseFloat((parseFloat(wal?.balance_btc || 0) + bonusBtc).toFixed(8));
              await supabaseAdmin.from('wallets').update({ balance_btc: newBal, updated_at: new Date().toISOString() })
                .eq('user_id', releasedTrade.buyer_id);
              await supabaseAdmin.from('users').update({
                bonus_step: 3, bonus_unlocked_at: new Date().toISOString(),
              }).eq('id', releasedTrade.buyer_id);
              console.log(`[bonus] Credited ${bonusBtc} BTC ($2) to buyer ${releasedTrade.buyer_id}`);
            }
          } catch (e) { console.error('[bonus] Credit failed:', e.message); }
          payReferralCommissions(
            releasedTrade.id,
            releasedTrade.buyer_id,
            releasedTrade.seller_id,
            releasedTrade.amount_btc,
            releasedTrade.amount_usd
          ).catch(() => {});
          sendTradeAlert(releasedTrade.buyer_id, releasedTrade, 'btc_released').catch(() => {});
          // Fetch buyer and seller with emails, then send role-specific completion emails in parallel
          const [buyerRel, sellerRel] = await Promise.allSettled([
            supabaseAdmin.from('users').select('id, email, username').eq('id', releasedTrade.buyer_id).single(),
            supabaseAdmin.from('users').select('id, email, username').eq('id', releasedTrade.seller_id).single(),
          ]);
          const buyerRelUser  = buyerRel.value?.data;
          const sellerRelUser = sellerRel.value?.data;
          if (buyerRelUser?.email)
            emailService.sendTradeConfirmationEmail(buyerRelUser,  releasedTrade, 'buyer')
              .catch(e => console.error('[release] buyer email:', e.message));
          if (sellerRelUser?.email)
            emailService.sendTradeConfirmationEmail(sellerRelUser, releasedTrade, 'seller')
              .catch(e => console.error('[release] seller email:', e.message));
        } catch (e) { console.error('[release] Background notify failed:', e.message); }
      });
    }
  } catch (error) {
    console.error('❌ /api/trades/:id/release error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/cancel', tradeLimiter, verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const { data: trade, error: fetchError } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (fetchError || !trade) return res.status(404).json({ error: 'Trade not found' });

    // Authorization: any participant (buyer or seller) can cancel,
    // EXCEPT after buyer marks paid — only the seller can cancel at that point.
    const isBuyer  = trade.buyer_id  === req.userId;
    const isSeller = trade.seller_id === req.userId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ error: 'Not authorized to cancel this trade' });
    }
    const isPostPay = ['PAYMENT_SENT', 'PAID'].includes(trade.status);
    if (isPostPay && !isSeller) {
      return res.status(403).json({ error: 'Cannot cancel after payment has been sent — open a dispute instead' });
    }

    const cancellableStatuses = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN', 'PAYMENT_SENT', 'PAID'];
    if (!cancellableStatuses.includes(trade.status)) return res.status(400).json({ error: `Trade cannot be cancelled — status is ${trade.status}` });

    // Delegate ALL escrow release + balance refund + trade status update to the
    // escrow service. It uses an atomic DB claim (WHERE status='LOCKED') so even
    // if the auto-cancel cron fires at the same instant, only one refund happens.
    const result = await tradeEscrowService.cancelTrade(req.params.id, reason || 'Trade opener cancelled');
    if (!result.success) return res.status(409).json({ error: result.message });

    // Fetch the updated trade for the response
    const { data: updatedTrade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();

    // Build notification text
    const { data: cancellerUser } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const cancellerName = cancellerUser?.username || 'Trader';
    const fmtC   = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n||0);
    const cLocal = trade.amount_local || 0;
    const cCur   = trade.local_currency || 'USD';
    const cPM    = trade.payment_method || 'Mobile Money';
    const cDisp  = cLocal > 0 ? `${fmtC(cLocal)} ${cCur}` : `$${fmtC(trade.amount_usd)} USD`;
    const cancelMsg = `${cancellerName} cancelled the trade · ${cDisp} via ${cPM}`;
    const otherId   = req.userId === trade.buyer_id ? trade.seller_id : trade.buyer_id;
    res.json({ success: true, trade: updatedTrade || trade });

    setImmediate(async () => {
      try {
        await createNotification(otherId, 'cancelled', '❌ Trade Cancelled', cancelMsg, `/trade/${req.params.id}`);
        await createNotification(req.userId, 'cancelled', '❌ Trade Cancelled',
          `You cancelled the trade · ${cDisp} via ${cPM}`, `/trade/${req.params.id}`);
        sendTradeAlert([trade.buyer_id, trade.seller_id].filter(Boolean), trade, 'trade_cancelled').catch(() => {});
        // Email both parties about the cancellation
        const [buyerCancel, sellerCancel] = await Promise.allSettled([
          supabaseAdmin.from('users').select('id, email, username').eq('id', trade.buyer_id).single(),
          supabaseAdmin.from('users').select('id, email, username').eq('id', trade.seller_id).single(),
        ]);
        const buyerCancelUser  = buyerCancel.value?.data;
        const sellerCancelUser = sellerCancel.value?.data;
        if (buyerCancelUser?.email)
          emailService.sendTradeCancelledEmail(buyerCancelUser,  trade, reason)
            .catch(e => console.error('[cancel] buyer email:', e.message));
        if (sellerCancelUser?.email)
          emailService.sendTradeCancelledEmail(sellerCancelUser, trade, reason)
            .catch(e => console.error('[cancel] seller email:', e.message));
      } catch (e) { console.error('[cancel] Background notify failed:', e.message); }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/auto-cancel', async (req, res) => {
  try {
    const tradeId = req.params.id;
    const { reason } = req.body;

    // Quick status check — guard before delegating to the escrow service
    const { data: trade } = await supabaseAdmin.from('trades').select('id, status').eq('id', tradeId).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });

    if (trade.status === 'DISPUTED') {
      return res.status(403).json({ error: 'Cannot cancel a disputed trade. A moderator must give the final verdict.' });
    }
    if (['PAYMENT_SENT', 'PAID'].includes(trade.status)) {
      console.error(`[Auto-cancel] Blocked — trade ${tradeId.slice(0,8)} is ${trade.status}. Cannot auto-cancel after payment marked.`);
      return res.status(403).json({ error: 'Cannot auto-cancel after buyer has marked payment. Seller must release Bitcoin or open a dispute.' });
    }
    if (['CANCELLED', 'COMPLETED'].includes(trade.status)) {
      return res.json({ success: true, message: `Trade already ${trade.status.toLowerCase()}.` });
    }

    // Delegate to the centralized escrow service — handles atomic escrow claim,
    // upsert on user_balances, user_wallets sync, audit log, and notifications.
    const result = await tradeEscrowService.cancelTrade(tradeId, reason || '30-minute payment window expired');
    res.json(result);

  } catch (error) {
    console.error('Auto-cancel error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// MESSAGES ROUTES
// ============================================================

app.post('/api/messages', verifyToken, async (req, res) => {
  try {
    const { tradeId, message, isSystem } = req.body;
    if (!tradeId || !message) return res.status(400).json({ error: 'Missing required fields' });
    const { data: trade, error: tradeError } = await supabaseAdmin.from('trades').select('buyer_id, seller_id, status').eq('id', tradeId).single();
    if (tradeError || !trade) return res.status(404).json({ error: 'Trade not found' });
    const isParticipant = trade.buyer_id === req.userId || trade.seller_id === req.userId;
    const recipientId = trade.buyer_id === req.userId ? trade.seller_id : trade.buyer_id;
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin').eq('id', req.userId).single();
    const senderRole = (userData?.is_moderator || userData?.is_admin) ? 'moderator' : 'user';
    // isSystem: only trusted if the sender is a participant in this trade
    const useSystem = isSystem && isParticipant;
    const { data, error } = await supabaseAdmin.from('messages').insert([{
      trade_id:     tradeId,
      sender_id:    useSystem ? null : req.userId,
      recipient_id: useSystem ? null : recipientId,
      message_text: message,
      message_type: useSystem ? 'SYSTEM' : 'CHAT',
      sender_role:  useSystem ? 'system' : senderRole,
      created_at:   new Date(),
    }]).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, message: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/:tradeId', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('messages').select('*').eq('trade_id', req.params.tradeId).order('created_at', { ascending: true });
    if (error) return res.json({ messages: [] });
    res.json({ messages: data || [] });
  } catch { res.json({ messages: [] }); }
});

// ============================================================
// IMAGE UPLOAD
// ============================================================

app.post('/api/trades/:id/upload-image', verifyToken, async (req, res) => {
  try {
    const { image, type } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });
    const { data, error } = await supabaseAdmin.from('trade_images')
      .insert({ trade_id: req.params.id, user_id: req.userId, image_url: image, image_type: type || 'proof', created_at: new Date() }).select();
    if (error) return res.json({ success: true });
    res.json({ success: true, image: data[0] });
  } catch { res.json({ success: true }); }
});

app.get('/api/trades/:id/images', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('trade_images').select('*').eq('trade_id', req.params.id).order('created_at', { ascending: false });
    if (error) return res.json({ images: [] });
    res.json({ images: data || [] });
  } catch { res.json({ images: [] }); }
});

// ============================================================
// TYPING INDICATORS
// ============================================================

app.post('/api/trades/:id/typing', verifyToken, async (req, res) => {
  typingState[`${req.params.id}:${req.userId}`] = Date.now() + 4000;
  res.json({ success: true });
});

app.get('/api/trades/:id/typing', verifyToken, async (req, res) => {
  const now = Date.now();
  const isTyping = Object.entries(typingState).some(
    ([k, v]) => k.startsWith(req.params.id + ':') && !k.endsWith(':' + req.userId) && v > now
  );
  res.json({ isTyping });
});

// ============================================================
// DISPUTES
// ============================================================

app.post('/api/trades/:id/dispute', tradeLimiter, verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    // Clear expires_at so no expiry logic (frontend timer or backend) can ever
    // auto-cancel this trade. Only a moderator can give the final verdict.
    const { data, error } = await supabaseAdmin.from('trades')
      .update({
        status: 'DISPUTED',
        disputed_at: new Date(),
        dispute_reason: reason || 'User opened a dispute',
        expires_at: null,
      })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, trade: data });

    setImmediate(async () => {
      // In-app notifications and system message
      await createNotification(trade.seller_id, 'support', '⚠️ Dispute Opened', `Dispute opened for trade #${req.params.id.slice(0, 8)}. Moderator will review.`, `/trade/${req.params.id}`);
      await createNotification(trade.buyer_id,  'support', '⚠️ Dispute Opened', `Dispute opened for trade #${req.params.id.slice(0, 8)}. Please provide evidence.`, `/trade/${req.params.id}`);
      notifyModerators(req.params.id, trade, reason || 'User opened a dispute').catch(e => console.error('[dispute] notifyModerators failed:', e.message));
      supabaseAdmin.from('messages').insert([{ trade_id: req.params.id, sender_id: null, recipient_id: null, message_text: `🚨 DISPUTE OPENED — Reason: ${reason || 'User opened a dispute'}. Moderators notified.`, message_type: 'SYSTEM', sender_role: 'system', created_at: new Date() }]).then(() => {}).catch(() => {});

      // Email both parties — fetch their user records in parallel
      const [buyerRes, sellerRes] = await Promise.allSettled([
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.buyer_id).single(),
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.seller_id).single(),
      ]);
      const buyerUser  = buyerRes.value?.data;
      const sellerUser = sellerRes.value?.data;
      if (buyerUser?.email)
        emailService.sendDisputeOpenedEmail(buyerUser,  trade, reason).catch(e => console.error('[dispute] buyer email failed:', e.message));
      if (sellerUser?.email)
        emailService.sendDisputeOpenedEmail(sellerUser, trade, reason).catch(e => console.error('[dispute] seller email failed:', e.message));
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/moderator-join', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin, username').eq('id', req.userId).single();
    if (!userData?.is_moderator && !userData?.is_admin) return res.status(403).json({ error: 'Moderators only' });
    const { data: trade } = await supabaseAdmin.from('trades').select('status, id, buyer_id, seller_id').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    await supabaseAdmin.from('messages').insert([{ trade_id: req.params.id, sender_id: req.userId, recipient_id: null, message_text: `👨‍⚖️ Moderator has joined and is reviewing this dispute.`, message_type: 'SYSTEM', sender_role: 'moderator', created_at: new Date() }]);
    res.json({ success: true, moderator: userData.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const ADMIN_EMAIL = 'parqen5@gmail.com';

app.get('/api/admin/disputes', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin, email').eq('id', req.userId).single();
    const isAdmin = userData?.is_admin || userData?.is_moderator || userData?.email === ADMIN_EMAIL;
    if (!isAdmin) return res.status(403).json({ error: 'Access denied' });
    const { data, error } = await supabaseAdmin.from('trades')
      .select('*, buyer:buyer_id(id, username), seller:seller_id(id, username)')
      .eq('status', 'DISPUTED').order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    const disputes = (data || []).map(t => ({
      id: t.id, trade_id: t.id, status: 'OPEN', reason: t.dispute_reason || 'User opened a dispute',
      initiated_by: t.buyer_id, created_at: t.disputed_at || t.updated_at, trade_details: t, buyer: t.buyer, seller: t.seller,
    }));
    res.json({ disputes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/disputes/:id/resolve', verifyToken, async (req, res) => {
  try {
    const { resolution, notes } = req.body;
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin, is_moderator, username, email').eq('id', req.userId).single();
    const isAdmin = userData?.is_admin || userData?.is_moderator || userData?.email === ADMIN_EMAIL;
    if (!isAdmin) return res.status(403).json({ error: 'Access denied' });
    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });

    // Delegate ALL balance moves to tradeEscrowService.resolveDispute().
    // This is the ONLY safe path — it uses atomic escrow claims, syncs both
    // user_balances and user_wallets, logs to wallet_transactions and balance_audit.
    await tradeEscrowService.resolveDispute(trade.id, resolution, req.userId, notes);

    const msgMap = {
      BUYER_WINS:  '✅ Resolved: BUYER WINS — Bitcoin released to buyer.',
      SELLER_WINS: '✅ Resolved: SELLER WINS — Bitcoin returned to seller.',
      CANCEL:      '❌ Resolved: Trade cancelled — Bitcoin returned to seller.',
    };
    const msg = msgMap[resolution] || `Resolved: ${resolution}`;

    await supabaseAdmin.from('messages').insert([{
      trade_id:     req.params.id,
      sender_id:    req.userId,
      message_text: `👨‍⚖️ Moderator resolved dispute.\nDecision: ${resolution}\nNotes: ${notes || 'None'}\n${msg}`,
      message_type: 'SYSTEM',
      sender_role:  'moderator',
      created_at:   new Date(),
    }]);
    for (const uid of [trade.buyer_id, trade.seller_id]) {
      await createNotification(uid, 'support', '⚖️ Dispute Resolved', `Trade #${trade.id.slice(0, 8)} dispute resolved: ${resolution}`, `/trade/${trade.id}`);
    }
    res.json({ success: true, message: `Dispute resolved: ${resolution}` });

    // Email both parties about the resolution
    setImmediate(async () => {
      const [buyerRes, sellerRes] = await Promise.allSettled([
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.buyer_id).single(),
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.seller_id).single(),
      ]);
      const buyerUser  = buyerRes.value?.data;
      const sellerUser = sellerRes.value?.data;
      if (buyerUser?.email)
        emailService.sendDisputeResolvedEmail(buyerUser,  trade, resolution, notes).catch(e => console.error('[resolve] buyer email failed:', e.message));
      if (sellerUser?.email)
        emailService.sendDisputeResolvedEmail(sellerUser, trade, resolution, notes).catch(e => console.error('[resolve] seller email failed:', e.message));
      sendTradeAlert([trade.buyer_id, trade.seller_id].filter(Boolean), trade, 'dispute_resolved').catch(() => {});
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/moderator-login', verifyToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Access code required' });
    const { data: user } = await supabaseAdmin.from('users').select('id, username, is_moderator, is_admin, email').eq('id', req.userId).single();
    if (user?.is_moderator || user?.is_admin || user?.email === ADMIN_EMAIL) {
      return res.json({ success: true, moderator: { username: user?.email === ADMIN_EMAIL ? 'PRAQEN Admin' : user.username, role: user?.email === ADMIN_EMAIL ? 'admin' : 'moderator' } });
    }
    const envCode = process.env.MODERATOR_ACCESS_CODE || 'PRAQEN_MOD_2024';
    if (code !== envCode) return res.status(403).json({ error: 'Invalid moderator code' });
    res.json({ success: true, token: `mod_${req.userId}`, moderator: { username: user?.username || 'Moderator', role: 'moderator' } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// FEEDBACK / REVIEWS
// ============================================================

app.post('/api/trades/:id/feedback', verifyToken, async (req, res) => {
  try {
    const { rating, comment, toUserId } = req.body;
    if (!rating || !toUserId) return res.status(400).json({ error: 'Missing required fields' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1–5' });
    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.status !== 'COMPLETED') return res.status(400).json({ error: 'Feedback can only be submitted after a trade is completed' });
    if (req.userId !== trade.buyer_id && req.userId !== trade.seller_id) return res.status(403).json({ error: 'Not a participant in this trade' });
    const { data: existing } = await supabaseAdmin.from('reviews').select('id').eq('trade_id', req.params.id).eq('reviewer_id', req.userId).single();
    if (existing) return res.status(400).json({ error: 'Feedback already submitted for this trade' });
    const { data: review, error } = await supabaseAdmin.from('reviews').insert([{ trade_id: req.params.id, reviewer_id: req.userId, reviewee_id: toUserId, rating: parseInt(rating), comment: comment || '', created_at: new Date() }]).select();
    if (error) return res.status(400).json({ error: error.message });

    // ── Atomic feedback increment via DB function ─────────────────────────────
    // Uses a single SQL UPDATE so no trigger or race condition can intercept
    // the read-modify-write cycle. DB-level guard (protect_user_stats trigger)
    // also blocks any attempt to lower the counts.
    const ratingVal = parseInt(rating);
    const { error: rpcErr } = await supabaseAdmin.rpc('praqen_add_feedback', {
      p_user_id: toUserId,
      p_rating:  ratingVal,
    });
    if (rpcErr) {
      // RPC not yet deployed — fall back to safe increment
      console.warn('[feedback] praqen_add_feedback RPC not found, using fallback:', rpcErr.message);
      const { data: recipientUser } = await supabaseAdmin
        .from('users')
        .select('positive_feedback, negative_feedback, total_feedback_count, average_rating')
        .eq('id', toUserId).single();
      const prevPos   = parseInt(recipientUser?.positive_feedback    || 0);
      const prevNeg   = parseInt(recipientUser?.negative_feedback     || 0);
      const prevCount = parseInt(recipientUser?.total_feedback_count  || 0);
      const prevAvg   = parseFloat(recipientUser?.average_rating      || 0);
      const newCount  = prevCount + 1;
      await supabaseAdmin.from('users').update({
        positive_feedback:    prevPos   + (ratingVal >= 4 ? 1 : 0),
        negative_feedback:    prevNeg   + (ratingVal <= 2 ? 1 : 0),
        total_feedback_count: newCount,
        average_rating:       parseFloat(((prevAvg * prevCount + ratingVal) / newCount).toFixed(2)),
      }).eq('id', toUserId);
    }

    res.json({ success: true, review: review[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// AFFILIATE
// ============================================================

app.get('/api/affiliate/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const [earningsResult, userResult] = await Promise.all([
      supabaseAdmin.from('affiliate_earnings').select('*').eq('referrer_id', userId).order('created_at', { ascending: false }),
      supabaseAdmin.from('users').select('referral_code, total_referrals, referral_earnings_btc, badge').eq('id', userId).single(),
    ]);
    if (earningsResult.error) throw earningsResult.error;
    const earnings  = earningsResult.data || [];
    const userData  = userResult.data || {};
    // Use referral_earnings_btc from users table as authoritative total (updated on each trade)
    const totalEarnings = parseFloat(userData.referral_earnings_btc || 0) ||
                          earnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);
    res.json({
      success: true,
      stats: {
        totalEarningsBtc:    totalEarnings,
        totalReferrals:      userData.total_referrals || 0,
        totalReferralTrades: earnings.length,
        currentBadge:        userData.badge || 'BEGINNER',
        referralCode:        userData.referral_code || '',
      },
      earnings,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/affiliate/earnings', verifyToken, async (req, res) => {
  try {
    const { data: earnings, error } = await supabaseAdmin.from('affiliate_earnings')
      .select(`id, commission_btc, trade_amount_btc, trade_amount_usd, commission_rate, status, created_at, trade_id, referred_user_id, referrer:referrer_id(id, username), referred:referred_user_id(id, username)`)
      .eq('referrer_id', req.userId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, earnings: earnings || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/referral/earnings', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Step 1 — fetch raw earnings WITHOUT a FK join so missing auth.users rows
    // can never silently drop earning rows from the result set.
    // Also fetch a plain COUNT separately — this is the authoritative Ref. Trades number.
    const [earningsResult, userResult, signupsResult, countResult] = await Promise.allSettled([
      supabaseAdmin
        .from('affiliate_earnings')
        .select('id, commission_btc, trade_amount_btc, trade_amount_usd, commission_rate, status, created_at, trade_id, referred_user_id')
        .eq('referrer_id', userId)
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('users')
        .select('total_referrals, referral_earnings_btc')
        .eq('id', userId)
        .single(),

      supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, created_at, total_trades, badge')
        .eq('referred_by', userId)
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('affiliate_earnings')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', userId),
    ]);

    const rawEarnings  = (earningsResult.status === 'fulfilled' ? earningsResult.value.data  : null) || [];
    const userData     = (userResult.status     === 'fulfilled' ? userResult.value.data      : null) || {};
    const signups      = (signupsResult.status  === 'fulfilled' ? signupsResult.value.data   : null) || [];
    const tradeCount   = (countResult.status    === 'fulfilled' ? countResult.value.count    : null) ?? rawEarnings.length;

    // Step 2 — look up referred users from the public users table separately
    // (bypasses any FK to auth.users that would hide rows for deleted accounts)
    const uniqueRefIds = [...new Set(rawEarnings.map(e => e.referred_user_id).filter(Boolean))];
    let referredUserMap = {};
    if (uniqueRefIds.length > 0) {
      const { data: refUsers } = await supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, created_at, total_trades, badge')
        .in('id', uniqueRefIds);
      (refUsers || []).forEach(u => { referredUserMap[u.id] = u; });
    }

    // Attach resolved user to each earning row
    const earnings = rawEarnings.map(e => ({
      ...e,
      referred_user: referredUserMap[e.referred_user_id] || null,
    }));

    const totalEarned = earnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);

    // Map total earnings per username for the referredUsers summary card
    const earningsPerUser = {};
    earnings.forEach(e => {
      const username = e.referred_user?.username || e.referred_user_id;
      if (username) {
        earningsPerUser[username] = (earningsPerUser[username] || 0) + parseFloat(e.commission_btc || 0);
      }
    });

    // Build referredUsers list — start with proper signups (referred_by set)
    const seenIds = new Set();
    const referredUsers = signups.map(u => {
      seenIds.add(u.id);
      return { username: u.username, avatar_url: u.avatar_url || null, total_trades: u.total_trades || 0, badge: u.badge || 'BEGINNER', joined_at: u.created_at, total_earned: earningsPerUser[u.username] || 0 };
    });

    // Also include users found only in affiliate_earnings (legacy / missing referred_by)
    earnings.forEach(e => {
      const ru = e.referred_user;
      const refId = e.referred_user_id;
      if (refId && !seenIds.has(refId)) {
        seenIds.add(refId);
        referredUsers.push({
          username:     ru?.username    || `user_${String(refId).slice(0,8)}`,
          avatar_url:   ru?.avatar_url  || null,
          total_trades: ru?.total_trades || 0,
          badge:        ru?.badge       || 'BEGINNER',
          joined_at:    ru?.created_at  || null,
          total_earned: earningsPerUser[ru?.username || refId] || 0,
        });
      }
    });

    // Use the users table referral_earnings_btc as the authoritative lifetime total.
    // The sum from affiliate_earnings rows may differ if a withdrawal was processed.
    const userReferralEarnings = parseFloat(userData.referral_earnings_btc || 0);
    const authorativeTotalEarned = userReferralEarnings > totalEarned ? userReferralEarnings : totalEarned;

    res.json({
      success: true,
      totalEarned: authorativeTotalEarned,
      userReferralEarnings,
      referralCount: userData.total_referrals != null ? userData.total_referrals : referredUsers.length,
      tradeCount,          // authoritative count of commission-generating trades
      referredUsers,
      earnings,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public leaderboard — top 10 referrers by referrals + earnings (real data)
app.get('/api/referral/leaderboard', async (req, res) => {
  try {
    // Step 1: compute real earnings + trade counts from affiliate_earnings table
    const { data: earningsRows } = await supabaseAdmin
      .from('affiliate_earnings')
      .select('referrer_id, commission_btc');

    const earningsMap    = {};
    const tradeCountMap  = {};
    (earningsRows || []).forEach(e => {
      const rid = e.referrer_id;
      earningsMap[rid]   = (earningsMap[rid]   || 0) + parseFloat(e.commission_btc || 0);
      tradeCountMap[rid] = (tradeCountMap[rid] || 0) + 1;
    });

    // Step 2: get users who have referrals (total_referrals > 0)
    const { data: referralUsers, error } = await supabaseAdmin
      .from('users')
      .select('id, username, badge, total_referrals, total_trades')
      .gt('total_referrals', 0)
      .order('total_referrals', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Step 3: add any earners not in the referralUsers list
    const knownIds  = new Set((referralUsers || []).map(u => u.id));
    const extraIds  = Object.keys(earningsMap).filter(id => !knownIds.has(id));
    let extraUsers  = [];
    if (extraIds.length > 0) {
      const { data: extra } = await supabaseAdmin
        .from('users')
        .select('id, username, badge, total_referrals, total_trades')
        .in('id', extraIds);
      extraUsers = extra || [];
    }

    // Step 4: merge, sort by earnings desc then referrals desc, take top 10
    const allUsers = [...(referralUsers || []), ...extraUsers];
    const leaderboard = allUsers
      .filter(u => (u.total_referrals || 0) > 0 || earningsMap[u.id] > 0)
      .map(u => ({
        id:              u.id,
        username:        u.username  || 'Trader',
        badge:           u.badge     || 'BEGINNER',
        earned_btc:      parseFloat((earningsMap[u.id] || 0).toFixed(8)),
        referrals:       u.total_referrals  || 0,
        total_trades:    u.total_trades     || 0,
        affiliate_trades: tradeCountMap[u.id] || 0,
      }))
      .sort((a, b) => b.earned_btc - a.earned_btc || b.referrals - a.referrals)
      .slice(0, 10)
      .map((u, i) => ({ ...u, rank: i + 1 }));

    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/referral/withdraw', verifyToken, async (req, res) => {
  try {
    const { data: earnings, error } = await supabaseAdmin
      .from('affiliate_earnings')
      .select('id, commission_btc')
      .eq('referrer_id', req.userId)
      .neq('status', 'WITHDRAWN');
    if (error) throw error;

    const totalEarnings = (earnings || []).reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);

    if (totalEarnings <= 0) {
      return res.status(400).json({ error: 'No earnings to withdraw' });
    }

    const btcRes = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    const btcData = await btcRes.json();
    const btcPrice = parseFloat(btcData.data.amount);

    if (totalEarnings * btcPrice < 10) {
      return res.status(400).json({ error: `Minimum $10 USD required. Current: $${(totalEarnings * btcPrice).toFixed(2)}` });
    }

    // Credit the wallets table — this is the SINGLE SOURCE OF TRUTH for balances.
    // The old code wrote to user_balances which is NOT read by the wallet page,
    // causing referral withdrawals to silently disappear from the user's view.
    const { data: walletRow, error: walletReadErr } = await supabaseAdmin
      .from('wallets')
      .select('balance_btc, locked_balance_btc')
      .eq('user_id', req.userId)
      .maybeSingle();

    if (walletReadErr) throw walletReadErr;

    const newBalance = parseFloat((parseFloat(walletRow?.balance_btc || 0) + totalEarnings).toFixed(8));

    const { error: balErr } = await supabaseAdmin
      .from('wallets')
      .update({
        balance_btc:        newBalance,
        locked_balance_btc: parseFloat(walletRow?.locked_balance_btc || 0),
        updated_at:         new Date().toISOString(),
      })
      .eq('user_id', req.userId);
    if (balErr) throw balErr;

    // Mark all pending earnings as withdrawn
    const ids = earnings.map(e => e.id);
    const { error: updErr } = await supabaseAdmin
      .from('affiliate_earnings')
      .update({ status: 'WITHDRAWN' })
      .in('id', ids);
    if (updErr) throw updErr;

    // Audit trail
    await supabaseAdmin.from('wallet_transactions').insert({
      user_id:    req.userId,
      type:       'REFERRAL_WITHDRAWAL',
      amount_btc: totalEarnings,
      status:     'CONFIRMED',
      notes:      `Referral earnings withdrawal — ₿${totalEarnings.toFixed(8)} from ${ids.length} commission(s)`,
      created_at: new Date().toISOString(),
    }).catch(() => {});

    res.json({ success: true, amountBtc: totalEarnings, message: `₿ ${totalEarnings.toFixed(8)} added to your wallet!` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NOTIFICATIONS
// ============================================================

app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    const { data: notifs, error } = await supabaseAdmin
      .from('notifications').select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false }).limit(50);
    if (error) return res.json({ notifications: [] });

    // Extract unique trade IDs from action URLs like /trade/<uuid>
    const tradeIds = [...new Set(
      (notifs || [])
        .map(n => n.action?.match(/\/trade\/([0-9a-f-]{8,})/i)?.[1])
        .filter(Boolean)
    )];

    let tradeMap = {};
    if (tradeIds.length > 0) {
      const { data: trades } = await supabaseAdmin
        .from('trades')
        .select(`id, trade_type, status, amount_local, local_currency, local_amount, currency,
                 amount_btc, amount_usd, payment_method, buyer_id, seller_id,
                 created_at, completed_at,
                 buyer:buyer_id(id, username, country),
                 seller:seller_id(id, username, country)`)
        .in('id', tradeIds);
      (trades || []).forEach(t => { tradeMap[t.id] = t; });
    }

    const enhanced = (notifs || []).map(n => {
      const tradeId = n.action?.match(/\/trade\/([0-9a-f-]{8,})/i)?.[1];
      return (tradeId && tradeMap[tradeId]) ? { ...n, trade: tradeMap[tradeId] } : n;
    });

    res.json({ notifications: enhanced });
  } catch { res.json({ notifications: [] }); }
});

app.put('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    await supabaseAdmin.from('notifications').update({ is_read: true, read_at: new Date() }).eq('id', req.params.id).eq('user_id', req.userId);
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

app.put('/api/notifications/read-all', verifyToken, async (req, res) => {
  try {
    await supabaseAdmin.from('notifications').update({ is_read: true, read_at: new Date() }).eq('user_id', req.userId).eq('is_read', false);
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

// ============================================================
// ADMIN PROFITS
// ============================================================

app.get('/api/admin/profits', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.userId).single();
    if (!userData?.is_admin) return res.status(403).json({ error: 'Admin access required' });
    const { data: profits, error } = await supabaseAdmin.from('company_profits').select('*').order('collected_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    const totalBtc = (profits || []).reduce((s, p) => s + parseFloat(p.profit_btc), 0);
    const totalUsd = (profits || []).reduce((s, p) => s + parseFloat(p.profit_usd), 0);
    res.json({ profits: profits || [], totalBtc: totalBtc.toFixed(8), totalUsd: totalUsd.toFixed(2), tradeCount: profits?.length || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ADMIN — SEND WELCOME EMAILS
// ============================================================

app.post('/api/admin/send-welcome-emails', verifyToken, async (req, res) => {
  try {
    const { data: admin } = await supabaseAdmin
      .from('users').select('is_admin').eq('id', req.userId).single();
    if (!admin?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email, username, referral_code')
      .is('welcome_email_sent', false)
      .limit(100);

    if (!users || users.length === 0)
      return res.json({ success: true, message: 'No users to send to', sent: 0 });

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const referralCode  = user.referral_code || user.username.toLowerCase();
      const affiliateLink = `https://praqen.com/signup?ref=${referralCode}`;
      const year          = new Date().getFullYear();

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F4F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F1;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(27,67,50,0.10);">

        <tr>
          <td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);padding:36px 32px 28px;text-align:center;">
            <div style="display:inline-block;background:#F4A422;border-radius:18px;width:60px;height:60px;line-height:60px;text-align:center;margin-bottom:14px;">
              <span style="font-size:32px;font-weight:900;color:#1B4332;font-family:Georgia,serif;">P</span>
            </div>
            <h1 style="color:#FFFFFF;font-size:26px;font-weight:900;margin:0 0 4px 0;">PRAQEN</h1>
            <p style="color:#95C4AE;font-size:12px;margin:0;letter-spacing:1px;text-transform:uppercase;">Africa's Trusted P2P Bitcoin Platform</p>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 32px 28px;">
            <h2 style="color:#1B4332;font-size:20px;font-weight:800;margin:0 0 10px 0;">Welcome to PRAQEN, ${user.username}! 🎉</h2>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
              Thank you for joining Africa's fastest-growing P2P Bitcoin trading platform. Your account is ready — and so is your personal referral link.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F1;border-radius:14px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="color:#1B4332;font-size:13px;font-weight:700;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">💰 Your Referral Link</p>
                <p style="color:#475569;font-size:13px;margin:0 0 10px 0;">Share this link — earn commission every time a referral trades.</p>
                <div style="background:#FFFFFF;border:1px solid #D1E8DA;border-radius:8px;padding:10px 14px;word-break:break-all;">
                  <a href="${affiliateLink}" style="color:#2D6A4F;font-size:13px;font-weight:600;text-decoration:none;">${affiliateLink}</a>
                </div>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F1;border-radius:14px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="color:#1B4332;font-size:13px;font-weight:700;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.5px;">🏆 Commission Tiers</p>
                <table width="100%" style="border-collapse:collapse;">
                  ${[
                    ['1–9 trades',    '0.10%'],
                    ['10–24 trades',  '0.15%'],
                    ['25–49 trades',  '0.20%'],
                    ['50–99 trades',  '0.25%'],
                    ['100+ trades',   '0.30%'],
                  ].map(([tier, rate], i) => `
                  <tr style="background:${i % 2 === 0 ? '#FFFFFF' : 'transparent'};">
                    <td style="padding:6px 10px;font-size:13px;color:#475569;">${tier}</td>
                    <td style="padding:6px 10px;font-size:13px;font-weight:700;color:#1B4332;text-align:right;">${rate}</td>
                  </tr>`).join('')}
                </table>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td style="padding:20px 24px;background:#F0F4F1;border-radius:14px;">
                <p style="color:#1B4332;font-size:13px;font-weight:700;margin:0 0 10px 0;text-transform:uppercase;letter-spacing:0.5px;">🚀 Quick Start</p>
                <ol style="color:#475569;font-size:13px;line-height:1.9;margin:0;padding-left:20px;">
                  <li>Verify your email and phone</li>
                  <li>Deposit Bitcoin to your wallet</li>
                  <li>Create a sell offer or browse buy listings</li>
                </ol>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr><td align="center">
                <a href="https://praqen.com" style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#FFFFFF;padding:15px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">Start Trading →</a>
              </td></tr>
            </table>

            <p style="color:#94A3B8;font-size:11px;margin:0;text-align:center;">
              Questions? Email <a href="mailto:support@praqen.com" style="color:#2D6A4F;">support@praqen.com</a>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#F0F4F1;padding:18px 32px;text-align:center;">
            <p style="color:#64748B;font-size:11px;font-weight:700;margin:0 0 4px 0;">PRAQEN — SECURE P2P BITCOIN TRADING</p>
            <p style="color:#CBD5E1;font-size:10px;margin:0;">© ${year} PRAQEN. All rights reserved. 🔒 Escrow protected.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const subject = `Welcome to PRAQEN, ${user.username}! 🎉 Start Trading Bitcoin`;
      const mailOpts = {
        from: `"PRAQEN" <${process.env.EMAIL_USER || 'kendevdash@gmail.com'}>`,
        to: user.email, subject, html,
      };

      let delivered = false;

      // Try SMTP 587
      try {
        await transporter.sendMail(mailOpts);
        delivered = true;
      } catch (e1) {
        console.warn(`[Welcome] SMTP 587 failed for ${user.email}:`, e1.message);
      }

      // Try SMTP 465
      if (!delivered) {
        try {
          const sslT = require('nodemailer').createTransport({
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
          });
          await sslT.sendMail(mailOpts);
          delivered = true;
        } catch (e2) {
          console.warn(`[Welcome] SMTP 465 failed for ${user.email}:`, e2.message);
        }
      }

      // Try Resend
      if (!delivered && resendClient) {
        try {
          const { error: resendErr } = await resendClient.emails.send({
            from: RESEND_FROM_ADDR,
            to: user.email, subject, html,
          });
          if (!resendErr) delivered = true;
          else console.warn(`[Welcome] Resend failed for ${user.email}:`, resendErr.message);
        } catch (e3) {
          console.warn(`[Welcome] Resend error for ${user.email}:`, e3.message);
        }
      }

      if (delivered) {
        await supabaseAdmin.from('users').update({ welcome_email_sent: true }).eq('id', user.id);
        sent++;
        console.log(`✅ Welcome email sent to ${user.email}`);
      } else {
        failed++;
        console.error(`❌ All delivery methods failed for ${user.email}`);
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 300));
    }

    res.json({ success: true, sent, failed, total: users.length });
  } catch (err) {
    console.error('[send-welcome-emails] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN — COMPREHENSIVE MANAGEMENT ROUTES
// ============================================================

// Helper: verify admin access
async function requireAdmin(req, res) {
  const { data: u } = await supabaseAdmin.from('users').select('is_admin, is_moderator, email').eq('id', req.userId).single();
  const ok = u?.is_admin || u?.is_moderator || u?.email === ADMIN_EMAIL;
  if (!ok) { res.status(403).json({ error: 'Admin access required' }); return null; }
  return u;
}

// GET /api/admin/stats — full platform overview
app.get('/api/admin/stats', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const [usersR, tradesR, listingsR, profitsR, disputesR, kycR] = await Promise.allSettled([
      supabaseAdmin.from('users').select('id, created_at, account_status, is_email_verified, is_id_verified, badge', { count: 'exact' }),
      supabaseAdmin.from('trades').select('id, status, amount_usd, amount_btc, created_at', { count: 'exact' }),
      supabaseAdmin.from('listings').select('id, status', { count: 'exact' }),
      supabaseAdmin.from('company_profits').select('profit_btc, profit_usd'),
      supabaseAdmin.from('trades').select('id', { count: 'exact' }).eq('status', 'DISPUTED'),
      supabaseAdmin.from('users').select('id', { count: 'exact' }).eq('kyc_status', 'pending'),
    ]);
    const uD = usersR.status    === 'fulfilled' ? usersR.value    : { data: [], count: 0 };
    const tD = tradesR.status   === 'fulfilled' ? tradesR.value   : { data: [], count: 0 };
    const lD = listingsR.status === 'fulfilled' ? listingsR.value : { data: [], count: 0 };
    const pD = profitsR.status  === 'fulfilled' ? profitsR.value  : { data: [] };
    const dD = disputesR.status === 'fulfilled' ? disputesR.value : { count: 0 };
    const kD = kycR.status      === 'fulfilled' ? kycR.value      : { count: 0 };
    const users   = uD.data  || [];
    const trades  = tD.data  || [];
    const profits = pD.data  || [];
    const now = Date.now();
    const day = 86400000;
    const newUsersToday  = users.filter(u => now - new Date(u.created_at) < day).length;
    const newUsersWeek   = users.filter(u => now - new Date(u.created_at) < 7*day).length;
    const activeTrades   = trades.filter(t => ['CREATED','FUNDS_LOCKED','ESCROW','ACTIVE','OPEN','PAYMENT_SENT','PAID'].includes(t.status)).length;
    const completedTrades= trades.filter(t => t.status === 'COMPLETED').length;
    const cancelledTrades= trades.filter(t => t.status === 'CANCELLED').length;
    const totalVolumeUsd = trades.filter(t => t.status === 'COMPLETED').reduce((s, t) => s + parseFloat(t.amount_usd || 0), 0);
    const totalVolumeBtc = trades.filter(t => t.status === 'COMPLETED').reduce((s, t) => s + parseFloat(t.amount_btc || 0), 0);
    const totalRevBtc    = profits.reduce((s, p) => s + parseFloat(p.profit_btc || 0), 0);
    const totalRevUsd    = profits.reduce((s, p) => s + parseFloat(p.profit_usd || 0), 0);
    // Trades per day last 7 days
    const tradeDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const count = trades.filter(t => {
        const td = new Date(t.created_at);
        return td.toDateString() === d.toDateString();
      }).length;
      return { label, count };
    });
    res.json({
      totalUsers: uD.count || users.length,
      newUsersToday, newUsersWeek,
      verifiedUsers: users.filter(u => u.is_email_verified).length,
      kycVerified:   users.filter(u => u.is_id_verified).length,
      pendingKyc:    kD.count || 0,
      totalTrades:   tD.count || trades.length,
      activeTrades, completedTrades, cancelledTrades,
      openDisputes:  dD.count || 0,
      activeListings: (lD.data || []).filter(l => l.status === 'ACTIVE').length,
      totalListings:  lD.count || 0,
      totalVolumeUsd: totalVolumeUsd.toFixed(2),
      totalVolumeBtc: totalVolumeBtc.toFixed(8),
      totalRevBtc:    totalRevBtc.toFixed(8),
      totalRevUsd:    totalRevUsd.toFixed(2),
      tradeDays,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/users — all users with search/filter/pagination
app.get('/api/admin/users', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { search = '', status = '', country = '', page = 1, limit = 50 } = req.query;
    let query = supabaseAdmin.from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (search) query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%,full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    if (status === 'phone_pending') query = query.not('phone', 'is', null).eq('is_phone_verified', false);
    else if (status === 'kyc_pending') query = query.eq('kyc_status', 'pending');
    else if (status) query = query.eq('account_status', status);
    if (country) query = query.eq('country', country.toUpperCase());
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ users: data || [], total: count || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id — update user (ban, make admin, verify, etc.)
app.put('/api/admin/users/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const allowed = ['account_status', 'is_admin', 'is_moderator', 'is_id_verified', 'is_email_verified', 'badge', 'kyc_status'];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields' });
    updates.updated_at = new Date();
    const { data, error } = await supabaseAdmin.from('users').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/users/:id — delete user account
app.delete('/api/admin/users/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    if (req.params.id === req.userId) return res.status(400).json({ error: 'Cannot delete your own account' });
    const { error } = await supabaseAdmin.from('users').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/trades/all — all trades with filter/pagination
app.get('/api/admin/trades/all', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status = '', page = 1, limit = 50, search = '' } = req.query;
    let query = supabaseAdmin.from('trades')
      .select('*, buyer:buyer_id(id, username, email), seller:seller_id(id, username, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`id.ilike.%${search}%,trade_ref.ilike.%${search}%`);
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ trades: data || [], total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/trades/:id — force update trade status
app.put('/api/admin/trades/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const updates = { status, admin_notes: notes, updated_at: new Date() };
    if (status === 'COMPLETED') updates.completed_at = new Date();
    if (status === 'CANCELLED') updates.cancelled_at = new Date();
    const { data, error } = await supabaseAdmin.from('trades').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, trade: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/kyc — pending KYC submissions (resilient to missing columns)
app.get('/api/admin/kyc', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status = 'pending' } = req.query;

    let query = supabaseAdmin.from('users')
      .select('*')
      .order('kyc_submitted_at', { ascending: true, nullsFirst: false });

    if (status === 'all') {
      query = query.or('id_front_url.not.is.null,kyc_status.not.is.null');
    } else if (status === 'pending') {
      query = query.or('kyc_status.eq.pending,and(kyc_status.is.null,id_front_url.not.is.null)');
    } else {
      query = query.eq('kyc_status', status);
    }

    const { data, error } = await query;

    if (error) {
      // KYC columns likely haven't been migrated yet — fall back to basic query
      console.warn('[admin/kyc] Column error (run admin_columns.sql):', error.message);
      const { data: fallback } = await supabaseAdmin.from('users')
        .select('id, email, username, created_at, country, is_id_verified')
        .eq('is_id_verified', false)
        .order('created_at', { ascending: false })
        .limit(50);
      return res.json({
        submissions: (fallback || []).map(u => ({ ...u, kyc_status: null, _migration_needed: true })),
        migration_needed: true,
        migration_hint: 'Run admin_columns.sql in Supabase SQL Editor to enable full KYC management.',
      });
    }

    res.json({ submissions: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/backfill-kyc — set kyc_status='pending' for legacy users who uploaded docs
app.post('/api/admin/backfill-kyc', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users')
      .update({ kyc_status: 'pending', updated_at: new Date() })
      .not('id_front_url', 'is', null)
      .is('kyc_status', null)
      .select('id, username');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, updated: (data || []).length, users: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/kyc/:userId/approve
app.put('/api/admin/kyc/:userId/approve', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data: updated, error } = await supabaseAdmin.from('users')
      .update({ kyc_status: 'approved', is_id_verified: true, kyc_approved_at: new Date(), updated_at: new Date() })
      .eq('id', req.params.userId)
      .select('id, username, kyc_status, is_id_verified')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    try {
      await createNotification(req.params.userId, 'kyc', '✅ KYC Approved', 'Your identity has been verified. You now have full access to all PRAQEN features.', '/settings');
      sendSystemAlert(req.params.userId, '🪪 KYC Approved!', 'Your identity has been verified. Full access to all PRAQEN features is now unlocked!', 'https://praqen.com/settings').catch(() => {});
    } catch (_) {}
    res.json({ success: true, user: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/kyc/:userId/reject
app.put('/api/admin/kyc/:userId/reject', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { reason = 'Documents unclear or invalid' } = req.body;
    const { data: updated, error } = await supabaseAdmin.from('users')
      .update({ kyc_status: 'rejected', is_id_verified: false, kyc_rejection_reason: reason, updated_at: new Date() })
      .eq('id', req.params.userId)
      .select('id, username, kyc_status, is_id_verified')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    try {
      await createNotification(req.params.userId, 'kyc', '❌ KYC Rejected', `Your KYC was not approved: ${reason}. Please re-submit with clearer documents.`, '/settings');
    } catch (_) {}
    res.json({ success: true, user: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/kyc/:userId/image?type=front|back
app.get('/api/admin/kyc/:userId/image', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { userId } = req.params;
    const { type = 'front' } = req.query;

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id_front_url, id_back_url')
      .eq('id', userId)
      .single();

    if (userErr || !user) return res.status(404).json({ error: 'User not found' });

    const storedUrl = type === 'back' ? user.id_back_url : user.id_front_url;
    if (!storedUrl) return res.status(404).json({ error: 'No image on file for this user' });

    // Detect content type from file extension
    const ext = (storedUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' };
    const contentType = mimeMap[ext] || 'image/jpeg';

    // Extract storage path from URL — handles /public/, /sign/, /authenticated/ formats
    const match = storedUrl.match(/\/object\/(?:public|sign|authenticated)\/kyc-documents\/(.+?)(?:\?|$)/);

    if (match) {
      const storagePath = decodeURIComponent(match[1]);

      // Try: download directly via service role (bypasses bucket RLS)
      const { data: fileData, error: dlErr } = await supabaseAdmin.storage
        .from('kyc-documents')
        .download(storagePath);

      if (!dlErr && fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'private, max-age=300');
        return res.send(buffer);
      }

      // Try: signed URL (works for private buckets)
      const { data: signedData } = await supabaseAdmin.storage
        .from('kyc-documents')
        .createSignedUrl(storagePath, 300);

      if (signedData?.signedUrl) {
        // Fetch the signed URL server-side and stream to admin
        const imgRes = await axios.get(signedData.signedUrl, { responseType: 'arraybuffer', timeout: 10000 });
        res.set('Content-Type', imgRes.headers['content-type'] || contentType);
        res.set('Cache-Control', 'private, max-age=300');
        return res.send(Buffer.from(imgRes.data));
      }
    }

    // Last resort: fetch the stored URL directly (works if bucket is public)
    try {
      const imgRes = await axios.get(storedUrl, { responseType: 'arraybuffer', timeout: 10000 });
      res.set('Content-Type', imgRes.headers['content-type'] || contentType);
      res.set('Cache-Control', 'private, max-age=300');
      return res.send(Buffer.from(imgRes.data));
    } catch (_) {}

    res.status(404).json({ error: 'Image could not be loaded from storage' });
  } catch (e) {
    console.error('[admin/kyc/image]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/listings/all — all listings
app.get('/api/admin/listings/all', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status = '', page = 1, limit = 50 } = req.query;
    let query = supabaseAdmin.from('listings')
      .select('*, seller:seller_id(id, username, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (status) query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ listings: data || [], total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/listings/:id — update listing (pause/activate)
app.put('/api/admin/listings/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status } = req.body;
    const { data, error } = await supabaseAdmin.from('listings').update({ status, updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, listing: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/listings/:id — delete listing
app.delete('/api/admin/listings/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { error } = await supabaseAdmin.from('listings').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/broadcast — send in-app + push notification to all users
app.post('/api/admin/broadcast', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { title, message, type = 'system', url } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });

    const { data: users } = await supabaseAdmin.from('users').select('id').eq('account_status', 'active');
    if (!users?.length) return res.json({ success: true, sent: 0 });

    // ── In-app notifications (batched DB inserts) ─────────────────────────
    const notifications = users.map(u => ({ user_id: u.id, type, title, message, is_read: false, created_at: new Date() }));
    for (let i = 0; i < notifications.length; i += 100) {
      await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + 100));
    }

    // ── Push notification to ALL subscribed devices (one OneSignal call) ──
    sendBroadcastPush(title, message, url || 'https://praqen.com').catch(e =>
      console.error('[broadcast] push failed:', e.message)
    );

    res.json({ success: true, sent: users.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/broadcast-email — send email broadcast to all users
app.post('/api/admin/broadcast-email', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { subject, htmlBody, broadcastType = 'broadcast' } = req.body;
    if (!subject || !htmlBody) return res.status(400).json({ error: 'subject and htmlBody required' });

    // Run in background — can take minutes for large user lists
    res.json({ success: true, message: 'Email broadcast started in background. Check server logs for progress.' });

    setImmediate(async () => {
      try {
        const result = await emailService.sendBroadcastToAllUsers(subject, htmlBody, broadcastType);
        console.log(`[broadcast-email] ✅ Done — sent:${result.sent} failed:${result.failed} total:${result.total}`);
      } catch (e) {
        console.error('[broadcast-email] ❌ Failed:', e.message);
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/broadcast/eid-bonus — send personalised Eid Mubarak + $2 bonus email to all users
app.post('/api/admin/broadcast/eid-bonus', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;

    // Count eligible users first so we can respond immediately
    const { count, error: countErr } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .not('email', 'is', null);

    if (countErr) return res.status(500).json({ error: 'Failed to count users: ' + countErr.message });

    res.json({
      success: true,
      message: `Eid broadcast started in background for ~${count} users. Check server logs for progress.`,
      total: count,
    });

    // Run the bulk send after response is flushed — keeps HTTP fast
    setImmediate(async () => {
      console.log(`\n🌙 [eid-bonus] Starting Eid broadcast to ~${count} users...`);
      let sent = 0, failed = 0, page = 0;
      const PAGE = 100;

      try {
        while (true) {
          const { data: users, error: fetchErr } = await supabaseAdmin
            .from('users')
            .select('id, email, username, referral_code')
            .not('email', 'is', null)
            .not('email', 'eq', '')
            .range(page * PAGE, page * PAGE + PAGE - 1);

          if (fetchErr) { console.error('[eid-bonus] Fetch error:', fetchErr.message); break; }
          if (!users || users.length === 0) break;

          // Send in mini-batches of 5 to respect SMTP rate limits
          for (let i = 0; i < users.length; i += 5) {
            const batch = users.slice(i, i + 5);
            await Promise.allSettled(batch.map(async (u) => {
              try {
                const result = await emailService.sendEidBonusEmail({
                  userId:       u.id,
                  to:           u.email,
                  username:     u.username || 'Trader',
                  referralCode: u.referral_code || '',
                });
                if (result.success) sent++; else { failed++; console.warn(`[eid-bonus] Failed for ${u.email}: ${result.error}`); }
              } catch (e) {
                failed++;
                console.warn(`[eid-bonus] Exception for ${u.email}:`, e.message);
              }
            }));
            // 1.5s between mini-batches
            if (i + 5 < users.length) await new Promise(r => setTimeout(r, 1500));
          }

          console.log(`[eid-bonus] Page ${page + 1}: sent=${sent} failed=${failed}`);
          if (users.length < PAGE) break;
          page++;
          // 3s pause between pages to give SMTP room to breathe
          await new Promise(r => setTimeout(r, 3000));
        }

        console.log(`✅ [eid-bonus] Broadcast complete — sent:${sent} failed:${failed} total:${sent + failed}`);
      } catch (e) {
        console.error('[eid-bonus] ❌ Fatal broadcast error:', e.message);
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/revenue — revenue over time
app.get('/api/admin/revenue', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data: profits } = await supabaseAdmin.from('company_profits').select('*').order('collected_at', { ascending: false }).limit(200);
    const { data: affiliates } = await supabaseAdmin.from('affiliate_earnings').select('commission_btc, commission_usd, status, created_at').order('created_at', { ascending: false }).limit(100);
    const totalRevBtc = (profits || []).reduce((s, p) => s + parseFloat(p.profit_btc || 0), 0);
    const totalRevUsd = (profits || []).reduce((s, p) => s + parseFloat(p.profit_usd || 0), 0);
    const totalAffBtc = (affiliates || []).filter(a => a.status === 'COMPLETED').reduce((s, a) => s + parseFloat(a.commission_btc || 0), 0);
    res.json({ profits: profits || [], affiliates: affiliates || [], totalRevBtc: totalRevBtc.toFixed(8), totalRevUsd: totalRevUsd.toFixed(2), totalAffBtc: totalAffBtc.toFixed(8) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/verify-email — manually verify email
app.put('/api/admin/users/:id/verify-email', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users').update({ is_email_verified: true, updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await createNotification(req.params.id, 'system', '📧 Email Verified', 'Your email address has been manually verified by an admin.', '/settings');
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/verify-phone — manually verify phone (legacy button in Users panel)
app.put('/api/admin/users/:id/verify-phone', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users').update({ is_phone_verified: true, phone_verified: true, updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    // Update request row if it exists
    await supabaseAdmin.from('phone_verification_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: req.userId })
      .eq('user_id', req.params.id).catch(() => {});
    await createNotification(req.params.id, 'system', '📱 Phone Number Verified!', 'Great news! Your phone number has been verified by our team. Your trade limit has been upgraded. You can now continue trading.', '/settings?tab=verification');
    sendSystemAlert(req.params.id, '📱 Phone Verified!', 'Your phone number has been verified. Trade limits upgraded!', 'https://praqen.com/settings?tab=verification').catch(() => {});
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Phone verification request endpoints ──────────────────────────────────────

// GET /api/admin/phone-verifications/pending — list all requests with user info
app.get('/api/admin/phone-verifications/pending', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status = 'pending', page = 1, limit = 50 } = req.query;
    const from = (parseInt(page) - 1) * parseInt(limit);
    const to   = from + parseInt(limit) - 1;

    let query = supabaseAdmin
      .from('phone_verification_requests')
      .select('id, user_id, phone, status, submitted_at, reviewed_at, rejection_reason', { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range(from, to);

    if (status && status !== 'all') query = query.eq('status', status);

    const { data: requests, count, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Attach user info for each request
    const userIds = [...new Set((requests || []).map(r => r.user_id))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, username, email, full_name, avatar_url, is_phone_verified, created_at')
        .in('id', userIds);
      (users || []).forEach(u => { usersMap[u.id] = u; });
    }

    const enriched = (requests || []).map(r => ({ ...r, user: usersMap[r.user_id] || null }));
    res.json({ requests: enriched, total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/phone-verifications/:id/approve — approve a phone request
app.put('/api/admin/phone-verifications/:id/approve', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;

    const { data: request, error: fetchErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .select('*').eq('id', req.params.id).single();
    if (fetchErr || !request) return res.status(404).json({ error: 'Verification request not found' });

    // Mark request as approved
    const { error: reqErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: req.userId })
      .eq('id', req.params.id);
    if (reqErr) return res.status(400).json({ error: reqErr.message });

    // Mark user as phone-verified
    const { error: userErr } = await supabaseAdmin
      .from('users')
      .update({ is_phone_verified: true, phone_verified: true, phone: request.phone, updated_at: new Date().toISOString() })
      .eq('id', request.user_id);
    if (userErr) return res.status(400).json({ error: userErr.message });

    // Notify the user
    await createNotification(request.user_id, 'system', '📱 Phone Number Verified!',
      `Your number ${request.phone} has been verified. Your trade limits have been upgraded!`,
      '/settings?tab=verification').catch(() => {});
    sendSystemAlert(request.user_id, '📱 Phone Verified!',
      'Your phone number has been verified. Trade limits upgraded!',
      'https://praqen.com/settings?tab=verification').catch(() => {});

    console.log(`[phone-verif] ✅ Admin ${req.userId.slice(0,8)} approved ${request.phone} for user ${request.user_id.slice(0,8)}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/phone-verifications/:id/reject — reject a phone request
app.put('/api/admin/phone-verifications/:id/reject', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { reason = 'Phone number could not be verified' } = req.body;

    const { data: request, error: fetchErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .select('*').eq('id', req.params.id).single();
    if (fetchErr || !request) return res.status(404).json({ error: 'Verification request not found' });

    // Mark request as rejected
    const { error: reqErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: req.userId, rejection_reason: reason })
      .eq('id', req.params.id);
    if (reqErr) return res.status(400).json({ error: reqErr.message });

    // Clear the phone from users table so they can re-submit
    await supabaseAdmin
      .from('users')
      .update({ phone: null, updated_at: new Date().toISOString() })
      .eq('id', request.user_id).catch(() => {});

    // Notify the user
    await createNotification(request.user_id, 'system', '📱 Phone Verification Failed',
      `We could not verify ${request.phone}. Reason: ${reason}. Please submit a valid number.`,
      '/settings?tab=verification').catch(() => {});

    console.log(`[phone-verif] ❌ Admin ${req.userId.slice(0,8)} rejected ${request.phone} for user ${request.user_id.slice(0,8)}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Direct user-table phone endpoints (reliable regardless of phone_verification_requests table) ──

// GET /api/admin/phone/pending — users who have a phone but are not yet verified
app.get('/api/admin/phone/pending', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;

    // Fetch pending users and their submission timestamps in parallel
    const [usersRes, reqsRes] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, username, full_name, email, phone, is_phone_verified, created_at, last_login, country, avatar_url')
        .not('phone', 'is', null)
        .neq('phone', '')
        .eq('is_phone_verified', false)
        .order('created_at', { ascending: false })
        .limit(200),
      supabaseAdmin
        .from('phone_verification_requests')
        .select('user_id, submitted_at, status')
        .eq('status', 'pending'),
    ]);

    if (usersRes.error) return res.status(400).json({ error: usersRes.error.message });

    // Map submission timestamps by user_id
    const submittedAt = new Map(
      (reqsRes.data || []).map(r => [r.user_id, r.submitted_at])
    );

    const enriched = (usersRes.data || []).map(u => ({
      ...u,
      submitted_at: submittedAt.get(u.id) || null,
    }));

    // Sort by earliest submission first so oldest waiting users appear at top
    enriched.sort((a, b) => {
      const da = new Date(a.submitted_at || a.created_at);
      const db = new Date(b.submitted_at || b.created_at);
      return da - db;
    });

    res.json({ users: enriched, total: enriched.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/phone/approve — approve a user's phone number by userId
app.post('/api/admin/phone/approve', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // If users.phone is null (submission bug), recover it from phone_verification_requests
    const { data: existingUser } = await supabaseAdmin
      .from('users').select('phone').eq('id', userId).single();
    if (!existingUser?.phone) {
      const { data: pvr } = await supabaseAdmin
        .from('phone_verification_requests').select('phone').eq('user_id', userId).single();
      if (pvr?.phone) {
        await supabaseAdmin.from('users')
          .update({ phone: pvr.phone }).eq('id', userId).catch(() => {});
        console.log(`[phone/approve] recovered missing phone ${pvr.phone} for user ${userId.slice(0,8)}`);
      }
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update({ is_phone_verified: true, phone_verified: true, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, username, phone')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Also mark any pending request row as approved
    await supabaseAdmin.from('phone_verification_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: req.userId })
      .eq('user_id', userId).catch(() => {});

    await createNotification(userId, 'system', '📱 Phone Number Verified!',
      'Your phone number has been verified by our team. Your trade limits have been upgraded!',
      '/settings?tab=verification').catch(() => {});
    sendSystemAlert(userId, '📱 Phone Verified!',
      'Your phone number has been verified. Trade limits upgraded!',
      'https://praqen.com/settings?tab=verification').catch(() => {});

    console.log(`[phone/approve] ✅ Admin ${req.userId.slice(0,8)} approved ${user.phone} for user ${userId.slice(0,8)}`);
    res.json({ success: true, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/phone/reject — reject a user's phone (clears it so they can re-submit)
app.post('/api/admin/phone/reject', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { userId, reason = 'Phone number could not be verified' } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Get the phone number before clearing it
    const { data: existing } = await supabaseAdmin
      .from('users').select('phone').eq('id', userId).single();
    const phone = existing?.phone || 'unknown';

    const { error } = await supabaseAdmin
      .from('users')
      .update({ phone: null, is_phone_verified: false, phone_verified: false, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return res.status(400).json({ error: error.message });

    await supabaseAdmin.from('phone_verification_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: req.userId, rejection_reason: reason })
      .eq('user_id', userId).catch(() => {});

    await createNotification(userId, 'system', '📱 Phone Verification Failed',
      `Your phone number (${phone}) could not be verified. Reason: ${reason}. Please submit a valid number.`,
      '/settings?tab=verification').catch(() => {});

    console.log(`[phone/reject] ❌ Admin ${req.userId.slice(0,8)} rejected ${phone} for user ${userId.slice(0,8)}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/ban — ban a user
app.put('/api/admin/users/:id/ban', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { reason = '' } = req.body;
    if (req.params.id === req.userId) return res.status(400).json({ error: 'Cannot ban your own account' });
    const { data, error } = await supabaseAdmin.from('users').update({ account_status: 'banned', updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    if (reason) await createNotification(req.params.id, 'security', '🚫 Account Banned', `Your account has been banned. Reason: ${reason}`, '/');
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/unban — reinstate a banned user
app.put('/api/admin/users/:id/unban', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users').update({ account_status: 'active', updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await createNotification(req.params.id, 'system', '✅ Account Reinstated', 'Your account ban has been lifted. Welcome back to PRAQEN!', '/dashboard');
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/make-admin — toggle admin role
app.put('/api/admin/users/:id/make-admin', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data: cur } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.params.id).single();
    const newVal = !cur?.is_admin;
    const { data, error } = await supabaseAdmin.from('users').update({ is_admin: newVal, updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, user: data, is_admin: newVal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/users/new — users who joined in the last 7 days
app.get('/api/admin/users/new', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error, count } = await supabaseAdmin.from('users')
      .select('id, email, username, full_name, avatar_url, account_status, is_email_verified, is_phone_verified, is_id_verified, total_trades, country, created_at, last_login', { count: 'exact' })
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ users: data || [], total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/reports — feedback and dispute reports
app.get('/api/admin/reports', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const [feedbackR, disputesR] = await Promise.all([
      supabaseAdmin.from('trade_feedback')
        .select('id, rating, comment, created_at, reviewer:reviewer_id(username, email), reviewed:reviewed_id(username, email), trade:trade_id(id, trade_ref, status, amount_usd)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabaseAdmin.from('trades')
        .select('id, trade_ref, status, amount_usd, amount_btc, dispute_reason, disputed_at, created_at, buyer:buyer_id(username, email), seller:seller_id(username, email)')
        .eq('status', 'DISPUTED')
        .order('disputed_at', { ascending: false })
        .limit(50),
    ]);
    res.json({ feedback: feedbackR.data || [], disputes: disputesR.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/activity — recent user activity logs
app.get('/api/admin/activity', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users')
      .select('id, username, email, last_login, last_seen_at, created_at, total_trades, account_status, country, is_email_verified, is_phone_verified, is_id_verified')
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ activity: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// COMMUNITY SUGGESTIONS BOARD
// ============================================================

// Helper: flatten joined user onto suggestion row
function flattenSuggestion(s) {
  const username = s.users?.username || s.username || 'Anonymous';
  const { users: _u, ...rest } = s;
  return { ...rest, username };
}

// GET /api/suggestions — public list (optional auth for user_voted flag)
app.get('/api/suggestions', optionalAuth, async (req, res) => {
  try {
    const { sort = 'votes', category = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin.from('suggestions')
      .select('*, users!suggestions_user_id_fkey(id, username)', { count: 'exact' })
      .order('is_pinned', { ascending: false })
      .order(sort === 'votes' ? 'upvotes' : 'created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (category) query = query.eq('category', category);
    if (status)   query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Attach user_voted flag for logged-in users
    let votedSet = new Set();
    if (req.userId && data?.length) {
      const ids = data.map(s => s.id);
      const { data: votes } = await supabaseAdmin.from('suggestion_votes')
        .select('suggestion_id')
        .eq('user_id', req.userId)
        .in('suggestion_id', ids);
      votedSet = new Set((votes || []).map(v => v.suggestion_id));
    }

    res.json({
      suggestions: (data || []).map(s => ({ ...flattenSuggestion(s), user_voted: votedSet.has(s.id) })),
      total: count || 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/suggestions — submit a new suggestion (requires auth)
app.post('/api/suggestions', verifyToken, async (req, res) => {
  try {
    const { title, body, category = 'feature' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (title.length > 200) return res.status(400).json({ error: 'Title too long (max 200 chars)' });

    const VALID_CATS = ['feature', 'trading', 'bug', 'improvement', 'other'];
    const safeCategory = VALID_CATS.includes(category) ? category : 'other';

    const { data: user } = await supabaseAdmin.from('users')
      .select('username, account_status').eq('id', req.userId).single();
    if (user?.account_status === 'banned') return res.status(403).json({ error: 'Account suspended' });

    // Insert without username — we join users table on read
    const { data, error } = await supabaseAdmin.from('suggestions').insert({
      user_id:    req.userId,
      title:      title.trim(),
      body:       body?.trim()?.slice(0, 1000) || null,
      category:   safeCategory,
      upvotes:    0,
      status:     'open',
      created_at: new Date(),
      updated_at: new Date(),
    }).select('*, users!suggestions_user_id_fkey(id, username)').single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, suggestion: { ...flattenSuggestion(data), user_voted: false } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/suggestions/:id/vote — toggle upvote
app.post('/api/suggestions/:id/vote', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabaseAdmin.from('suggestion_votes')
      .select('id').eq('suggestion_id', id).eq('user_id', req.userId).maybeSingle();

    const { data: current } = await supabaseAdmin.from('suggestions')
      .select('upvotes').eq('id', id).single();

    let voted;
    if (existing) {
      await supabaseAdmin.from('suggestion_votes')
        .delete().eq('suggestion_id', id).eq('user_id', req.userId);
      await supabaseAdmin.from('suggestions')
        .update({ upvotes: Math.max(0, (current?.upvotes || 1) - 1), updated_at: new Date() }).eq('id', id);
      voted = false;
    } else {
      await supabaseAdmin.from('suggestion_votes')
        .insert({ suggestion_id: id, user_id: req.userId, created_at: new Date() });
      await supabaseAdmin.from('suggestions')
        .update({ upvotes: (current?.upvotes || 0) + 1, updated_at: new Date() }).eq('id', id);
      voted = true;
    }

    const { data: updated } = await supabaseAdmin.from('suggestions')
      .select('upvotes').eq('id', id).single();

    res.json({ success: true, voted, upvotes: updated?.upvotes || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/suggestions — admin: all suggestions with filters
app.get('/api/admin/suggestions', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { sort = 'votes', category = '', status = '', page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin.from('suggestions')
      .select('*, users!suggestions_user_id_fkey(id, username)', { count: 'exact' })
      .order('is_pinned', { ascending: false })
      .order(sort === 'votes' ? 'upvotes' : 'created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (category) query = query.eq('category', category);
    if (status)   query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ suggestions: (data || []).map(flattenSuggestion), total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/suggestions/:id — update status / reply / pin
app.put('/api/admin/suggestions/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status, admin_reply, is_pinned } = req.body;
    const updates = { updated_at: new Date() };
    if (status !== undefined)      updates.status      = status;
    if (is_pinned !== undefined)   updates.is_pinned   = is_pinned;
    if (admin_reply !== undefined) {
      updates.admin_reply      = admin_reply;
      updates.admin_replied_at = new Date();
    }

    const { data, error } = await supabaseAdmin.from('suggestions')
      .update(updates).eq('id', req.params.id)
      .select('*, users!suggestions_user_id_fkey(id, username)').single();
    if (error) return res.status(400).json({ error: error.message });

    // Notify user when admin replies
    if (admin_reply !== undefined && data?.user_id && admin_reply.trim()) {
      await createNotification(
        data.user_id, 'system',
        '💬 PRAQEN Team replied to your idea',
        `Your suggestion "${(data.title || '').slice(0, 60)}" got a response from the team. Check it out!`,
        '/'
      );
    }

    res.json({ success: true, suggestion: flattenSuggestion(data) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/suggestions/:id
app.delete('/api/admin/suggestions/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { error } = await supabaseAdmin.from('suggestions').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SUPPORT TICKETS
// ============================================================

// POST /api/support/tickets — create ticket + first message
app.post('/api/support/tickets', verifyToken, async (req, res) => {
  try {
    const { subject, category, message } = req.body;
    if (!subject?.trim()) return res.status(400).json({ error: 'Subject is required' });
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    const { data: ticket, error: tErr } = await supabaseAdmin
      .from('support_tickets')
      .insert({ user_id: req.userId, subject: subject.trim(), category: category || 'general', status: 'open' })
      .select().single();
    if (tErr) return res.status(400).json({ error: tErr.message });

    const { error: mErr } = await supabaseAdmin
      .from('support_messages')
      .insert({ ticket_id: ticket.id, sender_id: req.userId, is_admin: false, message: message.trim() });
    if (mErr) return res.status(400).json({ error: mErr.message });

    res.json({ success: true, ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/support/tickets — user's own tickets
app.get('/api/support/tickets', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .select('*')
      .eq('user_id', req.userId)
      .order('updated_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ tickets: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/support/tickets/:id/messages — chat thread
app.get('/api/support/tickets/:id/messages', verifyToken, async (req, res) => {
  try {
    const { data: ticket } = await supabaseAdmin.from('support_tickets').select('*').eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { data: u } = await supabaseAdmin.from('users').select('is_admin,is_moderator').eq('id', req.userId).single();
    if (ticket.user_id !== req.userId && !u?.is_admin && !u?.is_moderator) return res.status(403).json({ error: 'Not authorized' });
    const { data: messages, error } = await supabaseAdmin.from('support_messages').select('*').eq('ticket_id', req.params.id).order('created_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ticket, messages: messages || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/support/tickets/:id/messages — user sends message
app.post('/api/support/tickets/:id/messages', verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });
    const { data: ticket } = await supabaseAdmin.from('support_tickets').select('user_id, status').eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.user_id !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    if (ticket.status === 'closed') return res.status(400).json({ error: 'Ticket is closed' });
    const { data: msg, error } = await supabaseAdmin.from('support_messages')
      .insert({ ticket_id: req.params.id, sender_id: req.userId, is_admin: false, message: message.trim() })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    await supabaseAdmin.from('support_tickets').update({ updated_at: new Date() }).eq('id', req.params.id);
    res.json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/support/tickets — admin lists all tickets
app.get('/api/admin/support/tickets', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status = '', page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;
    let query = supabaseAdmin.from('support_tickets')
      .select('*, users!support_tickets_user_id_fkey(id, username, avatar_url)', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);
    if (status) query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ tickets: (data || []).map(t => ({ ...t, username: t.users?.username, avatar_url: t.users?.avatar_url })), total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/support/tickets/:id/messages — admin reads thread
app.get('/api/admin/support/tickets/:id/messages', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data: ticket } = await supabaseAdmin.from('support_tickets')
      .select('*, users!support_tickets_user_id_fkey(id, username)').eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { data: messages } = await supabaseAdmin.from('support_messages').select('*').eq('ticket_id', req.params.id).order('created_at', { ascending: true });
    res.json({ ticket: { ...ticket, username: ticket.users?.username }, messages: messages || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/support/tickets/:id/reply — admin sends reply
app.post('/api/admin/support/tickets/:id/reply', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Reply is required' });
    const { data: ticket } = await supabaseAdmin.from('support_tickets').select('user_id, subject').eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { data: msg, error } = await supabaseAdmin.from('support_messages')
      .insert({ ticket_id: req.params.id, sender_id: req.userId, is_admin: true, message: message.trim() })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    await supabaseAdmin.from('support_tickets').update({ updated_at: new Date(), status: 'active' }).eq('id', req.params.id);
    await createNotification(
      ticket.user_id, 'system',
      '💬 Support team replied to your ticket',
      `Your ticket "${(ticket.subject || '').slice(0, 60)}" has a new reply. Open Community Board → Support to read it.`,
      '/'
    );
    res.json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/support/tickets/:id/status — admin updates status
app.patch('/api/admin/support/tickets/:id/status', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status } = req.body;
    if (!['open', 'active', 'resolved', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { error } = await supabaseAdmin.from('support_tickets').update({ status, updated_at: new Date() }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// GIFT CARD CODE
// ============================================================

app.post('/api/trades/:id/send-code', verifyToken, async (req, res) => {
  try {
    const { giftCardCode } = req.body;
    if (!giftCardCode) return res.status(400).json({ error: 'Code is required' });
    const { data, error } = await supabaseAdmin.from('trades')
      .update({ gift_card_code_encrypted: encryptCode(giftCardCode), code_sent_at: new Date() })
      .eq('id', req.params.id).eq('seller_id', req.userId).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// WALLET ROUTES (inline — no external walletRoutes file needed)
// ============================================================

app.get('/api/wallet', verifyToken, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabaseAdmin.from('users')
      .select('id, username, coinbase_wallet_id, bitcoin_wallet_address, coinbase_wallet_address, wallet_created_at').eq('id', req.userId).single();
    if (userError || !user) return res.status(404).json({ error: 'User not found' });
    const [{ data: balance }, { data: balanceUsd }] = await Promise.all([
      supabaseAdmin.from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', req.userId).maybeSingle(),
      supabaseAdmin.from('user_balances').select('balance_usd').eq('user_id', req.userId).maybeSingle(),
    ]);
    let address  = user.bitcoin_wallet_address || user.coinbase_wallet_address;
    let walletId = user.coinbase_wallet_id;
    if (!address) {
      try {
        const wallet = await ensureWallet(req.userId, user.username);
        address  = wallet.address;
        walletId = wallet.walletId;
      } catch (walletErr) {
        console.error('[GET /api/wallet] Auto-create failed:', walletErr.message);
      }
    }
    const { data: recentTrades } = await supabaseAdmin.from('trades')
      .select('id, amount_btc, amount_usd, status, created_at, completed_at')
      .or(`buyer_id.eq.${req.userId},seller_id.eq.${req.userId}`).eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false }).limit(10);
    res.json({
      success: true,
      wallet: { address, walletId, created_at: user.wallet_created_at, balance_btc: parseFloat(balance?.balance_btc || 0), locked_balance_btc: parseFloat(balance?.locked_balance_btc || 0), balance_usd: parseFloat(balanceUsd?.balance_usd || 0), has_address: !!address },
      transactions: (recentTrades || []).map(t => ({ id: t.id, amount_btc: parseFloat(t.amount_btc || 0), amount_usd: parseFloat(t.amount_usd || 0), type: 'trade_completion', status: t.status, date: t.completed_at || t.created_at })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/create-address', verifyToken, async (req, res) => {
  try {
    const hdWallet = require('./services/hdWalletService');
    const addrData = hdWallet.generateUserAddress(req.userId);
    await Promise.all([
      supabaseAdmin.from('users').update({
        bitcoin_wallet_address: addrData.address,
        wallet_created_at: new Date().toISOString(),
      }).eq('id', req.userId),
      supabaseAdmin.from('user_wallets').upsert({
        user_id:          req.userId,
        btc_address:      addrData.address,
        last_onchain_btc: 0,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'user_id' }),
    ]);
    res.json({ success: true, address: addrData.address, message: 'New Bitcoin address generated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/check-payment', verifyToken, async (req, res) => {
  try {
    // Replaced Coinbase CDP payment check with HD wallet deposit monitor
    const depositMonitor = require('./services/depositMonitor');
    const result = await depositMonitor.checkAddressNow(req.userId);
    res.json({
      success:     true,
      confirmed:   result.balance_btc > 0,
      balance_btc: result.balance_btc,
      address:     result.address,
      message:     result.balance_btc > 0
        ? `Balance: ${result.balance_btc.toFixed(8)} BTC`
        : 'No confirmed deposits yet. Bitcoin confirmations take 10–60 minutes.',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/withdraw', verifyToken, async (req, res) => {
  try {
    const { address, amountBtc } = req.body;
    if (!address || !amountBtc || amountBtc <= 0) return res.status(400).json({ error: 'Invalid withdrawal request' });

    // Level 2: Email + phone required to withdraw
    const { data: withdrawUser } = await supabaseAdmin
      .from('users').select('is_email_verified, is_phone_verified')
      .eq('id', req.userId).single();
    if (!withdrawUser?.is_email_verified || !withdrawUser?.is_phone_verified) {
      return res.status(403).json({
        error: 'Please verify your email and phone to withdraw Bitcoin.',
        requireVerification: 'both'
      });
    }
    const { data: bal } = await supabaseAdmin.from('user_balances').select('balance_btc').eq('user_id', req.userId).single();
    const current = parseFloat(bal?.balance_btc || 0);
    const amount  = parseFloat(amountBtc);
    if (current < amount) return res.status(400).json({ error: `Insufficient balance. You have ${current.toFixed(8)} BTC` });
    const newBal = current - amount;
    await supabaseAdmin.from('user_balances').update({ balance_btc: newBal, updated_at: new Date() }).eq('user_id', req.userId);
    await supabaseAdmin.from('wallet_transactions').insert({ user_id: req.userId, type: 'WITHDRAWAL', amount_btc: amount, status: 'PENDING', destination_address: address, created_at: new Date() }).maybeSingle();
    res.json({ success: true, message: `Withdrawal of ${amount} BTC to ${address} is pending processing.`, new_balance: newBal, note: 'Withdrawals are processed manually within 24 hours. Contact support@praqen.com for urgent requests.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallet/internal-transfer
// FREE instant balance-to-balance transfer between two PRAQEN users.
// No on-chain broadcast, no PRAQEN platform fee, no network miner fee.
// Only trades (Buy/Sell/Gift Card) carry the 0.5% fee.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/wallet/internal-transfer', verifyToken, async (req, res) => {
  try {
    const { toUsername, toAddress, amountBtc } = req.body;
    const amount = parseFloat(amountBtc);

    if ((!toUsername && !toAddress) || !amountBtc || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Recipient (username or address) and a positive amount are required' });
    }

    // ── Find the recipient PRAQEN user ─────────────────────────────────────
    let recipientId, recipientUsername, recipientEmail;

    if (toUsername) {
      const { data: recipient } = await supabaseAdmin
        .from('users').select('id, username, email').eq('username', toUsername.trim()).single();
      if (!recipient) return res.status(404).json({ error: `@${toUsername} not found on PRAQEN` });
      recipientId       = recipient.id;
      recipientUsername = recipient.username;
      recipientEmail    = recipient.email;

    } else {
      // Look up BTC address in user_wallets — if found it is an internal PRAQEN address
      const { data: wallet } = await supabaseAdmin
        .from('user_wallets').select('user_id').eq('btc_address', toAddress.trim()).single();
      if (!wallet) {
        return res.status(404).json({
          error: 'Address not registered on PRAQEN. Use on-chain send for external addresses.',
          isExternal: true,
        });
      }
      recipientId = wallet.user_id;
      const { data: ru } = await supabaseAdmin.from('users').select('username, email').eq('id', recipientId).single();
      recipientUsername = ru?.username || 'PRAQEN User';
      recipientEmail    = ru?.email;
    }

    if (String(recipientId) === String(req.userId)) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }

    // ── Check sender balance (wallets = source of truth) ──────────────────
    const { data: senderWallet } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', req.userId).maybeSingle();

    const available = parseFloat(senderWallet?.balance_btc || 0);
    if (available < amount) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ${available.toFixed(8)} BTC, Requested: ${amount.toFixed(8)} BTC`,
      });
    }

    // ── Deduct from sender ─────────────────────────────────────────────────
    const newSenderBalance = parseFloat((available - amount).toFixed(8));
    // wallets first (source of truth), then keep secondary tables in sync
    await supabaseAdmin.from('wallets')
      .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);
    await supabaseAdmin.from('user_balances')
      .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);
    await supabaseAdmin.from('user_wallets')
      .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);

    // ── Credit recipient ───────────────────────────────────────────────────
    const { data: recipWallet } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', recipientId).maybeSingle();
    const newRecipientBalance = parseFloat((parseFloat(recipWallet?.balance_btc || 0) + amount).toFixed(8));
    // wallets first (source of truth)
    await supabaseAdmin.from('wallets')
      .update({ balance_btc: newRecipientBalance, updated_at: new Date().toISOString() })
      .eq('user_id', recipientId);
    // keep secondary tables in sync
    await supabaseAdmin.from('user_balances')
      .upsert({ user_id: recipientId, balance_btc: newRecipientBalance, updated_at: new Date().toISOString() });
    await supabaseAdmin.from('user_wallets')
      .update({ balance_btc: newRecipientBalance, updated_at: new Date().toISOString() })
      .eq('user_id', recipientId);

    // ── Generate transfer reference ────────────────────────────────────────
    const crypto = require('crypto');
    const txRef  = 'INT_' + crypto
      .createHash('sha256')
      .update(`${req.userId}:${recipientId}:${amount}:${Date.now()}`)
      .digest('hex').slice(0, 20).toUpperCase();

    // ── Log for sender (TRANSFER_OUT) ──────────────────────────────────────
    await supabaseAdmin.from('wallet_transactions').insert({
      user_id:    req.userId,
      type:       'TRANSFER_OUT',
      amount_btc: amount,
      status:     'CONFIRMED',
      tx_hash:    txRef,
      notes:      `Internal transfer → @${recipientUsername} · No fee`,
      created_at: new Date().toISOString(),
    });

    // ── Log for recipient (TRANSFER_IN) ───────────────────────────────────
    await supabaseAdmin.from('wallet_transactions').insert({
      user_id:    recipientId,
      type:       'TRANSFER_IN',
      amount_btc: amount,
      status:     'CONFIRMED',
      tx_hash:    txRef,
      notes:      `Internal transfer received · No fee`,
      created_at: new Date().toISOString(),
    });

    // ── Notify recipient (in-app) ──────────────────────────────────────────
    const { data: senderUser } = await supabaseAdmin.from('users').select('username, email').eq('id', req.userId).single();
    await supabaseAdmin.from('notifications').insert({
      user_id:    recipientId,
      type:       'wallet',
      title:      '₿ Bitcoin Received!',
      message:    `₿${amount.toFixed(8)} sent to your wallet by @${senderUser?.username || 'a PRAQEN user'} — instant & free`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    // ── Email notifications (fire-and-forget) ──────────────────────────────
    const senderName = senderUser?.username || 'A PRAQEN user';
    const txDate     = new Date().toUTCString();

    const recipientHtml = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;text-align:center">
    <h1 style="color:#F4A422;font-size:28px;margin:0;font-weight:900">₿ Bitcoin Received!</h1>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px">Instant PRAQEN internal transfer</p>
  </div>
  <div style="padding:28px 32px">
    <div style="background:#F0FAF5;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
      <p style="color:#64748B;font-size:12px;margin:0 0 6px">You received</p>
      <p style="color:#1B4332;font-size:32px;font-weight:900;margin:0">₿ ${amount.toFixed(8)}</p>
      <p style="color:#10B981;font-size:12px;font-weight:700;margin:6px 0 0">⚡ Instant &amp; FREE — no fees</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="color:#64748B;padding:6px 0">From</td><td style="color:#1B4332;font-weight:700;text-align:right">@${senderName}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Network Fee</td><td style="color:#10B981;font-weight:700;text-align:right">₿ 0.00000000 (Free)</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Reference</td><td style="color:#1B4332;font-weight:700;text-align:right;font-family:monospace;font-size:11px">${txRef}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Date</td><td style="color:#475569;text-align:right">${txDate}</td></tr>
    </table>
    <div style="text-align:center;margin-top:24px">
      <a href="https://praqen.com/wallet" style="display:inline-block;background:#2D6A4F;color:#fff;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:14px">View Wallet</a>
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 32px;text-align:center">
    <p style="color:#94A3B8;font-size:11px;margin:0">PRAQEN · The world's most trusted P2P Bitcoin platform · Escrow-protected · 0.5% fee on trades</p>
  </div>
</div>`;

    const senderHtml = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;text-align:center">
    <h1 style="color:#fff;font-size:24px;margin:0;font-weight:900">Transfer Sent ✅</h1>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px">Your PRAQEN internal transfer was delivered</p>
  </div>
  <div style="padding:28px 32px">
    <div style="background:#F8FAFC;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
      <p style="color:#64748B;font-size:12px;margin:0 0 6px">You sent</p>
      <p style="color:#EF4444;font-size:32px;font-weight:900;margin:0">−₿ ${amount.toFixed(8)}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="color:#64748B;padding:6px 0">To</td><td style="color:#1B4332;font-weight:700;text-align:right">@${recipientUsername}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Fee</td><td style="color:#10B981;font-weight:700;text-align:right">₿ 0.00000000 (Free)</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">New Balance</td><td style="color:#1B4332;font-weight:700;text-align:right">₿ ${newSenderBalance.toFixed(8)}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Reference</td><td style="color:#1B4332;font-weight:700;text-align:right;font-family:monospace;font-size:11px">${txRef}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Date</td><td style="color:#475569;text-align:right">${txDate}</td></tr>
    </table>
    <div style="text-align:center;margin-top:24px">
      <a href="https://praqen.com/wallet" style="display:inline-block;background:#2D6A4F;color:#fff;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:14px">View Wallet</a>
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 32px;text-align:center">
    <p style="color:#94A3B8;font-size:11px;margin:0">PRAQEN · The world's most trusted P2P Bitcoin platform · Escrow-protected · 0.5% fee on trades</p>
  </div>
</div>`;

    const emailFrom = `"PRAQEN" <${process.env.EMAIL_USER || 'kendevdash@gmail.com'}>`;
    Promise.all([
      recipientEmail && transporter.sendMail({ from: emailFrom, to: recipientEmail, subject: `₿ You received ${amount.toFixed(8)} BTC from @${senderName} on PRAQEN`, html: recipientHtml }),
      senderUser?.email && transporter.sendMail({ from: emailFrom, to: senderUser.email, subject: `✅ Transfer sent: ₿${amount.toFixed(8)} → @${recipientUsername}`, html: senderHtml }),
    ]).catch(err => console.warn('[InternalTransfer] Email send error (non-fatal):', err.message));

    console.log(`[InternalTransfer] @${senderUser?.username} → @${recipientUsername} | ₿${amount} | FREE | ref:${txRef}`);

    res.json({
      success:     true,
      txRef,
      amount_btc:  amount,
      fee:         0,
      fee_label:   'Free — internal PRAQEN transfer',
      to:          recipientUsername,
      new_balance: newSenderBalance,
      message:     `₿${amount.toFixed(8)} sent to @${recipientUsername} — instantly & free!`,
    });

  } catch (error) {
    console.error('[POST /api/wallet/internal-transfer]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/send', verifyToken, async (req, res) => {
  try {
    const { address, amountBtc } = req.body;

    if (!address || !amountBtc || parseFloat(amountBtc) <= 0) {
      return res.status(400).json({ error: 'Address and a positive amount are required' });
    }

    // SECURITY: Mainnet-only validation. tb1/m/n/2 are testnet — blocked permanently.
    // Sending real BTC to a testnet address causes permanent, unrecoverable fund loss.
    const btcAddressRe = /^(bc1[a-z0-9]{25,87}|[13][a-zA-HJ-NP-Z1-9]{25,34})$/;
    if (!btcAddressRe.test(address)) {
      return res.status(400).json({ error: 'Invalid Bitcoin address. Only mainnet addresses accepted (bc1..., 1..., 3...).' });
    }

    const amount = parseFloat(amountBtc);

    // Check user balance
    const { data: bal, error: balErr } = await supabaseAdmin
      .from('user_balances')
      .select('balance_btc')
      .eq('user_id', req.userId)
      .single();
    if (balErr) throw balErr;

    const available = parseFloat(bal?.balance_btc || 0);
    if (available < amount) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ${available.toFixed(8)} BTC, Requested: ${amount.toFixed(8)} BTC`
      });
    }

    // Broadcast on-chain via HD wallet
    const result = await hdWalletService.sendBitcoin(`user_${req.userId}`, address, amount);

    // Deduct from user_balances
    const newBalance = parseFloat((available - amount).toFixed(8));
    await supabaseAdmin
      .from('user_balances')
      .update({ balance_btc: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);

    // Record transaction
    await supabaseAdmin
      .from('wallet_transactions')
      .insert({
        user_id:             req.userId,
        type:                'WITHDRAWAL',
        amount_btc:          amount,
        status:              'CONFIRMED',
        tx_hash:             result.txid,
        destination_address: address,
        created_at:          new Date().toISOString(),
      });

    console.log(`[wallet/send] User ${req.userId.slice(0,8)} sent ${amount} BTC → ${address} | txid: ${result.txid}`);

    res.json({
      success:     true,
      txid:        result.txid,
      amount_btc:  amount,
      to:          address,
      fee_sats:    result.fee_sats,
      new_balance: newBalance,
      explorer:    result.explorer_url,
      message:     `${amount} BTC sent successfully`,
    });
  } catch (error) {
    console.error('[POST /api/wallet/send]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log(`[Webhook] Event: ${event.event?.type}`);
    if (event.event?.type === 'charge:confirmed') {
      const charge = event.event.data;
      const userId = charge.metadata?.user_id;
      const btcAmt = parseFloat(charge.payments?.[0]?.value?.crypto?.amount || 0);
      if (userId && btcAmt > 0) {
        const { data: bal } = await supabaseAdmin.from('user_balances').select('balance_btc').eq('user_id', userId).single();
        const newBal = parseFloat(bal?.balance_btc || 0) + btcAmt;
        await supabaseAdmin.from('user_balances').upsert({ user_id: userId, balance_btc: newBal, updated_at: new Date() });
        await createNotification(userId, 'wallet', '💰 Bitcoin Received', `${btcAmt} BTC has been credited to your PRAQEN wallet.`, '/wallet');
      }
    }
    res.json({ received: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── ADMIN: upgrade ALL fake addresses to real HD addresses ───────────────
// Call once: POST /api/admin/upgrade-wallets
app.post('/api/admin/upgrade-wallets', verifyToken, async (req, res) => {
  try {
    const { data: me } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.userId).single();
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin only' });

    const { data: users } = await supabaseAdmin
      .from('users').select('id, username, bitcoin_wallet_address');

    let upgraded = 0;
    let skipped  = 0;
    for (const u of (users || [])) {
      if (!isRealBtcAddress(u.bitcoin_wallet_address)) {
        await upgradeToHDAddress(u.id, u.username);
        upgraded++;
      } else {
        skipped++;
      }
    }
    res.json({ success: true, upgraded, skipped, total: users?.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// USER PREFERENCES (currency, language, timezone)
// ============================================================
app.put('/api/users/preferences', verifyToken, async (req, res) => {
  try {
    const { currency, language, timezone } = req.body;
    const updateData = { updated_at: new Date().toISOString() };
    if (currency) updateData.preferred_currency = currency;
    if (language) updateData.preferred_language = language;
    if (timezone) updateData.timezone = timezone;
    const { data, error } = await supabaseAdmin.from('users').update(updateData).eq('id', req.userId).select().single();
    if (error) { console.warn('[preferences] Column may not exist:', error.message); return res.json({ success: true }); }
    res.json({ success: true, user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// PHONE VERIFICATION — verify OTP and mark phone verified
// ============================================================
app.post('/api/auth/verify-phone', verifyToken, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });
    const stored = otpStore.get(phone);
    if (!stored || stored.otp !== otp || Date.now() > stored.expires)
      return res.status(400).json({ error: 'Invalid or expired OTP. Request a new one.' });
    otpStore.delete(phone);
    const { error } = await supabaseAdmin.from('users').update({
      phone, phone_verified: true, updated_at: new Date().toISOString()
    }).eq('id', req.userId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, message: 'Phone number verified!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// KYC SUBMIT — mark kyc as pending review
// ============================================================
app.post('/api/kyc/submit', verifyToken, async (req, res) => {
  try {
    const { idDocName, selfieDocName } = req.body;
    if (!idDocName || !selfieDocName) return res.status(400).json({ error: 'Both documents are required' });
    const { error } = await supabaseAdmin.from('users').update({
      kyc_status: 'pending', kyc_submitted_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', req.userId);
    if (error) { console.warn('[kyc] Column may not exist:', error.message); }
    res.json({ success: true, message: 'KYC documents submitted for review. We will respond within 24 hours.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// SUPPORT — lookup trade by reference number
// ============================================================
app.get('/api/support/trade/:ref', verifyToken, async (req, res) => {
  try {
    const ref = (req.params.ref || '').toUpperCase();
    const { data: trade, error } = await supabaseAdmin
      .from('trades')
      .select(`
        id, trade_ref, status, amount_btc, amount_usd, amount_local,
        local_currency, currency_symbol, payment_method, created_at,
        completed_at, cancelled_at,
        buyer:buyer_id(id, username),
        seller:seller_id(id, username)
      `)
      .eq('trade_ref', ref)
      .single();
    if (error || !trade) return res.status(404).json({ success: false, error: 'Trade not found' });
    res.json({ success: true, trade });
  } catch (err) {
    console.error('Support trade lookup error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================
// REFERRAL LINK RESOLUTION  GET /api/ref/:username
// ============================================================

app.get('/api/ref/:username', async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.json({ success: false, referral_code: null });

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('referral_code, username')
      .ilike('username', username)
      .single();

    if (user?.referral_code) {
      return res.json({ success: true, referral_code: user.referral_code });
    }
    res.json({ success: false, referral_code: null });
  } catch (err) {
    res.json({ success: false, referral_code: null });
  }
});

// ============================================================
// ── One-time startup backfill: set country from phone prefix for users missing it
async function backfillCountriesFromPhone() {
  try {
    // Fetch ALL users with no country set (in batches of 500)
    let from = 0;
    const batchSize = 500;
    let fixed = 0;

    while (true) {
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, phone')
        .or('country.is.null,country.eq.')
        .range(from, from + batchSize - 1);

      if (error) { console.error('[Backfill] select error:', error.message); break; }
      if (!users?.length) break;

      for (const u of users) {
        const cc = phoneToCountryCode(u.phone);
        if (!cc) continue;
        const { error: upErr } = await supabaseAdmin
          .from('users')
          .update({ country: cc })
          .eq('id', u.id)
          .or('country.is.null,country.eq.'); // never overwrite if already set
        if (!upErr) fixed++;
      }

      if (users.length < batchSize) break;
      from += batchSize;
    }

    if (fixed > 0) console.log(`[Backfill] Populated country for ${fixed} user(s) from phone prefix`);
    else console.log('[Backfill] No users needed country backfill from phone');
  } catch (err) {
    console.error('[Backfill] backfillCountriesFromPhone error:', err.message);
  }
}

// START SERVER
// ============================================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ PRAQEN Backend running on http://localhost:${PORT}`);
  console.log('📋 Routes: /api/auth, /api/users, /api/listings, /api/trades, /api/my-trades, /api/wallet, /api/hd-wallet, /api/notifications');

  // Pre-warm the listings cache immediately so the very first request hits a warm cache
  _warmListingsCache();
  // Keep re-warming every 4 min so cache never expires between user visits
  setInterval(() => _warmListingsCache(), 4 * 60 * 1000);

  // Pause/reactivate offers based on live wallet balance — runs at startup then every 10 min
  syncAllOfferStatuses().catch(err => console.error('[startup] syncAllOfferStatuses:', err.message));
  setInterval(() => syncAllOfferStatuses().catch(err => console.error('[interval] syncAllOfferStatuses:', err.message)), 10 * 60 * 1000);

  // Backfill missing country codes for existing users using phone/KYC data
  backfillCountriesFromPhone().catch(err => console.error('[startup] backfillCountries:', err.message));

  // ── Real-time deposit detection via mempool.space WebSocket ─────────────
  // Detects deposits within 1-3 seconds of entering mempool, credits on confirmation
  realtimeDepositService.start().catch(err =>
    console.error('[RealtimeDeposit] Startup error:', err.message)
  );

  // 5-minute scanner kept as safety net (catches anything WebSocket misses on reconnect)
  depositMonitor.start();
  console.log('🔍 Deposit monitor: MAINNET — polls every 5 min | SMS + Email alerts enabled');

  // ── Deposit sweeper — moves confirmed deposits to hot wallet ─────────────
  // Runs 2 min after startup then every 30 min. Silent — never affects user balances.
  sweepService.start();
  console.log(`🧹 Sweep service: MAINNET — hot wallet ${hdWalletService.getHotWalletAddress()}`);

  // ── Daily balance integrity check ─────────────────────────────────────────
  balanceIntegrity.start();

  // ── Auto-cancel expired trades every 60 seconds ───────────────────────────
  const _runExpiredTrades = async () => {
    try {
      const count = await tradeEscrowService.processExpiredTrades();
      if (count > 0) console.log(`[ExpiredTrades] Auto-cancelled ${count} expired trade(s)`);
    } catch (err) {
      console.error('[ExpiredTrades] Cron error:', err.message);
    }
  };
  // Run once immediately to catch trades that expired while server was offline
  _runExpiredTrades();
  setInterval(_runExpiredTrades, 60 * 1000);
  console.log('⏱  Expired trade cron: checks every 60 seconds — BTC auto-refunded to seller on expiry');
});

module.exports = app;