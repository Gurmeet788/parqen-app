// test-push-notifications.js - Test script to verify OneSignal payloads
const axios = require('axios');

// Mock environment variables so the check passes
process.env.ONESIGNAL_APP_ID = 'test-app-id-12345';
process.env.ONESIGNAL_REST_API_KEY = 'test-rest-key-54321';

// Intercept axios.post to capture and print what would be sent to OneSignal
const capturedRequests = [];
const originalPost = axios.post;
axios.post = async function(url, data, config) {
  if (url.includes('onesignal.com')) {
    capturedRequests.push({ url, data, config });
    return {
      data: {
        id: 'mock-notification-id-999',
        recipients: 1
      }
    };
  }
  return originalPost.apply(this, arguments);
};

const { sendTradeAlert, sendSystemAlert } = require('./services/pushNotificationService');

async function runTests() {
  console.log('🧪 Starting Push Notification Payload Tests...\n');

  // Test 1: New Trade Alert
  const mockTrade = {
    id: 'trade-uuid-111',
    trade_ref: 'PRAQ-ABCD1234',
    amount_btc: '0.00250000'
  };
  await sendTradeAlert('seller-user-id', mockTrade, 'new_trade');

  // Test 2: Dispute Opened Alert
  await sendTradeAlert(['buyer-id', 'seller-id'], mockTrade, 'dispute_opened');

  // Test 3: New Chat Message Alert
  await sendSystemAlert(
    'recipient-id',
    '💬 New Message in Trade #ABCD1234',
    'John: Hello, is anyone here?',
    'https://praqen.com/trade/trade-uuid-111'
  );

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Mock Tests Completed. Captured ${capturedRequests.length} OneSignal payloads:\n`);

  capturedRequests.forEach((req, idx) => {
    console.log(`📦 Payload #${idx + 1} (${req.data.headings?.en || 'Alert'}):`);
    console.log(JSON.stringify(req.data, null, 2));
    console.log(`🔑 Auth Header: ${req.config?.headers?.Authorization ? '✅ Set correctly' : '❌ Missing'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
});
