require('dotenv').config();
const hdWallet = require('./services/hdWalletService');
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const NEW_HOT_WALLET = 'bc1qv0ahn74plw5zhqyuep78kakunm04vq5w4vrfaa';

async function sweep() {
  const { data: wallets } = await supabaseAdmin
    .from('wallets')
    .select('user_id, address, balance_btc')
    .gt('balance_btc', 0)
    .order('balance_btc', { ascending: false });

  console.log('Found', wallets?.length, 'wallets with balance\n');
  
  for (const w of wallets || []) {
    if (w.address === 'pending_address') continue;
    try {
      const bal = await hdWallet.checkBalance(w.address);
      const btc = parseFloat(bal.confirmed_btc || 0);
      console.log('User:', w.user_id?.slice(0,8), '| Addr:', w.address?.slice(0,12), '| DB:', Number(w.balance_btc).toFixed(8), '| Chain:', btc.toFixed(8));
    } catch (e) {
      console.log('User:', w.user_id?.slice(0,8), '| Error:', e.message?.slice(0,60));
    }
  }

  // Also check old hot wallet
  const oldHot = hdWallet.getHotWalletAddress();
  const hotBal = await hdWallet.checkBalance(oldHot);
  console.log('\nOld Hot Wallet:', oldHot, '| Balance:', hotBal.confirmed_btc, 'BTC');
  console.log('Send to NEW:', NEW_HOT_WALLET);
}

sweep().catch(e => console.error('Fatal:', e));
