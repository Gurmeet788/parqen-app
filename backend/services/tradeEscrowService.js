// services/tradeEscrowService.js
// PRAQEN — Trade Escrow Service (Production Ready)
// Replaces old Coinbase SDK with HD Wallet system
// Handles: lock, release, refund, cancel, expired trades

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWallet = require('./hdWalletService');
const { checkAndAwardBadges } = require('./badgeService');
const { updateOfferStatus } = require('./offerStatusService');
const { sendSystemAlert } = require('./pushNotificationService');

// ── Supabase admin (bypasses RLS) ─────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const FEE_RATE            = 0.005;
const COMPANY_WALLET_ID   = '14762cd0-d3b2-474f-acab-fe0071961e9a';
const COMPANY_BTC_ADDRESS = 'bc1qd8z3zdn2e3eul6y8nmcyjvgle3yzv8ttvsjp49';

// Auto-pause a seller's SELL listings when their BTC balance hits zero.
// Called after every trade completion and every wallet withdrawal.
// NEVER throws — must not break the caller.
async function pauseSellOffersIfEmpty(sellerId) {
  try {
    const { data: bal } = await supabaseAdmin
      .from('user_balances').select('balance_btc').eq('user_id', sellerId).single();
    const balance = parseFloat(bal?.balance_btc || 0);
    if (balance > 0.000001) return; // Still has funds — nothing to do

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
  } catch (err) {
    console.error('[pauseSellOffersIfEmpty]', err.message);
  }
}

class TradeEscrowService {

  constructor() {
    this.feeRate = FEE_RATE;
  }

