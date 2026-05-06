import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  LayoutDashboard, Users, ArrowLeftRight, AlertTriangle,
  ShieldCheck, DollarSign, List, Megaphone, LogOut,
  TrendingUp, CheckCircle, XCircle, Clock, Eye,
  Ban, UserCheck, Trash2, RefreshCw, ChevronLeft,
  ChevronRight, Search, X, Menu, Lock, Bitcoin,
  ThumbsUp, ThumbsDown, Star, Activity,
  Mail, Phone, UserPlus, MessageSquare, Maximize2,
  ChevronUp, Lightbulb, Send,
} from 'lucide-react';

// ─── Suggestion constants (shared with SuggestionsPanel) ─────
const SUGGESTION_CATS = [
  { id: 'feature',     label: 'Feature Request', emoji: '💡' },
  { id: 'trading',     label: 'Trading Tip',      emoji: '📈' },
  { id: 'bug',         label: 'Bug Report',       emoji: '🐛' },
  { id: 'improvement', label: 'Improvement',      emoji: '⚡' },
  { id: 'other',       label: 'Other',            emoji: '💬' },
];
const SUGGESTION_STATUS = {
  open:      { label: 'Open',         color: '#3B82F6', bg: '#EFF6FF'  },
  reviewing: { label: 'Under Review', color: '#92400E', bg: '#FFFBEB'  },
  planned:   { label: 'Planned',      color: '#6D28D9', bg: '#F5F3FF'  },
  building:  { label: 'Building',     color: '#EA580C', bg: '#FFF7ED'  },
  done:      { label: 'Done ✅',       color: '#166534', bg: '#F0FDF4'  },
  rejected:  { label: 'Not Planned',  color: '#6B7280', bg: '#F9FAFB'  },
};

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = 'parqen5@gmail.com';

// ─── colour palette ───────────────────────────────────────────
const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', amber:'#F59E0B',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', paid:'#3B82F6', warn:'#F59E0B',
};

// ─── helpers ─────────────────────────────────────────────────
const authH  = () => { const t = localStorage.getItem('adminToken') || localStorage.getItem('token'); return t ? { Authorization: `Bearer ${t}` } : {}; };
const fmt    = (n, d = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
const fmtBtc = (n) => parseFloat(n || 0).toFixed(6);
const fmtAge = (ts) => {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60)  return 'Just now';
  if (s < 3600) return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
const statusColor = (s) => {
  const m = { COMPLETED:'#10B981', CANCELLED:'#6B7280', DISPUTED:'#8B5CF6', ACTIVE:'#3B82F6', PAID:'#3B82F6', PAYMENT_SENT:'#3B82F6', ESCROW:'#F59E0B', CREATED:'#F59E0B', FUNDS_LOCKED:'#F59E0B', OPEN:'#2D6A4F' };
  return m[s] || '#94A3B8';
};

// ─── Spinner ─────────────────────────────────────────────────
function Spin() {
  return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor:`${C.forest}20`, borderTopColor:C.forest }} /></div>;
}

// ─── Empty state ─────────────────────────────────────────────
function Empty({ icon = '📭', text = 'No data found' }) {
  return <div className="flex flex-col items-center py-16 gap-2"><span className="text-4xl">{icon}</span><p className="text-sm font-semibold" style={{ color: C.g500 }}>{text}</p></div>;
}

// ─── Image lightbox modal ─────────────────────────────────────
function ImageModal({ src, label, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white text-sm font-black">{label}</span>
          <button onClick={onClose} className="text-white hover:text-gray-300 transition">
            <X size={20} />
          </button>
        </div>
        <img src={src} alt={label} className="w-full rounded-2xl max-h-[80vh] object-contain"
          style={{ backgroundColor: '#111' }} />
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = C.forest, bg = '#F0FDF4' }) {
  return (
    <div className="bg-white rounded-2xl border p-4 flex items-center gap-4" style={{ borderColor: C.g200 }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.g400 }}>{label}</p>
        <p className="text-xl font-black truncate" style={{ color: C.g800 }}>{value}</p>
        {sub && <p className="text-xs" style={{ color: C.g400 }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Badge pill ───────────────────────────────────────────────
function Pill({ label, color = '#10B981', bg = '#F0FDF4' }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black" style={{ color, backgroundColor: bg }}>{label}</span>;
}

// ─── Section header ───────────────────────────────────────────
function SectionHead({ title, sub, action }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.g800 }}>{title}</h2>
        {sub && <p className="text-xs mt-0.5" style={{ color: C.g400 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ================================================================
// LOGIN SCREEN
// ================================================================
function AdminLogin({ onAuth }) {
  const [email, setEmail]       = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/auth/login`, { email, password });
      const { token, user } = r.data;
      if (!token) throw new Error('No token returned');
      if (user?.email !== ADMIN_EMAIL && !user?.is_admin && !user?.is_moderator) {
        throw new Error('This account does not have admin access');
      }
      localStorage.setItem('adminToken', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onAuth(user, token);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(145deg,${C.forest} 0%,#0c2418 50%,${C.green} 100%)` }}>
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: C.gold }}>
            <span className="text-3xl font-black" style={{ color: C.forest, fontFamily: 'Georgia,serif' }}>P</span>
          </div>
          <h1 className="text-white text-2xl font-black" style={{ fontFamily: 'Georgia,serif' }}>PRAQEN</h1>
          <p className="text-white/50 text-sm mt-1 font-semibold tracking-widest uppercase">Admin Panel</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-black mb-1" style={{ color: C.g800 }}>Admin Login</h2>
          <p className="text-sm mb-6" style={{ color: C.g400 }}>Sign in with your administrator account</p>

          {err && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl text-sm" style={{ backgroundColor:'#FEF2F2', border:'1px solid #FCA5A5', color:'#991B1B' }}>
              <XCircle size={14} /> {err}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Email Address</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none focus:ring-2"
                style={{ borderColor: C.g200, color: C.g800 }}
                placeholder="admin@praqen.com" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none focus:ring-2"
                style={{ borderColor: C.g200, color: C.g800 }}
                placeholder="••••••••" />
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full mt-6 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Signing in…</> : <><Lock size={14} /> Sign in to Admin Panel</>}
          </button>
        </form>

        <p className="text-center mt-6 text-white/30 text-xs">PRAQEN Admin • Restricted Access</p>
      </div>
    </div>
  );
}

