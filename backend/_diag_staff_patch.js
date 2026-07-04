require('dotenv').config();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET || 'praqen-secret-change-in-production';
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

(async () => {
  // find an admin/moderator user to impersonate
  const { data: admin, error: adminErr } = await supabaseAdmin
    .from('users').select('id, username, is_admin, is_moderator').or('is_admin.eq.true,is_moderator.eq.true').limit(1).single();
  if (adminErr || !admin) { console.log('NO ADMIN FOUND', adminErr); process.exit(1); }
  console.log('Impersonating:', admin.username, admin.id);

  const token = jwt.sign({ userId: admin.id, email: null }, JWT_SECRET, { expiresIn: '1h' });

  const { data: before } = await supabaseAdmin.from('company_staff').select('*').limit(1).single();
  console.log('BEFORE (direct DB read):', { id: before.id, full_name: before.full_name, notes: before.notes });

  const testNote = 'DIAG_TEST_' + Date.now();
  try {
    const patchRes = await axios.patch(`http://localhost:5000/api/team/staff/${before.id}`, { notes: testNote }, { headers: { Authorization: `Bearer ${token}` } });
    console.log('PATCH response member.notes:', patchRes.data.member.notes);
  } catch (e) {
    console.log('PATCH FAILED:', e.response?.status, e.response?.data || e.message);
    process.exit(1);
  }

  const { data: after } = await supabaseAdmin.from('company_staff').select('*').eq('id', before.id).single();
  console.log('AFTER (fresh direct DB read):', { id: after.id, full_name: after.full_name, notes: after.notes });

  console.log(after.notes === testNote ? 'PERSISTED CORRECTLY' : 'MISMATCH — DID NOT PERSIST');

  // revert
  await supabaseAdmin.from('company_staff').update({ notes: before.notes }).eq('id', before.id);
  console.log('Reverted notes back to original.');
})();
