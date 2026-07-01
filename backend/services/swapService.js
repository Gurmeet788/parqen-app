// services/swapService.js
// PRAQEN BTC ↔ USDT Swap Service
// Internal ledger transfer — no on-chain transactions.
// Live rate: Binance primary → CoinGecko fallback.
// 1% platform fee, credited to company wallet.

require('dotenv').config();
const axios  = require('axios');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SWAP_FEE_RATE     = 0.01; // 1% fee
const BINANCE_URL       = process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3';
const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';

class SwapService {

  // ── Fetch live BTC/USDT rate ──────────────────────────────────────────────
  async getBtcUsdtRate() {
    // Primary: Binance (most accurate, real-time)
    try {
      const resp = await axios.get(`${BINANCE_URL}/ticker/price?symbol=BTCUSDT`, { timeout: 8000 });
      const rate = parseFloat(resp.data?.price);
      if (rate > 100) return rate; // sanity check
    } catch (e) {
      console.warn('[SwapService] Binance rate fetch failed:', e.message);
    }

    // Fallback: CoinGecko (no API key required)
    try {
      const resp = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        { timeout: 8000 }
      );
      const rate = parseFloat(resp.data?.bitcoin?.usd);
      if (rate > 100) return rate;
    } catch (e) {
      console.warn('[SwapService] CoinGecko fallback failed:', e.message);
    }

