import { useState } from 'react';
import { Link } from 'react-router-dom';

const SOCIALS = [
  { label: 'TikTok', href: 'https://www.tiktok.com/@praqen', bg: 'rgba(0,0,0,0.55)', color: '#ffffff',
    svg: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  { label: 'Instagram', href: 'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr', bg: 'rgba(228,64,95,0.3)', color: '#E4405F',
    svg: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z' },
  { label: 'X (Twitter)', href: 'https://x.com/praqenapp?s=21', bg: 'rgba(255,255,255,0.12)', color: '#ffffff',
    svg: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  { label: 'Discord', href: 'https://discord.gg/V6zCZxfdy', bg: 'rgba(88,101,242,0.35)', color: '#5865F2',
    svg: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/pra-qen-045373402/', bg: 'rgba(10,102,194,0.35)', color: '#0A66C2',
    svg: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
];

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Buy Bitcoin', to: '/buy-bitcoin' },
      { label: 'Sell Bitcoin', to: '/sell-bitcoin' },
      { label: 'Gift Cards', to: '/gift-cards' },
      { label: 'Wallet', to: '/wallet' },
      { label: 'Affiliate Program', to: '/affiliate' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About Us', to: '/about' },
      { label: 'Blog', to: '/blog' },
      { label: 'Careers', to: '/careers' },
      { label: 'Contact', to: '/contact' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: 'Help Center', to: '/help' },
      { label: 'Trust & Safety', to: '/trust-safety' },
      { label: 'Fees', to: '/fees' },
      { label: 'Status', to: '/status' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'AML Policy', to: '/aml' },
    ],
  },
];

const TRUST_BADGES = [
  { label: 'SSL Secured', icon: '🔒' },
  { label: 'Escrow Protected', icon: '🛡️' },
  { label: '24/7 Support', icon: '🕑' },
];

export default function PRQFooter() {
  const [openSection, setOpenSection] = useState(null);

  return (
    <footer style={{
      background: 'linear-gradient(160deg,#040f08 0%,#0c2218 60%,#163d28 100%)',
      fontFamily: "'DM Sans',sans-serif",
      borderTop: '1px solid rgba(64,145,108,0.25)',
      width: '100%', boxSizing: 'border-box',
    }}>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-6">

        {/* ── Brand block — shared by both mobile & desktop, own breathing room ── */}
        <div className="mb-8 sm:hidden">
          <div className="flex items-center gap-2 mb-3.5">
            <div style={{
              width: 32, height: 32, borderRadius: 9, background: '#F4A422',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 900, color: '#0D1F14', fontFamily: 'Georgia,serif',
              boxShadow: '0 2px 8px rgba(244,164,34,0.45)',
            }}>P</div>
            <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.4px' }}>
              <span style={{ color: '#ffffff' }}>PRA</span><span style={{ color: '#F4A422' }}>QEN</span>
            </span>
          </div>
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Africa's trusted peer-to-peer Bitcoin trading platform. Buy and sell BTC safely with escrow protection on every trade.
          </p>
          <div className="flex items-center gap-2.5">
            {SOCIALS.map(s => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" title={s.label}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: s.bg }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill={s.color} aria-hidden="true"><path d={s.svg} /></svg>
              </a>
            ))}
          </div>
        </div>

        {/* ── Mobile: tap-to-expand accordion — avoids a long wall of cramped links ── */}
        <div className="sm:hidden" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {COLUMNS.map(col => {
            const isOpen = openSection === col.heading;
            return (
              <div key={col.heading} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  onClick={() => setOpenSection(isOpen ? null : col.heading)}
                  className="w-full flex items-center justify-between py-4"
                  style={{ background: 'none', border: 'none' }}>
                  <span className="text-sm font-black uppercase tracking-wider" style={{ color: isOpen ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                    {col.heading}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {isOpen && (
                  <ul className="pb-4 space-y-1">
                    {col.links.map(l => (
                      <li key={l.label}>
                        <Link to={l.to} className="block text-sm font-medium py-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Desktop / tablet: brand + full link columns, unchanged ── */}
        <div className="hidden sm:grid grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-10">

          <div className="col-span-3 lg:col-span-2 pr-0 lg:pr-6">
            <div className="flex items-center gap-2 mb-3">
              <div style={{
                width: 28, height: 28, borderRadius: 9, background: '#F4A422',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 900, color: '#0D1F14', fontFamily: 'Georgia,serif',
                boxShadow: '0 2px 8px rgba(244,164,34,0.45)',
              }}>P</div>
              <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.4px' }}>
                <span style={{ color: '#eeeeee' }}>PRA</span><span style={{ color: '#F4A422' }}>QEN</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 320 }}>
              Africa's trusted peer-to-peer Bitcoin trading platform. Buy and sell BTC safely with escrow protection on every trade.
            </p>
            <div className="flex items-center gap-2">
              {SOCIALS.map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" title={s.label}
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition"
                  style={{ backgroundColor: s.bg }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill={s.color} aria-hidden="true"><path d={s.svg} /></svg>
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map(col => (
            <div key={col.heading}>
              <h4 className="text-xs font-black uppercase tracking-wider mb-3.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {col.heading}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map(l => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm font-medium transition"
                      style={{ color: 'rgba(255,255,255,0.65)' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.65)'}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Bottom bar: copyright + trust badges ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 sm:mt-10 pt-6"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              © {new Date().getFullYear()} PRAQEN. All rights reserved.
            </span>
            <a href="mailto:hello@praqen.com" className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              hello@praqen.com
            </a>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {TRUST_BADGES.map(b => (
              <span key={b.label} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ color: '#6EE7B7', background: 'rgba(64,145,108,0.15)', border: '1px solid rgba(64,145,108,0.3)' }}>
                {b.icon} {b.label}
              </span>
            ))}
          </div>
        </div>

      </div>
    </footer>
  );
}
