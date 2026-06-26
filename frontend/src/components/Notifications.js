import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Bell, X, CheckCheck, ArrowRight,
  Megaphone, Eye, UserCircle, MessageCircle,
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
// ── Shared image-style card container ────────────────────────────────────────
function NCard({ n, onNavigate, children }) {
  const shadow  = n.is_read ? '0 1px 4px rgba(0,0,0,0.05)' : '0 2px 8px rgba(0,0,0,0.09)';
  const shadowH = '0 4px 18px rgba(0,0,0,0.13)';
  return (
    <div onClick={() => onNavigate(n)}
      style={{
        background: '#fff', borderRadius: 16, margin: '0 0 10px',
        border: `1px solid ${n.is_read ? '#E8EEF4' : '#CBD5E1'}`,
        boxShadow: shadow, cursor: 'pointer', overflow: 'hidden',
        transition: 'box-shadow 0.15s, transform 0.12s',
        opacity: n.is_read ? 0.88 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = shadowH; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = shadow; e.currentTarget.style.transform = 'translateY(0)'; }}>
      {children}
    </div>
  );
}
const NDivider = () => <div style={{ height: 1, background: '#F1F5F9', margin: '0 16px' }} />;

// ── Real trade ref: prefers action URL or trade object over message regex ─────
function getRealTradeRef(n) {
  if (n.action) {
    const m = n.action.match(/\/trade\/([^/?#]+)/i);
    if (m) {
      const id = m[1].replace(/-/g, '');
      return id.slice(0, 8).toUpperCase();
    }
  }
  if (n.trade?.id) return String(n.trade.id).replace(/-/g, '').slice(0, 8).toUpperCase();
  const combined = (n.title || '') + ' ' + (n.message || '');
  const m = combined.match(/#([A-Za-z0-9]{4,12})/) || combined.match(/trade[^\w]([A-Za-z0-9]{4,12})/i);
  return m ? m[1].toUpperCase() : null;
}

// ─── 1. PROFILE VIEW card ─────────────────────────────────────────────────────
function ProfileViewCard({ n, onNavigate }) {
  const actor = n.actor;                                   // enriched by backend
  const msg = n.message || '';
  const nameMatch = msg.match(/^(.+?)\s+just viewed/i);
  const viewerName = actor?.username || (nameMatch ? nameMatch[1] : null);
  const isAnon = !viewerName;
  const PURPLE = '#6D28D9';
  const displayName = viewerName || 'Anonymous visitor';

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>Profile View</span>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Eye size={11} color="#fff" />
          </div>
          <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE, background: '#EDE9FE', padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>
          {isAnon ? 'Anonymous' : 'Viewed'}
        </span>
      </div>

      {/* Viewer name row */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Someone visited your profile</span>
        <span style={{ fontSize: 13, color: T.g500, fontWeight: 600 }}>{isAnon ? '—' : displayName}</span>
      </div>

      <NDivider />

      {/* Body — real photo when available */}
      <div style={{ padding: '12px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {isAnon ? (
          <div style={{ width: 44, height: 44, borderRadius: 13, background: '#EDE9FE', border: '2px dashed #C4B5FD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserCircle size={22} color="#7C3AED" />
          </div>
        ) : (
          <Avatar user={actor} name={displayName} size={44} color={PURPLE} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: T.g500, fontWeight: 500 }}>
            {isAnon ? 'Browsed your profile anonymously' : 'Just visited your profile'}
          </p>
        </div>
        {!isAnon && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: PURPLE, flexShrink: 0 }}>
            View <ArrowRight size={12} />
          </span>
        )}
      </div>
    </NCard>
  );
}

// ─── 2. OFFER VIEW card ───────────────────────────────────────────────────────
function OfferViewCard({ n, onNavigate }) {
  const actor = n.actor;
  const msg = n.message || '';
  const nameMatch = msg.match(/^(.+?)\s+(?:just\s+)?viewed\s+your/i);
  const viewerName = actor?.username || (nameMatch ? nameMatch[1] : null);
  const isAnon = !viewerName;
  const hasProfile = n.action?.startsWith('/profile/');
  const AMBER = '#B45309';
  const displayName = viewerName || 'Anonymous visitor';

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>Offer Viewed</span>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#D97706,#92400E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Eye size={11} color="#fff" />
          </div>
          <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: AMBER, background: '#FFFBEB', padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>
          {isAnon ? 'Anonymous' : 'Offer View'}
        </span>
      </div>

      {/* Info row */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Someone viewed your offer</span>
        <span style={{ fontSize: 13, color: T.g500, fontWeight: 600 }}>{isAnon ? '—' : displayName}</span>
      </div>

      <NDivider />

      {/* Body — real photo when available */}
      <div style={{ padding: '12px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {isAnon ? (
          <div style={{ width: 44, height: 44, borderRadius: 13, background: '#FFFBEB', border: '2px dashed #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserCircle size={22} color={AMBER} />
          </div>
        ) : (
          <Avatar user={actor} name={displayName} size={44} color={AMBER} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: T.g500, fontWeight: 500 }}>
            {isAnon ? 'Browsed your offer anonymously' : 'Might be interested in your offer'}
          </p>
        </div>
        {!isAnon && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: AMBER, flexShrink: 0 }}>
            {hasProfile ? 'Profile' : 'Offer'} <ArrowRight size={12} />
          </span>
        )}
      </div>
    </NCard>
  );
}

// ─── 3 & 4. UNIFIED TRADE CARD (image-style) ─────────────────────────────────
const TRADE_STATUS = {
  COMPLETED:           { label: 'Completed',  color: '#059669', bg: '#ECFDF5' },
  COMPLETE:            { label: 'Completed',  color: '#059669', bg: '#ECFDF5' },
  CANCELLED:           { label: 'Canceled',   color: '#DC2626', bg: '#FEF2F2' },
  CANCELED:            { label: 'Canceled',   color: '#DC2626', bg: '#FEF2F2' },
  CANCELLED_BY_BUYER:  { label: 'Canceled',   color: '#DC2626', bg: '#FEF2F2' },
  CANCELLED_BY_SELLER: { label: 'Canceled',   color: '#DC2626', bg: '#FEF2F2' },
  EXPIRED:             { label: 'Expired',    color: '#6B7280', bg: '#F9FAFB' },
  EXPIRE:              { label: 'Expired',    color: '#6B7280', bg: '#F9FAFB' },
  DISPUTED:            { label: 'Dispute',    color: '#6D28D9', bg: '#F5F3FF' },
  IN_DISPUTE:          { label: 'Dispute',    color: '#6D28D9', bg: '#F5F3FF' },
  IN_REVIEW:           { label: 'In Review',  color: '#6D28D9', bg: '#F5F3FF' },
  RESOLVED:            { label: 'Resolved',   color: '#6D28D9', bg: '#F5F3FF' },
  PAYMENT_SENT:        { label: 'Paid',       color: '#2563EB', bg: '#EFF6FF' },
  PAID:                { label: 'Paid',       color: '#2563EB', bg: '#EFF6FF' },
  ESCROW:              { label: 'In Escrow',  color: '#6D28D9', bg: '#F5F3FF' },
  FUNDS_LOCKED:        { label: 'Locked',     color: '#6D28D9', bg: '#F5F3FF' },
  ACTIVE:              { label: 'Active',     color: '#2563EB', bg: '#EFF6FF' },
  IN_PROGRESS:         { label: 'Active',     color: '#2563EB', bg: '#EFF6FF' },
  OPEN:                { label: 'Active',     color: '#2563EB', bg: '#EFF6FF' },
  CREATED:             { label: 'Pending',    color: '#D97706', bg: '#FFFBEB' },
  PENDING:             { label: 'Pending',    color: '#D97706', bg: '#FFFBEB' },
};

const tradeTimeStr = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const isToday = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return isToday
    ? `Today ${hm}`
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) + ', ' + hm;
};

