// scripts/unlock-orphaned-escrows.js
// ONE-TIME repair: move stuck locked_balance_btc back to balance_btc
// for users whose trades are all CANCELLED or COMPLETED.
//
// SAFETY: wallets with ANY active trade are NEVER touched.
//
// Usage:
//   node scripts/unlock-orphaned-escrows.js          ← dry run (safe, no writes)
//   node scripts/unlock-orphaned-escrows.js --apply  ← write the fixes

'use strict';

const path   = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// Statuses that mean a trade is still in progress — wallet MUST NOT be touched
const ACTIVE_STATUSES = [
  'CREATED',
  'FUNDS_LOCKED',
  'ESCROW',
  'ACTIVE',
  'OPEN',
  'PAYMENT_SENT',
  'PAID',
  'DISPUTED',
];

const DRY_RUN = !process.argv.includes('--apply');

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n) { return parseFloat(n || 0).toFixed(8); }

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        PRAQEN — Orphaned Escrow Repair Script           ║');
  console.log(`║        Mode: ${DRY_RUN ? 'DRY RUN  (no writes)           ' : 'APPLY    (will write to DB)     '}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // ── Step 1: find every wallet with stuck locked_balance_btc ─────────────────
  const { data: lockedWallets, error: walletErr } = await db
    .from('wallets')
    .select('user_id, balance_btc, locked_balance_btc')
    .gt('locked_balance_btc', 0);

  if (walletErr) {
    console.error('❌  Failed to query wallets:', walletErr.message);
    process.exit(1);
  }

  if (!lockedWallets || lockedWallets.length === 0) {
    console.log('✅  No wallets with locked_balance_btc > 0. Nothing to do.');
    return;
  }

  console.log(`Found ${lockedWallets.length} wallet(s) with locked_balance_btc > 0:\n`);

  const safe    = [];   // safe to unlock
  const skipped = [];   // have active trades — must not touch

  for (const wallet of lockedWallets) {
    const { user_id, balance_btc, locked_balance_btc } = wallet;

    // ── Step 2: check for active trades for this user ─────────────────────────
    const { data: activeTrades, error: tradeErr } = await db
      .from('trades')
      .select('id, status')
      .or(`seller_id.eq.${user_id},buyer_id.eq.${user_id}`)
      .in('status', ACTIVE_STATUSES);

    if (tradeErr) {
      console.warn(`  ⚠️  Could not check trades for ${user_id.slice(0,8)}: ${tradeErr.message} — SKIPPING`);
      skipped.push({ ...wallet, reason: `trade query error: ${tradeErr.message}` });
      continue;
    }

    if (activeTrades && activeTrades.length > 0) {
      const activeList = activeTrades.map(t => `${t.id.slice(0,8)}(${t.status})`).join(', ');
      console.log(`  ⏭  SKIP  ${user_id.slice(0,8)}  locked=₿${fmt(locked_balance_btc)}  → has active trade(s): ${activeList}`);
      skipped.push({ ...wallet, reason: `active trades: ${activeList}` });
      continue;
    }

    // ── Also verify via escrow_locks: any LOCKED escrow for this user? ────────
    const { data: activeLocks } = await db
      .from('escrow_locks')
      .select('id, trade_id, status')
      .eq('seller_id', user_id)
      .eq('status', 'LOCKED');

    if (activeLocks && activeLocks.length > 0) {
      // Double-check: if the associated trade is finished, the escrow is orphaned
      // and safe to clear. If trade is active, skip.
      let hasReallyActiveLock = false;
      for (const lock of activeLocks) {
        const { data: lt } = await db.from('trades').select('status').eq('id', lock.trade_id).single();
        if (lt && ACTIVE_STATUSES.includes(lt.status)) {
          hasReallyActiveLock = true;
          break;
        }
      }
      if (hasReallyActiveLock) {
        console.log(`  ⏭  SKIP  ${user_id.slice(0,8)}  locked=₿${fmt(locked_balance_btc)}  → active escrow_lock found`);
        skipped.push({ ...wallet, reason: 'active escrow_lock' });
        continue;
      }
    }

    // ── Safe: no active trades, no active escrow locks ─────────────────────────
    const newAvail = parseFloat((parseFloat(balance_btc || 0) + parseFloat(locked_balance_btc || 0)).toFixed(8));
    console.log(`  ✅  FIX   ${user_id.slice(0,8)}  avail=₿${fmt(balance_btc)} + locked=₿${fmt(locked_balance_btc)} → new_avail=₿${fmt(newAvail)}`);
    safe.push({ user_id, balance_btc, locked_balance_btc, newAvail });
  }

  console.log('');
  console.log(`Summary: ${safe.length} to fix, ${skipped.length} skipped (active trades)`);
  console.log('');

  if (safe.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  if (DRY_RUN) {
    console.log('DRY RUN — no changes written.');
    console.log('Re-run with --apply to commit these fixes.');
    return;
  }

  // ── Step 3: apply the fixes one by one (not a bulk update — safer) ──────────
  console.log('Applying fixes...\n');

  let fixed = 0;
  let failed = 0;

  for (const w of safe) {
    const { error: updateErr } = await db
      .from('wallets')
      .update({
        balance_btc:        w.newAvail,
        locked_balance_btc: 0,
        updated_at:         new Date().toISOString(),
      })
      .eq('user_id', w.user_id)
      .eq('locked_balance_btc', w.locked_balance_btc); // optimistic lock — only update if value unchanged

    if (updateErr) {
      console.error(`  ❌  FAILED  ${w.user_id.slice(0,8)}: ${updateErr.message}`);
      failed++;
      continue;
    }

    // Mark the orphaned escrow_locks as REFUNDED so audit trail is clean
    await db
      .from('escrow_locks')
      .update({ status: 'REFUNDED', released_at: new Date().toISOString() })
      .eq('seller_id', w.user_id)
      .eq('status', 'LOCKED');

    // Log a wallet transaction for the refund
    await db.from('wallet_transactions').insert({
      user_id:    w.user_id,
      type:       'ESCROW_REFUND',
      amount_btc: parseFloat(w.locked_balance_btc),
      status:     'CONFIRMED',
      notes:      'Orphaned escrow repair — locked funds restored (one-time fix)',
      created_at: new Date().toISOString(),
    });

    // Notify the user
    await db.from('notifications').insert({
      user_id:    w.user_id,
      type:       'wallet',
      title:      '₿ Funds Restored',
      message:    `₿${fmt(w.locked_balance_btc)} that was stuck in escrow has been returned to your available balance.`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    }).catch(() => {});

    console.log(`  ✅  FIXED  ${w.user_id.slice(0,8)}  → ₿${fmt(w.newAvail)} available`);
    fixed++;
  }

  console.log('');
  console.log(`Done: ${fixed} fixed, ${failed} failed, ${skipped.length} skipped.`);

  if (failed > 0) {
    console.warn('⚠️  Some updates failed — check errors above and re-run if needed.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
