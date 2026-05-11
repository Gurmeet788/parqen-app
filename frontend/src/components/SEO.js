import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

const SITE = 'https://praqen.com';

const PAGE_META = {
  '/': {
    title: 'PRAQEN | Buy & Sell Bitcoin P2P in Africa | MTN MoMo, M-Pesa & Bank Transfer',
    description: "PRAQEN is Africa's most trusted P2P Bitcoin & gift card trading platform. Buy or sell Bitcoin instantly with MTN Mobile Money, Airtel, M-Pesa & bank transfer. Escrow-protected, 0.5% flat fee, 180+ countries. No hidden charges.",
    ogTitle: 'PRAQEN — Buy & Sell Bitcoin P2P in Africa',
    ogDesc: "Africa's #1 peer-to-peer Bitcoin trading platform. Escrow-protected trades, 0.5% flat fee, pay with Mobile Money, M-Pesa or bank transfer. Instant & secure.",
  },
  '/buy-bitcoin': {
    title: 'Buy Bitcoin in Africa with Mobile Money | PRAQEN P2P',
    description: 'Buy Bitcoin instantly in Ghana, Nigeria, Kenya & across Africa. Pay with MTN MoMo, M-Pesa, Airtel Money or bank transfer. Best rates, escrow-protected, 0.5% fee.',
    ogTitle: 'Buy Bitcoin in Africa — PRAQEN P2P Marketplace',
    ogDesc: 'Buy BTC with MTN Mobile Money, M-Pesa or bank transfer. Escrow-protected, best P2P rates in Ghana, Nigeria & Kenya.',
  },
  '/sell-bitcoin': {
    title: 'Sell Bitcoin for Mobile Money & Cash in Africa | PRAQEN',
    description: 'Sell Bitcoin instantly for GHS, NGN, KES & more. Receive payment via MTN Mobile Money, M-Pesa, bank transfer. Fast, secure escrow. Best BTC rates in Africa.',
    ogTitle: 'Sell Bitcoin for Cash in Africa — PRAQEN P2P',
    ogDesc: 'Sell BTC and get paid via MTN MoMo, M-Pesa or bank transfer. Best rates in Ghana, Nigeria & Kenya. Escrow-protected.',
  },
  '/gift-cards': {
    title: 'Trade Gift Cards for Bitcoin & Cash in Africa | PRAQEN',
    description: 'Exchange Amazon, iTunes, Steam, Google Play & 50+ gift cards for Bitcoin or cash. Instant payment via Mobile Money. Best rates guaranteed.',
    ogTitle: 'Gift Card to Bitcoin Trading in Africa — PRAQEN',
    ogDesc: 'Sell your Amazon, iTunes, Google Play & Steam gift cards for Bitcoin or mobile money. Instant, escrow-protected, best rates.',
  },
  '/sell-gift-card': {
    title: 'Sell Gift Cards Instantly for Cash in Africa | PRAQEN',
    description: 'Sell unused gift cards instantly in Ghana, Nigeria & Kenya. Get paid in Bitcoin or mobile money. Fast verification, best rates for Amazon, iTunes & more.',
    ogTitle: 'Sell Gift Cards Instantly — PRAQEN',
    ogDesc: 'Turn your gift cards into cash or Bitcoin. Fastest payout in Africa via Mobile Money.',
  },
  '/register': {
    title: 'Create Free Account | PRAQEN P2P Bitcoin Trading Africa',
    description: 'Join PRAQEN and start trading Bitcoin P2P in Africa. Free account, instant verification, escrow-protected trades. MTN MoMo, M-Pesa, bank transfer supported.',
    ogTitle: 'Sign Up Free — PRAQEN P2P Bitcoin Trading',
    ogDesc: 'Create your free PRAQEN account and start buying or selling Bitcoin in Africa today.',
  },
  '/login': {
    title: 'Sign In to PRAQEN | P2P Bitcoin Trading Africa',
    description: 'Sign in to your PRAQEN account to buy and sell Bitcoin, trade gift cards, and manage your P2P trades across Africa.',
    ogTitle: 'Sign In — PRAQEN',
    ogDesc: 'Access your PRAQEN account and continue trading Bitcoin P2P across Africa.',
  },
};

const NOINDEX_PAGES = ['/dashboard', '/wallet', '/settings', '/my-trades', '/my-listings', '/admin', '/moderator'];

export default function SEO({ title, description, noindex }) {
  const { pathname, search } = useLocation();

  const hasQueryParams = search.length > 1;
  const isPrivatePage  = NOINDEX_PAGES.some(p => pathname.startsWith(p));
  const shouldNoIndex  = noindex === true || hasQueryParams || isPrivatePage;

  const meta     = PAGE_META[pathname] || {};
  const pageTitle = title       || meta.title       || 'PRAQEN | Buy & Sell Bitcoin P2P in Africa';
  const pageDesc  = description || meta.description || "Africa's most trusted P2P Bitcoin trading platform. Buy or sell Bitcoin with Mobile Money.";
  const ogTitle   = meta.ogTitle  || pageTitle;
  const ogDesc    = meta.ogDesc   || pageDesc;

  // Canonical always points to the clean path — no query params
  const canonical = `${SITE}${pathname === '/' ? '' : pathname}`;

  const robotsContent = shouldNoIndex
    ? 'noindex, follow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDesc} />
      <meta name="robots" content={robotsContent} />
      <meta name="googlebot" content={robotsContent} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title"       content={ogTitle} />
      <meta property="og:description" content={ogDesc} />
      <meta property="og:url"         content={canonical} />
      <meta property="og:type"        content="website" />
      <meta property="og:site_name"   content="PRAQEN" />
      <meta property="og:image"       content="https://praqen.com/og-image.png" />
      <meta name="twitter:title"       content={ogTitle} />
      <meta name="twitter:description" content={ogDesc} />
    </Helmet>
  );
}
