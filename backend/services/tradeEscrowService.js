// services/tradeEscrowService.js
// PRAQEN — Trade Escrow Service (Production Ready)
// Replaces old Coinbase SDK with HD Wallet system
// Handles: lock, release, refund, cancel, expired trades

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWallet = require('./hdWalletService');
const { checkAndAwardBadges } = require('./badgeService');
const { updateOfferStatus } = require('./offerStatusService');
const { sendTradeAlert, sendSystemAlert } = require('./pushNotificationService');

// ── Supabase admin (bypasses RLS) ─────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const FEE_RATE            = 0.01;
const COMPANY_WALLET_ID   = '14762cd0-d3b2-474f-acab-fe0071961e9a';
const COMPANY_BTC_ADDRESS = 'bc1qd8z3zdn2e3eul6y8nmcyjvgle3yzv8ttvsjp49';

// After every trade / withdrawal: sync SELL listings to the seller's current balance.
//   • If balance hits zero  → PAUSE all SELL offers + notify.
//   • If balance is positive but max_limit_usd > balance value → cap max_limit_usd.
// NEVER throws — must not break the caller.
async function pauseSellOffersIfEmpty(sellerId) {
  try {
    const { data: bal } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', sellerId).maybeSingle();
    const balance    = parseFloat(bal?.balance_btc || 0);
    const BTC_PRICE  = 88000; // approximate — used only for USD cap comparison
    const balanceUsd = balance * BTC_PRICE;

    if (balance <= 0.000001) {
      // Wallet empty → pause all SELL offers
      const { data: paused } = await supabaseAdmin
        .from('listings')
        .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
        .eq('seller_id', sellerId)
        .eq('status', 'ACTIVE')
        .in('listing_type', ['SELL', 'SELL_BITCOIN'])
        .select('id');

      if (paused && paused.length > 0) {
        console.log(`⏸ [AutoPause] ${paused.length} sell offer(s) paused — wallet empty for ${sellerId.slice(0,8)}`);
        await supabaseAdmin.from('notifications').insert({
          user_id:    sellerId,
          type:       'wallet',
          title:      '⏸ Sell Offers Paused',
          message:    `Your sell offer${paused.length > 1 ? 's have' : ' has'} been automatically paused because your Bitcoin balance is empty. Top up your wallet to reactivate them.`,
          action:     '/wallet',
          is_read:    false,
          created_at: new Date().toISOString(),
        });
      }
      return;
    }

    // Wallet not empty — cap max_limit_usd to current balance value on all SELL offers
    const { data: sellOffers } = await supabaseAdmin
      .from('listings')
      .select('id, max_limit_usd, min_limit_usd')
      .eq('seller_id', sellerId)
      .in('listing_type', ['SELL', 'SELL_BITCOIN'])
      .in('status', ['ACTIVE', 'PAUSED']);

    if (!sellOffers || sellOffers.length === 0) return;

    for (const offer of sellOffers) {
      const currentMax = parseFloat(offer.max_limit_usd || 0);
      if (currentMax > balanceUsd) {
        // Cap max to balance; ensure min doesn't exceed the new capped max
        const newMax = Math.max(10, parseFloat(balanceUsd.toFixed(2)));
        const newMin = Math.min(parseFloat(offer.min_limit_usd || 10), newMax);
        await supabaseAdmin.from('listings')
          .update({ max_limit_usd: newMax, min_limit_usd: newMin, updated_at: new Date().toISOString() })
          .eq('id', offer.id);
        console.log(`📉 [AutoCap] Offer ${offer.id.slice(0,8)} max capped $${currentMax.toFixed(0)} → $${newMax.toFixed(0)} (balance $${balanceUsd.toFixed(0)})`);
      }
    }
  } catch (err) {
    console.error('[pauseSellOffersIfEmpty]', err.message);
  }
}

// Guarantee a wallets row exists for a user. Called before every escrow operation.
// Uses select-then-insert so it works even if wallets.user_id has no unique constraint.
async function ensureWalletExists(userId) {
  try {
    const { data: existing } = await supabaseAdmin
      .from('wallets').select('user_id').eq('user_id', userId).maybeSingle();
    if (!existing) {
      const { error: insertErr } = await supabaseAdmin.from('wallets').insert({
        user_id:            userId,
        address:            hdWallet.generateUserAddress(userId).address,
        balance_btc:        0,
        locked_balance_btc: 0,
        updated_at:         new Date().toISOString(),
      });
      if (insertErr && !insertErr.message?.includes('duplicate')) {
        console.warn(`[ensureWalletExists] insert warn for ${userId.slice(0,8)}: ${insertErr.message}`);
      } else if (!insertErr) {
        console.log(`[ensureWalletExists] created wallets row for ${userId.slice(0,8)}`);
      }
    }
  } catch (e) {
    console.warn(`[ensureWalletExists] error for ${userId.slice(0,8)}: ${e.message}`);
  }
}

class TradeEscrowService {

  constructor() {
    this.feeRate = FEE_RATE;
  }

  // ── Helper: send in-app notification ───────────────────────────────────────
  async notify(userId, type, title, message, action, extra = {}) {
    try {
      const hasExtra = extra && (extra.actor_id || extra.direction || extra.trade_id);
      const payload = {
        user_id:    userId,
        type,
        title,
        message,
        action:     action || '/my-trades',
        is_read:    false,
        created_at: new Date().toISOString(),
      };
      if (hasExtra) payload.data = extra;
      const { error } = await supabaseAdmin.from('notifications').insert(payload);
      if (error) {
        console.error('[Escrow] Notification error:', error.message);
        // Retry without data if the column doesn't exist yet
        if (hasExtra && (error.message?.includes('"data"') || error.code === '42703')) {
          const base = { user_id: userId, type, title, message, action: action || '/my-trades', is_read: false, created_at: new Date().toISOString() };
          const { error: e2 } = await supabaseAdmin.from('notifications').insert(base);
          if (e2) console.error('[Escrow] Notification retry error:', e2.message);
        }
      }
    } catch (e) {
      console.error('[Escrow] Notification error:', e.message);
    }
  }

