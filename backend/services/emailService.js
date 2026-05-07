// backend/services/emailService.js
// PRAQEN Complete Email Notification Service
// Primary: Brevo SMTP  |  Logged to: email_logs table
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const FROM_ADDRESS = `PRAQEN <${process.env.SMTP_FROM || process.env.EMAIL_USER || 'kendevdash@gmail.com'}>`;

function makeTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
}

// ── Logging ──────────────────────────────────────────────────────────────────
async function logEmail({ userId, email, subject, type, status, messageId, errorMessage, metadata }) {
  try {
    await supabase.from('email_logs').insert({
      user_id:       userId || null,
      email,
      subject,
      type,
      status,
      message_id:    messageId    || null,
      error_message: errorMessage || null,
      metadata:      metadata     || null,
      sent_at:       status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.error('[EmailLog] DB log failed:', e.message);
  }
}

// ── Core send ─────────────────────────────────────────────────────────────────
async function sendEmail({ userId, to, subject, html, text, type, metadata }) {
  const transporter = makeTransporter();
  try {
    const info = await transporter.sendMail({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      text: text || '',
    });
    console.log(`[Email] ✅ ${type} → ${to} (${info.messageId})`);
    await logEmail({ userId, email: to, subject, type, status: 'sent', messageId: info.messageId, metadata });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] ❌ ${type} → ${to}: ${err.message}`);
    await logEmail({ userId, email: to, subject, type, status: 'failed', errorMessage: err.message, metadata });
    return { success: false, error: err.message };
  }
}

// ── Base HTML template ────────────────────────────────────────────────────────
function base(title, body) {
  const yr = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(16,185,129,0.10);">
        <!-- HEADER -->
        <tr><td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:32px 40px;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:#fff;border-radius:14px;line-height:56px;font-size:28px;font-weight:900;color:#10b981;text-align:center;">P</div>
          <p style="margin:12px 0 0;color:#fff;font-size:22px;font-weight:900;letter-spacing:3px;">PRAQEN</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:1px;">Africa's Safest Bitcoin Marketplace</p>
        </td></tr>
        <!-- BODY -->
        <tr><td style="padding:36px 40px 28px;">${body}</td></tr>
        <!-- FOOTER -->
        <tr><td style="background:#F8FAFC;padding:20px 40px;text-align:center;border-top:1px solid #E2E8F0;">
          <p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">Need help? <a href="mailto:hello@praqen.com" style="color:#10b981;font-weight:700;">hello@praqen.com</a></p>
          <p style="margin:0;font-size:11px;color:#CBD5E1;">© ${yr} PRAQEN · Africa's Safest P2P Bitcoin Marketplace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function infoRow(label, value) {
  return `<tr>
    <td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">${label}</td>
    <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">${value}</td>
  </tr>`;
}

function infoBox(rows) {
  return `<div style="background:#F0FAF5;border-radius:10px;padding:20px;margin-bottom:20px;">
    <table width="100%" style="border-collapse:collapse;">${rows}</table>
  </div>`;
}

function ctaButton(text, url) {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;">${text}</a>
  </div>`;
}

function warningBox(msg) {
  return `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;text-align:center;">
    <p style="margin:0;font-size:12px;font-weight:700;color:#92400E;">${msg}</p>
  </div>`;
}

// ── Email HTML builders ───────────────────────────────────────────────────────

function welcomeHtml(name) {
  return base('Welcome to PRAQEN!', `
    <h2 style="color:#10b981;font-size:22px;margin:0 0 8px;">Welcome, ${name}! 🎉</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">You've joined <strong>Africa's safest P2P Bitcoin marketplace</strong>. Your account is ready!</p>
    <div style="background:#F0FAF5;border-left:4px solid #10b981;padding:16px 20px;border-radius:8px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-weight:700;color:#1B4332;">✅ Your next steps:</p>
      <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.9;">
        <li>Verify your email address</li>
        <li>Verify your phone number</li>
        <li>Complete KYC to unlock full trading</li>
        <li>Load your wallet and start trading!</li>
      </ul>
    </div>
    ${ctaButton('🚀 Start Trading Now', 'https://praqen.com/buy-bitcoin')}
    ${warningBox('⚠️ Always trade within PRAQEN — never share your login credentials')}
  `);
}

function verificationHtml(code) {
  return base('Your PRAQEN Verification Code', `
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#334155;text-align:center;">Your Verification Code</p>
    <p style="margin:0 0 28px;font-size:13px;color:#64748B;line-height:1.6;text-align:center;">Use the code below to verify your account. It expires in <strong>10 minutes</strong>.</p>
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:#F0FAF5;border:2px solid #10b981;border-radius:12px;padding:20px 48px;">
        <span style="font-size:42px;font-weight:900;letter-spacing:10px;color:#059669;font-family:'Courier New',monospace;">${code}</span>
      </div>
    </div>
    <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">If you didn't request this, you can safely ignore this email. Never share this code with anyone — PRAQEN will never ask for it.</p>
  `);
}

function loginAlertHtml(name, loginTime) {
  return base('New Login to Your PRAQEN Account', `
    <h2 style="color:#10b981;font-size:20px;margin:0 0 8px;">New Login Detected 🔐</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>, a login was recorded on your account.</p>
    ${infoBox(
      infoRow('Time', loginTime || new Date().toUTCString()) +
      infoRow('Method', 'Email &amp; Password')
    )}
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;">
      <p style="margin:0;font-size:13px;color:#991b1b;"><strong>⚠️ Not you?</strong> Change your password immediately at <a href="https://praqen.com/settings" style="color:#b45309;font-weight:700;">Settings → Security</a></p>
    </div>
  `);
}

function kycApprovedHtml(name) {
  return base('KYC Approved — Full Access Unlocked!', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">✅</div>
      <h2 style="color:#10b981;font-size:22px;margin:8px 0;">KYC Approved!</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Congratulations <strong>${name}</strong>! Your identity has been verified. You now have full access to all PRAQEN features.</p>
    <div style="background:#F0FAF5;border-left:4px solid #10b981;padding:16px 20px;border-radius:8px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-weight:700;color:#1B4332;">🔓 Now Unlocked:</p>
      <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.9;">
        <li>Full market access — buy &amp; sell without limits</li>
        <li>Your verified badge on all offers</li>
        <li>Level 3 trading privileges</li>
        <li>Higher trade volume limits</li>
      </ul>
    </div>
    ${ctaButton('🚀 Start Trading Now', 'https://praqen.com/buy-bitcoin')}
  `);
}

function kycRejectedHtml(name, reason) {
  return base('KYC Verification — Action Required', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">❌</div>
      <h2 style="color:#ef4444;font-size:22px;margin:8px 0;">KYC Not Approved</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>, unfortunately your KYC submission was not approved.</p>
    <div style="background:#FEF2F2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:8px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-weight:700;color:#991b1b;">Reason:</p>
      <p style="margin:0;color:#7f1d1d;font-size:14px;">${reason || 'Documents were unclear or could not be verified.'}</p>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Please re-submit with clearer documents. Accepted: National ID, Passport, Driver's License.</p>
    ${ctaButton('Re-submit KYC →', 'https://praqen.com/settings')}
  `);
}

function tradeConfirmationHtml(name, trade, role) {
  const isBuyer = role === 'buyer';
  const headline = isBuyer ? '💰 Trade Complete — BTC Received!' : '✅ Trade Complete — Payment Confirmed!';
  const detail = isBuyer
    ? `<strong>${parseFloat(trade.amount_btc || 0).toFixed(8)} BTC</strong> has been released to your PRAQEN wallet.`
    : `Payment has been confirmed. Your trade is now complete.`;

  const amountUsd = trade.amount_usd ? `<tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Value (USD)</td><td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">$${parseFloat(trade.amount_usd || 0).toFixed(2)}</td></tr>` : '';

  return base(headline, `
    <h2 style="color:#10b981;font-size:20px;margin:0 0 8px;">${headline}</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! ${detail}</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td><td style="padding:7px 0;text-align:right;"><span style="background:#10b981;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${(trade.trade_ref || trade.id || '').toString().slice(0, 8).toUpperCase()}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Amount (BTC)</td><td style="padding:7px 0;color:#059669;font-size:18px;font-weight:900;text-align:right;">₿ ${parseFloat(trade.amount_btc || 0).toFixed(8)}</td></tr>
      ${amountUsd}
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Your Role</td><td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;text-transform:capitalize;">${role}</td></tr>
    `)}
    ${ctaButton('View Trade Details', `https://praqen.com/trade/${trade.id}`)}
    ${warningBox('🔒 PRAQEN escrow protected every step of this trade')}
  `);
}

function depositAlertHtml(name, amountBtc, txHash) {
  const txRow = txHash ? infoRow('Transaction ID', `<span style="font-size:10px;color:#94A3B8;word-break:break-all;">${txHash}</span>`) : '';
  return base('Bitcoin Deposit Confirmed! 🎉', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">₿</div>
      <h2 style="color:#10b981;font-size:22px;margin:8px 0;">Deposit Confirmed!</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! Your Bitcoin deposit has been confirmed and credited to your PRAQEN wallet.</p>
    ${infoBox(`
      <tr><td style="padding:8px 0;color:#64748B;font-size:13px;font-weight:600;">Amount Received</td><td style="padding:8px 0;color:#059669;font-size:20px;font-weight:900;text-align:right;">₿ ${parseFloat(amountBtc || 0).toFixed(8)}</td></tr>
      ${txRow}
    `)}
    ${ctaButton('View Wallet', 'https://praqen.com/wallet')}
  `);
}

