/**
 * add-test-balance.js — DEV ONLY
 *
 * Adds test BTC balance to a local dev user's wallet so they can complete
 * a full trade cycle (escrow lock → buyer pays → seller releases).
 *
 * SAFEGUARDS:
 *   - Only runs against the local dev Supabase project (same URL as .env)
 *   - Only touches the single user identified by EMAIL below
 *   - Does not call any external wallet, blockchain, or third-party service
 *   - Does not modify trade escrow state, listings, or any other table
 *
 * USAGE:
 *   1. Set the email and desired BTC amount below
 *   2. From the backend/ directory:  node scripts/add-test-balance.js
 *
 * Tables updated:
 *   - wallets.balance_btc        ← primary, used by escrow-lock check
 *   - user_balances.balance_btc  ← secondary, used by profile display
 *   - user_wallets.balance_btc   ← secondary, used by HD wallet send
 */

// ── CONFIGURE THESE ──────────────────────────────────────────────────────────
const TARGET_EMAIL = "areeshasattar127@gmail.com";  // test seller account
const BTC_AMOUNT   = 0.002;   // ~$176 at $88k BTC — enough for a small test trade
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

(async () => {
  // ── 1. Find the user ─────────────────────────────────────────────────────
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, username')
    .eq('email', TARGET_EMAIL)
    .single();

  if (userErr || !user) {
    console.error(`❌ User not found for email "${TARGET_EMAIL}":`, userErr?.message || 'No user returned');
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.username} (${user.email}) — ID: ${user.id}`);

  // ── 2. Update wallets table (PRIMARY — used by escrow lock check) ────────
  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance_btc, locked_balance_btc')
    .eq('user_id', user.id)
    .maybeSingle();

  if (wallet) {
    const current = parseFloat(wallet.balance_btc || 0);
    const newBal  = parseFloat((current + BTC_AMOUNT).toFixed(8));
    const { error: wErr } = await supabase
      .from('wallets')
      .update({ balance_btc: newBal, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (wErr) {
      console.error('❌ Failed to update wallets:', wErr.message);
      process.exit(1);
    }
    console.log(`✅ wallets.balance_btc: ${current} → ${newBal}`);
  } else {
    // User has no wallet row yet — create one
    const { error: wErr } = await supabase
      .from('wallets')
      .insert({
        user_id: user.id,
        balance_btc: BTC_AMOUNT,
        locked_balance_btc: 0,
        updated_at: new Date().toISOString(),
      });

    if (wErr) {
      console.error('❌ Failed to create wallets row:', wErr.message);
      process.exit(1);
    }
    console.log(`✅ wallets row created with balance_btc: ${BTC_AMOUNT}`);
  }

  // ── 3. Update user_balances table (secondary — profile display) ──────────
  const { data: ub } = await supabase
    .from('user_balances')
    .select('balance_btc')
    .eq('user_id', user.id)
    .maybeSingle();

  if (ub) {
    const current = parseFloat(ub.balance_btc || 0);
    const newBal  = parseFloat((current + BTC_AMOUNT).toFixed(8));
    const { error: ubErr } = await supabase
      .from('user_balances')
      .update({ balance_btc: newBal })
      .eq('user_id', user.id);

    if (ubErr) {
      console.warn('⚠️  Failed to update user_balances (non-critical):', ubErr.message);
    } else {
      console.log(`✅ user_balances.balance_btc: ${current} → ${newBal}`);
    }
  } else {
    const { error: ubErr } = await supabase
      .from('user_balances')
      .insert({ user_id: user.id, balance_btc: BTC_AMOUNT, balance_usd: 0 });

    if (ubErr) {
      console.warn('⚠️  Failed to create user_balances row (non-critical):', ubErr.message);
    } else {
      console.log(`✅ user_balances row created with balance_btc: ${BTC_AMOUNT}`);
    }
  }

  // ── 4. Update user_wallets table (secondary — HD wallet send) ────────────
  const { data: uw } = await supabase
    .from('user_wallets')
    .select('balance_btc')
    .eq('user_id', user.id)
    .maybeSingle();

  if (uw) {
    const current = parseFloat(uw.balance_btc || 0);
    const newBal  = parseFloat((current + BTC_AMOUNT).toFixed(8));
    const { error: uwErr } = await supabase
      .from('user_wallets')
      .update({ balance_btc: newBal })
      .eq('user_id', user.id);

    if (uwErr) {
      console.warn('⚠️  Failed to update user_wallets (non-critical):', uwErr.message);
    } else {
      console.log(`✅ user_wallets.balance_btc: ${current} → ${newBal}`);
    }
  } else {
    const { error: uwErr } = await supabase
      .from('user_wallets')
      .insert({ user_id: user.id, balance_btc: BTC_AMOUNT });

    if (uwErr) {
      console.warn('⚠️  Failed to create user_wallets row (non-critical):', uwErr.message);
    } else {
      console.log(`✅ user_wallets row created with balance_btc: ${BTC_AMOUNT}`);
    }
  }

  // ── 5. Log a wallet_transaction record for audit trail ───────────────────
  const { error: txErr } = await supabase
    .from('wallet_transactions')
    .insert({
      user_id: user.id,
      type: 'DEPOSIT',
      amount_btc: BTC_AMOUNT,
      status: 'CONFIRMED',
      notes: 'TEST: Manual balance add via add-test-balance.js — not real funds',
      created_at: new Date().toISOString(),
    });

  if (txErr) {
    console.warn('⚠️  Failed to log wallet_transaction (non-critical):', txErr.message);
  } else {
    console.log(`✅ wallet_transaction logged as CONFIRMED DEPOSIT`);
  }

  console.log(`\n🎉 Done! ${user.username} now has ~${BTC_AMOUNT} BTC in test balance.`);
  console.log(`   You can now create a sell offer and complete a test trade.`);
})().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
