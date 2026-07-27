require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('Querying...');
  const start = Date.now();
  const { data, error } = await supabaseAdmin.from('users').select('*').eq('email', 'kendevdash@gmail.com').single();
  console.log('Done in', Date.now() - start, 'ms');
  if (error) console.log('Error:', error.message);
  else console.log('Found user:', data.username, '| has password_hash:', !!data.password_hash);
  process.exit(0);
})();
