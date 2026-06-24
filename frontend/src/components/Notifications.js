import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Bell, X, CheckCheck, ArrowRight, Zap,
  Shield, AlertTriangle, Megaphone, Gift, ShoppingBag,
  Eye, CheckCircle, XCircle, UserCircle, Clock,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ── Color tokens ──────────────────────────────────────────────────────────────
const T = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', amber: '#B45309',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#059669', danger: '#DC2626', warn: '#D97706', paid: '#2563EB',
  purple: '#6D28D9', teal: '#0D9488',
};

// Softer per-type palettes: accent is the text/icon color, bg is the card tint
const TYPE_PALETTE = {
  profile_view:  { accent: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', dot: '#7C3AED' },
  offer_view:    { accent: '#B45309', bg: '#FFFBEB', border: '#FDE68A', dot: '#D97706' },
  trade_new:     { accent: '#1B4332', bg: '#F0FDF4', border: '#BBF7D0', dot: '#059669' },
  trade_cancel:  { accent: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444' },
  trade_expire:  { accent: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444' },
  trade_paid:    { accent: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', dot: '#3B82F6' },
  trade_done:    { accent: '#059669', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981' },
  dispute:       { accent: '#B45309', bg: '#FFFBEB', border: '#FDE68A', dot: '#D97706' },
  system:        { accent: '#1B4332', bg: '#F0FDF4', border: '#D1FAE5', dot: '#2D6A4F' },
};

const CUR_SYM = { GHS:'₵', NGN:'₦', KES:'KSh', ZAR:'R', USD:'$', GBP:'£', EUR:'€', UGX:'USh', TZS:'TSh', XAF:'CFA', XOF:'CFA' };
const fmt    = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n || 0);
const fmtBtc = n => parseFloat(n || 0).toFixed(6);

const flag = c =>
  !c || c.length !== 2 ? '' :
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
  return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

const absTime = d =>
  !d ? '' : new Date(d).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ── Small avatar ──────────────────────────────────────────────────────────────
function Avatar({ user, name, size = 38, color = T.forest }) {
  const [err, setErr] = useState(false);
  const label = name || user?.username || user?.full_name || '?';
  const initial = label.charAt(0).toUpperCase();
  if (user?.avatar_url && !err) {
    const src = user.avatar_url.startsWith('/') ? `${API_URL}${user.avatar_url}` : user.avatar_url;
    return <img src={src} onError={() => setErr(true)} alt={label}
      style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3, backgroundColor: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, color: '#fff', fontSize: size * 0.4, flexShrink: 0,
    }}>{initial}</div>
  );
}

// ── Icon circle ───────────────────────────────────────────────────────────────
function IconCircle({ icon: Icon, color, bg, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      backgroundColor: bg, border: `1.5px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <Icon size={size * 0.44} color={color} />
    </div>
  );
}

// ── Unread dot ────────────────────────────────────────────────────────────────
function UnreadDot({ color }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%',
      backgroundColor: color, display: 'inline-block', flexShrink: 0,
    }} />
  );
}

// ── Type badge ────────────────────────────────────────────────────────────────
function TypeBadge({ label, color, bg }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase',
      padding: '3px 9px', borderRadius: 20,
      backgroundColor: bg, color, border: `1.5px solid ${color}45`,
    }}>{label}</span>
  );
}

// ── Base card wrapper — div so inner buttons are valid HTML ───────────────────
function CardWrap({ isRead, palette, onClick, children }) {
  const isMob = window.innerWidth < 640;
  return (
    <div onClick={onClick}
      style={{
        display: 'block',
        padding: isMob ? '16px 18px' : '14px 16px',
        cursor: 'pointer',
        borderBottom: `1px solid ${T.g200}`,
        backgroundColor: isRead ? '#fff' : palette.bg,
        borderLeft: `3.5px solid ${isRead ? T.g200 : palette.dot}`,
        transition: 'background 0.12s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = isRead ? T.g50 : `${palette.dot}18`; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = isRead ? '#fff' : palette.bg; }}>
      {children}
    </div>
  );
}

// ─── 1. PROFILE VIEW card ─────────────────────────────────────────────────────
function ProfileViewCard({ n, onNavigate }) {
  const pal = TYPE_PALETTE.profile_view;
  // Extract viewer name from message: "Username just viewed your profile"
  const msg = n.message || '';
  const nameMatch = msg.match(/^(.+?)\s+just viewed/i);
  const viewerName = nameMatch ? nameMatch[1] : 'Someone';
  const isAnon = viewerName === 'Someone';

  return (
    <CardWrap isRead={n.is_read} palette={pal} onClick={() => onNavigate(n)}>
      {/* Top row: badge + time + unread */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TypeBadge label="Profile View" color={pal.accent} bg={pal.bg} />
          {!n.is_read && <UnreadDot color={pal.dot} />}
        </div>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 700 }}>{relTime(n.created_at)}</span>
      </div>

      {/* Viewer row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isAnon ? (
          <div style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            background: `linear-gradient(135deg,${pal.accent}20,${pal.accent}08)`,
            border: `2px dashed ${pal.accent}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <UserCircle size={24} color={`${pal.accent}70`} />
          </div>
        ) : (
          <Avatar name={viewerName} size={46} color={pal.accent} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>
              {isAnon ? 'Anonymous visitor' : viewerName}
            </span>
            <span style={{ fontSize: 13 }}>👀</span>
          </div>
          <p style={{ fontSize: 12, color: T.g600, fontWeight: 600, lineHeight: 1.55, margin: 0 }}>
            {isAnon
              ? 'Someone browsed your profile anonymously'
              : `${viewerName} just visited your profile — tap to view theirs`}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, paddingTop: 9, borderTop: `1px solid ${pal.border}` }}>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 600 }}>{absTime(n.created_at)}</span>
        {!isAnon ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 900, color: pal.accent }}>
            View their profile <ArrowRight size={12} />
          </span>
        ) : (
          <span style={{ fontSize: 11, color: T.g400, fontWeight: 600, fontStyle: 'italic' }}>
            Anonymous visit
          </span>
        )}
      </div>
    </CardWrap>
  );
}