  // ── Helper: send in-app notification ───────────────────────────────────────
  async notify(userId, type, title, message, action) {
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id:    userId,
        type,
        title,
        message,
        action:     action || '/my-trades',
        is_read:    false,
        created_at: new Date().toISOString(),
      });
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

    // ── 1. Get BTC provider's current balance from BOTH tables in parallel ────
    // user_balances can lag behind fresh deposits — always use the higher value.
    const [{ data: providerBal }, { data: walletRowInit }] = await Promise.all([
      supabaseAdmin.from('user_balances').select('balance_btc, balance_usd').eq('user_id', btcProviderId).maybeSingle(),
      supabaseAdmin.from('user_wallets').select('balance_btc').eq('user_id', btcProviderId).maybeSingle(),
    ]);
    const balBtc_    = parseFloat(providerBal?.balance_btc || 0);
    const walletBtc_ = parseFloat(walletRowInit?.balance_btc || 0);
    let currentBalance = Math.max(balBtc_, walletBtc_);
    // Sync user_balances if user_wallets is ahead (deposit monitor hasn't run yet)
    if (walletBtc_ > balBtc_) {
      await supabaseAdmin.from('user_balances')
        .upsert({ user_id: btcProviderId, balance_btc: walletBtc_, updated_at: new Date().toISOString() });
    }

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
    console.log(`   Fee (0.5%):     ${feeBtc} BTC`);

    // ── 3. Deduct from BTC provider's balance (locked into escrow) ─────────
    const newBalance = parseFloat((currentBalance - amount).toFixed(8));
    // Keep balance_usd in sync: deduct proportionally so the stored USD value
    // stays accurate after the lock (avoids drift in wallet display).
    const currentBalUsd = parseFloat(providerBal?.balance_usd || 0);
    const newBalUsd = currentBalance > 0
      ? parseFloat((currentBalUsd * newBalance / currentBalance).toFixed(2))
      : 0;

    const { error: deductErr } = await supabaseAdmin
      .from('user_balances')
      .update({
        balance_btc: newBalance,
        balance_usd: newBalUsd,
        updated_at:  new Date().toISOString(),
      })
      .eq('user_id', btcProviderId);

    if (deductErr) throw new Error(`Failed to lock funds: ${deductErr.message}`);

    // Sync user_wallets — subtract from its OWN current value.
    // DO NOT set it to newBalance from user_balances: if the two tables were out of sync,
    // that would inflate user_wallets and show fake BTC to the seller.
    const { data: walletRow } = await supabaseAdmin
      .from('user_wallets')
      .select('balance_btc')
      .eq('user_id', btcProviderId)
      .maybeSingle();

    if (walletRow) {
      const walletNewBal = Math.max(0, parseFloat((parseFloat(walletRow.balance_btc || 0) - amount).toFixed(8)));
      await supabaseAdmin
        .from('user_wallets')
        .update({ balance_btc: walletNewBal, updated_at: new Date().toISOString() })
        .eq('user_id', btcProviderId);
    }

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
      // Revert balance deduction if record creation fails
      await supabaseAdmin.from('user_balances')
        .update({ balance_btc: currentBalance, balance_usd: currentBalUsd, updated_at: new Date().toISOString() })
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

    return {
      success:      true,
      escrowAddress,
      lockTxHash,
      amountLocked: amount,
      feeBtc,
      newBalance,
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

    console.log(`✅ Trade ${tradeId.slice(0,8)} marked as PAYMENT_SENT`);

    return {
      success: true,
      message: 'Payment marked. Waiting for seller to verify and release Bitcoin.',
    };
  }

  // ============================================================
  // RELEASE BITCOIN TO BUYER
  // Called when seller clicks "Release Bitcoin"
  // Splits: 99.5% to buyer's PRAQEN wallet + 0.5% to PRAQEN fee wallet
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

    const allowedStatuses = ['PAYMENT_SENT', 'PAID', 'FUNDS_LOCKED'];
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

    const amount      = parseFloat(tradeData.amount_btc);
    const buyerGets   = parseFloat((amount * 0.995).toFixed(8));
    const platformFee = parseFloat((amount * 0.005).toFixed(8));

    console.log(`💰 Releasing ${buyerGets} BTC → receiver: ${btcReceiverId.slice(0, 8)}`);

    const crypto = require('crypto');
    const releaseTxHash = 'ESCROW_RELEASE_' + crypto
      .createHash('sha256')
      .update(`${tradeId}:${btcReceiverId}:${buyerGets}:${Date.now()}`)
      .digest('hex')
      .slice(0, 32)
      .toUpperCase();

    console.log(`🔓 Release reference: ${releaseTxHash}`);

    // ── Atomically claim the escrow lock before touching any balance ──────────
    // UPDATE WHERE status = 'LOCKED' is a single atomic DB operation.
    // If two requests race, only one will match the WHERE clause and get rows
    // back. The other gets an empty result and throws, preventing double-credit.
    const { data: claimedRows, error: claimErr } = await supabaseAdmin
        .from('escrow_locks')
        .update({ status: 'RELEASING' })
        .eq('trade_id', tradeId)
        .eq('status', 'LOCKED')
        .select('id');

    if (claimErr) throw new Error(`Failed to claim escrow lock: ${claimErr.message}`);
    if (!claimedRows || claimedRows.length === 0) {
        throw new Error('Escrow already released or being released by a concurrent request — no action taken');
    }

    // ── Credit the BTC receiver's balance (user_balances + user_wallets) ────
    const { data: currentBal } = await supabaseAdmin
        .from('user_balances')
        .select('balance_btc, balance_usd')
        .eq('user_id', btcReceiverId)
        .single();

    const newReceiverBalance = parseFloat(
        (parseFloat(currentBal?.balance_btc || 0) + buyerGets).toFixed(8)
    );
    // Credit USD: use the trade's recorded USD amount (net of 0.5% fee) so balance_usd
    // stays accurate and the wallet page shows the correct dollar value.
    const buyerGetsUsd = parseFloat(((parseFloat(tradeData.amount_usd || 0)) * 0.995).toFixed(2));
    const newReceiverUsd = parseFloat(
        (parseFloat(currentBal?.balance_usd || 0) + buyerGetsUsd).toFixed(2)
    );

    const { error: balError } = await supabaseAdmin
        .from('user_balances')
        .upsert({
            user_id:     btcReceiverId,
            balance_btc: newReceiverBalance,
            balance_usd: newReceiverUsd,
            updated_at:  new Date().toISOString(),
        });

    if (balError) throw new Error(`Balance update failed: ${balError.message}`);

    // Also sync user_wallets so the wallet page shows the updated balance
    await supabaseAdmin
        .from('user_wallets')
        .update({ balance_btc: newReceiverBalance, updated_at: new Date().toISOString() })
        .eq('user_id', btcReceiverId);

    // ── Mark escrow lock as released ───────────────────────────────────────
    await supabaseAdmin
        .from('escrow_locks')
        .update({ status: 'RELEASED', released_at: new Date().toISOString() })
        .eq('trade_id', tradeId);

    // ── Complete the trade ─────────────────────────────────────────────────
    const { error: tradeUpdateError } = await supabaseAdmin
        .from('trades')
        .update({
            status:            'COMPLETED',
            completed_at:      new Date().toISOString(),
            buyer_btc_txhash:  releaseTxHash,
            fee_status:        'PENDING',
        })
        .eq('id', tradeId);

    if (tradeUpdateError) {
        console.warn('⚠️  Trade status update failed (DB trigger issue):', tradeUpdateError.message);
    }

    // ── Collect 0.5% platform fee from seller — NEVER breaks the trade ─────
    // Fee = trade.amount_btc × 0.005
    // Seller is whoever locked BTC (btcProviderId from escrow_locks)
    try {
        const { data: escrowLock } = await supabaseAdmin
            .from('escrow_locks')
            .select('seller_id')
            .eq('trade_id', tradeId)
            .single();

        // sellerId = whoever locked BTC into escrow (the "BTC provider")
        const feePayerId = escrowLock?.seller_id || tradeData.seller_id;

        console.log(`💸 Collecting fee: ${platformFee.toFixed(8)} BTC from ${feePayerId.slice(0,8)}`);

        // 1. Get current company balance
        const { data: companyBal } = await supabaseAdmin
            .from('user_balances')
            .select('balance_btc')
            .eq('user_id', COMPANY_WALLET_ID)
            .single();

        const newCompanyBalance = parseFloat(
            (parseFloat(companyBal?.balance_btc || 0) + platformFee).toFixed(8)
        );

        // 2. Credit company wallet in user_balances
        await supabaseAdmin
            .from('user_balances')
            .upsert({
                user_id:     COMPANY_WALLET_ID,
                balance_btc: newCompanyBalance,
                updated_at:  new Date().toISOString(),
            });

        // 3. Sync company user_wallets
        await supabaseAdmin
            .from('user_wallets')
            .update({ balance_btc: newCompanyBalance, updated_at: new Date().toISOString() })
            .eq('user_id', COMPANY_WALLET_ID);

        // 4. Record fee in wallet_transactions
        await supabaseAdmin
            .from('wallet_transactions')
            .insert({
                user_id:    COMPANY_WALLET_ID,
                type:       'FEE',
                amount_btc: platformFee,
                status:     'CONFIRMED',
                tx_hash:    releaseTxHash,
                notes:      `0.5% fee — Trade #${tradeId.slice(0, 8).toUpperCase()} (paid by seller)`,
                created_at: new Date().toISOString(),
            });

        // 5. Mark trade fee as collected
        await supabaseAdmin
            .from('trades')
            .update({ fee_status: 'COLLECTED', fee_collected_at: new Date().toISOString() })
            .eq('id', tradeId);

        console.log(`✅ Fee collected: ${platformFee.toFixed(8)} BTC → company wallet (balance: ${newCompanyBalance.toFixed(8)} BTC)`);

    } catch (feeErr) {
        // Fee failure must NEVER break the trade — it is already COMPLETED
        console.error(`⚠️ [Escrow] Fee collection failed (trade still COMPLETED):`, feeErr.message);
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
    }).catch(() => {});

    // ── Notify both parties ────────────────────────────────────────────────
    await this.notify(
        btcReceiverId, 'trade', '🎉 Bitcoin Released!',
        `Trade #${tradeId.slice(0, 8).toUpperCase()} complete! ₿${buyerGets.toFixed(8)} added to your wallet.`,
        `/trade/${tradeId}`
    );
    await this.notify(
        releaserId, 'trade', '✅ Trade Complete',
        `Trade #${tradeId.slice(0, 8).toUpperCase()} completed. 0.5% platform fee (₿${platformFee.toFixed(8)}) collected.`,
        `/trade/${tradeId}`
    );

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
  // CANCEL TRADE — refund seller
  // Called by buyer cancel, auto-cancel, or dispute resolution
  // ============================================================
  async cancelTrade(tradeId, reason) {
    console.log(`\n❌ cancelTrade — Trade: ${tradeId.slice(0,8)}, Reason: ${reason}`);

    const { data: trade, error } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (error || !trade) throw new Error('Trade not found');

    const cancellable = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN', 'PAYMENT_SENT'];
    if (!cancellable.includes(trade.status)) {
      return { success: false, message: `Trade cannot be cancelled — status is ${trade.status}` };
    }

    // ── Refund seller if funds were locked ─────────────────────────────────
    const { data: escrow } = await supabaseAdmin
      .from('escrow_locks')
      .select('*')
      .eq('trade_id', tradeId)
      .single();

    if (escrow && escrow.status === 'LOCKED') {
      const refundAmount = parseFloat(escrow.amount_btc || trade.escrow_amount || trade.amount_btc || 0);

      // escrow.seller_id holds the btcProviderId (buyer in gift card trades, seller in BTC trades)
      const btcProviderId = escrow.seller_id || trade.seller_id;

      const { data: providerBal } = await supabaseAdmin
        .from('user_balances')
        .select('balance_btc, balance_usd')
        .eq('user_id', btcProviderId)
        .single();

      const newProviderBalance = parseFloat((parseFloat(providerBal?.balance_btc || 0) + refundAmount).toFixed(8));
      // Restore balance_usd proportionally: refund the USD equivalent of the returned BTC.
      // Use the trade's amount_usd as the source of truth for the USD value being returned.
      const refundUsd = parseFloat((parseFloat(trade.amount_usd || 0)).toFixed(2));
      const newProviderUsd = parseFloat((parseFloat(providerBal?.balance_usd || 0) + refundUsd).toFixed(2));

      await supabaseAdmin
        .from('user_balances')
        .update({
          balance_btc: newProviderBalance,
          balance_usd: newProviderUsd,
          updated_at:  new Date().toISOString(),
        })
        .eq('user_id', btcProviderId);

      // Sync user_wallets so refund shows immediately on wallet page
      await supabaseAdmin
        .from('user_wallets')
        .update({ balance_btc: newProviderBalance, updated_at: new Date().toISOString() })
        .eq('user_id', btcProviderId);

      // Mark escrow as refunded
      await supabaseAdmin
        .from('escrow_locks')
        .update({ status: 'REFUNDED', released_at: new Date().toISOString() })
        .eq('trade_id', tradeId);

      await this.logTransaction(btcProviderId, 'ESCROW_REFUND', refundAmount, null,
        `Refund for cancelled trade #${tradeId.slice(0,8)}`);

      // Push notification to seller
      sendSystemAlert(
        btcProviderId,
        '💸 Escrow Refunded',
        `Trade #${tradeId.slice(0,8).toUpperCase()} cancelled — ${refundAmount.toFixed(8)} BTC returned to your wallet.`,
        'https://praqen.com/wallet'
      ).catch(err => console.error('[Escrow] Refund push error:', err.message));

      // Audit log (fire-and-forget — table may not exist on first deploy)
      supabaseAdmin.from('balance_audit').insert({
        user_id:     btcProviderId,
        change_btc:  refundAmount,
        new_balance: newProviderBalance,
        reason:      'ESCROW_REFUND',
        trade_id:    tradeId,
        created_at:  new Date().toISOString(),
      }).catch(() => {});

      console.log(`   Refunded ${refundAmount} BTC to provider ${btcProviderId.slice(0,8)}`);
    }

    // ── Update trade status ────────────────────────────────────────────────
    await supabaseAdmin
      .from('trades')
      .update({
        status:        'CANCELLED',
        cancel_reason: reason || 'Trade cancelled',
        cancelled_at:  new Date().toISOString(),
      })
      .eq('id', tradeId);

    // Notify both parties
    for (const uid of [trade.buyer_id, trade.seller_id]) {
      await this.notify(uid, 'trade', '❌ Trade Cancelled',
        `Trade #${tradeId.slice(0,8).toUpperCase()} cancelled. ${reason || ''}`,
        `/trade/${tradeId}`);
    }

    console.log(`✅ Trade ${tradeId.slice(0,8)} cancelled`);

    // Refund restored the BTC provider's balance — re-evaluate their offer status
    if (escrow) {
      const btcProviderId = escrow.seller_id || trade.seller_id;
      if (btcProviderId) updateOfferStatus(btcProviderId).catch(() => {});
    }

    return {
      success: true,
      message: `Trade cancelled. ${escrow ? 'Funds returned to seller.' : ''}`,
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
    const { data: expired, error } = await supabaseAdmin
      .from('trades')
      .select('id')
      .in('status', ['CREATED', 'FUNDS_LOCKED'])
      .lt('expires_at', new Date().toISOString());

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
      await this.cancelTrade(tradeId, `Dispute resolved — SELLER WINS. ${notes || ''}`);

      await supabaseAdmin.from('trades').update({
        status:             'COMPLETED',
        dispute_resolution: 'SELLER_WINS',
        dispute_notes:      notes,
        resolved_by:        moderatorId,
        resolved_at:        new Date().toISOString(),
      }).eq('id', tradeId);

    } else {
      throw new Error(`Unknown resolution: ${resolution}. Use BUYER_WINS or SELLER_WINS`);
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

      const total    = (all || []).filter(t => t.status === 'COMPLETED').length;
      const rate     = all?.length > 0 ? Math.round((total / all.length) * 100) : 100;

      await supabaseAdmin
        .from('users')
        .update({ total_trades: total, completion_rate: rate })
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