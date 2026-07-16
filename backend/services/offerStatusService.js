// services/offerStatusService.js
// Keeps offer visibility in sync with seller wallet balances.
//   - SELL / SELL_BITCOIN / BUY_GIFT_CARD → creator must hold >= $10 of the offer's asset
//     (BTC for BUY_GIFT_CARD and BTC-asset offers, USDT for USDT-asset offers)
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
      .from('wallets').select('balance_btc, balance_usdt').eq('user_id', userId).maybeSingle();
    const btcBalUsd  = parseFloat(wallet?.balance_btc || 0) * BTC_PRICE_APPROX;
    const usdtBalUsd = parseFloat(wallet?.balance_usdt || 0); // 1 USDT ≈ $1

    const { data: offers } = await supabaseAdmin
      .from('listings')
      .select('id, status, listing_type, asset')
      .eq('seller_id', userId)
      .in('listing_type', BTC_REQUIRED_TYPES)
      .in('status', ['ACTIVE', 'PAUSED']);

    if (!offers || offers.length === 0) return { paused: 0, reactivated: 0 };

    const balUsdFor = (o) => (o.asset === 'USDT' ? usdtBalUsd : btcBalUsd);
    const toPause      = offers.filter(o => o.status === 'ACTIVE'  && balUsdFor(o) < MIN_USD).map(o => o.id);
    const toReactivate = offers.filter(o => o.status === 'PAUSED'  && balUsdFor(o) >= MIN_USD).map(o => o.id);

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
    // Fetch all ACTIVE and PAUSED BTC/USDT-required listings (include limits for cap logic)
    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      .select('id, seller_id, status, listing_type, asset, bitcoin_price, min_limit_usd, max_limit_usd, max_limit_local')
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
      .from('wallets').select('user_id, balance_btc, balance_usdt').in('user_id', sellerIds);

    const balMap = {};
    const usdtBalMap = {};
    (wallets || []).forEach(w => {
      balMap[w.user_id] = parseFloat(w.balance_btc || 0);
      usdtBalMap[w.user_id] = parseFloat(w.balance_usdt || 0);
    });

    const toPause      = [];
    const toReactivate = [];

    for (const listing of listings) {
      const isUsdt    = listing.asset === 'USDT';
      const btcPrice  = parseFloat(listing.bitcoin_price) || BTC_PRICE_APPROX;
      const balUsd    = isUsdt
        ? (usdtBalMap[listing.seller_id] || 0) // 1 USDT ≈ $1
        : (balMap[listing.seller_id] || 0) * btcPrice;
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

/**
 * Deactivates offers from sellers who haven't been active for 10+ days.
 * Runs at startup and every 6 hours. Sends one in-app notification per seller.
 */
async function deactivateStaleOffers() {
  try {
    const TEN_DAYS_AGO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // All currently ACTIVE listings
    const { data: activeListings, error: listErr } = await supabaseAdmin
      .from('listings')
      .select('id, seller_id, payment_method, currency')
      .eq('status', 'ACTIVE');

    if (listErr) { console.error('[deactivateStaleOffers] listings query:', listErr.message); return; }
    if (!activeListings?.length) return;

    const sellerIds = [...new Set(activeListings.map(l => l.seller_id))];

    // Fetch last activity for all sellers
    const { data: sellers, error: usersErr } = await supabaseAdmin
      .from('users')
      .select('id, username, last_seen_at, last_login')
      .in('id', sellerIds);

    if (usersErr || !sellers?.length) return;

    // Sellers where BOTH last_seen_at and last_login are older than 10 days (or null)
    const staleSellers = new Set(
      sellers
        .filter(s => {
          const lastActive = s.last_seen_at || s.last_login;
          return !lastActive || new Date(lastActive) < new Date(TEN_DAYS_AGO);
        })
        .map(s => s.id)
    );

    if (staleSellers.size === 0) {
      console.log('[deactivateStaleOffers] ✅ No stale sellers — all sellers active within 10 days.');
      return;
    }

    const staleListings = activeListings.filter(l => staleSellers.has(l.seller_id));
    if (!staleListings.length) return;

    // Pause all stale listings
    const staleIds = staleListings.map(l => l.id);
    await supabaseAdmin
      .from('listings')
      .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
      .in('id', staleIds);

    console.log(`[deactivateStaleOffers] ⏸  Paused ${staleIds.length} offer(s) for ${staleSellers.size} inactive seller(s).`);

    // One notification per seller (not per offer)
    const seen = new Set();
    const notifications = [];
    for (const l of staleListings) {
      if (seen.has(l.seller_id)) continue;
      seen.add(l.seller_id);
      const count = staleListings.filter(x => x.seller_id === l.seller_id).length;
      const plural = count > 1;
      notifications.push({
        user_id:    l.seller_id,
        type:       'offer_paused',
        title:      `⏸ Your offer${plural ? 's have' : ' has'} been paused`,
        message:    `Your ${plural ? count + ' offers were' : 'offer was'} automatically paused — you haven't been active on PRAQEN for over 10 days. Visit My Offers to reactivate and start receiving trade requests again.`,
        action:     '/my-listings',
        is_read:    false,
        created_at: new Date().toISOString(),
      });
    }

    if (notifications.length > 0) {
      await supabaseAdmin.from('notifications').insert(notifications);
      console.log(`[deactivateStaleOffers] 🔔 Sent ${notifications.length} reactivation notification(s).`);
    }
  } catch (err) {
    console.error('[deactivateStaleOffers]', err.message);
  }
}

module.exports = { updateOfferStatus, syncAllOfferStatuses, deactivateStaleOffers };