// ─── 2. OFFER VIEW card ───────────────────────────────────────────────────────
function OfferViewCard({ n, onNavigate }) {
  const pal = TYPE_PALETTE.offer_view;
  const msg = n.message || '';
  const nameMatch = msg.match(/^(.+?)\s+(?:just\s+)?viewed\s+your/i);
  const viewerName = nameMatch ? nameMatch[1] : 'Someone';
  const isAnon = viewerName === 'Someone';
  const hasProfile = n.action?.startsWith('/profile/');

  return (
    <CardWrap isRead={n.is_read} palette={pal} onClick={() => onNavigate(n)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TypeBadge label="Offer Viewed" color={pal.accent} bg={pal.bg} />
          {!n.is_read && <UnreadDot color={pal.dot} />}
        </div>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 700 }}>{relTime(n.created_at)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isAnon ? (
          <div style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            background: `linear-gradient(135deg,${pal.accent}20,${pal.accent}08)`,
            border: `2px dashed ${pal.accent}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <UserCircle size={23} color={`${pal.accent}70`} />
          </div>
        ) : (
          <Avatar name={viewerName} size={46} color={pal.accent} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A', display: 'block', marginBottom: 3 }}>
            {isAnon ? 'Anonymous visitor' : viewerName}
          </span>
          <p style={{ fontSize: 12, color: T.g600, fontWeight: 600, margin: 0, lineHeight: 1.55 }}>
            {isAnon
              ? 'Someone browsed your offer anonymously'
              : 'Browsed your offer — they might be interested!'}
          </p>
        </div>
        <Eye size={19} color={pal.accent} style={{ flexShrink: 0, opacity: 0.6 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, paddingTop: 9, borderTop: `1px solid ${pal.border}` }}>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 600 }}>{absTime(n.created_at)}</span>
        {!isAnon ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 900, color: pal.accent }}>
            {hasProfile ? 'View their profile' : 'View offer'} <ArrowRight size={12} />
          </span>
        ) : (
          <span style={{ fontSize: 11, color: T.g400, fontWeight: 600, fontStyle: 'italic' }}>Anonymous visit</span>
        )}
      </div>
    </CardWrap>
  );
}

// ─── 3. COMPLETED TRADE card ──────────────────────────────────────────────────
function CompletedCard({ n, trade, userId, onNavigate }) {
  const pal = TYPE_PALETTE.trade_done;
  const isBuyer = String(userId) === String(trade.buyer_id);
  const cp      = isBuyer ? trade.seller : trade.buyer;
  const local   = trade.amount_local || trade.local_amount || 0;
  const cur     = trade.local_currency || trade.currency || 'USD';
  const sym     = CUR_SYM[cur] || '';
  const btc     = fmtBtc(trade.amount_btc);
  const pm      = trade.payment_method || '—';

  return (
    <CardWrap isRead={n.is_read} palette={pal} onClick={() => onNavigate(n)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TypeBadge label="Trade Complete" color={pal.accent} bg={pal.bg} />
          {!n.is_read && <UnreadDot color={pal.dot} />}
        </div>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 700 }}>{relTime(trade.completed_at || n.created_at)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar user={cp} size={46} color={T.mint} />
          {cp?.country && (
            <span style={{ position: 'absolute', bottom: -2, right: -4, fontSize: 13, lineHeight: 1 }}>
              {flag(cp.country)}
            </span>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A', display: 'block', marginBottom: 3 }}>
            {cp?.username || 'Trader'}
          </span>
          <p style={{ fontSize: 12, color: T.g600, fontWeight: 600, margin: 0 }}>
            {isBuyer ? '🎉 You bought Bitcoin successfully' : '✅ You sold Bitcoin successfully'}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { val: `${sym}${fmt(local)} ${cur}`, color: pal.accent, bg: `${pal.accent}15` },
          { val: `₿ ${btc}`, color: T.amber, bg: '#FEF3C7' },
          { val: pm, color: T.g700, bg: T.g100 },
        ].map(chip => (
          <span key={chip.val} style={{
            fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20,
            backgroundColor: chip.bg, color: chip.color,
            border: `1.5px solid ${chip.color}35`,
          }}>{chip.val}</span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 9, borderTop: `1px solid ${pal.border}` }}>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 700, fontFamily: 'monospace' }}>
          #{String(trade.id).slice(0, 8).toUpperCase()}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 900, color: pal.accent }}>
          View trade <ArrowRight size={12} />
        </span>
      </div>
    </CardWrap>
  );
}

// ─── 4. ACTIVE TRADE card ─────────────────────────────────────────────────────
function TradeCard({ n, trade, userId, onNavigate }) {
  const isBuyer = String(userId) === String(trade.buyer_id);
  const cp      = isBuyer ? trade.seller : trade.buyer;
  const local   = trade.amount_local || trade.local_amount || 0;
  const cur     = trade.local_currency || trade.currency || 'USD';
  const sym     = CUR_SYM[cur] || '';
  const btc     = fmtBtc(trade.amount_btc);
  const pm      = trade.payment_method || '—';
  const st      = (trade.status || '').toUpperCase();
  const isPaid  = st === 'PAYMENT_SENT' || st === 'PAID';
  const isDisp  = st === 'DISPUTED';
  const pal     = isDisp ? TYPE_PALETTE.dispute : isPaid ? TYPE_PALETTE.trade_paid : TYPE_PALETTE.trade_new;

  const statusLabel = isPaid ? '💳 Payment Sent' : isDisp ? '🚨 Disputed' : '🔒 Escrow Active';

  return (
    <CardWrap isRead={n.is_read} palette={pal} onClick={() => onNavigate(n)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TypeBadge label={isBuyer ? 'Trade Started' : 'New Request'} color={pal.accent} bg={pal.bg} />
          {!n.is_read && <UnreadDot color={pal.dot} />}
        </div>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 700 }}>{relTime(n.created_at)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar user={cp} size={46} color={pal.accent} />
          {cp?.country && (
            <span style={{ position: 'absolute', bottom: -2, right: -4, fontSize: 13, lineHeight: 1 }}>
              {flag(cp.country)}
            </span>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A', display: 'block', marginBottom: 3 }}>
            {cp?.username || 'Trader'}
          </span>
          <p style={{ fontSize: 12, color: T.g600, fontWeight: 600, margin: 0 }}>
            {isBuyer ? `You started a trade with ${cp?.username || 'this seller'}` : `${cp?.username || 'A buyer'} wants to trade with you`}
          </p>
        </div>
      </div>

      {/* Trade chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { val: `${sym}${fmt(local)} ${cur}`, color: pal.accent, bg: `${pal.accent}15` },
          { val: `₿ ${btc}`, color: T.amber, bg: '#FEF3C7' },
          { val: pm, color: T.g700, bg: T.g100 },
        ].map(chip => (
          <span key={chip.val} style={{
            fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20,
            backgroundColor: chip.bg, color: chip.color,
            border: `1.5px solid ${chip.color}35`,
          }}>{chip.val}</span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 9, borderTop: `1px solid ${pal.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: T.g500, fontWeight: 700, fontFamily: 'monospace' }}>
            #{String(trade.id || '').slice(0, 8).toUpperCase()}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20,
            backgroundColor: `${pal.dot}18`, color: pal.dot,
            border: `1px solid ${pal.dot}30`,
          }}>{statusLabel}</span>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 900, color: pal.accent }}>
          Open trade <ArrowRight size={12} />
        </span>
      </div>
    </CardWrap>
  );
}