  // ── Helper: log trade event to wallet_transactions ─────────────────────────
  async logTransaction(userId, type, amountBtc, txHash, notes) {
    try {
      await supabaseAdmin.from('wallet_transactions').insert({
        user_id:    userId,
        type,
        amount_btc: amountBtc,
        status:     'CONFIRMED',
        tx_hash:    txHash || null,
        notes:      notes  || null,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[Escrow] Log transaction error:', e.message);
    }
  }

  // ============================================================
  // LOCK FUNDS IN ESCROW
  // Called when trade is created
  // Deducts from seller's PRAQEN wallet balance
  // Generates unique escrow address for this trade
  // ============================================================
  async lockFundsInEscrow(tradeId, btcProviderId, amountBtc, timeLimitMins = 30) {
    console.log(`\n🔒 lockFundsInEscrow — Trade: ${tradeId.slice(0,8)}, BTC Provider: ${btcProviderId.slice(0,8)}, Amount: ${amountBtc} BTC`);

    const amount = parseFloat(amountBtc);
    if (!amount || amount <= 0) throw new Error('Invalid escrow amount');

    // Guarantee wallet rows exist for provider before touching their balance
    await ensureWalletExists(btcProviderId);

    // ── 1. Get BTC provider's balance from wallets table (single source of truth) ──
    const { data: walletRow, error: walletErr } = await supabaseAdmin
      .from('wallets')
      .select('balance_btc, locked_balance_btc')
      .eq('user_id', btcProviderId)
      .single();

    if (walletErr || !walletRow) {
      throw new Error(`Wallet not found for BTC provider ${btcProviderId.slice(0,8)}`);
    }

    const currentBalance = parseFloat(walletRow.balance_btc || 0);

    if (currentBalance < amount) {
      throw new Error(
        `Insufficient balance. Provider has ${currentBalance.toFixed(8)} BTC, needs ${amount.toFixed(8)} BTC`
      );
    }

    // ── 2. Generate unique escrow address for this trade ───────────────────
    const escrowData    = hdWallet.generateEscrowAddress(tradeId);
    const escrowAddress = escrowData.address;
    const feeBtc        = parseFloat((amount * this.feeRate).toFixed(8));

    console.log(`   Escrow address: ${escrowAddress}`);
    console.log(`   Fee (1%):       ${feeBtc} BTC`);

    // ── 3. Deduct trade amount from available balance, add to locked ─────────
    const newAvailable = parseFloat((currentBalance - amount).toFixed(8));
    const newLocked    = parseFloat((parseFloat(walletRow.locked_balance_btc || 0) + amount).toFixed(8));

    const { error: deductErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_btc: newAvailable, locked_balance_btc: newLocked, updated_at: new Date().toISOString() })
      .eq('user_id', btcProviderId);

    if (deductErr) throw new Error(`Failed to lock funds: ${deductErr.message}`);

    // ── 4. Generate deterministic lock reference ────────────────────────────
    const crypto = require('crypto');
    const lockTxHash = 'ESCROW_LOCK_' + crypto
      .createHash('sha256')
      .update(`${tradeId}:${btcProviderId}:${amount}:${Date.now()}`)
      .digest('hex')
      .slice(0, 32)
      .toUpperCase();

    console.log(`🔒 Escrow lock reference: ${lockTxHash}`);

    // ── 5. Create escrow_locks record ──────────────────────────────────────
    const { error: lockErr } = await supabaseAdmin
      .from('escrow_locks')
      .insert({
        trade_id:       tradeId,
        seller_id:      btcProviderId,  // field name in DB; holds whoever provided BTC
        amount_btc:     amount,
        escrow_address: escrowAddress,
        tx_hash:        lockTxHash,
        status:         'LOCKED',
        locked_at:      new Date().toISOString(),
      });

    if (lockErr) {
      // Revert wallets table back to pre-lock values
      await supabaseAdmin.from('wallets')
        .update({
          balance_btc:        currentBalance,
          locked_balance_btc: parseFloat(walletRow.locked_balance_btc || 0),
          updated_at:         new Date().toISOString(),
        })
        .eq('user_id', btcProviderId);
      throw new Error(`Failed to create escrow record: ${lockErr.message}`);
    }

    // ── 6. Update trade with escrow details ────────────────────────────────
    const { error: tradeUpdateErr } = await supabaseAdmin
      .from('trades')
      .update({
        status:                'FUNDS_LOCKED',
        escrow_wallet_address: escrowAddress,
        seller_btc_txhash:     lockTxHash,
        escrow_amount:         amount,
        platform_fee_btc:      feeBtc,
        escrow_locked_at:      new Date().toISOString(),
        expires_at:            new Date(Date.now() + timeLimitMins * 60 * 1000).toISOString(),
      })
      .eq('id', tradeId);

    if (tradeUpdateErr) throw new Error(`Failed to update trade: ${tradeUpdateErr.message}`);

    // ── 7. Log the lock ────────────────────────────────────────────────────
    await this.logTransaction(btcProviderId, 'ESCROW_LOCK', amount, lockTxHash,
      `Funds locked for trade #${tradeId.slice(0,8)}`);

    console.log(`✅ Funds locked — ${amount} BTC from provider ${btcProviderId.slice(0,8)}`);

    // Fire-and-forget: push new_trade alert to the seller so they know to respond
    supabaseAdmin.from('trades')
      .select('seller_id, trade_ref, amount_btc')
      .eq('id', tradeId)
      .maybeSingle()
      .then(({ data: t }) => {
        if (t?.seller_id) sendTradeAlert(t.seller_id, t, 'new_trade').catch(() => {});
      }).catch(() => {});

    return {
      success:      true,
      escrowAddress,
      lockTxHash,
      amountLocked: amount,
      feeBtc,
      newBalance:   newAvailable,
      expiresAt:    new Date(Date.now() + timeLimitMins * 60 * 1000).toISOString(),
    };
  }

  // ============================================================
  // MARK AS PAID
  // Called when buyer/seller marks payment as sent or received
  // For BTC trades: buyer marks after sending fiat payment
  // For gift card trades: seller marks after sending gift card code
  // ============================================================
  async markAsPaid(tradeId, userId) {
    console.log(`\n💰 markAsPaid — Trade: ${tradeId.slice(0,8)}, User: ${userId.slice(0,8)}`);

    const { data: trade, error } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (error || !trade) throw new Error('Trade not found');

    // Determine if this is a gift card trade
    let listingType = '';
    if (trade.listing_id) {
      const { data: listing } = await supabaseAdmin.from('listings').select('listing_type').eq('id', trade.listing_id).single();
      listingType = listing?.listing_type || '';
    }
    const isGiftCardTrade = listingType.includes('GIFT_CARD');
    
    // Verify authorization
    // For gift card: seller marks as paid (after sending code)
    // For BTC: buyer marks as paid (after sending payment)
    const authorizedId = isGiftCardTrade ? trade.seller_id : trade.buyer_id;
    
    if (String(userId) !== String(authorizedId)) {
      throw new Error(
        isGiftCardTrade 
          ? 'Only the seller can mark as sent (gift card trades)'
          : 'Only the buyer can mark as paid'
      );
    }

    const allowed = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN'];
    if (!allowed.includes(trade.status)) {
      throw new Error(`Cannot mark as paid — trade status is ${trade.status}`);
    }

    await supabaseAdmin
      .from('trades')
      .update({
        status:              'PAYMENT_SENT',
        buyer_confirmed:     true,
        buyer_confirmed_at:  new Date().toISOString(),
        expires_at:          null,
      })
      .eq('id', tradeId);

    // Notify the other party
    const notifyId = isGiftCardTrade ? trade.buyer_id : trade.seller_id;
    const notifyMsg = isGiftCardTrade
      ? `Seller sent the gift card code. Verify and release Bitcoin!`
      : `Buyer confirmed payment. Please verify and release Bitcoin.`;
    
    await this.notify(
      notifyId,
      'trade',
      '✅ Payment/Code Sent',
      notifyMsg,
      `/trade/${tradeId}`
    );
    sendTradeAlert(notifyId, trade, 'payment_sent').catch(() => {});

    console.log(`✅ Trade ${tradeId.slice(0,8)} marked as PAYMENT_SENT`);

    return {
      success: true,
      message: 'Payment marked. Waiting for seller to verify and release Bitcoin.',
    };
  }

  // ============================================================
  // RELEASE BITCOIN TO BUYER
  // Called when seller clicks "Release Bitcoin"
  // Splits: (100 - feeRate)% to buyer's PRAQEN wallet + feeRate% to PRAQEN fee wallet
  // This is INTERNAL transfer (balance to balance) — no on-chain TX needed
  // ============================================================
  async releaseBitcoinToBuyer(tradeId, releaserId) {
    const { data: tradeData, error: tradeError } = await supabaseAdmin
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();

    if (tradeError || !tradeData) {
        throw new Error('Trade not found');
    }

    // Detect gift card trade
    let listingType = '';
    if (tradeData.listing_id) {
        const { data: listing } = await supabaseAdmin.from('listings').select('listing_type').eq('id', tradeData.listing_id).single();
        listingType = listing?.listing_type || '';
    }
    // Simple rule: if listing includes GIFT_CARD, buyer (gift card purchaser) provides BTC
    const isGiftCardTrade = listingType.includes('GIFT_CARD');
    // Whoever locked BTC into escrow — seller for BTC trades, buyer for gift card trades
    const btcProviderId = isGiftCardTrade ? tradeData.buyer_id : tradeData.seller_id;



    // Gift card trade: BUYER (Alice, BTC holder) releases after confirming code works
    // BTC trade:       SELLER releases after confirming fiat payment received
    const authorizedId = isGiftCardTrade ? tradeData.buyer_id : tradeData.seller_id;

    console.log(`[release] trade=${tradeId.slice(0,8)} isGiftCard=${isGiftCardTrade} authorizedId=${String(authorizedId).slice(0,8)} releaserId=${String(releaserId).slice(0,8)} status=${tradeData.status}`);

    if (String(authorizedId) !== String(releaserId)) {
        throw new Error(
            isGiftCardTrade
                ? 'Unauthorized — only the card buyer can release Bitcoin'
                : 'Unauthorized — only the seller can release Bitcoin'
        );
    }

    const allowedStatuses = ['PAYMENT_SENT', 'PAID', 'FUNDS_LOCKED', 'DISPUTED'];
    if (!allowedStatuses.includes(tradeData.status)) {
        throw new Error(`Cannot release — trade status is "${tradeData.status}". ${
            isGiftCardTrade ? 'Card seller must send the code first.' : 'Buyer must confirm payment first.'
        }`);
    }

    // Gift card trade: BTC goes to card SELLER (Kenneth)
    // BTC trade:       BTC goes to BTC BUYER
    const btcReceiverId = isGiftCardTrade ? tradeData.seller_id : tradeData.buyer_id;

    if (!btcReceiverId) throw new Error('Cannot determine BTC receiver — trade has no buyer_id/seller_id');
    if (!tradeData.amount_btc || parseFloat(tradeData.amount_btc) <= 0) {
        throw new Error(`Invalid trade amount: ${tradeData.amount_btc}`);
    }

    // Guarantee wallet rows exist for BOTH parties before any balance operation.
    // This prevents the silent-zero bug where UPDATE wallets affects 0 rows because
    // the buyer has never had a wallets row (e.g. first-time buyer).
    await Promise.all([
        ensureWalletExists(btcReceiverId),
        ensureWalletExists(btcProviderId),
    ]);

    const amount      = parseFloat(tradeData.amount_btc);
    const feeRate     = isGiftCardTrade ? 0.02 : 0.01;
    const buyerGets   = parseFloat((amount * (1 - feeRate)).toFixed(8));
    const platformFee = parseFloat((amount * feeRate).toFixed(8));

    console.log(`💰 Releasing ${buyerGets} BTC → receiver: ${btcReceiverId.slice(0, 8)}`);

    const crypto = require('crypto');
    const releaseTxHash = 'ESCROW_RELEASE_' + crypto
      .createHash('sha256')
      .update(`${tradeId}:${btcReceiverId}:${buyerGets}:${Date.now()}`)
      .digest('hex')
      .slice(0, 32)
      .toUpperCase();

    console.log(`🔓 Release reference: ${releaseTxHash}`);

    // ── Check escrow lock status before calling the RPC ──────────────────────
    // The RPC praqen_release_escrow() is the atomic guard — it does UPDATE WHERE
    // status='LOCKED' internally. We just need to ensure the lock exists and is
    // in a releasable state before handing off to the RPC.
    const { data: currentLock } = await supabaseAdmin
        .from('escrow_locks')
        .select('id, status')
        .eq('trade_id', tradeId)
        .maybeSingle();

    if (!currentLock) {
        throw new Error('No escrow lock record found for this trade.');
    }
    if (currentLock.status === 'RELEASED') {
        throw new Error('Bitcoin has already been released for this trade.');
    }
    if (currentLock.status === 'REFUNDED') {
        throw new Error('Escrow was refunded (trade cancelled) — cannot release.');
    }
    if (currentLock.status === 'RELEASING') {
        // Stuck from a previous failed attempt — reset to LOCKED so the RPC can claim it
        console.warn(`[Escrow] Lock ${currentLock.id} stuck in RELEASING — resetting to LOCKED for trade ${tradeId.slice(0,8)}`);
        const { error: resetErr } = await supabaseAdmin
            .from('escrow_locks')
            .update({ status: 'LOCKED' })
            .eq('id', currentLock.id);
        if (resetErr) throw new Error(`Failed to reset stuck escrow lock: ${resetErr.message}`);
    }

    // ── Snapshot BOTH buyer AND company wallet BEFORE RPC ─────────────────────
    const [{ data: receiverBefore }, { data: companyBefore }] = await Promise.all([
        supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', btcReceiverId).maybeSingle(),
        supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', COMPANY_WALLET_ID).maybeSingle(),
    ]);
    const receiverBalanceBefore = parseFloat(receiverBefore?.balance_btc || 0);
    const companyBalanceBefore  = parseFloat(companyBefore?.balance_btc  || 0);

    // ── ONE atomic DB call: credit receiver + fee + mark escrow released + complete trade ──
    // praqen_release_escrow() runs as a single PostgreSQL transaction.
    // If ANY step fails, ALL steps roll back — tables can never go out of sync.
    const buyerGetsUsd = parseFloat(((parseFloat(tradeData.amount_usd || 0)) * (1 - feeRate)).toFixed(2));
    const { error: releaseErr } = await supabaseAdmin.rpc('praqen_release_escrow', {
      p_trade_id:    tradeId,
      p_receiver_id: btcReceiverId,
      p_company_id:  COMPANY_WALLET_ID,
      p_amount_btc:  amount,
      p_fee_btc:     platformFee,
      p_amount_usd:  buyerGetsUsd,
      p_tx_hash:     releaseTxHash,
    });

    if (releaseErr) throw new Error(`Atomic escrow release failed: ${releaseErr.message}`);

    // ── Ensure buyer's wallets row is credited ─────────────────────────────────
    // The RPC may UPDATE wallets WHERE user_id = receiver, but if the buyer has no
    // row yet (first-time buyer, never had BTC), the UPDATE silently affects 0 rows.
    // We detect this by comparing balance before vs after, then apply a manual UPSERT.
    const { data: receiverAfter } = await supabaseAdmin
        .from('wallets').select('balance_btc').eq('user_id', btcReceiverId).maybeSingle();
    const receiverBalanceAfter = parseFloat(receiverAfter?.balance_btc || 0);
    const rpcCredited = receiverBalanceAfter - receiverBalanceBefore;

    if (rpcCredited < buyerGets * 0.99) {
        // RPC did not credit the wallets table (or credited partially) — apply manually
        console.warn(`[Escrow] RPC credited ₿${rpcCredited.toFixed(8)} to buyer wallets table (expected ₿${buyerGets.toFixed(8)}) — applying manual credit`);
        const correctedBalance = parseFloat((receiverBalanceAfter + (buyerGets - rpcCredited)).toFixed(8));
        const { error: manualCreditErr } = await supabaseAdmin
            .from('wallets')
            .update({
                balance_btc:        correctedBalance,
                locked_balance_btc: 0,
                updated_at:         new Date().toISOString(),
            })
            .eq('user_id', btcReceiverId);
        if (manualCreditErr) {
            console.error(`[Escrow] Manual buyer credit failed: ${manualCreditErr.message}`);
        } else {
            console.log(`[Escrow] ✅ Manual credit applied: ₿${correctedBalance.toFixed(8)} → buyer ${btcReceiverId.slice(0,8)}`);
        }
    }

    // ── Clear locked_balance_btc for the BTC provider (RPC only credits buyer) ──
    const { data: providerWallet } = await supabaseAdmin
        .from('wallets').select('locked_balance_btc').eq('user_id', btcProviderId).maybeSingle();
    const clearedLocked = parseFloat(
        Math.max(0, parseFloat(providerWallet?.locked_balance_btc || 0) - amount).toFixed(8)
    );
    await supabaseAdmin.from('wallets')
        .update({ locked_balance_btc: clearedLocked, updated_at: new Date().toISOString() })
        .eq('user_id', btcProviderId);

    // Fetch receiver's final balance for audit log + return value
    const { data: receiverWallet } = await supabaseAdmin
        .from('wallets').select('balance_btc').eq('user_id', btcReceiverId).maybeSingle();
    const newReceiverBalance = parseFloat(receiverWallet?.balance_btc || 0);

    // Trade and escrow are now updated inside the DB function — skip redundant updates.
    const { error: tradeUpdateError } = await supabaseAdmin
        .from('trades')
        .update({ buyer_btc_txhash: releaseTxHash })
        .eq('id', tradeId);

    if (tradeUpdateError) {
        console.warn('⚠️  Trade status update failed (DB trigger issue):', tradeUpdateError.message);
    }

    // ── Collect platform fee — exactly once, verified against pre-RPC snapshot ──
    try {
        console.log(`💸 Collecting ${(feeRate * 100)}% fee: ₿${platformFee.toFixed(8)} → company wallet`);

        // Check if the RPC already credited the company wallet (it has p_company_id + p_fee_btc)
        const { data: companyAfterRpc } = await supabaseAdmin
            .from('wallets').select('balance_btc').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
        const companyBalanceAfterRpc = parseFloat(companyAfterRpc?.balance_btc || 0);
        const rpcCreditedCompany = (companyBalanceAfterRpc - companyBalanceBefore) >= platformFee * 0.99;

        if (rpcCreditedCompany) {
            // RPC already credited — skip JS credit to prevent double-fee
            console.log(`✅ Fee already credited by RPC: ₿${platformFee.toFixed(8)} (company: ${companyBalanceAfterRpc.toFixed(8)} BTC)`);
        } else {
            // RPC did not credit company wallet — apply manually now
            const newCompanyBalance = parseFloat((companyBalanceAfterRpc + platformFee).toFixed(8));
            const { error: feeUpdateErr } = await supabaseAdmin
                .from('wallets')
                .update({ balance_btc: newCompanyBalance, updated_at: new Date().toISOString() })
                .eq('user_id', COMPANY_WALLET_ID);
            if (feeUpdateErr) throw new Error(`Company wallet update failed: ${feeUpdateErr.message}`);
            console.log(`✅ Fee manually credited: ₿${platformFee.toFixed(8)} → company (new balance: ${newCompanyBalance.toFixed(8)} BTC)`);
        }

        // Audit trail — use _FEE suffix so tx_hash never collides with ESCROW_RELEASE log
        await supabaseAdmin.from('wallet_transactions').insert({
            user_id:    COMPANY_WALLET_ID,
            type:       'FEE',
            amount_btc: platformFee,
            status:     'CONFIRMED',
            tx_hash:    `${releaseTxHash}_FEE`,
            notes:      `Platform fee from trade ${tradeId.slice(0, 8).toUpperCase()} — ${(feeRate * 100)}% of ₿${amount.toFixed(8)}`,
            created_at: new Date().toISOString(),
        }).then(() => {}).catch(e => console.warn('[Escrow] FEE tx log failed (non-critical):', e.message));

        // Ensure company_profits record exists (RPC may have inserted it; INSERT ON CONFLICT skips duplicate)
        await supabaseAdmin.from('company_profits').upsert({
            trade_id:     tradeId,
            profit_btc:   platformFee,
            profit_usd:   parseFloat(((platformFee) * (parseFloat(tradeData.amount_usd || 0) / amount)).toFixed(2)),
            status:       'COLLECTED',
            collected_at: new Date().toISOString(),
        }, { onConflict: 'trade_id', ignoreDuplicates: true }).then(() => {}).catch(() => {});

        // Mark fee as collected on the trade record
        await supabaseAdmin.from('trades')
            .update({ fee_status: 'COLLECTED', fee_collected_at: new Date().toISOString(), platform_fee_btc: platformFee })
            .eq('id', tradeId);

        console.log(`✅ Fee CONFIRMED: ₿${platformFee.toFixed(8)} (${(feeRate * 100)}%) from trade ${tradeId.slice(0, 8).toUpperCase()}`);

    } catch (feeErr) {
        // Fee failed — log clearly so admin can see it and manually collect
        console.error(`🚨 [Escrow] FEE COLLECTION FAILED for trade ${tradeId.slice(0, 8).toUpperCase()} — ₿${platformFee.toFixed(8)} NOT COLLECTED:`, feeErr.message);
        // Mark on trade so admin can identify and recover
        await supabaseAdmin.from('trades')
            .update({ fee_status: 'FAILED', platform_fee_btc: platformFee })
            .eq('id', tradeId)
            .catch(() => {});
    }

    // ── Re-evaluate offer status for the BTC provider after balance change ──
    updateOfferStatus(btcProviderId).catch(() => {});

    // ── Award badges to both participants (fire and forget) ────────────────
    checkAndAwardBadges(tradeData.seller_id).catch(() => {});
    checkAndAwardBadges(tradeData.buyer_id).catch(() => {});

    // ── Log transaction for receiver ───────────────────────────────────────
    await this.logTransaction(
        btcReceiverId, 'ESCROW_RELEASE', buyerGets, releaseTxHash,
        `Trade #${tradeId.slice(0, 8)} completed — ₿${buyerGets.toFixed(8)} received`
    );

    // Audit log (fire-and-forget)
    supabaseAdmin.from('balance_audit').insert({
      user_id:     btcReceiverId,
      change_btc:  buyerGets,
      new_balance: newReceiverBalance,
      reason:      'ESCROW_RELEASE',
      trade_id:    tradeId,
      created_at:  new Date().toISOString(),
    }).then(() => {}).catch(() => {});

    // ── Notify both parties ────────────────────────────────────────────────
    await this.notify(
        btcReceiverId, 'trade', '🎉 Bitcoin Released!',
        `Trade #${tradeId.slice(0, 8).toUpperCase()} complete! ₿${buyerGets.toFixed(8)} added to your wallet.`,
        `/trade/${tradeId}`
    );
    await this.notify(
        releaserId, 'trade', '✅ Trade Complete',
        `Trade #${tradeId.slice(0, 8).toUpperCase()} completed successfully. ₿${buyerGets.toFixed(8)} released to buyer.`,
        `/trade/${tradeId}`
    );
    sendTradeAlert(btcReceiverId, tradeData, 'btc_released').catch(() => {});
    sendTradeAlert(releaserId, tradeData, 'btc_released').catch(() => {});

    console.log(`✅ Trade ${tradeId.slice(0, 8)} COMPLETED — receiver got ₿${buyerGets} | fee ₿${platformFee} → company`);

    return {
        success:          true,
        txHash:           releaseTxHash,
        btcReceived:      buyerGets,
        platformFee:      platformFee,
        receiverBalance:  newReceiverBalance,
    };
  }

  // ============================================================
  // CANCEL TRADE — refund BTC provider
  // Called by buyer cancel, auto-cancel, or dispute resolution
  // ============================================================
  async cancelTrade(tradeId, reason) {
    console.log(`\n❌ cancelTrade — Trade: ${tradeId.slice(0,8)}, Reason: ${reason}`);

    // ── 1. Fetch trade ────────────────────────────────────────────────────────
    const { data: trade, error } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (error || !trade) throw new Error('Trade not found');

    const cancellable = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN', 'PAYMENT_SENT', 'DISPUTED'];
    if (!cancellable.includes(trade.status)) {
      return { success: false, message: `Trade cannot be cancelled — status is ${trade.status}` };
    }

    // ── 2. Recover any lock stuck in REFUNDING from a previous failed cancel ──
    // Mirrors the RELEASING recovery in releaseBitcoinToBuyer.
    // If a prior cancel attempt set status=REFUNDING but then crashed, the atomic
    // claim below (WHERE status='LOCKED') would silently match nothing and the
    // refund would never run. We reset it to LOCKED so this attempt can claim it.
    const { data: lockCheck } = await supabaseAdmin
      .from('escrow_locks')
      .select('id, status')
      .eq('trade_id', tradeId)
      .maybeSingle();

    if (lockCheck?.status === 'REFUNDING') {
      console.warn(`[cancelTrade] Lock ${lockCheck.id} stuck in REFUNDING for trade ${tradeId.slice(0,8)} — resetting to LOCKED`);
      const { error: resetErr } = await supabaseAdmin
        .from('escrow_locks')
        .update({ status: 'LOCKED' })
        .eq('id', lockCheck.id);
      if (resetErr) throw new Error(`Failed to reset stuck escrow lock: ${resetErr.message}`);
    }

    // ── 3. Atomically claim the escrow (UPDATE WHERE status='LOCKED') ─────────
    // Only one concurrent request can flip LOCKED→REFUNDING — prevents double-refund
    // if a manual cancel and the auto-cancel cron fire at the same instant.
    const { data: claimedEscrow } = await supabaseAdmin
      .from('escrow_locks')
      .update({ status: 'REFUNDING', released_at: new Date().toISOString() })
      .eq('trade_id', tradeId)
      .eq('status', 'LOCKED')
      .select('*');

    // ── 4. Determine who gets the refund ──────────────────────────────────────
    // escrow_locks.seller_id is set to btcProviderId at lock time — always the
    // ground truth. The fallback matters only when no escrow record exists (e.g.
    // the lock step failed at trade creation).
    //
    // Fallback rule (must match lockFundsInEscrow logic in server.js):
    //   • Standard BTC trades (SELL / BUY listing):  btcProvider = trade.seller_id
    //   • Gift card trades (BUY_GIFT_CARD / SELL_GIFT_CARD): btcProvider = trade.buyer_id
    //     because for gift card trades the *buyer* role holds the BTC, not the seller.
    const esc          = (await supabaseAdmin.from('escrow_locks').select('*').eq('trade_id', tradeId).maybeSingle()).data;
    const refundAmount = parseFloat(esc?.amount_btc || trade.escrow_amount || trade.amount_btc || 0);

    let fallbackBtcProvider = trade.seller_id;
    if (!esc?.seller_id && trade.listing_id) {
      const { data: listing } = await supabaseAdmin
        .from('listings').select('listing_type').eq('id', trade.listing_id).maybeSingle();
      const lType = (listing?.listing_type || '').toUpperCase();
      if (lType === 'BUY_GIFT_CARD' || lType === 'SELL_GIFT_CARD') {
        fallbackBtcProvider = trade.buyer_id;
      }
    }
    const btcProviderId = esc?.seller_id || fallbackBtcProvider;

    console.log(`[cancelTrade] refundAmount=₿${refundAmount} btcProvider=${btcProviderId?.slice(0,8)} escrow=${esc?.status || 'none'}`);

    // ── 5. Refund the BTC provider ─────────────────────────────────────────────
    if (refundAmount > 0 && btcProviderId) {
      await ensureWalletExists(btcProviderId);

      // Snapshot balance BEFORE RPC — same guard used in releaseBitcoinToBuyer.
      // Lets us detect and fix the case where the RPC returns success but silently
      // fails to update balance_btc (e.g. the wallets row is missing or the DB
      // function has a bug). Without this check, funds disappear with no error.
      const { data: providerBefore } = await supabaseAdmin
        .from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', btcProviderId).maybeSingle();
      const balanceBefore = parseFloat(providerBefore?.balance_btc || 0);

      const { error: refundErr } = await supabaseAdmin.rpc('praqen_refund_escrow', {
        p_trade_id:    tradeId,
        p_provider_id: btcProviderId,
        p_amount_btc:  refundAmount,
        p_reason:      reason || 'Trade cancelled',
      });

      if (refundErr) {
        // RPC unavailable or threw — apply refund manually
        console.warn(`[cancelTrade] praqen_refund_escrow RPC failed (${refundErr.message}) — applying manual refund`);
        const { data: pBal } = await supabaseAdmin
          .from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', btcProviderId).maybeSingle();
        const manualAvail  = parseFloat((parseFloat(pBal?.balance_btc  || 0) + refundAmount).toFixed(8));
        const manualLocked = parseFloat(Math.max(0, parseFloat(pBal?.locked_balance_btc || 0) - refundAmount).toFixed(8));
        const { error: manualErr } = await supabaseAdmin
          .from('wallets')
          .update({
            balance_btc:        manualAvail,
            locked_balance_btc: manualLocked,
            updated_at:         new Date().toISOString(),
          })
          .eq('user_id', btcProviderId);
        if (manualErr) throw new Error(`Manual refund failed: ${manualErr.message}`);
        console.log(`[cancelTrade] ✅ Manual refund applied: ₿${manualAvail.toFixed(8)} → provider ${btcProviderId.slice(0,8)}`);

      } else {
        // RPC returned no error — now verify it actually updated balance_btc
        const { data: providerAfter } = await supabaseAdmin
          .from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', btcProviderId).maybeSingle();
        const balanceAfter = parseFloat(providerAfter?.balance_btc || 0);
        const rpcCredited  = balanceAfter - balanceBefore;

        if (rpcCredited < refundAmount * 0.99) {
          // RPC succeeded but balance_btc was not actually updated — fix it manually
          console.warn(`[cancelTrade] RPC credited ₿${rpcCredited.toFixed(8)} but expected ₿${refundAmount.toFixed(8)} — applying balance correction`);
          const correctedBalance = parseFloat((balanceAfter + (refundAmount - rpcCredited)).toFixed(8));
          const syncedLocked     = parseFloat(Math.max(0, parseFloat(providerAfter?.locked_balance_btc || 0) - refundAmount).toFixed(8));
          const { error: fixErr } = await supabaseAdmin
            .from('wallets')
            .update({
              balance_btc:        correctedBalance,
              locked_balance_btc: syncedLocked,
              updated_at:         new Date().toISOString(),
            })
            .eq('user_id', btcProviderId);
          if (fixErr) throw new Error(`Balance correction after RPC mismatch failed: ${fixErr.message}`);
          console.log(`[cancelTrade] ✅ Balance corrected: ₿${correctedBalance.toFixed(8)} → provider ${btcProviderId.slice(0,8)}`);
        } else {
          // RPC credited correctly — only sync locked_balance_btc
          const syncedLocked = parseFloat(Math.max(0, parseFloat(providerAfter?.locked_balance_btc || 0) - refundAmount).toFixed(8));
          await supabaseAdmin.from('wallets')
            .update({ locked_balance_btc: syncedLocked, updated_at: new Date().toISOString() })
            .eq('user_id', btcProviderId);
          console.log(`[cancelTrade] ✅ RPC credited correctly: ₿${rpcCredited.toFixed(8)} → provider ${btcProviderId.slice(0,8)}`);
        }
      }

      // ── Log refund transaction (audit trail) ──────────────────────────────
      await this.logTransaction(
        btcProviderId, 'ESCROW_REFUND', refundAmount, null,
        `Trade #${tradeId.slice(0,8)} cancelled — ₿${refundAmount.toFixed(8)} refunded`
      );

      // Balance audit (fire-and-forget — never blocks the refund)
      supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', btcProviderId).maybeSingle()
        .then(({ data: final }) => {
          supabaseAdmin.from('balance_audit').insert({
            user_id:     btcProviderId,
            change_btc:  refundAmount,
            new_balance: parseFloat(final?.balance_btc || 0),
            reason:      'ESCROW_REFUND',
            trade_id:    tradeId,
            created_at:  new Date().toISOString(),
          }).catch(() => {});
        }).catch(() => {});

      sendSystemAlert(
        btcProviderId,
        '💸 Escrow Refunded',
        `Trade #${tradeId.slice(0,8).toUpperCase()} cancelled — ${refundAmount.toFixed(8)} BTC returned to your wallet.`,
        'https://praqen.com/wallet'
      ).catch(err => console.error('[Escrow] Refund push error:', err.message));

      console.log(`[cancelTrade] ✅ Refund complete: ₿${refundAmount} → provider ${btcProviderId.slice(0,8)}`);

    } else {
      console.log(`[cancelTrade] No escrow funds to refund for trade ${tradeId.slice(0,8)}`);
    }

    // ── 6. Mark trade CANCELLED ───────────────────────────────────────────────
    await supabaseAdmin
      .from('trades')
      .update({
        status:        'CANCELLED',
        cancel_reason: reason || 'Trade cancelled',
        cancelled_at:  new Date().toISOString(),
      })
      .eq('id', tradeId);

    // ── 7. Notify both parties (with direction + counterparty for card display) ─
    const cancelMsg = `Trade #${tradeId.slice(0,8).toUpperCase()} cancelled. ${reason || ''}`;
    if (trade.buyer_id) {
      await this.notify(trade.buyer_id, 'trade_cancel', '❌ Trade Cancelled',
        cancelMsg, `/trade/${tradeId}`,
        { actor_id: trade.seller_id, direction: 'buy', trade_id: tradeId });
    }
    if (trade.seller_id) {
      await this.notify(trade.seller_id, 'trade_cancel', '❌ Trade Cancelled',
        cancelMsg, `/trade/${tradeId}`,
        { actor_id: trade.buyer_id, direction: 'sell', trade_id: tradeId });
    }
    // Push to the party who did NOT get the refund alert above (btcProviderId already got sendSystemAlert)
    const otherPartyId = btcProviderId === trade.buyer_id ? trade.seller_id : trade.buyer_id;
    if (otherPartyId) sendTradeAlert(otherPartyId, trade, 'trade_cancelled').catch(() => {});

    console.log(`✅ Trade ${tradeId.slice(0,8)} cancelled and closed`);

    // ── 8. Re-evaluate offer status now that the provider's balance is restored ─
    if (btcProviderId) updateOfferStatus(btcProviderId).catch(() => {});

    return {
      success: true,
      message: `Trade cancelled. ${refundAmount > 0 ? 'Funds returned to wallet.' : ''}`,
    };
  }

  // ============================================================
  // CANCEL EXPIRED TRADE (auto-cancel)
  // Called by timer or manual trigger
  // ============================================================
  async cancelExpiredTrade(tradeId) {
    return this.cancelTrade(tradeId, 'Trade expired — time limit reached');
  }

  // ============================================================
  // PROCESS ALL EXPIRED TRADES
  // Called by a cron job or on server startup
  // ============================================================
  async processExpiredTrades() {
    // NOTE: PAYMENT_SENT is intentionally excluded — buyer may have already sent
    // fiat payment and auto-cancelling would refund the seller unfairly.
    // 5-minute grace buffer: only cancel trades that expired MORE than 5 minutes ago.
    // This gives buyers who paid just before the timer ended a window to click "Mark Paid".
    const graceDeadline = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: expired, error } = await supabaseAdmin
      .from('trades')
      .select('id')
      .in('status', ['CREATED', 'FUNDS_LOCKED'])
      .lt('expires_at', graceDeadline);

    if (error || !expired || expired.length === 0) return 0;

    console.log(`[Escrow] Processing ${expired.length} expired trades...`);

    let count = 0;
    for (const t of expired) {
      try {
        await this.cancelExpiredTrade(t.id);
        count++;
        console.log(`✅ [Escrow] Trade ${t.id.slice(0,8)} auto-cancelled`);
      } catch (e) {
        console.error(`[Escrow] Failed to cancel ${t.id.slice(0,8)}:`, e.message);
      }
    }

    return count;
  }

