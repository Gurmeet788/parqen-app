// ============================================================
// PRAQEN Broadcast Email Script
// Run from backend folder: node send-broadcast.js
// ============================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// ── Config ───────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Brevo SMTP — primary bulk sender (no sandbox restriction)
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_ADDRESS = `PRAQEN <${process.env.SMTP_FROM || process.env.EMAIL_USER}>`;

const SUBJECT = '⚠️ Keep Your Offers Active — Verify KYC & Trade on PRAQEN!';

const buildHTML = (name) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Keep Your Offers Active — PRAQEN</title>
</head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(27,67,50,0.10);">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);padding:36px 32px 28px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.12);border-radius:50%;padding:12px 18px;margin-bottom:12px;">
              <span style="font-size:34px;">₿</span>
            </div>
            <h1 style="margin:0 0 6px;font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">PRAQEN</h1>
            <p style="margin:0;font-size:14px;color:#A7F3D0;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">P2P Bitcoin Trading Platform</p>
          </td>
        </tr>

        <!-- ── ALERT BANNER ── -->
        <tr>
          <td style="background:linear-gradient(90deg,#FEF3C7,#FDE68A);padding:14px 32px;text-align:center;border-bottom:2px solid #FCD34D;">
            <p style="margin:0;font-size:15px;font-weight:800;color:#92400E;">
              ⚠️ &nbsp;Action Required — Keep Your Account Active
            </p>
          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="padding:32px 32px 8px;">

            <h1 style="font-size:24px;font-weight:900;color:#1B4332;margin:0 0 6px;text-align:center;">
              ⚠️ Important: Keep Your Offers Active!
            </h1>
            <p style="margin:0 0 28px;color:#64748B;font-size:15px;text-align:center;line-height:1.6;">
              Dear <strong style="color:#1B4332;">${name}</strong>, your activity matters.<br/>Inactive offers will be deactivated automatically.
            </p>

            <!-- KYC Card -->
            <div style="background:linear-gradient(135deg,#FFF7ED,#FFFBEB);border-radius:14px;padding:22px 24px;margin-bottom:14px;border:2px solid #FDE68A;">
              <p style="margin:0 0 8px;font-size:17px;font-weight:900;color:#92400E;">🔒 Verify Your KYC Now</p>
              <p style="margin:0;font-size:14px;color:#78350F;line-height:1.7;">
                Complete your identity verification to unlock unlimited trading and keep your badge active.<br/>
                Go to <strong>Settings → Identity Verification</strong> to get started.
              </p>
            </div>

            <!-- Stay Active Card -->
            <div style="background:linear-gradient(135deg,#F0FDF4,#DCFCE7);border-radius:14px;padding:22px 24px;margin-bottom:14px;border:2px solid #86EFAC;">
              <p style="margin:0 0 8px;font-size:17px;font-weight:900;color:#166534;">🚀 Keep Trading — Keep Your Badge</p>
              <p style="margin:0;font-size:14px;color:#15803D;line-height:1.7;">
                Active traders keep their badges, grow their feedback score, and appear at the top of the marketplace.<br/>
                <strong>Inactive offers will be paused.</strong> Stay active to stay on top!
              </p>
            </div>

            <!-- Promotions Card -->
            <div style="background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-radius:14px;padding:22px 24px;margin-bottom:14px;border:2px solid #BFDBFE;">
              <p style="margin:0 0 8px;font-size:17px;font-weight:900;color:#1E40AF;">🎁 New Features & Promotions Coming!</p>
              <p style="margin:0;font-size:14px;color:#1E40AF;line-height:1.7;">
                We're bringing exciting new features and exclusive promotions to PRAQEN very soon.<br/>
                <strong>Stay active to be the first to benefit!</strong>
              </p>
            </div>

            <!-- Steps -->
            <div style="background:#F8FAFC;border-radius:14px;padding:20px 24px;margin-bottom:24px;border:1.5px solid #E2E8F0;">
              <p style="margin:0 0 14px;font-size:15px;font-weight:900;color:#1B4332;">✅ What to do right now:</p>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding:6px 0;">
                    <span style="display:inline-block;background:#1B4332;color:#fff;font-size:11px;font-weight:900;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;margin-right:10px;">1</span>
                    <span style="font-size:14px;color:#334155;font-weight:600;">Update your active offers in the marketplace</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="display:inline-block;background:#2D6A4F;color:#fff;font-size:11px;font-weight:900;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;margin-right:10px;">2</span>
                    <span style="font-size:14px;color:#334155;font-weight:600;">Complete KYC — Email ✓ Phone ✓ ID Verification</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="display:inline-block;background:#F4A422;color:#fff;font-size:11px;font-weight:900;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;margin-right:10px;">3</span>
                    <span style="font-size:14px;color:#334155;font-weight:600;">Start a trade and grow your reputation score</span>
                  </td>
                </tr>
              </table>
            </div>

            <!-- CTA Button -->
            <div style="text-align:center;margin:8px 0 28px;">
              <a href="https://praqen.com/trade"
                style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#fff;text-decoration:none;font-size:16px;font-weight:900;padding:16px 44px;border-radius:12px;letter-spacing:0.5px;box-shadow:0 4px 14px rgba(27,67,50,0.35);">
                🚀 &nbsp;Start Trading Now
              </a>
            </div>

            <p style="text-align:center;font-size:13px;color:#94A3B8;margin:0 0 8px;">
              Have questions? Reply to this email or visit our support page.
            </p>

          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:#F8FAFC;padding:20px 32px;border-top:1.5px solid #E2E8F0;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#1B4332;">— The PRAQEN Team 💙</p>
            <p style="margin:0;font-size:11px;color:#CBD5E1;">
              You're receiving this because you have an account on PRAQEN.<br/>
              © ${new Date().getFullYear()} PRAQEN. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;

