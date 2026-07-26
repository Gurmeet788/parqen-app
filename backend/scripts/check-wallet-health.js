require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: users } = await supabaseAdmin
    .from('users').select('id, account_status, bitcoin_wallet_address');
  const { data: wallets } = await supabaseAdmin
    .from('wallets').select('user_id, address');
  const { data: userWallets } = await supabaseAdmin
    .from('user_wallets').select('user_id, btc_address, tron_address');

  const eligible = (users || []).filter(u => (u.account_status || '').toUpperCase() !== 'BANNED');
  const walletAddrByUser = new Map((wallets || []).map(w => [w.user_id, w.address]));
  const uwByUser = new Map((userWallets || []).map(w => [w.user_id, w]));

  const missingBtc = eligible.filter(u => !walletAddrByUser.get(u.id) || !u.bitcoin_wallet_address);
  const missingUserWalletsRow = eligible.filter(u => !uwByUser.has(u.id));
  const missingTronAddr = eligible.filter(u => {
    const uw = uwByUser.get(u.id);
    return !uw || !uw.tron_address;
  });

  console.log(`Total users: ${users.length} | Eligible (not banned): ${eligible.length}`);
  console.log(`Missing a BTC wallet address (wallets.address or users.bitcoin_wallet_address): ${missingBtc.length}`);
  console.log(`Missing a user_wallets row entirely: ${missingUserWalletsRow.length}`);
  console.log(`Missing tron_address (USDT deposits won't be auto-detected): ${missingTronAddr.length}`);
})();
