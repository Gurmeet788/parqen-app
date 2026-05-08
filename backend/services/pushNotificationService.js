// OneSignal Web Push service for PRAQEN trade alerts
const axios = require('axios');

const APP_ID  = process.env.ONESIGNAL_APP_ID;
const API_KEY = process.env.ONESIGNAL_REST_API_KEY;

function isConfigured() {
  return APP_ID && API_KEY && API_KEY !== 'your_rest_api_key_from_onesignal';
}

async function send({ userIds, title, message, url }) {
  if (!isConfigured()) {
    console.error('[Push] OneSignal not configured — ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY missing');
    return;
  }
  if (!userIds || userIds.length === 0) {
    console.error('[Push] No userIds provided — skipping');
    return;
  }

  const body = {
    app_id: APP_ID,
    target_channel: 'push',
    headings: { en: title },
    contents: { en: message },
    include_aliases: { external_id: userIds.map(String) },
    url: url || 'https://praqen.com',
  };

  console.error(`[Push] Sending to external_id(s): ${userIds.join(',')} | title: ${title}`);

  try {
    const response = await axios.post('https://onesignal.com/api/v1/notifications', body, {
      headers: {
        Authorization: `Key ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    });
    const { id, recipients, errors } = response.data || {};
    if (recipients === 0) {
      console.error(`[Push] 0 recipients — user(s) ${userIds.join(',')} have no linked push subscription. Call OS.login(userId) on the frontend after login AND after page refresh.`);
    } else {
      console.error(`[Push] Delivered — id: ${id} | recipients: ${recipients}`);
    }
    if (errors) console.error('[Push] OneSignal errors field:', JSON.stringify(errors));
    return response.data;
  } catch (e) {
    const detail = e.response?.data || e.message;
    console.error('[Push] OneSignal API error:', JSON.stringify(detail));
  }
}

// ── Notification titles & messages ───────────────────────────────────────────

function getTitle(type) {
  switch (type) {
    case 'new_trade':       return '💰 New Trade Request!';
    case 'payment_sent':    return '💵 Payment Sent!';
    case 'btc_released':    return '✅ Bitcoin Released!';
    case 'trade_cancelled': return '❌ Trade Cancelled';
    case 'dispute_opened':  return '⚠️ Dispute Opened';
    case 'dispute_resolved':return '🏁 Dispute Resolved';
    case 'kyc_approved':    return '🪪 KYC Approved!';
    case 'phone_verified':  return '📱 Phone Verified!';
    default:                return 'PRAQEN Alert';
  }
}

function getMessage(trade, type) {
  const ref = trade?.trade_ref ? `#${trade.trade_ref.slice(0,8).toUpperCase()}` : '';
  const btc  = trade?.amount_btc ? `${parseFloat(trade.amount_btc).toFixed(6)} BTC` : 'BTC';
  switch (type) {
    case 'new_trade':
      return `Someone wants to trade ${btc} with you. Tap to respond.`;
    case 'payment_sent':
      return `Payment sent for trade ${ref}. Please verify and release Bitcoin.`;
    case 'btc_released':
      return `Trade ${ref} complete! ${btc} has been released to your wallet.`;
    case 'trade_cancelled':
      return `Trade ${ref} has been cancelled. Any locked BTC has been returned.`;
    case 'dispute_opened':
      return `A dispute was opened for trade ${ref}. A moderator will review it.`;
    case 'dispute_resolved':
      return `Trade ${ref} dispute has been resolved.`;
    case 'kyc_approved':
      return 'Your identity has been verified! Your trade limits have been upgraded.';
    case 'phone_verified':
      return 'Your phone number has been verified! You can now trade with higher limits.';
    default:
      return `Update on your PRAQEN trade ${ref}`;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a push notification to one or more users.
 * @param {string|string[]} userId  - One or multiple user IDs
 * @param {object}          trade   - Trade object (can be null for system alerts)
 * @param {string}          type    - Notification type key
 */
async function sendTradeAlert(userId, trade, type) {
  const ids = Array.isArray(userId) ? userId : [userId];
  const tradeId = trade?.id || '';
  await send({
    userIds: ids.filter(Boolean),
    title:   getTitle(type),
    message: getMessage(trade, type),
    url: tradeId ? `https://praqen.com/trade/${tradeId}` : 'https://praqen.com',
  });
}

async function sendSystemAlert(userId, title, message, url) {
  await send({
    userIds: [userId].filter(Boolean),
    title,
    message,
    url: url || 'https://praqen.com',
  });
}

module.exports = { sendTradeAlert, sendSystemAlert };
