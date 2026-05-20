// services/offerStatusService.js
// Keeps offer visibility in sync with seller wallet balances.
//   - SELL / SELL_BITCOIN / BUY_GIFT_CARD → creator must hold >= $10 BTC
//   - Runs at startup and every 10 minutes via the interval in server.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const BTC_REQUIRED_TYPES = ['SELL', 'SELL_BITCOIN', 'BUY_GIFT_CARD'];
const MIN_USD = 10;
const BTC_PRICE_APPROX = 88000; // used only when listing has no bitcoin_price set

/** Called by depositMonitor / tradeEscrowService after a balance change for one user. */
async function updateOfferStatus(userId) {
  try {
    const { data: wallet } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', userId).maybeSingle();
    const balUsd = parseFloat(wallet?.balance_btc || 0) * BTC_PRICE_APPROX;

    const { data: offers } = await supabaseAdmin
      .from('listings')
      .select('id, status, listing_type')
      .eq('seller_id', userId)
      .in('listing_type', BTC_REQUIRED_TYPES)
      .in('status', ['ACTIVE', 'PAUSED']);

    if (!offers || offers.length === 0) return { paused: 0, reactivated: 0 };

    const toPause      = offers.filter(o => o.status === 'ACTIVE'  && balUsd < MIN_USD).map(o => o.id);
    const toReactivate = offers.filter(o => o.status === 'PAUSED'  && balUsd >= MIN_USD).map(o => o.id);

    if (toPause.length > 0) {
      await supabaseAdmin.from('listings')
        .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
        .in('id', toPause);
      console.log(`[offerStatus] Paused ${toPause.length} offer(s) for user ${userId} (balance $${balUsd.toFixed(2)})`);
    }
    if (toReactivate.length > 0) {
      await supabaseAdmin.from('listings')
        .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
        .in('id', toReactivate);
      console.log(`[offerStatus] Reactivated ${toReactivate.length} offer(s) for user ${userId} (balance $${balUsd.toFixed(2)})`);
    }

    return { paused: toPause.length, reactivated: toReactivate.length };
  } catch (err) {
    console.error('[updateOfferStatus]', err.message);
    return { paused: 0, reactivated: 0 };
  }
}

/**
 * Full sweep — checks every ACTIVE/PAUSED BTC-required listing against live balances.
 * Runs at startup and every 10 minutes.
 */
async function syncAllOfferStatuses() {
  try {
    // Fetch all ACTIVE and PAUSED BTC-required listings (include limits for cap logic)
    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      .select('id, seller_id, status, listing_type, bitcoin_price, min_limit_usd, max_limit_usd, max_limit_local')
      .in('listing_type', BTC_REQUIRED_TYPES)
      .in('status', ['ACTIVE', 'PAUSED']);

    if (error) { console.error('[syncAllOfferStatuses] DB error:', error.message); return; }
    if (!listings || listings.length === 0) {
      console.log('[syncAllOfferStatuses] No BTC-required listings found.');
      return;
    }

    // Fetch wallet balances for all unique sellers
    const sellerIds = [...new Set(listings.map(l => l.seller_id))];
    const { data: wallets } = await supabaseAdmin
      .from('wallets').select('user_id, balance_btc').in('user_id', sellerIds);

    const balMap = {};
    (wallets || []).forEach(w => { balMap[w.user_id] = parseFloat(w.balance_btc || 0); });

    const toPause      = [];
    const toReactivate = [];

    for (const listing of listings) {
      const btcPrice  = parseFloat(listing.bitcoin_price) || BTC_PRICE_APPROX;
      const balUsd    = (balMap[listing.seller_id] || 0) * btcPrice;
      const minUsd    = parseFloat(listing.min_limit_usd || 0);
      const maxUsd    = parseFloat(listing.max_limit_usd || 0);
      const maxLocal  = parseFloat(listing.max_limit_local || 0);

      // Pause if balance < $10 or can't meet the offer's own minimum
      const cantFulfil = balUsd < MIN_USD || (minUsd > 0 && balUsd < minUsd);
      if (listing.status === 'ACTIVE'  && cantFulfil)  toPause.push(listing.id);
      if (listing.status === 'PAUSED'  && !cantFulfil) toReactivate.push(listing.id);

      // Cap max_limit_usd (and max_limit_local) in DB when seller balance is lower than listed max
      if (maxUsd > 0 && balUsd > 0 && balUsd < maxUsd) {
        const cappedMax      = Math.max(MIN_USD, parseFloat(balUsd.toFixed(2)));
        const localRate      = maxUsd > 0 && maxLocal > 0 ? maxLocal / maxUsd : 1;
        const cappedMaxLocal = parseFloat((cappedMax * localRate).toFixed(2));
        supabaseAdmin.from('listings')
          .update({ max_limit_usd: cappedMax, max_limit_local: cappedMaxLocal, updated_at: new Date().toISOString() })
          .eq('id', listing.id)
          .then(() => {})
          .catch(e => console.error(`[syncAllOfferStatuses] cap error ${listing.id.slice(0,8)}:`, e.message));
      }
    }

    if (toPause.length > 0) {
      await supabaseAdmin.from('listings')
        .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
        .in('id', toPause);
      console.log(`[syncAllOfferStatuses] ⏸  Paused ${toPause.length} offer(s) with insufficient balance.`);
    }
    if (toReactivate.length > 0) {
      await supabaseAdmin.from('listings')
        .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
        .in('id', toReactivate);
      console.log(`[syncAllOfferStatuses] ✅ Reactivated ${toReactivate.length} offer(s) with sufficient balance.`);
    }
    if (toPause.length === 0 && toReactivate.length === 0) {
      console.log('[syncAllOfferStatuses] ✅ All offer statuses are already correct.');
    }
  } catch (err) {
    console.error('[syncAllOfferStatuses]', err.message);
  }
}

module.exports = { updateOfferStatus, syncAllOfferStatuses };
