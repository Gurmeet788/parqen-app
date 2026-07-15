import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, Clock, ArrowRight, X, Repeat2 } from 'lucide-react';
import axios from 'axios';
import CountryFlag from './CountryFlag';
import { deriveBadge } from '../lib/badge';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const STATUS_CFG = {
  CREATED:      { label: '⏳ Waiting for Escrow', statusColor: '#D97706', statusBg: '#FEF3C7' },
  FUNDS_LOCKED: { label: '✅ Active & Funded',     statusColor: '#16A34A', statusBg: '#DCFCE7' },
  PAYMENT_SENT: { label: '💳 Payment Sent',        statusColor: '#2563EB', statusBg: '#DBEAFE' },
  DISPUTED:     { label: '⚠️ In Dispute',          statusColor: '#DC2626', statusBg: '#FEE2E2' },
};

// What market / page this trade belongs to
function getMarketInfo(listingType) {
  const t = (listingType || '').toUpperCase();
  if (t === 'SELL')                              return { label: 'SELL TRADE',  color: '#D97706', bg: '#FEF3C7' };
  if (t === 'BUY')                               return { label: 'BUY TRADE',   color: '#1B4332', bg: '#DCFCE7' };
  if (t === 'BUY_GIFT_CARD' || t === 'SELL_GIFT_CARD') return { label: 'GIFT CARD',   color: '#0D9488', bg: '#CCFBF1' };
  return { label: 'TRADE', color: '#475569', bg: '#F1F5F9' };
}

function getMyId() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1])).userId || null;
  } catch { return null; }
}

// Sanitize time limit: if > 1440 (24h in minutes) it was stored as seconds — convert
function sanitizeLimitMins(raw) {
  const n = parseInt(raw) || 30;
  if (n > 1440) return Math.min(480, Math.round(n / 60)); // seconds → minutes, cap 8h
  return Math.min(480, Math.max(5, n));
}

// Returns effective expires_at — validates server value against expected deadline.
// Returns null when expires_at is explicitly null (trade marked paid — timer permanently stopped).
function resolveExpiresAt(expiresAt, createdAt, limitMins) {
  // null means the server intentionally cleared it (buyer marked paid) — honour that
  if (expiresAt === null) return null;
  const computed = createdAt
    ? new Date(new Date(createdAt).getTime() + (limitMins || 30) * 60 * 1000).toISOString()
    : null;
  if (!expiresAt) return computed;
  // If server expires_at differs from computed by more than 2× the limit, the stored value
  // has bad data (e.g. seconds stored as minutes). Fall back to computed.
  if (computed) {
    const diffMs = Math.abs(new Date(expiresAt) - new Date(computed));
    if (diffMs > (limitMins || 30) * 60 * 2000) return computed;
  }
  return expiresAt;
}

