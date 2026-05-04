// services/depositMonitor.js
// PRAQEN — Automatic Bitcoin Deposit Monitor
// Polls every 5 minutes for new deposits to ALL user wallet addresses.
// When a deposit is confirmed:
//   1. Updates user_balances.balance_btc
//   2. Updates user_wallets.balance_btc
//   3. Inserts into wallet_transactions
//   4. Creates in-app notification
//   5. Sends SMS via Twilio
//   6. Sends email via Nodemailer

require('dotenv').config();
const axios      = require('axios');
const nodemailer = require('nodemailer');
const { updateOfferStatus } = require('./offerStatusService');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS    = 5 * 60 * 1000;  // 5 minutes
const MIN_CONFIRMATIONS   = 1;               // 1 block confirmation = safe to credit
const DUST_THRESHOLD_SATS = 546;             // ignore sub-dust outputs

// ── Email transporter (Gmail) ─────────────────────────────────────────────────
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Twilio client (lazy init — won't crash if creds are missing) ──────────────
let twilioClient = null;
try {
  if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
    twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  }
} catch (e) {
  console.warn('[DepositMonitor] Twilio unavailable:', e.message);
}

// ── Email HTML template for deposit notification ──────────────────────────────
function depositEmailHtml(username, depositBTC, newBalance, txid) {
  const explorerUrl = `https://mempool.space/tx/${txid}`;
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:900;color:#fff;letter-spacing:2px;">PRA<span style="color:#F4A422;">QEN</span></p>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.65);">Africa's P2P Bitcoin Platform</p>
          </td>
        </tr>

        <!-- Green success bar -->
        <tr>
          <td style="background:#10B981;padding:14px 32px;text-align:center;">
            <p style="margin:0;font-size:15px;font-weight:800;color:#fff;letter-spacing:0.5px;">
              ₿ Bitcoin Deposit Confirmed
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#374151;">Hi <strong>${username}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">
              Great news — your Bitcoin deposit has been confirmed on the blockchain and credited to your PRAQEN wallet.
            </p>

            <!-- Amount box -->
            <div style="background:#F0FAF5;border:2px solid #2D6A4F;border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:1px;">Amount Received</p>
              <p style="margin:0;font-size:32px;font-weight:900;color:#1B4332;">₿ ${depositBTC.toFixed(8)}</p>
              <p style="margin:8px 0 0;font-size:13px;color:#2D6A4F;font-weight:600;">New wallet balance: ₿ ${newBalance.toFixed(8)}</p>
            </div>

            <!-- Transaction link -->
            <div style="background:#F8FAFC;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;">Transaction ID</p>
              <p style="margin:0;font-family:monospace;font-size:12px;color:#374151;word-break:break-all;">${txid}</p>
            </div>

            <a href="${explorerUrl}"
               style="display:block;background:#2D6A4F;color:#fff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-size:14px;font-weight:800;margin-bottom:20px;">
              View on Mempool Explorer →
            </a>

            <a href="https://praqen.com/wallet"
               style="display:block;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;text-align:center;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700;">
              Open My Wallet
            </a>

            <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;line-height:1.6;text-align:center;">
              You received this because a deposit was made to your PRAQEN wallet address.<br>
              Need help? <a href="mailto:support@praqen.com" style="color:#2D6A4F;">support@praqen.com</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9CA3AF;">© ${year} PRAQEN · Self-Custodial HD Wallet · 0.5% fee on trades only</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────

class DepositMonitor {

  constructor() {
    this.isRunning    = false;
    this.intervalId   = null;
    this.network      = null;
    this.apiBase      = null;
    this.checkedTxIds = new Set(); // memory cache to prevent double-crediting
  }

  // ── Start background polling ───────────────────────────────────────────────
  start() {
    if (this.isRunning) {
      console.log('[DepositMonitor] Already running — skipping duplicate start');
      return;
    }

    this.network = 'mainnet';
    this.apiBase = 'https://mempool.space/api';

    console.log(`\n🔍 DepositMonitor started — MAINNET`);
    console.log(`   Polling every ${POLL_INTERVAL_MS / 1000 / 60} minutes`);
    console.log(`   API: ${this.apiBase}\n`);

    this.isRunning = true;

    // Run immediately on startup, then on interval
    this.runFullCycle();
    this.intervalId = setInterval(() => this.runFullCycle(), POLL_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning  = false;
    console.log('[DepositMonitor] Stopped');
  }

  // ── One full polling cycle: user wallets + escrow ─────────────────────────
  async runFullCycle() {
    const start = Date.now();
    console.log(`\n[DepositMonitor] ⏱  Cycle start ${new Date().toISOString()}`);
    await Promise.allSettled([
      this.checkAllUserDeposits(),
      this.checkEscrowDeposits(),
    ]);
    console.log(`[DepositMonitor] ✅ Cycle done in ${Date.now() - start}ms\n`);
  }

  // ── Fetch all wallets to monitor (user_wallets table is authoritative) ─────
  async checkAllUserDeposits() {
    try {
      // Primary source: user_wallets table (populated by /generate-address endpoint)
      const { data: wallets, error: wErr } = await supabaseAdmin
        .from('user_wallets')
        .select('user_id, btc_address')
        .not('btc_address', 'is', null)
        .neq('btc_address', '');

      // Fallback source: users.bitcoin_wallet_address (older generate path)
      const { data: users, error: uErr } = await supabaseAdmin
        .from('users')
        .select('id, username, bitcoin_wallet_address')
        .not('bitcoin_wallet_address', 'is', null)
        .neq('bitcoin_wallet_address', '');

      if (wErr) console.error('[DepositMonitor] user_wallets fetch error:', wErr.message);
      if (uErr) console.error('[DepositMonitor] users fetch error:', uErr.message);

      // Merge both sources, deduplicate by address
      const seen      = new Set();
      const toCheck   = [];

      for (const w of (wallets || [])) {
        if (w.btc_address && !seen.has(w.btc_address)) {
          seen.add(w.btc_address);
          toCheck.push({ userId: w.user_id, address: w.btc_address, username: null });
        }
      }
      for (const u of (users || [])) {
        if (u.bitcoin_wallet_address && !seen.has(u.bitcoin_wallet_address)) {
          seen.add(u.bitcoin_wallet_address);
          toCheck.push({ userId: u.id, address: u.bitcoin_wallet_address, username: u.username });
        }
      }

      if (toCheck.length === 0) {
        console.log('[DepositMonitor] No wallet addresses to monitor yet');
        return;
      }

      console.log(`[DepositMonitor] Scanning ${toCheck.length} wallet address(es)...`);

      for (const entry of toCheck) {
        if (!this.isValidMainnetAddress(entry.address)) {
          console.log(`[DepositMonitor] ⚠️  Skipping invalid address for user ${entry.userId.slice(0,8)}: ${entry.address.slice(0,16)}…`);
          continue;
        }
        await this.checkUserDeposit(entry);
        await this.sleep(600); // 600 ms between calls to respect mempool.space rate limits
      }

    } catch (err) {
      console.error('[DepositMonitor] checkAllUserDeposits error:', err.message);
    }
  }

  // ── Validate that an address is a real mainnet address ────────────────────
  isValidMainnetAddress(address) {
    if (!address || typeof address !== 'string') return false;
    // Native SegWit bc1…
    if (/^bc1[a-z0-9]{25,87}$/.test(address)) return true;
    // Legacy 1… or P2SH 3…
    if (/^[13][a-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
    return false;
  }

  // ── Check one address for new confirmed deposits ───────────────────────────
  async checkUserDeposit({ userId, address, username }) {
    try {
      // Resolve username if not provided
      if (!username) {
        const { data: u } = await supabaseAdmin
          .from('users').select('username').eq('id', userId).single();
        username = u?.username || userId.slice(0, 8);
      }

      // Fetch full transaction list from mempool.space
      const resp = await axios.get(`${this.apiBase}/address/${address}/txs`, { timeout: 15000 });
      const txs  = resp.data || [];
      if (txs.length === 0) return;

      // Get current DB balance (prefer user_balances; fall back to user_wallets)
      const { data: balRow } = await supabaseAdmin
        .from('user_balances').select('balance_btc').eq('user_id', userId).single();
      let currentBalance = parseFloat(balRow?.balance_btc || 0);

      for (const tx of txs) {
        const txid = tx.txid;

        // Memory-level dedupe
        if (this.checkedTxIds.has(`${userId}_${txid}`)) continue;

        // Skip unconfirmed
        if (!tx.status?.confirmed) {
          console.log(`[DepositMonitor] TX ${txid.slice(0,12)}… unconfirmed — waiting`);
          continue;
        }

        // DB-level dedupe — prevents double crediting across restarts
        const { data: existingTx } = await supabaseAdmin
          .from('wallet_transactions')
          .select('id')
          .eq('user_id', userId)
          .eq('tx_hash', txid)
          .eq('type', 'DEPOSIT')
          .maybeSingle();

        if (existingTx) {
          this.checkedTxIds.add(`${userId}_${txid}`);
          continue;
        }

        // Calculate how many satoshis landed at our user's address in this tx
        let depositSats = 0;
        for (const vout of (tx.vout || [])) {
          if (vout.scriptpubkey_address === address) depositSats += vout.value;
        }

        if (depositSats <= DUST_THRESHOLD_SATS) {
          this.checkedTxIds.add(`${userId}_${txid}`);
          continue;
        }

        const depositBTC = depositSats / 1e8;
        const newBalance = parseFloat((currentBalance + depositBTC).toFixed(8));

        console.log(`\n💰 [DepositMonitor] Deposit detected!`);
        console.log(`   User   : ${username} (${userId.slice(0,8)})`);
        console.log(`   TX     : ${txid}`);
        console.log(`   Amount : ${depositBTC} BTC`);

        // ── 1. Insert TX record FIRST — if this fails, skip balance update ───
        // Using upsert on tx_hash to make this idempotent across restarts
        const { error: txErr } = await supabaseAdmin
          .from('wallet_transactions')
          .upsert({
            user_id:    userId,
            type:       'DEPOSIT',
            amount_btc: depositBTC,
            status:     'CONFIRMED',
            tx_hash:    txid,
            notes:      `Confirmed deposit to ${address.slice(0,12)}…`,
            created_at: new Date().toISOString(),
          }, { onConflict: 'tx_hash,user_id', ignoreDuplicates: true });

        if (txErr) {
          console.error(`[DepositMonitor] wallet_transactions insert failed for TX ${txid.slice(0,12)}:`, txErr.message);
          // Still add to memory cache so we don't retry in this session
          this.checkedTxIds.add(`${userId}_${txid}`);
          continue;
        }

        // ── 2. Update user_balances ──────────────────────────────────────────
        const { error: balErr } = await supabaseAdmin
          .from('user_balances')
          .upsert({ user_id: userId, balance_btc: newBalance, updated_at: new Date().toISOString() });

        if (balErr) {
          console.error(`[DepositMonitor] user_balances update failed for ${username}:`, balErr.message);
          // Do NOT continue — user_wallets must still be updated below
        }

        // ── 3. Upsert user_wallets.balance_btc ──────────────────────────────
        // Use upsert (not update) so the row is CREATED if it doesn't exist.
        // An update on a missing row silently does nothing, leaving user_wallets at 0.
        // When escrow later locks and sets user_wallets = user_balances - amount,
        // it would inflate user_wallets from 0 and show fake BTC to the seller.
        const { data: walletRow } = await supabaseAdmin
          .from('user_wallets').select('balance_btc').eq('user_id', userId).maybeSingle();
        const walletBase    = parseFloat(walletRow?.balance_btc || 0);
        const walletBalance = parseFloat((walletBase + depositBTC).toFixed(8));

        const { error: walletErr } = await supabaseAdmin
          .from('user_wallets')
          .upsert(
            { user_id: userId, btc_address: address, balance_btc: walletBalance, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );

        if (walletErr) {
          console.error(`[DepositMonitor] user_wallets upsert failed for ${username}:`, walletErr.message);
        }

        // ── 4. In-app notification ───────────────────────────────────────────
        await supabaseAdmin
          .from('notifications')
          .insert({
            user_id:    userId,
            type:       'wallet',
            title:      '₿ Bitcoin Received!',
            message:    `${depositBTC.toFixed(8)} BTC credited to your wallet. Balance: ${newBalance.toFixed(8)} BTC`,
            action:     '/wallet',
            is_read:    false,
            created_at: new Date().toISOString(),
          });

        // ── 5. Re-evaluate offer status — deposit may restore paused offers ───
        updateOfferStatus(userId).catch(() => {});

        // ── 6. SMS + Email (fire-and-forget) ──────────────────────────────────
        Promise.allSettled([
          this.sendDepositSMS(userId, depositBTC, newBalance),
          this.sendDepositEmail(userId, username, depositBTC, newBalance, txid),
        ]).then(results => {
          results.forEach(r => {
            if (r.status === 'rejected') console.error('[DepositMonitor] Notification error:', r.reason?.message);
          });
        });

        this.checkedTxIds.add(`${userId}_${txid}`);
        currentBalance = newBalance;

        console.log(`✅ [DepositMonitor] Credited ${depositBTC} BTC to ${username} | Balance: ${newBalance.toFixed(8)} BTC`);
      }

    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`[DepositMonitor] Rate limited by mempool.space — will retry next cycle`);
      } else {
        console.error(`[DepositMonitor] Error checking ${address.slice(0,12)}…:`, err.message);
      }
    }
  }

  // ── SMS notification ───────────────────────────────────────────────────────
  async sendDepositSMS(userId, depositBTC, newBalance) {
    if (!twilioClient) return;
    const { data: user } = await supabaseAdmin
      .from('users').select('phone').eq('id', userId).single();
    if (!user?.phone) return;

    const phone = user.phone.startsWith('+') ? user.phone : `+${user.phone}`;
    await twilioClient.messages.create({
      body: `[PRAQEN ⚡] ₿${depositBTC.toFixed(8)} BTC received! New balance: ₿${newBalance.toFixed(8)}. View your wallet: https://praqen.com/wallet`,
      from: process.env.TWILIO_PHONE,
      to:   phone,
    });
    console.log(`📱 [DepositMonitor] SMS sent to user ${userId.slice(0,8)}`);
  }

  // ── Email notification ─────────────────────────────────────────────────────
  async sendDepositEmail(userId, username, depositBTC, newBalance, txid) {
    const { data: user } = await supabaseAdmin
      .from('users').select('email, username').eq('id', userId).single();
    if (!user?.email) return;

    const displayName = user.username || username;
    await emailTransporter.sendMail({
      from:    '"PRAQEN" <kendevdash@gmail.com>',
      to:      user.email,
      subject: `₿ ${depositBTC.toFixed(8)} BTC received — PRAQEN`,
      html:    depositEmailHtml(displayName, depositBTC, newBalance, txid),
    });
    console.log(`📧 [DepositMonitor] Email sent to user ${userId.slice(0,8)} (${user.email})`);
  }

  // ── Monitor escrow addresses for active trades ─────────────────────────────
  async checkEscrowDeposits() {
    try {
      const { data: trades, error } = await supabaseAdmin
        .from('trades')
        .select('id, buyer_id, seller_id, amount_btc, escrow_wallet_address, status')
        .in('status', ['CREATED', 'PENDING_DEPOSIT'])
        .not('escrow_wallet_address', 'is', null);

      if (error || !trades || trades.length === 0) return;

      console.log(`[DepositMonitor] Checking ${trades.length} escrow address(es)…`);
      for (const trade of trades) {
        await this.checkEscrowFunded(trade);
        await this.sleep(600);
      }
    } catch (err) {
      console.error('[DepositMonitor] checkEscrowDeposits error:', err.message);
    }
  }

  // ── Check if an escrow address has received enough BTC ────────────────────
  async checkEscrowFunded(trade) {
    const { id: tradeId, escrow_wallet_address: address, amount_btc } = trade;
    if (!address) return;

    try {
      const resp = await axios.get(`${this.apiBase}/address/${address}`, { timeout: 15000 });
      const d    = resp.data;
      const confirmedSats = d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum;
      const confirmedBTC  = confirmedSats / 1e8;
      const requiredBTC   = parseFloat(amount_btc || 0);

      if (confirmedBTC < requiredBTC || requiredBTC === 0) return;

      console.log(`\n🔒 [DepositMonitor] Escrow funded — trade ${tradeId.slice(0,8)}`);
      console.log(`   Required: ${requiredBTC} BTC | Received: ${confirmedBTC} BTC`);

      await supabaseAdmin
        .from('trades')
        .update({
          status:           'FUNDS_LOCKED',
          escrow_locked_at: new Date().toISOString(),
          escrow_amount:    confirmedBTC,
        })
        .eq('id', tradeId)
        .in('status', ['CREATED', 'PENDING_DEPOSIT']);

      for (const uid of [trade.buyer_id, trade.seller_id].filter(Boolean)) {
        await supabaseAdmin.from('notifications').insert({
          user_id:    uid,
          type:       'trade',
          title:      '🔒 Escrow Funded!',
          message:    `Trade #${tradeId.slice(0,8).toUpperCase()} is ACTIVE — Bitcoin is locked in escrow.`,
          action:     `/trade/${tradeId}`,
          is_read:    false,
          created_at: new Date().toISOString(),
        });
      }

      console.log(`✅ [DepositMonitor] Trade ${tradeId.slice(0,8)} → FUNDS_LOCKED\n`);
    } catch (err) {
      console.error(`[DepositMonitor] Escrow check error trade ${tradeId.slice(0,8)}:`, err.message);
    }
  }

  // ── Manual check for one user (called by /api/hd-wallet/check-deposit) ─────
  async checkAddressNow(userId) {
    // Try user_wallets first, fall back to users table
    let address = null;
    let username = null;

    const { data: wallet } = await supabaseAdmin
      .from('user_wallets').select('btc_address').eq('user_id', userId).single();
    if (wallet?.btc_address) address = wallet.btc_address;

    if (!address) {
      const { data: user } = await supabaseAdmin
        .from('users').select('username, bitcoin_wallet_address').eq('id', userId).single();
      address  = user?.bitcoin_wallet_address;
      username = user?.username;
    }

    if (!address) throw new Error('No wallet address found — generate one first');

    await this.checkUserDeposit({ userId, address, username });

    const { data: bal } = await supabaseAdmin
      .from('user_balances').select('balance_btc').eq('user_id', userId).single();

    return {
      success:     true,
      balance_btc: parseFloat(bal?.balance_btc || 0),
      address,
      checked_at:  new Date().toISOString(),
    };
  }

  // ── Status info ───────────────────────────────────────────────────────────
  getStatus() {
    return {
      running:          this.isRunning,
      network:          this.network,
      poll_interval_min: POLL_INTERVAL_MS / 1000 / 60,
      txs_cached:       this.checkedTxIds.size,
      api:              this.apiBase,
    };
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new DepositMonitor();
