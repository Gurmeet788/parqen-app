import { useNavigate } from "react-router-dom";
import { Search, CreditCard, Zap, Bitcoin } from "lucide-react";

const SOCIALS = [
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@praqen",
    bg: "rgba(0,0,0,0.55)",
    color: "#ffffff",
    svg: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr",
    bg: "rgba(228,64,95,0.3)",
    color: "#E4405F",
    svg: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  {
    label: "X (Twitter)",
    href: "https://x.com/praqenapp?s=21",
    bg: "rgba(255,255,255,0.12)",
    color: "#ffffff",
    svg: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "Discord",
    href: "https://discord.gg/V6zCZxfdy",
    bg: "rgba(88,101,242,0.35)",
    color: "#5865F2",
    svg: "M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/pra-qen-045373402/",
    bg: "rgba(10,102,194,0.35)",
    color: "#0A66C2",
    svg: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
];

const STEPS = [
  {
    icon: Search,
    step: "01",
    title: "Find Trusted Offer",
    desc: "Browse listings & check seller profile, ratings & verified status",
  },
  {
    icon: CreditCard,
    step: "02",
    title: "Select Payment",
    desc: "Pick MTN MoMo, Bank or any preferred payment option",
  },
  {
    icon: Zap,
    step: "03",
    title: "Open Trade · 1 Min",
    desc: "Funds locked in escrow instantly — safe & automatic",
  },
  {
    icon: Bitcoin,
    step: "04",
    title: "BTC in Your Wallet",
    desc: "Confirm payment · BTC released free to any wallet of your choice",
  },
];

export default function PRQFooter() {
  const nav = useNavigate();

  return (
    <div
      style={{
        background:
          "linear-gradient(160deg,#040f08 0%,#0c2218 60%,#163d28 100%)",
        fontFamily: "'DM Sans',sans-serif",
        borderTop: "1px solid rgba(64,145,108,0.25)",
        width: "100%",
        boxSizing: "border-box",
        overflowX: "hidden",
      }}
    >
      {/* ── How to Buy — horizontal scroll steps ── */}
      <div
        style={{
          padding: "10px 14px 8px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 8,
              fontWeight: 900,
              color: "rgba(255,255,255,0.25)",
              textTransform: "uppercase",
              letterSpacing: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            How to Buy
          </span>
          <span
            style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.05)" }}
          />
          <span
            style={{
              fontSize: 8,
              fontWeight: 800,
              color: "#6EE7B7",
              background: "rgba(64,145,108,0.2)",
              border: "1px solid rgba(64,145,108,0.3)",
              borderRadius: 4,
              padding: "2px 6px",
              whiteSpace: "nowrap",
            }}
          >
            60 sec
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {STEPS.map((s, i) => {
            const Icon = s.icon;

            return (
              <div
                key={i}
                style={{
                  flex: "0 0 auto",
                  width: 130,
                  background: "rgba(45,106,79,0.12)",
                  border: "1px solid rgba(64,145,108,0.18)",
                  borderRadius: 8,
                  padding: "7px 9px",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 3,
                  }}
                >
                  <Icon size={12} color="#6EE7B7" style={{ flexShrink: 0 }} />

                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: "#6EE7B7",
                      lineHeight: 1.2,
                    }}
                  >
                    {s.title}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 8.5,
                    color: "rgba(255,255,255,0.38)",
                    fontWeight: 500,
                    lineHeight: 1.4,
                  }}
                >
                  {s.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Create offer strip ── */}
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "#F4A422",
              marginBottom: 1,
            }}
          >
            Create your offer
          </div>
          <div
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.35)",
              fontWeight: 500,
            }}
          >
            Sell BTC — instant payout via MTN MoMo or Bank
          </div>
        </div>
        <button
          onClick={() => nav("/create-offer")}
          style={{
            flexShrink: 0,
            padding: "6px 11px",
            borderRadius: 7,
            border: "1px solid rgba(244,164,34,0.35)",
            background: "rgba(244,164,34,0.1)",
            color: "#F4A422",
            fontWeight: 800,
            fontSize: 10,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Create
        </button>
      </div>

      {/* ── Tagline + CTA ── */}
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.2,
            }}
          >
            Keep Trading.{" "}
            <span style={{ color: "#F4A422" }}>Keep Growing.</span>
          </div>
          <div
            style={{
              fontSize: 8,
              color: "rgba(255,255,255,0.3)",
              fontWeight: 500,
              marginTop: 2,
            }}
          >
            The world's most trusted P2P platform
          </div>
        </div>
        <button
          onClick={() => nav("/buy-bitcoin")}
          style={{
            flexShrink: 0,
            padding: "7px 13px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg,#2D6A4F,#40916C)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 10,
            boxShadow: "0 2px 8px rgba(45,106,79,0.35)",
            whiteSpace: "nowrap",
          }}
        >
          ₿ Buy Now
        </button>
      </div>

      {/* ── Socials + legal ── */}
      <div
        style={{
          padding: "8px 14px 10px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "5px 7px",
        }}
      >
        <span
          style={{
            fontSize: 8,
            fontWeight: 900,
            color: "rgba(255,255,255,0.22)",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Follow
        </span>

        {SOCIALS.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            title={s.label}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              backgroundColor: s.bg,
              textDecoration: "none",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill={s.color}
              aria-hidden="true"
            >
              <path d={s.svg} />
            </svg>
          </a>
        ))}

        <span style={{ color: "rgba(255,255,255,0.08)", fontSize: 10 }}>·</span>
        <a
          href="mailto:hello@praqen.com"
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "rgba(255,255,255,0.35)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          hello@praqen.com
        </a>
        <span
          style={{
            fontSize: 8,
            fontWeight: 800,
            background: "rgba(64,145,108,0.2)",
            border: "1px solid rgba(64,145,108,0.3)",
            color: "#6EE7B7",
            padding: "1px 5px",
            borderRadius: 4,
            whiteSpace: "nowrap",
          }}
        >
          24/7
        </span>
        <span style={{ color: "rgba(255,255,255,0.08)", fontSize: 10 }}>·</span>
        <span
          style={{
            fontSize: 8,
            color: "rgba(255,255,255,0.2)",
            fontWeight: 500,
          }}
        >
          © {new Date().getFullYear()} PRAQEN
        </span>
        <span
          style={{
            fontSize: 8,
            color: "rgba(255,255,255,0.15)",
            fontWeight: 500,
          }}
        >
          🔒 SSL
        </span>
        <span
          style={{
            fontSize: 8,
            color: "rgba(255,255,255,0.15)",
            fontWeight: 500,
          }}
        >
          Escrow Protected
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 9,
            fontWeight: 800,
            color: "#F6821F",
            background: "rgba(246,130,31,0.1)",
            border: "1px solid rgba(246,130,31,0.25)",
            padding: "2px 6px",
            borderRadius: 5,
            whiteSpace: "nowrap",
          }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
          </svg>
          Cloudflare Protected
        </span>
      </div>
    </div>
  );
}
