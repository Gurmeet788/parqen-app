import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Bell, X, CheckCheck, ArrowRight, Bitcoin,
  Shield, AlertTriangle, Megaphone, Gift, Zap,
  Clock, CheckCircle, XCircle, ShoppingBag, Eye,
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
  const title = (n.title || '').toLowerCase();
  const msg   = n.message || '';

  const isCancelled  = /cancel/i.test(title);
  const isExpired    = /expir/i.test(title);
  const isNewTrade   = /new trade|trade request/i.test(title);
  const isDispute    = /disput/i.test(title);
  const isPayment    = /payment|paid/i.test(title);
  const isOfferView  = n.type === 'offer_view' || /viewed your offer/i.test(title + msg);
  const isRefund     = /refund/i.test(msg);
  const isBroadcast  = n.type === 'update' || n.type === 'broadcast' ||
    (!isCancelled && !isExpired && !isNewTrade && !isDispute && !isPayment && !isOfferView);

  // ── Parse trade ID ──────────────────────────────────────────────────────────
  const tradeIdMatch = msg.match(/trade\s*#?([A-F0-9]{6,10})/i);
  const tradeId = tradeIdMatch ? tradeIdMatch[1].toUpperCase() : null;

  // ── Parse cancellation reason (text after " — " or ". ") ───────────────────
  const reasonMatch = msg.match(/cancelled[^.]*[.—–]\s*(.+)/i);
  const cancelReason = reasonMatch ? reasonMatch[1].trim() : null;

  // ── Parse new-trade-request fields ─────────────────────────────────────────
  // Backend format: "RICHYDeFi wants to buy Bitcoin · ₵1,000 GHS via MTN Mobile Money"
  // Gift card format: "RICHYDeFi wants to buy Apple Gift Card · ₵1,000 GHS via MTN Mobile Money"
  const traderMatch = msg.match(/^([^\s]+)\s+wants\s+to\s+(buy|sell)/i);
  const traderName  = traderMatch ? traderMatch[1] : null;
  const tradeAction = traderMatch ? traderMatch[2].toLowerCase() : null;
  const pmMatch     = msg.match(/via\s+(.+)$/i);
  const payMethod   = pmMatch ? pmMatch[1].trim() : null;
  const amtMatch    = msg.match(/(₵|₦|KSh|R\s|USh|TSh|CFA|\$|£|€)([\d,]+)\s*([A-Z]{3})/);
  const amtDisplay  = amtMatch ? `${amtMatch[1]}${amtMatch[2]} ${amtMatch[3]}` : null;
  // BTC amount — present in new format: "· ₿0.00028065 ·"
  const btcAmtMatch = msg.match(/₿([\d.]+)/);
  const btcDisplay  = btcAmtMatch ? `₿${parseFloat(btcAmtMatch[1]).toFixed(8)}` : null;

  // Extract asset: text between the action word and " ·"
  const assetMatch  = msg.match(/wants\s+to\s+(?:buy|sell)\s+(.+?)\s+·/i);
  const rawAsset    = assetMatch ? assetMatch[1].replace(/^(buy|sell)\s+/i, '').trim() : null;
  // Normalise: "Bitcoin" or "Bitcoin Gift Card" both mean a BTC trade (DB artefact)
  const isBtcTrade  = !rawAsset || /^bitcoin(\s+gift\s+card)?$/i.test(rawAsset);
  const isGiftCard  = !isBtcTrade && /gift\s*card/i.test(rawAsset);
  // product: for BTC show "Bitcoin (BTC)", for gift cards show brand only
  const product     = isBtcTrade
    ? 'Bitcoin (BTC)'
    : isGiftCard
      ? rawAsset.replace(/\s*gift\s*card\s*/i, '').trim() || rawAsset
      : rawAsset;

  // trade ID from notification metadata, trade object, or parsed from message/title
  const newTradeId   = n.trade_id
    || n.trade?.id
    || n.metadata?.trade_id
    || (msg.match(/#([A-F0-9]{6,10})/i) || [])[1]
    || null;

  // ── Visual config — all brand colours ────────────────────────────────────────
  let Icon, accent, headerBg, cardBg, badgeLabel;
  if (isCancelled || isExpired) {
    Icon = XCircle;      accent = C.danger;
    headerBg = `linear-gradient(90deg,#B91C1C,${C.danger})`;
    cardBg = '#FEF2F2';  badgeLabel = isExpired ? 'Expired' : 'Cancelled';
  } else if (isNewTrade) {
    Icon = ShoppingBag;  accent = C.forest;
    headerBg = `linear-gradient(90deg,${C.forest},${C.mint})`;
    cardBg = C.mist;     badgeLabel = 'New Request';
  } else if (isDispute) {
    Icon = AlertTriangle; accent = C.amber;
    headerBg = `linear-gradient(90deg,${C.amber},${C.gold})`;
    cardBg = '#FFFBEB';  badgeLabel = 'Dispute 🚨';
  } else if (isPayment) {
    Icon = CheckCircle;  accent = C.success;
    headerBg = `linear-gradient(90deg,${C.forest},${C.green})`;
    cardBg = C.mist;     badgeLabel = 'Payment';
  } else if (isOfferView) {
    Icon = Eye;          accent = C.purple;
    headerBg = `linear-gradient(90deg,#6D28D9,${C.purple})`;
    cardBg = '#F5F3FF';  badgeLabel = 'Offer Viewed';
  } else {
    Icon = Megaphone;    accent = C.green;
    headerBg = `linear-gradient(90deg,${C.forest},${C.mint})`;
    cardBg = C.mist;     badgeLabel = 'PRAQEN';
  }

  return (
    <button onClick={() => onNavigate(n)}
      className="w-full text-left transition hover:brightness-[0.97]"
      style={{
        borderBottom: `1px solid ${C.g100}`,
        backgroundColor: !n.is_read ? cardBg : '#fff',
        display: 'block', padding: 0,
      }}>

      {/* ── Coloured header strip ─────────────────────────────────────────── */}
      <div style={{
        background: headerBg, padding: '6px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={11} color="#fff" />
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {badgeLabel}
          </span>
          {!n.is_read && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              backgroundColor: '#fff', display: 'inline-block', opacity: 0.9,
            }} />
          )}
        </div>
        <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: 700 }}>
          {relTime(n.created_at)}
        </span>
      </div>

      {/* ── Card body ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 14px' }}>

        {/* ── CANCELLED / EXPIRED ────────────────────────────────────────── */}
        {(isCancelled || isExpired) && (
          <div>
            {/* Trade ref row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              {tradeId ? (
                <span style={{
                  fontSize: 11, fontWeight: 900, fontFamily: 'monospace',
                  padding: '3px 10px', borderRadius: 8,
                  backgroundColor: `${C.danger}12`, color: C.danger,
                  border: `1px solid ${C.danger}25`, letterSpacing: '0.05em',
                }}>
                  #{tradeId}
                </span>
              ) : <span />}
              <span style={{
                fontSize: 9, fontWeight: 900, textTransform: 'uppercase',
                padding: '2px 8px', borderRadius: 20,
                backgroundColor: `${C.danger}15`, color: C.danger,
                border: `1px solid ${C.danger}25`,
              }}>
                ● {isExpired ? 'Expired' : 'Cancelled'}
              </span>
            </div>

            {/* What happened */}
            <div style={{
              backgroundColor: `${C.danger}08`, borderRadius: 10,
              border: `1px solid ${C.danger}20`, padding: '10px 12px', marginBottom: 8,
            }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: C.danger, marginBottom: 3 }}>
                {isExpired ? '⏰ Trade Expired — Time Limit Reached' : '❌ Trade Has Been Cancelled'}
              </p>
              {cancelReason && (
                <p style={{ fontSize: 11, color: C.g600, lineHeight: 1.55, fontWeight: 500, margin: 0 }}>
                  Reason: <strong style={{ color: C.g800 }}>{cancelReason}</strong>
                </p>
              )}
              {isRefund && (
                <p style={{ fontSize: 11, color: C.success, fontWeight: 700, marginTop: 4, marginBottom: 0 }}>
                  ✅ Your BTC has been refunded to your wallet
                </p>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: C.g400, fontWeight: 600 }}>{absTime(n.created_at)}</span>
              {n.action && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, color: C.danger }}>
                  View details <ArrowRight size={10} />
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── NEW TRADE REQUEST ───────────────────────────────────────────── */}
        {isNewTrade && (
          <div>
            {/* Trader row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                background: `linear-gradient(135deg,${C.forest},${C.mint})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 17, color: '#fff',
                border: `2px solid ${C.mint}50`,
              }}>
                {(traderName || 'T')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 900, fontSize: 14, color: C.g800, marginBottom: 1, lineHeight: 1.2 }}>
                  {traderName || 'A trader'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em',
                    padding: '2px 8px', borderRadius: 20,
                    backgroundColor: `${C.success}15`, color: C.success,
                    border: `1px solid ${C.success}40`,
                  }}>
                    ↑ BUYING
                  </span>
                  <span style={{ fontSize: 11, color: C.g500, fontWeight: 600 }}>
                    {isBtcTrade ? 'your Bitcoin' : isGiftCard ? `${product} Gift Card` : product} from you
                  </span>
                </div>
              </div>
              {/* Relative time top-right */}
              <span style={{ fontSize: 10, color: C.g400, fontWeight: 700, flexShrink: 0 }}>
                {relTime(n.created_at)}
              </span>
            </div>

            {/* ── Exchange summary: YOU GIVE ↔ YOU GET ── */}
            <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>

              {/* You Send */}
              <div style={{
                flex: 1, borderRadius: 12, padding: '9px 10px 8px',
                background: `linear-gradient(135deg,${C.forest}12,${C.forest}06)`,
                border: `1.5px solid ${C.forest}30`,
              }}>
                <p style={{ fontSize: 9, fontWeight: 900, color: C.forest, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                  📤 You Send
                </p>
                {btcDisplay ? (
                  <p style={{ fontSize: 13, fontWeight: 900, color: C.forest, marginBottom: 1, lineHeight: 1.2, fontFamily: 'monospace' }}>
                    {btcDisplay}
                  </p>
                ) : (
                  <p style={{ fontSize: 13, fontWeight: 900, color: C.forest, marginBottom: 1, lineHeight: 1.2 }}>
                    ₿ Bitcoin
                  </p>
                )}
                <p style={{ fontSize: 9, color: C.g500, fontWeight: 700, marginTop: 1 }}>
                  from your BTC wallet
                </p>
              </div>

              {/* Arrow */}
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  backgroundColor: C.g100, border: `1px solid ${C.g200}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <ArrowRight size={12} style={{ color: C.g500 }} />
                </div>
              </div>

              {/* You Receive */}
              <div style={{
                flex: 1, borderRadius: 12, padding: '9px 10px 8px',
                background: `linear-gradient(135deg,${C.success}10,${C.success}05)`,
                border: `1.5px solid ${C.success}35`,
              }}>
                <p style={{ fontSize: 9, fontWeight: 900, color: C.success, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                  📥 You Receive
                </p>
                <p style={{ fontSize: 13, fontWeight: 900, color: C.success, marginBottom: 1, lineHeight: 1.2 }}>
                  {amtDisplay || '—'}
                </p>
                <p style={{ fontSize: 9, color: C.g500, fontWeight: 700, marginTop: 1 }}>
                  cash · {payMethod ? payMethod.split(' ')[0] : 'Mobile Money'}
                </p>
              </div>
            </div>

            {/* ── Extra details ── */}
            <div style={{
              borderRadius: 12, border: `1px solid ${C.forest}15`,
              backgroundColor: C.mist, overflow: 'hidden', marginBottom: 10,
            }}>
              {[
                payMethod  && { icon: '📲', label: 'Payment via', value: payMethod },
                newTradeId && { icon: '🔖', label: 'Trade ID',    value: `#${String(newTradeId).slice(0,8).toUpperCase()}`, mono: true },
                             { icon: '🕐', label: 'Time',         value: absTime(n.created_at) },
              ].filter(Boolean).map(({ icon, label, value, mono }, i, arr) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 12px',
                  borderBottom: i < arr.length - 1 ? `1px solid ${C.forest}10` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12 }}>{icon}</span>
                    <span style={{ fontSize: 11, color: C.g500, fontWeight: 700 }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.g800, fontFamily: mono ? 'monospace' : 'inherit' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA button */}
            {n.action && (
              <button style={{
                width: '100%', padding: '9px 0',
                background: `linear-gradient(135deg,${C.forest},${C.green})`,
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 12, fontWeight: 900, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                View & Respond <ArrowRight size={12} />
              </button>
            )}
          </div>
        )}

        {/* ── DISPUTE ─────────────────────────────────────────────────────── */}
        {isDispute && (
          <div>
            {tradeId && (
              <span style={{
                display: 'inline-block', marginBottom: 8,
                fontSize: 11, fontWeight: 900, fontFamily: 'monospace',
                padding: '3px 10px', borderRadius: 8,
                backgroundColor: `${C.warn}15`, color: C.amber,
                border: `1px solid ${C.warn}30`,
              }}>#{tradeId}</span>
            )}
            <div style={{
              backgroundColor: '#FFFBEB', borderRadius: 10,
              border: `1px solid ${C.warn}30`, padding: '10px 12px', marginBottom: 8,
            }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 3 }}>
                🚨 Dispute Filed — Moderator Notified
              </p>
              <p style={{ fontSize: 11, color: C.g600, lineHeight: 1.55, margin: 0 }}>
                {msg.length > 110 ? msg.slice(0, 107) + '…' : msg}
              </p>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginTop: 5, marginBottom: 0 }}>
                ⚠️ Do NOT release funds until the dispute is resolved.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: C.g400, fontWeight: 600 }}>{absTime(n.created_at)}</span>
              {n.action && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, color: C.amber }}>
                  View dispute <ArrowRight size={10} />
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── PAYMENT / BROADCAST / OFFER VIEW / GENERIC ──────────────────── */}
        {!isCancelled && !isExpired && !isNewTrade && !isDispute && (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                backgroundColor: `${accent}12`, border: `1.5px solid ${accent}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={17} style={{ color: accent }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 900, fontSize: 13, color: C.g800, marginBottom: 3 }}>{n.title}</p>
                <p style={{ fontSize: 11, color: C.g600, lineHeight: 1.6, fontWeight: 500, marginBottom: 6 }}>
                  {msg.length > 130 ? msg.slice(0, 127) + '…' : msg}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: C.g400, fontWeight: 600 }}>{absTime(n.created_at)}</span>
                  {n.action && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, color: accent }}>
                      {isOfferView ? 'View offer' : isBroadcast ? 'Read more' : 'View details'} <ArrowRight size={10} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
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
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [user]);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Reload when user switches back to this tab (mobile users, background tabs)
  useEffect(() => {
    if (!user) return;
    const h = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [user]);

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
