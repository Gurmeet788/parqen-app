/**
 * One-time script: mark all email-verified users as phone verified
 * so existing users are not locked out of trading.
 * Run: node run-sql.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

(async () => {
  const { data, error, count } = await supabase
    .from('users')
    .update({ is_phone_verified: true, phone_verified: true })
    .eq('is_email_verified', true)
    .select('id', { count: 'exact' });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
  console.log(`✅ Updated ${count ?? (data?.length ?? 0)} users — all email-verified users are now phone-verified.`);
})();