    throw new Error('Unable to fetch BTC/USDT rate — all price APIs unreachable. Please try again.');
  }

  // ── Fetch wallet balances (single source of truth) ────────────────────────
  async _getWallet(userId) {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('balance_btc, balance_usdt, locked_balance_btc, locked_balance_usdt')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to fetch wallet: ${error.message}`);
    return {
      btc:       parseFloat(data?.balance_btc  || 0),
      usdt:      parseFloat(data?.balance_usdt || 0),
      lockedBtc: parseFloat(data?.locked_balance_btc  || 0),
      lockedUsdt: parseFloat(data?.locked_balance_usdt || 0),
      exists:    !!data,
    };
  }

  // ── Credit company fee wallet ─────────────────────────────────────────────
  async _creditCompanyFee(currency, amount) {
    const field = currency === 'BTC' ? 'balance_btc' : 'balance_usdt';
    const { data: c } = await supabaseAdmin
      .from('wallets').select(field).eq('user_id', COMPANY_WALLET_ID).maybeSingle();
    const current = parseFloat(c?.[field] || 0);
    const newBal  = parseFloat((current + amount).toFixed(currency === 'BTC' ? 8 : 6));
    await supabaseAdmin.from('wallets')
      .update({ [field]: newBal, updated_at: new Date().toISOString() })
      .eq('user_id', COMPANY_WALLET_ID);
  }

  // ── Record swap in swap_transactions ─────────────────────────────────────
  async _recordSwap(userId, fromCurrency, toCurrency, fromAmount, toAmount, rate, feeBtc, feeUsdt) {
    const now = new Date().toISOString();
    const [swapResult, feeResult] = await Promise.all([
      supabaseAdmin.from('swap_transactions').insert({
        user_id:       userId,
        from_currency: fromCurrency,
        to_currency:   toCurrency,
        from_amount:   fromAmount,
        to_amount:     toAmount,
        rate,
        fee_btc:       feeBtc,
        fee_usdt:      feeUsdt,
        status:        'COMPLETED',
        created_at:    now,
      }),
      // Audit trail: FEE row in wallet_transactions for company wallet
      supabaseAdmin.from('wallet_transactions').insert({
        user_id:     COMPANY_WALLET_ID,
        type:        'FEE',
        currency:    feeBtc > 0 ? 'BTC' : 'USDT',
        amount_btc:  feeBtc  > 0 ? feeBtc  : 0,
        amount_usdt: feeUsdt > 0 ? feeUsdt : 0,
        status:      'CONFIRMED',
        notes:       `Swap fee: ${fromCurrency}→${toCurrency} | ₿${feeBtc.toFixed(8)} / ₮${feeUsdt.toFixed(6)} | user: ${userId.slice(0, 8)}`,
        created_at:  now,
      }),
    ]);
    if (swapResult.error) console.warn('[SwapService] swap_transactions insert error:', swapResult.error.message);
    if (feeResult.error)  console.warn('[SwapService] wallet_transactions fee insert error:', feeResult.error.message);
  }

  // ── BTC → USDT ────────────────────────────────────────────────────────────
  async swapBtcToUsdt(userId, btcAmount) {
    const amount = parseFloat(btcAmount);
    if (!amount || amount <= 0) throw new Error('Invalid BTC amount');
    if (amount < 0.000001)      throw new Error('Minimum swap: 0.000001 BTC');

    const rate       = await this.getBtcUsdtRate();
    const grossUsdt  = parseFloat((amount * rate).toFixed(6));
    const feeUsdt    = parseFloat((grossUsdt * SWAP_FEE_RATE).toFixed(6));
    const netUsdt    = parseFloat((grossUsdt - feeUsdt).toFixed(6));

    const wallet = await this._getWallet(userId);
    if (wallet.btc < amount) {
      throw new Error(
        `Insufficient BTC balance. Available: ${wallet.btc.toFixed(8)} BTC, Required: ${amount.toFixed(8)} BTC`
      );
    }

    const newBtc  = parseFloat((wallet.btc - amount).toFixed(8));
    const newUsdt = parseFloat((wallet.usdt + netUsdt).toFixed(6));

    // Optimistic lock: reject if balance was modified by a concurrent request
    const { data: swapRows, error: updateErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_btc: newBtc, balance_usdt: newUsdt, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('balance_btc', wallet.btc)   // optimistic lock
      .select('balance_btc');
    if (updateErr) throw new Error(`Swap failed: ${updateErr.message}`);
    if (!swapRows || swapRows.length === 0) throw new Error('Balance changed — please retry the swap');

    // Platform fee → company wallet (in USDT)
    await this._creditCompanyFee('USDT', feeUsdt);

    // Record swap
    const swapRef = 'SWAP_' + crypto.randomBytes(6).toString('hex').toUpperCase();
    await this._recordSwap(userId, 'BTC', 'USDT', amount, netUsdt, rate, 0, feeUsdt);

    // In-app notification
    await supabaseAdmin.from('notifications').insert({
      user_id:    userId,
      type:       'wallet',
      title:      '🔄 Swap Complete!',
      message:    `Swapped ₿${amount.toFixed(8)} BTC → $${netUsdt.toFixed(2)} USDT (rate: $${rate.toFixed(0)}/BTC, fee: $${feeUsdt.toFixed(2)})`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    console.log(`✅ [Swap] BTC→USDT: ${amount} BTC → ${netUsdt} USDT @ $${rate} | fee: $${feeUsdt} | user: ${userId.slice(0,8)}`);

    return {
      success:          true,
      swap_ref:         swapRef,
      from_currency:    'BTC',
      to_currency:      'USDT',
      from_amount:      amount,
      to_amount:        netUsdt,
      rate,
      fee_usdt:         feeUsdt,
      fee_pct:          `${SWAP_FEE_RATE * 100}%`,
      new_btc_balance:  newBtc,
      new_usdt_balance: newUsdt,
    };
  }

  // ── USDT → BTC ────────────────────────────────────────────────────────────
  async swapUsdtToBtc(userId, usdtAmount) {
    const amount = parseFloat(usdtAmount);
    if (!amount || amount <= 0) throw new Error('Invalid USDT amount');
    if (amount < 1)             throw new Error('Minimum swap: 1 USDT');

    const rate      = await this.getBtcUsdtRate();
    const grossBtc  = parseFloat((amount / rate).toFixed(8));
    const feeBtc    = parseFloat((grossBtc * SWAP_FEE_RATE).toFixed(8));
    const netBtc    = parseFloat((grossBtc - feeBtc).toFixed(8));

    const wallet = await this._getWallet(userId);
    if (wallet.usdt < amount) {
      throw new Error(
        `Insufficient USDT balance. Available: $${wallet.usdt.toFixed(2)} USDT, Required: $${amount.toFixed(2)} USDT`
      );
    }

    const newUsdt = parseFloat((wallet.usdt - amount).toFixed(6));
    const newBtc  = parseFloat((wallet.btc + netBtc).toFixed(8));

    // Optimistic lock: reject if balance was modified by a concurrent request
    const { data: swapRows, error: updateErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_usdt: newUsdt, balance_btc: newBtc, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('balance_usdt', wallet.usdt)  // optimistic lock
      .select('balance_usdt');
    if (updateErr) throw new Error(`Swap failed: ${updateErr.message}`);
    if (!swapRows || swapRows.length === 0) throw new Error('Balance changed — please retry the swap');

    // Platform fee → company wallet (in BTC)
    await this._creditCompanyFee('BTC', feeBtc);

    const swapRef = 'SWAP_' + crypto.randomBytes(6).toString('hex').toUpperCase();
    await this._recordSwap(userId, 'USDT', 'BTC', amount, netBtc, rate, feeBtc, 0);

    await supabaseAdmin.from('notifications').insert({
      user_id:    userId,
      type:       'wallet',
      title:      '🔄 Swap Complete!',
      message:    `Swapped $${amount.toFixed(2)} USDT → ₿${netBtc.toFixed(8)} BTC (rate: $${rate.toFixed(0)}/BTC, fee: ₿${feeBtc.toFixed(8)})`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    console.log(`✅ [Swap] USDT→BTC: $${amount} USDT → ${netBtc} BTC @ $${rate} | fee: ${feeBtc} BTC | user: ${userId.slice(0,8)}`);

    return {
      success:          true,
      swap_ref:         swapRef,
      from_currency:    'USDT',
      to_currency:      'BTC',
      from_amount:      amount,
      to_amount:        netBtc,
      rate,
      fee_btc:          feeBtc,
      fee_pct:          `${SWAP_FEE_RATE * 100}%`,
      new_usdt_balance: newUsdt,
      new_btc_balance:  newBtc,
    };
  }
}

module.exports = new SwapService();
