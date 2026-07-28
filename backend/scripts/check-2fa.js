// check-2fa.js — Quick check of user's 2FA status in the database.
// Run: node scripts/check-2fa.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, email, two_factor_enabled, two_factor_method, totp_enrolled')
    .eq('email', 'areeshasattar127@gmail.com')
    .single();
  console.log('DATA:', JSON.stringify(user, null, 2));
  console.log('ERROR:', JSON.stringify(error, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
