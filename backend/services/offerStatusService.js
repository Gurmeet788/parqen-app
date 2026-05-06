// services/offerStatusService.js
// Offer visibility is now enforced at the API level (GET /api/listings, GET /api/offers):
//   - SELL offers from sellers with < $10 BTC are hidden from the market automatically.
//   - Offers are NEVER auto-paused in the database — they stay ACTIVE until the owner
//     manually pauses or deletes them.
//
// This file is kept so existing callers (hdWalletRoutes, depositMonitor,
// tradeEscrowService) continue to compile and run without changes.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SELL_TYPES = ['SELL', 'SELL_BITCOIN'];

/**
 * No-op — auto-pause has been removed.
 * Offers stay ACTIVE in DB regardless of balance; balance filtering
 * happens at query time in GET /api/listings and GET /api/offers.
 */
async function updateOfferStatus(userId) {
  return { paused: 0, reactivated: 0 };
}

/**
 * One-time startup fix: reactivate any SELL offers that were wrongly paused
 * by the previous auto-pause logic (which queried the wrong table and saw
 * every seller's balance as 0).
 */
async function syncAllOfferStatuses() {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from('listings')
      .select('id')
      .in('listing_type', SELL_TYPES)
      .eq('status', 'PAUSED');

    if (error) {
      console.error('[syncAllOfferStatuses] DB error:', error.message);
      return;
    }

    if (!rows || rows.length === 0) {
      console.log('[syncAllOfferStatuses] No paused offers found — nothing to reactivate.');
      return;
    }

    const ids = rows.map(r => r.id);
    const { error: updateError } = await supabaseAdmin
      .from('listings')
      .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
      .in('id', ids);

    if (updateError) {
      console.error('[syncAllOfferStatuses] Update error:', updateError.message);
      return;
    }

    console.log(`[syncAllOfferStatuses] ✅ Reactivated ${ids.length} wrongly-paused offer(s).`);
  } catch (err) {
    console.error('[syncAllOfferStatuses]', err.message);
  }
}

module.exports = { updateOfferStatus, syncAllOfferStatuses };