  // ============================================================
  // DISPUTE RESOLUTION
  // Called by moderator — either buyer wins or seller wins
  // ============================================================
  async resolveDispute(tradeId, resolution, moderatorId, notes) {
    console.log(`\n👨‍⚖️ resolveDispute — Trade: ${tradeId.slice(0,8)}, Resolution: ${resolution}`);

    const { data: trade } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (!trade) throw new Error('Trade not found');

    if (resolution === 'BUYER_WINS') {
      // Release to buyer — same as normal release
      await this.releaseBitcoinToBuyer(tradeId, trade.seller_id);

      await supabaseAdmin.from('trades').update({
        dispute_resolution: 'BUYER_WINS',
        dispute_notes:      notes,
        resolved_by:        moderatorId,
        resolved_at:        new Date().toISOString(),
      }).eq('id', tradeId);

    } else if (resolution === 'SELLER_WINS') {
      // Refund to seller — same as cancel
      const sellerWinsResult = await this.cancelTrade(tradeId, `Dispute resolved — SELLER WINS. ${notes || ''}`);
      if (!sellerWinsResult?.success) {
        throw new Error(`Escrow refund failed for SELLER_WINS: ${sellerWinsResult?.message || 'unknown error'}`);
      }

      await supabaseAdmin.from('trades').update({
        status:             'COMPLETED',
        dispute_resolution: 'SELLER_WINS',
        dispute_notes:      notes,
        resolved_by:        moderatorId,
        resolved_at:        new Date().toISOString(),
      }).eq('id', tradeId);

    } else if (resolution === 'CANCEL') {
      // Refund BTC to seller (whoever locked it), mark as CANCELLED
      const cancelResult = await this.cancelTrade(tradeId, `Dispute resolved — CANCELLED by moderator. ${notes || ''}`);
      if (!cancelResult?.success) {
        throw new Error(`Escrow refund failed for CANCEL resolution: ${cancelResult?.message || 'unknown error'}`);
      }

      await supabaseAdmin.from('trades').update({
        status:             'CANCELLED',
        dispute_resolution: 'CANCEL',
        dispute_notes:      notes,
        resolved_by:        moderatorId,
        resolved_at:        new Date().toISOString(),
      }).eq('id', tradeId);

    } else {
      throw new Error(`Unknown resolution: ${resolution}. Use BUYER_WINS, SELLER_WINS, or CANCEL`);
    }

    console.log(`✅ Dispute resolved: ${resolution}`);
    return { success: true, resolution, tradeId };
  }

