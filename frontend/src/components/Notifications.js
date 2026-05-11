import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Bell, X, CheckCheck, ArrowRight, Bitcoin,
  Shield, AlertTriangle, Megaphone, Gift, Zap,
  Clock, CheckCircle, XCircle, ShoppingBag,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', mist:'#F0FAF5',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', warn:'#F59E0B', paid:'#3B82F6',
  purple:'#8B5CF6', amber:'#D97706',
};

const CUR_SYM = {GHS:'₵',NGN:'₦',KES:'KSh',ZAR:'R',USD:'$',GBP:'£',EUR:'€',UGX:'USh',TZS:'TSh',XAF:'CFA',XOF:'CFA'};
const fmt    = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n||0);
const fmtBtc = n => parseFloat(n||0).toFixed(6);

const flag = c =>
  !c || c.length !== 2 ? '🌍' :
  c.toUpperCase().replace(/./g, ch => String.fromCodePoint(0x1F1E0 + ch.charCodeAt(0) - 65));

const relTime = d => {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1)   return 'Just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-US', { day:'numeric', month:'short' });
};

const absTime = d =>
  !d ? '' : new Date(d).toLocaleString('en-US', {
    day:'numeric', month:'short', hour:'2-digit', minute:'2-digit',
  });

// ─── User Avatar ──────────────────────────────────────────────────────────────
function UserAvatar({ user, size = 38, bgColor }) {
  const [err, setErr] = useState(false);
  const name = user?.username || user?.full_name || '?';
  const initial = name.charAt(0).toUpperCase();
  const bg = bgColor || C.green;

  if (user?.avatar_url && !err) {
    const src = user.avatar_url.startsWith('/') ? `${API_URL}${user.avatar_url}` : user.avatar_url;
    return (
      <img src={src} onError={() => setErr(true)} alt={name}
        style={{ width: size, height: size, borderRadius: size * 0.28, objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      backgroundColor: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, color: '#fff', fontSize: size * 0.42,
    }}>
      {initial}
    </div>
  );
}

// ─── Completed trade card ─────────────────────────────────────────────────────
function CompletedCard({ n, trade, userId, onNavigate }) {
  const isBuyer = String(userId) === String(trade.buyer_id);
  const local   = trade.amount_local || trade.local_amount || 0;
  const cur     = trade.local_currency || trade.currency || 'USD';
  const sym     = CUR_SYM[cur] || '';
  const btc     = fmtBtc(trade.amount_btc);
  const pm      = trade.payment_method || '—';
  const cp      = isBuyer ? trade.seller : trade.buyer;
  const cpName  = cp?.username || 'Trader';
  const cpCountry = cp?.country || '';

  return (
    <button onClick={() => onNavigate(n)}
      className="w-full text-left transition hover:brightness-[0.97]"
      style={{
        borderBottom: `1px solid ${C.g100}`,
        backgroundColor: !n.is_read ? '#F0FDF4' : '#fff',
        borderLeft: `3px solid ${C.success}`,
        display: 'block', padding: 0,
      }}>

      {/* Top accent bar */}
      <div style={{
        background: `linear-gradient(90deg,${C.green},${C.mint})`,
        padding: '5px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={11} color="#fff" />
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Trade Complete
          </span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 700 }}>
          {absTime(trade.completed_at || n.created_at)}
        </span>
      </div>

      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Avatar + flag */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <UserAvatar user={cp} size={40} bgColor={C.mint} />
            {cpCountry && (
              <span style={{
                position: 'absolute', bottom: -2, right: -4,
                fontSize: 12, lineHeight: 1,
              }}>{flag(cpCountry)}</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name + time */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontWeight: 900, fontSize: 13, color: C.g800 }}>{cpName}</span>
              <span style={{ fontSize: 10, color: C.g400, fontWeight: 700 }}>{relTime(trade.completed_at || n.created_at)}</span>
            </div>
            <p style={{ fontSize: 11, color: C.g600, fontWeight: 600, marginBottom: 7 }}>
              {isBuyer ? 'You bought Bitcoin successfully 🎉' : 'You sold Bitcoin successfully ✅'}
            </p>

            {/* Trade summary chips */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8,
            }}>
              <span style={{ background: `${C.success}12`, color: C.success, borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 900, border: `1px solid ${C.success}30` }}>
                {sym}{fmt(local)} {cur}
              </span>
              <span style={{ background: `${C.gold}15`, color: C.amber, borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 900, border: `1px solid ${C.gold}40` }}>
                ₿ {btc}
              </span>
              <span style={{ background: C.g100, color: C.g600, borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 700 }}>
                {pm}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: C.g400, fontWeight: 700 }}>
                #{String(trade.id).slice(0,8).toUpperCase()}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, color: C.green }}>
                View trade <ArrowRight size={10} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Active trade card ────────────────────────────────────────────────────────
