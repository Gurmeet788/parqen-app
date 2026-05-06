const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmail() {
    console.log('Testing email to kendevdash@gmail.com...');
    
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
    
    try {
        let info = await transporter.sendMail({
            from: '"PRAQEN" <noreply@praqen.com>',
            to: 'kendevdash@gmail.com',
            subject: 'TEST - Please confirm receipt',
            html: '<h1>Test Email</h1><p>If you receive this, Brevo is working!</p>',
        });
        console.log('✅ Test sent! Message ID:', info.messageId);
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

testEmail();