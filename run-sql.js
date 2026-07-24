/**
 * Run a SQL migration file against the Supabase database.
 *
 * Usage (from project root):
 *   node run-sql.js database/add_totp_secret_column.sql
 *
 * The script reads the SQL file, prints it, and gives you the
 * URL to paste it into your Supabase SQL Editor.
 */

const path = require('path');
const fs   = require('fs');

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('❌ Usage: node run-sql.js <path-to-sql-file>');
  console.error('   Example: node run-sql.js database/add_totp_secret_column.sql');
  process.exit(1);
}

const fullPath = path.resolve(__dirname, sqlFile);
if (!fs.existsSync(fullPath)) {
  console.error(`❌ File not found: ${fullPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(fullPath, 'utf8');

console.log('');
console.log(`📄 Migration file: ${sqlFile}`);
console.log('═══════════════════════════════════════════════════════════');
console.log(sql.trim());
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('📋 Follow these steps to run the migration:');
console.log('');
console.log('  1. Go to your Supabase dashboard:');
console.log('     https://supabase.com/dashboard/projects');
console.log('');
console.log('  2. Select your project');
console.log('');
console.log('  3. Open the SQL Editor (left sidebar → SQL Editor)');
console.log('');
console.log('  4. Paste the SQL from above into the editor');
console.log('');
console.log('  5. Click "Run" to execute');
console.log('');
console.log('✅ Done!');
