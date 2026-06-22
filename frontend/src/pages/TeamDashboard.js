import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  LayoutDashboard, Users, ArrowLeftRight, AlertTriangle,
  Shield, LogOut, RefreshCw, X, Eye, Search,
  CheckCircle, Clock, TrendingUp, Activity, MessageCircle,
  Send, ChevronLeft, ChevronRight, Lock, Star,
  Bell, Gavel, Menu, XCircle, Info, Zap,
  MessageSquare, Hash, Trophy, ThumbsUp, ThumbsDown,
  UserCheck, Phone, Filter, Award,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Team access is validated by the backend (is_moderator || is_admin flag)
const isTeamEmail = (email) => !!(email); // backend enforces — just ensure non-empty

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', amber: '#F59E0B',
  purple: '#7C3AED', purpleLight: '#EDE9FE', purpleDark: '#5B21B6',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', paid: '#3B82F6', warn: '#F59E0B',
};

const authH = () => {
  const t = localStorage.getItem('team_token') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmt = (n, d = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
const fmtBtc = (n) => parseFloat(n || 0).toFixed(6);
const fmtAge = (ts) => {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};
const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const statusColor = (s) => {
  const m = { COMPLETED: '#10B981', CANCELLED: '#6B7280', DISPUTED: '#8B5CF6', ACTIVE: '#3B82F6', PAID: '#3B82F6', PAYMENT_SENT: '#3B82F6', ESCROW: '#F59E0B', CREATED: '#F59E0B', FUNDS_LOCKED: '#F59E0B', OPEN: '#2D6A4F' };
  return m[s] || '#94A3B8';
};
const badgeColor = (b) => {
  const m = { DIAMOND: { c: '#06B6D4', bg: '#ECFEFF' }, GOLD: { c: '#D97706', bg: '#FFFBEB' }, SILVER: { c: '#6B7280', bg: '#F9FAFB' }, BRONZE: { c: '#92400E', bg: '#FEF3C7' }, BEGINNER: { c: '#6B7280', bg: '#F3F4F6' } };
  return m[b] || m.BEGINNER;
};

function Spin() {
  return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${C.forest}20`, borderTopColor: C.forest }} /></div>;
}
function Empty({ icon = '📭', text = 'No data found' }) {
  return <div className="flex flex-col items-center py-12 gap-2"><span className="text-4xl">{icon}</span><p className="text-sm font-semibold" style={{ color: C.g500 }}>{text}</p></div>;
}
function Pill({ label, color = '#10B981', bg = '#F0FDF4' }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black" style={{ color, backgroundColor: bg }}>{label}</span>;
}
function StatCard({ icon, label, value, sub, color = C.forest, bg = '#F0FDF4', pulse }) {
  return (
    <div className="bg-white rounded-2xl border p-4 flex items-center gap-4" style={{ borderColor: C.g200 }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 relative" style={{ backgroundColor: bg }}>
        <span style={{ color }}>{icon}</span>
        {pulse && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.g400 }}>{label}</p>
        <p className="text-xl font-black truncate" style={{ color: C.g800 }}>{value}</p>
        {sub && <p className="text-xs" style={{ color: C.g400 }}>{sub}</p>}
      </div>
    </div>
  );
}
function Stars({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={11} className={i <= Math.round(rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 fill-gray-200'} />
      ))}
    </div>
  );
}

// ================================================================
// LOGIN  (multi-step: email → password  OR  first-time setup)
// ================================================================
function TeamLogin({ onAuth }) {
  // step: 'email' | 'login' | 'otp' | 'setup'
  const [step, setStep]         = useState('email');
  const [email, setEmail]       = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [otpCode, setOtpCode]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  // Step 1: check if email can access team portal
  const checkEmail = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/team/check-email`, { email });
      const { status, error: msg } = r.data;
      if (status === 'has_account') { setStep('login'); }
      else if (status === 'needs_setup') { setStep('setup'); }
      else { setErr(msg || 'Access denied.'); }
    } catch (ex) { setErr(ex.response?.data?.error || 'Could not verify email. Try again.'); }
    setLoading(false);
  };

  // Step 2a: existing account — submit password, triggers OTP email
  const submitLogin = async () => {
    setErr(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/auth/login`, { email, password });
      if (r.data.requiresOtp) {
        setOtpCode('');
        setStep('otp');
      } else if (r.data.token) {
        const { token, user } = r.data;
        if (!user?.is_moderator && !user?.is_admin) throw new Error('Access denied. Team privileges required.');
        localStorage.setItem('team_token', token);
        localStorage.setItem('team_user', JSON.stringify(user));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        onAuth(user);
      } else {
        throw new Error('Unexpected login response. Try again.');
      }
    } catch (ex) { setErr(ex.response?.data?.error || ex.message || 'Login failed'); }
    setLoading(false);
  };
  const doLogin = (e) => { e.preventDefault(); submitLogin(); };

  // Step 2a-otp: verify OTP code sent to email
  const verifyOtp = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/auth/verify-login-otp`, { email, code: otpCode.trim() });
      const { token, user } = r.data;
      if (!token) throw new Error('Verification failed. Try again.');
      if (!user?.is_moderator && !user?.is_admin) throw new Error('Access denied. Team privileges required.');
      localStorage.setItem('team_token', token);
      localStorage.setItem('team_user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onAuth(user);
    } catch (ex) { setErr(ex.response?.data?.error || ex.message || 'Verification failed'); }
    setLoading(false);
  };

  // Step 2b: new team member — set name + password
  const doSetup = async (e) => {
    e.preventDefault(); setErr('');
    if (password !== confirm) { setErr('Passwords do not match'); return; }
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    if (!fullName.trim()) { setErr('Please enter your full name'); return; }
    setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/team/setup-account`, { email, full_name: fullName.trim(), password });
      const { token, user } = r.data;
      if (!token) throw new Error('Setup failed — no token returned');
      localStorage.setItem('team_token', token);
      localStorage.setItem('team_user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onAuth(user);
    } catch (ex) { setErr(ex.response?.data?.error || ex.message || 'Setup failed. Try again.'); }
    setLoading(false);
  };

  const bg = `linear-gradient(145deg,${C.forest} 0%,#0c2418 50%,${C.green} 100%)`;

  const Header = () => (
    <div className="text-center mb-8">
      <div className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: C.gold }}>
        <span className="text-3xl font-black" style={{ color: C.forest, fontFamily: 'Georgia,serif' }}>P</span>
      </div>
      <h1 className="text-white text-2xl font-black" style={{ fontFamily: 'Georgia,serif' }}>PRAQEN</h1>
      <p className="text-white/50 text-sm mt-1 font-semibold tracking-widest uppercase">Team Portal</p>
    </div>
  );

  const ErrBox = () => err ? (
    <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl text-sm"
      style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
      <XCircle size={14} className="flex-shrink-0" /> {err}
    </div>
  ) : null;

  if (step === 'email') return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: bg }}>
      <div className="w-full max-w-sm">
        <Header />
        <form onSubmit={checkEmail} className="bg-white rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.purpleLight }}>
              <Shield size={20} style={{ color: C.purple }} />
            </div>
            <div>
              <h2 className="text-lg font-black" style={{ color: C.g800 }}>Team Access</h2>
              <p className="text-xs" style={{ color: C.g400 }}>Enter your work email to continue</p>
            </div>
          </div>
          <ErrBox />
          <div>
            <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Work Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required autoFocus
              className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
              style={{ borderColor: C.g200, color: C.g800 }} placeholder="yourname@praqen.com" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full mt-5 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.purple, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Checking…</> : <>Continue →</>}
          </button>
        </form>
        <p className="text-center mt-6 text-white/30 text-xs">Restricted Access • All actions are logged</p>
      </div>
    </div>
  );

  if (step === 'login') return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: bg }}>
      <div className="w-full max-w-sm">
        <Header />
        <form onSubmit={doLogin} className="bg-white rounded-3xl p-8 shadow-2xl">
          <button type="button" onClick={() => { setStep('email'); setErr(''); }}
            className="flex items-center gap-1.5 text-xs font-bold mb-5" style={{ color: C.g400 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.purpleLight }}>
              <Lock size={20} style={{ color: C.purple }} />
            </div>
            <div>
              <h2 className="text-lg font-black" style={{ color: C.g800 }}>Welcome back</h2>
              <p className="text-xs truncate max-w-xs" style={{ color: C.g400 }}>{email}</p>
            </div>
          </div>
          <ErrBox />
          <div>
            <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Your Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required autoFocus
              className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
              style={{ borderColor: C.g200, color: C.g800 }} placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full mt-5 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.purple, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Signing in…</> : <><Lock size={14} /> Sign In</>}
          </button>
        </form>
        <p className="text-center mt-6 text-white/30 text-xs">Restricted Access • All actions are logged</p>
      </div>
    </div>
  );

  if (step === 'otp') return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: bg }}>
      <div className="w-full max-w-sm">
        <Header />
        <form onSubmit={verifyOtp} className="bg-white rounded-3xl p-8 shadow-2xl">
          <button type="button" onClick={() => { setStep('login'); setErr(''); }}
            className="flex items-center gap-1.5 text-xs font-bold mb-5" style={{ color: C.g400 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.purpleLight }}>
              <Shield size={20} style={{ color: C.purple }} />
            </div>
            <div>
              <h2 className="text-lg font-black" style={{ color: C.g800 }}>Check your email</h2>
              <p className="text-xs" style={{ color: C.g400 }}>6-digit code sent to {email}</p>
            </div>
          </div>
          <ErrBox />
          <div>
            <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Verification Code</label>
            <input value={otpCode} onChange={e => setOtpCode(e.target.value)} type="text" required autoFocus
              maxLength={6} inputMode="numeric" pattern="[0-9]{6}"
              className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none tracking-widest text-center"
              style={{ borderColor: C.g200, color: C.g800, fontSize: '1.25rem', letterSpacing: '0.5em' }}
              placeholder="000000" />
          </div>
          <button type="submit" disabled={loading || otpCode.length < 6}
            className="w-full mt-5 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.purple, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Verifying…</> : <><Shield size={14} /> Verify & Sign In</>}
          </button>
          <button type="button" onClick={submitLogin} disabled={loading}
            className="w-full mt-2 py-2.5 rounded-xl text-xs font-semibold transition"
            style={{ color: C.g400 }}>
            Didn't receive it? Resend code
          </button>
        </form>
        <p className="text-center mt-6 text-white/30 text-xs">Restricted Access • All actions are logged</p>
      </div>
    </div>
  );

  // step === 'setup'
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: bg }}>
      <div className="w-full max-w-sm">
        <Header />
        <form onSubmit={doSetup} className="bg-white rounded-3xl p-8 shadow-2xl">
          <button type="button" onClick={() => { setStep('email'); setErr(''); }}
            className="flex items-center gap-1.5 text-xs font-bold mb-5" style={{ color: C.g400 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F0FDF4' }}>
              <UserCheck size={20} style={{ color: C.forest }} />
            </div>
            <div>
              <h2 className="text-lg font-black" style={{ color: C.g800 }}>Create your account</h2>
              <p className="text-xs" style={{ color: C.g400 }}>First time? Set your name and password</p>
            </div>
          </div>
          <p className="text-xs mb-5 px-1" style={{ color: C.g500 }}>
            Signing up as <span className="font-bold" style={{ color: C.g700 }}>{email}</span>
          </p>
          <ErrBox />
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Your Full Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} type="text" required autoFocus
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
                style={{ borderColor: C.g200, color: C.g800 }} placeholder="e.g. Kwame Mensah" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Create Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
                style={{ borderColor: C.g200, color: C.g800 }} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Confirm Password</label>
              <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" required
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
                style={{ borderColor: confirm && confirm !== password ? C.danger : C.g200, color: C.g800 }} placeholder="Re-enter password" />
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full mt-5 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Creating…</> : <><UserCheck size={14} /> Create My Account</>}
          </button>
        </form>
        <p className="text-center mt-6 text-white/30 text-xs">Your password is encrypted and stored securely</p>
      </div>
    </div>
  );
}