function TradeNotifCard({ n, trade, userId, onNavigate }) {
  const isBuyer  = String(userId) === String(trade.buyer_id);
  const cpRaw    = isBuyer ? trade.seller : trade.buyer;
  // Fallback: parse counterparty name from message when not enriched in trade
  const msgActorName = !cpRaw
    ? (
        (n.message || '').match(/^([A-Za-z0-9_]+)\s+(?:wants to|cancelled|canceled|paid|disputed|completed)/i)?.[1]
        || (n.message || '').match(/\bwith\s+([A-Za-z0-9_]+)\b/i)?.[1]
      )
    : null;
  const cp = cpRaw || (msgActorName ? { username: msgActorName } : null);
  const local    = parseFloat(trade.amount_local || 0);
  const cur      = trade.local_currency || 'USD';
  const sym      = trade.currency_symbol || CUR_SYM[cur] || '';
  const btcRaw   = parseFloat(trade.amount_btc || 0);
  const btcStr   = btcRaw.toFixed(8);
  const pm       = trade.payment_method || '—';
  const st         = (trade.status || '').toUpperCase();
  const status     = TRADE_STATUS[st] || { label: st || 'Active', color: '#2563EB', bg: '#EFF6FF' };
  const dateStr    = tradeTimeStr(trade.created_at || n.created_at);
  const dirLabel   = isBuyer ? 'Buy BTC' : 'Sell BTC';
  const isDone     = st === 'COMPLETED' || st === 'COMPLETE';

  // Past tense for completed trades, present for active
  const payLabel     = isDone ? 'You paid'     : 'You pay';
  const receiveLabel = isDone ? 'You received' : 'You receive';

  // You pay / You receive from this user's perspective
  const payStr     = isBuyer ? `${sym}${local.toFixed(2)} ${cur}` : `${btcStr} BTC`;
  const receiveStr = isBuyer ? `${btcStr} BTC`                    : `${sym}${local.toFixed(2)} ${cur}`;

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header: direction + ₿ icon + date + status (avatar is in row 2, not here) */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>{dirLabel}</span>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#F7931A,#E8790A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 4px rgba(247,147,26,0.4)' }}>
            <span style={{ fontSize: 11, color: '#fff', fontWeight: 900 }}>₿</span>
          </div>
          <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{dateStr}</span>
          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: status.color, background: status.bg, padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>
          {status.label}
        </span>
      </div>

      {/* Payment method (red) | vendor avatar + name + flag */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pm}</span>
        {cp ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Avatar user={cp} name={cp.username} size={32} color={T.forest} />
            <div>
              <span style={{ fontSize: 13, color: '#EC4899', fontWeight: 700, display: 'block' }}>{cp.username}</span>
              {cp.country && <span style={{ fontSize: 13, lineHeight: 1 }}>{flag(cp.country)}</span>}
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: T.g400 }}>—</span>
        )}
      </div>

      <NDivider />

      {/* You pay/paid → You receive/received (orange amounts) */}
      <div style={{ padding: '11px 16px 14px', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 11, color: T.g400, fontWeight: 500, marginBottom: 3 }}>{payLabel}</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#F7931A' }}>{payStr}</p>
        </div>
        <div style={{ padding: '0 14px', color: T.g400, fontSize: 20, fontWeight: 300, flexShrink: 0 }}>→</div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 11, color: T.g400, fontWeight: 500, marginBottom: 3 }}>{receiveLabel}</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#F7931A' }}>{receiveStr}</p>
        </div>
      </div>
    </NCard>
  );
}

