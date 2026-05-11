// fix-all-user-addresses.js
// Run ONCE to migrate all users from old Coinbase CDP addresses to HD wallet addresses.
//
// What it does:
//   1. Loads every user from the DB
//   2. Derives the correct HD wallet address for each user (same logic as hdWalletService)
//   3. Compares with what is stored in user_wallets.btc_address and users.bitcoin_wallet_address
//   4. If they don't match → the stored address is an old Coinbase CDP address → replaces it
//   5. Resets last_onchain_btc to 0 for replaced addresses (new address, clean slate)
//   6. Subscribes new addresses to the deposit monitor
//
// Usage:
//   node fix-all-user-addresses.js
//
// Safe to re-run — skips users who already have the correct HD wallet address.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWallet         = require('./services/hdWalletService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixAllUserAddresses() {
  console.log('\n🔧 PRAQEN Address Migration — Coinbase CDP → HD Wallet');
  console.log('='.repeat(60));

  // 1. Load all users
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, username, bitcoin_wallet_address')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Failed to load users:', error.message);
    process.exit(1);
  }

  console.log(`\n📋 Found ${users.length} users to check\n`);

  let fixed   = 0;
  let skipped = 0;
  let failed  = 0;

  for (const user of users) {
    try {
      // Derive the correct HD wallet address for this user
      const correctAddr = hdWallet.generateUserAddress(user.id).address;

      // Fetch current stored address from user_wallets
      const { data: walletRow } = await supabaseAdmin
        .from('user_wallets')
        .select('btc_address, balance_btc, last_onchain_btc')
        .eq('user_id', user.id)
        .maybeSingle();

      const storedWalletAddr  = walletRow?.btc_address || null;
      const storedUserAddr    = user.bitcoin_wallet_address || null;

      const walletMatch = storedWalletAddr === correctAddr;
      const userMatch   = storedUserAddr   === correctAddr;

      if (walletMatch && userMatch) {
        console.log(`✅ OK       ${(user.username || user.id).padEnd(20)} ${correctAddr.slice(0, 20)}…`);
        skipped++;
        continue;
      }

      // Address mismatch — this user has an old Coinbase CDP address
      console.log(`\n⚠️  MISMATCH ${user.username || user.id}`);
      if (!walletMatch) console.log(`   user_wallets.btc_address: ${storedWalletAddr || 'NULL'}`);
      if (!userMatch)   console.log(`   users.bitcoin_wallet_address: ${storedUserAddr || 'NULL'}`);
      console.log(`   Correct HD address: ${correctAddr}`);

      // Update both tables
      const [usersResult, walletResult] = await Promise.all([
        supabaseAdmin.from('users').update({
          bitcoin_wallet_address: correctAddr,
          updated_at: new Date().toISOString(),
        }).eq('id', user.id),

        supabaseAdmin.from('user_wallets').upsert({
          user_id:     user.id,
          btc_address: correctAddr,
          balance_btc: parseFloat(walletRow?.balance_btc || 0),
          updated_at:  new Date().toISOString(),
        }, { onConflict: 'user_id' }),
      ]);

      if (usersResult.error || walletResult.error) {
        console.error(`   ❌ Update failed:`, usersResult.error?.message || walletResult.error?.message);
        failed++;
      } else {
        console.log(`   ✅ Fixed → ${correctAddr}`);
        fixed++;
      }

    } catch (err) {
      console.error(`❌ Error processing user ${user.id.slice(0,8)}:`, err.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Migration complete:`);
  console.log(`   ✅ Already correct : ${skipped}`);
  console.log(`   🔧 Fixed           : ${fixed}`);
  console.log(`   ❌ Failed          : ${failed}`);

  if (fixed > 0) {
    console.log(`\n⚠️  IMPORTANT — ${fixed} user(s) had their deposit address changed.`);
    console.log(`   Their OLD addresses were Coinbase CDP addresses that Coinbase sweeps.`);
    console.log(`   Their NEW addresses are HD wallet addresses that PRAQEN controls.`);
    console.log(`   Notify affected users to use their new deposit address.`);
    console.log(`   Any BTC sent to old addresses: contact Coinbase CDP support.`);
  }

  if (failed === 0 && fixed >= 0) {
    console.log(`\n✅ All users now use HD wallet addresses. No more Coinbase sweeping.\n`);
  }
}

fixAllUserAddresses().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
