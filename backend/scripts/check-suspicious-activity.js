require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== Recent WITHDRAWAL / TRANSFER_OUT transactions (last 30 days) ===');
  const { data: withdrawals } = await supabaseAdmin
    .from('wallet_transactions')
    .select('user_id, type, amount_btc, status, destination_address, notes, created_at')
    .in('type', ['WITHDRAWAL', 'TRANSFER_OUT'])
    .gte('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50);
  console.log(`Found ${withdrawals?.length || 0} record(s) in last 30 days`);
  (withdrawals || []).forEach(w => {
    console.log(`  ${w.created_at} | user ${w.user_id?.slice(0,8)} | ${w.amount_btc} BTC | ${w.status} | -> ${w.destination_address || '(internal)'}`);
  });

  console.log('\n=== admin_audit_log: role/account changes (all time) ===');
  const { data: audit, error: auditErr } = await supabaseAdmin
    .from('admin_audit_log')
    .select('admin_id, target_id, action, details, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (auditErr) console.log('  (query error:', auditErr.message, ')');
  (audit || []).forEach(a => console.log(`  ${a.created_at} | admin ${a.admin_id?.slice(0,8)} -> target ${a.target_id?.slice(0,8)} | ${a.action} | ${JSON.stringify(a.details)}`));

  console.log('\n=== Current admins/moderators (headcount sanity check) ===');
  const { data: admins } = await supabaseAdmin.from('users').select('id, username, email, is_admin, is_moderator').or('is_admin.eq.true,is_moderator.eq.true');
  (admins || []).forEach(a => console.log(`  ${a.username} (${a.email}) admin=${a.is_admin} mod=${a.is_moderator}`));

  console.log('\n=== Any wallet_transactions with unusually large amounts (>0.01 BTC), all time ===');
  const { data: big } = await supabaseAdmin
    .from('wallet_transactions')
    .select('user_id, type, amount_btc, status, destination_address, created_at')
    .gt('amount_btc', 0.01)
    .order('created_at', { ascending: false })
    .limit(30);
  (big || []).forEach(w => console.log(`  ${w.created_at} | user ${w.user_id?.slice(0,8)} | ${w.type} | ${w.amount_btc} BTC | ${w.status} | -> ${w.destination_address || '(internal)'}`));
})();