// ================================================================
// OVERVIEW SECTION
// ================================================================
function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    axios.get(`${API_URL}/admin/stats`, { headers: authH() })
      .then(r => setStats(r.data))
      .catch(() => toast.error('Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spin />;
  if (!stats) return <Empty text="Could not load stats" />;

  const maxTrade = Math.max(...(stats.tradeDays || []).map(d => d.count), 1);

  return (
    <div className="space-y-6">
      <SectionHead title="Platform Overview" sub={`Live data — ${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}`}
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users size={22} />}      label="Total Users"      value={fmt(stats.totalUsers)}     sub={`+${stats.newUsersToday} today`} />
        <StatCard icon={<ArrowLeftRight size={22}/>} label="Total Trades"  value={fmt(stats.totalTrades)}    sub={`${stats.activeTrades} active`} color="#3B82F6" bg="#EFF6FF" />
        <StatCard icon={<DollarSign size={22} />}  label="Platform Revenue" value={`$${fmt(stats.totalRevUsd,2)}`} sub={`${fmtBtc(stats.totalRevBtc)} BTC`} color="#F59E0B" bg="#FFFBEB" />
        <StatCard icon={<Activity size={22} />}    label="Volume (USD)"    value={`$${fmt(stats.totalVolumeUsd,0)}`} sub={`${fmtBtc(stats.totalVolumeBtc)} BTC`} color="#8B5CF6" bg="#F5F3FF" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<CheckCircle size={22} />} label="Completed"    value={fmt(stats.completedTrades)} color={C.success} bg="#F0FDF4" />
        <StatCard icon={<AlertTriangle size={22}/>} label="Disputes"    value={fmt(stats.openDisputes)}   color="#EF4444" bg="#FEF2F2" />
        <StatCard icon={<ShieldCheck size={22} />} label="Pending KYC"  value={fmt(stats.pendingKyc)}     color="#F59E0B" bg="#FFFBEB" />
        <StatCard icon={<List size={22} />}         label="Listings"     value={fmt(stats.activeListings)} sub="active" color={C.green} bg="#F0FDF4" />
      </div>

      {/* Trade chart */}
      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: C.g200 }}>
        <h3 className="font-black text-sm mb-4" style={{ color: C.g700 }}>Trades — Last 7 Days</h3>
        <div className="flex items-end gap-2 h-28">
          {(stats.tradeDays || []).map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs font-bold" style={{ color: C.g500 }}>{d.count}</span>
              <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max((d.count / maxTrade) * 88, 4)}px`, backgroundColor: d.count > 0 ? C.forest : C.g200 }} />
              <span className="text-xs font-semibold" style={{ color: C.g400 }}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Verified Users',    value:`${fmt(stats.verifiedUsers)}`,    sub:'email verified' },
          { label:'KYC Verified',      value:`${fmt(stats.kycVerified)}`,      sub:'identity confirmed' },
          { label:'New This Week',     value:`${fmt(stats.newUsersWeek)}`,     sub:'new registrations' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: C.forest }}>{s.value}</p>
            <p className="text-xs font-bold mt-1" style={{ color: C.g700 }}>{s.label}</p>
            <p className="text-xs" style={{ color: C.g400 }}>{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================================================================
// USERS SECTION
// ================================================================
function UsersSection() {
  const [users, setUsers]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [filter, setFilter]   = useState('');
  const [selected, setSelected] = useState(null);
  const [acting, setActing]   = useState(false);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/users`, { headers: authH(), params: { search, status: filter, page, limit: LIMIT } });
      setUsers(r.data.users || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }, [search, filter, page]);

  useEffect(() => { setPage(1); }, [search, filter]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, updates, label) => {
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/users/${id}`, updates, { headers: authH() });
      toast.success(`${label} successful`);
      load();
      if (selected?.id === id) setSelected(s => ({ ...s, ...updates }));
    } catch (e) { toast.error(e.response?.data?.error || 'Action failed'); }
    finally { setActing(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Permanently delete this user? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/admin/users/${id}`, { headers: authH() });
      toast.success('User deleted');
      setSelected(null);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Delete failed'); }
  };

  return (
    <div className="space-y-4">
      <SectionHead title={`Users (${fmt(total)})`} sub="Manage user accounts, roles, and verification" />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2 flex-1 min-w-[200px]" style={{ borderColor: C.g200 }}>
          <Search size={14} style={{ color: C.g400 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username, email…"
            className="flex-1 text-sm outline-none" style={{ color: C.g700 }} />
          {search && <button onClick={() => setSearch('')}><X size={13} style={{ color: C.g400 }} /></button>}
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
        <button onClick={load} className="bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {loading ? <Spin /> : users.length === 0 ? <Empty icon="👤" text="No users found" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['User', 'Status', 'Trades', 'Verified', 'Joined', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className="border-t hover:bg-gray-50 cursor-pointer transition"
                      style={{ borderColor: C.g100 }}
                      onClick={() => setSelected(u)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ backgroundColor: C.forest }}>{(u.username || '?')[0].toUpperCase()}</div>
                          <div>
                            <p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p>
                            <p className="text-xs" style={{ color: C.g400 }}>{u.email}</p>
                          </div>
                          {u.is_admin && <span className="text-xs px-1.5 py-0.5 rounded font-black" style={{ backgroundColor:'#FFFBEB', color:'#92400E' }}>ADMIN</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={u.account_status || 'active'}
                          color={u.account_status === 'banned' ? '#991B1B' : u.account_status === 'suspended' ? '#92400E' : '#166534'}
                          bg={u.account_status === 'banned' ? '#FEF2F2' : u.account_status === 'suspended' ? '#FFFBEB' : '#F0FDF4'} />
                      </td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g700 }}>{u.total_trades || 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {u.is_email_verified && <span title="Email" className="text-xs">📧</span>}
                          {u.is_phone_verified && <span title="Phone" className="text-xs">📱</span>}
                          {u.is_id_verified    && <span title="KYC"   className="text-xs">🪪</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={e => { e.stopPropagation(); act(u.id, { account_status: u.account_status === 'banned' ? 'active' : 'banned' }, u.account_status === 'banned' ? 'Unban' : 'Ban'); }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition" title={u.account_status === 'banned' ? 'Unban' : 'Ban'}>
                            <Ban size={13} style={{ color: u.account_status === 'banned' ? C.success : C.danger }} />
                          </button>
                          <button onClick={e => { e.stopPropagation(); del(u.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition" title="Delete">
                            <Trash2 size={13} style={{ color: C.danger }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.g100 }}>
              <span className="text-xs" style={{ color: C.g400 }}>Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30">
                  <ChevronLeft size={16} style={{ color: C.g500 }} />
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total} className="p-1 rounded disabled:opacity-30">
                  <ChevronRight size={16} style={{ color: C.g500 }} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User detail panel */}
        {selected && (
          <div className="w-72 bg-white rounded-2xl border p-4 flex-shrink-0" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-black text-sm" style={{ color: C.g800 }}>User Detail</h3>
              <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white mb-3" style={{ backgroundColor: C.forest }}>
              {(selected.username || '?')[0].toUpperCase()}
            </div>
            <p className="font-black" style={{ color: C.g800 }}>{selected.username}</p>
            <p className="text-xs mb-1" style={{ color: C.g400 }}>{selected.email}</p>
            <p className="text-xs mb-4" style={{ color: C.g500 }}>Joined {fmtDate(selected.created_at)}</p>

            <div className="space-y-1.5 mb-4">
              {[
                { label:'Trades',     value: selected.total_trades || 0 },
                { label:'Rating',     value: `⭐ ${parseFloat(selected.average_rating || 0).toFixed(1)}` },
                { label:'Completion', value: `${parseFloat(selected.completion_rate || 0).toFixed(1)}%` },
                { label:'Badge',      value: selected.badge || 'BEGINNER' },
                { label:'Country',    value: selected.country || '—' },
                { label:'Last login', value: fmtAge(selected.last_login) },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: C.g100 }}>
                  <span className="text-xs" style={{ color: C.g400 }}>{r.label}</span>
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>{r.value}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {/* Verify Email */}
              {!selected.is_email_verified && (
                <button disabled={acting} onClick={async () => {
                  setActing(true);
                  try {
                    await axios.put(`${API_URL}/admin/users/${selected.id}/verify-email`, {}, { headers: authH() });
                    toast.success('Email verified ✅');
                    load();
                    setSelected(s => ({ ...s, is_email_verified: true }));
                  } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
                  finally { setActing(false); }
                }}
                  className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                  <Mail size={12} /> Verify Email
                </button>
              )}
              {/* Verify Phone */}
              {!selected.is_phone_verified && (
                <button disabled={acting} onClick={async () => {
                  setActing(true);
                  try {
                    await axios.put(`${API_URL}/admin/users/${selected.id}/verify-phone`, {}, { headers: authH() });
                    toast.success('Phone verified ✅');
                    load();
                    setSelected(s => ({ ...s, is_phone_verified: true }));
                  } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
                  finally { setActing(false); }
                }}
                  className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: '#F0FDF4', color: '#166534' }}>
                  <Phone size={12} /> Verify Phone
                </button>
              )}
              {/* Ban / Unban */}
              <button disabled={acting} onClick={async () => {
                setActing(true);
                const isBanned = selected.account_status === 'banned';
                const endpoint = isBanned ? 'unban' : 'ban';
                const label = isBanned ? 'Unban' : 'Ban user';
                try {
                  await axios.put(`${API_URL}/admin/users/${selected.id}/${endpoint}`, {}, { headers: authH() });
                  toast.success(`${label} successful`);
                  load();
                  setSelected(s => ({ ...s, account_status: isBanned ? 'active' : 'banned' }));
                } catch (e) { toast.error(e.response?.data?.error || 'Action failed'); }
                finally { setActing(false); }
              }}
                className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                style={{ backgroundColor: selected.account_status === 'banned' ? '#F0FDF4' : '#FEF2F2', color: selected.account_status === 'banned' ? '#166534' : '#991B1B' }}>
                <Ban size={12} /> {selected.account_status === 'banned' ? 'Unban User' : 'Ban User'}
              </button>
              {/* KYC toggle */}
              <button disabled={acting} onClick={() => act(selected.id, { is_id_verified: !selected.is_id_verified }, 'KYC update')}
                className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#F5F3FF', color: '#6D28D9' }}>
                <ShieldCheck size={12} /> {selected.is_id_verified ? 'Revoke KYC' : 'Approve KYC'}
              </button>
              {/* Admin toggle */}
              <button disabled={acting} onClick={async () => {
                setActing(true);
                try {
                  const r = await axios.put(`${API_URL}/admin/users/${selected.id}/make-admin`, {}, { headers: authH() });
                  toast.success('Role updated');
                  load();
                  setSelected(s => ({ ...s, is_admin: r.data.is_admin }));
                } catch (e) { toast.error(e.response?.data?.error || 'Action failed'); }
                finally { setActing(false); }
              }}
                className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
                <UserCheck size={12} /> {selected.is_admin ? 'Remove Admin' : 'Make Admin'}
              </button>
              <button onClick={() => del(selected.id)}
                className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                <Trash2 size={12} /> Delete Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// TRADES SECTION
// ================================================================
function TradesSection() {
  const [trades, setTrades]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [page, setPage]       = useState(1);
  const [selected, setSelected] = useState(null);
  const [acting, setActing]   = useState(false);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params: { status: filter, page, limit: LIMIT } });
      setTrades(r.data.trades || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load trades'); }
    finally { setLoading(false); }
  }, [filter, page]);

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { load(); }, [load]);

  const forceStatus = async (id, status) => {
    if (!window.confirm(`Force trade status to ${status}?`)) return;
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/trades/${id}`, { status }, { headers: authH() });
      toast.success(`Trade set to ${status}`);
      load();
      setSelected(null);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  const STATUS_OPTS = ['', 'CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'COMPLETED', 'CANCELLED', 'DISPUTED'];

  return (
    <div className="space-y-4">
      <SectionHead title={`All Trades (${fmt(total)})`} sub="Monitor and manage platform trades" />

      <div className="flex gap-2 flex-wrap">
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
        <button onClick={load} className="bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {loading ? <Spin /> : trades.length === 0 ? <Empty icon="🔄" text="No trades found" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['Trade ID', 'Buyer', 'Seller', 'Amount', 'Status', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id} onClick={() => setSelected(t)}
                      className="border-t hover:bg-gray-50 cursor-pointer transition" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: C.g600 }}>{(t.trade_ref || t.id).slice(0, 12).toUpperCase()}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{t.buyer?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{t.seller?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>
                        ${fmt(t.amount_usd, 2)}<br />
                        <span className="font-normal text-xs" style={{ color: C.g400 }}>{fmtBtc(t.amount_btc)} BTC</span>
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={t.status} color={statusColor(t.status)} bg={`${statusColor(t.status)}15`} />
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.g100 }}>
              <span className="text-xs" style={{ color: C.g400 }}>{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30"><ChevronLeft size={16} /></button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total} className="p-1 rounded disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Trade detail */}
        {selected && (
          <div className="w-72 bg-white rounded-2xl border p-4 flex-shrink-0" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-black text-sm" style={{ color: C.g800 }}>Trade Detail</h3>
              <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
            </div>
            <Pill label={selected.status} color={statusColor(selected.status)} bg={`${statusColor(selected.status)}15`} />
            <div className="space-y-1.5 mt-3 mb-4">
              {[
                { label:'ID',      value: (selected.trade_ref || selected.id).slice(0, 12).toUpperCase() },
                { label:'Buyer',   value: selected.buyer?.username || '—' },
                { label:'Seller',  value: selected.seller?.username || '—' },
                { label:'USD',     value: `$${fmt(selected.amount_usd, 2)}` },
                { label:'BTC',     value: `${fmtBtc(selected.amount_btc)} BTC` },
                { label:'Created', value: fmtDate(selected.created_at) },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: C.g100 }}>
                  <span className="text-xs" style={{ color: C.g400 }}>{r.label}</span>
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>{r.value}</span>
                </div>
              ))}
            </div>
            {!['COMPLETED','CANCELLED'].includes(selected.status) && (
              <div className="space-y-2">
                <p className="text-xs font-black mb-1" style={{ color: C.g500 }}>Force Actions</p>
                <button disabled={acting} onClick={() => forceStatus(selected.id, 'COMPLETED')}
                  className="w-full py-2.5 rounded-xl text-xs font-black" style={{ backgroundColor:'#F0FDF4', color:'#166534' }}>✅ Force Complete</button>
                <button disabled={acting} onClick={() => forceStatus(selected.id, 'CANCELLED')}
                  className="w-full py-2.5 rounded-xl text-xs font-black" style={{ backgroundColor:'#FEF2F2', color:'#991B1B' }}>❌ Force Cancel</button>
                <button disabled={acting} onClick={() => forceStatus(selected.id, 'DISPUTED')}
                  className="w-full py-2.5 rounded-xl text-xs font-black" style={{ backgroundColor:'#F5F3FF', color:'#6D28D9' }}>⚠️ Mark Disputed</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// DISPUTES SECTION
// ================================================================
function DisputesSection() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [resolution, setRes]    = useState('BUYER_WINS');
  const [notes, setNotes]       = useState('');
  const [submitting, setSub]    = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/disputes`, { headers: authH() });
      setDisputes(r.data.disputes || []);
    } catch { toast.error('Failed to load disputes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resolve = async () => {
    if (!selected) return;
    if (!window.confirm(`Resolve this dispute with: ${resolution}?`)) return;
    setSub(true);
    try {
      await axios.post(`${API_URL}/admin/disputes/${selected.id}/resolve`, { resolution, notes }, { headers: authH() });
      toast.success(`Dispute resolved: ${resolution}`);
      setSelected(null); setNotes('');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to resolve'); }
    finally { setSub(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHead title={`Open Disputes (${disputes.length})`} sub="Mediate and resolve trade disputes"
        action={<button onClick={load} className="p-2 rounded-xl border" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {loading ? <Spin /> : disputes.length === 0 ? <Empty icon="⚖️" text="No open disputes" /> : (
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            {disputes.map(d => (
              <div key={d.id} onClick={() => setSelected(d)}
                className="bg-white rounded-2xl border p-4 cursor-pointer transition hover:shadow-md"
                style={{ borderColor: selected?.id === d.id ? '#EF4444' : C.g200, borderWidth: selected?.id === d.id ? 2 : 1 }}>
                <div className="flex items-start justify-between mb-2">
                  <Pill label="DISPUTED" color="#991B1B" bg="#FEF2F2" />
                  <span className="text-xs" style={{ color: C.g400 }}>{fmtAge(d.created_at)}</span>
                </div>
                <p className="text-xs font-bold mb-1" style={{ color: C.g700 }}>
                  🛒 {d.buyer?.username || 'Buyer'} vs {d.seller?.username || 'Seller'}
                </p>
                <p className="text-xs" style={{ color: C.g500 }}>Trade #{(d.trade_id || '').slice(0, 8).toUpperCase()}</p>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: C.g600 }}>
                  {d.reason?.slice(0, 120)}{d.reason?.length > 120 ? '…' : ''}
                </p>
              </div>
            ))}
          </div>

          {selected && (
            <div className="w-80 bg-white rounded-2xl border p-5 flex-shrink-0" style={{ borderColor: C.g200 }}>
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-black text-sm" style={{ color: C.g800 }}>Resolve Dispute</h3>
                <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
              </div>
              <div className="space-y-1.5 mb-4">
                {[
                  { label:'Buyer',  value: selected.buyer?.username  || '—' },
                  { label:'Seller', value: selected.seller?.username || '—' },
                  { label:'Reason', value: selected.reason },
                ].map(r => (
                  <div key={r.label} className="py-1.5 border-b" style={{ borderColor: C.g100 }}>
                    <span className="text-xs font-semibold" style={{ color: C.g400 }}>{r.label}</span>
                    <p className="text-xs font-bold mt-0.5" style={{ color: C.g700 }}>{r.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-xs font-black" style={{ color: C.g700 }}>Decision</p>
                {[
                  { v:'BUYER_WINS',  label:'Buyer Wins — release BTC to buyer',  color:'#1D4ED8', bg:'#EFF6FF' },
                  { v:'SELLER_WINS', label:'Seller Wins — funds stay with seller', color:'#166534', bg:'#F0FDF4' },
                  { v:'CANCEL',      label:'Cancel — return BTC to seller',       color:'#991B1B', bg:'#FEF2F2' },
                ].map(opt => (
                  <button key={opt.v} onClick={() => setRes(opt.v)}
                    className="w-full text-left py-2.5 px-3 rounded-xl text-xs font-bold transition border-2"
                    style={{ backgroundColor: resolution === opt.v ? opt.bg : '#fff', color: resolution === opt.v ? opt.color : C.g500, borderColor: resolution === opt.v ? opt.color : C.g200 }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Moderator notes (optional)…"
                className="w-full border rounded-xl px-3 py-2.5 text-xs outline-none resize-none mb-3"
                style={{ borderColor: C.g200, color: C.g700 }} />

              <button onClick={resolve} disabled={submitting}
                className="w-full py-3 rounded-xl text-sm font-black transition"
                style={{ backgroundColor: submitting ? C.g200 : C.forest, color: submitting ? C.g400 : '#fff' }}>
                {submitting ? 'Resolving…' : '⚖️ Confirm Resolution'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// KYC REVIEW SECTION
// ================================================================
function KycSection() {
  const [submissions, setSubs]     = useState([]);
  const [loading, setLoading]      = useState(true);
  const [filter, setFilter]        = useState('pending');
  const [selected, setSelected]    = useState(null);
  const [acting, setActing]        = useState(false);
  const [zoomImg, setZoomImg]      = useState(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [migrationHint, setMigrationHint]     = useState('');
  const [backfilling, setBackfilling]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMigrationNeeded(false);
    try {
      const r = await axios.get(`${API_URL}/admin/kyc`, { headers: authH(), params: { status: filter } });
      setSubs(r.data.submissions || []);
      if (r.data.migration_needed) {
        setMigrationNeeded(true);
        setMigrationHint(r.data.migration_hint || '');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load KYC');
    }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const backfill = async () => {
    setBackfilling(true);
    try {
      const r = await axios.post(`${API_URL}/admin/backfill-kyc`, {}, { headers: authH() });
      if (r.data.updated > 0) {
        toast.success(`Fixed ${r.data.updated} legacy submission(s) — now showing as pending`);
        load();
      } else {
        toast.info('No legacy submissions found to fix');
      }
    } catch (e) { toast.error(e.response?.data?.error || 'Backfill failed'); }
    finally { setBackfilling(false); }
  };

  const approve = async (id) => {
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/kyc/${id}/approve`, {}, { headers: authH() });
      toast.success('KYC approved ✅');
      setSelected(null); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  const reject = async (id) => {
    const reason = window.prompt('Rejection reason (sent to user):');
    if (!reason) return;
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/kyc/${id}/reject`, { reason }, { headers: authH() });
      toast.success('KYC rejected');
      setSelected(null); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  return (
    <div className="space-y-4">
      {zoomImg && <ImageModal src={zoomImg.src} label={zoomImg.label} onClose={() => setZoomImg(null)} />}
      <SectionHead title="KYC Review" sub="Review and approve user identity documents"
        action={
          <div className="flex gap-2 items-center">
            {['pending','approved','rejected','all'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition"
                style={{ backgroundColor: filter === s ? C.forest : C.g100, color: filter === s ? '#fff' : C.g600 }}>
                {s}
              </button>
            ))}
            <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
              <RefreshCw size={14} style={{ color: C.g500 }} />
            </button>
          </div>
        } />

      {/* Migration warning banner */}
      {migrationNeeded && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border-2" style={{ backgroundColor:'#FFFBEB', borderColor:'#F59E0B' }}>
          <AlertTriangle size={18} style={{ color:'#92400E', flexShrink:0, marginTop:1 }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black" style={{ color:'#92400E' }}>Database Migration Required</p>
            <p className="text-xs mt-0.5 mb-3" style={{ color:'#A16207' }}>
              KYC columns are missing from your database. Run <code className="font-mono bg-yellow-100 px-1 rounded">admin_columns.sql</code> in your Supabase SQL Editor to enable full KYC management.
            </p>
            <details className="mb-2">
              <summary className="text-xs font-bold cursor-pointer" style={{ color:'#92400E' }}>Show SQL to run →</summary>
              <pre className="mt-2 text-xs p-3 rounded-xl overflow-x-auto" style={{ backgroundColor:'#1E293B', color:'#94A3B8' }}>{`ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_id_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_id_url TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_selfie_url TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_approved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT DEFAULT NULL;
UPDATE users SET kyc_status = 'approved' WHERE is_id_verified = true AND kyc_status IS NULL;`}</pre>
            </details>
          </div>
        </div>
      )}

      {/* Backfill button — shown when results are empty and not loading */}
      {!loading && !migrationNeeded && submissions.length === 0 && filter === 'pending' && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border" style={{ backgroundColor:'#EFF6FF', borderColor:'#BFDBFE' }}>
          <div className="flex-1">
            <p className="text-sm font-black" style={{ color:'#1E40AF' }}>No pending submissions found</p>
            <p className="text-xs mt-0.5" style={{ color:'#3B82F6' }}>
              If users uploaded documents before the KYC tracking was set up, click below to mark them as pending.
            </p>
          </div>
          <button onClick={backfill} disabled={backfilling}
            className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition"
            style={{ backgroundColor: backfilling ? C.g200 : C.forest, color: backfilling ? C.g400 : '#fff' }}>
            {backfilling ? <><RefreshCw size={12} className="animate-spin" /> Fixing…</> : '🔧 Fix Legacy Submissions'}
          </button>
        </div>
      )}

      {loading ? <Spin /> : submissions.length === 0 ? null : (
        <div className="flex gap-4">
          <div className="flex-1 grid grid-cols-1 gap-3">
            {submissions.map(u => (
              <div key={u.id} onClick={() => setSelected(u)}
                className="bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition"
                style={{ borderColor: selected?.id === u.id ? C.forest : C.g200, borderWidth: selected?.id === u.id ? 2 : 1 }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ backgroundColor: C.forest }}>
                    {(u.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm" style={{ color: C.g800 }}>{u.username}</p>
                    <p className="text-xs truncate" style={{ color: C.g400 }}>{u.email}</p>
                  </div>
                  <div className="text-right">
                    <Pill label={u.kyc_status || 'unverified'}
                      color={u.kyc_status === 'approved' ? '#166534' : u.kyc_status === 'rejected' ? '#991B1B' : u.kyc_status === 'pending' ? '#92400E' : '#475569'}
                      bg={u.kyc_status === 'approved' ? '#F0FDF4' : u.kyc_status === 'rejected' ? '#FEF2F2' : u.kyc_status === 'pending' ? '#FFFBEB' : C.g100} />
                    <p className="text-xs mt-1" style={{ color: C.g400 }}>{u.kyc_id_type || (u.kyc_id_url ? 'Has document' : 'No doc')}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className="w-80 bg-white rounded-2xl border p-5 flex-shrink-0" style={{ borderColor: C.g200 }}>
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-black text-sm" style={{ color: C.g800 }}>KYC Submission</h3>
                <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
              </div>
              <p className="font-black" style={{ color: C.g800 }}>{selected.username}</p>
              <p className="text-xs mb-3" style={{ color: C.g400 }}>{selected.email}</p>
              <div className="space-y-1.5 mb-4">
                {[
                  { label:'ID Type',   value: selected.kyc_id_type || '—' },
                  { label:'Country',   value: selected.country || '—' },
                  { label:'Submitted', value: fmtAge(selected.kyc_submitted_at) },
                  { label:'Status',    value: selected.kyc_status || 'pending' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between py-1.5 border-b" style={{ borderColor: C.g100 }}>
                    <span className="text-xs" style={{ color: C.g400 }}>{r.label}</span>
                    <span className="text-xs font-bold" style={{ color: C.g700 }}>{r.value}</span>
                  </div>
                ))}
              </div>

              {selected.kyc_id_url && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-black" style={{ color: C.g500 }}>ID Document</p>
                    <button onClick={() => setZoomImg({ src: selected.kyc_id_url, label: `${selected.username} — ID Document` })}
                      className="flex items-center gap-1 text-xs font-bold hover:opacity-70 transition" style={{ color: C.forest }}>
                      <Maximize2 size={11} /> Enlarge
                    </button>
                  </div>
                  <div onClick={() => setZoomImg({ src: selected.kyc_id_url, label: `${selected.username} — ID Document` })}
                    className="block w-full h-32 rounded-xl bg-gray-100 overflow-hidden border cursor-zoom-in" style={{ borderColor: C.g200 }}>
                    <img src={selected.kyc_id_url} alt="ID" className="w-full h-full object-cover" onError={e => e.target.style.display='none'} />
                  </div>
                </div>
              )}
              {selected.kyc_selfie_url && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-black" style={{ color: C.g500 }}>Selfie</p>
                    <button onClick={() => setZoomImg({ src: selected.kyc_selfie_url, label: `${selected.username} — Selfie` })}
                      className="flex items-center gap-1 text-xs font-bold hover:opacity-70 transition" style={{ color: C.forest }}>
                      <Maximize2 size={11} /> Enlarge
                    </button>
                  </div>
                  <div onClick={() => setZoomImg({ src: selected.kyc_selfie_url, label: `${selected.username} — Selfie` })}
                    className="block w-full h-32 rounded-xl bg-gray-100 overflow-hidden border cursor-zoom-in" style={{ borderColor: C.g200 }}>
                    <img src={selected.kyc_selfie_url} alt="Selfie" className="w-full h-full object-cover" onError={e => e.target.style.display='none'} />
                  </div>
                </div>
              )}

              {selected.kyc_status === 'pending' && (
                <div className="flex gap-2">
                  <button disabled={acting} onClick={() => approve(selected.id)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-black" style={{ backgroundColor:'#F0FDF4', color:'#166534' }}>
                    ✅ Approve
                  </button>
                  <button disabled={acting} onClick={() => reject(selected.id)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-black" style={{ backgroundColor:'#FEF2F2', color:'#991B1B' }}>
                    ❌ Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// FINANCE SECTION
// ================================================================
function FinanceSection() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      axios.get(`${API_URL}/admin/revenue`,  { headers: authH() }),
      axios.get(`${API_URL}/admin/profits`,  { headers: authH() }),
    ]).then(([rev, prof]) => {
      setData({ ...rev.data, profits: prof.data.profits || [], totalBtc: prof.data.totalBtc, totalUsd: prof.data.totalUsd });
    }).catch(() => toast.error('Failed to load revenue'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spin />;
  if (!data) return <Empty text="No financial data" />;

  return (
    <div className="space-y-5">
      <SectionHead title="Finance & Revenue" sub="Platform fee collections and affiliate commissions"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Bitcoin size={22} />}     label="Total Revenue (BTC)" value={`${fmtBtc(data.totalRevBtc)} BTC`} color="#F59E0B" bg="#FFFBEB" />
        <StatCard icon={<DollarSign size={22} />}  label="Total Revenue (USD)" value={`$${fmt(data.totalRevUsd, 2)}`} color={C.success} bg="#F0FDF4" />
        <StatCard icon={<TrendingUp size={22} />}  label="Affiliate Payouts"   value={`${fmtBtc(data.totalAffBtc)} BTC`} color="#8B5CF6" bg="#F5F3FF" />
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
          <h3 className="font-black text-sm" style={{ color: C.g800 }}>Fee Collections</h3>
        </div>
        {data.profits.length === 0 ? <Empty icon="💰" text="No fee collections yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['Trade ID', 'BTC Fee', 'USD Fee', 'Status', 'Date'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.profits.slice(0, 50).map(p => (
                  <tr key={p.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: C.g600 }}>{(p.trade_id || '').slice(0, 8).toUpperCase()}…</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>{fmtBtc(p.profit_btc)} BTC</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>${fmt(p.profit_usd, 2)}</td>
                    <td className="px-4 py-3"><Pill label={p.status || 'COLLECTED'} color="#166534" bg="#F0FDF4" /></td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(p.collected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.affiliates?.length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
            <h3 className="font-black text-sm" style={{ color: C.g800 }}>Affiliate Commissions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['BTC Commission', 'USD Commission', 'Status', 'Date'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.affiliates.slice(0, 20).map((a, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>{fmtBtc(a.commission_btc)} BTC</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>${fmt(a.commission_usd, 2)}</td>
                    <td className="px-4 py-3"><Pill label={a.status} color={a.status === 'COMPLETED' ? '#166534' : '#92400E'} bg={a.status === 'COMPLETED' ? '#F0FDF4' : '#FFFBEB'} /></td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// LISTINGS SECTION
// ================================================================
function ListingsSection() {
  const [listings, setListings] = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');
  const [page, setPage]         = useState(1);
  const [acting, setActing]     = useState(false);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/listings/all`, { headers: authH(), params: { status: filter, page, limit: LIMIT } });
      setListings(r.data.listings || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load listings'); }
    finally { setLoading(false); }
  }, [filter, page]);

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id, currentStatus) => {
    setActing(true);
    try {
      const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      await axios.put(`${API_URL}/admin/listings/${id}`, { status: newStatus }, { headers: authH() });
      toast.success(`Listing ${newStatus.toLowerCase()}`);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this listing permanently?')) return;
    try {
      await axios.delete(`${API_URL}/admin/listings/${id}`, { headers: authH() });
      toast.success('Listing deleted');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Delete failed'); }
  };

  return (
    <div className="space-y-4">
      <SectionHead title={`Listings (${fmt(total)})`} sub="Manage marketplace listings" />

      <div className="flex gap-2">
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="CLOSED">Closed</option>
        </select>
        <button onClick={load} className="bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : listings.length === 0 ? <Empty icon="📋" text="No listings found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['Seller', 'Type', 'Brand', 'Amount', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listings.map(l => (
                  <tr key={l.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{l.seller?.username || '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g500 }}>{l.listing_type || '—'}</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>{l.gift_card_brand || l.payment_method || '—'}</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>${fmt(l.amount_usd, 0)}</td>
                    <td className="px-4 py-3">
                      <Pill label={l.status} color={l.status === 'ACTIVE' ? '#166534' : '#92400E'} bg={l.status === 'ACTIVE' ? '#F0FDF4' : '#FFFBEB'} />
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(l.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button disabled={acting} onClick={() => toggle(l.id, l.status)}
                          className="px-2 py-1 rounded-lg text-xs font-bold transition"
                          style={{ backgroundColor: l.status === 'ACTIVE' ? '#FFFBEB' : '#F0FDF4', color: l.status === 'ACTIVE' ? '#92400E' : '#166534' }}>
                          {l.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                        </button>
                        <button onClick={() => del(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition" title="Delete">
                          <Trash2 size={13} style={{ color: C.danger }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.g100 }}>
            <span className="text-xs" style={{ color: C.g400 }}>{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total} className="p-1 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// BROADCAST SECTION
// ================================================================
function BroadcastSection() {
  const [title, setTitle]   = useState('');
  const [msg, setMsg]       = useState('');
  const [type, setType]     = useState('system');
  const [sending, setSend]  = useState(false);
  const [history, setHistory] = useState([]);

  const send = async () => {
    if (!title.trim() || !msg.trim()) return toast.error('Title and message required');
    if (!window.confirm(`Send this notification to ALL active users?`)) return;
    setSend(true);
    try {
      const r = await axios.post(`${API_URL}/admin/broadcast`, { title, message: msg, type }, { headers: authH() });
      toast.success(`Sent to ${r.data.sent} users ✅`);
      setHistory(h => [{ title, message: msg, type, sent: r.data.sent, time: new Date() }, ...h.slice(0, 9)]);
      setTitle(''); setMsg('');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to broadcast'); }
    finally { setSend(false); }
  };

  return (
    <div className="space-y-5">
      <SectionHead title="Broadcast Notifications" sub="Send system-wide notifications to all users" />

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: C.g200 }}>
          <h3 className="font-black text-sm mb-4" style={{ color: C.g800 }}>Compose Notification</h3>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
                <option value="system">📢 System Announcement</option>
                <option value="promo">🎁 Promotion</option>
                <option value="security">🔒 Security Alert</option>
                <option value="update">🚀 Platform Update</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100}
                className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.g200, color: C.g700 }}
                placeholder="Notification title…" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Message</label>
              <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} maxLength={500}
                className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" style={{ borderColor: C.g200, color: C.g700 }}
                placeholder="Write your message to all users…" />
              <p className="text-xs mt-1 text-right" style={{ color: C.g400 }}>{msg.length}/500</p>
            </div>
            <button onClick={send} disabled={sending || !title || !msg}
              className="w-full py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
              style={{ backgroundColor: sending || !title || !msg ? C.g200 : C.forest, color: sending || !title || !msg ? C.g400 : '#fff' }}>
              {sending ? <><RefreshCw size={14} className="animate-spin" /> Sending…</> : <><Megaphone size={14} /> Send to All Users</>}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: C.g200 }}>
          <h3 className="font-black text-sm mb-4" style={{ color: C.g800 }}>Recent Broadcasts</h3>
          {history.length === 0 ? (
            <Empty icon="📣" text="No broadcasts sent this session" />
          ) : (
            <div className="space-y-3">
              {history.map((h, i) => (
                <div key={i} className="p-3 rounded-xl" style={{ backgroundColor: C.g50, border:`1px solid ${C.g200}` }}>
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-xs font-black" style={{ color: C.g800 }}>{h.title}</p>
                    <span className="text-xs" style={{ color: C.g400 }}>{h.time.toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs" style={{ color: C.g600 }}>{h.message.slice(0, 80)}…</p>
                  <p className="text-xs mt-1 font-semibold" style={{ color: C.success }}>✅ Sent to {h.sent} users</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// SUGGESTIONS SECTION
// ================================================================
function SuggestionsSection() {
  const [suggestions, setSugs] = useState([]);
  const [total, setTotal]      = useState(0);
  const [loading, setLoading]  = useState(true);
  const [selected, setSelected]= useState(null);
  const [sort, setSort]        = useState('new');
  const [catFilter, setCat]    = useState('');
  const [statusFilter, setStat]= useState('');
  const [acting, setActing]    = useState(false);
  const [reply, setReply]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/suggestions`, {
        headers: authH(),
        params: { sort, category: catFilter, status: statusFilter, limit: 100 },
      });
      setSugs(r.data.suggestions || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load suggestions'); }
    finally { setLoading(false); }
  }, [sort, catFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const update = async (id, updates) => {
    setActing(true);
    try {
      const r = await axios.put(`${API_URL}/admin/suggestions/${id}`, updates, { headers: authH() });
      const updated = r.data.suggestion;
      setSugs(prev => prev.map(s => s.id === id ? updated : s));
      if (selected?.id === id) setSelected(updated);
      toast.success('Updated ✅');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this suggestion permanently?')) return;
    try {
      await axios.delete(`${API_URL}/admin/suggestions/${id}`, { headers: authH() });
      setSugs(prev => prev.filter(s => s.id !== id));
      if (selected?.id === id) setSelected(null);
      toast.success('Deleted');
    } catch { toast.error('Delete failed'); }
  };

  const openModal = (s) => { setSelected(s); setReply(s.admin_reply || ''); };
  const closeModal = () => { setSelected(null); setReply(''); };

  const submitReply = async () => {
    if (!reply.trim() || !selected) return;
    await update(selected.id, { admin_reply: reply.trim() });
  };

  const counts = {
    open:     suggestions.filter(s => s.status === 'open').length,
    pipeline: suggestions.filter(s => ['planned','building','reviewing'].includes(s.status)).length,
    done:     suggestions.filter(s => s.status === 'done').length,
  };

  return (
    <div className="space-y-5">
      <SectionHead title={`Community Suggestions (${total})`} sub="User ideas, feedback, and feature requests — click any row to read & reply"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Ideas',  value: total,           color: C.forest,   bg: '#F0FDF4' },
          { label: 'Open',         value: counts.open,     color: '#3B82F6',  bg: '#EFF6FF' },
          { label: 'In Pipeline',  value: counts.pipeline, color: '#6D28D9',  bg: '#F5F3FF' },
          { label: 'Shipped ✅',   value: counts.done,     color: '#166534',  bg: '#F0FDF4' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-bold mt-1" style={{ color: C.g600 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="new">🕐 Newest First</option>
          <option value="votes">🔥 Most Voted</option>
        </select>
        <select value={catFilter} onChange={e => setCat(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="">All Categories</option>
          {SUGGESTION_CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStat(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="">All Statuses</option>
          {Object.entries(SUGGESTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : suggestions.length === 0 ? <Empty icon="💡" text="No suggestions yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['Votes', 'Message', 'Category', 'Status', 'Author', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suggestions.map(s => {
                  const cat  = SUGGESTION_CATS.find(c => c.id === s.category) || SUGGESTION_CATS[4];
                  const stat = SUGGESTION_STATUS[s.status] || SUGGESTION_STATUS.open;
                  return (
                    <tr key={s.id} onClick={() => openModal(s)}
                      className="border-t hover:bg-green-50 cursor-pointer transition"
                      style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <ChevronUp size={13} style={{ color: C.forest }} />
                          <span className="font-black text-sm" style={{ color: C.forest }}>{s.upvotes || 0}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ maxWidth: 300 }}>
                        <p className="font-bold text-xs mb-0.5 leading-snug" style={{ color: C.g800 }}>
                          {s.is_pinned && <span className="mr-1">📌</span>}{s.title}
                        </p>
                        {s.body && (
                          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: C.g500 }}>
                            {s.body}
                          </p>
                        )}
                        {s.admin_reply && (
                          <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: '#F0FDF4', color: '#166534' }}>
                            <MessageSquare size={10} /> Replied
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: C.g100, color: C.g600 }}>
                          {cat.emoji} {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={stat.label} color={stat.color} bg={stat.bg} />
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g600 }}>{s.username || 'Anonymous'}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: C.g400 }}>{fmtDate(s.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={e => { e.stopPropagation(); openModal(s); }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:opacity-80 transition"
                            style={{ backgroundColor: '#EFF6FF', color: '#3B82F6' }}>
                            <Eye size={11} /> Open
                          </button>
                          <button onClick={e => { e.stopPropagation(); del(s.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition">
                            <Trash2 size={12} style={{ color: C.danger }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Full-screen detail modal ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={closeModal}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.g100 }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                  style={{ backgroundColor: '#F0FDF4' }}>
                  {(SUGGESTION_CATS.find(c => c.id === selected.category) || SUGGESTION_CATS[4]).emoji}
                </div>
                <div>
                  <p className="text-xs font-bold" style={{ color: C.g500 }}>Community Suggestion</p>
                  <p className="text-xs font-black" style={{ color: C.g800 }}>
                    {(SUGGESTION_CATS.find(c => c.id === selected.category) || SUGGESTION_CATS[4]).label}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 rounded-xl hover:bg-gray-100 transition">
                <X size={18} style={{ color: C.g500 }} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Meta row */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                  style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}>
                  <ChevronUp size={14} style={{ color: C.forest }} />
                  <span className="font-black text-sm" style={{ color: C.forest }}>{selected.upvotes || 0}</span>
                  <span className="text-xs font-semibold" style={{ color: C.mint }}>votes</span>
                </div>
                <Pill label={(SUGGESTION_STATUS[selected.status] || SUGGESTION_STATUS.open).label}
                  color={(SUGGESTION_STATUS[selected.status] || SUGGESTION_STATUS.open).color}
                  bg={(SUGGESTION_STATUS[selected.status] || SUGGESTION_STATUS.open).bg} />
                {selected.is_pinned && (
                  <span className="text-xs px-2 py-1 rounded-xl font-bold"
                    style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>📌 Pinned</span>
                )}
                <span className="ml-auto text-xs font-semibold" style={{ color: C.g400 }}>
                  {selected.username || 'Anonymous'} · {fmtDate(selected.created_at)}
                </span>
              </div>

              {/* Title */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Title</p>
                <p className="text-lg font-black leading-snug" style={{ color: C.g800 }}>
                  {selected.title}
                </p>
              </div>

              {/* Full message body */}
              {selected.body ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Full Message</p>
                  <div className="p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ backgroundColor: C.g50, color: C.g700, border: `1px solid ${C.g200}`, minHeight: 80 }}>
                    {selected.body}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl text-sm" style={{ backgroundColor: C.g50, color: C.g400, fontStyle: 'italic' }}>
                  No additional message — title only.
                </div>
              )}

              {/* Existing admin reply (read-only preview) */}
              {selected.admin_reply && (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Previous Reply</p>
                  <div className="p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534' }}>
                    {selected.admin_reply}
                  </div>
                </div>
              )}

              {/* Status update */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Update Status</p>
                <select value={selected.status || 'open'} disabled={acting}
                  onChange={e => update(selected.id, { status: e.target.value })}
                  className="w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none"
                  style={{ borderColor: C.g200, color: C.g700, backgroundColor: '#fff' }}>
                  <option value="open">🔵 Open</option>
                  <option value="reviewing">🟡 Under Review</option>
                  <option value="planned">🗺️ Planned</option>
                  <option value="building">🔨 Building Now</option>
                  <option value="done">✅ Done / Shipped</option>
                  <option value="rejected">❌ Not Planned</option>
                </select>
              </div>

              {/* Reply textarea — always visible */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>
                  {selected.admin_reply ? 'Edit Your Reply' : 'Reply to User'}
                </p>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  rows={4}
                  placeholder="Write a public reply — the user will be notified via their notification bell…"
                  className="w-full border rounded-2xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ borderColor: C.g200, color: C.g700, backgroundColor: '#fff', lineHeight: 1.6 }}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t flex items-center gap-3" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
              <button onClick={submitReply} disabled={acting || !reply.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
                style={{
                  backgroundColor: acting || !reply.trim() ? C.g200 : C.forest,
                  color: acting || !reply.trim() ? C.g400 : '#fff',
                  cursor: acting || !reply.trim() ? 'not-allowed' : 'pointer',
                }}>
                <Send size={14} />
                {acting ? 'Saving…' : selected.admin_reply ? 'Update Reply' : 'Send Reply'}
              </button>
              <button disabled={acting} onClick={() => update(selected.id, { is_pinned: !selected.is_pinned })}
                className="px-4 py-3 rounded-xl text-sm font-black transition hover:opacity-80"
                style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
                {selected.is_pinned ? '📌 Unpin' : '📌 Pin'}
              </button>
              <button onClick={() => del(selected.id)}
                className="px-4 py-3 rounded-xl text-sm font-black flex items-center gap-1.5 transition hover:opacity-80"
                style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// NEW USERS SECTION
// ================================================================
function NewUsersSection() {
  const [users, setUsers]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/users/new`, { headers: authH() });
      setUsers(r.data.users || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load new users'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <SectionHead title={`New Users (${total})`} sub="Users who joined in the last 7 days"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {/* Summary pills */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total New', value: total, color: C.forest, bg: '#F0FDF4' },
          { label: 'No Trades', value: users.filter(u => !u.total_trades).length, color: C.amber, bg: '#FFFBEB' },
          { label: 'Unverified', value: users.filter(u => !u.is_email_verified).length, color: C.danger, bg: '#FEF2F2' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-bold mt-1" style={{ color: C.g700 }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : users.length === 0 ? <Empty icon="🆕" text="No new users in the last 7 days" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['User', 'Country', 'Trades', 'Verified', 'Joined', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                          style={{ backgroundColor: !u.total_trades ? C.amber : C.forest }}>
                          {(u.username || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p>
                          <p className="text-xs truncate max-w-[120px]" style={{ color: C.g400 }}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g600 }}>{u.country || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-black" style={{ color: u.total_trades ? C.success : C.g400 }}>
                        {u.total_trades || 0}
                      </span>
                      {!u.total_trades && <span className="ml-1 text-xs" style={{ color: C.g400 }}>none</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <span title="Email" style={{ opacity: u.is_email_verified ? 1 : 0.25 }}>📧</span>
                        <span title="Phone" style={{ opacity: u.is_phone_verified ? 1 : 0.25 }}>📱</span>
                        <span title="KYC"   style={{ opacity: u.is_id_verified    ? 1 : 0.25 }}>🪪</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <Pill label={u.account_status || 'active'}
                        color={u.account_status === 'banned' ? '#991B1B' : '#166534'}
                        bg={u.account_status === 'banned' ? '#FEF2F2' : '#F0FDF4'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// REPORTS & ISSUES SECTION
// ================================================================
function ReportsSection() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('disputes');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/reports`, { headers: authH() });
      setData(r.data);
    } catch { toast.error('Failed to load reports'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <SectionHead title="Reports & Issues" sub="Trade disputes and user feedback"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id:'disputes', label:`Disputes (${data?.disputes?.length || 0})` },
          { id:'feedback', label:`Feedback (${data?.feedback?.length || 0})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-xl text-xs font-bold transition"
            style={{ backgroundColor: tab === t.id ? C.forest : C.g100, color: tab === t.id ? '#fff' : C.g600 }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spin /> : !data ? <Empty text="No report data" /> : tab === 'disputes' ? (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {data.disputes.length === 0 ? <Empty icon="⚖️" text="No active disputes" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['Trade', 'Buyer', 'Seller', 'Amount', 'Reason', 'Opened'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.disputes.map(d => (
                    <tr key={d.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: C.g600 }}>{(d.trade_ref || d.id || '').slice(0,8).toUpperCase()}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{d.buyer?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{d.seller?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>${fmt(d.amount_usd, 2)}</td>
                      <td className="px-4 py-3 text-xs max-w-[200px]" style={{ color: C.g600 }}>
                        {(d.dispute_reason || '—').slice(0, 60)}{(d.dispute_reason || '').length > 60 ? '…' : ''}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(d.disputed_at || d.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {data.feedback.length === 0 ? <Empty icon="💬" text="No feedback yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['Reviewer', 'Reviewed', 'Rating', 'Comment', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.feedback.map(f => (
                    <tr key={f.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{f.reviewer?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{f.reviewed?.username || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-black" style={{ color: f.rating >= 4 ? C.success : f.rating >= 3 ? C.amber : C.danger }}>
                          {'⭐'.repeat(Math.min(f.rating || 0, 5))} {f.rating}/5
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[220px]" style={{ color: C.g600 }}>
                        {(f.comment || '—').slice(0, 80)}{(f.comment || '').length > 80 ? '…' : ''}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(f.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// ACTIVITY LOG SECTION
// ================================================================
function ActivitySection() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/activity`, { headers: authH() });
      setActivity(r.data.activity || []);
    } catch { toast.error('Failed to load activity'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onlineThreshold = 5 * 60 * 1000; // 5 minutes
  const isOnline = (ts) => ts && (Date.now() - new Date(ts)) < onlineThreshold;

  return (
    <div className="space-y-4">
      <SectionHead title="Activity Log" sub="Recent user logins and session activity (last 100 active users)"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {/* Online now count */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Online Now',   value: activity.filter(u => isOnline(u.last_seen_at)).length, color: C.success, bg: '#F0FDF4' },
          { label: 'Active Today', value: activity.filter(u => u.last_seen_at && (Date.now() - new Date(u.last_seen_at)) < 86400000).length, color: C.forest, bg: '#F0FDF4' },
          { label: 'Active Week',  value: activity.filter(u => u.last_seen_at && (Date.now() - new Date(u.last_seen_at)) < 7*86400000).length, color: '#3B82F6', bg: '#EFF6FF' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-bold mt-1" style={{ color: C.g700 }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : activity.length === 0 ? <Empty icon="📊" text="No activity data yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['User', 'Status', 'Last Seen', 'Last Login', 'Trades', 'Country'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activity.map(u => {
                  const online = isOnline(u.last_seen_at);
                  return (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white"
                              style={{ backgroundColor: online ? C.success : C.forest }}>
                              {(u.username || '?')[0].toUpperCase()}
                            </div>
                            {online && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: C.success }} />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p>
                            <p className="text-xs truncate max-w-[120px]" style={{ color: C.g400 }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={online ? 'Online' : u.account_status || 'active'}
                          color={online ? '#166534' : u.account_status === 'banned' ? '#991B1B' : '#475569'}
                          bg={online ? '#F0FDF4' : u.account_status === 'banned' ? '#FEF2F2' : C.g100} />
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: online ? C.success : C.g500 }}>
                        {online ? '🟢 Now' : fmtAge(u.last_seen_at)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(u.last_login)}</td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g700 }}>{u.total_trades || 0}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g600 }}>{u.country || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// MAIN ADMIN DASHBOARD
// ================================================================
const NAV = [
  { id:'overview',     label:'Overview',      icon:LayoutDashboard },
  { id:'users',        label:'Users',         icon:Users           },
  { id:'newusers',     label:'New Users',     icon:UserPlus        },
  { id:'trades',       label:'Trades',        icon:ArrowLeftRight  },
  { id:'disputes',     label:'Disputes',      icon:AlertTriangle   },
  { id:'kyc',          label:'KYC Review',    icon:ShieldCheck     },
  { id:'finance',      label:'Finance',       icon:DollarSign      },
  { id:'listings',     label:'Listings',      icon:List            },
  { id:'suggestions',  label:'Suggestions',   icon:Lightbulb       },
  { id:'reports',      label:'Reports',       icon:MessageSquare   },
  { id:'activity',     label:'Activity Log',  icon:Activity        },
  { id:'broadcast',    label:'Broadcast',     icon:Megaphone       },
];

export default function AdminDashboard({ user: appUser, onLogin }) {
  const [adminUser, setAdminUser] = useState(null);
  const [section, setSection]     = useState('overview');
  const [sideOpen, setSideOpen]   = useState(true);

  // Check existing admin token on mount
  useEffect(() => {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
    const stored = localStorage.getItem('adminUser');
    if (token && stored) {
      try {
        const u = JSON.parse(stored);
        if (u?.email === ADMIN_EMAIL || u?.is_admin || u?.is_moderator) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          setAdminUser(u);
        }
      } catch {}
    }
    // If already logged in via main app as admin
    if (appUser && (appUser.email === ADMIN_EMAIL || appUser.is_admin || appUser.is_moderator)) {
      setAdminUser(appUser);
    }
  }, [appUser]);

  const handleAuth = (user, token) => {
    localStorage.setItem('adminUser', JSON.stringify(user));
    setAdminUser(user);
    if (onLogin) onLogin(user, token);
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setAdminUser(null);
  };

  if (!adminUser) return <AdminLogin onAuth={handleAuth} />;

  const CONTENT = {
    overview:    <Overview />,
    users:       <UsersSection />,
    newusers:    <NewUsersSection />,
    trades:      <TradesSection />,
    disputes:    <DisputesSection />,
    kyc:         <KycSection />,
    finance:     <FinanceSection />,
    listings:    <ListingsSection />,
    suggestions: <SuggestionsSection />,
    reports:     <ReportsSection />,
    activity:    <ActivitySection />,
    broadcast:   <BroadcastSection />,
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: C.g50 }}>

      {/* ── SIDEBAR ── */}
      <aside className={`${sideOpen ? 'w-56' : 'w-16'} flex-shrink-0 flex flex-col transition-all duration-200`}
        style={{ backgroundColor: C.forest, minHeight: '100vh' }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor:'rgba(255,255,255,0.1)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.gold }}>
            <span className="text-sm font-black" style={{ color: C.forest, fontFamily:'Georgia,serif' }}>P</span>
          </div>
          {sideOpen && <span className="text-white font-black text-sm tracking-wide" style={{ fontFamily:'Georgia,serif' }}>PRAQEN Admin</span>}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(n => {
            const Icon = n.icon;
            const active = section === n.id;
            return (
              <button key={n.id} onClick={() => setSection(n.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition"
                style={{
                  backgroundColor: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                  borderLeft: active ? `3px solid ${C.gold}` : '3px solid transparent',
                }}>
                <Icon size={16} className="flex-shrink-0" />
                {sideOpen && <span className="text-xs font-bold">{n.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-3" style={{ borderColor:'rgba(255,255,255,0.1)' }}>
          {sideOpen && (
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black" style={{ backgroundColor: C.gold, color: C.forest }}>
                {(adminUser.username || 'A')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-white truncate">{adminUser.username || 'Admin'}</p>
                <p className="text-xs" style={{ color:'rgba(255,255,255,0.4)' }}>Administrator</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setSideOpen(s => !s)} className="p-2 rounded-lg hover:bg-white/10 transition" title="Toggle sidebar">
              <Menu size={14} style={{ color:'rgba(255,255,255,0.6)' }} />
            </button>
            <button onClick={logout} className="p-2 rounded-lg hover:bg-white/10 transition" title="Sign out">
              <LogOut size={14} style={{ color:'rgba(255,255,255,0.6)' }} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-10" style={{ borderColor: C.g200 }}>
          <div>
            <h1 className="font-black text-base" style={{ color: C.g800 }}>
              {NAV.find(n => n.id === section)?.label || 'Admin'}
            </h1>
            <p className="text-xs" style={{ color: C.g400 }}>PRAQEN Platform Administration</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.success }} />
            <span className="text-xs font-semibold" style={{ color: C.g500 }}>{adminUser.email}</span>
          </div>
        </div>

        {/* Section content */}
        <div className="p-6">
          {CONTENT[section]}
        </div>
      </main>
    </div>
  );
}