// ─── 5. TRADE MESSAGE card ────────────────────────────────────────────────────
function MessageCard({ n, onNavigate }) {
  const pal = TYPE_PALETTE.trade_paid;
  const msg = n.message || '';
  // "SenderName: preview text"
  const colonIdx = msg.indexOf(': ');
  const senderName = colonIdx > 0 ? msg.slice(0, colonIdx) : null;
  const preview    = colonIdx > 0 ? msg.slice(colonIdx + 2) : msg;
  const tradeRef   = (n.title || '').match(/#([A-F0-9]{6,10})/i)?.[1] || null;

  return (
    <CardWrap isRead={n.is_read} palette={pal} onClick={() => onNavigate(n)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TypeBadge label="Trade Chat" color="#2563EB" bg="#EFF6FF" />
          {tradeRef && (
            <span style={{ fontSize: 10, fontWeight: 800, color: T.g500, background: T.g100, borderRadius: 5, padding: '2px 6px', fontFamily: 'monospace' }}>
              #{tradeRef}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 700 }}>{relTime(n.created_at)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#DBEAFE', border: '1.5px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>💬</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {senderName && (
            <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 900, color: '#1E40AF' }}>
              {senderName}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 12, color: T.g600, lineHeight: 1.5, wordBreak: 'break-word' }}>
            {preview}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>
          Open trade chat →
        </span>
      </div>
    </CardWrap>
  );
}

