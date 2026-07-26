const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');
const bip32 = require('bip32');
const fs = require('fs');

const mnemonic = fs.readFileSync('.temp-mnemonic.txt', 'utf8').trim();
const seed = bip39.mnemonicToSeedSync(mnemonic);
const root = bip32.fromSeed(seed);

// BTC address (BIP84 - native segwit)
const btcChild = root.derivePath("m/84'/0'/0'/0/0");
const { address: btcAddress } = bitcoin.payments.p2wpkh({ pubkey: btcChild.publicKey });
console.log('BTC Address:', btcAddress);

// Clean up
fs.unlinkSync('.temp-mnemonic.txt');