// MM:SS countdown
function TradeTimer({ expiresAt, timeLimitMins = 30, onExpire }) {
  const limitSecs    = Math.max(60, timeLimitMins * 60);
  const expiredFired = useRef(false);
  const mountTime    = useRef(Date.now());

  const calcRemaining = () => {
    if (expiresAt) {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      return Math.max(0, diff);
    }
    // No server expiry deadline — show a static countdown from mount time (visual only).
    // onExpire must NOT fire when expiresAt is null: null means the server intentionally
    // cleared the deadline (buyer marked paid) and the trade must stay locked forever.
    const elapsed = Math.floor((Date.now() - mountTime.current) / 1000);
    return Math.max(0, limitSecs - elapsed);
  };

  const [secs, setSecs] = useState(calcRemaining);

  useEffect(() => {
    expiredFired.current = false;
    mountTime.current = Date.now();
    setSecs(calcRemaining());
    const tick = setInterval(() => {
      const remaining = calcRemaining();
      setSecs(remaining);
      // Only fire onExpire when we have a real server deadline (expiresAt is set).
      // If expiresAt is null the server cleared the timer intentionally — never expire.
      if (remaining === 0 && !expiredFired.current && expiresAt) {
        expiredFired.current = true;
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const expired = secs === 0;
  const urgent  = !expired && secs < 300;
  const pct     = Math.min(100, Math.round((secs / limitSecs) * 100));
  const mm      = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss      = String(secs % 60).padStart(2, '0');
  const color   = urgent ? '#D97706' : '#16A34A';
  const bg      = urgent ? '#FEF3C7' : '#DCFCE7';

  // When expired, remove the timer entirely (leave space clean)
  if (expired) return null;

  return (
    <div className="flex flex-col items-end gap-1 flex-shrink-0">
      <span className={`inline-flex items-center gap-1 text-xs font-mono font-black px-2.5 py-1 rounded-full ${urgent ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: bg, color }}>
        <Clock size={10} />
        {mm}:{ss}
      </span>
      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E5E7EB' }}>
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function fmtLocal(sym, amount) {
  if (!amount || isNaN(parseFloat(amount))) return null;
  const num = parseFloat(amount);
  return `${sym || ''}${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtBtc(amount) {
  if (!amount || isNaN(parseFloat(amount))) return null;
  return `₿ ${parseFloat(amount).toFixed(6)}`;
}

// Popup — fetches fresh profile so badge is always accurate
function TraderPopup({ cpId, cpFallback, onClose }) {
  const [user, setUser] = useState(cpFallback || {});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cpId) { setLoading(false); return; }
    axios.get(`${API_URL}/users/${cpId}`)
      .then(r => { if (r.data?.user || r.data) setUser(r.data.user || r.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cpId]);

  const badge      = deriveBadge(user);
  const pos        = parseInt(user.positive_feedback || 0);
  const neg        = parseInt(user.negative_feedback || 0);
  const total      = pos + neg;
  const trust      = total > 0 ? Math.round(pos / total * 100) : parseInt(user.total_trades || 0) > 0 ? 100 : 0;
  const trades     = parseInt(user.total_trades || 0);
  const completion = parseFloat(user.completion_rate || 0);
  const rating     = parseFloat(user.average_rating || 0);
  const cc         = (user.country || '').toLowerCase() || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div
        className="bg-white w-full sm:max-w-xs rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{ border: '1px solid #E2E8F0', animation: 'slideUp .22s ease' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="relative px-5 pt-5 pb-4"
          style={{ background: 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%)' }}>
          <button onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <X size={14} className="text-white" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl text-white flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.25)' }}>
              {(user.username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CountryFlag countryCode={cc} className="w-4 h-3 rounded-sm flex-shrink-0" />
                <span className="font-black text-base text-white leading-tight truncate">
                  {user.username || '—'}
                </span>
              </div>
              {/* Badge — always from fresh profile data */}
              {loading ? (
                <div className="h-5 w-24 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
              ) : (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-bold ${badge.animate ? 'shadow-md' : ''}`}
                  style={{
                    background: badge.bg,
                    borderColor: badge.borderColor,
                    fontSize: '11px',
                    boxShadow: badge.glow ? `0 0 10px ${badge.glow}` : undefined,
                  }}>
                  <span style={{ color: badge.iconColor || badge.textColor, fontSize: '13px' }}>{badge.icon}</span>
                  <span style={{ color: badge.textColor }}>{badge.label}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 p-4">
          {[
            { label: 'Trades',     value: trades,                                        color: '#1B4332' },
            { label: 'Trust',      value: `${trust}%`,                                   color: trust >= 80 ? '#16A34A' : trust >= 50 ? '#D97706' : '#DC2626' },
            { label: 'Completion', value: completion > 0 ? `${Math.round(completion)}%` : '—', color: '#2563EB' },
            { label: 'Positive',   value: pos,                                           color: '#16A34A' },
            { label: 'Negative',   value: neg,                                           color: '#DC2626' },
            { label: 'Rating',     value: rating > 0 ? `${rating.toFixed(1)} ⭐` : '—', color: '#D97706' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl px-3 py-2.5 text-center"
              style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
              <p className="text-[9px] font-black uppercase tracking-wider mb-0.5" style={{ color: '#94A3B8' }}>{label}</p>
              <p className="font-black text-sm leading-tight" style={{ color }}>{loading ? '…' : value}</p>
            </div>
          ))}
        </div>

        <div className="px-4 pb-5">
          <button onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-black text-white hover:opacity-90 transition"
            style={{ backgroundColor: '#1B4332' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActiveTradeCard({ trade, onExpire, pageColor }) {
  const navigate  = useNavigate();
  const myId      = getMyId();
  const isBuyer   = myId ? String(trade.buyer_id) === String(myId) : true;
  const [showPopup, setShowPopup] = useState(false);

  // Counterparty object
  const cp = (isBuyer
    ? (typeof trade.seller === 'object' ? trade.seller : {})
    : (typeof trade.buyer  === 'object' ? trade.buyer  : {})
  ) || {};

  const cfg      = STATUS_CFG[trade.status] || STATUS_CFG.CREATED;
  const btnColor = pageColor || '#1B4332';

  // Listing type — check nested join AND direct field; fall back to role when unknown
  const listingType   = trade.listing?.listing_type || trade.listing_type || trade.trade_type || '';
  const market        = listingType
    ? getMarketInfo(listingType)
    : { label: isBuyer ? 'BUY TRADE' : 'SELL TRADE', color: isBuyer ? '#1B4332' : '#D97706', bg: isBuyer ? '#DCFCE7' : '#FEF3C7' };
  const timeLimitMins = sanitizeLimitMins(trade.listing?.time_limit || trade.time_limit || 30);

  // Timer: use server expires_at, fall back to created_at + limit
  const effectiveExpiresAt = resolveExpiresAt(trade.expires_at, trade.created_at, timeLimitMins);

  // Badge from joined data — may be null, deriveBadge handles gracefully
  const badge = deriveBadge(cp);

  // Amounts
  const sym      = trade.currency_symbol || '';
  const localAmt = fmtLocal(sym, trade.amount_local) || fmtLocal('$', trade.amount_usd);
  const btcAmt   = fmtBtc(trade.amount_btc);

  const youPayAmt   = isBuyer ? localAmt : btcAmt;
  const youRecvAmt  = isBuyer ? btcAmt   : localAmt;
  const youPayNote  = isBuyer ? `via ${trade.payment_method || trade.listing?.payment_method || '—'}` : 'Bitcoin escrow';
  const youRecvNote = isBuyer ? 'Bitcoin' : `via ${trade.payment_method || trade.listing?.payment_method || '—'}`;
  const roleLabel   = isBuyer ? 'You are the Buyer' : 'You are the Seller';

  const pos    = parseInt(cp.positive_feedback || 0);
  const neg    = parseInt(cp.negative_feedback || 0);
  const cpTrades = parseInt(cp.total_trades || cp.trade_count || 0);
  const cc     = (cp.country || '').toLowerCase() || null;

  return (
    <>
      <style>{`@keyframes pmtBorderPulse{0%,100%{box-shadow:0 0 0 2px rgba(37,99,235,0.25),0 4px 16px rgba(0,0,0,0.06);}50%{box-shadow:0 0 0 3px rgba(37,99,235,0.5),0 8px 24px rgba(37,99,235,0.18);}}`}</style>
      <div className="rounded-[1.25rem] mb-4 overflow-hidden w-full transition-all group"
        style={{
          background: '#FFFFFF',
          border: trade.status === 'PAYMENT_SENT' ? '1px solid #BFDBFE' : `1px solid ${cfg.statusColor}20`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          animation: trade.status === 'PAYMENT_SENT' ? 'pmtBorderPulse 2.5s ease-in-out infinite' : undefined,
        }}>

        {/* ── Top Bar ── */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b" style={{ borderColor: '#F1F5F9', backgroundColor: '#F8FAFC' }}>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md shadow-sm"
              style={{ backgroundColor: market.bg, color: market.color }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: market.color }}></div>
              {market.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-xs font-bold" style={{ color: '#64748B' }}>
              {roleLabel}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {/* ── Row 1: Status & Timer ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-black px-3 py-1 rounded-lg border shadow-sm"
                style={{ backgroundColor: cfg.statusBg, color: cfg.statusColor, borderColor: `${cfg.statusColor}30` }}>
                {cfg.label}
              </span>
              
              {/* Timer */}
              {['CREATED', 'FUNDS_LOCKED'].includes(trade.status) && effectiveExpiresAt && (
                <TradeTimer
                  expiresAt={effectiveExpiresAt}
                  timeLimitMins={timeLimitMins}
                  onExpire={() => onExpire?.(trade.id)}
                />
              )}
              {['CREATED', 'FUNDS_LOCKED'].includes(trade.status) && !effectiveExpiresAt && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-md bg-green-50 text-green-700 border border-green-200">
                  🔒 Locked
                </span>
              )}
              {trade.status === 'PAYMENT_SENT' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  🔒 Awaiting Release
                </span>
              )}
              {trade.status === 'DISPUTED' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-md bg-red-50 text-red-600 border border-red-200">
                  ⚖️ In Review
                </span>
              )}
            </div>
          </div>

          {/* ── Row 2: Counterparty Info ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 p-3 rounded-xl border bg-gray-50/50" style={{ borderColor: '#F1F5F9' }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-sm flex-shrink-0 cursor-pointer"
                onClick={() => setShowPopup(true)}
                style={{ background: `linear-gradient(135deg, ${btnColor}, #64748B)` }}>
                {(cp.username || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <CountryFlag countryCode={cc} className="w-4 h-3 rounded-sm flex-shrink-0 shadow-sm" />
                  <button onClick={() => setShowPopup(true)}
                    className="font-black text-[15px] truncate hover:text-green-700 transition leading-tight"
                    style={{ color: '#1E293B', maxWidth: '140px' }}>
                    {cp.username || '—'}
                  </button>
                  {badge && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border flex-shrink-0"
                      style={{ background: badge.bg, borderColor: badge.borderColor, fontSize: '9px', fontWeight: '800', textTransform: 'uppercase' }}>
                      <span style={{ color: badge.iconColor || badge.textColor }}>{badge.icon}</span>
                      <span style={{ color: badge.textColor }}>{badge.label}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500">
                    <Repeat2 size={10} strokeWidth={2.5}/>{cpTrades}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-1.5 rounded">
                    <ThumbsUp size={10} strokeWidth={2.5}/>{pos}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 px-1.5 rounded">
                    <ThumbsDown size={10} strokeWidth={2.5}/>{neg}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Payment Sent Banner ── */}
          {trade.status === 'PAYMENT_SENT' && (
            <div className="mb-4 px-3.5 py-3 rounded-xl flex items-start sm:items-center gap-3 shadow-sm border border-blue-100 bg-blue-50/80">
              <span className="text-xl flex-shrink-0">✅</span>
              <p className="text-[13px] font-black leading-snug" style={{ color: '#1E40AF' }}>
                Payment sent — awaiting Bitcoin release from <span className="underline decoration-dotted">{cp.username || 'seller'}</span>
              </p>
            </div>
          )}

          {/* ── Row 3: You Pay → You Receive ── */}
          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            <div className="flex-1 min-w-0 rounded-xl p-3.5 border relative overflow-hidden" 
              style={{ backgroundColor: '#ffffff', borderColor: '#E2E8F0' }}>
              <div className="absolute top-0 left-0 w-1 h-full bg-gray-300"></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">You Pay</p>
              <p className="font-black text-xl sm:text-2xl text-gray-900 leading-none truncate">
                {youPayAmt || <span className="text-gray-300">—</span>}
              </p>
              <p className="text-[11px] font-medium text-gray-500 mt-2 truncate bg-gray-50 inline-block px-2 py-0.5 rounded-md">
                {youPayNote}
              </p>
            </div>

            <div className="hidden sm:flex items-center justify-center flex-shrink-0 z-10 -mx-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-gray-100 bg-white"
                style={{ color: btnColor }}>
                <ArrowRight size={14} strokeWidth={3} />
              </div>
            </div>

            <div className="flex-1 min-w-0 rounded-xl p-3.5 border relative overflow-hidden"
              style={{ backgroundColor: `${btnColor}05`, borderColor: `${btnColor}20` }}>
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: btnColor }}></div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: btnColor, opacity: 0.8 }}>
                You Receive
              </p>
              <p className="font-black text-xl sm:text-2xl leading-none truncate" style={{ color: btnColor }}>
                {youRecvAmt || <span style={{ opacity: 0.3 }}>—</span>}
              </p>
              <p className="text-[11px] font-medium mt-2 truncate inline-block px-2 py-0.5 rounded-md" style={{ color: btnColor, backgroundColor: `${btnColor}15` }}>
                {youRecvNote}
              </p>
            </div>
          </div>
        </div>

        {/* ── Action button ── */}
        <button
          onClick={() => navigate(`/trade/${trade.id}`)}
          className="w-full py-4 text-white text-[13px] font-black tracking-widest uppercase flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99] transition-all"
          style={{ 
            backgroundColor: trade.status === 'PAYMENT_SENT' ? '#2563EB' : btnColor,
            boxShadow: `0 -4px 20px ${trade.status === 'PAYMENT_SENT' ? '#2563EB20' : `${btnColor}20`}`
          }}>
          {trade.status === 'PAYMENT_SENT' ? 'Open Trade' : 'Attend to Trade'}
          <ArrowRight size={16} />
        </button>
      </div>

      {showPopup && (
        <TraderPopup
          cpId={cp.id}
          cpFallback={cp}
          onClose={() => setShowPopup(false)}
        />
      )}
    </>
  );
}