const buildText = (name) => `Hi ${name},

⚠️ IMPORTANT: Keep Your Offers Active!

Dear PRAQEN Trader, your activity matters. Inactive offers will be deactivated.

🔒 VERIFY YOUR KYC NOW
Complete your identity verification to unlock unlimited trading and keep your badge active.
Go to Settings → Identity Verification.

🚀 KEEP TRADING — KEEP YOUR BADGE
Active traders keep their badges and feedback growing. Inactive offers will be paused. Stay active to stay on top!

🎁 NEW FEATURES & PROMOTIONS COMING!
We're bringing exciting new features and promotions to PRAQEN. Stay active to be the first to benefit!

✅ What to do right now:
1. Update your active offers in the marketplace
2. Complete KYC — Email ✓ Phone ✓ ID Verification
3. Start a trade and grow your reputation score

👉 Start Trading Now: https://praqen.com/trade

— The PRAQEN Team 💙`;

// ── Delay helper ─────────────────────────────────────────────
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('🚀 PRAQEN Broadcast Email — Starting...\n');

  try {
    await transporter.verify();
    console.log(`✅ Brevo SMTP connected (from: ${FROM_ADDRESS})\n`);
  } catch (err) {
    console.error('❌ Brevo SMTP connection failed:', err.message);
    process.exit(1);
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, full_name, username')
    .not('email', 'is', null);

  if (error) {
    console.error('❌ Failed to fetch users from Supabase:', error.message);
    process.exit(1);
  }

  const targets = (users || []).filter((u) => u.email && u.email.trim() !== '');
  console.log(`📋 Found ${targets.length} users with email addresses\n`);

  let sent = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < targets.length; i++) {
    const user = targets[i];
    const name = user.full_name || user.username || 'PRAQEN Trader';
    const num  = `[${i + 1}/${targets.length}]`;

    try {
      await transporter.sendMail({
        from:    FROM_ADDRESS,
        to:      user.email,
        subject: SUBJECT,
        text:    buildText(name),
        html:    buildHTML(name),
      });

      console.log(`✅ ${num} Sent → ${user.email} (${name})`);
      sent++;
    } catch (err) {
      console.error(`❌ ${num} Failed → ${user.email}: ${err.message}`);
      failed++;
      failures.push({ email: user.email, error: err.message });
    }

    if (i < targets.length - 1) await delay(500);
  }

  console.log('\n══════════════════════════════════════');
  console.log('📊 BROADCAST COMPLETE — SUMMARY');
  console.log('══════════════════════════════════════');
  console.log(`✅ Successfully sent : ${sent}`);
  console.log(`❌ Failed            : ${failed}`);
  console.log(`📬 Total targeted    : ${targets.length}`);

  if (failures.length > 0) {
    console.log('\n⚠️  Failed emails:');
    failures.forEach((f) => console.log(`   • ${f.email} → ${f.error}`));
  }

  console.log('\n✅ Done!');
}

main().catch((err) => {
  console.error('💥 Unexpected error:', err);
  process.exit(1);
});
