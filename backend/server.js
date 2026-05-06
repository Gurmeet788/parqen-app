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
const CoinbaseWalletService = require('./services/coinbaseWallet');
const quoteService          = require('./services/quoteService');
const { E, S }              = require('./utils/apiErrors');

// In-memory typing state: 'tradeId:userId' -> expiresAt timestamp
const typingState = {};
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(typingState)) { if (typingState[key] < now) delete typingState[key]; }
}, 10000);

// In-memory market cache — serves offers/listings without hitting DB on every page load
const _marketCache = new Map(); // key -> { data, ts }
const MARKET_CACHE_TTL = 25000; // 25 seconds
function getCached(key) {
  const c = _marketCache.get(key);
  return c && Date.now() - c.ts < MARKET_CACHE_TTL ? c.data : null;
}
function setCached(key, data) { _marketCache.set(key, { data, ts: Date.now() }); }
function bustCache() { _marketCache.clear(); } // Call after any listing status change

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
const coinbaseWallet = new CoinbaseWalletService();

// ── 5. Express ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── 6. HD Wallet + Deposit Monitor ────────────────────────────────────────
const hdWalletService = require('./services/hdWalletService');
const depositMonitor  = require('./services/depositMonitor');
const hdWalletRoutes  = require('./routes/hdWalletRoutes');
const tradeEscrowService    = require('./services/tradeEscrowService');
const { checkAndAwardBadges } = require('./services/badgeService');
const { syncAllOfferStatuses } = require('./services/offerStatusService');
app.use('/api/hd-wallet', hdWalletRoutes);

// NOTE: walletRoutes removed — wallet routes are defined inline below
// to avoid Supabase-not-initialized errors in external route files.

const JWT_SECRET = process.env.JWT_SECRET || 'praqen-secret-change-in-production';
const otpStore          = new Map();
const verificationCodes = new Map();