// ================================================================
// OVERVIEW
// ================================================================
function OverviewSection({ teamUser }) {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, t, d] = await Promise.allSettled([
      axios.get(`${API_URL}/admin/stats`, { headers: authH() }),
      axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params: { limit: 6, page: 1 } }),
      axios.get(`${API_URL}/admin/disputes`, { headers: authH() }),
    ]);
    if (s.status === 'fulfilled') setStats(s.value.data);
    if (t.status === 'fulfilled') setRecent(t.value.data.trades?.slice(0, 6) || []);
    if (d.status === 'fulfilled') setDisputes((d.value.data.disputes || []).filter(x => ['OPEN','DISPUTED','IN_REVIEW'].includes(x.status)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  if (loading) return <Spin />;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg,${C.forest},${C.green})` }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
          {(teamUser?.username || 'T')[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Welcome back</p>
          <p className="text-white text-xl font-black">{teamUser?.username}</p>
          <p className="text-white/50 text-xs">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Online
        </span>
      </div>

      {disputes.length > 0 && (
        <div className="rounded-xl p-4 border-2 flex items-center gap-3" style={{ backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }}>
          <AlertTriangle size={20} style={{ color: C.danger, flexShrink: 0 }} />
          <div className="flex-1">
            <p className="font-black text-sm" style={{ color: '#991B1B' }}>{disputes.length} open dispute{disputes.length > 1 ? 's' : ''} need attention</p>
            <p className="text-xs mt-0.5" style={{ color: '#B91C1C' }}>Go to Disputes section to review and resolve</p>
          </div>
          <span className="text-2xl font-black" style={{ color: C.danger }}>{disputes.length}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users size={22} />} label="Total Users" value={fmt(stats?.totalUsers)} sub={`+${stats?.newUsersToday || 0} today`} />
        <StatCard icon={<ArrowLeftRight size={22} />} label="Active Trades" value={fmt(stats?.activeTrades)} sub="right now" color="#3B82F6" bg="#EFF6FF" />
        <StatCard icon={<AlertTriangle size={22} />} label="Open Disputes" value={fmt(stats?.openDisputes)} sub="need action" color={C.danger} bg="#FEF2F2" pulse={stats?.openDisputes > 0} />
        <StatCard icon={<TrendingUp size={22} />} label="Volume (USD)" value={`$${fmt(stats?.totalVolumeUsd, 0)}`} sub={`${fmtBtc(stats?.totalVolumeBtc)} BTC`} color={C.purple} bg="#F5F3FF" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<CheckCircle size={22} />} label="Completed" value={fmt(stats?.completedTrades)} color={C.success} bg="#F0FDF4" />
        <StatCard icon={<Shield size={22} />} label="KYC Pending" value={fmt(stats?.pendingKyc)} color={C.warn} bg="#FFFBEB" />
        <StatCard icon={<Activity size={22} />} label="Total Trades" value={fmt(stats?.totalTrades)} color={C.green} bg="#F0FDF4" />
        <StatCard icon={<UserCheck size={22} />} label="New This Week" value={fmt(stats?.newUsersWeek)} color={C.gold} bg="#FFFBEB" />
      </div>

      {stats?.tradeDays && (
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: C.g200 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-sm" style={{ color: C.g700 }}>Trades — Last 7 Days</h3>
            <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
              <RefreshCw size={13} style={{ color: C.g500 }} />
            </button>
          </div>
          <div className="flex items-end gap-2 h-28">
            {stats.tradeDays.map((d, i) => {
              const max = Math.max(...stats.tradeDays.map(x => x.count), 1);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold" style={{ color: C.g500 }}>{d.count}</span>
                  <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max((d.count / max) * 88, 4)}px`, backgroundColor: d.count > 0 ? C.forest : C.g200 }} />
                  <span className="text-xs font-semibold" style={{ color: C.g400 }}>{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.g100 }}>
          <h3 className="font-black text-sm" style={{ color: C.g800 }}>Recent Trades</h3>
          <Pill label="Live" color={C.success} bg="#F0FDF4" />
        </div>
        {recent.length === 0 ? <Empty icon="🔄" text="No trades yet" /> : (
          <div className="divide-y" style={{ borderColor: C.g100 }}>
            {recent.map(t => (
              <div key={t.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                  style={{ backgroundColor: C.green }}>{(t.buyer?.username || '?')[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black truncate" style={{ color: C.g800 }}>
                    {t.buyer?.username || '—'} → {t.seller?.username || '—'}
                  </p>
                  <p className="text-xs" style={{ color: C.g400 }}>{fmtAge(t.created_at)} · {t.payment_method || '—'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-black" style={{ color: C.g800 }}>${fmt(t.amount_usd, 2)}</p>
                  <Pill label={t.status} color={statusColor(t.status)} bg={`${statusColor(t.status)}15`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// SUPPORT CHAT — join any live trade as support
// ================================================================
function SupportChatSection({ teamUser }) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [joined, setJoined] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const chatEnd = useRef(null);

  const STATUS_MAP = { active: ['FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED'], all: [] };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 50, page: 1 };
      const r = await axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params });
      let list = r.data.trades || [];
      if (statusFilter === 'active') list = list.filter(t => ['FUNDS_LOCKED','PAYMENT_SENT','DISPUTED','ACTIVE'].includes(t.status));
      if (searchQ.trim()) {
        const q = searchQ.trim().toLowerCase();
        list = list.filter(t =>
          t.id?.toLowerCase().includes(q) ||
          t.trade_ref?.toLowerCase().includes(q) ||
          t.buyer?.username?.toLowerCase().includes(q) ||
          t.seller?.username?.toLowerCase().includes(q)
        );
      }
      setTrades(list);
    } catch { toast.error('Failed to load trades'); }
    setLoading(false);
  }, [statusFilter, searchQ]);

  useEffect(() => { load(); }, [load]);

  const loadChat = useCallback(async (tradeId) => {
    if (!tradeId) return;
    try {
      const r = await axios.get(`${API_URL}/messages/${tradeId}`, { headers: authH() });
      setMessages(r.data.messages || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadChat(selected.id);
    const iv = setInterval(() => loadChat(selected.id), 4000);
    return () => clearInterval(iv);
  }, [selected, loadChat]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openTrade = (t) => { setSelected(t); setJoined(false); setMessages([]); };

  const joinAsSupport = async () => {
    try { await axios.post(`${API_URL}/trades/${selected.id}/moderator-join`, {}, { headers: authH() }); } catch {}
    setJoined(true);
    toast.success('Joined as PRAQEN Support');
    loadChat(selected.id);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMsg.trim() || !joined) return;
    setSending(true);
    try {
      await axios.post(`${API_URL}/messages`, { tradeId: selected.id, message: newMsg.trim() }, { headers: authH() });
      setNewMsg('');
      loadChat(selected.id);
    } catch { toast.error('Failed to send'); }
    setSending(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Support Chat</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Join any live trade as PRAQEN Support and help users in real time</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      {/* How it works banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
        <MessageSquare size={16} style={{ color: C.paid, flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs font-semibold" style={{ color: '#1E40AF' }}>
          Select any active trade below → click <strong>Join as Support</strong> → your messages will appear with a PRAQEN Support badge visible to both the buyer and seller.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2 flex-1 min-w-[200px]" style={{ borderColor: C.g200 }}>
          <Search size={13} style={{ color: C.g400 }} />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search by trade ID, buyer or seller name…"
            className="flex-1 text-sm outline-none" style={{ color: C.g700 }} />
          {searchQ && <button onClick={() => setSearchQ('')}><X size={13} style={{ color: C.g400 }} /></button>}
        </div>
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
          {[{ v: 'active', l: 'Active' }, { v: 'all', l: 'All' }].map(o => (
            <button key={o.v} onClick={() => setStatusFilter(o.v)}
              className="px-4 py-2 text-xs font-bold transition"
              style={{ backgroundColor: statusFilter === o.v ? C.forest : 'white', color: statusFilter === o.v ? 'white' : C.g600 }}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4" style={{ minHeight: 500 }}>
        {/* Trade list */}
        <div className="w-80 flex-shrink-0 space-y-2 overflow-y-auto" style={{ maxHeight: 600 }}>
          {loading ? <Spin /> : trades.length === 0 ? <Empty icon="💬" text="No trades found" /> :
            trades.map(t => (
              <div key={t.id}
                onClick={() => openTrade(t)}
                className="bg-white rounded-xl border-2 p-3 cursor-pointer hover:shadow-md transition"
                style={{ borderColor: selected?.id === t.id ? C.forest : C.g200 }}>
                <div className="flex items-center gap-2 mb-2">
                  <Pill label={t.status} color={statusColor(t.status)} bg={`${statusColor(t.status)}15`} />
                  <span className="text-xs font-mono ml-auto" style={{ color: C.g400 }}>#{(t.id || '').slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-green-700 flex items-center justify-center text-xs font-black text-white">
                    {(t.buyer?.username || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>{t.buyer?.username || '—'}</span>
                  <span className="text-xs" style={{ color: C.g400 }}>→</span>
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-black text-white">
                    {(t.seller?.username || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>{t.seller?.username || '—'}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-black" style={{ color: C.g800 }}>${fmt(t.amount_usd, 2)}</span>
                  <span className="text-xs" style={{ color: C.g400 }}>{fmtAge(t.created_at)}</span>
                </div>
                {t.status === 'DISPUTED' && (
                  <div className="mt-2 flex items-center gap-1 text-xs font-bold" style={{ color: C.danger }}>
                    <AlertTriangle size={11} /> Disputed — needs attention
                  </div>
                )}
              </div>
            ))
          }
        </div>

        {/* Chat panel */}
        {selected ? (
          <div className="flex-1 bg-white rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: C.g200, maxHeight: 600 }}>
            {/* Chat header */}
            <div className="px-5 py-4 border-b flex items-center gap-3 flex-shrink-0" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
              <div>
                <p className="font-black text-sm" style={{ color: C.g800 }}>
                  {selected.buyer?.username} ↔ {selected.seller?.username}
                </p>
                <p className="text-xs" style={{ color: C.g500 }}>
                  ${fmt(selected.amount_usd, 2)} · {selected.payment_method || '—'} · #{selected.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Pill label={selected.status} color={statusColor(selected.status)} bg={`${statusColor(selected.status)}15`} />
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-200">
                  <X size={14} style={{ color: C.g500 }} />
                </button>
              </div>
            </div>

            {/* Join banner */}
            {!joined && (
              <div className="px-5 py-3 flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: '#faf5ff', borderBottom: `1px solid #c4b5fd` }}>
                <Shield size={14} style={{ color: C.purple }} />
                <p className="text-xs font-bold flex-1" style={{ color: C.purpleDark }}>
                  You are viewing this chat. Join to reply as PRAQEN Support.
                </p>
                <button onClick={joinAsSupport}
                  className="px-3 py-1.5 rounded-lg text-xs font-black text-white"
                  style={{ backgroundColor: C.purple }}>
                  Join as Support
                </button>
              </div>
            )}
            {joined && (
              <div className="px-5 py-2 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: '#faf5ff', borderBottom: `1px solid #c4b5fd` }}>
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                <p className="text-xs font-bold" style={{ color: C.purpleDark }}>
                  You are live in this chat as <strong>PRAQEN Support · {teamUser?.username}</strong>
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ backgroundColor: '#f9fafb' }}>
              {messages.length === 0
                ? <div className="flex flex-col items-center justify-center h-full">
                    <MessageCircle size={36} className="mb-2 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-400">No messages yet in this trade</p>
                  </div>
                : messages.map((m, i) => {
                  const isMod = m.sender_role === 'moderator' || (m.message_text || m.message || '').startsWith('[MODERATOR]');
                  const isSys = !m.sender_id || m.message_type === 'SYSTEM' || m.sender_role === 'system';
                  const text = (m.message_text || m.message || '').replace(/^\[MODERATOR\]\s*/, '');
                  const isBuyer = m.sender_id === selected.buyer_id || m.sender_id === selected.buyer?.id;
                  const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  if (isSys) return (
                    <div key={i} className="flex justify-center">
                      <span className="bg-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs">{text}</span>
                    </div>
                  );
                  if (isMod) return (
                    <div key={i} className="flex justify-center">
                      <div className="w-full max-w-[90%] rounded-xl overflow-hidden border-2" style={{ borderColor: C.purple }}>
                        <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: `linear-gradient(90deg,${C.purpleDark},${C.purple})` }}>
                          <Shield size={11} className="text-white" />
                          <span className="text-xs font-black text-white">PRAQEN Support</span>
                          <span className="ml-auto text-xs text-white/50">{timeStr}</span>
                        </div>
                        <div className="px-3 py-2" style={{ backgroundColor: '#faf5ff' }}>
                          <p className="text-xs text-purple-900 font-medium">{text}</p>
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <div key={i} className={`flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
                      <div className="max-w-[70%] rounded-xl border overflow-hidden"
                        style={{ backgroundColor: isBuyer ? 'white' : '#f0fdf4', borderColor: isBuyer ? C.g200 : '#86efac' }}>
                        <div className="px-3 py-1 flex items-center gap-1.5" style={{ backgroundColor: isBuyer ? '#f9fafb' : '#dcfce7' }}>
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ backgroundColor: isBuyer ? C.green : C.paid }}>
                            {(isBuyer ? selected.buyer?.username : selected.seller?.username || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-xs font-black" style={{ color: isBuyer ? C.green : C.paid }}>
                            {isBuyer ? selected.buyer?.username : selected.seller?.username}
                          </span>
                          <span className="ml-auto text-xs" style={{ color: C.g400 }}>{timeStr}</span>
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-xs text-slate-800 break-words">{text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
              <div ref={chatEnd} />
            </div>

            {/* Send message */}
            <form onSubmit={sendMessage} className="flex gap-2 p-4 border-t flex-shrink-0" style={{ borderColor: C.g100 }}>
              <div className="flex-1 relative">
                <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  disabled={!joined}
                  placeholder={joined ? 'Type support message — visible to both parties…' : 'Join the chat first to reply'}
                  className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-xs font-medium outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  style={{ borderColor: newMsg ? C.purple : C.g200 }} />
                <Shield size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: joined ? C.purple : C.g400 }} />
              </div>
              <button type="submit" disabled={sending || !newMsg.trim() || !joined}
                className="px-4 py-2.5 rounded-xl text-white font-black text-xs flex items-center gap-1.5 disabled:opacity-40"
                style={{ backgroundColor: C.purple }}>
                {sending ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />} Send
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-2xl border flex items-center justify-center" style={{ borderColor: C.g200 }}>
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="font-black" style={{ color: C.g600 }}>Select a trade to open the chat</p>
              <p className="text-xs mt-1" style={{ color: C.g400 }}>Choose any active trade from the left panel</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// TRADE LOOKUP — search by trade ID
// ================================================================
function TradeLookupSection() {
  const [tradeId, setTradeId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [trades, setTrades] = useState([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params: { status: filter, page, limit: LIMIT } });
      setTrades(r.data.trades || []); setTotal(r.data.total || 0);
    } catch {}
    setListLoading(false);
  }, [filter, page]);

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { loadList(); }, [loadList]);

  const lookup = async (e) => {
    e.preventDefault();
    if (!tradeId.trim()) return;
    setErr(''); setResult(null); setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params: { limit: 100, page: 1 } });
      const all = r.data.trades || [];
      const q = tradeId.trim().toLowerCase();
      const found = all.find(t =>
        t.id?.toLowerCase() === q ||
        t.id?.toLowerCase().startsWith(q) ||
        t.trade_ref?.toLowerCase() === q ||
        t.trade_ref?.toLowerCase().startsWith(q)
      );
      if (found) setResult(found);
      else setErr(`No trade found for "${tradeId.trim()}"`);
    } catch { setErr('Failed to search. Try again.'); }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.g800 }}>Trade Lookup</h2>
        <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Search by trade ID to see full trade details and diagnose user issues</p>
      </div>

      {/* Search box */}
      <form onSubmit={lookup} className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white border-2 rounded-xl px-4 py-3" style={{ borderColor: tradeId ? C.forest : C.g200 }}>
          <Hash size={16} style={{ color: C.g400 }} />
          <input value={tradeId} onChange={e => { setTradeId(e.target.value); setErr(''); setResult(null); }}
            placeholder="Paste full or partial trade ID…"
            className="flex-1 text-sm font-semibold outline-none" style={{ color: C.g800 }} />
          {tradeId && <button type="button" onClick={() => { setTradeId(''); setResult(null); setErr(''); }}><X size={13} style={{ color: C.g400 }} /></button>}
        </div>
        <button type="submit" disabled={loading || !tradeId.trim()}
          className="px-5 py-3 rounded-xl text-sm font-black text-white flex items-center gap-2 disabled:opacity-40"
          style={{ backgroundColor: C.forest }}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />} Look Up
        </button>
      </form>

      {err && (
        <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
          <XCircle size={14} style={{ color: C.danger }} />
          <p className="text-sm font-bold" style={{ color: '#991B1B' }}>{err}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-white rounded-2xl border-2 overflow-hidden" style={{ borderColor: C.forest }}>
          <div className="px-5 py-4 flex items-center gap-3" style={{ backgroundColor: '#F0FDF4' }}>
            <CheckCircle size={20} style={{ color: C.forest }} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider" style={{ color: C.forest }}>Trade Found</p>
              <p className="font-black" style={{ color: C.g800 }}>#{result.id.slice(0, 14).toUpperCase()}</p>
            </div>
            <div className="ml-auto">
              <Pill label={result.status} color={statusColor(result.status)} bg={`${statusColor(result.status)}15`} />
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Buyer', value: result.buyer?.username || '—', color: C.green },
              { label: 'Seller', value: result.seller?.username || '—', color: C.paid },
              { label: 'USD Amount', value: `$${fmt(result.amount_usd, 2)}`, color: C.gold },
              { label: 'BTC Amount', value: `${fmtBtc(result.amount_btc)} BTC`, color: C.g700 },
              { label: 'Payment Method', value: result.payment_method || '—', color: C.g700 },
              { label: 'Status', value: result.status, color: statusColor(result.status) },
              { label: 'Buyer Confirmed', value: result.buyer_confirmed ? '✅ Yes' : '⏳ No', color: C.g700 },
              { label: 'Created', value: fmtDate(result.created_at), color: C.g700 },
              { label: 'Last Updated', value: fmtAge(result.updated_at), color: C.g500 },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 rounded-xl border" style={{ backgroundColor: C.g50, borderColor: C.g200 }}>
                <p className="text-xs font-semibold mb-1" style={{ color: C.g400 }}>{label}</p>
                <p className="text-sm font-black" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
          {result.dispute_reason && (
            <div className="mx-5 mb-5 p-3 rounded-xl border" style={{ backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }}>
              <p className="text-xs font-black text-red-700 mb-1">Dispute Reason</p>
              <p className="text-sm text-red-800 font-semibold">{result.dispute_reason}</p>
            </div>
          )}
        </div>
      )}

      {/* All trades table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="font-black text-sm" style={{ color: C.g700 }}>All Trades ({fmt(total)})</p>
          <div className="flex gap-2">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="bg-white border rounded-xl px-3 py-1.5 text-xs font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
              {['', 'CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED', 'COMPLETED', 'CANCELLED'].map(s => (
                <option key={s} value={s}>{s || 'All statuses'}</option>
              ))}
            </select>
            <button onClick={loadList} className="p-1.5 rounded-xl border" style={{ borderColor: C.g200 }}>
              <RefreshCw size={13} style={{ color: C.g500 }} />
            </button>
          </div>
        </div>
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {listLoading ? <Spin /> : trades.length === 0 ? <Empty icon="🔄" text="No trades" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['Trade ID', 'Buyer', 'Seller', 'Amount', 'Payment', 'Status', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id}
                      className="border-t hover:bg-gray-50 cursor-pointer transition"
                      style={{ borderColor: C.g100 }}
                      onClick={() => { setTradeId(t.id); setResult(t); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: C.g600 }}>#{t.id.slice(0, 10).toUpperCase()}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{t.buyer?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{t.seller?.username || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-black" style={{ color: C.g800 }}>${fmt(t.amount_usd, 2)}</p>
                        <p className="text-xs" style={{ color: C.g400 }}>{fmtBtc(t.amount_btc)} BTC</p>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g500 }}>{t.payment_method || '—'}</td>
                      <td className="px-4 py-3"><Pill label={t.status} color={statusColor(t.status)} bg={`${statusColor(t.status)}15`} /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(t.created_at)}</td>
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
      </div>
    </div>
  );
}

// ================================================================
// DISPUTES / SUPPORT QUEUE
// ================================================================
function DisputesSection({ teamUser }) {
  const [disputes, setDisputes] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [joined, setJoined] = useState(false);
  const [notes, setNotes] = useState('');
  const [resolution, setResolution] = useState('BUYER_WINS');
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState('open');
  const [detailTab, setDetailTab] = useState('details');
  const chatEnd = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/disputes`, { headers: authH() });
      const all = r.data.disputes || [];
      setDisputes(all.filter(d => ['OPEN','DISPUTED','IN_REVIEW'].includes(d.status)));
      setResolved(all.filter(d => ['COMPLETED','CANCELLED'].includes(d.status) && (d.dispute_reason || d.reason || d.dispute_resolution)));
    } catch { toast.error('Failed to load disputes'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadChat = useCallback(async (id) => {
    if (!id) return;
    try { const r = await axios.get(`${API_URL}/messages/${id}`, { headers: authH() }); setMessages(r.data.messages || []); } catch {}
  }, []);

  useEffect(() => {
    if (!active) return;
    loadChat(active.trade_id);
    const iv = setInterval(() => loadChat(active.trade_id), 5000);
    return () => clearInterval(iv);
  }, [active, loadChat]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openDispute = (d) => { setActive(d); setJoined(false); setNotes(''); setDetailTab('details'); setMessages([]); };

  const joinChat = async () => {
    try { await axios.post(`${API_URL}/trades/${active.trade_id}/moderator-join`, {}, { headers: authH() }); } catch {}
    setJoined(true); toast.success('Joined dispute chat'); loadChat(active.trade_id);
  };

  const sendMessage = async (e) => {
    e.preventDefault(); if (!newMsg.trim()) return; setSending(true);
    try {
      await axios.post(`${API_URL}/messages`, { tradeId: active.trade_id, message: newMsg.trim() }, { headers: authH() });
      setNewMsg(''); loadChat(active.trade_id);
    } catch { toast.error('Send failed'); }
    setSending(false);
  };

  const resolve = async () => {
    if (!notes.trim()) { toast.error('Write decision notes first.'); return; }
    if (!window.confirm(`Confirm: ${resolution}? This ruling is FINAL.`)) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/admin/disputes/${active.id}/resolve`, {
        resolution, notes: `${notes}\n\n— ${teamUser?.username} on ${new Date().toLocaleString()}`,
      }, { headers: authH() });
      toast.success('Ruling sealed'); setActive(null); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    setSubmitting(false);
  };

  const fmtB = n => parseFloat(n || 0).toFixed(8);
  const fmtU = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Disputes</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Review disputes, chat with users, and issue rulings</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: C.g100 }}>
        {[{ id: 'open', label: `Open (${disputes.length})`, color: C.danger }, { id: 'resolved', label: `Resolved (${resolved.length})`, color: C.success }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 py-2 px-4 rounded-lg text-sm font-black transition"
            style={{ backgroundColor: tab === t.id ? 'white' : 'transparent', color: tab === t.id ? t.color : C.g500, boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spin /> : (
        <div className="flex gap-4">
          <div className="flex-1 space-y-3 min-w-0">
            {tab === 'open' && (disputes.length === 0
              ? <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: C.g200 }}><CheckCircle size={40} className="mx-auto mb-3" style={{ color: C.success }} /><p className="font-black" style={{ color: C.g700 }}>No open disputes</p></div>
              : disputes.map(d => (
                <div key={d.id} onClick={() => openDispute(active?.id === d.id ? null : d)}
                  className="bg-white rounded-2xl border-2 p-4 cursor-pointer hover:shadow-md transition"
                  style={{ borderColor: active?.id === d.id ? C.danger : '#FCA5A5', backgroundColor: '#FFF5F5' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <Pill label="DISPUTED" color="#991B1B" bg="#FEF2F2" />
                        <span className="text-xs font-mono" style={{ color: C.g400 }}>#{(d.trade_id || '').slice(0, 8).toUpperCase()}</span>
                        <span className="text-xs ml-auto" style={{ color: C.g400 }}>{fmtAge(d.created_at)}</span>
                      </div>
                      <p className="text-sm font-black mb-1 truncate" style={{ color: C.g800 }}>{d.reason || 'User opened a dispute'}</p>
                      <p className="text-xs" style={{ color: C.g500 }}>Buyer: <strong>{d.buyer?.username}</strong> · Seller: <strong>{d.seller?.username}</strong> · ₿{fmtB(d.trade_details?.amount_btc)}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-lg font-bold" style={{ backgroundColor: C.purpleLight, color: C.purple }}>Review →</span>
                  </div>
                </div>
              ))
            )}
            {tab === 'resolved' && (resolved.length === 0 ? <Empty icon="⚖️" text="No resolved disputes yet" /> :
              resolved.map(d => {
                const res = d.resolution || d.dispute_resolution;
                const rc = res === 'BUYER_WINS' ? C.success : res === 'SELLER_WINS' ? C.paid : C.danger;
                return (
                  <div key={d.id} className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Pill label={res?.replace(/_/g, ' ') || 'RESOLVED'} color={rc} bg={`${rc}15`} />
                      <span className="text-xs font-mono" style={{ color: C.g400 }}>#{(d.trade_id || '').slice(0, 8).toUpperCase()}</span>
                      <span className="text-xs ml-auto" style={{ color: C.g400 }}>{fmtAge(d.resolved_at || d.updated_at)}</span>
                    </div>
                    <p className="text-sm font-bold mb-1" style={{ color: C.g700 }}>{d.reason || 'Dispute resolved'}</p>
                    <p className="text-xs" style={{ color: C.g500 }}>Buyer: <strong>{d.buyer?.username}</strong> · Seller: <strong>{d.seller?.username}</strong>{d.resolved_by_name ? ` · Resolved by: ${d.resolved_by_name}` : ''}</p>
                  </div>
                );
              })
            )}
          </div>

          {active && tab === 'open' && (
            <div className="w-96 bg-white rounded-2xl border flex flex-col flex-shrink-0 overflow-hidden" style={{ borderColor: C.g200, maxHeight: '82vh' }}>
              <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: C.g100, backgroundColor: '#faf5ff' }}>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider" style={{ color: C.purple }}>Active Dispute</p>
                  <p className="font-black text-sm" style={{ color: C.g800 }}>#{(active.trade_id || '').slice(0, 8).toUpperCase()}</p>
                </div>
                <button onClick={() => setActive(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} style={{ color: C.g400 }} /></button>
              </div>
              <div className="flex border-b px-2 flex-shrink-0" style={{ borderColor: C.g100 }}>
                {[{ id: 'details', l: 'Details' }, { id: 'chat', l: 'Chat' }, { id: 'resolve', l: 'Resolve' }].map(t => (
                  <button key={t.id} onClick={() => setDetailTab(t.id)}
                    className={`py-3 px-3 text-xs font-bold border-b-2 transition ${detailTab === t.id ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>{t.l}</button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                {detailTab === 'details' && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
                      <p className="text-xs font-black text-red-700 mb-1">Dispute Reason</p>
                      <p className="text-sm font-bold text-red-800">{active.reason || 'No reason provided'}</p>
                      <p className="text-xs text-red-400 mt-1">{fmtAge(active.created_at)}</p>
                    </div>
                    {[
                      { l: 'BTC in Escrow', v: `₿ ${fmtB(active.trade_details?.amount_btc)}`, c: C.gold },
                      { l: 'USD Value', v: fmtU(active.trade_details?.amount_usd), c: C.success },
                      { l: 'Buyer', v: active.buyer?.username || '—', c: C.green },
                      { l: 'Seller', v: active.seller?.username || '—', c: C.paid },
                      { l: 'Payment', v: active.trade_details?.payment_method || '—', c: C.g600 },
                      { l: 'Buyer Confirmed', v: active.trade_details?.buyer_confirmed ? '✅ Yes' : '⏳ No', c: C.g600 },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="flex justify-between py-2 border-b text-sm" style={{ borderColor: C.g100 }}>
                        <span style={{ color: C.g400 }}>{l}</span>
                        <span className="font-black" style={{ color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {detailTab === 'chat' && (
                  <div className="flex flex-col" style={{ height: 380 }}>
                    {!joined && (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-3 text-center">
                        <p className="font-black text-purple-800 text-xs mb-2">Join to chat with both parties</p>
                        <button onClick={joinChat} className="px-4 py-1.5 rounded-lg text-white font-black text-xs" style={{ backgroundColor: C.purple }}>Join Chat</button>
                      </div>
                    )}
                    <div className="flex-1 overflow-y-auto space-y-2 p-2 rounded-xl border min-h-0" style={{ backgroundColor: C.g50 }}>
                      {messages.length === 0
                        ? <div className="flex items-center justify-center h-full"><p className="text-xs text-gray-400">No messages</p></div>
                        : messages.map((m, i) => {
                          const isMod = m.sender_role === 'moderator' || (m.message_text || m.message || '').startsWith('[MODERATOR]');
                          const isSys = !m.sender_id || m.message_type === 'SYSTEM';
                          const text = (m.message_text || m.message || '').replace(/^\[MODERATOR\]\s*/, '');
                          const isBuyer = m.sender_id === active.buyer?.id;
                          if (isSys) return <div key={i} className="flex justify-center"><span className="bg-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs">{text}</span></div>;
                          if (isMod) return (
                            <div key={i} className="flex justify-center">
                              <div className="w-full rounded-lg overflow-hidden border" style={{ borderColor: C.purple }}>
                                <div className="px-2 py-1 flex items-center gap-1" style={{ background: C.purple }}><Shield size={10} className="text-white" /><span className="text-xs font-black text-white">Support</span></div>
                                <div className="px-2 py-1.5" style={{ backgroundColor: '#faf5ff' }}><p className="text-xs text-purple-900">{text}</p></div>
                              </div>
                            </div>
                          );
                          return (
                            <div key={i} className={`flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
                              <div className="max-w-[80%] rounded-xl px-3 py-2 border" style={{ backgroundColor: isBuyer ? 'white' : '#f0fdf4', borderColor: isBuyer ? C.g200 : '#86efac' }}>
                                <p className="text-xs font-bold mb-0.5" style={{ color: isBuyer ? C.green : C.paid }}>{isBuyer ? active.buyer?.username : active.seller?.username}</p>
                                <p className="text-xs">{text}</p>
                              </div>
                            </div>
                          );
                        })
                      }
                      <div ref={chatEnd} />
                    </div>
                    {joined && (
                      <form onSubmit={sendMessage} className="flex gap-2 mt-2">
                        <input value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Message both parties…"
                          className="flex-1 px-3 py-2 border rounded-xl text-xs outline-none" style={{ borderColor: C.g200 }} />
                        <button type="submit" disabled={sending || !newMsg.trim()} className="px-3 py-2 rounded-xl text-white font-black text-xs disabled:opacity-40" style={{ backgroundColor: C.purple }}>
                          {sending ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                        </button>
                      </form>
                    )}
                  </div>
                )}
                {detailTab === 'resolve' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[{ l: 'BTC', v: `₿ ${fmtB(active.trade_details?.amount_btc)}`, c: C.gold }, { l: 'USD', v: fmtU(active.trade_details?.amount_usd), c: C.success }, { l: 'Buyer', v: active.buyer?.username, c: C.green }, { l: 'Seller', v: active.seller?.username, c: C.paid }].map(({ l, v, c }) => (
                        <div key={l} className="p-2 rounded-xl text-center border" style={{ backgroundColor: C.g50 }}><p className="text-xs text-gray-400">{l}</p><p className="text-sm font-black" style={{ color: c }}>{v}</p></div>
                      ))}
                    </div>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Decision notes (required)…"
                      className="w-full border rounded-xl px-3 py-2 text-xs outline-none resize-none"
                      style={{ borderColor: notes ? C.purple : C.g200 }} />
                    <div className="space-y-1.5">
                      {[
                        { v: 'BUYER_WINS', l: '✅ Buyer Wins', c: C.success, bg: '#ECFDF5' },
                        { v: 'SELLER_WINS', l: '✅ Seller Wins', c: C.paid, bg: '#EFF6FF' },
                        { v: 'CANCEL', l: '❌ Cancel Trade', c: C.danger, bg: '#FEF2F2' },
                      ].map(o => (
                        <button key={o.v} onClick={() => setResolution(o.v)}
                          className="w-full text-left py-2.5 px-3 rounded-xl text-xs font-bold border-2 transition"
                          style={{ backgroundColor: resolution === o.v ? o.bg : 'white', color: resolution === o.v ? o.c : C.g500, borderColor: resolution === o.v ? o.c : C.g200 }}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                    <button onClick={resolve} disabled={submitting || !notes.trim()}
                      className="w-full py-3 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-40"
                      style={{ backgroundColor: C.purple }}>
                      {submitting ? <><RefreshCw size={14} className="animate-spin" /> Processing…</> : <><Gavel size={14} /> Seal Ruling</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// FEEDBACK — all platform reviews
// ================================================================
function FeedbackSection() {
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/reviews`, { headers: authH(), params: { page, limit: LIMIT, rating: ratingFilter } });
      setReviews(r.data.reviews || []); setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load feedback'); }
    setLoading(false);
  }, [page, ratingFilter]);

  useEffect(() => { setPage(1); }, [ratingFilter]);
  useEffect(() => { load(); }, [load]);

  const positive = reviews.filter(r => r.rating >= 4).length;
  const negative = reviews.filter(r => r.rating <= 2).length;
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '—';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>User Feedback</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>All platform reviews left by users after completed trades</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Reviews', value: fmt(total), icon: <Star size={20} />, color: C.gold, bg: '#FFFBEB' },
          { label: 'Avg Rating', value: avg, icon: <TrendingUp size={20} />, color: C.success, bg: '#F0FDF4' },
          { label: 'Positive (4-5★)', value: fmt(positive), icon: <ThumbsUp size={20} />, color: C.success, bg: '#F0FDF4' },
          { label: 'Negative (1-2★)', value: fmt(negative), icon: <ThumbsDown size={20} />, color: C.danger, bg: '#FEF2F2' },
        ].map(({ label, value, icon, color, bg }) => (
          <StatCard key={label} icon={icon} label={label} value={value} color={color} bg={bg} />
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <Filter size={14} style={{ color: C.g400 }} />
        <div className="flex gap-1">
          {['', '5', '4', '3', '2', '1'].map(r => (
            <button key={r} onClick={() => setRatingFilter(r)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
              style={{
                backgroundColor: ratingFilter === r ? C.forest : 'white',
                color: ratingFilter === r ? 'white' : C.g600,
                border: `1px solid ${ratingFilter === r ? C.forest : C.g200}`,
              }}>
              {r ? `${r}★` : 'All'}
            </button>
          ))}
        </div>
        <span className="text-xs ml-2" style={{ color: C.g400 }}>{fmt(total)} reviews</span>
      </div>

      {/* Reviews list */}
      {loading ? <Spin /> : reviews.length === 0 ? <Empty icon="⭐" text="No reviews yet" /> : (
        <div className="space-y-3">
          {reviews.map((rv, i) => (
            <div key={rv.id || i} className="bg-white rounded-2xl border p-4 hover:shadow-sm transition" style={{ borderColor: C.g200 }}>
              <div className="flex items-start gap-3">
                {/* Reviewer */}
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white"
                    style={{ backgroundColor: C.forest }}>
                    {(rv.reviewer?.username || '?')[0].toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-black" style={{ color: C.g800 }}>{rv.reviewer?.username || 'Anonymous'}</p>
                    <span className="text-xs" style={{ color: C.g400 }}>reviewed</span>
                    <p className="text-sm font-black" style={{ color: C.green }}>{rv.reviewee?.username || '—'}</p>
                    <span className="ml-auto text-xs" style={{ color: C.g400 }}>{fmtAge(rv.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Stars rating={rv.rating} />
                    <span className="text-xs font-black" style={{ color: rv.rating >= 4 ? C.success : rv.rating <= 2 ? C.danger : C.warn }}>
                      {rv.rating}/5
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rv.rating >= 4 ? 'bg-green-50 text-green-700' : rv.rating <= 2 ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
                      {rv.rating >= 4 ? '👍 Positive' : rv.rating <= 2 ? '👎 Negative' : '➖ Neutral'}
                    </span>
                  </div>
                  {rv.comment && (
                    <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 px-3 py-2 rounded-xl border" style={{ borderColor: C.g100 }}>
                      "{rv.comment}"
                    </p>
                  )}
                  {rv.trade_id && (
                    <p className="text-xs mt-1.5" style={{ color: C.g400 }}>
                      Trade #{rv.trade_id.slice(0, 8).toUpperCase()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > LIMIT && (
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: C.g400 }}>{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-30"
              style={{ borderColor: C.g200, color: C.g600 }}><ChevronLeft size={13} /> Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-30"
              style={{ borderColor: C.g200, color: C.g600 }}>Next <ChevronRight size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// TOP TRADERS
// ================================================================
function TopTradersSection() {
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('trades');
  const [selected, setSelected] = useState(null);
  const [userReviews, setUserReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/top-traders`, { headers: authH(), params: { sort, limit: 30 } });
      setTraders(r.data.traders || []);
    } catch { toast.error('Failed to load top traders'); }
    setLoading(false);
  }, [sort]);

  useEffect(() => { load(); }, [load]);

  const viewUser = async (u) => {
    setSelected(u); setUserReviews([]); setReviewsLoading(true);
    try {
      const r = await axios.get(`${API_URL}/users/${u.id}/reviews`);
      setUserReviews(r.data.reviews?.slice(0, 5) || []);
    } catch {}
    setReviewsLoading(false);
  };

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Top Traders</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Most active users and highest value traders on the platform</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>

      {/* Sort toggle */}
      <div className="flex gap-2 items-center">
        <Trophy size={14} style={{ color: C.gold }} />
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
          {[{ v: 'trades', l: 'Most Trades' }, { v: 'volume', l: 'Most Volume' }].map(o => (
            <button key={o.v} onClick={() => setSort(o.v)}
              className="px-4 py-2 text-xs font-bold transition"
              style={{ backgroundColor: sort === o.v ? C.forest : 'white', color: sort === o.v ? 'white' : C.g600 }}>
              {o.l}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: C.g400 }}>Sorted by: <strong>{sort === 'trades' ? 'number of trades' : 'USD volume'}</strong></span>
      </div>

      <div className="flex gap-4">
        {/* Leaderboard */}
        <div className="flex-1 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {loading ? <Spin /> : traders.length === 0 ? <Empty icon="🏆" text="No data yet" /> : (
            <>
              {/* Top 3 podium */}
              {traders.slice(0, 3).length > 0 && (
                <div className="p-5 border-b" style={{ borderColor: C.g100, background: `linear-gradient(135deg,${C.g50},white)` }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-4" style={{ color: C.g500 }}>Top Performers</p>
                  <div className="flex gap-3">
                    {traders.slice(0, 3).map((u, i) => {
                      const bd = badgeColor(u.badge);
                      return (
                        <div key={u.id} onClick={() => viewUser(u)}
                          className="flex-1 rounded-2xl border-2 p-4 text-center cursor-pointer hover:shadow-lg transition"
                          style={{ borderColor: i === 0 ? C.gold : i === 1 ? '#9CA3AF' : '#92400E' }}>
                          <div className="text-2xl mb-2">{medals[i]}</div>
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white mx-auto mb-2"
                            style={{ backgroundColor: C.forest }}>{(u.username || '?')[0].toUpperCase()}</div>
                          <p className="font-black text-sm truncate" style={{ color: C.g800 }}>{u.username}</p>
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-black mt-1" style={{ backgroundColor: bd.bg, color: bd.c }}>{u.badge || 'BEGINNER'}</span>
                          <p className="text-lg font-black mt-2" style={{ color: C.forest }}>
                            {sort === 'trades' ? fmt(u.total_trades) : `$${fmt(u.total_volume_usd, 0)}`}
                          </p>
                          <p className="text-xs" style={{ color: C.g400 }}>{sort === 'trades' ? 'trades' : 'volume'}</p>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <Star size={11} className="fill-yellow-400 text-yellow-400" />
                            <span className="text-xs font-bold" style={{ color: C.g600 }}>{parseFloat(u.average_rating || 0).toFixed(1)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rest of leaderboard */}
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['#', 'Trader', 'Badge', 'Trades', 'Volume', 'Rating', 'Status', 'Last Active'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {traders.map((u, i) => {
                    const bd = badgeColor(u.badge);
                    return (
                      <tr key={u.id} onClick={() => viewUser(selected?.id === u.id ? null : u)}
                        className="border-t hover:bg-gray-50 cursor-pointer transition"
                        style={{ borderColor: C.g100, backgroundColor: selected?.id === u.id ? '#F0FDF4' : undefined }}>
                        <td className="px-4 py-3 text-sm font-black" style={{ color: i < 3 ? C.gold : C.g500 }}>
                          {i < 3 ? medals[i] : i + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                              style={{ backgroundColor: C.forest }}>{(u.username || '?')[0].toUpperCase()}</div>
                            <div>
                              <p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p>
                              <p className="text-xs" style={{ color: C.g400 }}>{u.country || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: bd.bg, color: bd.c }}>{u.badge || 'BEGINNER'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm font-black" style={{ color: C.g800 }}>{fmt(u.total_trades)}</td>
                        <td className="px-4 py-3 text-sm font-bold" style={{ color: C.g700 }}>
                          {u.total_volume_usd ? `$${fmt(u.total_volume_usd, 0)}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Stars rating={u.average_rating} />
                            <span className="text-xs font-bold ml-1" style={{ color: C.g700 }}>{parseFloat(u.average_rating || 0).toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Pill
                            label={u.account_status || 'active'}
                            color={u.account_status === 'banned' ? '#991B1B' : '#166534'}
                            bg={u.account_status === 'banned' ? '#FEF2F2' : '#F0FDF4'}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(u.last_seen_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* User detail panel */}
        {selected && (
          <div className="w-72 bg-white rounded-2xl border p-5 flex-shrink-0" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-black text-sm" style={{ color: C.g800 }}>Trader Profile</h3>
              <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
            </div>
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white mx-auto mb-2"
                style={{ backgroundColor: C.forest }}>{(selected.username || '?')[0].toUpperCase()}</div>
              <p className="font-black" style={{ color: C.g800 }}>{selected.username}</p>
              <p className="text-xs mb-2" style={{ color: C.g400 }}>{selected.country || '—'}</p>
              <div className="flex items-center justify-center gap-1 mb-1"><Stars rating={selected.average_rating} /></div>
              <span className="text-xs font-black px-3 py-1 rounded-full" style={{ backgroundColor: badgeColor(selected.badge).bg, color: badgeColor(selected.badge).c }}>{selected.badge || 'BEGINNER'}</span>
            </div>
            <div className="space-y-1.5 mb-4">
              {[
                { l: 'Total Trades', v: fmt(selected.total_trades) },
                { l: 'Volume', v: selected.total_volume_usd ? `$${fmt(selected.total_volume_usd, 0)}` : '—' },
                { l: 'Avg Rating', v: `⭐ ${parseFloat(selected.average_rating || 0).toFixed(1)}` },
                { l: 'Positive', v: `👍 ${fmt(selected.positive_feedback)}` },
                { l: 'Negative', v: `👎 ${fmt(selected.negative_feedback)}` },
                { l: 'Member Since', v: fmtDate(selected.created_at) },
                { l: 'Last Active', v: fmtAge(selected.last_seen_at) },
                { l: 'Status', v: selected.account_status || 'active' },
              ].map(({ l, v }) => (
                <div key={l} className="flex justify-between py-1.5 border-b text-xs" style={{ borderColor: C.g100 }}>
                  <span style={{ color: C.g400 }}>{l}</span>
                  <span className="font-bold" style={{ color: C.g700 }}>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-black mb-2" style={{ color: C.g600 }}>Recent Reviews</p>
              {reviewsLoading ? <Spin /> : userReviews.length === 0
                ? <p className="text-xs text-center py-3" style={{ color: C.g400 }}>No reviews yet</p>
                : userReviews.map((rv, i) => (
                  <div key={i} className="border-b py-2 last:border-0" style={{ borderColor: C.g100 }}>
                    <div className="flex items-center gap-1 mb-0.5"><Stars rating={rv.rating} /><span className="text-xs font-bold ml-1">{rv.rating}/5</span></div>
                    {rv.comment && <p className="text-xs" style={{ color: C.g500 }}>"{rv.comment?.slice(0, 80)}{rv.comment?.length > 80 ? '…' : ''}"</p>}
                    <p className="text-xs mt-0.5" style={{ color: C.g400 }}>by {rv.reviewer?.username || '?'} · {fmtAge(rv.created_at)}</p>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// USERS — view-only
// ================================================================
function UsersSection() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [userReviews, setUserReviews] = useState([]);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/users`, { headers: authH(), params: { search, page, limit: LIMIT } });
      setUsers(r.data.users || []); setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load users'); }
    setLoading(false);
  }, [search, page]);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { load(); }, [load]);

  const viewUser = async (u) => {
    setSelected(u); setUserReviews([]);
    try { const r = await axios.get(`${API_URL}/users/${u.id}/reviews`); setUserReviews(r.data.reviews?.slice(0, 4) || []); } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Users</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>View user accounts — read only</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>
      <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <Info size={13} style={{ color: C.warn, flexShrink: 0 }} />
        <p className="text-xs font-semibold" style={{ color: '#92400E' }}>View only. To ban, delete, or change roles — use the Admin Panel.</p>
      </div>
      <div className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
        <Search size={14} style={{ color: C.g400 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username or email…"
          className="flex-1 text-sm outline-none" style={{ color: C.g700 }} />
        {search && <button onClick={() => setSearch('')}><X size={13} style={{ color: C.g400 }} /></button>}
      </div>
      <div className="flex gap-4">
        <div className="flex-1 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {loading ? <Spin /> : users.length === 0 ? <Empty icon="👤" text="No users found" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>{['User', 'Status', 'Trades', 'Rating', 'Badge', 'Verified', 'Joined', 'View'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ backgroundColor: C.forest }}>{(u.username || '?')[0].toUpperCase()}</div>
                          <div><p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p><p className="text-xs" style={{ color: C.g400 }}>{u.email}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Pill label={u.account_status || 'active'} color={u.account_status === 'banned' ? '#991B1B' : '#166534'} bg={u.account_status === 'banned' ? '#FEF2F2' : '#F0FDF4'} /></td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g700 }}>{u.total_trades || 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1"><Stars rating={u.average_rating} /><span className="text-xs font-bold" style={{ color: C.g700 }}>{parseFloat(u.average_rating || 0).toFixed(1)}</span></div>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: badgeColor(u.badge).bg, color: badgeColor(u.badge).c }}>{u.badge || 'BEGINNER'}</span></td>
                      <td className="px-4 py-3 text-xs">{u.is_email_verified ? '📧 ' : ''}{u.is_phone_verified ? '📱 ' : ''}{u.is_id_verified ? '🪪' : ''}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => viewUser(selected?.id === u.id ? null : u)} className="p-1.5 rounded-lg hover:bg-gray-100">
                          <Eye size={14} style={{ color: C.g500 }} />
                        </button>
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
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30"><ChevronLeft size={16} /></button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total} className="p-1 rounded disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
        {selected && (
          <div className="w-64 bg-white rounded-2xl border p-4 flex-shrink-0" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between mb-3"><h3 className="font-black text-sm" style={{ color: C.g800 }}>User Detail</h3><button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button></div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white mb-2" style={{ backgroundColor: C.forest }}>{(selected.username || '?')[0].toUpperCase()}</div>
            <p className="font-black text-sm" style={{ color: C.g800 }}>{selected.username}</p>
            <p className="text-xs mb-3" style={{ color: C.g400 }}>{selected.email}</p>
            <div className="space-y-1.5 mb-3">
              {[
                { l: 'Status', v: selected.account_status || 'active' },
                { l: 'Trades', v: fmt(selected.total_trades) },
                { l: 'Volume', v: selected.total_volume_usd ? `$${fmt(selected.total_volume_usd, 0)}` : '—' },
                { l: 'Rating', v: `⭐ ${parseFloat(selected.average_rating || 0).toFixed(1)}` },
                { l: 'Badge', v: selected.badge || 'BEGINNER' },
                { l: 'Phone', v: selected.phone_number || '—' },
                { l: 'KYC', v: selected.kyc_status || '—' },
                { l: 'Last Active', v: fmtAge(selected.last_seen_at) },
                { l: 'Joined', v: fmtDate(selected.created_at) },
              ].map(({ l, v }) => (
                <div key={l} className="flex justify-between py-1 border-b text-xs" style={{ borderColor: C.g100 }}>
                  <span style={{ color: C.g400 }}>{l}</span><span className="font-bold" style={{ color: C.g700 }}>{v}</span>
                </div>
              ))}
            </div>
            <p className="text-xs font-black mb-2" style={{ color: C.g600 }}>Recent Reviews</p>
            {userReviews.length === 0
              ? <p className="text-xs text-center py-2" style={{ color: C.g400 }}>No reviews</p>
              : userReviews.map((rv, i) => (
                <div key={i} className="border-b py-1.5 last:border-0" style={{ borderColor: C.g100 }}>
                  <div className="flex items-center gap-1"><Stars rating={rv.rating} /></div>
                  {rv.comment && <p className="text-xs mt-0.5" style={{ color: C.g500 }}>"{rv.comment?.slice(0, 60)}{rv.comment?.length > 60 ? '…' : ''}"</p>}
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// MAIN
// ================================================================
export default function TeamDashboard({ user: propUser }) {
  const [teamUser, setTeamUser] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [section, setSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [disputeCount, setDisputeCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('team_token');
    const stored = localStorage.getItem('team_user');
    if (token && stored) {
      const u = JSON.parse(stored);
      if (u.is_moderator || u.is_admin) {
        setTeamUser(u); setLoggedIn(true);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } else {
        localStorage.removeItem('team_token'); localStorage.removeItem('team_user');
      }
    } else if (propUser && (propUser.is_moderator || propUser.is_admin) && localStorage.getItem('token')) {
      const t = localStorage.getItem('token');
      localStorage.setItem('team_token', t); localStorage.setItem('team_user', JSON.stringify(propUser));
      setTeamUser(propUser); setLoggedIn(true);
    }
  }, [propUser]);

  useEffect(() => {
    if (!loggedIn) return;
    const poll = async () => {
      try {
        const r = await axios.get(`${API_URL}/admin/disputes`, { headers: authH() });
        setDisputeCount((r.data.disputes || []).filter(d => ['OPEN','DISPUTED','IN_REVIEW'].includes(d.status)).length);
      } catch {}
    };
    poll(); const iv = setInterval(poll, 30000); return () => clearInterval(iv);
  }, [loggedIn]);

  const logout = () => {
    localStorage.removeItem('team_token'); localStorage.removeItem('team_user');
    setLoggedIn(false); setTeamUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  if (!loggedIn) return <TeamLogin onAuth={(u) => { setTeamUser(u); setLoggedIn(true); }} />;

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'support-chat', label: 'Support Chat', icon: MessageSquare },
    { id: 'trade-lookup', label: 'Trade Lookup', icon: Hash },
    { id: 'disputes', label: 'Disputes', icon: Gavel, badge: disputeCount },
    { id: 'feedback', label: 'Feedback', icon: Star },
    { id: 'top-traders', label: 'Top Traders', icon: Trophy },
    { id: 'users', label: 'Users', icon: Users },
  ];

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: C.g50 }}>
      {/* Sidebar */}
      <aside className={`flex-shrink-0 flex flex-col border-r transition-all duration-200 ${sidebarOpen ? 'w-56' : 'w-16'}`}
        style={{ backgroundColor: C.forest, borderColor: '#0c2418', minHeight: '100vh' }}>
        <div className="px-4 py-5 flex items-center gap-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.gold }}>
            <span className="text-sm font-black" style={{ color: C.forest, fontFamily: 'Georgia,serif' }}>P</span>
          </div>
          {sidebarOpen && <div className="min-w-0"><p className="text-white font-black text-sm" style={{ fontFamily: 'Georgia,serif' }}>PRAQEN</p><p className="text-white/40 text-xs font-semibold tracking-wider uppercase">Team Portal</p></div>}
          <button onClick={() => setSidebarOpen(o => !o)} className="ml-auto p-1 rounded hover:bg-white/10 flex-shrink-0"><Menu size={16} className="text-white/60" /></button>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-0.5">
          {navItems.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => setSection(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition relative ${section === id ? 'bg-white/15' : 'hover:bg-white/8'}`}>
              <Icon size={17} className={section === id ? 'text-white' : 'text-white/50'} />
              {sidebarOpen && <span className={`text-sm font-bold truncate ${section === id ? 'text-white' : 'text-white/60'}`}>{label}</span>}
              {badge > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center font-black text-white"
                  style={{ backgroundColor: C.danger, fontSize: 9 }}>{badge > 9 ? '9+' : badge}</span>
              )}
              {section === id && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full" style={{ backgroundColor: C.gold }} />}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="flex items-center gap-2.5 mb-2 px-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-white flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>{(teamUser?.full_name || teamUser?.username || 'T')[0].toUpperCase()}</div>
            {sidebarOpen && <div className="min-w-0"><p className="text-white text-xs font-black truncate">{teamUser?.full_name || teamUser?.username}</p><p className="text-white/40 text-xs truncate" style={{fontSize:'10px'}}>{teamUser?.email}</p></div>}
          </div>
          <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 transition">
            <LogOut size={15} className="text-white/50 flex-shrink-0" />
            {sidebarOpen && <span className="text-xs font-bold text-white/60">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black" style={{ color: C.g800 }}>{navItems.find(n => n.id === section)?.label}</h1>
            <p className="text-xs mt-0.5" style={{ color: C.g400 }}>
              Signed in as <span className="font-bold" style={{ color: C.g600 }}>{teamUser?.full_name || teamUser?.username}</span>
              <span className="mx-1.5">·</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black" style={{ backgroundColor: C.purpleLight, color: C.purple }}>
                <Shield size={10} /> {teamUser?.is_admin ? 'Admin' : 'Team'}
              </span>
            </p>
          </div>
          {disputeCount > 0 && (
            <button onClick={() => setSection('disputes')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black border-2 animate-pulse"
              style={{ borderColor: C.danger, color: C.danger, backgroundColor: '#FEF2F2' }}>
              <Bell size={13} /> {disputeCount} Dispute{disputeCount > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {section === 'overview' && <OverviewSection teamUser={teamUser} />}
        {section === 'support-chat' && <SupportChatSection teamUser={teamUser} />}
        {section === 'trade-lookup' && <TradeLookupSection />}
        {section === 'disputes' && <DisputesSection teamUser={teamUser} />}
        {section === 'feedback' && <FeedbackSection />}
        {section === 'top-traders' && <TopTradersSection />}
        {section === 'users' && <UsersSection />}
      </main>
    </div>
  );
}
