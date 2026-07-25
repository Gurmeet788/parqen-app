// backend/scripts/generate-new-mnemonic.js
//
// Generates a brand-new BIP39 mnemonic (24 words, 256-bit entropy) using
// bip39.generateMnemonic(), which sources randomness from Node's crypto.randomBytes
// (cryptographically secure). Writes it ONLY to a local, gitignored file — never
// prints it to stdout/chat, since a chat transcript is itself a leak surface.
//
// Usage: node scripts/generate-new-mnemonic.js
//
// After running:
//   1. Open backend/.env.new-mnemonic
//   2. Copy the mnemonic into your password manager / hardware wallet / offline backup
//   3. Delete backend/.env.new-mnemonic
//   4. Only once funds are fully migrated (see MIGRATION NOTES in the file), set it as
//      MNEMONIC in your real .env and restart the server.

const bip39 = require('bip39');
const fs    = require('fs');
const path  = require('path');

const mnemonic = bip39.generateMnemonic(256); // 24 words

const outPath = path.join(__dirname, '..', '.env.new-mnemonic');
const contents = `# NEW PRAQEN MNEMONIC — generated ${new Date().toISOString()}
# This file is gitignored (backend/.env.* pattern). Move this value to your password
# manager / secure offline storage, then DELETE this file.
#
# DO NOT set this as MNEMONIC in your real .env until fund migration is complete —
# see database/atomic_balance_debit.sql and the migration plan for the full sequence.

MNEMONIC=${mnemonic}
`;

fs.writeFileSync(outPath, contents, { mode: 0o600 });
console.log(`New mnemonic written to: ${outPath}`);
console.log('Word count:', mnemonic.split(' ').length);
console.log('\nNext: open that file, save the value securely, then delete the file.');