  // ── Update trade stats for a user ─────────────────────────────────────────
  async updateTradeStats(userId) {
    try {
      const { data: all } = await supabaseAdmin
        .from('trades')
        .select('status')
        .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);

      const completed = (all || []).filter(t => t.status === 'COMPLETED').length;
      const rate      = all?.length > 0 ? Math.round((completed / all.length) * 100) : 100;

      // Never let total_trades go down — preserve historical trade counts
      const { data: cur } = await supabaseAdmin.from('users').select('total_trades').eq('id', userId).single();
      const newTotal = Math.max(parseInt(cur?.total_trades || 0), completed);

      await supabaseAdmin
        .from('users')
        .update({ total_trades: newTotal, completion_rate: rate })
        .eq('id', userId);
    } catch (e) {
      console.error('[Escrow] updateTradeStats error:', e.message);
    }
  }

  // ── Handle affiliate commission ────────────────────────────────────────────
  async createAffiliateEarning(tradeId, buyerId, amountBtc) {
    try {
      const { data: buyer } = await supabaseAdmin
        .from('users').select('referred_by').eq('id', buyerId).single();
      if (!buyer?.referred_by) return;

      const { data: referrer } = await supabaseAdmin
        .from('users').select('total_referrals').eq('id', buyer.referred_by).single();

      let rate = 0.1;
      const count = referrer?.total_referrals || 0;
      if (count >= 100) rate = 0.3;
      else if (count >= 50) rate = 0.25;
      else if (count >= 25) rate = 0.2;
      else if (count >= 10) rate = 0.15;

      const commissionBtc = parseFloat(amountBtc) * (rate / 100);

      await supabaseAdmin.from('affiliate_earnings').insert({
        referrer_id:       buyer.referred_by,
        referred_user_id:  buyerId,
        trade_id:          tradeId,
        commission_btc:    commissionBtc,
        trade_amount_btc:  amountBtc,
        commission_rate:   rate,
        status:            'COMPLETED',
        created_at:        new Date().toISOString(),
      });

      console.log(`✅ [Escrow] Affiliate: ${commissionBtc.toFixed(8)} BTC to ${buyer.referred_by.slice(0,8)}`);
    } catch (e) {
      console.error('[Escrow] Affiliate error:', e.message);
    }
  }
}

module.exports = new TradeEscrowService();