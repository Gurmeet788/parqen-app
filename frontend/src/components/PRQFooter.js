import { useNavigate } from 'react-router-dom';

const SOCIALS = [
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@praqen',
    bg: 'rgba(0,0,0,0.55)',
    color: '#ffffff',
    svg: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr',
    bg: 'rgba(228,64,95,0.3)',
    color: '#E4405F',
    svg: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z',
  },
  {
    label: 'X (Twitter)',
    href: 'https://x.com/praqenapp?s=21',
    bg: 'rgba(255,255,255,0.12)',
    color: '#ffffff',
    svg: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    label: 'WhatsApp Community',
    href: 'https://chat.whatsapp.com/LHVjrw9SK8qGoXcKvprjWz?mode=gi_t',
    bg: 'rgba(37,211,102,0.25)',
    color: '#25D366',
    svg: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z',
  },
  {
    label: 'Discord',
    href: 'https://discord.gg/V6zCZxfdy',
    bg: 'rgba(88,101,242,0.35)',
    color: '#5865F2',
    svg: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/pra-qen-045373402/',
    bg: 'rgba(10,102,194,0.35)',
    color: '#0A66C2',
    svg: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
];

const STEPS = [
  { icon:'🔍', step:'01', title:'Find Trusted Offer',  desc:'Browse listings & check seller profile, ratings & verified status' },
  { icon:'💳', step:'02', title:'Select Payment',      desc:'Pick MTN MoMo, Bank or any preferred payment option' },
  { icon:'⚡', step:'03', title:'Open Trade · 1 Min',  desc:'Funds locked in escrow instantly — safe & automatic' },
  { icon:'₿',  step:'04', title:'BTC in Your Wallet',  desc:'Confirm payment · BTC released free to any wallet of your choice' },
];

export default function PRQFooter() {
  const nav = useNavigate();

  return (
    <div className="pb-16 md:pb-0" style={{
      background: 'linear-gradient(160deg,#040f08 0%,#0c2218 45%,#163d28 100%)',
      fontFamily: "'DM Sans',sans-serif",
      borderTop: '1px solid rgba(64,145,108,0.3)',
      width: '100%',
      boxSizing: 'border-box',
      overflowX: 'hidden',
    }}>

      {/* ── How to Buy — 4 step cards ── */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', boxSizing: 'border-box' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, minWidth: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: 1.1, whiteSpace: 'nowrap' }}>
            How to Buy Bitcoin
          </span>
          <span style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.06)', minWidth: 0 }}/>
          <span style={{
            fontSize: 9, fontWeight: 800, color: '#6EE7B7',
            background: 'rgba(64,145,108,0.2)', border: '1px solid rgba(64,145,108,0.35)',
            borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0,
          }}>Done in 60 sec ⚡</span>
        </div>

        {/* 2-col on phone, 4-col on wider screens */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 7,
          width: '100%',
          boxSizing: 'border-box',
        }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{
              background: 'rgba(45,106,79,0.15)',
              border: '1px solid rgba(64,145,108,0.22)',
              borderRadius: 10,
              padding: '9px 10px',
              position: 'relative',
              overflow: 'hidden',
              boxSizing: 'border-box',
              minWidth: 0,
            }}>
              <span style={{
                position: 'absolute', top: 4, right: 7,
                fontSize: 18, fontWeight: 900, color: 'rgba(64,145,108,0.1)',
                lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
              }}>{s.step}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{s.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: '#6EE7B7', lineHeight: 1.2, minWidth: 0 }}>{s.title}</span>
              </div>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.42)', fontWeight: 500, lineHeight: 1.45 }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Promo strip */}
        <div style={{
          marginTop: 9,
          padding: '7px 10px',
          background: 'rgba(244,164,34,0.07)',
          border: '1px solid rgba(244,164,34,0.15)',
          borderRadius: 8,
          boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 12, flexShrink: 0 }}>🚀</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#F4A422' }}>Be the first to create your offer</span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', fontWeight: 600, lineHeight: 1.5, marginBottom: 7 }}>
            Sell to MTN MoMo or Bank Account — instant payout in 1 min.
            Send BTC free to any wallet of your choice.
          </div>
          <button
            onClick={() => nav('/create-offer')}
            style={{
              width: '100%',
              padding: '7px 0', borderRadius: 8,
              border: '1px solid rgba(244,164,34,0.4)',
              background: 'rgba(244,164,34,0.12)',
              color: '#F4A422', fontWeight: 800, fontSize: 11, cursor: 'pointer',
              boxSizing: 'border-box',
            }}>
            + Create Your Offer Now
          </button>
        </div>
      </div>

      {/* ── Tagline + Buy CTA ── */}
      <div style={{
        padding: '10px 14px 0',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '3px 6px', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', whiteSpace: 'nowrap' }}>Keep Trading.</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#F4A422', whiteSpace: 'nowrap' }}>Keep Growing.</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.38)' }}>· Africa's most trusted P2P platform · Start in 30 sec</span>
        </div>
        <button
          onClick={() => nav('/buy-bitcoin')}
          style={{
            width: '100%',
            padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#2D6A4F,#40916C)',
            color: '#fff', fontWeight: 800, fontSize: 12,
            boxShadow: '0 2px 10px rgba(45,106,79,0.4)',
            boxSizing: 'border-box',
          }}>
          ₿ Buy Bitcoin Now
        </button>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '9px 14px' }}/>

      {/* ── Socials + email + legal ── */}
      <div style={{
        padding: '0 14px 12px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        gap: '5px 8px',
        boxSizing: 'border-box',
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Follow &amp; Connect
        </span>

        {SOCIALS.map(s => (
          <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" title={s.label}
            style={{
              width: 28, height: 28, borderRadius: 7, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              backgroundColor: s.bg, textDecoration: 'none', transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity='0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity='1'}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill={s.color} aria-hidden="true">
              <path d={s.svg}/>
            </svg>
          </a>
        ))}

        <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 10 }}>·</span>

        <a href="mailto:support@praqen.com"
          style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ✉️ support@praqen.com
        </a>

        <span style={{
          fontSize: 9, fontWeight: 800,
          background: 'rgba(64,145,108,0.22)', border: '1px solid rgba(64,145,108,0.38)',
          color: '#6EE7B7', padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap',
        }}>24/7 Support</span>

        <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 10 }}>·</span>

        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>© {new Date().getFullYear()} PRAQEN</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.16)', fontWeight: 600 }}>🔒 SSL Encrypted</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.16)', fontWeight: 600 }}>Escrow-Protected Trades</span>
      </div>

    </div>
  );
}
