// services/hdWalletService.js
// PRAQEN HD Wallet Service — Production Ready
// Handles: address generation, balance checking, sending BTC, escrow splits

require('dotenv').config();
const bip39  = require('bip39');
const bitcoin = require('bitcoinjs-lib');
const ecc    = require('tiny-secp256k1');
const { ECPairFactory } = require('ecpair');
const crypto = require('crypto');
const axios  = require('axios');

const ECPair = ECPairFactory(ecc);

// ── PRAQEN company fee wallet identifier ─────────────────────────────────────
const PRAQEN_FEE_IDENTIFIER        = 'praqen_company_fee_wallet';
const PRAQEN_HOT_WALLET_IDENTIFIER = 'praqen_hot_withdrawal_wallet'; // funds user external withdrawals
const PRAQEN_FEE_RATE              = 0.005; // 0.5%

class HDWalletService {

  constructor() {
    this.masterPrivateKey = null;
    this.network          = null;
    this.initialized      = false;
    this.apiBase          = null;
    this.apiFallbacks     = [];
  }

  // ── Initialize from .env MNEMONIC ──────────────────────────────────────────
  initialize() {
    if (this.initialized) return;

    const mnemonic = process.env.MNEMONIC;

    if (!mnemonic) {
      throw new Error('❌ MNEMONIC not found in .env — run setup-hd-wallet.js first');
    }

    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('❌ MNEMONIC is invalid — check your .env file');
    }

    // MAINNET ONLY — no testnet fallback
    this.network      = bitcoin.networks.bitcoin;
    this.apiBase      = 'https://mempool.space/api';
    this.apiFallbacks = ['https://blockstream.info/api', 'https://mempool.emzy.de/api'];

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    this.masterPrivateKey = seed.slice(0, 32);

