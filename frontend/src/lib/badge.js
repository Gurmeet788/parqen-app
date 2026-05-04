// Single source of truth for all badge definitions across the app.
// Import TRUST_MAP, deriveBadge, and BadgeChip from here — never define them per-page.

export const TRUST_MAP = {
  LEGEND:     { label:'LEGEND',     icon:'♛', iconColor:'#92400E', textColor:'#78350F', borderColor:'#F59E0B', bg:'linear-gradient(135deg,#FEF3C7,#FDE68A)', glow:'rgba(245,158,11,0.65)', animate:true  },
  AMBASSADOR: { label:'AMBASSADOR', icon:'◈', iconColor:'#99F6E4', textColor:'#FFFFFF', borderColor:'#0D9488', bg:'linear-gradient(135deg,#0D9488,#2D6A4F)', glow:'rgba(13,148,136,0.45)'               },
  EXPERT:     { label:'EXPERT',     icon:'▲', iconColor:'#7DD3FC', textColor:'#FFFFFF', borderColor:'#3B82F6', bg:'linear-gradient(135deg,#1E3A5F,#1E40AF)', glow:'rgba(59,130,246,0.45)'               },
  PRO:        { label:'PRO',        icon:'●', iconColor:'#059669', textColor:'#065F46', borderColor:'#34D399', bg:'linear-gradient(135deg,#D1FAE5,#A7F3D0)', glow:'rgba(52,211,153,0.4)'                },
  ACTIVE:     { label:'Active',     icon:'●', iconColor:'#22C55E', textColor:'#166534', borderColor:'#86EFAC', bg:'linear-gradient(135deg,#F0FDF4,#DCFCE7)', glow:'rgba(134,239,172,0.35)'              },
  BEGINNER:   { label:'NEW ✦',      icon:'🌱', iconColor:null,     textColor:'#7C3AED', borderColor:'#C4B5FD', bg:'linear-gradient(135deg,#EDE9FE,#F5F3FF)', glow:'rgba(167,139,250,0.5)',  animate:true },
};

export function deriveBadge(u) {
  if (u?.badge) {
    const b = String(u.badge).toUpperCase();
    if (TRUST_MAP[b]) return TRUST_MAP[b];
  }
  const t = parseInt(u?.total_trades ?? u?.trade_count ?? 0);
  if (t >= 500) return TRUST_MAP.LEGEND;
  if (t >= 200) return TRUST_MAP.AMBASSADOR;
  if (t >= 100) return TRUST_MAP.EXPERT;
  if (t >= 25)  return TRUST_MAP.PRO;
  if (t >= 5)   return TRUST_MAP.ACTIVE;
  return TRUST_MAP.BEGINNER;
}

// Drop-in React component for rendering a badge pill consistently everywhere.
// Works with both Tailwind and inline-style pages.
export function BadgeChip({ user, className = '' }) {
  const badge = deriveBadge(user);
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-black px-1.5 py-0.5 rounded-full border flex-shrink-0 ${badge.animate ? 'shadow-md' : ''} ${className}`}
      style={{
        background: badge.bg,
        borderColor: badge.borderColor,
        boxShadow: badge.glow ? `0 0 8px ${badge.glow}` : undefined,
      }}
    >
      <span style={{ color: badge.iconColor || badge.textColor }}>{badge.icon}</span>
      <span style={{ color: badge.textColor }}>{badge.label}</span>
    </span>
  );
}