function TradeCard({ n, trade, userId, onNavigate }) {
  const isBuyer   = String(userId) === String(trade.buyer_id);
  const cp        = isBuyer ? trade.seller : trade.buyer;
  const cpName    = cp?.username || 'Trader';
  const cpCountry = cp?.country || '';

  const local = trade.amount_local || trade.local_amount || 0;
  const cur   = trade.local_currency || trade.currency || 'USD';
  const sym   = CUR_SYM[cur] || '';
  const btc   = fmtBtc(trade.amount_btc);
  const pm    = trade.payment_method || '—';
  const tradeIdShort = String(trade.id || '').slice(0, 8).toUpperCase();

  const STATUS = {
    CREATED:      { dot: C.success, label: 'Escrow Active',  bg: `${C.success}12` },
    FUNDS_LOCKED: { dot: C.success, label: 'Escrow Active',  bg: `${C.success}12` },
    PAYMENT_SENT: { dot: C.paid,    label: 'Payment Sent',   bg: `${C.paid}12`    },
    PAID:         { dot: C.paid,    label: 'Payment Sent',   bg: `${C.paid}12`    },
    DISPUTED:     { dot: C.danger,  label: 'Disputed 🚨',    bg: `${C.danger}10`  },
  };
  const st = STATUS[(trade.status||'').toUpperCase()] || STATUS.CREATED;

  const accentColor = trade.status === 'PAYMENT_SENT' || trade.status === 'PAID' ? C.paid
    : trade.status === 'DISPUTED' ? C.danger : C.green;

  return (
    <button onClick={() => onNavigate(n)}
      className="w-full text-left transition hover:brightness-[0.97]"
      style={{
        borderBottom: `1px solid ${C.g100}`,
        backgroundColor: !n.is_read ? '#EFF6FF' : '#fff',
        borderLeft: `3px solid ${accentColor}`,
        display: 'block', padding: 0,
      }}>

      <div style={{ padding: '11px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>

          {/* Avatar + flag */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <UserAvatar user={cp} size={42} bgColor={C.forest} />
            {cpCountry && (
              <span style={{
                position: 'absolute', bottom: -3, right: -5, fontSize: 13, lineHeight: 1,
              }}>{flag(cpCountry)}</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 900, fontSize: 13, color: C.g800 }}>{cpName}</span>
                {cpCountry && (
                  <span style={{ fontSize: 10, color: C.g400, fontWeight: 700 }}>{cpCountry}</span>
                )}
              </div>
              <span style={{ fontSize: 10, color: C.g400, fontWeight: 700, flexShrink: 0 }}>
                {relTime(n.created_at)}
              </span>
            </div>

            {/* What they want */}
            <p style={{ fontSize: 11, color: C.g600, fontWeight: 600, marginBottom: 7 }}>
              {isBuyer
                ? `You started a trade with ${cpName}`
                : `${cpName} wants to trade with you`}
            </p>

            {/* Trade detail chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              <span style={{ background: `${C.forest}12`, color: C.forest, borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 900, border: `1px solid ${C.forest}25` }}>
                {sym}{fmt(local)} {cur}
              </span>
              <span style={{ background: `${C.gold}15`, color: C.amber, borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 900, border: `1px solid ${C.gold}40` }}>
                ₿ {btc}
              </span>
              <span style={{ background: C.g100, color: C.g600, borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 700 }}>
                {pm}
              </span>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: C.g400, fontWeight: 700 }}>#{tradeIdShort}</span>
                <span style={{
                  fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em',
                  padding: '2px 7px', borderRadius: 20,
                  backgroundColor: st.bg, color: st.dot,
                }}>
                  ● {st.label}
                </span>
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, color: accentColor }}>
                Open trade <ArrowRight size={10} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── System / broadcast / generic card ───────────────────────────────────────
function BasicCard({ n, onNavigate }) {
  // Detect notification category
  const title = (n.title || '').toLowerCase();
  const isExpired    = /expir/i.test(title);
  const isCancelled  = /cancel/i.test(title);
  const isNewTrade   = /new trade|trade request/i.test(title);
  const isDispute    = /disput/i.test(title);
  const isBroadcast  = n.type === 'update' || n.type === 'broadcast' || (!n.trade && !isExpired && !isCancelled && !isNewTrade && !isDispute);
  const isPayment    = /payment|paid/i.test(title);

  // Visual config per type
  let Icon, accent, bg, iconBg, badgeLabel;
  if (isExpired)   { Icon = Clock;         accent = C.warn;    bg = '#FFFBEB'; iconBg = `${C.warn}18`;    badgeLabel = 'Expired'; }
  else if (isCancelled){ Icon = XCircle;   accent = C.danger;  bg = '#FEF2F2'; iconBg = `${C.danger}15`;  badgeLabel = 'Cancelled'; }
  else if (isNewTrade){ Icon = ShoppingBag;accent = C.paid;    bg = '#EFF6FF'; iconBg = `${C.paid}15`;    badgeLabel = 'New Request'; }
  else if (isDispute){ Icon = AlertTriangle;accent='#7C3AED';  bg = '#F5F3FF'; iconBg = '#EDE9FE';         badgeLabel = 'Dispute'; }
  else if (isPayment){ Icon = CheckCircle; accent = C.success; bg = '#F0FDF4'; iconBg = `${C.success}15`; badgeLabel = 'Payment'; }
  else if (isBroadcast){ Icon = Megaphone; accent = C.green;   bg = C.mist;   iconBg = `${C.mint}18`;     badgeLabel = 'PRAQEN'; }
  else               { Icon = Bell;        accent = C.g400;    bg = '#fff';   iconBg = C.g100;             badgeLabel = 'Info'; }

  // Extract trade ID from message if present
  const tradeIdMatch = (n.message || '').match(/trade\s*#?([A-F0-9]{6,8})/i);
  const tradeId = tradeIdMatch ? tradeIdMatch[1].toUpperCase() : null;

  // Truncate long broadcast messages
  const msg = n.message || '';
  const shortMsg = msg.length > 120 ? msg.slice(0, 117) + '…' : msg;

  return (
    <button onClick={() => onNavigate(n)}
      className="w-full text-left transition hover:brightness-[0.97]"
      style={{
        borderBottom: `1px solid ${C.g100}`,
        backgroundColor: !n.is_read ? bg : '#fff',
        borderLeft: `3px solid ${accent}`,
        display: 'block', padding: 0,
      }}>

      <div style={{ padding: '11px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>

          {/* Icon circle */}
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            backgroundColor: iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${accent}25`,
          }}>
            <Icon size={18} style={{ color: accent }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                <span style={{ fontWeight: 900, fontSize: 12.5, color: C.g800, lineHeight: 1.2 }}>{n.title}</span>
                <span style={{
                  fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em',
                  padding: '1px 7px', borderRadius: 20,
                  backgroundColor: `${accent}15`, color: accent,
                  border: `1px solid ${accent}30`, flexShrink: 0,
                }}>{badgeLabel}</span>
              </div>
              <span style={{ fontSize: 10, color: C.g400, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {relTime(n.created_at)}
              </span>
            </div>

            {/* Trade ID pill */}
            {tradeId && (
              <span style={{
                display: 'inline-block', marginBottom: 5,
                fontSize: 10, fontWeight: 900, fontFamily: 'monospace',
                padding: '2px 8px', borderRadius: 6,
                backgroundColor: `${accent}10`, color: accent,
                border: `1px solid ${accent}25`,
              }}>
                #{tradeId}
              </span>
            )}

            {/* Message body */}
            <p style={{ fontSize: 11, color: C.g600, lineHeight: 1.55, fontWeight: 500, marginBottom: 6 }}>
              {shortMsg}
            </p>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: C.g400, fontWeight: 600 }}>
                {absTime(n.created_at)}
              </span>
              {n.action && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, color: accent }}>
                  {isBroadcast ? 'Read more' : 'View details'} <ArrowRight size={10} />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
function NotifCard({ n, userId, onNavigate }) {
  const trade = n.trade;
  if (trade && trade.status === 'COMPLETED') return <CompletedCard n={n} trade={trade} userId={userId} onNavigate={onNavigate} />;
  if (trade) return <TradeCard n={n} trade={trade} userId={userId} onNavigate={onNavigate} />;
  return <BasicCard n={n} onNavigate={onNavigate} />;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function Notifications({ user }) {
  const navigate = useNavigate();
  const ref      = useRef(null);
  const [notifs,   setNotifs]   = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const unread = notifs.filter(n => !n.is_read).length;
  const token  = () => localStorage.getItem('token');
  const hdrs   = () => ({ Authorization: `Bearer ${token()}` });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/notifications`, { headers: hdrs() });
      setNotifs(r.data.notifications || []);
    } catch { /* keep previous state */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [user]);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const markRead = async id => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    try { await axios.put(`${API_URL}/notifications/${id}/read`, {}, { headers: hdrs() }); } catch {}
  };

  const markAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    try { await axios.put(`${API_URL}/notifications/read-all`, {}, { headers: hdrs() }); } catch {}
  };

  const handleClick = n => {
    if (!n.is_read) markRead(n.id);
    if (n.action) navigate(n.action);
    setShowDrop(false);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>

      {/* ── Bell button ── */}
      <button
        onClick={() => { setShowDrop(v => !v); if (!showDrop) load(); }}
        className="relative p-2 rounded-xl transition hover:bg-gray-100"
        aria-label="Notifications">
        <Bell size={20} style={{ color: C.forest }} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-xs font-black flex items-center justify-center animate-pulse"
            style={{ backgroundColor: C.danger }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown ── */}
      {showDrop && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-2xl shadow-2xl border overflow-hidden z-50"
          style={{
            borderColor: C.g200,
            display: 'flex', flexDirection: 'column',
            width: 'min(420px, calc(100vw - 16px))',
            maxHeight: '82vh',
          }}>

          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg,${C.forest},${C.mint})`,
            padding: '12px 16px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={15} color="#fff" />
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 14 }}>Notifications</span>
              {unread > 0 && (
                <span style={{
                  backgroundColor: '#fff', color: C.forest,
                  fontWeight: 900, fontSize: 11,
                  padding: '1px 8px', borderRadius: 20,
                }}>
                  {unread} new
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {unread > 0 && (
                <button onClick={markAllRead}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button onClick={() => setShowDrop(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && notifs.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: `2px solid ${C.mint}`, borderTopColor: 'transparent',
                  animation: 'spin 0.8s linear infinite', marginBottom: 8,
                }} />
                <p style={{ fontSize: 12, color: C.g400 }}>Loading…</p>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : notifs.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: C.mist, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Bell size={24} style={{ color: C.g400 }} />
                </div>
                <p style={{ fontWeight: 900, fontSize: 14, color: C.g800, marginBottom: 4 }}>All caught up!</p>
                <p style={{ fontSize: 12, color: C.g400 }}>
                  We'll notify you when a trade comes in or payment is confirmed.
                </p>
              </div>
            ) : (
              notifs.map(n => (
                <NotifCard key={n.id} n={n} userId={user?.id} onNavigate={handleClick} />
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 16px', borderTop: `1px solid ${C.g100}`,
            backgroundColor: C.g50, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <p style={{ fontSize: 11, color: C.g400 }}>
              {notifs.length} notification{notifs.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => { setShowDrop(false); navigate('/my-trades'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, color: C.green, background: 'none', border: 'none', cursor: 'pointer' }}>
              View my trades <ArrowRight size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
