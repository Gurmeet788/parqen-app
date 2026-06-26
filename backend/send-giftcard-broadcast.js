const nodemailer = require('nodemailer');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendBroadcast() {
    console.log('📧 Fetching users from Supabase...');

    const { data: users, error } = await supabase
        .from('users')
        .select('email, username')
        .not('email', 'is', null)
        .neq('email', '');

    if (error) {
        console.error('❌ Supabase error:', error.message);
        return;
    }

    console.log(`✅ Found ${users.length} users with email addresses\n`);

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    // Verify SMTP connection before sending
    try {
        await transporter.verify();
        console.log('✅ SMTP connection verified — Brevo ready\n');
    } catch (verifyErr) {
        console.error('❌ SMTP connection failed:', verifyErr.message);
        return;
    }

    const subject = '🎁 iTunes & Apple Gift Cards - Top Vendors Active on PRAQEN!';
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>iTunes & Apple Gift Cards on PRAQEN</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 12px;">
        <h1 style="margin: 0;">🎁 iTunes & Apple Gift Cards</h1>
        <p style="margin: 10px 0 0;">Top Vendors Active Now!</p>
    </div>

    <div style="background: #f9fafb; padding: 30px; border-radius: 12px; margin-top: 20px;">
        <p style="font-size: 18px;"><strong>WOW! 🎉</strong></p>
        <p>We have a <strong>NEW GIFT CARD TRADER</strong> on PRAQEN!</p>

        <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>🍎 APPLE / iTUNES CARDS</strong><br>
            🇻🇳 Trader: <strong>kingkong79</strong> (from Vietnam)</p>
        </div>

        <h3>🎁 WHY TRADE GIFT CARDS WITH US?</h3>
        <ul>
            <li>✅ Best rates for iTunes & Apple Gift Cards</li>
            <li>✅ Fast escrow-protected trades</li>
            <li>✅ Instant BTC payout</li>
            <li>✅ Trusted Vietnamese vendor</li>
        </ul>

        <div style="background: #10b981; color: white; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <strong>🔥 WHAT YOU NEED TO DO NOW:</strong><br>
            • GO TO MARKETPLACE & SELL YOUR CARD NOW!<br>
            • CREATE OFFERS IN BUY AND SELL MARKET<br>
            • TOP VENDORS ARE ACTIVE AND WAITING!
        </div>

        <h3>💰 SELL YOUR iTUNES/APPLE GIFT CARDS:</h3>
        <ul>
            <li>US iTunes Cards</li>
            <li>Apple Store Gift Cards</li>
            <li>iTunes Codes</li>
        </ul>

        <h3>👉 CREATE YOUR OFFER NOW:</h3>
        <p>Go to <strong>Gift Card Marketplace → Create Offer</strong></p>

        <h3>👉 BUY BITCOIN:</h3>
        <p>Top vendors are active - best rates worldwide!</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="https://praqen.com/gift-cards" style="background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block;">
                🎁 SELL YOUR GIFT CARDS NOW →
            </a>
        </div>

        <p><strong>🌍 The best place to trade your gift cards is PRAQEN!</strong></p>

        <hr style="margin: 20px 0;">
        <p style="color: #666; font-size: 12px; text-align: center;">Start trading today! 🚀<br>
        © 2026 PRAQEN - Trade safely</p>
    </div>
</body>
</html>`;

    let sent = 0;
    let failed = 0;
    const failedList = [];

    for (const user of users) {
        if (!user.email || !user.email.includes('@')) {
            console.log(`⚠️  Skipping invalid email: ${user.email}`);
            failed++;
            continue;
        }
        try {
            await transporter.sendMail({
                from: '"PRAQEN Team" <noreply@praqen.com>',
                to: user.email,
                subject,
                html,
            });
            sent++;
            console.log(`✅ ${sent}/${users.length} → ${user.email} (${user.username || 'unknown'})`);
        } catch (err) {
            failed++;
            failedList.push({ email: user.email, reason: err.message });
            console.error(`❌ Failed → ${user.email}: ${err.message}`);
        }
        // 300ms delay between sends — Brevo rate limit safe
        await new Promise(r => setTimeout(r, 300));
    }

    console.log('\n══════════════════════════════════');
    console.log(`📊 BROADCAST COMPLETE`);
    console.log(`   ✅ Sent:   ${sent}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📧 Total:  ${users.length}`);
    if (failedList.length > 0) {
        console.log('\n❌ Failed addresses:');
        failedList.forEach(f => console.log(`   - ${f.email}: ${f.reason}`));
    }
    console.log('══════════════════════════════════\n');
}

sendBroadcast();
