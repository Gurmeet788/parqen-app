import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  AlertCircle, CheckCircle, Clock, Eye, X, Flag,
  MessageCircle, Send, CreditCard, User, DollarSign,
  Bitcoin, Shield, AlertTriangle, Star, TrendingUp,
  ThumbsUp, ThumbsDown, Lock, RefreshCw, LogIn,
  Phone, Building, Image, UserCheck
} from 'lucide-react';
import { toast } from 'react-toastify';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PRAQEN = {
  primary: '#2D5F4F', secondary: '#FFD700', darkBg: '#1a3a2a', lightBg: '#f0f8f5',
  purple: '#7C3AED', purpleLight: '#EDE9FE', danger: '#EF4444',
  success: '#10B981', warning: '#F59E0B', info: '#3B82F6',
};

const ADMIN_EMAIL = 'parqen5@gmail.com';

function ModeratorLogin({ onLogin, user }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Auto-login when the already-logged-in user is a moderator/admin
  useEffect(() => {
    if (user?.is_moderator || user?.is_admin) {
      const tok = localStorage.getItem('token');
      if (tok) { localStorage.setItem('mod_token', tok); onLogin(user.username || 'PRAQEN Moderator'); }
    }
  }, [user]);

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/auth/login`, { email: email.trim(), password });
      const { token, user: u } = r.data;
      if (!token || (!u?.is_moderator && !u?.is_admin)) {
        setError('Access denied. This account does not have moderator privileges.');
        setLoading(false); return;
      }
      // Store the JWT so all dashboard API calls are authenticated
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(u));
      localStorage.setItem('mod_token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onLogin(u.username || u.email || 'Moderator');
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Invalid email or password.';
      setError(msg);
    }
    setLoading(false);
  };

  // Already logged in as moderator — show spinner while auto-login fires
  if ((user?.is_moderator || user?.is_admin) && localStorage.getItem('token')) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: PRAQEN.lightBg }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRAQEN.purple, borderTopColor: PRAQEN.secondary }} />
          <p className="font-bold" style={{ color: PRAQEN.primary }}>Authenticating…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: PRAQEN.lightBg }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border-t-4" style={{ borderColor: PRAQEN.purple }}>
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: PRAQEN.purpleLight }}>
            <Shield size={32} style={{ color: PRAQEN.purple }} />
          </div>
          <h1 className="text-2xl font-black" style={{ color: PRAQEN.darkBg }}>Moderator Login</h1>
          <p className="text-gray-500 text-sm mt-1">
            <span style={{ color: PRAQEN.primary, fontWeight: 900 }}>PRA</span>
            <span style={{ color: PRAQEN.secondary, fontWeight: 900 }}>QEN</span> Dispute Resolution Center
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">Email Address</label>
            <input
              type="email" value={email} autoFocus
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="your@email.com"
              className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none transition"
              style={{ borderColor: error ? PRAQEN.danger : email ? PRAQEN.purple : '#e5e7eb' }}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5">Password</label>
            <input
              type="password" value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="••••••••"
              className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none transition"
              style={{ borderColor: error ? PRAQEN.danger : password ? PRAQEN.purple : '#e5e7eb' }}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
              <AlertTriangle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-red-700">{error}</p>
            </div>
          )}

          <button type="submit" disabled={!email.trim() || !password || loading}
            className="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition"
            style={{ backgroundColor: PRAQEN.purple }}>
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> Verifying…</>
              : <><LogIn size={14} /> Enter Moderator Dashboard</>}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          🔒 Restricted access — moderator accounts only. All actions are logged.
        </p>
      </div>
    </div>
  );
}

export default function ModeratorDashboard({ user }) {
  const [modName, setModName] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [disputes, setDisputes] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [images, setImages] = useState([]);
  const [buyerStats, setBuyerStats] = useState(null);
  const [sellerStats, setSellerStats] = useState(null);
  const [buyerReviews, setBuyerReviews] = useState([]);
  const [sellerReviews, setSellerReviews] = useState([]);
  const [moderatorJoined, setModeratorJoined] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const t = localStorage.getItem('mod_token');
    if (t) { setLoggedIn(true); setModName(user?.username || 'PRAQEN Moderator'); }
  }, []);

  // Auto-login when the app-level user is already a moderator/admin
  useEffect(() => {
    if ((user?.is_moderator || user?.is_admin) && !loggedIn) {
      const tok = localStorage.getItem('token');
      if (tok) {
        localStorage.setItem('mod_token', tok);
        setLoggedIn(true);
        setModName(user.username || 'PRAQEN Moderator');
      }
    }
  }, [user]);
  useEffect(() => { if (loggedIn) { loadDisputes(); loadResolved(); } }, [loggedIn]);
  useEffect(() => {
    if (selectedDispute && (activeTab === 'chat' || activeTab === 'evidence' || activeTab === 'user-history')) {
      loadChatMessages(); loadImages(); loadUserStats();
      const iv = setInterval(loadChatMessages, 5000);
      return () => clearInterval(iv);
    }
  }, [selectedDispute, activeTab]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const authH = () => { const t = localStorage.getItem('token'); return t ? { Authorization: `Bearer ${t}` } : {}; };

  const loadDisputes = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/disputes`, { headers: authH() });
      setDisputes((r.data.disputes || []).filter(d => ['OPEN','DISPUTED','IN_REVIEW'].includes(d.status)));
    } catch { setDisputes([]); } finally { setLoading(false); }
  };

  const loadResolved = async () => {
    try {
      const r = await axios.get(`${API_URL}/admin/disputes`, { headers: authH() });
      setResolved((r.data.disputes || []).filter(d => ['COMPLETED','CANCELLED'].includes(d.status) && d.dispute_reason));
    } catch {
      try {
        const r = await axios.get(`${API_URL}/my-trades`, { headers: authH() });
        setResolved((r.data.trades || []).filter(t => (t.status === 'COMPLETED' || t.status === 'CANCELLED') && t.dispute_resolution)
          .map(t => ({ id: t.id, trade_id: t.id, resolution: t.dispute_resolution, resolution_notes: t.dispute_notes, resolved_by: t.resolved_by, resolved_at: t.resolved_at, reason: t.dispute_reason, buyer: t.buyer, seller: t.seller, amount_btc: t.amount_btc, amount_usd: t.amount_usd })));
      } catch { setResolved([]); }
    }
  };

  const loadChatMessages = async () => {
    if (!selectedDispute) return;
    try { const r = await axios.get(`${API_URL}/messages/${selectedDispute.trade_id}`, { headers: authH() }); setChatMessages(r.data.messages || []); } catch {}
  };

  const loadImages = async () => {
    if (!selectedDispute) return;
    try { const r = await axios.get(`${API_URL}/trades/${selectedDispute.trade_id}/images`, { headers: authH() }); setImages(r.data.images || []); } catch {}
  };

  const loadUserStats = async () => {
    if (!selectedDispute) return;
    try {
      if (selectedDispute.buyer?.id) {
        const r = await axios.get(`${API_URL}/users/${selectedDispute.buyer.id}`, { headers: authH() }); setBuyerStats(r.data.user || r.data);
        try { const rv = await axios.get(`${API_URL}/users/${selectedDispute.buyer.id}/reviews`, { headers: authH() }); setBuyerReviews(rv.data.reviews || []); } catch { setBuyerReviews([]); }
      }
      if (selectedDispute.seller?.id) {
        const r = await axios.get(`${API_URL}/users/${selectedDispute.seller.id}`, { headers: authH() }); setSellerStats(r.data.user || r.data);
        try { const rv = await axios.get(`${API_URL}/users/${selectedDispute.seller.id}/reviews`, { headers: authH() }); setSellerReviews(rv.data.reviews || []); } catch { setSellerReviews([]); }
      }
    } catch {}
  };

  const moderatorJoinChat = async () => {
    try { await axios.post(`${API_URL}/trades/${selectedDispute.trade_id}/moderator-join`, {}, { headers: authH() }); } catch {}
    setModeratorJoined(true); toast.success('Joined dispute chat'); loadChatMessages();
  };

  const sendMessage = async (e) => {
    e.preventDefault(); if (!newMessage.trim()) return; setSendingMessage(true);
    try {
      await axios.post(`${API_URL}/messages`, { tradeId: selectedDispute.trade_id, message: `[MODERATOR] ${newMessage}` }, { headers: authH() });
      setNewMessage(''); loadChatMessages();
    } catch { toast.error('Failed to send'); } finally { setSendingMessage(false); }
  };

  const resolveDispute = async (disputeId, decision) => {
    if (!resolutionNotes.trim()) { toast.error('Add resolution notes first'); return; }
    if (!window.confirm(`Confirm: ${decision.replace(/_/g, ' ')}? This is final.`)) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/admin/disputes/${disputeId}/resolve`, { resolution: decision, notes: `${resolutionNotes}\n\nResolved by: ${modName} at ${new Date().toLocaleString()}` }, { headers: authH() });
      toast.success(`Resolved: ${decision.replace(/_/g, ' ')}`);
      setSelectedDispute(null); setResolutionNotes(''); loadDisputes(); loadResolved();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } finally { setSubmitting(false); }
  };

  const logout = () => { localStorage.removeItem('mod_token'); setLoggedIn(false); };

  const formatDate = d => !d ? '—' : new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtBtc = n => parseFloat(n || 0).toFixed(8);
  const fmtUsd = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtAge = d => { if (!d) return '—'; const s = (Date.now() - new Date(d)) / 1000; if (s < 3600) return `${~~(s / 60)}m ago`; if (s < 86400) return `${~~(s / 3600)}h ago`; return `${~~(s / 86400)}d ago`; };
  const getRatingStars = r => [...Array(5)].map((_, i) => <Star key={i} size={13} className={i < Math.round(r || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />);
  const getPaymentIcon = m => { if (m?.toLowerCase().includes('mtn') || m?.toLowerCase().includes('mobile')) return <Phone size={14} />; if (m?.toLowerCase().includes('bank')) return <Building size={14} />; return <CreditCard size={14} />; };
  const getResBadge = res => {
    const cfg = { BUYER_WINS: { l: '✅ Buyer Won', bg: '#ECFDF5', c: PRAQEN.success }, SELLER_WINS: { l: '✅ Seller Won', bg: '#EFF6FF', c: PRAQEN.info }, CANCEL: { l: '❌ Trade Cancelled', bg: '#FEF2F2', c: PRAQEN.danger } }[res] || { l: res || '—', bg: '#f3f4f6', c: '#6b7280' };
    return <span className="px-3 py-1 rounded-full text-sm font-bold" style={{ backgroundColor: cfg.bg, color: cfg.c }}>{cfg.l}</span>;
  };

  if (!loggedIn) return <ModeratorLogin user={user} onLogin={name => { setLoggedIn(true); setModName(name); }} />;

  const openDisputes = disputes.filter(d => d.status === 'OPEN' || d.status === 'DISPUTED');
  const inReviewDisputes = disputes.filter(d => d.status === 'IN_REVIEW');
  const totalBtc = resolved.reduce((s, d) => s + parseFloat(d.amount_btc || d.trade_details?.amount_btc || 0), 0);
  const totalUsd = resolved.reduce((s, d) => s + parseFloat(d.amount_usd || d.trade_details?.amount_usd || 0), 0);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PRAQEN.lightBg }}>
      <div className="text-center">
        <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRAQEN.purple, borderTopColor: PRAQEN.secondary }} />
        <p className="font-bold" style={{ color: PRAQEN.primary }}>Loading disputes…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: PRAQEN.lightBg }}>
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-black" style={{ color: PRAQEN.primary }}>🔨 Moderator Dashboard</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-gray-600 font-semibold">Logged in as: <span style={{ color: PRAQEN.purple }}>{modName}</span></p>
              {user?.email === ADMIN_EMAIL && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black text-white"
                  style={{ backgroundColor: PRAQEN.purple }}>
                  <Shield size={10} /> ADMIN · {ADMIN_EMAIL}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowGuidelines(!showGuidelines)} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow border hover:shadow-md transition">
              <Shield size={18} style={{ color: PRAQEN.purple }} /><span className="text-sm font-bold" style={{ color: PRAQEN.purple }}>Guidelines</span>
            </button>
            <button onClick={() => { loadDisputes(); loadResolved(); }} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow border hover:shadow-md transition">
              <RefreshCw size={16} className="text-gray-500" /><span className="text-sm font-bold text-gray-600">Refresh</span>
            </button>
            <button onClick={logout} className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow border border-red-100 hover:shadow-md transition">
              <X size={16} className="text-red-500" /><span className="text-sm font-bold text-red-500">Logout</span>
            </button>
          </div>
        </div>

        {/* GUIDELINES */}
        {showGuidelines && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6 mb-8">
            <h3 className="font-black text-lg text-purple-800 mb-4 flex items-center gap-2"><Shield size={20} /> Fair Dispute Resolution Guidelines</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { title: '✅ Buyer Wins', c: 'text-green-700', bg: 'bg-green-50', pts: ['Buyer has valid payment proof', 'Seller failed to release BTC', 'Seller sent fake/invalid item', 'Clear evidence of seller fraud'] },
                { title: '✅ Seller Wins', c: 'text-blue-700', bg: 'bg-blue-50', pts: ['Buyer never sent payment', 'Buyer provided fake proof', 'Buyer attempted scam', 'Seller provided valid item'] },
                { title: '❌ Cancel Trade', c: 'text-red-700', bg: 'bg-red-50', pts: ['Mutual misunderstanding', 'Technical platform issue', 'Insufficient evidence from both', 'Refund BTC to seller'] },
              ].map(({ title, c, bg, pts }) => (
                <div key={title} className={`${bg} rounded-xl p-4`}>
                  <p className={`font-black text-base ${c} mb-3`}>{title}</p>
                  <ul className="space-y-1.5">{pts.map(p => <li key={p} className={`text-sm ${c}`}>• {p}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
          {[
            { icon: AlertCircle, label: 'Open Disputes',  value: openDisputes.length,        color: PRAQEN.danger,   sub: openDisputes.length > 0 ? '⚡ Needs action' : '✅ All clear' },
            { icon: Clock,       label: 'In Review',      value: inReviewDisputes.length,    color: PRAQEN.warning,  sub: 'Being reviewed now' },
            { icon: CheckCircle, label: 'Total Resolved', value: resolved.length,            color: PRAQEN.success,  sub: 'All time' },
            { icon: TrendingUp,  label: 'Total Volume',   value: fmtUsd(totalUsd),           color: PRAQEN.purple,   sub: `₿ ${fmtBtc(totalBtc)} BTC` },
          ].map(({ icon: Icon, label, value, color, sub }) => (
            <div key={label} className="bg-white rounded-2xl shadow p-5 border-l-4" style={{ borderColor: color }}>
              <div className="flex items-center gap-3 mb-2"><Icon size={28} style={{ color }} /><p className="text-gray-600 text-sm font-semibold">{label}</p></div>
              <p className="text-3xl font-black text-slate-900">{value}</p>
              {sub && <p className="text-sm text-gray-500 mt-1 font-medium">{sub}</p>}
            </div>
          ))}
        </div>

        {/* OPEN DISPUTES */}
        <div className="bg-white rounded-2xl shadow p-6 mb-8">
          <h2 className="text-2xl font-black mb-6" style={{ color: PRAQEN.primary }}>🚨 Open Disputes ({openDisputes.length})</h2>
          {openDisputes.length === 0 ? (
            <div className="text-center py-12"><CheckCircle size={48} className="mx-auto mb-3 text-green-400" /><p className="text-lg font-bold text-gray-500">No open disputes — all clear!</p></div>
          ) : (
            <div className="space-y-4">
              {openDisputes.map(d => (
                <div key={d.id} className="border border-red-200 bg-red-50 rounded-lg p-4 hover:shadow-md transition">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                        <span className="font-black text-sm text-red-700">DISPUTED</span>
                        <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs font-semibold">
                          #{(d.trade_id || d.id || '').slice(0, 8).toUpperCase()}
                        </span>
                        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-semibold">{fmtAge(d.created_at)}</span>
                      </div>
                      {/* Reason */}
                      <p className="font-bold text-slate-900 mb-2">{d.reason || 'User opened a dispute'}</p>
                      {/* Key info inline */}
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                        <span><strong>BTC:</strong> ₿{fmtBtc(d.trade_details?.amount_btc)}</span>
                        <span><strong>USD:</strong> {fmtUsd(d.trade_details?.amount_usd)}</span>
                        {d.trade_details?.payment_method && <span><strong>Payment:</strong> {d.trade_details.payment_method}</span>}
                        <span className="flex items-center gap-1">
                          <User size={12} /><strong>Buyer:</strong> {d.buyer?.username || 'Unknown'}
                          {d.buyer?.total_trades !== undefined && <span className="text-gray-400">({d.buyer.total_trades} trades)</span>}
                        </span>
                        <span className="flex items-center gap-1">
                          <User size={12} /><strong>Seller:</strong> {d.seller?.username || 'Unknown'}
                          {d.seller?.total_trades !== undefined && <span className="text-gray-400">({d.seller.total_trades} trades)</span>}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedDispute(d); setActiveTab('details'); setModeratorJoined(false); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold text-sm hover:opacity-90 transition flex-shrink-0"
                      style={{ backgroundColor: PRAQEN.purple }}>
                      <Eye size={16} /> Review & Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* IN REVIEW */}
        <div className="bg-white rounded-2xl shadow p-6 mb-8">
          <h2 className="text-2xl font-black mb-6" style={{ color: PRAQEN.primary }}>⏳ In Review ({inReviewDisputes.length})</h2>
          {inReviewDisputes.length === 0 ? (
            <p className="text-center text-gray-500 py-8 font-semibold">No disputes currently in review.</p>
          ) : (
            <div className="space-y-4">
              {inReviewDisputes.map(d => (
                <div key={d.id} className="border border-yellow-300 bg-yellow-50 rounded-lg p-4 hover:shadow-md transition">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-semibold">IN REVIEW</span>
                        <span className="text-xs font-mono text-gray-500">#{(d.trade_id || d.id || '').slice(0, 8).toUpperCase()}</span>
                        <span className="text-xs text-gray-400">{fmtAge(d.created_at)}</span>
                      </div>
                      <p className="font-bold text-slate-900 mb-2">{d.reason || 'Dispute under review'}</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                        <span><strong>BTC:</strong> ₿{fmtBtc(d.trade_details?.amount_btc)}</span>
                        <span><strong>USD:</strong> {fmtUsd(d.trade_details?.amount_usd)}</span>
                        <span className="flex items-center gap-1"><User size={12} /><strong>Buyer:</strong> {d.buyer?.username || '—'} <span className="text-gray-400">({d.buyer?.total_trades || 0} trades · {parseFloat(d.buyer?.completion_rate || 0).toFixed(1)}%)</span></span>
                        <span className="flex items-center gap-1"><User size={12} /><strong>Seller:</strong> {d.seller?.username || '—'} <span className="text-gray-400">({d.seller?.total_trades || 0} trades · {parseFloat(d.seller?.completion_rate || 0).toFixed(1)}%)</span></span>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedDispute(d); setActiveTab('details'); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold text-sm hover:opacity-90 flex-shrink-0"
                      style={{ backgroundColor: PRAQEN.warning }}>
                      <Eye size={16} /> Continue Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RESOLVED DISPUTES */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-2xl font-black mb-4" style={{ color: PRAQEN.primary }}>✅ Resolved Disputes ({resolved.length})</h2>
          {resolved.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-6 p-4 rounded-xl bg-green-50 border border-green-200">
              {[
                { lbl: 'Total Resolved', val: resolved.length, color: PRAQEN.success },
                { lbl: 'BTC Handled',    val: `₿ ${fmtBtc(totalBtc)}`, color: '#D97706' },
                { lbl: 'USD Volume',     val: fmtUsd(totalUsd), color: PRAQEN.info },
              ].map(({ lbl, val, color }) => (
                <div key={lbl} className="text-center">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">{lbl}</p>
                  <p className="text-xl font-black" style={{ color }}>{val}</p>
                </div>
              ))}
            </div>
          )}
          {resolved.length === 0 ? (
            <p className="text-center text-gray-500 py-8 font-semibold">No resolved disputes yet.</p>
          ) : (
            <div className="space-y-5">
              {resolved.map(d => {
                const res = d.resolution || d.dispute_resolution;
                const btcAmt = parseFloat(d.amount_btc || d.trade_details?.amount_btc || 0);
                const usdAmt = parseFloat(d.amount_usd || d.trade_details?.amount_usd || 0);
                const resolver = d.resolved_by_name || (d.resolved_by === user?.id ? modName : null) || 'PRAQEN Moderator';
                const resColor = res === 'BUYER_WINS' ? PRAQEN.success : res === 'SELLER_WINS' ? PRAQEN.info : PRAQEN.danger;
                return (
                  <div key={d.id} className="border-2 rounded-2xl overflow-hidden" style={{ borderColor: resColor }}>
                    <div className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ backgroundColor: res === 'BUYER_WINS' ? '#ECFDF5' : res === 'SELLER_WINS' ? '#EFF6FF' : '#FEF2F2' }}>
                      {getResBadge(res)}
                      <span className="text-sm font-mono text-gray-500">#{(d.trade_id || d.id || '').slice(0, 8).toUpperCase()}</span>
                      <span className="ml-auto text-sm font-bold text-gray-500">Resolved {fmtAge(d.resolved_at || d.updated_at)}</span>
                    </div>
                    <div className="p-5">
                      <p className="text-base font-black text-slate-900 mb-4">{d.reason || d.dispute_reason || 'Dispute resolved'}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {[
                          { lbl: 'BTC Traded', val: `₿ ${fmtBtc(btcAmt)}`, c: '#D97706' },
                          { lbl: 'USD Value',  val: fmtUsd(usdAmt),         c: PRAQEN.success },
                          { lbl: 'Buyer',      val: d.buyer?.username || '—', c: PRAQEN.primary },
                          { lbl: 'Seller',     val: d.seller?.username || '—', c: PRAQEN.info },
                        ].map(({ lbl, val, c }) => (
                          <div key={lbl} className="p-3 rounded-xl border text-center bg-gray-50">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">{lbl}</p>
                            <p className="text-sm font-black" style={{ color: c }}>{val}</p>
                          </div>
                        ))}
                      </div>
                      <div className="grid md:grid-cols-2 gap-3 mb-4">
                        {[{ u: d.buyer, role: 'BUYER', color: PRAQEN.primary }, { u: d.seller, role: 'SELLER', color: PRAQEN.info }].map(({ u, role, color }) => (
                          <div key={role} className="bg-gray-50 p-4 rounded-xl border">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-sm" style={{ backgroundColor: color }}>{(u?.username || role)[0].toUpperCase()}</div>
                              <p className="font-black text-sm text-slate-900">{u?.username || '—'}</p>
                              <span className="text-xs font-black px-2 py-0.5 rounded-full text-white ml-1" style={{ backgroundColor: color }}>{role}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              {[{ lbl: 'Trades', val: u?.total_trades || 0 }, { lbl: 'Completion', val: `${parseFloat(u?.completion_rate || 0).toFixed(1)}%` }, { lbl: 'Rating', val: `${parseFloat(u?.average_rating || 0).toFixed(1)}★` }].map(({ lbl, val }) => (
                                <div key={lbl} className="bg-white p-2 rounded-lg border"><p className="text-xs text-gray-400 font-semibold">{lbl}</p><p className="text-sm font-black" style={{ color }}>{val}</p></div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 border border-purple-200 mb-3">
                        <div className="flex items-center gap-2">
                          <Shield size={16} style={{ color: PRAQEN.purple }} />
                          <div>
                            <p className="text-sm font-black" style={{ color: PRAQEN.purple }}>Resolved by: {resolver}</p>
                            <p className="text-xs text-gray-500">{formatDate(d.resolved_at || d.updated_at)}</p>
                          </div>
                        </div>
                        {getResBadge(res)}
                      </div>
                      {(d.resolution_notes || d.dispute_notes) && (
                        <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                          <p className="text-sm font-black text-purple-800 mb-1">📝 Moderator Notes</p>
                          <p className="text-sm text-purple-700 leading-relaxed">{d.resolution_notes || d.dispute_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* DISPUTE REVIEW MODAL */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-2xl font-black" style={{ color: PRAQEN.primary }}>👨‍⚖️ Dispute Review</h2>
                <p className="text-sm font-semibold text-gray-500">Trade #{(selectedDispute.trade_id || selectedDispute.id || '').slice(0, 8).toUpperCase()}</p>
              </div>
              <button onClick={() => setSelectedDispute(null)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <div className="border-b px-6 flex gap-1 overflow-x-auto bg-gray-50">
              {[{ id: 'details', l: '📋 Details' }, { id: 'user-history', l: '👥 User History' }, { id: 'evidence', l: `📎 Evidence (${images.length})` }, { id: 'chat', l: '💬 Live Chat' }, { id: 'resolve', l: '⚖️ Resolve' }].map(({ id, l }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`py-3 px-4 text-sm font-bold whitespace-nowrap border-b-2 transition ${activeTab === id ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{l}</button>
              ))}
            </div>
            <div className="p-6">

              {activeTab === 'details' && (
                <div className="space-y-5">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <h3 className="font-black text-red-800 mb-2 flex items-center gap-2 text-base"><AlertTriangle size={18} /> Dispute Reason</h3>
                    <p className="text-base font-bold text-red-700">{selectedDispute.reason || 'No reason provided'}</p>
                    <p className="text-sm text-red-500 mt-1 font-semibold">Opened: {formatDate(selectedDispute.created_at)}</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-5">
                    {[
                      { title: 'Trade Information', icon: DollarSign, rows: [{ l: 'BTC Amount', v: `₿ ${fmtBtc(selectedDispute.trade_details?.amount_btc)}` }, { l: 'USD Amount', v: fmtUsd(selectedDispute.trade_details?.amount_usd) }, { l: 'Status', v: selectedDispute.trade_details?.status || 'DISPUTED' }, { l: 'Started', v: formatDate(selectedDispute.trade_details?.created_at) }] },
                      { title: 'Payment Info', icon: CreditCard, rows: [{ l: 'Method', v: selectedDispute.trade_details?.payment_method || '—' }, { l: 'Buyer Confirmed', v: selectedDispute.trade_details?.buyer_confirmed ? '✅ Yes' : '⏳ No' }, { l: 'Payment Sent At', v: formatDate(selectedDispute.trade_details?.buyer_confirmed_at) }] },
                    ].map(({ title, icon: Icon, rows }) => (
                      <div key={title} className="bg-gray-50 rounded-xl p-4 border">
                        <h3 className="font-black text-gray-800 mb-3 flex items-center gap-2"><Icon size={16} /> {title}</h3>
                        {rows.map(({ l, v }) => (
                          <div key={l} className="flex justify-between py-2 border-b last:border-0 text-sm">
                            <span className="font-bold text-gray-600">{l}</span><span className="font-black text-slate-900">{v}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="font-black text-blue-800 mb-2 flex items-center gap-2"><Shield size={16} /> Escrow Status</h3>
                    <p className="text-base font-bold text-blue-700">🔒 ₿{fmtBtc(selectedDispute.trade_details?.amount_btc)} locked in escrow. Awaiting your decision.</p>
                  </div>
                </div>
              )}

              {activeTab === 'user-history' && (
                <div className="space-y-5">
                  {[
                    { stats: buyerStats, reviews: buyerReviews, d: selectedDispute.buyer, role: 'Buyer', color: PRAQEN.primary, bg: 'bg-green-50' },
                    { stats: sellerStats, reviews: sellerReviews, d: selectedDispute.seller, role: 'Seller', color: PRAQEN.info, bg: 'bg-blue-50' },
                  ].map(({ stats, reviews, d, role, color, bg }) => (
                    <div key={role} className={`${bg} rounded-xl p-5 border`}>
                      <h3 className="font-black text-lg mb-4" style={{ color }}>{role}: {d?.username || 'Unknown'}</h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl p-4 border">
                          <p className="font-black text-sm mb-3 text-gray-700">📊 Trade Stats</p>
                          {[{ l: 'Total Trades', v: stats?.total_trades || 0 }, { l: 'Completion Rate', v: `${parseFloat(stats?.completion_rate || 0).toFixed(1)}%` }, { l: 'Rating', v: <span className="flex items-center gap-1">{getRatingStars(stats?.average_rating)}<span className="font-black ml-1">{parseFloat(stats?.average_rating || 0).toFixed(1)}/5</span></span> }, { l: 'Member Since', v: formatDate(stats?.created_at)?.split(',')[0] || '—' }].map(({ l, v }) => (
                            <div key={l} className="flex justify-between py-2 border-b last:border-0 text-sm"><span className="font-bold text-gray-600">{l}</span><span className="font-black text-slate-900">{v}</span></div>
                          ))}
                        </div>
                        <div className="bg-white rounded-xl p-4 border">
                          <p className="font-black text-sm mb-3 text-gray-700">💬 Recent Feedback</p>
                          {reviews.length === 0 ? <p className="text-sm text-gray-500 font-semibold">No feedback yet</p> :
                            reviews.slice(0, 3).map((rv, i) => (
                              <div key={i} className="border-b py-2 last:border-0">
                                <div className="flex gap-0.5 mb-1">{getRatingStars(rv.rating)}</div>
                                <p className="text-xs text-gray-600 font-medium">{rv.comment?.substring(0, 80)}…</p>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'evidence' && (
                images.length === 0 ? (
                  <div className="text-center py-16"><Image size={48} className="mx-auto mb-3 text-gray-300" /><p className="text-lg font-bold text-gray-500">No evidence uploaded yet</p></div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {images.map((img, i) => (
                      <div key={i} className="border-2 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition" onClick={() => setSelectedEvidence(img)}>
                        <img src={img.image_url || img.url} alt={`Evidence ${i + 1}`} className="w-full h-48 object-cover" />
                        <div className="p-3 bg-gray-50">
                          <p className="text-sm font-bold text-gray-700">📎 {img.user_id === selectedDispute.buyer?.id ? 'Buyer' : 'Seller'}</p>
                          <p className="text-xs text-gray-500">{formatDate(img.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeTab === 'chat' && (
                <div className="flex flex-col h-[500px]">
                  {!moderatorJoined && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-4 text-center">
                      <Shield size={32} className="mx-auto mb-2 text-purple-600" />
                      <p className="font-black text-purple-800 mb-3">Join the chat — messages appear with a 👨‍⚖️ MODERATOR badge to both parties</p>
                      <button onClick={moderatorJoinChat} className="px-6 py-2.5 rounded-xl text-white font-black text-sm" style={{ backgroundColor: PRAQEN.purple }}>👨‍⚖️ Join Dispute Chat</button>
                    </div>
                  )}
                  {moderatorJoined && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl mb-3 bg-purple-50 border border-purple-200">
                      <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                      <p className="text-sm font-bold text-purple-700">You are in this chat as MODERATOR</p>
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto space-y-3 bg-gray-50 rounded-xl p-4 border">
                    {chatMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full"><MessageCircle size={40} className="mb-2 text-gray-300" /><p className="text-gray-400 font-semibold">No messages yet</p></div>
                    ) : chatMessages.map((m, i) => {
                      const isMod = m.sender_role === 'moderator' || (m.message_text || m.message || '').startsWith('[MODERATOR]');
                      const isSys = !m.sender_id || m.message_type === 'SYSTEM' || m.sender_role === 'system';
                      const isBuyer = m.sender_id === selectedDispute.buyer?.id;
                      const text = (m.message_text || m.message || '').replace(/^\[MODERATOR\]\s*/, '');
                      if (isSys) return <div key={i} className="flex justify-center"><div className="bg-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium max-w-[85%] text-center">{text}</div></div>;
                      if (isMod) return (
                        <div key={i} className="flex justify-center">
                          <div className="max-w-[85%] w-full rounded-xl overflow-hidden border-2 border-purple-400 shadow">
                            <div className="flex items-center gap-2 px-4 py-2 bg-purple-600">
                              <Shield size={13} className="text-white" />
                              <span className="text-sm font-black text-white">👨‍⚖️ MODERATOR · {modName}</span>
                              <span className="ml-auto text-xs text-white/60">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="px-4 py-3 bg-purple-50"><p className="text-sm font-semibold text-purple-900">{text}</p></div>
                          </div>
                        </div>
                      );
                      return (
                        <div key={i} className={`flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[70%] px-4 py-3 rounded-2xl border ${isBuyer ? 'bg-white border-gray-200' : 'bg-green-50 border-green-200'}`}>
                            <p className="text-xs font-black mb-1" style={{ color: isBuyer ? PRAQEN.primary : PRAQEN.info }}>{isBuyer ? '👤 Buyer' : '🛒 Seller'}</p>
                            <p className="text-sm font-medium text-slate-800 break-words">{text}</p>
                            <p className="text-xs text-gray-400 mt-1 text-right">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>
                  {moderatorJoined && (
                    <form onSubmit={sendMessage} className="flex gap-2 mt-3">
                      <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type as Moderator — visible to both parties…"
                        className="flex-1 px-4 py-3 border-2 rounded-xl text-sm font-medium focus:outline-none"
                        style={{ borderColor: newMessage ? PRAQEN.purple : '#e5e7eb' }} />
                      <button type="submit" disabled={sendingMessage || !newMessage.trim()} className="px-5 py-3 rounded-xl text-white font-black text-sm flex items-center gap-2 disabled:opacity-40" style={{ backgroundColor: PRAQEN.purple }}>
                        {sendingMessage ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />} Send
                      </button>
                    </form>
                  )}
                </div>
              )}

              {activeTab === 'resolve' && (
                <div className="space-y-5">
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h3 className="font-black text-purple-800 mb-3 flex items-center gap-2 text-base"><Shield size={18} /> Before Making Your Decision</h3>
                    <ul className="space-y-1.5">
                      {['✅ Review all uploaded evidence', '💬 Read the full chat history', '👥 Check both user profiles', '📊 Confirm BTC amount and payment details', '📝 Write clear notes explaining your decision'].map(p => <li key={p} className="text-sm font-semibold text-purple-700">{p}</li>)}
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-xl border">
                    {[
                      { lbl: 'BTC at Stake', val: `₿ ${fmtBtc(selectedDispute.trade_details?.amount_btc)}`, c: '#D97706' },
                      { lbl: 'USD Value', val: fmtUsd(selectedDispute.trade_details?.amount_usd), c: PRAQEN.success },
                      { lbl: 'Buyer', val: selectedDispute.buyer?.username || '—', c: PRAQEN.primary },
                      { lbl: 'Seller', val: selectedDispute.seller?.username || '—', c: PRAQEN.info },
                    ].map(({ lbl, val, c }) => (
                      <div key={lbl} className="text-center bg-white p-3 rounded-xl border">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">{lbl}</p>
                        <p className="text-base font-black" style={{ color: c }}>{val}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-base font-black text-gray-800 mb-2">📝 Moderator Decision Notes <span className="text-red-500">*</span></label>
                    <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} rows={5}
                      placeholder="Write your full reasoning here. This will be shown to both parties and permanently recorded…"
                      className="w-full px-4 py-3 border-2 rounded-xl text-sm font-medium focus:outline-none resize-none"
                      style={{ borderColor: resolutionNotes ? PRAQEN.purple : '#e5e7eb' }} />
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    {[
                      { label: '✅ Buyer Wins', sub: 'Release BTC to buyer', decision: 'BUYER_WINS', color: PRAQEN.success, bg: '#ECFDF5' },
                      { label: '✅ Seller Wins', sub: 'Return BTC to seller', decision: 'SELLER_WINS', color: PRAQEN.info, bg: '#EFF6FF' },
                      { label: '❌ Cancel Trade', sub: 'Refund escrow to seller', decision: 'CANCEL', color: PRAQEN.danger, bg: '#FEF2F2' },
                    ].map(({ label, sub, decision, color, bg }) => (
                      <button key={decision} onClick={() => resolveDispute(selectedDispute.id, decision)} disabled={submitting || !resolutionNotes.trim()}
                        className="p-5 rounded-2xl border-2 text-left hover:shadow-lg transition disabled:opacity-40"
                        style={{ backgroundColor: bg, borderColor: color }}>
                        <p className="font-black text-lg mb-1" style={{ color }}>{label}</p>
                        <p className="text-sm font-semibold" style={{ color }}>{sub}</p>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-start gap-2 p-4 rounded-xl bg-yellow-50 border border-yellow-200">
                    <AlertTriangle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-yellow-700">This decision is final and cannot be reversed. Both parties will be notified immediately.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedEvidence && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4" onClick={() => setSelectedEvidence(null)}>
          <img src={selectedEvidence.image_url || selectedEvidence.url} alt="Evidence" className="max-w-full max-h-screen object-contain rounded-xl" />
          <button onClick={() => setSelectedEvidence(null)} className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg"><X size={20} /></button>
        </div>
      )}
    </div>
  );
}