// Resolve client IP → ISO country code (fire-and-forget, never blocks login)
async function detectAndSaveCountry(userId, req) {
  try {
    if (!userId) return;
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || '';
    // Skip loopback / private addresses
    if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) return;
    const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(4000) });
    const geo    = await geoRes.json();
    if (geo?.country_code && geo.country_code.length === 2) {
      await supabaseAdmin.from('users')
        .update({ country: geo.country_code.toUpperCase(), last_ip: ip })
        .eq('id', userId)
        .is('country', null);  // only set if not already chosen by user
      console.log(`[GeoIP] user ${String(userId).slice(0,8)} → ${geo.country_code} (${ip})`);
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

    const from = `"PRAQEN" <${process.env.EMAIL_USER || 'kendevdash@gmail.com'}>`;
    const mailOpts = { from, to: user.email, subject, html: htmlContent };

    // Try SMTP port 587 first
    try {
      await transporter.sendMail(mailOpts);
      console.log(`📧 Email sent to ${user.email} (user ${userId.slice(0,8)}) via SMTP 587`);
      return;
    } catch (e1) {
      console.warn(`[Email] SMTP 587 failed for ${user.email}:`, e1.message, '— trying 465');
    }

    // Try SMTP port 465 SSL
    try {
      const sslTransporter = require('nodemailer').createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      await sslTransporter.sendMail(mailOpts);
      console.log(`📧 Email sent to ${user.email} via SMTP 465`);
      return;
    } catch (e2) {
      console.warn(`[Email] SMTP 465 failed for ${user.email}:`, e2.message, '— trying Resend');
    }

    // Fallback: Resend
    if (resendClient) {
      const { error: resendErr } = await resendClient.emails.send({
        from: RESEND_FROM_ADDR,
        to: user.email, subject, html: htmlContent,
      });
      if (!resendErr) { console.log(`📧 Email sent to ${user.email} via Resend`); return; }
      console.error(`[Email] Resend also failed for ${user.email}:`, resendErr.message);
    } else {
      console.error(`[Email] All delivery methods exhausted for user ${userId.slice(0,8)}`);
    }
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

async function sendVerificationEmail(email, code) {
  console.log(`📧 Sending verification to ${email}`);
  console.log(`RESEND_API_KEY exists: ${!!process.env.RESEND_API_KEY}`);

  const html = buildVerificationEmailHtml(code);

  // ── PRIMARY: Resend API ──────────────────────────────────────────────────
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
        subject: 'Your PRAQEN Verification Code',
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

  // ── FALLBACK: Gmail SMTP ─────────────────────────────────────────────────
  console.log(`📧 Attempting Gmail fallback to ${email}`);
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.verify();
    const info = await transporter.sendMail({
      from: `"PRAQEN" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your PRAQEN Verification Code',
      html,
    });
    console.log(`✅ Verification email sent via Gmail to ${email}`, info.messageId);
    return true;
  } catch (gmailErr) {
    console.error(`❌ Gmail error:`, gmailErr.message);
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

// ── Is this a real Bitcoin address or an old mock hex string? ─────────────
function isRealBtcAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  return /^(bc1|tb1|[13mn2])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(addr);
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
    const { data: all, error } = await supabaseAdmin.from('trades').select('status').or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);
    // If the query failed or returned nothing, skip — never overwrite stats with 0
    if (error || !all || all.length === 0) return;
    const total = all.filter(t => t.status === 'COMPLETED').length;
    const rate  = Math.round((total / all.length) * 100);
    await supabaseAdmin.from('users').update({ total_trades: total, completion_rate: rate }).eq('id', userId);
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
    let commissionRate = 0.1;
    const referralCount = referrer?.total_referrals || 0;
    if (referralCount >= 100) commissionRate = 0.3;
    else if (referralCount >= 50) commissionRate = 0.25;
    else if (referralCount >= 25) commissionRate = 0.2;
    else if (referralCount >= 10) commissionRate = 0.15;
    const commissionBtc = parseFloat(tradeAmountBtc || 0) * (commissionRate / 100);
    const { error } = await supabaseAdmin.from('affiliate_earnings').insert({
      referrer_id: buyer.referred_by, referred_user_id: buyerId, trade_id: tradeId,
      commission_btc: commissionBtc, trade_amount_btc: tradeAmountBtc, trade_amount_usd: tradeAmountUsd,
      commission_rate: commissionRate, status: 'COMPLETED', created_at: new Date()
    });
    if (error) throw error;
    await supabaseAdmin.rpc('update_referrer_earnings', { user_id: buyer.referred_by });
    console.log(`✅ Affiliate commission: ${commissionBtc} BTC for referrer ${buyer.referred_by}`);
  } catch (error) {
    console.error('Create affiliate earning error:', error);
  }
}

async function ensureWallet(userId, username) {
  const { data: user, error } = await supabaseAdmin.from('users')
    .select('coinbase_wallet_id, bitcoin_wallet_address, coinbase_wallet_address, username').eq('id', userId).single();
  if (error) throw new Error('User not found');
  const existingAddress = user.bitcoin_wallet_address || user.coinbase_wallet_address;
  if (existingAddress && user.coinbase_wallet_id) return { walletId: user.coinbase_wallet_id, address: existingAddress, isNew: false };
  const wallet = await coinbaseWallet.createWallet(userId, username || user.username || `user-${userId.slice(0, 8)}`);
  await supabaseAdmin.from('users').update({
    coinbase_wallet_id: wallet.walletId, bitcoin_wallet_address: wallet.address,
    coinbase_wallet_address: wallet.address, wallet_created_at: new Date().toISOString(),
  }).eq('id', userId);
  return { walletId: wallet.walletId, address: wallet.address, isNew: true };
}

async function lockFundsInEscrow(tradeId, sellerId, buyerId, amountBtc) {
  const { data: buyerBalance, error: buyerBalanceError } = await supabaseAdmin.from('user_balances').select('balance_btc').eq('user_id', buyerId).single();
  if (buyerBalanceError || !buyerBalance) throw new Error('Buyer balance not found');
  const currentBuyerBalance = parseFloat(buyerBalance.balance_btc || 0);
  const amount = parseFloat(amountBtc);
  if (currentBuyerBalance < amount) throw new Error(`Insufficient balance. Buyer has ${currentBuyerBalance} BTC, needs ${amount} BTC`);
  await supabaseAdmin.from('user_balances').update({ balance_btc: currentBuyerBalance - amount, updated_at: new Date() }).eq('user_id', buyerId);
  const SELLER_COMMISSION_RATE = 0.01;
  const sellerCommission = amount * SELLER_COMMISSION_RATE;
  const { data: sellerBalance } = await supabaseAdmin.from('user_balances').select('balance_btc').eq('user_id', sellerId).single();
  const currentSellerBalance = parseFloat(sellerBalance?.balance_btc || 0);
  await supabaseAdmin.from('user_balances').update({ balance_btc: currentSellerBalance - sellerCommission, updated_at: new Date() }).eq('user_id', sellerId);
  const { error: escrowError } = await supabaseAdmin.from('escrow_locks').insert([{
    trade_id: tradeId, seller_id: sellerId, buyer_id: buyerId, amount_btc: amount, status: 'LOCKED', locked_at: new Date(),
  }]);
  if (escrowError) {
    await supabaseAdmin.from('user_balances').update({ balance_btc: currentBuyerBalance, updated_at: new Date() }).eq('user_id', buyerId);
    await supabaseAdmin.from('user_balances').update({ balance_btc: currentSellerBalance, updated_at: new Date() }).eq('user_id', sellerId);
    throw new Error(escrowError.message);
  }
  const { error: tradeError } = await supabaseAdmin.from('trades').update({ status: 'FUNDS_LOCKED', escrow_locked_at: new Date(), escrow_amount: amount }).eq('id', tradeId);
  if (tradeError) throw new Error(tradeError.message);
  return { success: true, amountLocked: amount, commissionCharged: sellerCommission };
}

async function releaseFundsToBuyer(tradeId, buyerId, amountBtc, tradeAmountUsd) {
  const { data: escrow, error: escrowError } = await supabaseAdmin.from('escrow_locks').select('*').eq('trade_id', tradeId).single();
  if (escrowError || !escrow) throw new Error('Escrow record not found');
  if (escrow.status !== 'LOCKED') throw new Error(`Escrow status is ${escrow.status}, cannot release`);
  const { data: buyerBalance } = await supabaseAdmin.from('user_balances').select('balance_btc').eq('user_id', buyerId).single();
  const newBuyerBalance = parseFloat(buyerBalance?.balance_btc || 0) + parseFloat(amountBtc);
  await supabaseAdmin.from('user_balances').upsert({ user_id: buyerId, balance_btc: newBuyerBalance, updated_at: new Date() });
  await supabaseAdmin.from('escrow_locks').update({ status: 'RELEASED', released_at: new Date() }).eq('trade_id', tradeId);
  await supabaseAdmin.from('trades').update({ status: 'COMPLETED', completed_at: new Date() }).eq('id', tradeId);
  await createAffiliateEarning(tradeId, buyerId, amountBtc, tradeAmountUsd);
  return { success: true };
}

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

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username, fullName, referralCode } = req.body;

    // ── Validate inputs ────────────────────────────────────────────────────
    if (!email || !password || !username) {
      return res.status(400).json({ error: E.MISSING_FIELDS });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: E.PASSWORD_TOO_SHORT });
    }

    // ── Check uniqueness (fast DB lookups) ─────────────────────────────────
    const { data: existingUser } = await supabaseAdmin
      .from('users').select('email').eq('email', email.toLowerCase().trim()).single();
    if (existingUser) return res.status(400).json({ error: E.EMAIL_TAKEN });

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
      email:                  email.toLowerCase().trim(),
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
      return res.status(400).json({ error: error.message });
    }
    if (!data || data.length === 0) return res.status(400).json({ error: E.REGISTER_FAILED });

    const newUser = data[0];

    // ── Seed balance row ───────────────────────────────────────────────────
    await supabaseAdmin.from('user_balances').insert([{ user_id: newUser.id, balance_btc: 0, balance_usd: 0 }]);

    // ── Generate 6-digit verification code & save to DB (fast) ────────────
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(email, { code, expiresAt: Date.now() + 10 * 60 * 1000, userId: newUser.id });
    await supabaseAdmin.from('users').update({
      verification_code:         code,
      verification_code_expires: new Date(Date.now() + 10 * 60 * 1000),
    }).eq('id', newUser.id);

    // ── Sign JWT ───────────────────────────────────────────────────────────
    const token = jwt.sign({ userId: newUser.id, email }, JWT_SECRET, { expiresIn: '7d' });

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
    // 1. Send verification email (SMTP can be slow — never block signup on it)
    sendVerificationEmail(email, code)
      .catch(e => console.error('[Register] Verification email failed:', e.message));

    // 2. Send welcome email to new user
    sendWelcomeEmail(email, username)
      .catch(e => console.error('[Register] Welcome email failed:', e.message));

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

    // 4. Coinbase wallet (non-critical, slow external API — fully background)
    coinbaseWallet.createWallet(newUser.id, username)
      .then(async (wallet) => {
        await supabaseAdmin.from('users').update({
          coinbase_wallet_id:      wallet.walletId,
          coinbase_wallet_address: wallet.address,
          wallet_created_at:       new Date(),
        }).eq('id', newUser.id);
        console.log(`[Register] Coinbase wallet created for ${newUser.username}: ${wallet.address}`);
      })
      .catch(e => console.error('[Register] Coinbase wallet failed (non-critical):', e.message));

  } catch (error) {
    console.error('[Register] Unexpected error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/register-with-referral', async (req, res) => {
  // same as /register — just alias it
  req.url = '/api/auth/register';
  app._router.handle(req, res);
});

app.post('/api/auth/login', async (req, res) => {
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
      await supabaseAdmin.from('users').update({ last_login: new Date() }).eq('id', data.id);
      detectAndSaveCountry(data.id, req).catch(() => {});
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
    await supabaseAdmin.from('users').update({ last_login: new Date() }).eq('id', data.id);
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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

// ── OTP (Twilio Verify) ───────────────────────────────────────────────────────

const toE164 = raw => {
  if (!raw) return null;
  const s = String(raw).trim();
  return s.startsWith('+') ? s : `+${s}`;
};

// Diagnostic endpoint — remove after debugging
app.get('/api/auth/twilio-check', async (req, res) => {
  try {
    const sid = process.env.TWILIO_SID;
    const token = process.env.TWILIO_TOKEN;
    const verifySid = process.env.TWILIO_VERIFY_SID || 'VAddba23c45841679ed249d49be8a90bbe';
    res.json({
      twilio_sid_set: !!sid,
      twilio_token_set: !!token,
      verify_sid: verifySid,
      sid_prefix: sid ? sid.slice(0, 6) : 'MISSING',
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
    try {
      const sendOpts = { to: [phone], message };
      const senderId = process.env.AFRICASTALKING_SENDER_ID;
      if (senderId) sendOpts.from = senderId;
      const result = await atSms.send(sendOpts);
      const recip  = result?.SMSMessageData?.Recipients?.[0];
      // statusCode 101 = Success, status 'Success' also valid
      if (recip?.statusCode === 101 || (recip?.status || '').toLowerCase() === 'success') {
        console.log(`[SMS] ✅ Africa's Talking → ${phone} (${recip.status})`);
        return;
      }
      const atErr = recip?.status || JSON.stringify(result?.SMSMessageData);
      console.warn(`[SMS] AT returned non-success: ${atErr}`);
      errs.push(`AT: ${atErr}`);
    } catch (atErr) {
      console.warn(`[SMS] Africa's Talking failed: ${atErr.message}`);
      errs.push(`AT: ${atErr.message}`);
    }
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

app.post('/api/auth/send-otp', async (req, res) => {
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
    res.status(500).json({ error: 'Failed to send code. Please try again.', detail: error.message });
  }
});

app.post('/api/auth/send-phone-otp', async (req, res) => {
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
    await storeOtp(contact, otp);

    await sendSmsOtp(contact, `Your PRAQEN code is: ${otp}. Valid 10 min. Do not share.`);

    recordPhoneRequest(contact);
    console.log(`[OTP send-phone] to=${contact}`);
    res.json({ success: true, message: 'Code sent!' });
  } catch (error) {
    console.error('[OTP send-phone error]', error.message);
    res.status(500).json({ error: 'Failed to send code. Please try again.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
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

    console.log(`[OTP verify] success for ${normalizedContact}`);
    return res.json({ success: true, message: 'Verified!' });
  } catch (error) {
    console.error('[OTP verify unexpected error]', error.message);
    res.status(500).json({ error: `Verification failed: ${error.message}` });
  }
});

// ── Email Verification ────────────────────────────────────────────────────────

app.post('/api/auth/send-verification', async (req, res) => {
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

// POST /api/users/send-phone-otp — send SMS OTP to a phone number (authenticated)
app.post('/api/users/send-phone-otp', verifyToken, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const e164 = phone.startsWith('+') ? phone : `+${phone.replace(/^0/, '')}`;

    const limit = checkPhoneRateLimit(e164);
    if (limit.blocked) return res.status(429).json({ error: limit.error });

    // One phone = one account (allow if already belongs to THIS user)
    const { data: existing } = await supabaseAdmin.from('users').select('id').eq('phone', e164).neq('id', req.userId).maybeSingle();
    if (existing) return res.status(400).json({ error: 'This phone number is already registered to another account.' });

    const otp       = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Store in BOTH memory (fast) and database (survives restarts)
    otpStore.set(e164, { otp, expires: expiresAt.getTime() });
    await supabaseAdmin.from('otp_codes').insert({
      phone: e164, code: otp, expires_at: expiresAt.toISOString(), used: false,
    }).throwOnError().catch(dbErr => console.warn('[send-phone-otp] DB store warn:', dbErr.message));

    console.log(`[send-phone-otp] OTP for ${e164}: ${otp}`);

    let smsSent = false;
    let smsError = null;
    try {
      await sendSmsOtp(e164, `[PRAQEN] Your verification code is: ${otp}. Valid for 10 minutes. Never share this code.`);
      smsSent = true;
    } catch (smsErr) {
      smsError = smsErr;
      console.error('[send-phone-otp] SMS failed:', smsErr.message, 'code:', smsErr.code);
    }

    recordPhoneRequest(e164);
    const isDev = process.env.NODE_ENV !== 'production';

    if (smsSent) {
      return res.json({ success: true, message: 'OTP sent to your phone', devCode: isDev ? otp : undefined });
    }

    // SMS failed — give actionable error
    let userMsg = 'Could not send SMS to this number. Please check the number is correct and in international format (e.g. +233XXXXXXXXX), then try again.';
    if (smsError?.code === 21211 || smsError?.code === 21212) userMsg = 'Invalid phone number. Use international format — e.g. +233XXXXXXXXX for Ghana, +234XXXXXXXXXX for Nigeria.';
    else if (smsError?.code === 21608) userMsg = 'SMS to this region is unavailable right now. Please email support@praqen.com with your number and we will verify you manually.';
    else if (smsError?.code === 21614) userMsg = 'This number cannot receive SMS. Try a different number.';
    else if (smsError?.code === 20003) userMsg = 'SMS configuration error. Please contact support@praqen.com.';
    else if (smsError?.code === 21610) userMsg = 'This number has opted out of SMS messages.';

    return res.status(500).json({
      error: userMsg,
      code: smsError?.code || null,
      devCode: isDev ? otp : undefined,
      _hint: isDev ? 'Dev mode: use devCode to bypass SMS and verify directly' : undefined,
    });
  } catch (err) {
    console.error('[send-phone-otp] unexpected error:', err.message);
    res.status(500).json({ error: 'Could not send OTP. Please try again.' });
  }
});

// POST /api/users/verify-phone-otp — verify phone OTP and mark phone verified
app.post('/api/users/verify-phone-otp', verifyToken, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });

    const e164 = phone.startsWith('+') ? phone : `+${phone.replace(/^0/, '')}`;
    const code = String(otp).trim();

    if (code.length !== 6) return res.status(400).json({ error: 'Enter the full 6-digit code' });

    const limit = checkPhoneRateLimit(e164);
    if (limit.blocked) return res.status(429).json({ error: limit.error });

    // ── Check in-memory first (fast path) ─────────────────────────────────
    const stored = otpStore.get(e164);
    let verified = false;

    if (stored && String(stored.otp) === code && Date.now() <= stored.expires) {
      otpStore.delete(e164);
      verified = true;
    }

    // ── DB fallback (handles server restarts) ──────────────────────────────
    if (!verified) {
      const dbRecord = await checkOtp(e164, code); // uses otp_codes table
      if (dbRecord) {
        verified = true;
      }
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

// POST /api/kyc/upload — receive base64 ID + selfie, store in Supabase Storage, set status pending
app.post('/api/kyc/upload', verifyToken, async (req, res) => {
  try {
    const { idImage, selfieImage, idType = 'national_id' } = req.body;
    if (!idImage || !selfieImage) return res.status(400).json({ error: 'ID photo and selfie are both required' });

    const userId    = req.userId;
    const timestamp = Date.now();

    // Strip base64 prefix and convert to buffer
    const toBuffer = (b64) => Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    let idUrl      = null;
    let selfieUrl  = null;

    // Try Supabase Storage upload (bucket: kyc-documents)
    try {
      const { error: idErr } = await supabaseAdmin.storage
        .from('kyc-documents')
        .upload(`${userId}/id_${timestamp}.jpg`, toBuffer(idImage), { contentType: 'image/jpeg', upsert: true });

      const { error: selfieErr } = await supabaseAdmin.storage
        .from('kyc-documents')
        .upload(`${userId}/selfie_${timestamp}.jpg`, toBuffer(selfieImage), { contentType: 'image/jpeg', upsert: true });

      if (!idErr) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from('kyc-documents').getPublicUrl(`${userId}/id_${timestamp}.jpg`);
        idUrl = publicUrl;
      }
      if (!selfieErr) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from('kyc-documents').getPublicUrl(`${userId}/selfie_${timestamp}.jpg`);
        selfieUrl = publicUrl;
      }
    } catch (storageErr) {
      console.warn('[kyc/upload] Storage upload failed (bucket may not exist):', storageErr.message);
    }

    // Always mark user as pending regardless of storage success
    await supabaseAdmin.from('users').update({
      kyc_status:       'pending',
      kyc_id_type:      idType,
      kyc_submitted_at: new Date().toISOString(),
      kyc_id_url:       idUrl,
      kyc_selfie_url:   selfieUrl,
      updated_at:       new Date().toISOString(),
    }).eq('id', userId);

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
    const { data, error } = await supabaseAdmin.from('users')
      .select('kyc_status, kyc_id_type, kyc_submitted_at, kyc_id_url, kyc_selfie_url, kyc_rejection_reason, is_id_verified')
      .eq('id', req.userId).single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({
      kyc_status:          data?.kyc_status          || null,
      kyc_id_type:         data?.kyc_id_type         || null,
      kyc_submitted_at:    data?.kyc_submitted_at    || null,
      kyc_id_url:          data?.kyc_id_url          || null,
      kyc_selfie_url:      data?.kyc_selfie_url      || null,
      kyc_rejection_reason:data?.kyc_rejection_reason|| null,
      is_id_verified:      data?.is_id_verified      || false,
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
        .select('email_verified, is_phone_verified, phone_verified, kyc_verified, kyc_status, kyc_id_type, kyc_submitted_at, kyc_id_url, kyc_selfie_url, kyc_rejection_reason, username_changed, preferred_currency, preferred_language, hide_full_name, referral_code, total_referrals, referral_earnings_btc')
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
    // Core fields only — avoid non-existent columns causing 500s
    const coreFields = 'id, username, full_name, bio, location, website, avatar_url, average_rating, total_trades, completion_rate, created_at, is_admin, is_moderator, is_id_verified, is_email_verified, is_phone_verified, total_feedback_count, positive_feedback, negative_feedback, last_login, last_seen_at, badge, country';

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

    // Reviews — silently ignored if table doesn't exist
    let reviews = [];
    try {
      const { data: rv } = await supabaseAdmin.from('reviews')
        .select('*, reviewer:reviewer_id(id, username)').eq('reviewee_id', data.id)
        .order('created_at', { ascending: false }).limit(20);
      reviews = rv || [];
    } catch {}

    res.json({ user: { ...data, ...extraFields }, reviews });
  } catch (error) {
    console.error('[GET /api/users/:userId]', error.message);
    res.status(500).json({ error: 'We couldn\'t load this profile right now. Please try again.' });
  }
});

app.put('/api/users/profile', verifyToken, async (req, res) => {
  try {
    const { username, full_name, fullName, bio, location, website, phone, hide_full_name } = req.body;

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
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin.from('users').update(updateData).eq('id', req.userId).select().single();
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
    res.json({ success: true, avatar_url: data.avatar_url, message: 'Profile picture updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/avatar', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users').select('avatar_url').eq('id', req.params.userId).single();
    if (error) return res.json({ avatar_url: null });
    res.json({ avatar_url: data?.avatar_url || null });
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
    let { data, error } = await supabaseAdmin.from('user_balances').select('balance_btc, balance_usd').eq('user_id', req.userId).single();
    if (error && error.code === 'PGRST116') {
      await supabaseAdmin.from('user_balances').insert([{ user_id: req.userId, balance_btc: 0, balance_usd: 0 }]);
      return res.json({ balance_btc: 0, balance_usd: 0 });
    }
    if (error) return res.status(400).json({ error: error.message });
    res.json({ balance_btc: parseFloat(data?.balance_btc || 0), balance_usd: parseFloat(data?.balance_usd || 0) });
  } catch (error) {
    res.json({ balance_btc: 0, balance_usd: 0 });
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

app.get('/api/listings', async (req, res) => {
  try {
    const { brand, minPrice, maxPrice } = req.query;
    const cacheKey = `listings|${brand||''}|${minPrice||''}|${maxPrice||''}`;
    const hit = getCached(cacheKey);
    if (hit) return res.json({ listings: hit });

    let query = supabaseAdmin.from('listings').select(`
      id, seller_id, listing_type, gift_card_brand, status, bitcoin_price, margin, pricing_type,
      currency, currency_symbol, country, country_name, payment_method, payment_methods,
      amount_usd, min_limit_usd, max_limit_usd, min_limit_local, max_limit_local,
      time_limit, trade_instructions, listing_terms, description, created_at,
      card_values, card_type, face_value,
      users:seller_id(id, username, average_rating, total_trades, completion_rate,
        avatar_url, is_id_verified, is_email_verified, last_login, last_seen_at, created_at,
        total_feedback_count, positive_feedback, negative_feedback, country, bio, badge)
    `).eq('status', 'ACTIVE').order('created_at', { ascending: false });
    if (brand) query = query.ilike('gift_card_brand', `%${brand}%`);
    if (minPrice) query = query.gte('bitcoin_price', parseFloat(minPrice));
    if (maxPrice) query = query.lte('bitcoin_price', parseFloat(maxPrice));
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    let listings = data || [];

    // Attach live seller BTC balance to each SELL listing so the frontend can
    // show dynamic available limits. ALL active offers are shown regardless of
    // balance — escrow locks at trade time, not at offer creation.
    const sellListings = listings.filter(l =>
      l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN'
    );

    if (sellListings.length > 0) {
      const sellerIds = [...new Set(sellListings.map(l => l.seller_id))];
      const { data: wallets } = await supabaseAdmin
        .from('user_balances')
        .select('user_id, balance_btc')
        .in('user_id', sellerIds);

      const balMap = {};
      (wallets || []).forEach(w => { balMap[w.user_id] = parseFloat(w.balance_btc || 0); });

      listings = listings.map(l => {
        if (l.listing_type !== 'SELL' && l.listing_type !== 'SELL_BITCOIN') return l;
        const sellerBtc   = balMap[l.seller_id] || 0;
        const btcPriceVal = parseFloat(l.bitcoin_price) || 88000;
        const effectiveMaxUsd = sellerBtc > 0 ? sellerBtc * btcPriceVal : parseFloat(l.max_limit_usd || 0);
        return { ...l, seller_balance_btc: sellerBtc, effective_max_usd: effectiveMaxUsd };
      });

      // Hide SELL offers whose seller has less than $10 worth of BTC — their
      // offer stays ACTIVE in the DB and reappears automatically once they top up.
      listings = listings.filter(l => {
        if (l.listing_type !== 'SELL' && l.listing_type !== 'SELL_BITCOIN') return true;
        const sellerBtc   = l.seller_balance_btc || 0;
        const btcPriceVal = parseFloat(l.bitcoin_price) || 88000;
        return sellerBtc * btcPriceVal >= 10;
      });
    }

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

    // Get the seller separately
    const { data: seller } = await supabaseAdmin
      .from('users')
      .select('id, username, badge, country, average_rating, total_trades, completion_rate, avatar_url, created_at, total_feedback_count, positive_feedback, negative_feedback, last_login, last_seen_at, is_id_verified, is_email_verified, is_phone_verified, bio, trust_score, blocks_received, avg_response_time')
      .eq('id', listing.seller_id)
      .single();

    res.json({ listing: { ...listing, users: seller ? [seller] : [] } });
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
    const { margin, min_limit_usd, max_limit_usd, payment_method, trade_instructions, status } = req.body;
    const { data: listing, error: findError } = await supabaseAdmin.from('listings').select('seller_id').eq('id', id).single();
    if (findError || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.seller_id !== req.userId) return res.status(403).json({ error: 'You can only edit your own listings' });
    const updateData = { updated_at: new Date().toISOString() };
    if (margin !== undefined) updateData.margin = margin;
    if (min_limit_usd !== undefined) updateData.min_limit_usd = min_limit_usd;
    if (max_limit_usd !== undefined) updateData.max_limit_usd = max_limit_usd;
    if (payment_method !== undefined) updateData.payment_method = payment_method;
    if (trade_instructions !== undefined) updateData.trade_instructions = trade_instructions;
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

    const typeMap = { sell: 'SELL', buy: 'BUY', gc_buy: 'BUY_GIFT_CARD' };
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

    const { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, username, badge, country, total_trades, positive_feedback, negative_feedback, average_rating, avatar_url, last_seen_at, last_login, completion_rate')
      .in('id', userIds);

    if (userError) throw userError;

    const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));

    // Fetch BTC balances for SELL offer owners so we can hide low-balance offers
    const sellSellerIds = [...new Set(
      (listings || [])
        .filter(l => l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN')
        .map(l => l.seller_id)
    )];
    let balMap = {};
    if (sellSellerIds.length > 0) {
      const { data: bals } = await supabaseAdmin
        .from('user_balances')
        .select('user_id, balance_btc')
        .in('user_id', sellSellerIds);
      (bals || []).forEach(b => { balMap[b.user_id] = parseFloat(b.balance_btc || 0); });
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
      card_type
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

    // Default gift_card_brand for non-GC offers (column is NOT NULL in schema)
    const brandDefault = mappedType === 'SELL' ? 'Sell Bitcoin' : mappedType === 'BUY' ? 'Buy Bitcoin' : '';
    const cur = currency || 'USD';
    const curSym = currency_symbol || (cur === 'GHS' ? '₵' : cur === 'NGN' ? '₦' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$');

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
         buyer:buyer_id(id, username, avatar_url, badge, total_trades, completion_rate, positive_feedback, negative_feedback, last_login, country),
         seller:seller_id(id, username, avatar_url, badge, total_trades, completion_rate, positive_feedback, negative_feedback, last_login, country)`,
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
      .limit(10);

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
      .select(`*, listing:listing_id(*), buyer:buyer_id(id, username, avatar_url, average_rating, total_trades, completion_rate, last_login, badge, positive_feedback, negative_feedback, country), seller:seller_id(id, username, avatar_url, average_rating, total_trades, completion_rate, last_login, badge, positive_feedback, negative_feedback, country)`)
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

    // Pre-check: ensure BTC provider has enough balance before creating the trade
    const { data: providerBalance } = await supabaseAdmin
      .from('user_balances').select('balance_btc').eq('user_id', btcProviderId).maybeSingle();
    let availableBtc = parseFloat(providerBalance?.balance_btc || 0);
    // Fallback: user_balances row may be missing or stale — sync from user_wallets
    if (availableBtc === 0) {
      const { data: walletRow } = await supabaseAdmin
        .from('user_wallets').select('balance_btc').eq('user_id', btcProviderId).maybeSingle();
      const walletBtc = parseFloat(walletRow?.balance_btc || 0);
      if (walletBtc > 0) {
        await supabaseAdmin.from('user_balances')
          .upsert({ user_id: btcProviderId, balance_btc: walletBtc, updated_at: new Date().toISOString() });
        availableBtc = walletBtc;
      }
    }
    if (availableBtc < verifiedAmountBtc) {
      return res.status(400).json({
        error: `The ${btcProviderId === req.userId ? 'seller' : 'offer owner'} has insufficient Bitcoin balance to complete this trade. Please try a smaller amount or choose a different offer.`
      });
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
        await notifyTradeParties(
          trade[0],
          '⚡ New Trade Opened on PRAQEN!',
          `Trade #${trade[0].trade_ref} opened! ${trade[0].amount_btc} BTC secured in escrow. Log in to proceed: https://praqen.com/trade/${trade[0].id}`,
          tradeEmailTemplate(
            '⚡ New Trade Opened on PRAQEN!',
            '⚡ Your Trade Is Live!',
            `A new trade has been successfully created and <strong>${trade[0].amount_btc} BTC</strong> is now locked safely in escrow. Buyer — complete your payment to proceed. Seller — you'll be notified once payment is sent.`,
            trade[0].trade_ref,
            trade[0].amount_btc,
            `https://praqen.com/trade/${trade[0].id}`
          )
        );
      } catch (notifyErr) {
        console.error('[Trade Open] Background notification failed:', notifyErr.message);
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/mark-paid', verifyToken, async (req, res) => {
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

    const { data, error } = await supabaseAdmin.from('trades')
      .update({ status: 'PAYMENT_SENT', buyer_confirmed: true, buyer_confirmed_at: new Date() })
      .eq('id', req.params.id).select().single();
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
        await notifyTradeParties(
          trade,
          '💰 Payment Sent — Release BTC Now',
          `Trade #${trade.trade_ref}: buyer has marked payment as sent. Seller — verify and release BTC: https://praqen.com/trade/${trade.id}`,
          tradeEmailTemplate(
            '💰 Payment Sent — Release BTC Now',
            '💰 Buyer Has Sent Payment!',
            `The buyer has confirmed their payment for this trade. <strong>Seller — please verify the payment in your account and release the BTC</strong> to complete the trade. Only release after confirming funds are received.`,
            trade.trade_ref,
            trade.amount_btc,
            `https://praqen.com/trade/${trade.id}`
          )
        );
      } catch (e) { console.error('[mark-paid] Background notify failed:', e.message); }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/release', verifyToken, async (req, res) => {
  try {
    const { data: releasedTrade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    const result = await tradeEscrowService.releaseBitcoinToBuyer(req.params.id, req.userId);
    res.json(result);

    if (releasedTrade) {
      setImmediate(async () => {
        try {
          updateUserTradeStats(releasedTrade.seller_id).catch(() => {});
          updateUserTradeStats(releasedTrade.buyer_id).catch(() => {});
          await notifyTradeParties(
            releasedTrade,
            '✅ Trade Complete — BTC Released!',
            `Trade #${releasedTrade.trade_ref} complete! ${releasedTrade.amount_btc} BTC released. Check your PRAQEN wallet: https://praqen.com/trade/${releasedTrade.id}`,
            tradeEmailTemplate(
              '✅ Trade Complete — BTC Released!',
              '✅ Trade Successfully Completed!',
              `Congratulations! The trade has been completed and <strong>${releasedTrade.amount_btc} BTC has been released</strong>. Buyer — check your PRAQEN wallet. Seller — your payment is confirmed. Thank you for trading safely on PRAQEN!`,
              releasedTrade.trade_ref,
              releasedTrade.amount_btc,
              `https://praqen.com/trade/${releasedTrade.id}`
            )
          );
        } catch (e) { console.error('[release] Background notify failed:', e.message); }
      });
    }
  } catch (error) {
    console.error('❌ /api/trades/:id/release error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/cancel', verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const { data: trade, error: fetchError } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (fetchError || !trade) return res.status(404).json({ error: 'Trade not found' });
    // Trade opener = buyer when trade_type is BUY, seller when trade_type is SELL
    const tradeOpener = (trade.trade_type || '').toUpperCase() === 'BUY' ? trade.buyer_id : trade.seller_id;
    const isPostPay = ['PAYMENT_SENT', 'PAID'].includes(trade.status);
    // After marking paid the buyer can still cancel (changed mind before seller releases BTC)
    const authorized = tradeOpener === req.userId || (isPostPay && trade.buyer_id === req.userId);
    if (!authorized) return res.status(403).json({ error: 'Not authorized to cancel this trade' });
    const cancellableStatuses = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN', 'PAYMENT_SENT', 'PAID'];
    if (!cancellableStatuses.includes(trade.status)) return res.status(400).json({ error: `Trade cannot be cancelled — status is ${trade.status}` });
    const { data: escrow } = await supabaseAdmin.from('escrow_locks').select('*').eq('trade_id', req.params.id).single();
    if (escrow && escrow.status === 'LOCKED') {
      // escrow.seller_id holds the btcProviderId (buyer in gift card trades, seller in BTC trades)
      const btcProviderId = escrow.seller_id || trade.seller_id;
      const { data: providerBalance } = await supabaseAdmin.from('user_balances').select('balance_btc').eq('user_id', btcProviderId).single();
      const newProviderBalance = parseFloat(providerBalance?.balance_btc || 0) + parseFloat(escrow.amount_btc);
      await supabaseAdmin.from('user_balances').update({ balance_btc: newProviderBalance, updated_at: new Date() }).eq('user_id', btcProviderId);
      await supabaseAdmin.from('escrow_locks').update({ status: 'REFUNDED' }).eq('trade_id', req.params.id);
    }
    const { data, error } = await supabaseAdmin.from('trades')
      .update({ status: 'CANCELLED', cancel_reason: reason || 'Trade opener cancelled', cancelled_at: new Date() })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Notify both parties about cancellation
    const { data: cancellerUser } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const cancellerName = cancellerUser?.username || 'Trader';
    const fmtC   = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n||0);
    const cLocal = trade.amount_local || 0;
    const cCur   = trade.local_currency || 'USD';
    const cPM    = trade.payment_method || 'Mobile Money';
    const cDisp  = cLocal > 0 ? `${fmtC(cLocal)} ${cCur}` : `$${fmtC(trade.amount_usd)} USD`;
    const cancelMsg = `${cancellerName} cancelled the trade · ${cDisp} via ${cPM}`;
    const otherId   = req.userId === trade.buyer_id ? trade.seller_id : trade.buyer_id;
    res.json({ success: true, trade: data });

    setImmediate(async () => {
      try {
        await createNotification(otherId, 'cancelled', '❌ Trade Cancelled', cancelMsg, `/trade/${req.params.id}`);
        await createNotification(req.userId, 'cancelled', '❌ Trade Cancelled',
          `You cancelled the trade · ${cDisp} via ${cPM}`, `/trade/${req.params.id}`);
        await notifyTradeParties(
          trade,
          '❌ Trade Cancelled',
          `Trade #${trade.trade_ref} has been cancelled. ${reason ? `Reason: ${reason}. ` : ''}Any locked BTC has been returned to your wallet.`,
          tradeEmailTemplate(
            '❌ Trade Cancelled',
            '❌ Your Trade Has Been Cancelled',
            `Trade <strong>#${trade.trade_ref}</strong> has been cancelled${reason ? ` — Reason: <em>${reason}</em>` : ''}. Any BTC that was locked in escrow has been returned to your PRAQEN wallet. If you have concerns, please contact our support team.`,
            trade.trade_ref,
            trade.amount_btc,
            null
          )
        );
      } catch (e) { console.error('[cancel] Background notify failed:', e.message); }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/auto-cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const tradeId = req.params.id;

    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', tradeId).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });

    const cancellableStatuses = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN', 'PAYMENT_SENT'];
    if (!cancellableStatuses.includes(trade.status)) {
      return res.json({ success: true, message: `Trade already in status: ${trade.status}` });
    }

    // Refund BTC back to whoever locked it
    const { data: escrow } = await supabaseAdmin
      .from('escrow_locks').select('*').eq('trade_id', tradeId).single();

    if (escrow && escrow.status === 'LOCKED') {
      // escrow.seller_id = btcProviderId (set correctly for both BTC and gift card trades)
      const btcProviderId = escrow.seller_id || trade.seller_id;
      const refundAmount  = parseFloat(escrow.amount_btc || trade.amount_btc || 0);

      const { data: providerBal } = await supabaseAdmin
        .from('user_balances').select('balance_btc').eq('user_id', btcProviderId).single();

      const newBalance = parseFloat((parseFloat(providerBal?.balance_btc || 0) + refundAmount).toFixed(8));

      await supabaseAdmin.from('user_balances')
        .update({ balance_btc: newBalance, updated_at: new Date().toISOString() })
        .eq('user_id', btcProviderId);

      await supabaseAdmin.from('escrow_locks')
        .update({ status: 'REFUNDED', released_at: new Date().toISOString() })
        .eq('trade_id', tradeId);

      // Log the refund
      await supabaseAdmin.from('wallet_transactions').insert({
        user_id:    btcProviderId,
        type:       'ESCROW_RELEASE',
        amount_btc: refundAmount,
        status:     'CONFIRMED',
        notes:      `Auto-cancel refund — trade #${tradeId.slice(0,8)} (30 min expired)`,
        created_at: new Date().toISOString(),
      });

      console.log(`✅ Auto-cancel: refunded ${refundAmount} BTC to ${btcProviderId.slice(0,8)}`);
    }

    // Mark trade as cancelled
    const { data, error } = await supabaseAdmin.from('trades')
      .update({ status: 'CANCELLED', cancel_reason: reason || '30-minute payment window expired', cancelled_at: new Date().toISOString() })
      .eq('id', tradeId).select().single();

    if (error) return res.status(400).json({ error: error.message });

    // Notify both parties
    for (const uid of [trade.buyer_id, trade.seller_id].filter(Boolean)) {
      await supabaseAdmin.from('notifications').insert({
        user_id: uid, type: 'trade', is_read: false,
        title:   '⏰ Trade Expired',
        message: `Trade #${tradeId.slice(0,8).toUpperCase()} cancelled — 30-minute window expired. Bitcoin returned to seller wallet.`,
        action:  `/trade/${tradeId}`,
        created_at: new Date().toISOString(),
      });
    }

    res.json({ success: true, trade: data });
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
    const { tradeId, message } = req.body;
    if (!tradeId || !message) return res.status(400).json({ error: 'Missing required fields' });
    const { data: trade, error: tradeError } = await supabaseAdmin.from('trades').select('buyer_id, seller_id, status').eq('id', tradeId).single();
    if (tradeError || !trade) return res.status(404).json({ error: 'Trade not found' });
    const recipientId = trade.buyer_id === req.userId ? trade.seller_id : trade.buyer_id;
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin').eq('id', req.userId).single();
    const senderRole = (userData?.is_moderator || userData?.is_admin) ? 'moderator' : 'user';
    const { data, error } = await supabaseAdmin.from('messages').insert([{
      trade_id: tradeId, sender_id: req.userId, recipient_id: recipientId,
      message_text: message, message_type: 'CHAT', sender_role: senderRole, created_at: new Date(),
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

app.post('/api/trades/:id/dispute', verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    const { data, error } = await supabaseAdmin.from('trades')
      .update({ status: 'DISPUTED', disputed_at: new Date(), dispute_reason: reason || 'User opened a dispute' })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, trade: data });

    setImmediate(async () => {
      try {
        await createNotification(trade.seller_id, 'support', '⚠️ Dispute Opened', `Dispute opened for trade #${req.params.id.slice(0, 8)}. Moderator will review.`, `/trade/${req.params.id}`);
        await createNotification(trade.buyer_id, 'support', '⚠️ Dispute Opened', `Dispute opened for trade #${req.params.id.slice(0, 8)}. Please provide evidence.`, `/trade/${req.params.id}`);
        await notifyModerators(req.params.id, trade, reason || 'User opened a dispute');
        await supabaseAdmin.from('messages').insert([{ trade_id: req.params.id, sender_id: null, recipient_id: null, message_text: `🚨 DISPUTE OPENED — Reason: ${reason || 'User opened a dispute'}. Moderators notified.`, message_type: 'SYSTEM', sender_role: 'system', created_at: new Date() }]);
        await notifyTradeParties(
          trade,
          '🚨 Dispute Opened — Moderator Notified',
          `Dispute filed on trade #${trade.trade_ref}. Do NOT release funds. A moderator will contact you shortly: https://praqen.com/trade/${trade.id}`,
          tradeEmailTemplate(
            '🚨 Dispute Opened — Moderator Notified',
            '🚨 A Dispute Has Been Filed',
            `A dispute has been opened on trade <strong>#${trade.trade_ref}</strong>${reason ? ` — Reason: <em>${reason}</em>` : ''}. A PRAQEN moderator has been notified and will review all evidence. <strong>Do not release or transfer any funds until the dispute is fully resolved.</strong>`,
            trade.trade_ref,
            trade.amount_btc,
            `https://praqen.com/trade/${trade.id}`
          )
        );
      } catch (e) { console.error('[dispute] Background notify failed:', e.message); }
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
    let msg = '';
    if (resolution === 'BUYER_WINS') {
      await releaseFundsToBuyer(trade.id, trade.buyer_id, trade.amount_btc, trade.amount_usd);
      msg = '✅ Resolved: BUYER WINS — Bitcoin released to buyer.';
    } else if (resolution === 'SELLER_WINS') {
      await supabaseAdmin.from('trades').update({ status: 'COMPLETED', dispute_resolution: 'SELLER_WINS', dispute_notes: notes, resolved_by: req.userId, resolved_at: new Date() }).eq('id', req.params.id);
      msg = '✅ Resolved: SELLER WINS — Funds remain with seller.';
    } else if (resolution === 'CANCEL') {
      const { data: escrow } = await supabaseAdmin.from('escrow_locks').select('*').eq('trade_id', trade.id).single();
      if (escrow?.status === 'LOCKED') {
        const { data: sb } = await supabaseAdmin.from('user_balances').select('balance_btc').eq('user_id', trade.seller_id).single();
        await supabaseAdmin.from('user_balances').update({ balance_btc: parseFloat(sb?.balance_btc || 0) + parseFloat(escrow.amount_btc) }).eq('user_id', trade.seller_id);
        await supabaseAdmin.from('escrow_locks').update({ status: 'REFUNDED' }).eq('trade_id', trade.id);
      }
      await supabaseAdmin.from('trades').update({ status: 'CANCELLED', dispute_resolution: 'CANCEL', dispute_notes: notes, resolved_by: req.userId, resolved_at: new Date() }).eq('id', req.params.id);
      msg = '❌ Resolved: Trade cancelled. Funds returned to seller.';
    }
    await supabaseAdmin.from('messages').insert([{ trade_id: req.params.id, sender_id: req.userId, message_text: `👨‍⚖️ Moderator resolved dispute.\nDecision: ${resolution}\nNotes: ${notes || 'None'}\n${msg}`, message_type: 'SYSTEM', sender_role: 'moderator', created_at: new Date() }]);
    for (const uid of [trade.buyer_id, trade.seller_id]) await createNotification(uid, 'support', 'Dispute Resolved', `Trade #${trade.id.slice(0, 8)} dispute resolved: ${resolution}`, `/trade/${trade.id}`);
    res.json({ success: true, message: `Dispute resolved: ${resolution}` });
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
    const { data: allReviews } = await supabaseAdmin.from('reviews').select('rating').eq('reviewee_id', toUserId);
    if (allReviews?.length > 0) {
      const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
      const posCount = allReviews.filter(r => r.rating >= 4).length;
      const negCount = allReviews.filter(r => r.rating <= 2).length;
      await supabaseAdmin.from('users').update({
        average_rating: parseFloat(avg.toFixed(2)),
        total_feedback_count: allReviews.length,
        positive_feedback: posCount,
        negative_feedback: negCount,
      }).eq('id', toUserId);
    }
    await updateUserTradeStats(trade.seller_id);
    await updateUserTradeStats(trade.buyer_id);
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

    // Run all queries in parallel
    const [earningsResult, userResult, signupsResult] = await Promise.all([
      // Trade-based commissions (also source of legacy referred-user data)
      supabaseAdmin
        .from('affiliate_earnings')
        .select(`id, commission_btc, trade_amount_btc, trade_amount_usd, commission_rate, status, created_at, trade_id,
          referred_user:referred_user_id(id, username, avatar_url, created_at, total_trades, badge)`)
        .eq('referrer_id', userId)
        .order('created_at', { ascending: false }),

      // Referrer's own stats (total_referrals is authoritative signup count)
      supabaseAdmin
        .from('users')
        .select('total_referrals, referral_earnings_btc')
        .eq('id', userId)
        .single(),

      // Users who signed up via this referrer's link (referred_by properly set)
      supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, created_at, total_trades, badge')
        .eq('referred_by', userId)
        .order('created_at', { ascending: false }),
    ]);

    if (earningsResult.error) throw earningsResult.error;

    const earnings = earningsResult.data || [];
    const userData = userResult.data || {};
    const signups  = signupsResult.data || [];

    const totalEarned = earnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);

    // Map earnings per user for commission totals
    const earningsPerUser = {};
    earnings.forEach(e => {
      if (e.referred_user?.username) {
        const u = e.referred_user.username;
        earningsPerUser[u] = (earningsPerUser[u] || 0) + parseFloat(e.commission_btc || 0);
      }
    });

    // Start with signups that have referred_by set (new method)
    const seenIds = new Set();
    const referredUsers = signups.map(u => {
      seenIds.add(u.id);
      return { username: u.username, avatar_url: u.avatar_url || null, total_trades: u.total_trades || 0, badge: u.badge || 'BEGINNER', joined_at: u.created_at, total_earned: earningsPerUser[u.username] || 0 };
    });

    // Add users from affiliate_earnings that aren't already in the list (legacy referrals)
    earnings.forEach(e => {
      const ru = e.referred_user;
      if (ru?.id && !seenIds.has(ru.id)) {
        seenIds.add(ru.id);
        referredUsers.push({ username: ru.username, avatar_url: ru.avatar_url || null, total_trades: ru.total_trades || 0, badge: ru.badge || 'BEGINNER', joined_at: ru.created_at, total_earned: earningsPerUser[ru.username] || 0 });
      }
    });

    res.json({
      success: true,
      totalEarned,
      referralCount: userData.total_referrals || referredUsers.length,
      referredUsers,
      earnings,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public leaderboard — top 10 referrers (anonymized: first 2 chars + ***)
app.get('/api/referral/leaderboard', async (req, res) => {
  try {
    // Sum commission_btc grouped by referrer_id
    const { data, error } = await supabaseAdmin
      .from('affiliate_earnings')
      .select('referrer_id, commission_btc');
    if (error) throw error;

    // Aggregate in JS since Supabase REST doesn't support GROUP BY directly
    const map = {};
    (data || []).forEach(r => {
      if (!map[r.referrer_id]) map[r.referrer_id] = 0;
      map[r.referrer_id] += parseFloat(r.commission_btc || 0);
    });

    // Resolve usernames (only for top earners)
    const sorted = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (sorted.length === 0) return res.json({ success: true, leaderboard: [] });

    const ids = sorted.map(([id]) => id);
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, username, badge, total_referrals, total_trades')
      .in('id', ids);

    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = u; });

    const leaderboard = sorted.map(([id, earned], rank) => {
      const u = userMap[id] || {};
      const name = u.username || 'Trader';
      // Anonymize: first 2 chars visible, rest replaced
      const anon = name.length <= 2 ? name + '***' : name.slice(0, 2) + '*'.repeat(Math.min(4, name.length - 2));
      return {
        rank: rank + 1,
        username: anon,
        badge: u.badge || 'BEGINNER',
        earned_btc: earned,
        referrals: u.total_referrals || 0,
        total_trades: u.total_trades || 0,
      };
    });

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

    // Read current balance then upsert incremented value (supabase-js has no raw SQL in update)
    const { data: balanceRow } = await supabaseAdmin
      .from('user_balances')
      .select('balance_btc')
      .eq('user_id', req.userId)
      .single();

    const newBalance = parseFloat(balanceRow?.balance_btc || 0) + totalEarnings;

    const { error: balErr } = await supabaseAdmin
      .from('user_balances')
      .upsert({ user_id: req.userId, balance_btc: newBalance }, { onConflict: 'user_id' });
    if (balErr) throw balErr;

    const ids = earnings.map(e => e.id);
    const { error: updErr } = await supabaseAdmin
      .from('affiliate_earnings')
      .update({ status: 'WITHDRAWN' })
      .in('id', ids);
    if (updErr) throw updErr;

    res.json({ success: true, amountBtc: totalEarnings, message: `₿ ${totalEarnings.toFixed(8)} added to wallet!` });
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
    const [usersR, tradesR, listingsR, profitsR, disputesR, kycR] = await Promise.all([
      supabaseAdmin.from('users').select('id, created_at, account_status, is_email_verified, is_id_verified, badge', { count: 'exact' }),
      supabaseAdmin.from('trades').select('id, status, amount_usd, amount_btc, created_at', { count: 'exact' }),
      supabaseAdmin.from('listings').select('id, status', { count: 'exact' }),
      supabaseAdmin.from('company_profits').select('profit_btc, profit_usd'),
      supabaseAdmin.from('trades').select('id', { count: 'exact' }).eq('status', 'DISPUTED'),
      supabaseAdmin.from('users').select('id', { count: 'exact' }).eq('kyc_status', 'pending'),
    ]);
    const users   = usersR.data  || [];
    const trades  = tradesR.data || [];
    const profits = profitsR.data || [];
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
      totalUsers: usersR.count || users.length,
      newUsersToday, newUsersWeek,
      verifiedUsers: users.filter(u => u.is_email_verified).length,
      kycVerified:   users.filter(u => u.is_id_verified).length,
      pendingKyc:    kycR.count || 0,
      totalTrades:   tradesR.count || trades.length,
      activeTrades, completedTrades, cancelledTrades,
      openDisputes:  disputesR.count || 0,
      activeListings: (listingsR.data || []).filter(l => l.status === 'ACTIVE').length,
      totalListings:  listingsR.count || 0,
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
    const { search = '', status = '', page = 1, limit = 50 } = req.query;
    let query = supabaseAdmin.from('users')
      .select('id, email, username, full_name, phone_number, avatar_url, account_status, is_admin, is_moderator, is_email_verified, is_id_verified, is_phone_verified, kyc_status, total_trades, completion_rate, average_rating, positive_feedback, negative_feedback, badge, referral_code, total_referrals, created_at, last_login, last_seen_at, country', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (search) query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%,full_name.ilike.%${search}%`);
    if (status) query = query.eq('account_status', status);
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
      .select('id, email, username, full_name, kyc_id_type, kyc_id_url, kyc_selfie_url, kyc_status, kyc_submitted_at, created_at, country')
      .order('kyc_submitted_at', { ascending: true, nullsFirst: false });

    if (status === 'all') {
      // Anyone who ever uploaded a document OR has any kyc_status
      query = query.or('kyc_id_url.not.is.null,kyc_status.not.is.null');
    } else if (status === 'pending') {
      // kyc_status='pending' OR has a document but status was never set (legacy)
      query = query.or('kyc_status.eq.pending,and(kyc_status.is.null,kyc_id_url.not.is.null)');
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
      .not('kyc_id_url', 'is', null)
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
    await supabaseAdmin.from('users').update({ kyc_status: 'approved', is_id_verified: true, kyc_approved_at: new Date(), updated_at: new Date() }).eq('id', req.params.userId);
    await createNotification(req.params.userId, 'kyc', '✅ KYC Approved', 'Your identity has been verified. You now have full access to all PRAQEN features.', '/settings');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/kyc/:userId/reject
app.put('/api/admin/kyc/:userId/reject', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { reason = 'Documents unclear or invalid' } = req.body;
    await supabaseAdmin.from('users').update({ kyc_status: 'rejected', is_id_verified: false, kyc_rejection_reason: reason, updated_at: new Date() }).eq('id', req.params.userId);
    await createNotification(req.params.userId, 'kyc', '❌ KYC Rejected', `Your KYC was not approved: ${reason}. Please re-submit with clearer documents.`, '/settings');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// POST /api/admin/broadcast — send notification to all users
app.post('/api/admin/broadcast', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { title, message, type = 'system' } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
    const { data: users } = await supabaseAdmin.from('users').select('id').eq('account_status', 'active');
    if (!users?.length) return res.json({ success: true, sent: 0 });
    const notifications = users.map(u => ({ user_id: u.id, type, title, message, is_read: false, created_at: new Date() }));
    // Insert in batches of 100
    for (let i = 0; i < notifications.length; i += 100) {
      await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + 100));
    }
    res.json({ success: true, sent: users.length });
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

// PUT /api/admin/users/:id/verify-phone — manually verify phone
app.put('/api/admin/users/:id/verify-phone', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users').update({ is_phone_verified: true, updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await createNotification(req.params.id, 'system', '📱 Phone Verified', 'Your phone number has been manually verified by an admin.', '/settings');
    res.json({ success: true, user: data });
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
    const { data: balance } = await supabaseAdmin.from('user_balances').select('balance_btc, balance_usd').eq('user_id', req.userId).single();
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
      wallet: { address, walletId, created_at: user.wallet_created_at, balance_btc: parseFloat(balance?.balance_btc || 0), balance_usd: parseFloat(balance?.balance_usd || 0), has_address: !!address },
      transactions: (recentTrades || []).map(t => ({ id: t.id, amount_btc: parseFloat(t.amount_btc || 0), amount_usd: parseFloat(t.amount_usd || 0), type: 'trade_completion', status: t.status, date: t.completed_at || t.created_at })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/create-address', verifyToken, async (req, res) => {
  try {
    const { data: user } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const wallet = await coinbaseWallet.createWallet(req.userId, user?.username || 'user');
    await supabaseAdmin.from('users').update({ coinbase_wallet_id: wallet.walletId, bitcoin_wallet_address: wallet.address, coinbase_wallet_address: wallet.address, wallet_created_at: new Date().toISOString() }).eq('id', req.userId);
    res.json({ success: true, address: wallet.address, walletId: wallet.walletId, message: 'New Bitcoin address generated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/check-payment', verifyToken, async (req, res) => {
  try {
    const { data: user } = await supabaseAdmin.from('users').select('coinbase_wallet_id, bitcoin_wallet_address').eq('id', req.userId).single();
    if (!user?.coinbase_wallet_id) return res.status(400).json({ error: 'No wallet found. Please create a wallet first.' });
    const payment = await coinbaseWallet.checkPayment(user.coinbase_wallet_id);
    if (payment.confirmed && payment.amount > 0) {
      const { data: currentBal } = await supabaseAdmin.from('user_balances').select('balance_btc').eq('user_id', req.userId).single();
      const newBal = parseFloat(currentBal?.balance_btc || 0) + payment.amount;
      await supabaseAdmin.from('user_balances').upsert({ user_id: req.userId, balance_btc: newBal, updated_at: new Date() });
      await supabaseAdmin.from('wallet_transactions').insert({ user_id: req.userId, type: 'DEPOSIT', amount_btc: payment.amount, status: 'CONFIRMED', tx_hash: payment.txHash, coinbase_tx_id: user.coinbase_wallet_id, created_at: new Date() }).maybeSingle();
      res.json({ success: true, confirmed: true, amount_btc: payment.amount, tx_hash: payment.txHash, new_balance: newBal, message: `Deposit confirmed: ${payment.amount} BTC received` });
    } else {
      res.json({ success: true, confirmed: false, message: 'No confirmed payment yet. Payments can take 10–60 minutes to confirm.' });
    }
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

    // ── Check sender balance ───────────────────────────────────────────────
    const { data: senderBal } = await supabaseAdmin
      .from('user_balances').select('balance_btc').eq('user_id', req.userId).single();

    const available = parseFloat(senderBal?.balance_btc || 0);
    if (available < amount) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ${available.toFixed(8)} BTC, Requested: ${amount.toFixed(8)} BTC`,
      });
    }

    // ── Deduct from sender ─────────────────────────────────────────────────
    const newSenderBalance = parseFloat((available - amount).toFixed(8));
    await supabaseAdmin.from('user_balances')
      .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);
    await supabaseAdmin.from('user_wallets')
      .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);

    // ── Credit recipient ───────────────────────────────────────────────────
    const { data: recipBal } = await supabaseAdmin
      .from('user_balances').select('balance_btc').eq('user_id', recipientId).single();
    const newRecipientBalance = parseFloat((parseFloat(recipBal?.balance_btc || 0) + amount).toFixed(8));
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

    // Validate Bitcoin address format (legacy, P2SH, bech32, testnet)
    const btcAddressRe = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$|^(tb1|[mn2])[a-zA-HJ-NP-Z0-9]{25,87}$/;
    if (!btcAddressRe.test(address)) {
      return res.status(400).json({ error: 'Invalid Bitcoin address format' });
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
// START SERVER
// ============================================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ PRAQEN Backend running on http://localhost:${PORT}`);
  console.log('📋 Routes: /api/auth, /api/users, /api/listings, /api/trades, /api/my-trades, /api/wallet, /api/hd-wallet, /api/notifications');

  // Immediately pause all sell offers whose seller balance is insufficient
  syncAllOfferStatuses().catch(err => console.error('[startup] syncAllOfferStatuses:', err.message));

  // Start deposit monitor background job (mainnet only)
  if (process.env.HD_NETWORK === 'mainnet') {
    depositMonitor.start();
    console.log('🔍 Deposit monitor: MAINNET — polls every 5 min | SMS + Email alerts enabled');
  } else {
    console.log('⚠️  Deposit monitor NOT started — HD_NETWORK is not mainnet');
  }
});

module.exports = app;