import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  ShoppingCart,
  Gift,
  TrendingUp,
  Wallet,
  MessageCircle,
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Bitcoin,
  PartyPopper,
  Rocket,
  Home,
  Zap,
  ShoppingBag,
  LineChart,
  Coins,
  Smartphone,
  Mail,
} from "lucide-react";

const C = {
  forest: "#1B4332",
  green: "#2D6A4F",
  mint: "#40916C",
  gold: "#F4A422",
  mist: "#F0FAF5",
  white: "#FFFFFF",
  g100: "#F1F5F9",
  g200: "#E2E8F0",
  g400: "#94A3B8",
  g500: "#64748B",
  g700: "#334155",
};

const STEPS = [
  {
    icon: PartyPopper,
    bg: `linear-gradient(135deg, ${C.forest} 0%, ${C.mint} 100%)`,
    iconBg: "rgba(244,164,34,0.2)",
    title: (name) => `Welcome to PRAQEN${name ? `, ${name}` : ""}!`,
    body: "You've joined the world's most trusted peer-to-peer Bitcoin & USDT marketplace. We're so glad you're here — think of PRAQEN as your secure home to buy, sell and trade Bitcoin & USDT freely and confidently.",
    bodyIcon: Home,
    cta: null,
    ctaPath: null,
  },
  {
    icon: Shield,
    bg: `linear-gradient(135deg, #1e3a5f 0%, #2563EB 100%)`,
    iconBg: "rgba(255,255,255,0.15)",
    title: () => "Verify Your Details — Stay Safe",
    body: "Before you trade, please verify your email address, phone number, and upload your ID (KYC). This keeps you and your trading partners protected and unlocks higher trade limits. Go to Settings → Verification to get started.",
    cta: "→ Go to Settings & Verify",
    ctaPath: "/settings?tab=verification",
  },
  {
    icon: Bitcoin,
    bg: `linear-gradient(135deg, #78350F 0%, #D97706 100%)`,
    iconBg: "rgba(255,255,255,0.15)",
    title: () => "Buying Bitcoin is Easy!",
    body: "Visit the Buy Bitcoin page, browse our trusted vendors, pick the best rate and payment method that works for you, then open a trade. Your Bitcoin is safely held in escrow until payment is confirmed. Fast, safe and simple!",
    bodyIcon: Zap,
    cta: "→ Browse Bitcoin Sellers",
    ctaPath: "/buy-bitcoin",
  },
  {
    icon: Gift,
    bg: `linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)`,
    iconBg: "rgba(255,255,255,0.15)",
    title: () => "Got a Gift Card? Cash It In!",
    body: "Turn your unused gift cards into Bitcoin in minutes! Visit the Gift Card Marketplace, find trusted buyers, open a trade and receive Bitcoin straight to your PRAQEN wallet.",
    bodyIcon: ShoppingBag,
    cta: "→ Visit Gift Card Marketplace",
    ctaPath: "/gift-cards",
  },
  {
    icon: TrendingUp,
    bg: `linear-gradient(135deg, ${C.forest} 0%, #065F46 100%)`,
    iconBg: "rgba(255,255,255,0.15)",
    title: () => "Sell Bitcoin & Create Your Offers",
    body: "Want to sell Bitcoin for cash? Visit the Sell page, pick a trusted buyer and open a trade. You can also create your own buy/sell offers and build your reputation.",
    bodyIcon: LineChart,
    cta: "→ Go to Sell Page",
    ctaPath: "/sell-bitcoin",
  },
  {
    icon: Rocket,
    bg: `linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)`,
    iconBg: "rgba(255,255,255,0.15)",
    title: () => "Earn Bitcoin by Referring Friends!",
    body: "PRAQEN's Affiliate Program lets you earn Bitcoin commission on every trade your referrals make. Share your referral link and start earning.",
    bodyIcon: Coins,
    cta: "→ See My Affiliate Dashboard",
    ctaPath: "/dashboard",
  },
  {
    icon: MessageCircle,
    bg: `linear-gradient(135deg, #134E4A 0%, #0F766E 100%)`,
    iconBg: "rgba(255,255,255,0.15)",
    title: () => "We're Always Here for You",
    body: "Any questions or issues? Reach our friendly support team at hello@praqen.com or through our social handles. Remember — always trade within PRAQEN to stay protected. Your safety is our top priority.",
    bodyIcon: Rocket,
    cta: "Start Trading Now!",
    ctaPath: "/buy-bitcoin",
    isLast: true,
  },
];