function tradeOpenedHtml(name, trade, role) {
  const isBuyer  = role === 'buyer';
  const headline = isBuyer ? '⚡ Trade Opened — Send Your Payment' : '⚡ New Trade Request Received';
  const detail   = isBuyer
    ? `You have opened a trade and <strong>${parseFloat(trade.amount_btc || 0).toFixed(8)} BTC</strong> is locked safely in escrow. Send your payment now to complete the trade.`
    : `A buyer wants to trade with you. <strong>${parseFloat(trade.amount_btc || 0).toFixed(8)} BTC</strong> is locked in escrow — you'll be notified once payment is sent.`;
  const payDisp = (() => {
    const fmt = n => new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(n||0);
    if (trade.amount_local > 0 && trade.local_currency)
      return `${trade.currency_symbol || ''}${fmt(trade.amount_local)} ${trade.local_currency}`;
    if (trade.amount_usd > 0) return `$${parseFloat(trade.amount_usd).toFixed(2)} USD`;
    return '—';
  })();
  return base(headline, `
    <h2 style="color:#10b981;font-size:20px;margin:0 0 8px;">${headline}</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! ${detail}</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:#10b981;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Amount (BTC)</td>
          <td style="padding:7px 0;color:#059669;font-size:18px;font-weight:900;text-align:right;">₿ ${parseFloat(trade.amount_btc||0).toFixed(8)}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Amount (Fiat)</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;font-weight:700;text-align:right;">${payDisp}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Payment Method</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">${trade.payment_method || 'Mobile Money'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Your Role</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;text-transform:capitalize;">${role}</td></tr>
    `)}
    ${ctaButton('View Trade →', `https://praqen.com/trade/${trade.id}`)}
    ${warningBox('🔒 Bitcoin is secured in PRAQEN escrow until you confirm payment')}
  `);
}

function paymentSentHtml(name, trade) {
  const fmt = n => new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(n||0);
  const payDisp = trade.amount_local > 0 && trade.local_currency
    ? `${trade.currency_symbol || ''}${fmt(trade.amount_local)} ${trade.local_currency}`
    : `$${parseFloat(trade.amount_usd || 0).toFixed(2)} USD`;
  return base('💰 Payment Sent — Release BTC Now', `
    <h2 style="color:#D97706;font-size:20px;margin:0 0 8px;">💰 Buyer Has Sent Payment!</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! The buyer has confirmed payment for your trade. Verify the payment in your account, then release the Bitcoin.</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:#D97706;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">BTC in Escrow</td>
          <td style="padding:7px 0;color:#059669;font-size:18px;font-weight:900;text-align:right;">₿ ${parseFloat(trade.amount_btc||0).toFixed(8)}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Payment Claimed</td>
          <td style="padding:7px 0;color:#D97706;font-size:14px;font-weight:700;text-align:right;">${payDisp}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Via</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">${trade.payment_method || 'Mobile Money'}</td></tr>
    `)}
    <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#92400E;">⚠️ Only release Bitcoin AFTER you confirm the money arrived in your account. Once released it cannot be reversed.</p>
    </div>
    ${ctaButton('✅ Verify & Release BTC', `https://praqen.com/trade/${trade.id}`)}
  `);
}

function tradeCancelledHtml(name, trade, reason) {
  return base('❌ Trade Cancelled', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">❌</div>
      <h2 style="color:#ef4444;font-size:22px;margin:8px 0;">Trade Cancelled</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! The trade below has been cancelled${reason ? ` — <em>${reason}</em>` : ''}. Any BTC locked in escrow has been returned to the seller's wallet.</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Amount (BTC)</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">₿ ${parseFloat(trade.amount_btc||0).toFixed(8)}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Status</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;">CANCELLED</span></td></tr>
    `)}
    <p style="color:#64748B;font-size:13px;line-height:1.6;margin:0 0 20px;">If you believe this was an error or have concerns, please contact our support team immediately.</p>
    ${ctaButton('Browse New Offers', 'https://praqen.com/buy-bitcoin')}
  `);
}

function withdrawalAlertHtml(name, amountBtc, toAddress) {
  return base('Withdrawal Initiated 🔄', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">🔄</div>
      <h2 style="color:#10b981;font-size:22px;margin:8px 0;">Withdrawal Initiated</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! Your withdrawal request has been submitted.</p>
    ${infoBox(`
      <tr><td style="padding:8px 0;color:#64748B;font-size:13px;font-weight:600;">Amount</td><td style="padding:8px 0;color:#059669;font-size:20px;font-weight:900;text-align:right;">₿ ${parseFloat(amountBtc || 0).toFixed(8)}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:12px;font-weight:600;">Destination</td><td style="padding:7px 0;color:#94A3B8;font-size:11px;text-align:right;word-break:break-all;">${toAddress}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Status</td><td style="padding:7px 0;text-align:right;"><span style="background:#F59E0B;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">PENDING</span></td></tr>
    `)}
    <p style="color:#64748B;font-size:13px;margin:0 0 16px;">Withdrawals are processed within 24 hours. You'll receive another email once complete.</p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;">
      <p style="margin:0;font-size:13px;color:#991b1b;"><strong>⚠️ Didn't request this?</strong> Contact us immediately at <a href="mailto:hello@praqen.com" style="color:#b45309;font-weight:700;">hello@praqen.com</a></p>
    </div>
  `);
}

