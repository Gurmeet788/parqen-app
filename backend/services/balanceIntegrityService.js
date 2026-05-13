// services/balanceIntegrityService.js
// PRAQEN — Daily Balance Integrity Checker
//
// What it does:
//   For every user, recompute their true balance from the wallet_transactions
//   ledger (the source of truth) and compare it to what user_balances shows.
//   If they disagree by more than 1 satoshi, auto-correct and log the discrepancy.
//
// When it runs:
//   Called once on server startup and then every 24 hours.
//   Also exported so it can be triggered manually from the admin panel.

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// 1 satoshi tolerance for floating-point rounding
const TOLERANCE_BTC = 0.000000011;

async function runIntegrityCheck() {
  console.log('\n🔍 [BalanceIntegrity] Starting daily balance check...');
  const started = Date.now();
  let checked = 0, corrected = 0, errors = 0;

  try {
    // Fetch every user that has at least one wallet transaction
    const { data: users, error: usersErr } = await supabaseAdmin
      .from('user_balances')
      .select('user_id, balance_btc');

    if (usersErr || !users) {
      console.error('[BalanceIntegrity] Could not fetch users:', usersErr?.message);
      return;
    }

    for (const row of users) {
      try {
        const userId = row.user_id;

        // Sum all CONFIRMED wallet_transactions for this user
        // Credits: DEPOSIT, ESCROW_REFUND, ESCROW_RELEASE, TRANSFER_IN, AFFILIATE_WITHDRAWAL
        // Debits: ESCROW_LOCK, WITHDRAWAL, TRANSFER_OUT, FEE
        const { data: txs, error: txErr } = await supabaseAdmin
          .from('wallet_transactions')
          .select('type, amount_btc, status')
          .eq('user_id', userId)
          .eq('status', 'CONFIRMED');

        if (txErr) { errors++; continue; }

        const CREDIT_TYPES = new Set(['DEPOSIT', 'ESCROW_REFUND', 'ESCROW_RELEASE', 'TRANSFER_IN', 'AFFILIATE_WITHDRAWAL']);
        const DEBIT_TYPES  = new Set(['ESCROW_LOCK', 'WITHDRAWAL', 'TRANSFER_OUT', 'FEE']);

        let computedBtc = 0;
        for (const tx of (txs || [])) {
          const amt = parseFloat(tx.amount_btc || 0);
          if (CREDIT_TYPES.has(tx.type)) computedBtc += amt;
          else if (DEBIT_TYPES.has(tx.type)) computedBtc -= amt;
        }
        computedBtc = parseFloat(computedBtc.toFixed(8));

        const storedBtc = parseFloat(row.balance_btc || 0);
        const diff = Math.abs(computedBtc - storedBtc);

        checked++;

        if (diff > TOLERANCE_BTC) {
          console.warn(
            `[BalanceIntegrity] ⚠️  MISMATCH user ${userId.slice(0,8)}: ` +
            `stored=${storedBtc.toFixed(8)} computed=${computedBtc.toFixed(8)} diff=${diff.toFixed(8)}`
          );

          // Auto-correct all balance tables to match the transaction ledger.
          // wallets is updated first as it is the single source of truth.
          await supabaseAdmin.from('wallets')
            .upsert(
              { user_id: userId, balance_btc: computedBtc, locked_balance_btc: 0, private_key: 'placeholder_private_key', updated_at: new Date().toISOString() },
              { onConflict: 'user_id' }
            );
          await supabaseAdmin.from('user_balances')
            .update({ balance_btc: computedBtc, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          await supabaseAdmin.from('user_wallets')
            .update({ balance_btc: computedBtc, updated_at: new Date().toISOString() })
            .eq('user_id', userId);

          // Log the correction so you can investigate root cause later
          await supabaseAdmin.from('balance_audit').insert({
            user_id:     userId,
            change_btc:  parseFloat((computedBtc - storedBtc).toFixed(8)),
            new_balance: computedBtc,
            reason:      'INTEGRITY_CORRECTION',
            created_at:  new Date().toISOString(),
          }).catch(() => {});

          corrected++;
        }
      } catch (userErr) {
        errors++;
        console.error('[BalanceIntegrity] Error processing user:', userErr.message);
      }
    }
  } catch (err) {
    console.error('[BalanceIntegrity] Fatal error:', err.message);
  }

  const ms = Date.now() - started;
  console.log(
    `✅ [BalanceIntegrity] Done in ${ms}ms — ` +
    `checked: ${checked}, corrected: ${corrected}, errors: ${errors}`
  );

  return { checked, corrected, errors };
}

// Start the 24-hour recurring check
function start() {
  // Run once immediately on startup (catches anything that happened while server was offline)
  runIntegrityCheck().catch(err => console.error('[BalanceIntegrity] Startup check failed:', err.message));

  // Then every 24 hours
  setInterval(() => {
    runIntegrityCheck().catch(err => console.error('[BalanceIntegrity] Scheduled check failed:', err.message));
  }, 24 * 60 * 60 * 1000);

  console.log('🛡️  Balance integrity checker: runs every 24 hours');
}

module.exports = { start, runIntegrityCheck };
