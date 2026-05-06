const nodemailer = require('nodemailer');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendBroadcast() {
    console.log('📧 Sending emails via Brevo...');
    
    const { data: users, error } = await supabase
        .from('users')
        .select('email, username')
        .not('email', 'is', null)
        .eq('account_status', 'active');
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    console.log(`Found ${users.length} users\n`);
    
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
    
    const subject = '💙 You Matter to PRAQEN! Market is OPEN!';
    const html = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 12px;"><h1>💙 PRAQEN</h1><p>You Matter to Us!</p></div><div style="background: #f9fafb; padding: 30px; border-radius: 12px; margin-top: 20px;"><p><strong>Hello PRAQEN User! 💙</strong></p><p><strong>YOU ARE IMPORTANT TO US!</strong></p><p>Please take a moment to:</p><ul><li>✅ Verify your phone number</li><li>✅ Complete KYC verification</li></ul><p><strong>🔓 This unlocks:</strong></p><ul><li>✓ Full market access</li><li>✓ Your earned badge</li><li>✓ Level 3 benefits</li></ul><div style="background: #10b981; color: white; padding: 15px; text-align: center; border-radius: 8px;"><strong>📊 THE MARKET IS FULLY OPEN!</strong><br>Buyers and sellers are waiting for YOU!</div><p>👉 Create your offers<br>👉 Load your PRAQEN wallet<br>👉 Start trading today!</p><p>💡 Share suggestions via the 💡 button</p><hr><p style="color: #666; font-size: 12px; text-align: center;">Trade safely on PRAQEN! 🚀</p></div></div>';
    
    let sent = 0;
    let failed = 0;
    
    for (const user of users) {
        try {
            await transporter.sendMail({
                from: '"PRAQEN" <noreply@praqen.com>',
                to: user.email,
                subject: subject,
                html: html,
            });
            sent++;
            console.log(`✅ ${sent}/${users.length} - ${user.email}`);
        } catch (err) {
            failed++;
            console.error(`❌ Failed - ${user.email}:`, err.message);
        }
        await new Promise(r => setTimeout(r, 200));
    }
    console.log(`\n📊 Complete! Sent: ${sent}, Failed: ${failed}`);
}

sendBroadcast();