// ─── 5. TRADE MESSAGE card ────────────────────────────────────────────────────
function MessageCard({ n, onNavigate }) {
  const msg        = n.message || '';
  const colonIdx   = msg.indexOf(': ');
  const senderName = colonIdx > 0 ? msg.slice(0, colonIdx) : null;
  const preview    = colonIdx > 0 ? msg.slice(colonIdx + 2) : msg;
  const tradeRef   = getRealTradeRef(n);
  const BLUE       = '#2563EB';

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>Trade Chat</span>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageCircle size={11} color="#fff" />
          </div>
          <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
        </div>
        {tradeRef
          ? <span style={{ fontSize: 12, fontWeight: 700, color: T.g600, background: T.g100, padding: '4px 10px', borderRadius: 8, fontFamily: 'monospace', flexShrink: 0 }}>#{tradeRef}</span>
          : <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, background: '#EFF6FF', padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>Message</span>
        }
      </div>

      {/* Sender row */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
          {senderName ? `Message from ${senderName}` : 'New trade message'}
        </span>
        <span style={{ fontSize: 13, color: T.g500, fontWeight: 600 }}>{senderName || '—'}</span>
      </div>

      <NDivider />

      {/* Preview */}
      <div style={{ padding: '12px 16px 14px' }}>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#374151', lineHeight: 1.55, fontWeight: 500, wordBreak: 'break-word' }}>
          {preview || 'New message in your trade'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: BLUE }}>
            Open chat <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </NCard>
  );
}