// ── Public API ────────────────────────────────────────────────────────────────

async function sendWelcomeEmail(user) {
  return sendEmail({
    userId:  user.id,
    to:      user.email,
    subject: `Welcome to PRAQEN, ${user.username || 'Trader'}! 🎉`,
    html:    welcomeHtml(user.username || 'Trader'),
    type:    'welcome',
  });
}

async function sendVerificationEmail(email, code, userId) {
  return sendEmail({
    userId,
    to:       email,
    subject:  'Your PRAQEN Verification Code',
    html:     verificationHtml(code),
    type:     'verification',
    metadata: { code_hint: String(code).slice(0, 2) + '****' },
  });
}

async function sendLoginAlertEmail(user) {
  return sendEmail({
    userId:  user.id,
    to:      user.email,
    subject: '🔐 New Login to Your PRAQEN Account',
    html:    loginAlertHtml(user.username || user.email, new Date().toUTCString()),
    type:    'login_alert',
  });
}

async function sendKycApprovedEmail(user) {
  return sendEmail({
    userId:  user.id,
    to:      user.email,
    subject: '✅ KYC Approved — Full Access Unlocked!',
    html:    kycApprovedHtml(user.username || 'Trader'),
    type:    'kyc_approved',
  });
}

async function sendKycRejectedEmail(user, reason) {
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  '❌ KYC Not Approved — Action Required',
    html:     kycRejectedHtml(user.username || 'Trader', reason),
    type:     'kyc_rejected',
    metadata: { reason },
  });
}

