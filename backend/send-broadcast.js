// ============================================================
// PRAQEN Broadcast Email Script
// Run from backend folder: node send-broadcast.js
// ============================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// ── Config ──────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Use Resend API (more reliable, no daily Gmail limits)
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_ADDRESS = process.env.RESEND_FROM || `PRAQEN Team <${process.env.EMAIL_USER}>`;

// Fallback: Gmail SMTP via nodemailer (only if Resend key missing)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const SUBJECT = '💙 You Matter to PRAQEN! Market is OPEN!';

const HTML_BODY = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PRAQEN - You Matter to Us!</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0;">💙 PRAQEN</h1>
        <p style="margin: 10px 0 0;">You Matter to Us!</p>
    </div>
    <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 18px;"><strong>Hello PRAQEN User! 💙</strong></p>
        <p><strong>YOU ARE IMPORTANT TO US!</strong></p>

        <p>Please take a moment to:</p>
        <ul>
            <li>✅ Verify your phone number</li>
            <li>✅ Complete KYC verification</li>
        </ul>

        <p><strong>🔓 This unlocks:</strong></p>
        <ul>
            <li>✓ Full market access</li>
            <li>✓ Your earned badge</li>
            <li>✓ Level 3 benefits</li>
        </ul>

        <div style="background: #10b981; color: white; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <strong>📊 THE MARKET IS FULLY OPEN!</strong><br>
            Buyers and sellers are waiting for YOU!
        </div>

        <p>👉 Create your offers<br>
        👉 Load your PRAQEN wallet<br>
        👉 Start trading today!</p>

        <p>💡 Share suggestions via the 💡 button</p>

        <hr style="margin: 20px 0;">
        <p style="color: #6b7280; font-size: 12px; text-align: center;">Trade safely on PRAQEN! 🚀</p>
    </div>
</body>
</html>`;

const TEXT_BODY = `Hello PRAQEN User! 💙

YOU ARE IMPORTANT TO US!

Please take a moment to:
✅ Verify your phone number
✅ Complete KYC verification

🔓 This unlocks:
✓ Full market access
✓ Your earned badge
✓ Level 3 benefits

📊 THE MARKET IS FULLY OPEN!
Buyers and sellers are waiting for YOU!

👉 Create your offers
👉 Load your PRAQEN wallet
👉 Start trading today!

💡 Share suggestions via the 💡 button

Trade safely on PRAQEN! 🚀`;

// ── Delay helper ─────────────────────────────────────────────
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('🚀 PRAQEN Broadcast Email — Starting...\n');

  // 1. Check which sender to use
  const useResend = !!process.env.RESEND_API_KEY;
  if (useResend) {
    console.log(`✅ Using Resend API (from: ${FROM_ADDRESS})\n`);
  } else {
    try {
      await transporter.verify();
      console.log('✅ Gmail SMTP connection verified\n');
    } catch (err) {
      console.error('❌ Gmail SMTP failed:', err.message);
      console.error('   → Generate a new App Password at: https://myaccount.google.com/apppasswords');
      process.exit(1);
    }
  }

  // 2. Fetch all users with emails
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, full_name, username')
    .not('email', 'is', null);

  if (error) {
    console.error('❌ Failed to fetch users from Supabase:', error.message);
    process.exit(1);
  }

  if (!users || users.length === 0) {
    console.log('⚠️  No users found in the users table.');
    process.exit(0);
  }

  // Filter out empty emails
  const targets = users.filter((u) => u.email && u.email.trim() !== '');
  console.log(`📋 Found ${targets.length} users with email addresses\n`);

  // 3. Send emails one by one
  let sent = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < targets.length; i++) {
    const user = targets[i];
    const name = user.full_name || user.username || 'PRAQEN User';
    const num = `[${i + 1}/${targets.length}]`;

    try {
      if (useResend) {
        const { error: sendErr } = await resend.emails.send({
          from: FROM_ADDRESS,
          to: user.email,
          subject: SUBJECT,
          text: TEXT_BODY,
          html: HTML_BODY,
        });
        if (sendErr) throw new Error(sendErr.message);
      } else {
        await transporter.sendMail({
          from: `PRAQEN Team <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: SUBJECT,
          text: TEXT_BODY,
          html: HTML_BODY,
        });
      }

      console.log(`✅ ${num} Sent → ${user.email} (${name})`);
      sent++;
    } catch (err) {
      console.error(`❌ ${num} Failed → ${user.email}: ${err.message}`);
      failed++;
      failures.push({ email: user.email, error: err.message });
    }

    // Small delay between sends
    if (i < targets.length - 1) {
      await delay(500);
    }
  }

  // 4. Summary
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
