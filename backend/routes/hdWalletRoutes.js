// routes/hdWalletRoutes.js
// PRAQEN — HD Wallet API Endpoints (Production Ready)
// All endpoints the Wallet.jsx frontend needs

require('dotenv').config();
const express      = require('express');
const router       = express.Router();
const hdWallet               = require('../services/hdWalletService');
const depositMonitor         = require('../services/depositMonitor');
const realtimeDepositService = require('../services/realtimeDepositService');
const { updateOfferStatus }  = require('../services/offerStatusService');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ── Auth middleware — reads token from Authorization header ──────────────────
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'praqen-secret-change-in-production';

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================================================
// GET /api/hd-wallet/wallet
// Returns user's BTC address + balance
// Called by Wallet.jsx on load
// ============================================================
router.get('/wallet', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;

        // Fetch user_wallets and user_balances in parallel — both needed for accurate display
        const [{ data: walletRow }, { data: balancesRow }] = await Promise.all([
            supabaseAdmin.from('user_wallets').select('btc_address, balance_btc').eq('user_id', userId).single(),
            supabaseAdmin.from('user_balances').select('balance_btc, balance_usd').eq('user_id', userId).single(),
        ]);

        let address = walletRow?.btc_address || null;
        let balance = parseFloat(walletRow?.balance_btc || 0);

        // Fallback: if user_wallets has 0, use user_balances.balance_btc
        if (!balance && parseFloat(balancesRow?.balance_btc || 0) > 0) {
            balance = parseFloat(balancesRow.balance_btc);
        }

        // balance_usd from user_balances is the authoritative stored USD value — never
        // calculate USD dynamically from a live price feed, which causes display drift.
        const balance_usd = parseFloat(balancesRow?.balance_usd || 0);

        // Escrow locks — sum BTC locked as seller in active trades
        const { data: escrowData } = await supabaseAdmin
            .from('escrow_locks')
            .select('amount_btc')
            .eq('seller_id', userId)
            .eq('status', 'LOCKED');
        const locked_btc    = (escrowData || []).reduce((sum, e) => sum + parseFloat(e.amount_btc || 0), 0);
        // user_wallets.balance_btc is already the AVAILABLE amount (deducted during lock, refunded on cancel)
        const available_btc = balance;
        const total_btc     = parseFloat((balance + locked_btc).toFixed(8));

        // Fallback: if user_wallets has no address, check users table
        if (!address) {
            const { data: userRow } = await supabaseAdmin
                .from('users')
                .select('bitcoin_wallet_address')
                .eq('id', userId)
                .single();
            address = userRow?.bitcoin_wallet_address || null;
        }

        // Transaction history
        const { data: txs } = await supabaseAdmin
            .from('wallet_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        const network = process.env.HD_NETWORK || 'mainnet';

        console.log(`💰 Wallet API — user ${userId.slice(0,8)}: total=${total_btc} locked=${locked_btc} avail=${available_btc} BTC | addr ${address ? address.slice(0,12) + '…' : 'none'}`);

        res.json({
            success:       true,
            address:       address,
            balance_btc:   total_btc,     // total = available + locked (for "Total Balance" display)
            locked_btc:    locked_btc,
            available_btc: available_btc, // what user can actually spend/withdraw
            balance_usd:   balance_usd,   // stored USD value — use this, never recalculate from live price
            network:       network,
            has_address:   !!address,
            transactions:  txs || [],
        });
    } catch (error) {
        console.error('Wallet API error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// POST /api/hd-wallet/generate-address
// Force-generate or regenerate user's BTC address
// ============================================================
router.post('/generate-address', verifyToken, async (req, res) => {
  try {
    const userId  = req.userId;
    const addrData = hdWallet.generateUserAddress(userId);

    // Save to users table
    await supabaseAdmin
      .from('users')
      .update({
        bitcoin_wallet_address: addrData.address,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    console.log(`[hdWalletRoutes] Address generated for ${userId.slice(0,8)}: ${addrData.address}`);

    // Subscribe new address to real-time WebSocket monitor immediately
    realtimeDepositService.subscribeAddress(userId, addrData.address);

    res.json({
      success:  true,
      address:  addrData.address,
      network:  addrData.network,
      message:  'Your unique Bitcoin deposit address is ready',
    });

  } catch (error) {
    console.error('[hdWalletRoutes POST /generate-address]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/hd-wallet/balance
// Returns live balance from mempool + DB balance
// ============================================================
router.get('/balance', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('bitcoin_wallet_address')
      .eq('id', userId)
      .single();

    if (!user?.bitcoin_wallet_address) {
      return res.json({ success: true, balance_btc: 0, confirmed_btc: 0, unconfirmed_btc: 0 });
    }

    // Live mempool balance
    const live = await hdWallet.checkBalance(user.bitcoin_wallet_address);

    // DB balance
    const { data: bal } = await supabaseAdmin
      .from('user_balances')
      .select('balance_btc')
      .eq('user_id', userId)
      .single();

    res.json({
      success:          true,
      address:          user.bitcoin_wallet_address,
      balance_btc:      parseFloat(bal?.balance_btc || 0),   // DB tracked balance
      confirmed_btc:    live.confirmed_btc,                   // live from mempool
      unconfirmed_btc:  live.unconfirmed_btc,
      network:          hdWallet.getNetwork(),
    });

  } catch (error) {
    console.error('[hdWalletRoutes GET /balance]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// POST /api/hd-wallet/check-deposit
// Manually trigger deposit check for this user
// Called when user clicks "Check for New Payments"
// ============================================================
router.post('/check-deposit', verifyToken, async (req, res) => {
  try {
    const result = await depositMonitor.checkAddressNow(req.userId);

    // Deposit may have changed balance — re-evaluate offer status (fire and forget)
    updateOfferStatus(req.userId).catch(() => {});

    res.json({
      success:     true,
      balance_btc: result.balance_btc,
      address:     result.address,
      message:     result.balance_btc > 0
        ? `Balance: ${result.balance_btc.toFixed(8)} BTC`
        : 'No confirmed deposits yet. Confirmations take 10–60 minutes.',
    });

  } catch (error) {
    console.error('[hdWalletRoutes POST /check-deposit]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// POST /api/hd-wallet/send
// Send BTC from user's PRAQEN wallet to any external address
// (Withdrawal)
// ============================================================
// Pause seller's SELL listings when their BTC balance hits zero.
async function pauseSellOffersIfEmpty(sellerId) {
  try {
    const { data: bal } = await supabaseAdmin
      .from('user_balances').select('balance_btc').eq('user_id', sellerId).single();
    if (parseFloat(bal?.balance_btc || 0) > 0.000001) return;

    const { data: paused } = await supabaseAdmin
      .from('listings')
      .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
      .eq('seller_id', sellerId).eq('status', 'ACTIVE')
      .in('listing_type', ['SELL', 'SELL_BITCOIN']).select('id');

    if (paused && paused.length > 0) {
      console.log(`⏸ [AutoPause] ${paused.length} sell offer(s) paused after withdrawal — ${sellerId.slice(0,8)}`);
      await supabaseAdmin.from('notifications').insert({
        user_id: sellerId, type: 'wallet',
        title: '⏸ Sell Offers Paused',
        message: `Your sell offer${paused.length > 1 ? 's have' : ' has'} been paused because your Bitcoin balance is now empty. Top up to reactivate.`,
        action: '/wallet', is_read: false, created_at: new Date().toISOString(),
      });
    }
  } catch (err) { console.error('[pauseSellOffersIfEmpty withdrawal]', err.message); }
}

router.post('/send', verifyToken, async (req, res) => {
  try {
    const { toAddress, amountBtc } = req.body;
    const userId = req.userId;

    if (!toAddress || !amountBtc || parseFloat(amountBtc) <= 0) {
      return res.status(400).json({ error: 'Invalid address or amount' });
    }

    const amount = parseFloat(amountBtc);

    // ── 2-verification required to send BTC out (external only) ─────────────
    // Internal PRAQEN-to-PRAQEN transfers remain free with 1 verification.
    // We check after resolving the destination so internal transfers aren't blocked.

    // ── Check if destination is a PRAQEN user address (internal transfer) ──
    const { data: internalWallet } = await supabaseAdmin
      .from('user_wallets')
      .select('user_id')
      .eq('btc_address', toAddress.trim())
      .single();

    if (internalWallet && internalWallet.user_id !== userId) {
      // ── INTERNAL TRANSFER — free, instant, no on-chain broadcast ─────────
      const recipientId = internalWallet.user_id;

      const { data: senderBal } = await supabaseAdmin
        .from('user_balances').select('balance_btc').eq('user_id', userId).single();
      const available = parseFloat(senderBal?.balance_btc || 0);
      if (available < amount) {
        return res.status(400).json({
          error: `Insufficient balance. Available: ${available.toFixed(8)} BTC, Requested: ${amount.toFixed(8)} BTC`,
        });
      }

      const newSenderBalance    = parseFloat((available - amount).toFixed(8));
      const { data: recipBal }  = await supabaseAdmin
        .from('user_balances').select('balance_btc').eq('user_id', recipientId).single();
      const newRecipientBalance = parseFloat((parseFloat(recipBal?.balance_btc || 0) + amount).toFixed(8));

      // Deduct sender
      await supabaseAdmin.from('user_balances')
        .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      await supabaseAdmin.from('user_wallets')
        .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      // Credit recipient
      await supabaseAdmin.from('user_balances')
        .upsert({ user_id: recipientId, balance_btc: newRecipientBalance, updated_at: new Date().toISOString() });
      await supabaseAdmin.from('user_wallets')
        .update({ balance_btc: newRecipientBalance, updated_at: new Date().toISOString() })
        .eq('user_id', recipientId);

      const crypto = require('crypto');
      const txRef  = 'INT_' + crypto
        .createHash('sha256').update(`${userId}:${recipientId}:${amount}:${Date.now()}`).digest('hex')
        .slice(0, 20).toUpperCase();

      await supabaseAdmin.from('wallet_transactions').insert([
        {
          user_id: userId, type: 'TRANSFER_OUT', amount_btc: amount,
          status: 'CONFIRMED', tx_hash: txRef,
          notes: `Internal transfer → PRAQEN user · No fee`,
          created_at: new Date().toISOString(),
        },
        {
          user_id: recipientId, type: 'TRANSFER_IN', amount_btc: amount,
          status: 'CONFIRMED', tx_hash: txRef,
          notes: `Internal transfer received · No fee`,
          created_at: new Date().toISOString(),
        },
      ]);

      const { data: recip } = await supabaseAdmin.from('users').select('username').eq('id', recipientId).single();
      await supabaseAdmin.from('notifications').insert({
        user_id: recipientId, type: 'wallet',
        title: '₿ Bitcoin Received!',
        message: `₿${amount.toFixed(8)} received — instant internal transfer, no fee`,
        action: '/wallet', is_read: false, created_at: new Date().toISOString(),
      });

      console.log(`[InternalTransfer] ${userId.slice(0,8)} → ${recipientId.slice(0,8)} | ₿${amount} | FREE`);

      return res.json({
        success:     true,
        internal:    true,
        txRef,
        amount_btc:  amount,
        fee:         0,
        fee_label:   'Free — internal PRAQEN transfer',
        to:          recip?.username || toAddress,
        new_balance: newSenderBalance,
        message:     `₿${amount.toFixed(8)} sent instantly — no fee!`,
      });
    }

    // ── EXTERNAL SEND — on-chain broadcast ───────────────────────────────────

    // 2 verifications required to withdraw BTC to an external address
    const { data: sendUser } = await supabaseAdmin
      .from('users')
      .select('is_email_verified, email_verified, is_phone_verified, phone_verified, is_id_verified, kyc_verified')
      .eq('id', userId).single();

    const sHasEmail = !!(sendUser?.is_email_verified || sendUser?.email_verified);
    const sHasPhone = !!(sendUser?.is_phone_verified  || sendUser?.phone_verified);
    const sHasKyc   = !!(sendUser?.is_id_verified      || sendUser?.kyc_verified);
    const sVerifCount = [sHasEmail, sHasPhone, sHasKyc].filter(Boolean).length;

    if (sVerifCount < 2) {
      return res.status(403).json({
        error: 'You need 2 verifications to withdraw Bitcoin to an external address. Please verify your email and phone number in Profile → Verification.',
        requireVerification: 'two',
      });
    }

    const { data: bal } = await supabaseAdmin
      .from('user_balances').select('balance_btc').eq('user_id', userId).single();

    const available = parseFloat(bal?.balance_btc || 0);
    if (available < amount) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ${available.toFixed(8)} BTC, Requested: ${amount.toFixed(8)} BTC`,
      });
    }

    console.log(`[hdWalletRoutes] On-chain send: ${amount} BTC from ${userId.slice(0,8)} → ${toAddress}`);

    const result = await hdWallet.sendBitcoin(`user_${userId}`, toAddress, amount);

    const newBalance = parseFloat((available - amount).toFixed(8));
    await supabaseAdmin.from('user_balances')
      .update({ balance_btc: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    await supabaseAdmin.from('user_wallets')
      .update({ balance_btc: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    await supabaseAdmin.from('wallet_transactions').insert({
      user_id:              userId,
      type:                 'WITHDRAWAL',
      amount_btc:           amount,
      status:               'CONFIRMED',
      tx_hash:              result.txid,
      destination_address:  toAddress,
      created_at:           new Date().toISOString(),
    });

    console.log(`✅ [hdWalletRoutes] On-chain sent ₿${amount} — TX: ${result.txid}`);

    // Re-evaluate offer status after withdrawal reduces available balance
    updateOfferStatus(userId).catch(() => {});

    res.json({
      success:     true,
      internal:    false,
      txid:        result.txid,
      amount_btc:  amount,
      to:          toAddress,
      fee_sats:    result.fee_sats,
      new_balance: newBalance,
      explorer:    result.explorer_url,
      message:     `₿${amount} sent on-chain successfully`,
    });

  } catch (error) {
    console.error('[hdWalletRoutes POST /send]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/hd-wallet/transactions
// Returns user's full transaction history
// ============================================================
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: txs, error } = await supabaseAdmin
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      success:      true,
      transactions: txs || [],
      count:        txs?.length || 0,
    });

  } catch (error) {
    console.error('[hdWalletRoutes GET /transactions]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// POST /api/hd-wallet/escrow-address
// Generate escrow address for a trade
// Called when trade is created
// ============================================================
router.post('/escrow-address', verifyToken, async (req, res) => {
  try {
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ error: 'Trade ID is required' });

    const addrData = hdWallet.generateEscrowAddress(tradeId);

    res.json({
      success:       true,
      escrow_address: addrData.address,
      trade_id:      tradeId,
      network:       addrData.network,
    });

  } catch (error) {
    console.error('[hdWalletRoutes POST /escrow-address]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/hd-wallet/network
// Returns current network (testnet or mainnet)
// ============================================================
router.get('/network', (req, res) => {
  try {
    const network = hdWallet.getNetwork();
    res.json({
      success: true,
      network,
      message: network === 'testnet'
        ? '⚠️ TESTNET — Using fake BTC for development'
        : '✅ MAINNET — Real Bitcoin',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/hd-wallet/info
// Returns PRAQEN fee wallet address and system info
// ============================================================
router.get('/info', verifyToken, async (req, res) => {
  try {
    const info = hdWallet.getInfo();
    res.json({ success: true, ...info });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/hd-wallet/realtime-status
// Shows whether the WebSocket deposit monitor is connected
// Useful for debugging — call this to confirm real-time is live
// ============================================================
router.get('/realtime-status', verifyToken, async (req, res) => {
  try {
    const status = realtimeDepositService.getStatus();
    res.json({
      success: true,
      realtime: {
        connected:         status.connected,
        monitored_wallets: status.monitored_wallets,
        reconnect_delay_s: status.reconnect_delay_s,
        message:           status.connected
          ? `Real-time WebSocket connected — monitoring ${status.monitored_wallets} wallet(s)`
          : `WebSocket disconnected — reconnecting in ${status.reconnect_delay_s}s. 5-min scanner still active.`,
      },
      scanner: depositMonitor.getStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;