async function sendTradeConfirmationEmail(user, trade, role) {
  const subjectBuyer  = `✅ Trade Complete — ₿${parseFloat(trade.amount_btc || 0).toFixed(8)} Received`;
  const subjectSeller = `✅ Trade Complete — Payment Confirmed`;
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  role === 'buyer' ? subjectBuyer : subjectSeller,
    html:     tradeConfirmationHtml(user.username || 'Trader', trade, role),
    type:     'trade_confirmation',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref, role },
  });
}

async function sendDepositAlertEmail(user, amountBtc, txHash) {
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  `🎉 Deposit Confirmed: ₿${parseFloat(amountBtc || 0).toFixed(8)}`,
    html:     depositAlertHtml(user.username || 'Trader', amountBtc, txHash),
    type:     'deposit_alert',
    metadata: { amount_btc: amountBtc, tx_hash: txHash },
  });
}

async function sendWithdrawalAlertEmail(user, amountBtc, toAddress) {
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  `🔄 Withdrawal Initiated: ₿${parseFloat(amountBtc || 0).toFixed(8)}`,
    html:     withdrawalAlertHtml(user.username || 'Trader', amountBtc, toAddress),
    type:     'withdrawal_alert',
    metadata: { amount_btc: amountBtc, destination: toAddress },
  });
}