// ─── 6. GENERAL / SYSTEM card ─────────────────────────────────────────────────
function BasicCard({ n, onNavigate }) {
  const [expanded, setExpanded] = useState(false);

  const title   = (n.title || '').toLowerCase();
  const msg     = n.message || '';
  const type    = n.type || '';

  const isCancelled  = /cancel/i.test(title) || /cancel/i.test(type);
  const isExpired    = /expir/i.test(title)  || /expir/i.test(type);
  const isNewTrade   = /new trade|trade request/i.test(title);
  const isDispute    = /disput/i.test(title);
  const isPayment    = /payment|paid/i.test(title);
  const isRefund     = /refund/i.test(msg);

  let pal, Icon, typeLabel, titleText;

  if (isCancelled || isExpired) {
    pal = TYPE_PALETTE.trade_cancel; Icon = XCircle;
    typeLabel = isExpired ? 'Expired' : 'Cancelled';
    titleText = isExpired ? '⏰ Trade Expired' : '❌ Trade Cancelled';
  } else if (isNewTrade) {
    pal = TYPE_PALETTE.trade_new; Icon = ShoppingBag;
    typeLabel = 'New Request'; titleText = n.title;
  } else if (isDispute) {
    pal = TYPE_PALETTE.dispute; Icon = AlertTriangle;
    typeLabel = 'Dispute 🚨'; titleText = n.title;
  } else if (isPayment) {
    pal = TYPE_PALETTE.trade_paid; Icon = CheckCircle;
    typeLabel = 'Payment'; titleText = n.title;
  } else {
    pal = TYPE_PALETTE.system; Icon = Megaphone;
    typeLabel = 'PRAQEN'; titleText = n.title;
  }

  const tradeIdMatch = msg.match(/trade\s*#?([A-F0-9]{6,10})/i) || msg.match(/#([A-F0-9]{6,10})/i);
  const tradeId = tradeIdMatch ? tradeIdMatch[1].toUpperCase() : null;

  // Extract cancel reason — anything after "—", "–", or ". " at the end
  const cancelReason = msg.match(/(?:[.—–]\s*)(.{10,})$/)?.[1]?.trim() || msg || null;
  const PREVIEW_LIMIT = 110;
  const isLong = msg.length > PREVIEW_LIMIT;

  return (
    <CardWrap isRead={n.is_read} palette={pal} onClick={() => onNavigate(n)}>
      {/* Badge row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TypeBadge label={typeLabel} color={pal.accent} bg={pal.bg} />
          {tradeId && (
            <span style={{
              fontSize: 10, fontWeight: 800, fontFamily: 'monospace',
              padding: '3px 8px', borderRadius: 6,
              backgroundColor: `${pal.accent}12`, color: pal.accent,
              border: `1px solid ${pal.accent}30`,
            }}>#{tradeId}</span>
          )}
          {!n.is_read && <UnreadDot color={pal.dot} />}
        </div>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 700 }}>{relTime(n.created_at)}</span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <IconCircle icon={Icon} color={pal.accent} bg={`${pal.accent}15`} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 900, fontSize: 14, color: '#0F172A', marginBottom: 6, lineHeight: 1.35 }}>
            {titleText || n.title}
          </p>

          {/* Cancelled/Expired detail box — always shows full reason */}
          {(isCancelled || isExpired) && (
            <div style={{
              padding: '9px 12px', borderRadius: 10, marginBottom: 6,
              backgroundColor: `${pal.accent}08`, border: `1.5px solid ${pal.border}`,
            }}>
              <p style={{ fontSize: 12, color: T.g700, lineHeight: 1.6, margin: 0, fontWeight: 600 }}>
                <span style={{ color: T.g500, fontWeight: 700 }}>Reason: </span>
                {cancelReason || msg || 'No reason provided'}
              </p>
              {isRefund && (
                <p style={{ fontSize: 12, color: T.success, fontWeight: 700, marginTop: 6, marginBottom: 0 }}>
                  ✅ Your BTC has been refunded to your wallet
                </p>
              )}
            </div>
          )}

          {/* Dispute warning box — full text always visible */}
          {isDispute && (
            <div style={{
              padding: '9px 12px', borderRadius: 10, marginBottom: 6,
              backgroundColor: `${pal.accent}08`, border: `1.5px solid ${pal.border}`,
            }}>
              <p style={{ fontSize: 12, color: T.g700, lineHeight: 1.6, margin: 0, fontWeight: 600 }}>
                {msg}
              </p>
              <p style={{ fontSize: 12, fontWeight: 800, color: pal.accent, marginTop: 6, marginBottom: 0 }}>
                ⚠️ Do not release funds until resolved.
              </p>
            </div>
          )}

          {/* Generic / system message — expandable */}
          {!isCancelled && !isExpired && !isDispute && msg && (
            <div style={{
              padding: '9px 12px', borderRadius: 10,
              backgroundColor: `${pal.accent}08`, border: `1.5px solid ${pal.border}`,
            }}>
              <p style={{ fontSize: 12, color: T.g700, lineHeight: 1.65, margin: 0, fontWeight: 600 }}>
                {expanded || !isLong ? msg : msg.slice(0, PREVIEW_LIMIT) + '…'}
              </p>
              {isLong && (
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
                  style={{
                    marginTop: 7, padding: '4px 10px', borderRadius: 8, border: 'none',
                    backgroundColor: `${pal.accent}15`, color: pal.accent,
                    fontSize: 11, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  {expanded ? '▲ Show less' : '▼ Read full message'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, paddingTop: 9, borderTop: `1px solid ${pal.border}` }}>
        <span style={{ fontSize: 11, color: T.g500, fontWeight: 600 }}>{absTime(n.created_at)}</span>
        {n.action && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 900, color: pal.accent }}>
            {isCancelled || isExpired ? 'View details'
              : isDispute ? 'View dispute'
              : isPayment ? 'View trade'
              : 'View'} <ArrowRight size={12} />
          </span>
        )}
      </div>
    </CardWrap>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
function NotifCard({ n, userId, onNavigate }) {
  const type = n.type || '';
  const trade = n.trade;

  if (type === 'profile_view' || /viewed your profile/i.test(n.message || '')) {
    return <ProfileViewCard n={n} onNavigate={onNavigate} />;
  }
  if (type === 'offer_view' || /viewed your offer/i.test((n.title || '') + (n.message || ''))) {
    return <OfferViewCard n={n} onNavigate={onNavigate} />;
  }
  if (type === 'message') {
    return <MessageCard n={n} onNavigate={onNavigate} />;
  }
  if (trade && trade.status === 'COMPLETED') {
    return <CompletedCard n={n} trade={trade} userId={userId} onNavigate={onNavigate} />;
  }
  if (trade) {
    return <TradeCard n={n} trade={trade} userId={userId} onNavigate={onNavigate} />;
  }
  return <BasicCard n={n} onNavigate={onNavigate} />;
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'trades',   label: 'Trades' },
  { id: 'views',    label: 'Profile & Offers' },
  { id: 'referral', label: 'Referrals' },
  { id: 'system',   label: 'System' },
];

function matchFilter(n, filter) {
  if (filter === 'all') return true;
  const type = n.type || '';
  const title = (n.title || '').toLowerCase();
  const msg = (n.message || '').toLowerCase();
  if (filter === 'trades')   return !!n.trade || /trade|payment|escrow|dispute|message/i.test(title + type);
  if (filter === 'views')    return /profile_view|offer_view/i.test(type) || /viewed your/i.test(title + msg);
  if (filter === 'referral') return /referral|commission|affiliate/i.test(type + title + msg);
  if (filter === 'system')   return /update|broadcast|system|welcome|bonus|received|sent|transfer/i.test(type + title + msg);
  return true;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function Notifications({ user }) {
  const navigate  = useNavigate();
  const ref       = useRef(null);
  const [notifs,   setNotifs]   = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState('all');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const unread = notifs.filter(n => !n.is_read).length;
  const token  = () => localStorage.getItem('token');
  const hdrs   = () => ({ Authorization: `Bearer ${token()}` });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/notifications`, { headers: hdrs() });
      setNotifs(r.data.notifications || []);
    } catch { /* keep previous */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [user]); // eslint-disable-line

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!user) return;
    const h = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [user]); // eslint-disable-line

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
    setShowDrop(false);

    // For profile/offer view notifications: always land on the VIEWER's profile
    if (n.type === 'offer_view' || n.type === 'profile_view') {
      // New notifications store /profile/:uuid directly
      if (n.action?.startsWith('/profile/')) {
        navigate(n.action);
        return;
      }
      // Old notifications stored /listing/:id or /notifications — resolve viewer by username instead
      const nameMatch = (n.message || '').match(/^(.+?)\s+just\s+(?:viewed|browsed)/i);
      const viewerName = nameMatch?.[1];
      if (viewerName && viewerName !== 'Someone') {
        navigate(`/profile/${viewerName}`);
        return;
      }
      // Truly anonymous — nothing useful to navigate to
      return;
    }

    if (n.action) navigate(n.action);
  };

  const filtered = notifs.filter(n => matchFilter(n, filter));

  if (!user) return null;

  // ── Shared panel content (header + list + footer) ──────────────────────────
  const MobileFilters = [
    { id: 'all',      label: 'All' },
    { id: 'trades',   label: 'Trades' },
    { id: 'views',    label: 'Views' },
    { id: 'referral', label: 'Refs' },
    { id: 'system',   label: 'System' },
  ];
  const tabDefs = isMobile ? MobileFilters : FILTERS;

  const PanelContent = (
    <>
      {/* ── Header ── */}
      <div style={{
        padding: isMobile ? '16px 18px 12px' : '14px 16px 10px',
        flexShrink: 0,
        borderBottom: `1px solid ${T.g200}`,
        backgroundColor: '#fff',
      }}>
        {/* Mobile drag handle */}
        {isMobile && (
          <div style={{
            width: 36, height: 4, borderRadius: 99,
            backgroundColor: T.g200, margin: '0 auto 14px',
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: isMobile ? 36 : 32, height: isMobile ? 36 : 32,
              borderRadius: 11,
              background: `linear-gradient(135deg,${T.forest},${T.mint})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Bell size={isMobile ? 17 : 15} color="#fff" />
            </div>
            <div>
              <p style={{ fontWeight: 900, fontSize: isMobile ? 17 : 15, color: '#0F172A', lineHeight: 1, margin: 0 }}>
                Notifications
              </p>
              <p style={{ fontSize: isMobile ? 12 : 11, color: T.g500, marginTop: 3, fontWeight: 700, margin: '3px 0 0' }}>
                {unread > 0 ? `${unread} unread` : 'All caught up'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {unread > 0 && (
              <button onClick={markAllRead}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: isMobile ? 12 : 11, fontWeight: 700, color: T.green,
                  background: `${T.green}10`, border: `1px solid ${T.green}25`,
                  borderRadius: 9, padding: isMobile ? '7px 12px' : '4px 9px', cursor: 'pointer',
                }}>
                <CheckCheck size={isMobile ? 13 : 11} /> Mark all read
              </button>
            )}
            <button onClick={() => setShowDrop(false)}
              style={{
                background: T.g100, border: 'none', cursor: 'pointer',
                width: isMobile ? 36 : 28, height: isMobile ? 36 : 28,
                borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <X size={isMobile ? 17 : 14} color={T.g600} />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: isMobile ? 6 : 4 }}>
          {tabDefs.map(f => {
            const count = f.id === 'all' ? unread : notifs.filter(n => !n.is_read && matchFilter(n, f.id)).length;
            const active = filter === f.id;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                style={{
                  flex: 1,
                  padding: isMobile ? '9px 6px' : '6px 4px',
                  borderRadius: 10, border: 'none',
                  fontSize: isMobile ? 12 : 10,
                  fontWeight: 800, cursor: 'pointer', textAlign: 'center',
                  backgroundColor: active ? T.forest : T.g100,
                  color: active ? '#fff' : T.g600,
                  transition: 'all 0.15s',
                  position: 'relative',
                }}>
                {f.label}
                {count > 0 && !active && (
                  <span style={{
                    position: 'absolute', top: -3, right: -3,
                    minWidth: 15, height: 15, borderRadius: 99, padding: '0 3px',
                    backgroundColor: T.danger, color: '#fff',
                    fontSize: 9, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{count > 9 ? '9+' : count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── List ── */}
      <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
        {loading && notifs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              border: `2.5px solid ${T.mint}`, borderTopColor: 'transparent',
              animation: 'notif-spin 0.8s linear infinite', marginBottom: 12,
            }} />
            <p style={{ fontSize: 13, color: T.g400, fontWeight: 600 }}>Loading…</p>
            <style>{`@keyframes notif-spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
            <div style={{
              width: 60, height: 60, borderRadius: 18,
              backgroundColor: T.g100,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            }}>
              <Bell size={26} style={{ color: T.g400 }} />
            </div>
            <p style={{ fontWeight: 900, fontSize: 15, color: T.g700, marginBottom: 6 }}>
              {filter === 'all' ? 'All caught up!' : `No ${tabDefs.find(f => f.id === filter)?.label.toLowerCase()} notifications`}
            </p>
            <p style={{ fontSize: 13, color: T.g400, lineHeight: 1.6, maxWidth: 260 }}>
              {filter === 'all'
                ? "We'll notify you when a trade comes in, payment is confirmed, or someone views your profile."
                : 'Nothing here yet — check back soon.'}
            </p>
          </div>
        ) : (
          filtered.map(n => (
            <NotifCard key={n.id} n={n} userId={user?.id} onNavigate={handleClick} />
          ))
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: isMobile ? '12px 18px' : '10px 16px',
        borderTop: `1px solid ${T.g200}`,
        backgroundColor: T.g50, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 10,
      }}>
        <p style={{ fontSize: isMobile ? 13 : 12, color: T.g600, fontWeight: 700, margin: 0 }}>
          {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
          {filter !== 'all' && (
            <span style={{ color: T.g400 }}> · {tabDefs.find(f => f.id === filter)?.label}</span>
          )}
        </p>
        <button
          onClick={() => { setShowDrop(false); navigate('/my-trades'); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: isMobile ? 13 : 11, fontWeight: 900, color: T.green,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: isMobile ? '8px 0' : '4px 0',
          }}>
          My trades <ArrowRight size={isMobile ? 13 : 11} />
        </button>
      </div>
    </>
  );

  return (
    <div className="relative" ref={ref}>

      {/* ── Bell button ── */}
      <button
        onClick={() => { setShowDrop(v => !v); if (!showDrop) load(); }}
        style={{
          position: 'relative', padding: '8px', borderRadius: 12,
          border: 'none', background: 'transparent', cursor: 'pointer',
          minWidth: 40, minHeight: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Notifications">
        <Bell size={22} style={{ color: T.forest }} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 18, height: 18, padding: '0 4px', borderRadius: 99,
            backgroundColor: T.danger, color: '#fff',
            fontSize: 10, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* ── MOBILE: full-screen bottom sheet ── */}
      {showDrop && isMobile && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowDrop(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 998,
              backgroundColor: 'rgba(0,0,0,0.45)',
            }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
            backgroundColor: '#fff',
            borderRadius: '22px 22px 0 0',
            display: 'flex', flexDirection: 'column',
            height: '90vh',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}>
            {PanelContent}
          </div>
        </>
      )}

      {/* ── DESKTOP: dropdown ── */}
      {showDrop && !isMobile && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          backgroundColor: '#fff',
          borderRadius: 18, border: `1px solid ${T.g200}`,
          display: 'flex', flexDirection: 'column',
          width: 'min(440px, calc(100vw - 32px))',
          maxHeight: '84vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.14)',
          overflow: 'hidden',
          zIndex: 999,
        }}>
          {PanelContent}
        </div>
      )}
    </div>
  );
}