    this.initialized = true;
    console.log('✅ HD Wallet initialized — MAINNET');
    console.log(`📡 API: ${this.apiBase}`);
  }

  // ── Derive private key for any identifier ─────────────────────────────────
  // Each user and each trade gets a UNIQUE private key derived from master seed
  // Same identifier always produces the same key — deterministic
  getPrivateKey(identifier) {
    this.initialize();
    const hash       = crypto.createHash('sha256').update(String(identifier)).digest();
    const combined   = Buffer.concat([this.masterPrivateKey, hash]);
    const privateKey = crypto.createHash('sha256').update(combined).digest().slice(0, 32);
    return privateKey;
  }

  // ── Generate BTC address from identifier ──────────────────────────────────
  generateAddress(identifier) {
    this.initialize();
    const privateKey = this.getPrivateKey(identifier);
    const keyPair    = ECPair.fromPrivateKey(privateKey, { network: this.network });

    // Native SegWit (bc1q) — lowest fees, most modern — MAINNET ONLY
    const payment = bitcoin.payments.p2wpkh({
      pubkey:  keyPair.publicKey,
      network: this.network,
    });

    return {
      address:    payment.address,
      identifier: identifier,
      network:    'mainnet',
      format:     'Native SegWit (P2WPKH)',
      createdAt:  new Date().toISOString(),
    };
  }

  // ── Try request against primary API then fallbacks ────────────────────────
  async apiGet(path) {
    const apis = [this.apiBase, ...this.apiFallbacks];
    let lastError;
    for (const base of apis) {
      try {
        const r = await axios.get(`${base}${path}`, { timeout: 15000 });
        return r.data;
      } catch (err) {
        console.warn(`[apiGet] ${base}${path} failed: ${err.message}`);
        lastError = err;
      }
    }
    throw new Error(`All blockchain APIs unreachable: ${lastError.message}`);
  }

  async apiPost(path, data) {
    const apis = [this.apiBase, ...this.apiFallbacks];
    let lastError;
    for (const base of apis) {
      try {
        const r = await axios.post(`${base}${path}`, data, {
          headers: { 'Content-Type': 'text/plain' },
          timeout: 30000,
        });
        return r.data;
      } catch (err) {
        console.warn(`[apiPost] ${base}${path} failed: ${err.message}`);
        lastError = err;
      }
    }
    throw new Error(`Broadcast failed on all APIs: ${lastError.message}`);
  }

  // ── Convenience methods ───────────────────────────────────────────────────
  generateUserAddress(userId) {
    return this.generateAddress(`user_${userId}`);
  }

  generateEscrowAddress(tradeId) {
    return this.generateAddress(`escrow_${tradeId}`);
  }

  getPraqenFeeAddress() {
    return this.generateAddress(PRAQEN_FEE_IDENTIFIER).address;
  }

  getHotWalletAddress() {
    return this.generateAddress(PRAQEN_HOT_WALLET_IDENTIFIER).address;
  }

  // Returns total confirmed BTC at the hot wallet
  async getHotWalletBalance() {
    const address = this.getHotWalletAddress();
    const bal = await this.checkBalance(address);
    return { address, confirmed_btc: bal.confirmed_btc };
  }

  // Send withdrawal from user's own address if it has UTXOs, otherwise fall back to hot wallet
  async sendWithdrawal(userId, toAddress, amountBTC, feeRate = 5) {
    this.initialize();

    const userIdentifier    = `user_${userId}`;
    const userAddress       = this.generateAddress(userIdentifier).address;
    const hotWalletAddress  = this.getHotWalletAddress();

    // Check UTXOs at user's own deposit address first
    const userUtxos = await this.getUTXOs(userAddress);
    const userFunds = (userUtxos || []).reduce((sum, u) => sum + u.value, 0);
    const amountSats = Math.floor(amountBTC * 1e8);

    const estimatedSize = 110 + (68 * Math.max(1, (userUtxos || []).length)) + (31 * 2);
    const estimatedFee  = estimatedSize * feeRate;

    if (userFunds >= amountSats + estimatedFee) {
      // User has enough real on-chain BTC (direct depositor path)
      console.log(`[Withdrawal] Sending from user's own address: ${userAddress}`);
      return this.sendBitcoin(userIdentifier, toAddress, amountBTC, feeRate);
    }

    // User's on-chain address has insufficient UTXOs (they received BTC from trades)
    // Fall back to the platform hot wallet
    let hwUtxos, hwApiError;
    try {
      hwUtxos = await this.getUTXOs(hotWalletAddress, { throwOnError: true });
    } catch (err) {
      hwApiError = err;
      hwUtxos = [];
    }

    const hwFunds = (hwUtxos || []).reduce((sum, u) => sum + u.value, 0);

    console.log(`[Withdrawal] User address has ${userFunds} sats, hot wallet has ${hwFunds} sats, need ${amountSats + estimatedFee} sats`);

    if (hwApiError && hwFunds === 0) {
      throw new Error(
        `MEMPOOL_API_ERROR: Could not verify hot wallet balance — blockchain API unreachable. ` +
        `Please try again in a few minutes. (${hwApiError.message})`
      );
    }

    if (hwFunds < amountSats + estimatedFee) {
      throw new Error(
        `HOT_WALLET_INSUFFICIENT: The platform withdrawal wallet needs to be topped up. ` +
        `Hot wallet address: ${hotWalletAddress}. ` +
        `Required: ${((amountSats + estimatedFee) / 1e8).toFixed(8)} BTC, ` +
        `Available: ${(hwFunds / 1e8).toFixed(8)} BTC`
      );
    }

    console.log(`[Withdrawal] Sending from platform hot wallet: ${hotWalletAddress}`);
    return this.sendBitcoin(PRAQEN_HOT_WALLET_IDENTIFIER, toAddress, amountBTC, feeRate);
  }

  // ── Check balance at any address ─────────────────────────────────────────
  async checkBalance(address) {
    this.initialize();
    try {
      const d = await this.apiGet(`/address/${address}`);
      const confirmedSats   = d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum;
      const unconfirmedSats = (d.mempool_stats?.funded_txo_sum || 0) - (d.mempool_stats?.spent_txo_sum || 0);
      return {
        address,
        confirmed_btc:   confirmedSats   / 1e8,
        unconfirmed_btc: unconfirmedSats / 1e8,
        total_btc:       (confirmedSats + unconfirmedSats) / 1e8,
        confirmed_sats:  confirmedSats,
        tx_count:        d.chain_stats.tx_count,
      };
    } catch (error) {
      console.error(`[checkBalance] Error for ${address}:`, error.message);
      return { address, confirmed_btc: 0, unconfirmed_btc: 0, total_btc: 0, confirmed_sats: 0, error: error.message };
    }
  }

  // ── Fetch UTXOs for an address ────────────────────────────────────────────
  async getUTXOs(address, { throwOnError = false } = {}) {
    this.initialize();
    try {
      const data = await this.apiGet(`/address/${address}/utxo`);
      return data || [];
    } catch (error) {
      console.error(`[getUTXOs] Error for ${address}:`, error.message);
      if (throwOnError) throw error;
      return [];
    }
  }

  // ── SEND BITCOIN ──────────────────────────────────────────────────────────
  // fromIdentifier : e.g. 'user_abc123' or 'escrow_trade_xyz'
  // toAddress      : any valid BTC address
  // amountBTC      : how much to send (number)
  // feeRate        : satoshis per vbyte (default 5)
  async sendBitcoin(fromIdentifier, toAddress, amountBTC, feeRate = 5) {
    this.initialize();

    console.log(`\n💸 sendBitcoin called`);
    console.log(`   From : ${fromIdentifier}`);
    console.log(`   To   : ${toAddress}`);
    console.log(`   Amount: ${amountBTC} BTC`);
    console.log(`   FeeRate: ${feeRate} sat/vbyte`);

    // ── 1. Prepare sender key + address ────────────────────────────────────
    const privateKey  = this.getPrivateKey(fromIdentifier);
    const keyPair     = ECPair.fromPrivateKey(privateKey, { network: this.network });
    const payment     = bitcoin.payments.p2wpkh({
      pubkey:  keyPair.publicKey,
      network: this.network,
    });
    const senderAddress = payment.address;

    console.log(`   Sender address: ${senderAddress}`);

    // ── 2. Get UTXOs ────────────────────────────────────────────────────────
    const utxos = await this.getUTXOs(senderAddress);
    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs found for ${senderAddress} — wallet may be empty`);
    }
    console.log(`   UTXOs found: ${utxos.length}`);

    // ── 3. Build PSBT ───────────────────────────────────────────────────────
    const psbt     = new bitcoin.Psbt({ network: this.network });
    let inputSum   = 0;

    for (const utxo of utxos) {
      // ✅ Native SegWit (P2WPKH) MUST use witnessUtxo
      // ✅ value MUST be BigInt in bitcoinjs-lib v6+ — this was the bug
      psbt.addInput({
        hash:  utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: payment.output,
          value:  BigInt(utxo.value),   // ✅ BigInt required
        },
      });
      inputSum += utxo.value;
    }

    const amountSats = Math.floor(amountBTC * 1e8);

    if (inputSum < amountSats) {
      throw new Error(
        `Insufficient funds: have ${inputSum} sats (${inputSum / 1e8} BTC), need ${amountSats} sats (${amountBTC} BTC)`
      );
    }

    // ── 4. Calculate fee ────────────────────────────────────────────────────
    // SegWit tx size: ~110 + (68 × inputs) + (31 × outputs) bytes
    const estimatedSize = 110 + (68 * utxos.length) + (31 * 2);
    const feeSats       = estimatedSize * feeRate;
    const changeSats    = inputSum - amountSats - feeSats;

    console.log(`   Input total : ${inputSum} sats`);
    console.log(`   Sending     : ${amountSats} sats`);
    console.log(`   Fee         : ${feeSats} sats`);
    console.log(`   Change      : ${changeSats} sats`);

    if (changeSats < 0) {
      throw new Error(
        `Not enough to cover fee. Need ${amountSats + feeSats} sats, have ${inputSum} sats`
      );
    }

    // ── 5. Add outputs ──────────────────────────────────────────────────────
    psbt.addOutput({ address: toAddress,      value: BigInt(amountSats) });

    // Only add change output if it's above dust limit (546 sats)
    if (changeSats > 546) {
      psbt.addOutput({ address: senderAddress, value: BigInt(changeSats) });
    }

    // ── 6. Sign all inputs ──────────────────────────────────────────────────
    for (let i = 0; i < utxos.length; i++) {
      psbt.signInput(i, keyPair);
    }

    // ── 7. Finalize and extract ─────────────────────────────────────────────
    psbt.finalizeAllInputs();
    const tx    = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txId  = tx.getId();

    console.log(`   TxID: ${txId}`);

    // ── 8. Broadcast to network ─────────────────────────────────────────────
    try {
      await this.apiPost('/tx', txHex);
    } catch (broadcastError) {
      throw new Error(`Broadcast failed: ${broadcastError.message}`);
    }

    const result = {
      success:      true,
      txid:         txId,
      from:         senderAddress,
      to:           toAddress,
      amount_btc:   amountBTC,
      amount_sats:  amountSats,
      fee_sats:     feeSats,
      change_sats:  changeSats,
      explorer_url: `https://mempool.space/tx/${txId}`,
    };

    console.log(`✅ Bitcoin sent successfully!`);
    console.log(`   Explorer: ${result.explorer_url}`);

    return result;
  }

  // ── ESCROW RELEASE — the main trade completion function ───────────────────
  // Called when buyer confirms OR 30min timer fires
  // Splits escrow BTC: 99.5% → seller, 0.5% → PRAQEN
  async releaseEscrow(tradeId, sellerAddress, totalAmountBTC) {
    this.initialize();

    console.log(`\n🔓 releaseEscrow called for trade: ${tradeId}`);
    console.log(`   Total BTC in escrow : ${totalAmountBTC}`);
    console.log(`   Seller address      : ${sellerAddress}`);

    const escrowIdentifier = `escrow_${tradeId}`;
    const praqenAddress    = this.getPraqenFeeAddress();

    // Calculate split
    const feeBTC        = parseFloat((totalAmountBTC * PRAQEN_FEE_RATE).toFixed(8));
    const sellerBTC     = parseFloat((totalAmountBTC - feeBTC).toFixed(8));

    console.log(`   Seller gets  : ${sellerBTC} BTC (99.5%)`);
    console.log(`   PRAQEN fee   : ${feeBTC} BTC (0.5%)`);
    console.log(`   PRAQEN addr  : ${praqenAddress}`);

    // Check escrow balance first
    const escrowAddress = this.generateEscrowAddress(tradeId).address;
    const balance       = await this.checkBalance(escrowAddress);

    if (balance.confirmed_btc < totalAmountBTC) {
      throw new Error(
        `Escrow underfunded. Expected ${totalAmountBTC} BTC, have ${balance.confirmed_btc} BTC`
      );
    }

    // Get UTXOs from escrow address
    const utxos = await this.getUTXOs(escrowAddress);
    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs in escrow for trade ${tradeId}`);
    }

    // Derive escrow key
    const privateKey = this.getPrivateKey(escrowIdentifier);
    const keyPair    = ECPair.fromPrivateKey(privateKey, { network: this.network });
    const payment    = bitcoin.payments.p2wpkh({
      pubkey:  keyPair.publicKey,
      network: this.network,
    });

    // Build PSBT with TWO outputs (seller + PRAQEN fee)
    const psbt   = new bitcoin.Psbt({ network: this.network });
    let inputSum = 0;

    for (const utxo of utxos) {
      psbt.addInput({
        hash:  utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: payment.output,
          value:  BigInt(utxo.value),   // ✅ BigInt required
        },
      });
      inputSum += utxo.value;
    }

    // Fee calculation
    const estimatedSize = 110 + (68 * utxos.length) + (31 * 2);
    const feeRate       = 5; // sat/vbyte
    const networkFee    = estimatedSize * feeRate;

    const sellerSats = Math.floor(sellerBTC * 1e8);
    const praqenSats = Math.floor(feeBTC * 1e8);
    const totalOut   = sellerSats + praqenSats + networkFee;

    if (inputSum < totalOut) {
      throw new Error(`Escrow has ${inputSum} sats, need ${totalOut} sats`);
    }

    // Add seller output
    psbt.addOutput({ address: sellerAddress, value: BigInt(sellerSats) });

    // Add PRAQEN fee output
    psbt.addOutput({ address: praqenAddress, value: BigInt(praqenSats) });

    // Sign and finalize
    for (let i = 0; i < utxos.length; i++) {
      psbt.signInput(i, keyPair);
    }
    psbt.finalizeAllInputs();

    const tx    = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txId  = tx.getId();

    // Broadcast
    try {
      await this.apiPost('/tx', txHex);
    } catch (broadcastError) {
      throw new Error(`Escrow broadcast failed: ${broadcastError.message}`);
    }

    const result = {
      success:          true,
      trade_id:         tradeId,
      txid:             txId,
      seller_address:   sellerAddress,
      seller_btc:       sellerBTC,
      praqen_address:   praqenAddress,
      praqen_fee_btc:   feeBTC,
      network_fee_sats: networkFee,
      explorer_url:     `https://mempool.space/tx/${txId}`,
    };

    console.log(`✅ Escrow released!`);
    console.log(`   Seller: ${sellerBTC} BTC → ${sellerAddress}`);
    console.log(`   PRAQEN: ${feeBTC} BTC → ${praqenAddress}`);
    console.log(`   Explorer: ${result.explorer_url}`);

    return result;
  }

  // ── Monitor deposit — poll every 30 seconds ───────────────────────────────
  async monitorDeposit(address, expectedAmountBTC = null, timeoutMinutes = 30) {
    this.initialize();
    const startTime = Date.now();
    const timeout   = timeoutMinutes * 60 * 1000;
    let lastBalance = 0;

    console.log(`👁️  Monitoring ${address} for deposits...`);
    if (expectedAmountBTC) console.log(`   Expecting: ${expectedAmountBTC} BTC`);

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          const balance = await this.checkBalance(address);

          if (balance.confirmed_btc > lastBalance) {
            const depositAmount = parseFloat((balance.confirmed_btc - lastBalance).toFixed(8));
            clearInterval(checkInterval);
            console.log(`✅ Deposit detected: ${depositAmount} BTC at ${address}`);
            resolve({
              success:      true,
              address,
              amount_btc:   depositAmount,
              total_btc:    balance.confirmed_btc,
              detected_at:  new Date().toISOString(),
            });
            return;
          }

          lastBalance = balance.confirmed_btc;

          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            reject(new Error(`Timeout — no deposit after ${timeoutMinutes} minutes`));
          }
        } catch (error) {
          console.error('[monitorDeposit] poll error:', error.message);
        }
      }, 30000); // poll every 30 seconds
    });
  }

  // ── Get network name ───────────────────────────────────────────────────────
  getNetwork() {
    this.initialize();
    return 'mainnet';
  }

  // ── Get PRAQEN info (safe to log) ─────────────────────────────────────────
  getInfo() {
    this.initialize();
    return {
      network:           'mainnet',
      api_base:          this.apiBase,
      praqen_fee_rate:   `${PRAQEN_FEE_RATE * 100}%`,
      praqen_fee_wallet: this.getPraqenFeeAddress(),
    };
  }
}

module.exports = new HDWalletService();