export default function WelcomeModal({ user, onClose }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const name = user?.username || user?.full_name?.split(" ")[0] || "";

  const handleClose = () => {
    if (user?.id) localStorage.setItem(`prq_welcomed_${user.id}`, "1");
    onClose();
  };

  const handleCta = () => {
    if (current.ctaPath) {
      if (current.isLast) handleClose();
      navigate(current.ctaPath);
      if (!current.isLast) setStep((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (isLast) handleClose();
    else setStep((s) => s + 1);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{
        backgroundColor: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
      }}
    >
      <style>{`
        @keyframes prq-welcome-up {
          from { transform: translateY(60px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes prq-step-in {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          maxHeight: "92dvh",
          animation: "prq-welcome-up .32s cubic-bezier(0.34,1.2,0.64,1)",
        }}
      >
        {/* ── Coloured Header ── */}
        <div
          className="relative flex-shrink-0 px-6 pt-8 pb-7"
          style={{ background: current.bg, transition: "background 0.4s ease" }}
        >
          {/* Skip */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <X size={16} />
          </button>

          {/* Icon badge */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              backgroundColor: current.iconBg,
              border: "2px solid rgba(255,255,255,0.2)",
            }}
          >
            <Icon size={32} color="#fff" strokeWidth={2.2} />
          </div>

          <h2
            className="text-xl font-black text-white leading-tight mb-1"
            style={{
              fontFamily: "'DM Sans',sans-serif",
              animation: "prq-step-in .3s ease",
            }}
            key={`title-${step}`}
          >
            {current.title(name)}
          </h2>

          {/* Step counter */}
          <p className="text-white/50 text-xs font-bold">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>

        {/* ── Body ── */}
        <div
          className="flex-1 overflow-y-auto px-6 py-5"
          key={`body-${step}`}
          style={{ animation: "prq-step-in .3s ease" }}
        >
          <p className="text-sm leading-relaxed" style={{ color: C.g700 }}>
            {current.body}
          </p>

          {/* CTA Button */}
          {current.cta && (
            <button
              onClick={handleCta}
              className="mt-4 w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition"
              style={{ backgroundColor: C.forest, color: C.white }}
            >
              {current.cta}
            </button>
          )}

          {/* Last step — contact info */}
          {current.isLast && (
            <div
              className="mt-4 rounded-xl p-4 space-y-2"
              style={{ backgroundColor: C.mist, border: `1px solid ${C.g200}` }}
            >
              <p
                className="text-xs font-black uppercase tracking-wider"
                style={{ color: C.g400 }}
              >
                Contact & Support
              </p>
              <div className="flex items-center gap-2">
                <Mail size={18} className="text-base" />
                <a
                  href="mailto:hello@hellopraqen.com"
                  className="text-xs font-bold"
                  style={{ color: C.green }}
                >
                  hello@hellopraqen.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone size={18} className="text-base" />
                <span
                  className="text-xs font-semibold"
                  style={{ color: C.g500 }}
                >
                  Follow us on our social handles for updates
                </span>
              </div>
              <div
                className="mt-2 p-3 rounded-lg text-xs font-bold text-center"
                style={{
                  backgroundColor: "#FEF3C7",
                  color: "#92400E",
                  border: "1px solid #FDE68A",
                }}
              >
                ⚠️ Always trade within PRAQEN — never outside our platform
              </div>
            </div>
          )}
        </div>

        {/* ── Footer Navigation ── */}
        <div
          className="px-6 pb-6 pt-3 flex-shrink-0 border-t"
          style={{ borderColor: C.g100 }}
        >
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? 20 : 7,
                  height: 7,
                  backgroundColor: i === step ? C.forest : C.g200,
                }}
              />
            ))}
          </div>

          {/* Prev / Next */}
          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-100 transition"
                style={{ color: C.g500, border: `1px solid ${C.g200}` }}
              >
                <ChevronLeft size={15} /> Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition"
              style={{
                backgroundColor: isLast ? C.gold : C.green,
                color: C.white,
              }}
            >
              {isLast ? (
                <>
                  <CheckCircle size={15} /> Done — Let's Trade!
                </>
              ) : (
                <>
                  Next <ChevronRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
