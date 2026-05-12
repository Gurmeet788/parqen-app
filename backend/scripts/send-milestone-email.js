/**
 * PRAQEN — 500 Users Milestone Broadcast
 * Run: node scripts/send-milestone-email.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const emailService = require('../services/emailService');

const SUBJECT = '🎉 500 USERS ACROSS AFRICA! BIG WIN! 🎉';

const HTML_BODY = `
  <!-- Hero celebration banner -->
  <div style="text-align:center;margin-bottom:28px;">
    <div style="font-size:64px;line-height:1;margin-bottom:12px;">🎉🏆🎉</div>
    <h1 style="margin:0 0 6px;font-size:28px;font-weight:900;color:#059669;letter-spacing:-0.5px;">
      WE HIT 500 USERS!
    </h1>
    <p style="margin:0;font-size:15px;color:#475569;font-weight:600;">
      Across Africa in just <strong style="color:#D97706;">2 WEEKS</strong> — This is BIG! 🚀
    </p>
  </div>

  <!-- Country flags row -->
  <div style="text-align:center;font-size:28px;letter-spacing:4px;margin-bottom:24px;">
    🇿🇦🇳🇬🇬🇭🇰🇪🇹🇿🇺🇬🇨🇲🇸🇳
  </div>

  <!-- Greeting -->
  <p style="color:#1E293B;font-size:15px;line-height:1.8;margin:0 0 20px;">
    Dear <strong>PRAQEN Trader</strong>,
  </p>
  <p style="color:#334155;font-size:15px;line-height:1.8;margin:0 0 24px;">
    <strong>WOW! What an amazing milestone!</strong> 🎉<br>
    We have just hit <strong style="color:#059669;font-size:17px;">500 USERS across Africa</strong> in just <strong>2 weeks</strong> since our Africa launch!
    This is a <strong>BIG WIN</strong> for all of us!
  </p>

  <!-- Thank you highlight box -->
  <div style="background:linear-gradient(135deg,#F0FDF4,#DCFCE7);border:2px solid #86EFAC;border-radius:14px;padding:22px 28px;margin-bottom:28px;text-align:center;">
    <div style="font-size:40px;margin-bottom:8px;">🙌</div>
    <p style="margin:0;font-size:18px;font-weight:900;color:#166534;">
      THANK YOU for being part of this incredible journey!
    </p>
    <p style="margin:8px 0 0;font-size:13px;color:#15803D;font-weight:600;">
      You are one of the first 500 traders shaping Africa's Bitcoin future.
    </p>
  </div>

  <!-- What to do now -->
  <div style="background:#F8FAFC;border-radius:12px;padding:22px 28px;margin-bottom:24px;">
    <p style="margin:0 0 14px;font-size:15px;font-weight:900;color:#1E293B;text-transform:uppercase;letter-spacing:1px;">
      🔥 WHAT TO DO NOW:
    </p>

    <div style="display:flex;align-items:flex-start;margin-bottom:14px;">
      <span style="font-size:22px;margin-right:12px;flex-shrink:0;">✅</span>
      <div>
        <p style="margin:0;font-size:14px;font-weight:800;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">CREATE OFFERS in the marketplace</p>
        <p style="margin:3px 0 0;font-size:13px;color:#64748B;">List your Bitcoin or let buyers know you're ready to trade</p>
      </div>
    </div>

    <div style="display:flex;align-items:flex-start;margin-bottom:14px;">
      <span style="font-size:22px;margin-right:12px;flex-shrink:0;">✅</span>
      <div>
        <p style="margin:0;font-size:14px;font-weight:800;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">LOAD YOUR WALLET</p>
        <p style="margin:3px 0 0;font-size:13px;color:#64748B;">Deposit BTC and be ready for instant trades</p>
      </div>
    </div>

    <div style="display:flex;align-items:flex-start;">
      <span style="font-size:22px;margin-right:12px;flex-shrink:0;">✅</span>
      <div>
        <p style="margin:0;font-size:14px;font-weight:800;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">START TRADING</p>
        <p style="margin:3px 0 0;font-size:13px;color:#64748B;">Buy and sell with verified traders across Africa</p>
      </div>
    </div>
  </div>

  <!-- Urgency message -->
  <div style="background:linear-gradient(135deg,#FFF7ED,#FEF3C7);border:1px solid #FDE68A;border-radius:10px;padding:16px 20px;margin-bottom:28px;text-align:center;">
    <p style="margin:0;font-size:14px;font-weight:700;color:#92400E;">
      ⚡ The market is growing FAST! Don't miss out on trading opportunities.<br>
      <span style="color:#D97706;">Every user should create offers so we can trade together!</span>
    </p>
  </div>

  <!-- CTA button -->
  <div style="text-align:center;margin:28px 0;">
    <a href="https://praqen.com/marketplace"
       style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;font-size:16px;font-weight:800;padding:16px 44px;border-radius:12px;letter-spacing:0.5px;box-shadow:0 4px 16px rgba(16,185,129,0.35);">
      🚀 GO TO MARKETPLACE
    </a>
  </div>

  <!-- Sign off -->
  <p style="color:#334155;font-size:15px;line-height:1.8;margin:0 0 6px;text-align:center;">
    Let's keep building the <strong>biggest P2P trading community in Africa!</strong>
  </p>

  <p style="color:#059669;font-size:15px;font-weight:800;text-align:center;margin:0 0 24px;">
    - The PRAQEN Team 💙
  </p>

  <!-- Hashtag footer -->
  <div style="text-align:center;border-top:1px solid #E2E8F0;padding-top:16px;">
    <p style="margin:0;font-size:12px;color:#94A3B8;font-weight:600;letter-spacing:1px;">
      #PRAQEN &nbsp;•&nbsp; #500Users &nbsp;•&nbsp; #AfricaRising 🌍
    </p>
  </div>
`;

async function main() {
  console.log('\n🚀 PRAQEN Milestone Email Broadcast');
  console.log('====================================');
  console.log(`📧 Subject: ${SUBJECT}`);
  console.log('⏳ Fetching all users and sending...\n');

  try {
    const result = await emailService.sendBroadcastToAllUsers(SUBJECT, HTML_BODY, 'milestone_500_users');
    console.log('\n✅ BROADCAST COMPLETE');
    console.log(`   Sent:   ${result.sent}`);
    console.log(`   Failed: ${result.failed}`);
    console.log(`   Total:  ${result.total}`);
    if (result.failed > 0) {
      console.log(`\n⚠️  ${result.failed} failed — check server logs for details`);
    }
  } catch (err) {
    console.error('\n❌ Broadcast failed:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