// ─── 6. GENERAL / SYSTEM card ─────────────────────────────────────────────────
function BasicCard({ n, userId, onNavigate }) {
  const [expanded, setExpanded] = useState(false);

  const title = (n.title || '').toLowerCase();
  const msg   = n.message || '';
  const type  = n.type || '';
  const vendor = n.actor;

  const isCancelled = /cancel/i.test(title)  || /cancel/i.test(type);
  const isExpired   = /expir/i.test(title)   || /expir/i.test(type)  || /expir/i.test(msg);
  const isNewTrade  = /new trade|trade request/i.test(title) || /trade_new|new_trade/i.test(type) || /wants to (buy|sell)/i.test(msg);
  const isDispute   = /disput/i.test(title)  || /disput/i.test(type);
  const isPayment   = /payment|paid/i.test(title);
  const isCompleted = /complet/i.test(title) || /complet/i.test(type)
    || type === 'trade_done' || type === 'trade_complete' || type === 'trade_completed';
  const isResolved  = /resolv/i.test(title)  || /resolv/i.test(type);
  const isActive    = /\bactive\b/i.test(title) || /\bactive\b/i.test(type);
  const isRefund    = /refund/i.test(msg);
  const isTradeRelated = isCancelled || isExpired || isNewTrade || isDispute
    || isPayment || isCompleted || isResolved || isActive;

  const tradeId = getRealTradeRef(n);

  // ── TRADE-RELATED: image-style card ──────────────────────────────────────────
  if (isTradeRelated) {
    const statusMap = {
      cancel:    { label: 'Canceled',    color: '#DC2626', bg: '#FEF2F2' },
      expire:    { label: 'Expired',     color: '#6B7280', bg: '#F9FAFB' },
      dispute:   { label: 'Dispute',     color: '#6D28D9', bg: '#F5F3FF' },
      resolved:  { label: 'Resolved',    color: '#6D28D9', bg: '#F5F3FF' },
      payment:   { label: 'Paid',        color: '#2563EB', bg: '#EFF6FF' },
      active:    { label: 'Active',      color: '#2563EB', bg: '#EFF6FF' },
      completed: { label: 'Completed', color: '#059669', bg: '#ECFDF5' },
      trade:     { label: 'Pending',   color: '#D97706', bg: '#FFFBEB' },
    };
    const status = isCancelled ? statusMap.cancel
      : isExpired   ? statusMap.expire
      : isResolved  ? statusMap.resolved
      : isDispute   ? statusMap.dispute
      : isPayment   ? statusMap.payment
      : isCompleted ? statusMap.completed
      : isActive    ? statusMap.active
      : statusMap.trade;

    // Parse payment method: text after "via "
    const pmM = msg.match(/\bvia\s+([^·\n]+?)(?:\s*·\s*|\s*$)/i);
    const parsedPm = pmM?.[1]?.trim() || n.payment_method || '—';

    // BTC amount (₿ prefix in message)
    const btcM = msg.match(/[₿]([\d.]+)/);
    const parsedBtc = btcM ? parseFloat(btcM[1]) : null;
    const btcAmtStr = parsedBtc ? `₿${parsedBtc.toFixed(8)}` : null;

    // Local fiat amount + currency
    const fiatM = msg.match(/([\d,]+(?:\.\d+)?)\s*(GHS|NGN|KES|ZAR|USD|GBP|EUR|UGX|TZS|XAF|XOF)\b/i);
    const parsedLocalAmt = fiatM ? fiatM[1].replace(/,/g, '') : null;
    const parsedLocalCur = fiatM ? fiatM[2].toUpperCase() : null;
    const parsedLocalSym = parsedLocalCur ? (CUR_SYM[parsedLocalCur] || '') : '';
    const parsedLocalStr = parsedLocalAmt
      ? `${parsedLocalSym}${fmt(parsedLocalAmt)} ${parsedLocalCur}`
      : null;

    // Direction — priority: enriched field → message keywords → type hints
    const wantsBuy  = /wants to buy/i.test(msg);
    const wantsSell = /wants to sell/i.test(msg);
    let dirLabel = 'Trade';
    if (n.direction === 'buy')          dirLabel = 'Buy BTC';
    else if (n.direction === 'sell')    dirLabel = 'Sell BTC';
    else if (wantsBuy)                  dirLabel = 'Sell BTC';
    else if (wantsSell)                 dirLabel = 'Buy BTC';
    else if (/\bbuy\b/i.test(type) && !/sell/i.test(type)) dirLabel = 'Buy BTC';
    else if (/\bsell\b/i.test(type) && !/buy/i.test(type)) dirLabel = 'Sell BTC';

    // Past tense for completed trades
    const isDone = isCompleted;
    const payLabel     = isDone ? 'You paid'     : 'You pay';
    const receiveLabel = isDone ? 'You received' : 'You receive';

    // isSeller = true when we know the current user is selling
    const isSeller = wantsBuy || n.direction === 'sell';
    // You pay / You receive:
    //   Seller: pays BTC → receives fiat
    //   Buyer (default): pays fiat → receives BTC
    // When an amount is unknown, show the asset name (BTC/currency) so user knows what they get
    const payStr     = isSeller
      ? (btcAmtStr || 'BTC')
      : (parsedLocalStr || btcAmtStr || 'BTC');
    const receiveStr = isSeller
      ? (parsedLocalStr || '—')
      : (btcAmtStr ? `${btcAmtStr}${parsedLocalStr ? ` · ${parsedLocalStr}` : ''}` : 'BTC');

    // Actor: use enriched n.actor first, then parse username from message as fallback for letter avatar
    const parsedActorName = !vendor
      ? (
          // "alicebuyer wants to buy…" or "alicebuyer cancelled the trade…"
          msg.match(/^([A-Za-z0-9_]+)\s+(?:wants to|cancelled|canceled|paid|disputed|completed)/i)?.[1]
          // "Your trade with aliceseller is now open…" or "Trade with aliceseller…"
          || msg.match(/\bwith\s+([A-Za-z0-9_]+)\b/i)?.[1]
        )
      : null;
    const displayActor = vendor || (parsedActorName ? { username: parsedActorName } : null);

    // Extra direction hint: if actor username contains "buyer" → they buy → I sell, and vice versa
    if (dirLabel === 'Trade' && parsedActorName) {
      if (/buyer/i.test(parsedActorName))  dirLabel = 'Sell BTC';
      if (/seller/i.test(parsedActorName)) dirLabel = 'Buy BTC';
    }

    return (
      <NCard n={n} onNavigate={onNavigate}>
        {/* Header: direction + ₿ icon + date + status (NO avatar here) */}
        <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>{dirLabel}</span>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#F7931A,#E8790A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 4px rgba(247,147,26,0.35)' }}>
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 900 }}>₿</span>
            </div>
            <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
            {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: status.color, background: status.bg, padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>
            {status.label}
          </span>
        </div>

        {/* Payment method (red) | Actor name + flag (pink) */}
        <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {parsedPm}
          </span>
          {displayActor ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Avatar user={displayActor} name={displayActor.username} size={32} color={T.forest} />
              <div>
                <span style={{ fontSize: 13, color: '#EC4899', fontWeight: 700, display: 'block' }}>{displayActor.username}</span>
                {displayActor.country && <span style={{ fontSize: 13, lineHeight: 1 }}>{flag(displayActor.country)}</span>}
              </div>
            </div>
          ) : parsedLocalStr ? (
            <span style={{ fontSize: 14, fontWeight: 800, color: '#F7931A', flexShrink: 0 }}>{parsedLocalStr}</span>
          ) : tradeId ? (
            <span style={{ fontSize: 12, color: '#EC4899', fontWeight: 800, fontFamily: 'monospace', background: '#FCE7F3', padding: '3px 10px', borderRadius: 7, flexShrink: 0 }}>#{tradeId}</span>
          ) : null}
        </div>

        <NDivider />

        {/* You pay/paid → You receive/received (orange amounts) */}
        <div style={{ padding: '11px 16px 14px', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 11, color: T.g400, fontWeight: 500, marginBottom: 3 }}>{payLabel}</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#F7931A' }}>{payStr}</p>
          </div>
          <div style={{ padding: '0 14px', color: T.g400, fontSize: 20, fontWeight: 300, flexShrink: 0 }}>→</div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 11, color: T.g400, fontWeight: 500, marginBottom: 3 }}>{receiveLabel}</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#F7931A' }}>{receiveStr}</p>
          </div>
        </div>
        {isRefund && (
          <div style={{ padding: '0 16px 12px' }}>
            <p style={{ margin: 0, fontSize: 12, color: T.success, fontWeight: 700 }}>✅ Your BTC has been refunded to your wallet</p>
          </div>
        )}
      </NCard>
    );
  }

  // ── SYSTEM / PRAQEN ──────────────────────────────────────────────────────────
  const GREEN  = '#1B4332';
  const PREVIEW_LIMIT = 120;
  const isLong = msg.length > PREVIEW_LIMIT;
  // Detect subtype for a richer label
  const isBtcReceived = /bitcoin received|btc received/i.test(n.title || '');
  const isBonus       = /bonus|reward|gift/i.test(n.title || '');
  const isBroadcast   = /broadcast|announcement|update/i.test(n.title || '');
  const sysLabel  = isBtcReceived ? 'Received' : isBonus ? 'Bonus' : isBroadcast ? 'Announcement' : 'PRAQEN';
  const sysColor  = isBtcReceived ? '#059669' : isBonus ? '#D97706' : GREEN;
  const sysBg     = isBtcReceived ? '#ECFDF5' : isBonus ? '#FFFBEB' : '#F0FDF4';

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>PRAQEN</span>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg,${sysColor},${sysColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Megaphone size={11} color="#fff" />
          </div>
          <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: sysColor, background: sysBg, padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>
          {sysLabel}
        </span>
      </div>

      {/* Title row */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {n.title || 'System notification'}
        </span>
        <span style={{ fontSize: 12, color: T.g400, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {absTime(n.created_at)}
        </span>
      </div>

      <NDivider />

      {/* Message body */}
      <div style={{ padding: '12px 16px 14px' }}>
        {msg && (
          <>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.6, fontWeight: 500 }}>
              {expanded || !isLong ? msg : msg.slice(0, PREVIEW_LIMIT) + '…'}
            </p>
            {isLong && (
              <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
                style={{ padding: '3px 10px', borderRadius: 7, border: 'none', background: `${sysColor}15`, color: sysColor, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                {expanded ? '▲ Less' : '▼ Read more'}
              </button>
            )}
          </>
        )}
        {n.action && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: msg ? 8 : 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: sysColor }}>
              View <ArrowRight size={12} />
            </span>
          </div>
        )}
      </div>
    </NCard>
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
  if (trade) {
    return <TradeNotifCard n={n} trade={trade} userId={userId} onNavigate={onNavigate} />;
  }
  return <BasicCard n={n} userId={userId} onNavigate={onNavigate} />;
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
      <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch', background: '#F4F7FA', padding: '10px 10px 6px' }}>
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
