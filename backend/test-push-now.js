// Quick test — sends a REAL push notification to ALL subscribers
// Run with: node test-push-now.js
require('dotenv').config();
const axios = require('axios');

const APP_ID  = process.env.ONESIGNAL_APP_ID;
const API_KEY = process.env.ONESIGNAL_REST_API_KEY;

console.log('🔍 Checking config...');
console.log('   App ID :', APP_ID  ? `✅ ${APP_ID}`  : '❌ MISSING');
console.log('   API Key:', API_KEY ? `✅ ${API_KEY.slice(0,20)}...` : '❌ MISSING');

if (!APP_ID || !API_KEY) {
  console.error('\n❌ Keys missing from .env — cannot send.');
  process.exit(1);
}

async function sendTest() {
  console.log('\n📤 Sending test push notification to ALL subscribers...\n');

  try {
    const res = await axios.post(
      'https://onesignal.com/api/v1/notifications',
      {
        app_id:            APP_ID,
        headings:          { en: '🔔 PRAQEN Push Test' },
        contents:          { en: 'Push notifications are working! Trade alerts will arrive here.' },
        included_segments: ['All'],
        url:               'http://localhost:3000',
      },
      {
        headers: {
          Authorization:  `Key ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const { id, recipients, errors } = res.data || {};

    if (recipients === 0) {
      console.log('⚠️  Notification sent BUT 0 recipients received it.');
      console.log('   This means no browser has subscribed/opted-in yet.');
      console.log('\n👉 Fix: Open http://localhost:3000 in Chrome');
      console.log('   Click the lock icon → Set Notifications to Allow');
      console.log('   Refresh the page, then run this script again.\n');
    } else {
      console.log(`✅ SUCCESS! Push sent to ${recipients} device(s)!`);
      console.log(`   Notification ID: ${id}`);
      console.log('\n🎉 Check your Mac — you should see a popup notification!');
    }

    if (errors && errors.length > 0) {
      console.log('\n⚠️  Errors:', JSON.stringify(errors));
    }

  } catch (e) {
    const detail = e.response?.data || e.message;
    console.error('\n❌ API Error:', JSON.stringify(detail, null, 2));
    if (e.response?.status === 401) {
      console.log('\n💡 REST API Key is wrong. Go to OneSignal → Settings → Keys & IDs → copy REST API Key again.');
    }
  }
}

sendTest();
