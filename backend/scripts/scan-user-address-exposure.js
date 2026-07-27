// backend/scripts/scan-user-address-exposure.js
//
// READ-ONLY. Checks on-chain BTC balance at every individual user deposit address
// (funds not yet swept to the hot wallet — e.g. a recent deposit, or a sweep failure).
// Makes zero writes, zero sends. Rate-limited/batched to be gentle on public block
// explorer APIs.
//
// Usage: node scripts/scan-user-address-exposure.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWallet          = require('../services/hdWalletService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH = 5;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const [{ data: wallets }, { data: users }] = await Promise.all([
    supabaseAdmin.from('user_wallets').select('user_id, btc_address').not('btc_address', 'is', null).neq('btc_address', ''),
    supabaseAdmin.from('users').select('id, username, bitcoin_wallet_address').not('bitcoin_wallet_address', 'is', null).neq('bitcoin_wallet_address', ''),
  ]);

  const seen = new Set();
  const targets = [];
  for (const w of (wallets || [])) {
    if (w.btc_address && !seen.has(w.btc_address)) { seen.add(w.btc_address); targets.push({ userId: w.user_id, address: w.btc_address }); }
  }
  for (const u of (users || [])) {
    if (u.bitcoin_wallet_address && !seen.has(u.bitcoin_wallet_address)) { seen.add(u.bitcoin_wallet_address); targets.push({ userId: u.id, address: u.bitcoin_wallet_address, username: u.username }); }
  }

  console.log(`Scanning ${targets.length} unique user deposit address(es)...\n`);

  let totalBtc = 0;
  let nonZeroCount = 0;
  const nonZero = [];

  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async t => {
      const bal = await hdWallet.checkBalance(t.address);
      return { ...t, bal };
    }));
    for (const r of results) {
      if (r.status !== 'fulfilled') { console.log(`  ERROR: ${r.reason?.message}`); continue; }
      const { userId, address, bal } = r.value;
      const total = (bal.confirmed_btc || 0) + (bal.unconfirmed_btc || 0);
      if (total > 0) {
        nonZeroCount++;
        totalBtc += total;
        nonZero.push({ userId, address, total });
        console.log(`  ${total.toFixed(8)} BTC — user ${userId.slice(0,8)} — ${address}`);
      }
    }
    if (i + BATCH < targets.length) await sleep(1000);
  }

  console.log(`\nScanned ${targets.length} addresses.`);
  console.log(`Non-zero: ${nonZeroCount}`);
  console.log(`Total BTC sitting at user addresses (not yet swept): ${totalBtc.toFixed(8)} BTC`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
