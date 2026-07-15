import React from 'react';
import { BadgeCheck, Info, ArrowRight, ThumbsUp, ThumbsDown, Crown, Check } from 'lucide-react';
import CountryFlag from './CountryFlag';

// Dark-mode color palette matching the screenshot
const D = {
  bg:        '#252525',
  surface:   '#2E2E2E',
  border:    '#3A3A3A',
  text:      '#FFFFFF',
  subtext:   '#9A9A9A',
  muted:     '#6B6B6B',
  gold:      '#F5A623',
  green:     '#22C55E',
  red:       '#EF4444',
  btnGreen:  '#22C55E',
  btnSell:   '#F59E0B',
};

const FEATURED = {
  SUPER: {
    border: '#F59E0B',
    ribbon: 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
    tag: 'SUPER SELLER',
    icon: 'crown',
    glow: 'rgba(245,158,11,0.25)',
    pulse: true,
  },
  VERIFIED: {
    border: '#3B82F6',
    ribbon: '#3B82F6',
    tag: 'VERIFIED',
    icon: 'check',
    glow: 'rgba(59,130,246,0.18)',
    pulse: false,
  },
};

export default function OfferCard({
  type = 'buy',
  user,      // { username, char, country, isVerified, positive, negative, trades, online, lastSeenStr, badge }
  paymentMethod,
  featuredType,
  pricing,   // { cur, sym, examplePay, btcReceived, fiatEquiv, marginLabel, marginBg, rateLocal, minLimit, maxLimit }
  actions,   // { onViewUser, onAction }
}) {
  const ft = featuredType ? FEATURED[featuredType] : null;

  return (
    <div
      className="rounded-[1.25rem] overflow-hidden w-full transition-all"
      style={{
        backgroundColor: D.bg,
        border: ft ? `1.5px solid ${ft.border}` : 'none',
        boxShadow: ft
          ? `0 0 0 3px ${ft.glow}, 0 12px 40px rgba(0,0,0,0.6)`
          : '0 8px 32px rgba(0,0,0,0.45)',
      }}
    >
      {/* Featured Ribbon */}
      {ft && (
        <div
          className="flex items-center justify-center py-2 gap-1.5"
          style={{ background: ft.ribbon }}
        >
          {ft.icon === 'crown' && <Crown size={12} className="text-white fill-current" />}
          {ft.icon === 'check' && <Check size={12} className="text-white stroke-[4]" />}
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', color: '#fff', textTransform: 'uppercase' }}>
            {ft.tag}
          </span>
        </div>
      )}

      <div className="p-4 pb-3">
        {/* ── Row 1: Avatar + Name + Badge + Trades + Time ── */}
        <div className="flex items-center gap-3 mb-3">

          {/* Avatar */}
          <button
            onClick={actions.onViewUser}
            className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-xl text-white relative"
            style={{ backgroundColor: '#3A3A3A' }}
          >
            {user.char || '?'}
            {user.online && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 flex-shrink-0"
                style={{ backgroundColor: D.green, borderColor: D.bg }}
              />
            )}
          </button>

          {/* Name + verify + badge */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={actions.onViewUser}
                className="font-bold text-[15px] leading-tight truncate hover:underline"
                style={{ color: D.text, maxWidth: '130px' }}
              >
                {user.username}
              </button>

              {user.isVerified && (
                <BadgeCheck size={15} style={{ color: '#3B82F6', flexShrink: 0 }} />
              )}

              {user.badge && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: user.badge.bg,
                    border: `1px solid ${user.badge.borderColor}`,
                    fontSize: '9px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <span style={{ color: user.badge.iconColor || user.badge.textColor }}>{user.badge.icon}</span>
                  <span style={{ color: user.badge.textColor }}>{user.badge.label}</span>
                </span>
              )}
            </div>

            {/* Feedback + Trades on same row */}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-[12px] font-bold" style={{ color: D.gold }}>
                <ThumbsUp size={13} strokeWidth={2.5} /> {user.positive}
              </span>
              <span className="flex items-center gap-1 text-[12px] font-bold" style={{ color: D.red }}>
                <ThumbsDown size={13} strokeWidth={2.5} /> {user.negative}
              </span>
            </div>
          </div>

          {/* Trades + Last Seen (top-right) */}
          <div className="flex-shrink-0 text-right">
            <p className="text-[12px] font-bold" style={{ color: D.subtext }}>
              {user.trades} trades
            </p>
            <p className="text-[11px]" style={{ color: D.muted }}>
              {user.lastSeenStr}
            </p>
          </div>
        </div>

        {/* ── Seller Accepts Pill ── */}
        <div className="mb-4">
          <span
            className="inline-flex items-center px-3 py-1.5 rounded-lg font-bold text-[12px] tracking-wide"
            style={{
              backgroundColor: D.surface,
              color: D.text,
              border: `1px solid ${D.border}`,
            }}
          >
            Seller accepts&nbsp;<span className="font-black uppercase">{paymentMethod}</span>
          </span>
        </div>

        {/* ── Pricing Row ── */}
        <div className="flex items-end justify-between gap-2 mb-1">
          {/* YOU PAY */}
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: D.subtext }}>
              {type === 'buy' ? 'YOU PAY' : 'YOU SELL'}
            </span>
            <span className="font-black leading-none whitespace-nowrap" style={{ color: D.text, fontSize: 'clamp(18px, 4vw, 26px)' }}>
              {pricing.sym}{pricing.examplePay}
            </span>
            <span className="text-[11px] font-bold mt-1 uppercase tracking-wide" style={{ color: D.subtext }}>
              {pricing.cur}
            </span>
          </div>

          {/* YOU RECEIVE */}
          <div className="flex flex-col items-end min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: D.subtext }}>
              {type === 'buy' ? 'YOU RECEIVE' : 'YOU GET'}
            </span>
            {/* Main amount — BTC for buy, fiat for sell */}
            {type === 'buy' ? (
              <span className="font-black leading-none whitespace-nowrap" style={{ color: D.gold, fontSize: 'clamp(13px, 3vw, 18px)' }}>
                {pricing.btcReceived}
                <span className="ml-1 text-[11px] font-black" style={{ color: D.subtext }}>BTC</span>
              </span>
            ) : (
              <span className="font-black leading-none whitespace-nowrap" style={{ color: D.gold, fontSize: 'clamp(16px, 4vw, 22px)' }}>
                {pricing.sym}{pricing.fiatEquiv}
              </span>
            )}
            {/* Secondary line */}
            <span className="text-[11px] font-bold mt-1 text-right whitespace-nowrap" style={{ color: D.subtext }}>
              ≈ {type === 'buy'
                ? `${pricing.sym}${pricing.fiatEquiv} ${pricing.cur}`
                : `₿${pricing.btcReceived}`}
            </span>
            {/* Margin badge */}
            <span
              className="inline-block mt-1.5 font-black px-2 py-0.5 rounded-md text-[10px] text-white whitespace-nowrap"
              style={{ backgroundColor: pricing.marginBg }}
            >
              {pricing.marginLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, backgroundColor: D.border, margin: '0 16px' }} />

      {/* ── Rate + Limits + Action ── */}
      <div className="p-4 pt-3">
        {/* Rate and Limit text */}
        <div className="mb-4">
          <p className="text-[12px] font-bold" style={{ color: D.subtext }}>
            Rate {pricing.sym}{pricing.rateLocal}/BTC
          </p>
          {(pricing.minLimit || pricing.maxLimit) && (
            <p className="text-[12px] font-bold mt-0.5" style={{ color: D.subtext }}>
              Available LIMIT {pricing.cur} {pricing.minLimit} - {pricing.maxLimit}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={actions.onViewUser}
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:opacity-80"
            style={{ backgroundColor: D.surface, border: `1px solid ${D.border}`, color: D.subtext }}
          >
            <Info size={18} />
          </button>

          <button
            onClick={actions.onAction}
            className="flex-1 h-12 rounded-xl font-black text-[15px] tracking-wide flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              backgroundColor: type === 'buy' ? D.btnGreen : D.btnSell,
              color: type === 'buy' ? '#fff' : '#1A1A1A',
              boxShadow: type === 'buy'
                ? '0 4px 20px rgba(34,197,94,0.35)'
                : '0 4px 20px rgba(245,158,11,0.35)',
            }}
          >
            {type === 'buy' ? 'Buy BTC' : 'Sell BTC'}
          </button>
        </div>
      </div>
    </div>
  );
}
