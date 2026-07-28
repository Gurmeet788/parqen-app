/**
 * One-shot: Check if messages table exists, create it if needed,
 * then add sender_role column. Run with:
 *   node scripts/fix-messages-table.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function tableExists(name) {
  // Try selecting from it — if the table is missing, Supabase REST returns a 404-style error
  const { error } = await supabase.from(name).select('id').limit(1);
  if (error && error.message?.toLowerCase().includes('does not exist') ||
      error && error.message?.toLowerCase().includes('not found') ||
      error && error.message?.includes('schema cache') ||
      error && error.code === '404') return false;
  return true; // exists or some other error
}

async function run() {
  const exists = await tableExists('messages');
  console.log('messages table exists:', exists);

  if (!exists) {
    console.log('Creating messages table...');

    // Create via Supabase REST by using the .insert() trick — or log the SQL
    // Since we can't run raw SQL via Supabase JS client easily, we use the
    // .rpc('exec_sql') approach if available
    const { error: rpcErr } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
          sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
          recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
          message_text TEXT NOT NULL,
          attachment_url VARCHAR(500),
          is_read BOOLEAN DEFAULT false,
          message_type VARCHAR(50) DEFAULT 'CHAT',
          sender_role TEXT DEFAULT 'user',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    });

    if (rpcErr && rpcErr.message?.includes('function')) {
      console.log('exec_sql RPC not available. Run manually:' + '\n' +
        'CREATE TABLE IF NOT EXISTS messages (\n' +
        '  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n' +
        '  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,\n' +
        '  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,\n' +
        '  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,\n' +
        '  message_text TEXT NOT NULL,\n' +
        '  attachment_url VARCHAR(500),\n' +
        '  is_read BOOLEAN DEFAULT false,\n' +
        '  message_type VARCHAR(50) DEFAULT \'CHAT\',\n' +
        '  sender_role TEXT DEFAULT \'user\',\n' +
        '  created_at TIMESTAMPTZ DEFAULT NOW()\n' +
        ');'
      );
      return;
    }
    if (rpcErr) {
      console.error('Create table error:', rpcErr.message);
      return;
    }
    console.log('Table created successfully!');
  } else {
    console.log('Table exists — just adding sender_role column if missing...');
    const { error: alterErr } = await supabase.rpc('exec_sql', {
      sql: "ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_role TEXT DEFAULT 'user';"
    });
    if (alterErr && alterErr.message?.includes('function')) {
      console.log('exec_sql not available — add column manually:');
      console.log("  ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_role TEXT DEFAULT 'user';");
    } else if (alterErr) {
      console.error('Alter error:', alterErr.message);
    } else {
      console.log('sender_role column added/confirmed.');
    }
  }

  // Verify
  const { data, error } = await supabase.from('messages').select('*').limit(1);
  if (error) {
    console.log('Final check error:', error.message);
  } else {
    console.log('✅ messages table is queryable. Columns:', data.length > 0 ? Object.keys(data[0]).join(', ') : 'table empty');
  }
}

run().catch(e => console.error('Fatal:', e));
