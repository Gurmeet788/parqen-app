// Single source of truth for all badge definitions across the app.
// Import TRUST_MAP, deriveBadge, and BadgeChip from here — never define them per-page.

import {
  Shield,
  Zap,
  Briefcase,
  Target,
  Medal,
  Crown,
  Diamond,
  Flame,
  Rocket,
  Trophy,
} from "lucide-react";

export const TRUST_MAP = {
  BEGINNER: {
    label: "BEGINNER",
    Icon: Shield,
    color: "#22C55E",
    bg: "#F0FDF4",
    borderColor: "#22C55E",
  },

  ACTIVE: {
    label: "ACTIVE",
    Icon: Zap,
    color: "#3B82F6",
    bg: "#EFF6FF",
    borderColor: "#3B82F6",
  },

  PRO: {
    label: "PRO",
    Icon: Briefcase,
    color: "#8B5CF6",
    bg: "#F5F3FF",
    borderColor: "#8B5CF6",
  },

  EXPERT: {
    label: "EXPERT",
    Icon: Target,
    color: "#F97316",
    bg: "#FFF7ED",
    borderColor: "#F97316",
  },

  AMBASSADOR: {
    label: "AMBASSADOR",
    Icon: Medal,
    color: "#14B8A6",
    bg: "#F0FDFA",
    borderColor: "#14B8A6",
  },

  LEGEND: {
    label: "LEGEND",
    Icon: Crown,
    color: "#EAB308",
    bg: "#FEFCE8",
    borderColor: "#EAB308",
  },

  ELITE: {
    label: "ELITE",
    Icon: Trophy,
    color: "#EF4444",
    bg: "#FEF2F2",
    borderColor: "#EF4444",
  },

  DIAMOND: {
    label: "DIAMOND",
    Icon: Diamond,
    color: "#06B6D4",
    bg: "#ECFEFF",
    borderColor: "#06B6D4",
  },

  TITAN: {
    label: "TITAN",
    Icon: Flame,
    color: "#EC4899",
    bg: "#FDF2F8",
    borderColor: "#EC4899",
  },

  GODMODE: {
    label: "GODMODE",
    Icon: Rocket,
    color: "#FFFFFF",
    bg: "linear-gradient(90deg,#FF0080,#FF8C00,#40E0D0)",
    borderColor: "#FF8C00",
  },
};

export function deriveBadge(user) {
  if (user?.badge) {
    const b = String(user.badge).toUpperCase();
    if (TRUST_MAP[b]) return TRUST_MAP[b];
  }

  const t = Number(user?.total_trades ?? user?.trade_count ?? 0);

  if (t >= 1500) return TRUST_MAP.GODMODE;
  if (t >= 1000) return TRUST_MAP.TITAN;
  if (t >= 750) return TRUST_MAP.DIAMOND;
  if (t >= 500) return TRUST_MAP.ELITE;
  if (t >= 300) return TRUST_MAP.LEGEND;
  if (t >= 200) return TRUST_MAP.AMBASSADOR;
  if (t >= 100) return TRUST_MAP.EXPERT;
  if (t >= 25) return TRUST_MAP.PRO;
  if (t >= 5) return TRUST_MAP.ACTIVE;

  return TRUST_MAP.BEGINNER;
}

// Drop-in React component for rendering a badge pill consistently everywhere.
// Works with both Tailwind and inline-style pages.
export function BadgeChip({ user, className = "" }) {
  const badge = deriveBadge(user);
  const Icon = badge.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${className}`}
      style={{
        background: badge.bg,
        borderColor: badge.borderColor,
      }}
    >
      <Icon size={14} strokeWidth={2.2} style={{ color: badge.color }} />

      <span style={{ color: badge.color }}>{badge.label}</span>
    </span>
  );
}
