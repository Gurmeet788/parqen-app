// backend/scripts/backfill-wallets.js
//
// One-time fix: give every existing user without a real BTC deposit address one.
//
// This does NOT use fake/random placeholder addresses. Every address comes from
// hdWalletService.ensureWalletExists(), which deterministically derives a real,
// spendable Native SegWit (bc1q) address from the platform's MNEMONIC — the same
// derivation used for brand-new signups. Safe to re-run: it never overwrites an
// address that's already set.
//
// Usage (from backend/):
//   node scripts/backfill-wallets.js
//   node scripts/backfill-wallets.js --dry-run   (report only, writes nothing)

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWalletService   = require('../services/hdWalletService');

const DRY_RUN = process.argv.includes('--dry-run');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: users, error: uErr } = await supabaseAdmin
    .from('users')
    .select('id, username, account_status, bitcoin_wallet_address');
  if (uErr) throw uErr;

  const { data: wallets, error: wErr } = await supabaseAdmin
    .from('wallets').select('user_id, address');
  if (wErr) throw wErr;

  const walletAddressByUser = new Map((wallets || []).map(w => [w.user_id, w.address]));

  const eligible = (users || []).filter(u => {
    const status = (u.account_status || '').toUpperCase();
    return status !== 'BANNED';
  });

  const needsFix = eligible.filter(u =>
    !walletAddressByUser.get(u.id) || !u.bitcoin_wallet_address
  );

  console.log(`Total users: ${users.length}`);
  console.log(`Eligible (not banned): ${eligible.length}`);
  console.log(`Missing a wallet address: ${needsFix.length}`);

  if (DRY_RUN) {
    needsFix.forEach(u => console.log(`  would fix: ${u.username || u.id} (${u.id.slice(0, 8)})`));
    console.log('\nDry run — no changes made.');
    return;
  }

  let ok = 0, fail = 0;
  for (const u of needsFix) {
    try {
      const { address, isNew } = await hdWalletService.ensureWalletExists(u.id);
      console.log(`  ${isNew ? 'created' : 'backfilled'} ${u.username || u.id} (${u.id.slice(0, 8)}): ${address}`);
      ok++;
    } catch (e) {
      console.error(`  FAILED ${u.username || u.id} (${u.id.slice(0, 8)}): ${e.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 50)); // gentle on Supabase rate limits
  }

  console.log(`\nDone. ${ok} fixed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