async function sendTradeOpenedEmail(user, trade, role) {
  const subjectBuyer  = `⚡ Trade Opened — Send Payment to Get ₿${parseFloat(trade.amount_btc||0).toFixed(8)}`;
  const subjectSeller = `⚡ New Trade — ₿${parseFloat(trade.amount_btc||0).toFixed(8)} Locked in Escrow`;
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  role === 'buyer' ? subjectBuyer : subjectSeller,
    html:     tradeOpenedHtml(user.username || 'Trader', trade, role),
    type:     'trade_opened',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref, role },
  });
}

async function sendPaymentSentEmail(sellerUser, trade) {
  return sendEmail({
    userId:   sellerUser.id,
    to:       sellerUser.email,
    subject:  `💰 Payment Sent — Release BTC for Trade #${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}`,
    html:     paymentSentHtml(sellerUser.username || 'Trader', trade),
    type:     'payment_sent',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref },
  });
}

async function sendTradeCancelledEmail(user, trade, reason) {
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  `❌ Trade Cancelled — #${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}`,
    html:     tradeCancelledHtml(user.username || 'Trader', trade, reason),
    type:     'trade_cancelled',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref, reason },
  });
}

async function sendBroadcastToAllUsers(subject, htmlBody, broadcastType = 'broadcast') {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, username')
    .not('email', 'is', null);

  if (error) throw new Error('Failed to fetch users: ' + error.message);

  const targets = (users || []).filter(u => u.email && u.email.trim());
  console.log(`[Broadcast] Sending "${subject}" to ${targets.length} users`);

  let sent = 0, failed = 0;
  for (const user of targets) {
    const result = await sendEmail({
      userId: user.id,
      to:     user.email,
      subject,
      html:   base(subject, htmlBody),
      type:   broadcastType,
    });
    if (result.success) sent++; else failed++;
    await new Promise(r => setTimeout(r, 500));
  }
  return { sent, failed, total: targets.length };
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendLoginAlertEmail,
  sendKycApprovedEmail,
  sendKycRejectedEmail,
  sendTradeOpenedEmail,
  sendPaymentSentEmail,
  sendTradeConfirmationEmail,
  sendTradeCancelledEmail,
  sendDepositAlertEmail,
  sendWithdrawalAlertEmail,
  sendBroadcastToAllUsers,
};
