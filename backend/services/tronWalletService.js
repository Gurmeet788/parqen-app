// services/tronWalletService.js
// PRAQEN Tron / USDT TRC-20 Wallet Service
// Mirrors hdWalletService but for the Tron network.
// Same BIP39 mnemonic → same deterministic derivation → Tron addresses.
// Handles: address generation, USDT balance checks, USDT external sends.

require('dotenv').config();
const bip39  = require('bip39');
const crypto = require('crypto');
const axios  = require('axios');

const TRON_USDT_CONTRACT = process.env.TRON_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRONGRID_API_KEY   = process.env.TRONGRID_API_KEY   || '';
const TRONGRID_BASE      = 'https://api.trongrid.io';

// Lazy-load TronWeb — avoids startup crash and supports both v4 (default export)
// and v5 (named export { TronWeb }).
let _TronWebClass = null;
function getTronWebClass() {
  if (!_TronWebClass) {
    const mod = require('tronweb');
    _TronWebClass = mod.TronWeb || mod;
  }
  return _TronWebClass;
}

function tronHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (TRONGRID_API_KEY) h['TRON-PRO-API-KEY'] = TRONGRID_API_KEY;
  return h;
}

class TronWalletService {

  constructor() {
    this.masterPrivateKey = null;
    this.initialized      = false;
  }

  // ── Boot from same mnemonic as hdWalletService ────────────────────────────
  initialize() {
    if (this.initialized) return;

    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic)                          throw new Error('MNEMONIC not found in .env');
    if (!bip39.validateMnemonic(mnemonic))  throw new Error('MNEMONIC is invalid');

    const seed            = bip39.mnemonicToSeedSync(mnemonic);
    this.masterPrivateKey = seed.slice(0, 32);
    this.initialized      = true;
    console.log('✅ Tron Wallet Service initialized — MAINNET');
    console.log(`   USDT contract: ${TRON_USDT_CONTRACT}`);
  }

  // ── Deterministic private key — same algorithm as hdWalletService ─────────
  // 'tron_' prefix ensures Tron keys are DIFFERENT from BTC keys for same userId
  getPrivateKeyHex(identifier) {
    this.initialize();
    const hash       = crypto.createHash('sha256').update(`tron_${identifier}`).digest();
    const combined   = Buffer.concat([this.masterPrivateKey, hash]);
    const privateKey = crypto.createHash('sha256').update(combined).digest().slice(0, 32);
    return privateKey.toString('hex');
  }

  // ── Generate Tron (T…) address from any identifier ────────────────────────
  generateAddress(identifier) {
    this.initialize();
    const TronWeb    = getTronWebClass();
    const privKeyHex = this.getPrivateKeyHex(identifier);

    // Use a minimal TronWeb instance just for the address utility
    const tw      = new TronWeb({ fullHost: TRONGRID_BASE });
    const address = tw.address.fromPrivateKey(privKeyHex);

    return {
      address,
      identifier,
      network: 'mainnet',
      format:  'Tron Base58 (T…)',
    };
  }

  generateUserAddress(userId) {
    return this.generateAddress(`user_${userId}`);
  }

  generateEscrowAddress(tradeId) {
    return this.generateAddress(`escrow_${tradeId}`);
  }

  // ── USDT balance at any Tron address ─────────────────────────────────────
  // Throws on network/API errors so callers can distinguish from genuine zero.
  // Returns 0 only when the address genuinely has no USDT.
  async getUSDTBalance(address) {
    let resp;
    try {
      resp = await axios.get(
        `${TRONGRID_BASE}/v1/accounts/${address}`,
        { headers: tronHeaders(), timeout: 15000 }
      );
    } catch (err) {
      // Network error or timeout — throw so caller can keep sweep PENDING
      throw new Error(`TronGrid API error for ${address?.slice(0, 12)}…: ${err.message}`);
    }

    const accountData = resp.data?.data?.[0];
    if (!accountData) return 0; // New or empty account — genuinely zero

    const trc20 = accountData.trc20 || [];
    const entry = trc20.find(t => t[TRON_USDT_CONTRACT] !== undefined);
    if (!entry) return 0;

    const rawBalance = parseInt(entry[TRON_USDT_CONTRACT] || '0', 10);
    return rawBalance / 1e6; // USDT TRC-20 has 6 decimals
  }

  // ── Send USDT TRC-20 to an external Tron address ─────────────────────────
  // fromIdentifier: e.g. 'user_abc123' or 'escrow_trade_xyz'
  // toAddress     : any valid Tron base58 address starting with T
  // amountUsdt    : human-readable USDT amount (e.g. 10.5)
  async sendUSDT(fromIdentifier, toAddress, amountUsdt) {
    this.initialize();
    const TronWeb = getTronWebClass();

    if (!toAddress || !toAddress.startsWith('T') || toAddress.length !== 34) {
      throw new Error('Invalid Tron address — must be a 34-character base58 address starting with T');
    }
    if (!amountUsdt || parseFloat(amountUsdt) <= 0) {
      throw new Error('Invalid USDT amount');
    }

    const privateKeyHex = this.getPrivateKeyHex(fromIdentifier);

    // Build a TronWeb instance signed as the sender
    const tw = new TronWeb({
      fullHost:   TRONGRID_BASE,
      headers:    TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } : {},
      privateKey: privateKeyHex,
    });

    const fromAddress = tw.address.fromPrivateKey(privateKeyHex);
    const amountSun   = Math.floor(parseFloat(amountUsdt) * 1e6); // 6 decimals

    console.log(`\n💸 [TronWallet] sendUSDT`);
    console.log(`   From : ${fromAddress}`);
    console.log(`   To   : ${toAddress}`);
    console.log(`   Amount: ${amountUsdt} USDT (${amountSun} sun)`);

    // Build the TRC-20 transfer call
    const { transaction, result } = await tw.transactionBuilder.triggerSmartContract(
      TRON_USDT_CONTRACT,
      'transfer(address,uint256)',
      { feeLimit: 40_000_000 }, // 40 TRX max fee — sufficient for any USDT transfer
      [
        { type: 'address', value: toAddress },
        { type: 'uint256', value: amountSun },
      ],
      fromAddress
    );

    if (!result?.result) {
      throw new Error(`triggerSmartContract failed: ${JSON.stringify(result)}`);
    }

    const signedTx = await tw.trx.sign(transaction);
    const receipt  = await tw.trx.sendRawTransaction(signedTx);

    if (!receipt?.result && !receipt?.txid) {
      throw new Error(`USDT broadcast failed: ${JSON.stringify(receipt)}`);
    }

    const txid       = receipt.txid || receipt.transaction?.txID;
    const explorerUrl = `https://tronscan.org/#/transaction/${txid}`;

    console.log(`✅ [TronWallet] USDT sent! txid: ${txid}`);
    console.log(`   Explorer: ${explorerUrl}`);

    return {
      success:      true,
      txid,
      from:         fromAddress,
      to:           toAddress,
      amount_usdt:  parseFloat(amountUsdt),
      explorer_url: explorerUrl,
    };
  }

  // ── Convenience: check if a string is a valid Tron mainnet address ────────
  isValidTronAddress(address) {
    // Strict base58 alphabet: no 0, O, I, l (ambiguous chars excluded from base58check)
    return typeof address === 'string' && /^T[A-HJ-NP-Za-km-z1-9]{33}$/.test(address);
  }
}

module.exports = new TronWalletService();
