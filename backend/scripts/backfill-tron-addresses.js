// backend/scripts/backfill-tron-addresses.js
//
// One-time fix: every eligible user gets their deterministic Tron/USDT deposit
// address saved to user_wallets.tron_address, so usdtDepositMonitor watches them.
// This was previously broken for ~all users because the route that saved it used
// an upsert missing the NOT-NULL btc_address column (see GET /api/wallet/usdt fix
// in server.js). Safe to re-run — only fills in missing tron_address values.
//
// Usage: node scripts/backfill-tron-addresses.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWalletService   = require('../services/hdWalletService');
const tronWalletService = require('../services/tronWalletService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: users, error } = await supabaseAdmin
    .from('users').select('id, username, account_status');
  if (error) throw error;

  const { data: userWallets } = await supabaseAdmin
    .from('user_wallets').select('user_id, tron_address');
  const tronByUser = new Map((userWallets || []).map(w => [w.user_id, w.tron_address]));

  const eligible = (users || []).filter(u => (u.account_status || '').toUpperCase() !== 'BANNED');
  const needsFix = eligible.filter(u => !tronByUser.get(u.id));

  console.log(`Eligible users: ${eligible.length} | Missing tron_address: ${needsFix.length}`);

  let ok = 0, fail = 0;
  for (const u of needsFix) {
    try {
      // Guarantees a user_wallets row with a real btc_address exists first
      // (tron_address alone can't satisfy the NOT NULL constraint on btc_address).
      await hdWalletService.ensureWalletExists(u.id);
      const { address } = tronWalletService.generateUserAddress(u.id);
      const { error: updErr } = await supabaseAdmin.from('user_wallets')
        .update({ tron_address: address, updated_at: new Date().toISOString() })
        .eq('user_id', u.id);
      if (updErr) throw updErr;
      console.log(`  ${u.username || u.id.slice(0,8)}: ${address}`);
      ok++;
    } catch (e) {
      console.error(`  FAILED ${u.username || u.id.slice(0,8)}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} fixed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
