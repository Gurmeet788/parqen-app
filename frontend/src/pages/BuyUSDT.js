import { useState, useEffect, useRef } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useNavigate, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import axios from 'axios';
import {
  Bitcoin, CheckCircle, RefreshCw,
  AlertTriangle, BadgeCheck, Timer,
  Heart, MapPin, X, Info, Shield, ArrowRight, PlusCircle,
  Filter, Home, Wallet, User, Gift,
  ChevronDown, TrendingUp, BarChart2, ThumbsUp, ThumbsDown, Repeat2,
  Phone, Mail, Ban,
} from 'lucide-react';
import { toast } from 'react-toastify';
import CountryFlag, { resolveCode } from '../components/CountryFlag';
import { TRUST_MAP, deriveBadge } from '../lib/badge';
import ActiveTradeCard from '../components/ActiveTradeCard';
import PRQFooter from '../components/PRQFooter';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g300:'#CBD5E1', g400:'#94A3B8', g500:'#64748B',
  g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', online:'#22C55E',
  warn:'#F59E0B',
};

const CUR_SYM = {
  GHS:'₵', NGN:'₦', KES:'KSh', ZAR:'R', UGX:'USh', TZS:'TSh',
  USD:'$', GBP:'£', EUR:'€', XAF:'CFA', XOF:'CFA', RWF:'RF',
  MZN:'MT', ZMW:'ZK', CDF:'FC', EGP:'E£', MAD:'MAD',
  INR:'₹', CNY:'¥', PHP:'₱', IDR:'Rp', PKR:'₨', BDT:'৳',
  VND:'₫', THB:'฿', MYR:'RM', SGD:'S$', AED:'AED', SAR:'SR',
  BRL:'R$', MXN:'MX$', COP:'COP$', TRY:'₺', PLN:'zł', UAH:'₴',
};

const CURRENCIES = [
  {code:'USD', symbol:'$',    name:'US Dollar'},
  {code:'GHS', symbol:'₵',    name:'Ghana Cedi'},
  {code:'NGN', symbol:'₦',    name:'Nigerian Naira'},
  {code:'KES', symbol:'KSh',  name:'Kenyan Shilling'},
  {code:'ZAR', symbol:'R',    name:'SA Rand'},
  {code:'UGX', symbol:'USh',  name:'Uganda Shilling'},
  {code:'TZS', symbol:'TSh',  name:'Tanzania Shilling'},
  {code:'RWF', symbol:'RF',   name:'Rwanda Franc'},
  {code:'XOF', symbol:'CFA',  name:'CFA Franc (West)'},
  {code:'XAF', symbol:'CFA',  name:'CFA Franc (Central)'},
  {code:'EGP', symbol:'E£',   name:'Egyptian Pound'},
  {code:'MAD', symbol:'MAD',  name:'Moroccan Dirham'},
  {code:'GBP', symbol:'£',    name:'British Pound'},
  {code:'EUR', symbol:'€',    name:'Euro'},
  {code:'INR', symbol:'₹',    name:'Indian Rupee'},
  {code:'CNY', symbol:'¥',    name:'Chinese Yuan'},
  {code:'PHP', symbol:'₱',    name:'Philippine Peso'},
  {code:'IDR', symbol:'Rp',   name:'Indonesian Rupiah'},
  {code:'PKR', symbol:'₨',    name:'Pakistani Rupee'},
  {code:'BDT', symbol:'৳',    name:'Bangladeshi Taka'},
  {code:'VND', symbol:'₫',    name:'Vietnamese Dong'},
  {code:'THB', symbol:'฿',    name:'Thai Baht'},
  {code:'MYR', symbol:'RM',   name:'Malaysian Ringgit'},
  {code:'SGD', symbol:'S$',   name:'Singapore Dollar'},
  {code:'AED', symbol:'AED',  name:'UAE Dirham'},
  {code:'SAR', symbol:'SR',   name:'Saudi Riyal'},
  {code:'BRL', symbol:'R$',   name:'Brazilian Real'},
  {code:'MXN', symbol:'MX$',  name:'Mexican Peso'},
  {code:'COP', symbol:'COP$', name:'Colombian Peso'},
  {code:'TRY', symbol:'₺',    name:'Turkish Lira'},
  {code:'PLN', symbol:'zł',   name:'Polish Zloty'},
  {code:'UAH', symbol:'₴',    name:'Ukrainian Hryvnia'},
];

const COUNTRY_REGIONS = {
  Africa:'#10B981', Asia:'#3B82F6', 'Middle East':'#F97316',
  Americas:'#EC4899', Europe:'#7C3AED',
};

const COUNTRIES = [
  {code:'ALL', name:'All Countries',  flag:'🌍', currency:'USD', symbol:'$',    region:null},
  {code:'GH',  name:'Ghana',          flag:'🇬🇭', currency:'GHS', symbol:'₵',    region:'Africa'},
  {code:'NG',  name:'Nigeria',        flag:'🇳🇬', currency:'NGN', symbol:'₦',    region:'Africa'},
  {code:'KE',  name:'Kenya',          flag:'🇰🇪', currency:'KES', symbol:'KSh',  region:'Africa'},
  {code:'TZ',  name:'Tanzania',       flag:'🇹🇿', currency:'TZS', symbol:'TSh',  region:'Africa'},
  {code:'UG',  name:'Uganda',         flag:'🇺🇬', currency:'UGX', symbol:'USh',  region:'Africa'},
  {code:'RW',  name:'Rwanda',         flag:'🇷🇼', currency:'RWF', symbol:'RF',   region:'Africa'},
  {code:'CI',  name:"Côte d'Ivoire",  flag:'🇨🇮', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'CM',  name:'Cameroon',       flag:'🇨🇲', currency:'XAF', symbol:'CFA',  region:'Africa'},
  {code:'SN',  name:'Senegal',        flag:'🇸🇳', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'ML',  name:'Mali',           flag:'🇲🇱', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'BF',  name:'Burkina Faso',   flag:'🇧🇫', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'BJ',  name:'Benin',          flag:'🇧🇯', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'TG',  name:'Togo',           flag:'🇹🇬', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'NE',  name:'Niger',          flag:'🇳🇪', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'CD',  name:'DR Congo',       flag:'🇨🇩', currency:'CDF', symbol:'FC',   region:'Africa'},
  {code:'ZM',  name:'Zambia',         flag:'🇿🇲', currency:'ZMW', symbol:'ZK',   region:'Africa'},
  {code:'ZW',  name:'Zimbabwe',       flag:'🇿🇼', currency:'USD', symbol:'$',    region:'Africa'},
  {code:'MZ',  name:'Mozambique',     flag:'🇿🇲', currency:'MZN', symbol:'MT',   region:'Africa'},
  {code:'ZA',  name:'South Africa',   flag:'🇿🇦', currency:'ZAR', symbol:'R',    region:'Africa'},
  {code:'EG',  name:'Egypt',          flag:'🇪🇬', currency:'EGP', symbol:'E£',   region:'Africa'},
  {code:'MA',  name:'Morocco',        flag:'🇲🇦', currency:'MAD', symbol:'MAD',  region:'Africa'},
  {code:'IN',  name:'India',          flag:'🇮🇳', currency:'INR', symbol:'₹',    region:'Asia'},
  {code:'CN',  name:'China',          flag:'🇨🇳', currency:'CNY', symbol:'¥',    region:'Asia'},
  {code:'PH',  name:'Philippines',    flag:'🇵🇭', currency:'PHP', symbol:'₱',    region:'Asia'},
  {code:'ID',  name:'Indonesia',      flag:'🇮🇩', currency:'IDR', symbol:'Rp',   region:'Asia'},
  {code:'PK',  name:'Pakistan',       flag:'🇵🇰', currency:'PKR', symbol:'₨',    region:'Asia'},
  {code:'BD',  name:'Bangladesh',     flag:'🇧🇩', currency:'BDT', symbol:'৳',    region:'Asia'},
  {code:'VN',  name:'Vietnam',        flag:'🇻🇳', currency:'VND', symbol:'₫',    region:'Asia'},
  {code:'TH',  name:'Thailand',       flag:'🇹🇭', currency:'THB', symbol:'฿',    region:'Asia'},
  {code:'MY',  name:'Malaysia',       flag:'🇲🇾', currency:'MYR', symbol:'RM',   region:'Asia'},
  {code:'SG',  name:'Singapore',      flag:'🇸🇬', currency:'SGD', symbol:'S$',   region:'Asia'},
  {code:'AE',  name:'UAE',            flag:'🇦🇪', currency:'AED', symbol:'AED',  region:'Middle East'},
  {code:'SA',  name:'Saudi Arabia',   flag:'🇸🇦', currency:'SAR', symbol:'SR',   region:'Middle East'},
  {code:'US',  name:'United States',  flag:'🇺🇸', currency:'USD', symbol:'$',    region:'Americas'},
  {code:'BR',  name:'Brazil',         flag:'🇧🇷', currency:'BRL', symbol:'R$',   region:'Americas'},
  {code:'MX',  name:'Mexico',         flag:'🇲🇽', currency:'MXN', symbol:'MX$',  region:'Americas'},
  {code:'CO',  name:'Colombia',       flag:'🇨🇴', currency:'COP', symbol:'COP$', region:'Americas'},
  {code:'GB',  name:'United Kingdom', flag:'🇬🇧', currency:'GBP', symbol:'£',    region:'Europe'},
  {code:'TR',  name:'Turkey',         flag:'🇹🇷', currency:'TRY', symbol:'₺',    region:'Europe'},
  {code:'PL',  name:'Poland',         flag:'🇵🇱', currency:'PLN', symbol:'zł',   region:'Europe'},
  {code:'UA',  name:'Ukraine',        flag:'🇺🇦', currency:'UAH', symbol:'₴',    region:'Europe'},
  {code:'EU',  name:'Europe (EUR)',   flag:'🇪🇺', currency:'EUR', symbol:'€',    region:'Europe'},
];

const PAYMENT_OPTIONS = [
  {value:'all',            label:'All Methods',                   icon:'💳', cat:null},
  {value:'mtn',            label:'MTN Mobile Money',              icon:'📱', cat:'Mobile Money'},
  {value:'vodafone',       label:'Vodafone Cash',                 icon:'📱', cat:'Mobile Money'},
  {value:'airteltigo',     label:'AirtelTigo Money',              icon:'📱', cat:'Mobile Money'},
  {value:'mpesa',          label:'M-Pesa',                        icon:'📱', cat:'Mobile Money'},
  {value:'airtel money',   label:'Airtel Money',                  icon:'📱', cat:'Mobile Money'},
  {value:'orange money',   label:'Orange Money',                  icon:'📱', cat:'Mobile Money'},
  {value:'wave',           label:'Wave',                          icon:'🌊', cat:'Mobile Money'},
  {value:'chipper',        label:'Chipper Cash',                  icon:'💚', cat:'Mobile Money'},
  {value:'ecocash',        label:'EcoCash',                       icon:'📱', cat:'Mobile Money'},
  {value:'tigo pesa',      label:'Tigo Pesa / Mixx',              icon:'📱', cat:'Mobile Money'},
  {value:'moov money',     label:'Moov Money',                    icon:'📱', cat:'Mobile Money'},
  {value:'africell',       label:'Africell Money',                icon:'📱', cat:'Mobile Money'},
  {value:'paga',           label:'Paga',                          icon:'🟢', cat:'Mobile Money'},
  {value:'paypal',         label:'PayPal',                        icon:'💰', cat:'Digital Wallet'},
  {value:'cash app',       label:'Cash App',                      icon:'💸', cat:'Digital Wallet'},
  {value:'apple pay',      label:'Apple Pay',                     icon:'🍎', cat:'Digital Wallet'},
  {value:'alipay',         label:'Alipay',                        icon:'💙', cat:'Digital Wallet'},
  {value:'wechat',         label:'WeChat Pay',                    icon:'💬', cat:'Digital Wallet'},
  {value:'venmo',          label:'Venmo',                         icon:'🔵', cat:'Digital Wallet'},
  {value:'zelle',          label:'Zelle',                         icon:'💜', cat:'Digital Wallet'},
  {value:'revolut',        label:'Revolut',                       icon:'🔷', cat:'Digital Wallet'},
  {value:'skrill',         label:'Skrill',                        icon:'💳', cat:'Digital Wallet'},
  {value:'neteller',       label:'Neteller',                      icon:'💳', cat:'Digital Wallet'},
  {value:'payeer',         label:'Payeer',                        icon:'💳', cat:'Digital Wallet'},
  {value:'perfect money',  label:'Perfect Money',                 icon:'💳', cat:'Digital Wallet'},
  {value:'wise',           label:'Wise',                          icon:'🌍', cat:'Remittance'},
  {value:'worldremit',     label:'WorldRemit',                    icon:'🌐', cat:'Remittance'},
  {value:'remitly',        label:'Remitly',                       icon:'🚀', cat:'Remittance'},
  {value:'western union',  label:'Western Union',                 icon:'🏢', cat:'Remittance'},
  {value:'moneygram',      label:'MoneyGram',                     icon:'🏢', cat:'Remittance'},
  {value:'bank transfer',  label:'Bank Transfer',                 icon:'🏦', cat:'Bank'},
  {value:'wire transfer',  label:'Wire Transfer',                 icon:'🔗', cat:'Bank'},
  {value:'mobile banking', label:'Mobile Banking App',            icon:'📲', cat:'Bank'},
  {value:'interbank',      label:'Interbank (GhIPSS/NIBSS/EFT)',  icon:'🏦', cat:'Bank'},
  {value:'ussd',           label:'USSD Bank Transfer',            icon:'📞', cat:'Bank'},
  {value:'instant eft',    label:'Instant EFT (South Africa)',    icon:'🏦', cat:'Bank'},
  {value:'cash deposit',   label:'Cash Deposit (Bank Counter)',   icon:'🏦', cat:'Bank'},
  {value:'opay',           label:'OPay',                          icon:'🟢', cat:'FinTech'},
  {value:'palmpay',        label:'PalmPay',                       icon:'🌴', cat:'FinTech'},
  {value:'kuda',           label:'Kuda Bank',                     icon:'🏦', cat:'FinTech'},
  {value:'moniepoint',     label:'Moniepoint',                    icon:'🏦', cat:'FinTech'},
  {value:'paystack',       label:'Paystack',                      icon:'💚', cat:'FinTech'},
  {value:'flutterwave',    label:'Flutterwave (Barter)',           icon:'🦋', cat:'FinTech'},
  {value:'cash in person', label:'Cash in Person (Face-to-Face)', icon:'💵', cat:'Cash'},
  {value:'cash out',       label:'Cash Out',                      icon:'💵', cat:'Cash'},
  {value:'usdt',           label:'USDT (Tether – TRC20)',          icon:'💵', cat:'Crypto'},
  {value:'binance pay',    label:'Binance Pay',                   icon:'🟡', cat:'Crypto'},
  {value:'bitcoin',        label:'Bitcoin (BTC)',                  icon:'₿',  cat:'Crypto'},
  {value:'ethereum',       label:'Ethereum (ETH)',                icon:'⬡',  cat:'Crypto'},
  {value:'luno',           label:'Luno Wallet',                   icon:'🌙', cat:'Crypto'},
  {value:'yellow card',    label:'Yellow Card Wallet',            icon:'💛', cat:'Crypto'},
];

const PM_CAT_COLORS = {
  'Mobile Money':'#10B981','Digital Wallet':'#3B82F6','Remittance':'#0D9488',
  'Bank':'#7C3AED','FinTech':'#F59E0B','Cash':'#F4A422','Crypto':'#F97316',
};

const fmt  = (n, d=0) => new Intl.NumberFormat('en-US', {minimumFractionDigits:0, maximumFractionDigits:d}).format(n||0);
const fUsdt = (n) => parseFloat(n||0).toFixed(2);

const getUser     = (u) => Array.isArray(u) ? u[0] : (u||{});
const getDisplayName = (u) => (u?.username || '');
const isVerified  = (u) => !!(u?.kyc_verified||u?.is_verified||u?.is_id_verified||u?.is_email_verified);
const getTrades   = (u) => parseInt(u?.total_trades ?? u?.trade_count ?? 0);
const getLastSeen = (u) => {
  const d = u?.last_seen_at||u?.last_login||u?.updated_at||u?.created_at;
  if (!d) return {label:'—', online:false};
  const s = (Date.now()-new Date(d))/1000;
  if (s<300)   return {label:'ACTIVE NOW', online:true};
  if (s<3600)  { const m=~~(s/60); return {label:`${m} ${m===1?'min':'mins'} ago`, online:false}; }
  if (s<86400) { const h=~~(s/3600); return {label:`${h} ${h===1?'hr':'hrs'} ago`, online:false}; }
  const dy=~~(s/86400); return {label:`${dy} ${dy===1?'day':'days'} ago`, online:false};
};
// TODO: backend will provide asset:'USDT' field on /listings response for USDT-specific pricing
const getRateUSD = (l, usdtPrice) => {
  if (l.pricing_type==='fixed') { const s=parseFloat(l.bitcoin_price||0); if(s>0.01) return s; }
  return (usdtPrice || 1) * (1 + parseFloat(l.margin||0)/100);
};
const calcUsdt = (fiatAmt, usdtUSD, marginPct, usdToLocal) => {
  const sellerRateLocal = (usdtUSD || 1) * (1+marginPct/100) * usdToLocal;
  const usdtReceived     = fiatAmt / sellerRateLocal;
  return { usdtReceived };
};

// ── Avatar ────────────────────────────────────────────────────────────────────
const _avatarCache = {};
function Avatar({user, size=36, radius='rounded-xl'}) {
  const [err, setErr] = useState(false);
  const [lazyUrl, setLazyUrl] = useState(null);
  const u = getUser(user);
  useEffect(() => {
    const stored = u?.avatar_url;
    const id = u?.id;
    if (stored || !id || err) return;
    const hit = _avatarCache[id];
    if (hit instanceof Promise) { hit.then(v => { if(v) setLazyUrl(v); }); return; }
    if (hit !== undefined) { setLazyUrl(hit); return; }
    const p = axios.get(`${API_URL}/users/${id}/avatar`)
      .then(r => r.data?.avatar_url || null)
      .catch(() => null)
      .then(v => { _avatarCache[id] = v; if(v) setLazyUrl(v); return v; });
    _avatarCache[id] = p;
  }, [u?.id, u?.avatar_url, err]);
  const url = u?.avatar_url || lazyUrl;
  if (url && !err) {
    return (
      <img src={url} alt={u.username||'user'} onError={()=>setErr(true)}
        className={`object-cover flex-shrink-0 ${radius}`}
        style={{width:size, height:size}}/>
    );
  }
  return (
    <div className={`flex-shrink-0 flex items-center justify-center font-black text-white ${radius}`}
      style={{width:size, height:size, backgroundColor:C.green, fontSize:Math.round(size*0.38)}}>
      {(u?.username||'?').charAt(0).toUpperCase()}
    </div>
  );
}

// ── Featured badge config ─────────────────────────────────────────────────────
const FEATURED = {
  active_trader: {
    tag:         '👑 ACTIVE TRADER OF THE WEEK',
    ribbon:      'linear-gradient(90deg,#064E3B 0%,#065F46 18%,#059669 38%,#6EE7B7 50%,#059669 62%,#065F46 82%,#064E3B 100%)',
    border:      '#059669',
    glow:        'rgba(5,150,105,0.35)',
    bg:          '#F0FAF5',
    bgGradient:  'linear-gradient(150deg,rgba(110,231,183,0.22) 0%,#F0FAF5 42%,rgba(16,185,129,0.12) 100%)',
    divider:     'rgba(5,150,105,0.20)',
    labelColor:  '#064E3B',
    btnGradient: 'linear-gradient(135deg,#064E3B 0%,#059669 55%,#34D399 100%)',
    btnShadow:   '0 4px 20px rgba(5,150,105,0.50)',
    pulse:       true,
  },
  fast_responder: {
    tag:         '⚡ FAST RESPONDER OF THE WEEK',
    ribbon:      'linear-gradient(90deg,#1E3A8A,#4338CA,#818CF8,#4338CA,#1E3A8A)',
    border:      '#4F46E5',
    glow:        'rgba(79,70,229,0.28)',
    bg:          'rgba(79,70,229,0.05)',
    divider:     'rgba(79,70,229,0.14)',
    labelColor:  '#3730A3',
    btnGradient: 'linear-gradient(135deg,#1E3A8A 0%,#4F46E5 60%,#818CF8 100%)',
    btnShadow:   '0 4px 14px rgba(79,70,229,0.40)',
  },
  hot_offer: {
    tag:         '🔥 HOT OFFER · TRENDING NOW',
    ribbon:      'linear-gradient(90deg,#7C2D12,#EA580C,#FCD34D,#EA580C,#7C2D12)',
    border:      '#EA580C',
    glow:        'rgba(234,88,12,0.28)',
    bg:          'rgba(234,88,12,0.05)',
    divider:     'rgba(234,88,12,0.14)',
    labelColor:  '#C2410C',
    btnGradient: 'linear-gradient(135deg,#7C2D12 0%,#EA580C 60%,#F97316 100%)',
    btnShadow:   '0 4px 14px rgba(234,88,12,0.40)',
  },
};

// ── Offer Card ────────────────────────────────────────────────────────────────
function OfferCard({listing, usdtPriceUSD, onViewSeller, onBuy, liked, onToggleLike, featuredType, liveSeenAt, userBuyAmt}) {
  const { rates: USD_RATES } = useRates();
  const u         = getUser(listing.users);
  const badge     = deriveBadge(u);
  const [seen, setSeen] = useState(() => getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at }));
  useEffect(() => {
    setSeen(getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at }));
  }, [liveSeenAt]);
  useEffect(() => {
    const id = setInterval(() => setSeen(getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at })), 30000);
    return () => clearInterval(id);
  }, [liveSeenAt]);
  const trades    = getTrades(u);
  const margin    = parseFloat(listing.margin||0);
  const cur       = listing.currency || 'GHS';
  const sym       = listing.currency_symbol || CUR_SYM[cur] || '₵';
  const usdRate   = USD_RATES[cur] || 1;
  const rateLocal = getRateUSD(listing, usdtPriceUSD) * usdRate;

  const minLocal = listing.min_limit_local || (listing.min_limit_usd ? listing.min_limit_usd*usdRate : 100*usdRate);
  const maxLocal = listing.max_limit_local || (listing.max_limit_usd ? listing.max_limit_usd*usdRate : 1000*usdRate);

  const examplePay = (userBuyAmt && parseFloat(userBuyAmt) > 0)
    ? parseFloat(userBuyAmt)
    : (minLocal || Math.round(100*usdRate));
  const { usdtReceived } = calcUsdt(examplePay, usdtPriceUSD, margin, usdRate);
  const fiatEquiv = parseFloat((usdtReceived * (usdtPriceUSD || 1) * usdRate).toFixed(2));

  const marginLabel = margin===0 ? 'Market rate' : margin>0 ? `+${margin}% above market` : `${Math.abs(margin)}% below market`;
  const marginBg    = margin>0 ? C.danger : margin<0 ? C.success : C.g400;

  const pos   = parseInt(u.positive_feedback||0);
  const neg   = parseInt(u.negative_feedback||0);

  const pmLabel = listing.payment_method || 'Payment';

  const ft = featuredType ? FEATURED[featuredType] : null;

  return (
    <div className="rounded-2xl overflow-hidden transition-all w-full"
      style={{
        background: ft?.bgGradient || (ft ? ft.bg : '#fff'),
        border: ft ? `2.5px solid ${ft.border}` : `1px solid ${C.g200}`,
        boxShadow: ft ? `0 0 0 3px ${ft.glow}, 0 10px 36px ${ft.glow}` : 'none',
        animation: ft?.pulse ? 'featuredPulse 2.5s ease-in-out infinite' : undefined,
      }}>
      {ft && (
        <div style={{position:'relative', overflow:'hidden'}}>
          <div className="flex items-center justify-center gap-2"
            style={{
              background: ft.ribbon,
              padding: ft.pulse ? '10px 16px' : '8px 16px',
            }}>
            <span style={{
              fontSize: ft.pulse ? 12 : 11,
              fontWeight: 900,
              letterSpacing: '0.12em',
              color: '#fff',
              textShadow: '0 1px 6px rgba(0,0,0,0.45)',
              whiteSpace: 'nowrap',
            }}>
              {ft.tag}
            </span>
          </div>
          {ft.pulse && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.30) 50%,transparent 100%)',
              animation: 'shimmer 2.4s linear infinite',
              pointerEvents: 'none',
            }}/>
          )}
        </div>
      )}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <button onClick={onViewSeller}>
              <Avatar user={u} size={48} radius="rounded-xl"/>
            </button>
            {seen.online && (
              <span className="absolute -bottom-0.5 -right-0.5">
                <span className="absolute inline-flex w-3.5 h-3.5 rounded-full animate-ping"
                  style={{backgroundColor:C.online, opacity:0.6}}/>
                <span className="relative inline-flex w-3.5 h-3.5 rounded-full border-2 border-white"
                  style={{backgroundColor:C.online}}/>
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CountryFlag
                countryCode={u?.country_code || u?.country || u?.location || null}
                className="w-4 h-3 rounded-sm flex-shrink-0"/>
              <button onClick={onViewSeller}
                className="font-black text-sm hover:underline leading-tight truncate"
                style={{color:C.g800, maxWidth:'130px'}}>
                {getDisplayName(u) || 'Seller'}
              </button>
              {isVerified(u) && <BadgeCheck size={14} style={{color:'#3B82F6', flexShrink:0}}/>}
              {u.country && (
                <span className="text-xs font-semibold flex-shrink-0" style={{color:C.g500}}>
                  · {resolveCode(u.country)?.toUpperCase() || u.country}
                </span>
              )}
              <span className={`inline-flex items-center gap-px font-medium px-1 py-0 rounded-full border flex-shrink-0 ${badge.animate ? 'shadow-md' : ''}`}
                style={{background:badge.bg, borderColor:badge.borderColor, fontSize:'8px', boxShadow: badge.glow ? `0 0 8px ${badge.glow}` : undefined}}>
                <span style={{color:badge.iconColor||badge.textColor}}>{badge.icon}</span>
                <span style={{color:badge.textColor}}>{badge.label}</span>
              </span>
            </div>

            <div className="flex items-center justify-between mt-1.5 gap-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold"
                  style={{backgroundColor:'rgba(22,163,74,0.10)', color:'#16A34A', fontSize:'11px'}}>
                  <ThumbsUp size={10} strokeWidth={2.5}/>{fmt(pos)}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold"
                  style={{backgroundColor:'rgba(239,68,68,0.08)', color:'#EF4444', fontSize:'11px'}}>
                  <ThumbsDown size={10} strokeWidth={2.5}/>{fmt(neg)}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold"
                  style={{backgroundColor:C.g100, color:C.g600}}>
                  <Repeat2 size={9} strokeWidth={2.5}/>{fmt(trades)} trades
                </span>
                {seen.online ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold"
                    style={{backgroundColor:'#F0FDF4', color:C.online}}>
                    <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{backgroundColor:C.online}}/>
                      <span className="relative inline-flex rounded-full w-1.5 h-1.5" style={{backgroundColor:C.online}}/>
                    </span>
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium"
                    style={{backgroundColor:C.g100, color:C.g400}}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor:C.g300}}/>
                    {seen.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2.5">
          <span className="inline-flex flex-col px-2.5 py-1.5 rounded-lg"
            style={{backgroundColor: ft ? `${ft.border}18` : C.g100}}>
            <span className="text-xs font-normal leading-tight" style={{color: ft ? ft.labelColor : C.g400}}>Seller accepts:</span>
            <span className="text-xs font-black leading-tight tracking-wide" style={{color: ft ? ft.labelColor : C.g700}}>{pmLabel.toUpperCase()}</span>
          </span>
        </div>
      </div>

      <div style={{height:1, backgroundColor: ft ? ft.divider : C.g100}}/>

      <div className="px-4 py-3 grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{color: ft ? ft.labelColor : C.g500}}>YOU PAY</p>
          <p className="text-lg font-bold leading-tight truncate" style={{color:C.g800}}>
            {sym}{fmt(examplePay, 2)}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{color:C.g400}}>{cur}</p>
        </div>
        <div className="border-l pl-3" style={{borderColor: ft ? ft.divider : C.g100}}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{color: ft ? ft.labelColor : C.g500}}>YOU RECEIVE</p>
          <p className="text-lg font-bold leading-tight truncate" style={{color:C.gold}}>
            USDT {fUsdt(usdtReceived)}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>≈ {sym}{fmt(fiatEquiv, 2)} {cur}</p>
          <span className="inline-block mt-1.5 font-semibold px-2 py-0.5 rounded"
            style={{backgroundColor:marginBg, color:'#fff', fontSize:'10px', letterSpacing:'0.01em'}}>
            {marginLabel}
          </span>
        </div>
      </div>

      <div className="px-4 pb-2">
        <p className="text-xs font-semibold" style={{color:C.g600}}>
          Rate: {sym}{fmt(rateLocal)}/USDT
        </p>
      </div>

      {(minLocal > 0 || maxLocal > 0) && (
        <div className="px-4 pb-2">
          <p className="text-xs font-bold" style={{color:C.g600}}>
            Available LIMIT {cur} {fmt(minLocal)} – {fmt(maxLocal)}
          </p>
        </div>
      )}

      <div className="px-4 pb-4 flex items-center gap-2">
        <button onClick={onViewSeller}
          className="w-10 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 transition"
          style={{
            borderColor: ft ? ft.border : C.g200,
            backgroundColor: ft ? `${ft.border}12` : 'transparent',
          }}>
          <Info size={15} style={{color: ft ? ft.border : C.g400}}/>
        </button>
        <button onClick={onBuy}
          className="flex-1 h-11 rounded-xl text-white font-black text-base flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition"
          style={{
            background: ft ? ft.btnGradient : C.forest,
            boxShadow: ft ? ft.btnShadow : undefined,
          }}>
          BUY USDT <ArrowRight size={15}/>
        </button>
      </div>
    </div>
  );
}

// ── Profile Modal ─────────────────────────────────────────────────────────────
function ProfileModal({seller, listing, onClose, onTrade, usdtPriceUSD}) {
  const [tab,        setTab]        = useState('overview');
  const [reviews,    setReviews]    = useState([]);
  const [rvLoad,     setRvLoad]     = useState(false);
  const [freshSeller, setFreshSeller] = useState(null);
  const { rates: USD_RATES } = useRates();

  const sellerId = getUser(seller)?.id;
  useEffect(() => {
    if (!sellerId) return;
    axios.get(`${API_URL}/users/${sellerId}`)
      .then(r => { const d = r.data.user || r.data; if (d?.id) setFreshSeller(d); })
      .catch(() => {});
  }, [sellerId]);

  const u      = getUser(freshSeller || seller);
  const badge  = deriveBadge(u);
  const seen   = getLastSeen(u);
  const trades = getTrades(u);
  const rating = parseFloat(u.average_rating || 0);
  const margin = parseFloat(listing?.margin || 0);
  const cur    = listing?.currency || 'GHS';
  const sym    = listing?.currency_symbol || CUR_SYM[cur] || '₵';
  const usdRate   = USD_RATES[cur] || 1;
  const rateLocal = getRateUSD(listing || {}, usdtPriceUSD || 1) * usdRate;
  const minLocal = listing?.min_limit_local || (listing?.min_limit_usd ? listing?.min_limit_usd*usdRate : 100*usdRate);
  const maxLocal = listing?.max_limit_local || (listing?.max_limit_usd ? listing?.max_limit_usd*usdRate : 1000*usdRate);
  const pmLabel = listing?.payment_method || 'Payment';

  const phoneOk = !!(u.is_phone_verified || u.phone_verified);
  const emailOk = !!(u.is_email_verified || u.email_verified);
  const kycOk   = !!(u.is_id_verified || u.kyc_verified);
  const pos     = parseInt(u.positive_feedback || 0);
  const neg     = parseInt(u.negative_feedback || 0);
  const total   = pos + neg;
  const trust   = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;
  const compRate = parseFloat(u.completion_rate || 0);
  const blocks  = parseInt(u.blocks_received || u.blocks_count || 0);
  const ccCode  = resolveCode(u.country || u.location);
  const avgReply = u.avg_response_time || u.avg_reply_minutes;
  const payMins  = parseFloat(u.avg_payment_time || u.avg_response_time || u.avg_reply_minutes || 0);
  const avgPayDisplay = payMins > 0 ? (() => { const m=Math.floor(payMins),s=Math.round((payMins-m)*60); return s>0?`${m}m ${s}s`:m>0?`${m}m`:`${s}s`; })() : '—';
  const locCC    = ccCode ? ccCode.toUpperCase() : '';

  useEffect(() => {
    if (tab !== 'feedback' || !u.id || reviews.length) return;
    setRvLoad(true);
    axios.get(`${API_URL}/users/${u.id}/reviews`)
      .then(r => setReviews(r.data.reviews || []))
      .catch(() => {})
      .finally(() => setRvLoad(false));
  }, [tab, u.id]);

  if (!seller) return null;

  const TABS = [
    { id:'overview',  label:'👤 Profile'    },
    { id:'feedback',  label:`💬 Reviews (${total})`},
    { id:'rules',     label:'📋 Rules'      },
    { id:'offer',     label:'📊 Offer'      },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{backgroundColor:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col sm:mb-0"
        style={{
          maxHeight:'92dvh',
          marginBottom:'calc(60px + env(safe-area-inset-bottom, 0px))',
          border:`1px solid ${C.g200}`,
          animation:'slideUp .28s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
        <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{backgroundColor:C.g200}}/>
        </div>

        <div className="relative px-4 pt-3 pb-4 flex-shrink-0"
          style={{background:`linear-gradient(135deg,${C.forest} 0%,${C.mint} 100%)`}}>

          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
            style={{backgroundColor:'rgba(255,255,255,0.18)'}}>
            <X size={15} className="text-white"/>
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-shrink-0">
              <Avatar user={u} size={56} radius="rounded-2xl"/>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
                style={{backgroundColor: seen.online ? C.online : C.g400}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <Link to={u?.id ? `/profile/${u.id}` : '#'}
                  className="font-black text-white text-base leading-tight truncate"
                  style={{textDecoration:'none', borderBottom:'1.5px solid rgba(255,255,255,0.4)', paddingBottom:'1px'}}>
                  {getDisplayName(u) || 'User'}
                </Link>
                {kycOk && <BadgeCheck size={15} style={{color:'#93C5FD', flexShrink:0}}/>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <CountryFlag countryCode={ccCode} className="w-4 h-3 rounded-sm"/>
                {(u.country_name || u.country) && (
                  <span className="text-white/80 text-xs font-bold">{u.country_name || u.country}</span>
                )}
                <span className="text-white/40 text-xs">·</span>
                <span className="text-white/60 text-xs">{seen.online ? '🟢 Active now' : seen.label}</span>
              </div>
              <span className={`inline-flex items-center gap-px px-2 py-0.5 rounded-full border text-xs font-black ${badge.animate ? 'shadow' : ''}`}
                style={{background:badge.bg, borderColor:badge.borderColor, boxShadow:badge.glow?`0 0 6px ${badge.glow}`:undefined}}>
                <span style={{color:badge.iconColor||badge.textColor}}>{badge.icon}</span>
                <span style={{color:badge.textColor}}>{badge.label}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: seen.online ? '#4ADE80' : '#94A3B8'}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">
                  {seen.online ? 'Online now' : seen.label}
                </p>
                <p className="text-white/50 text-xs leading-tight">Last active</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <CountryFlag countryCode={ccCode} className="w-5 h-3.5 rounded-sm flex-shrink-0"/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">{u.country_name || u.country || locCC}</p>
                <p className="text-white/50 text-xs leading-tight">Location</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Timer size={14} style={{color:'#FDE68A', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{avgPayDisplay}</p>
                <p className="text-white/50 text-xs leading-tight">Avg. response</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Heart size={14} style={{color: pos > 0 ? '#86EFAC' : 'rgba(255,255,255,0.5)', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{pos > 0 ? `${fmt(pos)} users` : 'No ratings yet'}</p>
                <p className="text-white/50 text-xs leading-tight">Trusted by</p>
              </div>
            </div>
          </div>

          {u?.id && (
            <Link to={`/profile/${u.id}`}
              className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold transition hover:bg-white/20 active:scale-95"
              style={{
                color:'rgba(255,255,255,0.9)',
                border:'1.5px solid rgba(255,255,255,0.25)',
                backgroundColor:'rgba(255,255,255,0.1)',
                textDecoration:'none',
              }}>
              <span>View Full Profile</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M17 7H7M17 7v10"/>
              </svg>
            </Link>
          )}
        </div>

        <div className="flex border-b flex-shrink-0 overflow-x-auto" style={{borderColor:C.g200}}>
          {TABS.map(({id, label}) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-shrink-0 px-3 py-2.5 text-xs font-bold whitespace-nowrap transition"
              style={{
                color: tab===id ? C.green : C.g500,
                borderBottom: tab===id ? `2px solid ${C.green}` : '2px solid transparent',
                backgroundColor: tab===id ? `${C.green}08` : 'transparent',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{WebkitOverflowScrolling:'touch', minHeight:0}}>
          {tab==='overview' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  {label:'Trades',      value:fmt(trades),           sub:'completed'},
                  {label:'Rating',      value:`⭐ ${rating.toFixed(1)}`, sub:`of 5.0`},
                  {label:'Completion',  value:`${compRate.toFixed(0)}%`, sub:'rate'},
                ].map(({label,value,sub}) => (
                  <div key={label} className="rounded-xl p-3 text-center"
                    style={{backgroundColor:C.mist, border:`1px solid ${C.g200}`}}>
                    <p className="font-black text-sm" style={{color:C.forest}}>{value}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>{label}</p>
                    <p className="text-xs" style={{color:C.g400}}>{sub}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{backgroundColor:'#F0FDF4', border:'1px solid #86EFAC'}}>
                  <ThumbsUp size={14} style={{color:'#16A34A', flexShrink:0}}/>
                  <div>
                    <p className="font-black text-sm" style={{color:'#16A34A'}}>{fmt(pos)}</p>
                    <p className="text-xs" style={{color:'#166534'}}>Positive</p>
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{backgroundColor:'#FEF2F2', border:'1px solid #FCA5A5'}}>
                  <ThumbsDown size={14} style={{color:'#DC2626', flexShrink:0}}/>
                  <div>
                    <p className="font-black text-sm" style={{color:'#DC2626'}}>{fmt(neg)}</p>
                    <p className="text-xs" style={{color:'#991B1B'}}>Negative</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab==='feedback' && (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">💬</p>
              <p className="font-bold text-sm" style={{color:C.g700}}>
                {rvLoad ? 'Loading reviews...' : reviews.length === 0 ? 'No reviews yet' : `${reviews.length} reviews`}
              </p>
            </div>
          )}

          {tab==='rules' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap"
                style={{backgroundColor:C.mist, color:C.g700, border:`1px solid ${C.g200}`}}>
                {listing?.trade_instructions || listing?.listing_terms || listing?.description ||
                  'Send payment within the time limit and tap "I Have Paid". Share a screenshot of your payment if requested.'}
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl"
                style={{backgroundColor:'#FFFBEB', border:'1px solid #FDE68A'}}>
                <Timer size={14} style={{color:C.warn, flexShrink:0}}/>
                <p className="text-xs font-bold" style={{color:'#92400E'}}>
                  Time limit: {listing?.time_limit||30} minutes — trade auto-cancels if unpaid
                </p>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{backgroundColor:'#FEF2F2', border:'1px solid #FCA5A5'}}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{color:C.danger}}/>
                <p className="text-xs leading-relaxed" style={{color:'#991B1B'}}>
                  <strong>Never release USDT</strong> before confirming payment is received in your account. Escrow protects every trade.
                </p>
              </div>
            </div>
          )}

          {tab==='offer' && (
            <div className="space-y-3">
              <div className="rounded-xl p-3" style={{backgroundColor:C.mist, border:`1px solid ${C.g200}`}}>
                <p className="text-xs font-bold mb-1.5" style={{color:C.g500}}>Offer Summary</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{color:C.g500}}>Amount</span>
                    <span className="text-xs font-black" style={{color:C.g800}}>
                      {sym}{fmt(minLocal, 2)} – {sym}{fmt(maxLocal, 2)} {cur}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{color:C.g500}}>Rate</span>
                    <span className="text-xs font-black" style={{color:C.forest}}>
                      {sym}{fmt(rateLocal)}/USDT
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{color:C.g500}}>Payment</span>
                    <span className="text-xs font-black" style={{color:C.g800}}>{pmLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 pt-2 flex-shrink-0">
          <button onClick={onTrade}
            className="w-full py-3 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-[0.98] transition"
            style={{backgroundColor:C.forest}}>
            <Bitcoin size={15}/> BUY USDT
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RateBar (header gradient banner with BTC price) ───────────────────────────
function RateBar({usdtPrice, btcPriceUsd}) {
  return (
    <div className="p-4 sm:p-6 rounded-2xl text-white relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg,${C.forest} 0%,${C.mint} 100%)`,
      }}>
      <div className="flex items-center justify-between flex-wrap gap-2 relative z-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider opacity-70">USDT Market</p>
          <p className="text-2xl sm:text-3xl font-black mt-1">Buy USDT</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wider opacity-70">1 USDT</p>
          <p className="text-xl sm:text-2xl font-black mt-1">≈ ${(usdtPrice || 1).toFixed(2)}</p>
        </div>
      </div>
      <div className="absolute -right-8 -bottom-8 w-40 h-40 rounded-full opacity-10"
        style={{backgroundColor:'#fff'}}/>
      <div className="absolute -right-12 -bottom-12 w-48 h-48 rounded-full opacity-5"
        style={{backgroundColor:'#fff'}}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function BuyUSDT({user}) {
  const navigate = useNavigate();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  // TODO: backend will provide asset:'USDT' field on /listings response
  // Using cached data filtered to USDT only
  const _cacheAll = () => {
    try {
      const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
      if (c && Array.isArray(c.data)) return c.data;
    } catch {}
    return null;
  };
  const _sellNow  = () => { const a=_cacheAll(); return a?a.filter(l=>l.asset==='USDT'&&(l.listing_type==='SELL'||l.listing_type==='SELL_BITCOIN')):[]; };
  const [listings,     setListings]     = useState(()=>_sellNow());
  const [loading,      setLoading]      = useState(()=>_sellNow().length===0);
  const [loadError,    setLoadError]    = useState(false);
  const [retrying,     setRetrying]     = useState(false);
  const [selCountry,    setSelCountry]    = useState(COUNTRIES[0]);
  const [countrySearch, setCountrySearch] = useState('');
  const [selPayment,    setSelPayment]    = useState('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [showCountry,   setShowCountry]   = useState(false);
  const [showPayment,   setShowPayment]   = useState(false);
  const [sortBy,       setSortBy]       = useState('rate_low');
  const [modal,        setModal]        = useState(null);
  const [liked,        setLiked]        = useState(new Set());
  const [buyAmt,       setBuyAmt]       = useState('');
  const [activeTrades, setActiveTrades] = useState([]);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [lastSynced,   setLastSynced]   = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [affLeaderboard, setAffLeaderboard] = useState([]);
  const [traderSearch,   setTraderSearch]   = useState('');
  const [selCurrency,    setSelCurrency]    = useState(CURRENCIES[0]);
  const [showCurrency,   setShowCurrency]   = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [liveStatus,     setLiveStatus]     = useState({});
  const currencyRef = useRef(null);

  const countryRef  = useRef(null);
  const paymentRef  = useRef(null);

  const userBtcBalance = parseFloat(user?.btc_balance || 0);
  // USDT is pegged ~$1, but we use contextBtcUsd for BTC reference display
  const usdtPrice = 1;
  const btcPrice  = contextBtcUsd || 68000;

  const selPmInfo  = PAYMENT_OPTIONS.find(p => p.value === selPayment);
  const hasFilters = selPayment !== 'all' || selCountry.code !== 'ALL' || selCurrency.code !== 'USD' || sortBy !== 'rate_low' || !!buyAmt || !!traderSearch;

  // ── Load listings ───────────────────────────────────────────────────────────
  const loadListings = async (attempt = 1, force = false) => {
    if (attempt === 1 && !force) {
      try {
        const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
        if (c && Array.isArray(c.data) && c.data.length > 0) {
          // Check cache is fresh (< 5 min) and has user profile data
          const age = Date.now() - (c.ts || 0);
          const hasProfiles = c.data.some(l => l.users && (l.users.id || l.users.username));
          if (age < 300000 && hasProfiles) {
            const sellOffers = c.data.filter(l => l.asset==='USDT'&&(l.listing_type==='SELL'||l.listing_type==='SELL_BITCOIN'));
            if (sellOffers.length > 0) {
              setListings(sellOffers);
              setLoading(false);
              return;
            }
          }
        }
      } catch {}
    }
    setLoading(true);
    setLoadError(false);
    const retryDelay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
    try {
      const r = await axios.get(`${API_URL}/listings`, { timeout: 15000 });
      const all = (r.data.listings || []).map(l => ({
        ...l, users: Array.isArray(l.users) ? l.users[0] : l.users,
      }));
      const sellOffers = all.filter(l => l.asset==='USDT'&&(l.listing_type==='SELL'||l.listing_type==='SELL_BITCOIN'));
      if (all.length > 0) {
        try { localStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() })); } catch {}
      }
      if (sellOffers.length > 0) {
        setListings(sellOffers);
        setLastSynced(new Date());
      } else if (!listings.length) {
        setListings([]);
        setLastSynced(new Date());
      }
      setLoading(false);
      // TODO: backend USDT data — when asset:'USDT' field is present on listings, 
      // this filter will correctly show USDT offers and the empty state when none exist.
    } catch (err) {
      if (attempt < 3) {
        setRetrying(true);
        setTimeout(() => loadListings(attempt + 1, force), retryDelay);
      } else {
        setRetrying(false);
        // Fall back to stale cache
        try {
          const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
          if (c && Array.isArray(c.data)) {
            const sellOffers = c.data.filter(l => l.asset==='USDT'&&(l.listing_type==='SELL'||l.listing_type==='SELL_BITCOIN'));
            if (sellOffers.length > 0) {
              setListings(sellOffers);
              toast.warn('Showing cached offers — server is busy. Prices may be slightly outdated.', { autoClose: 6000 });
            }
          }
        } catch {}
        setLoading(false);
        if (!listings.length) setLoadError(true);
      }
    }
  };

  useEffect(() => {
    loadListings();
    const interval = setInterval(() => loadListings(1, true), 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Close dropdowns on outside click ────────────────────────────────────────
  useEffect(() => {
    const h = e => {
      if (currencyRef.current && !currencyRef.current.contains(e.target)) { setShowCurrency(false); setCurrencySearch(''); }
      if (countryRef.current && !countryRef.current.contains(e.target)) { setShowCountry(false); setCountrySearch(''); }
      if (paymentRef.current && !paymentRef.current.contains(e.target)) { setShowPayment(false); setPaymentSearch(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Live presence polling ──────────────────────────────────────────────────
  useEffect(() => {
    if (listings.length === 0) return;
    const uids = [...new Set(listings.map(l => getUser(l.users)?.id).filter(Boolean))];
    if (uids.length === 0) return;
    const fetchStatus = async () => {
      try {
        const r = await axios.post(`${API_URL}/users/batch-status`, { userIds: uids }, { timeout: 8000 });
        if (r.data?.statuses) setLiveStatus(r.data.statuses);
      } catch {}
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 30000);
    return () => clearInterval(iv);
  }, [listings]);

  // ── Fetch active trades ────────────────────────────────────────────────
  useEffect(() => {
    const tk = localStorage.getItem('token');
    if (!tk) return;
    const h = { Authorization: `Bearer ${tk}` };
    const toUTC = s => new Date(/[Z+]/.test(s) ? s : s + 'Z');
    const fetchTrades = () => axios.get(`${API_URL}/trades/active`, { headers: h }).then(res => {
      if (res.data.success) {
        const now = Date.now();
        setActiveTrades((res.data.trades||[]).filter(t =>
          ['PAYMENT_SENT','DISPUTED'].includes(t.status) ||
          !t.expires_at || toUTC(t.expires_at).getTime() > now
        ));
      }
    }).catch(() => {});
    Promise.all([
      axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => {}),
      fetchTrades(),
    ]);
  }, []);

  const handleTradeExpire = (id) => setActiveTrades(prev => prev.filter(t =>
    t.id !== id ||
    ['PAYMENT_SENT','DISPUTED'].includes(t.status) ||
    !t.expires_at
  ));

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadListings(1, true);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ── Filter + Sort ───────────────────────────────────────────────────────────
  const filtered = listings.filter(l => {
    const cur = (l.currency || 'USD').toUpperCase();
    const pm  = (l.payment_method || '').toLowerCase();
    if (selCountry.code !== 'ALL' && (l.country || '').toUpperCase() !== selCountry.code) return false;
    if (selCurrency.code !== 'USD' && cur !== selCurrency.code) return false;
    if (selPayment !== 'all' && pm !== selPayment && !pm.includes(selPayment) && !(selPayment === 'all')) return false;
    if (traderSearch && !getDisplayName(l.users).toLowerCase().includes(traderSearch.toLowerCase())) return false;
    if (buyAmt && parseFloat(buyAmt) > 0) {
      const amt = parseFloat(buyAmt);
      const mx  = parseFloat(l.max_limit_local || l.max_limit_usd * (USD_RATES[cur] || 1) || Infinity);
      const mn  = parseFloat(l.min_limit_local || l.min_limit_usd * (USD_RATES[cur] || 1) || 0);
      if (amt > mx || amt < mn) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'rate_low')  return (a.margin || 0) - (b.margin || 0);
    if (sortBy === 'rate_high') return (b.margin || 0) - (a.margin || 0);
    return 0;
  });

  const handleCreateOffer = () => {
    if (!user) { navigate('/login?message=Please log in to create an offer'); return; }
    navigate('/create-offer');
  };

  const handleBuy = (id) => {
    if (!user) {
      navigate('/login?message=Please log in to start trading');
      return;
    }
    const listing = listings.find(l => l.id === id);
    if (listing) {
      setModal({ type: 'profile', seller: listing.users, listing });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{backgroundColor:'#F8FAFC', minHeight:'100vh', fontFamily:"'DM Sans', sans-serif"}}>
      <SEO
        title="Buy USDT with Local Currency | PRAQEN P2P Marketplace"
        description="Buy USDT (Tether) from verified sellers using mobile money, bank transfer, and more on PRAQEN's peer-to-peer marketplace."
        url="/buy-usdt"
      />

      <div className="max-w-[1280px] mx-auto px-4 py-6 md:px-8">

        {/* ── 0. RATE BAR ── */}
        <RateBar usdtPrice={usdtPrice} btcPriceUsd={btcPrice} />

        {/* ── 1. TAB NAVIGATION ── */}
        <div className="flex w-full mt-6">
          {[
            {label:'Buy USDT',  path:'/buy-usdt',   active:true,  color:'#1B4332'},
            {label:'Sell',      path:'/sell-usdt',  active:false, color:'#D97706'},
            {label:'Buy BTC',   path:'/buy-bitcoin', active:false, color:'#1B4332'},
            {label:'Gift Cards', path:'/gift-cards', active:false, color:'#0D9488'},
          ].map(tab=>(
            <Link key={tab.path} to={tab.path}
              className="flex-1 flex items-center justify-center py-2.5 text-sm font-black transition-all"
              style={{
                borderBottom: tab.active ? `3px solid ${tab.color}` : `3px solid transparent`,
                color: tab.active ? tab.color : '#94A3B8',
                background: tab.active ? `${tab.color}06` : 'transparent',
                textDecoration: 'none',
              }}>
              {tab.label}
            </Link>
          ))}
        </div>

        {/* ── 2. FILTER BAR ── */}
        <div className="mt-4 p-4 rounded-2xl bg-white border"
          style={{borderColor:C.g200, boxShadow:'0 2px 12px rgba(0,0,0,0.04)'}}>

          <div className="flex flex-wrap items-center gap-2">
            {/* Amount input */}
            <div className="relative flex-1 min-w-[120px]">
              <input type="number" placeholder="Amount"
                value={buyAmt} onChange={e=>setBuyAmt(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold border-2 rounded-xl focus:outline-none"
                style={{borderColor:buyAmt?C.forest:C.g200, color:C.g800}}/>
            </div>

            {/* Currency */}
            <div className="relative" ref={currencyRef}>
              <button onClick={()=>setShowCurrency(!showCurrency)}
                className="flex items-center gap-1 px-3 py-2 text-sm font-bold border-2 rounded-xl transition"
                style={{borderColor:showCurrency?C.forest:C.g200, color:C.g800, backgroundColor:showCurrency?'#F0FAF5':'#fff'}}>
                {selCurrency.symbol} {selCurrency.code}
                <ChevronDown size={12} style={{transform:showCurrency?'rotate(180deg)':'none', transition:'0.2s'}}/>
              </button>
              {showCurrency && (
                <div className="absolute top-full mt-1 left-0 bg-white border rounded-xl shadow-lg z-30"
                  style={{width:220, borderColor:C.g200, maxHeight:260, overflow:'auto'}}>
                  <div className="p-2">
                    <input type="text" placeholder="🔍  Search currency…"
                      value={currencySearch} onChange={e=>setCurrencySearch(e.target.value)} autoFocus
                      className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                      style={{borderColor:C.g200}}/>
                  </div>
                  {CURRENCIES.filter(c=>!currencySearch||c.code.toLowerCase().includes(currencySearch.toLowerCase())||c.name.toLowerCase().includes(currencySearch.toLowerCase())).map(c=>(
                    <button key={c.code} onClick={()=>{setSelCurrency(c);setShowCurrency(false);setCurrencySearch('');}}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                      style={{borderColor:C.g50,backgroundColor:selCurrency.code===c.code?`${C.forest}08`:'transparent'}}>
                      <span className="text-base">{c.symbol}</span>
                      <span className="text-xs font-semibold" style={{color:C.g700}}>{c.code} – {c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Country */}
            <div className="relative" ref={countryRef}>
              <button onClick={()=>setShowCountry(!showCountry)}
                className="flex items-center gap-1 px-3 py-2 text-sm font-bold border-2 rounded-xl transition"
                style={{borderColor:showCountry?C.forest:C.g200, color:C.g800, backgroundColor:showCountry?'#F0FAF5':'#fff'}}>
                {selCountry.flag} {selCountry.code==='ALL'?'All':selCountry.code}
                <ChevronDown size={12} style={{transform:showCountry?'rotate(180deg)':'none', transition:'0.2s'}}/>
              </button>
              {showCountry && (
                <div className="absolute top-full mt-1 left-0 bg-white border rounded-xl shadow-lg z-30"
                  style={{width:240, borderColor:C.g200, maxHeight:280, overflow:'auto'}}>
                  <div className="p-2">
                    <input type="text" placeholder="🔍  Search country…"
                      value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} autoFocus
                      className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                      style={{borderColor:C.g200}}/>
                  </div>
                  {(() => {
                    const filteredCountries = COUNTRIES.filter(c => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase()));
                    const regions = [...new Set(filteredCountries.map(c => c.region).filter(Boolean))];
                    const result = [];
                    if (countrySearch) {
                      filteredCountries.forEach(c => {
                        result.push(
                          <button key={c.code} onClick={()=>{setSelCountry(c);setShowCountry(false);setCountrySearch('');if(c.currency){const matched=CURRENCIES.find(cur=>cur.code===c.currency);if(matched)setSelCurrency(matched);}}}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                            style={{borderColor:C.g50,backgroundColor:selCountry.code===c.code?`${C.forest}08`:'transparent'}}>
                            <span className="text-base">{c.flag}</span>
                            <span className="text-xs font-semibold" style={{color:C.g700}}>{c.name}</span>
                          </button>
                        );
                      });
                    } else {
                      regions.forEach(reg => {
                        const regColor = COUNTRY_REGIONS[reg];
                        result.push(
                          <div key={`reg-${reg}`} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
                            style={{color:regColor, backgroundColor:C.g50}}>{reg}</div>
                        );
                        filteredCountries.filter(c => c.region === reg).forEach(c => {
                          result.push(
                            <button key={c.code} onClick={()=>{setSelCountry(c);setShowCountry(false);setCountrySearch('');if(c.currency){const matched=CURRENCIES.find(cur=>cur.code===c.currency);if(matched)setSelCurrency(matched);}}}
                              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                              style={{borderColor:C.g50,backgroundColor:selCountry.code===c.code?`${C.forest}08`:'transparent'}}>
                              <span className="text-base">{c.flag}</span>
                              <span className="text-xs font-semibold" style={{color:C.g700}}>{c.name}</span>
                            </button>
                          );
                        });
                      });
                      filteredCountries.filter(c => !c.region).forEach(c => {
                        result.push(
                          <button key={c.code} onClick={()=>{setSelCountry(c);setShowCountry(false);setCountrySearch('');if(c.currency){const matched=CURRENCIES.find(cur=>cur.code===c.currency);if(matched)setSelCurrency(matched);}}}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                            style={{borderColor:C.g50,backgroundColor:selCountry.code===c.code?`${C.forest}08`:'transparent'}}>
                            <span className="text-base">{c.flag}</span>
                            <span className="text-xs font-semibold" style={{color:C.g700}}>{c.name}</span>
                          </button>
                        );
                      });
                    }
                    return result;
                  })()}
                </div>
              )}
            </div>

            {/* Payment method */}
            <div className="relative" ref={paymentRef}>
              <button onClick={()=>setShowPayment(!showPayment)}
                className="flex items-center gap-1 px-3 py-2 text-sm font-bold border-2 rounded-xl transition"
                style={{borderColor:showPayment||selPayment!=='all'?C.forest:C.g200, color:C.g800, backgroundColor:showPayment?'#F0FAF5':'#fff'}}>
                {selPmInfo?.icon||'💳'} {selPayment==='all'?'Payment':selPmInfo?.label}
                <ChevronDown size={12} style={{transform:showPayment?'rotate(180deg)':'none', transition:'0.2s'}}/>
              </button>
              {showPayment && (
                <div className="absolute top-full mt-1 right-0 bg-white border rounded-xl shadow-lg z-30"
                  style={{width:260, borderColor:C.g200, maxHeight:320, overflow:'auto'}}>
                  <div className="p-2">
                    <input type="text" placeholder="🔍  Search payment…"
                      value={paymentSearch} onChange={e=>setPaymentSearch(e.target.value)} autoFocus
                      className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                      style={{borderColor:C.g200}}/>
                  </div>
                  {(() => {
                    const cats = selPayment !== 'all' ? [] : [...new Set(PAYMENT_OPTIONS.map(p => p.cat).filter(Boolean))];
                    const filteredPMs = PAYMENT_OPTIONS.filter(p => p.value==='all'||!paymentSearch||p.label.toLowerCase().includes(paymentSearch.toLowerCase()));
                    const result = [];
                    if (paymentSearch) {
                      filteredPMs.forEach(p => {
                        result.push(
                          <button key={p.value} onClick={()=>{setSelPayment(p.value);setShowPayment(false);setPaymentSearch('');}}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                            style={{borderColor:C.g50,backgroundColor:selPayment===p.value?`${C.forest}08`:'transparent'}}>
                            <span>{p.icon}</span>
                            <span className="text-xs font-semibold" style={{color:C.g700}}>{p.label}</span>
                          </button>
                        );
                      });
                    } else {
                      filteredPMs.filter(p => p.value==='all').forEach(p => {
                        result.push(
                          <button key={p.value} onClick={()=>{setSelPayment(p.value);setShowPayment(false);setPaymentSearch('');}}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                            style={{borderColor:C.g50,backgroundColor:selPayment===p.value?`${C.forest}08`:'transparent'}}>
                            <span>{p.icon}</span>
                            <span className="text-xs font-semibold" style={{color:C.g700}}>{p.label}</span>
                          </button>
                        );
                      });
                      cats.forEach(cat => {
                        const catColor = PM_CAT_COLORS[cat];
                        result.push(
                          <div key={`cat-${cat}`} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
                            style={{color:catColor, backgroundColor:C.g50}}>{cat}</div>
                        );
                        filteredPMs.filter(p => p.cat === cat).forEach(p => {
                          result.push(
                            <button key={p.value} onClick={()=>{setSelPayment(p.value);setShowPayment(false);setPaymentSearch('');}}
                              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                              style={{borderColor:C.g50,backgroundColor:selPayment===p.value?`${C.forest}08`:'transparent'}}>
                              <span>{p.icon}</span>
                              <span className="text-xs font-semibold" style={{color:C.g700}}>{p.label}</span>
                            </button>
                          );
                        });
                      });
                    }
                    return result;
                  })()}
                </div>
              )}
            </div>

            {/* Sort */}
            <span className="text-xs font-black flex-shrink-0" style={{color:C.g500}}>Sort:</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              className="flex-shrink-0 px-2 py-2 font-bold border-2 rounded-xl focus:outline-none"
              style={{borderColor:sortBy!=='rate_low'?C.forest:C.g200, color:C.g800, fontSize:'13px', width:'105px'}}>
              <option value="rate_low">Rate: Low</option>
              <option value="rate_high">Rate: High</option>
            </select>

            {/* Create Offer button */}
            <button onClick={()=>handleCreateOffer()}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl text-white font-black text-xs transition hover:opacity-90 active:scale-[0.97]"
              style={{backgroundColor:C.forest, whiteSpace:'nowrap'}}>
              <PlusCircle size={12}/> Create Offer
            </button>

            {/* Clear filters */}
            {hasFilters && (
              <button onClick={()=>{setBuyAmt('');setSelPayment('all');setSelCountry(COUNTRIES[0]);setSelCurrency(CURRENCIES[0]);setSortBy('rate_low');setPaymentSearch('');setTraderSearch('');setCurrencySearch('');setCountrySearch('');}}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black border-2 transition"
                style={{borderColor:C.danger, color:C.danger, backgroundColor:'#FEF2F2'}}>
                <X size={12}/>
              </button>
            )}
          </div>

          {/* Trader search */}
          <div className="mt-3">
            <input placeholder="🔍  Search seller by name…"
              value={traderSearch} onChange={e=>setTraderSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm font-semibold border-2 rounded-xl focus:outline-none"
              style={{borderColor:traderSearch?C.forest:C.g200}}/>
          </div>
        </div>

        {/* ── 3. STATUS / RESULTS ── */}
        <div className="mt-4">

          {/* ── Inline active trade cards ── */}
          {activeTrades.length > 0 && (
            <div className="px-3 mb-2 max-w-7xl mx-auto w-full">
              {activeTrades.slice(0, showAllTrades ? activeTrades.length : 3).map(trade => (
                <ActiveTradeCard key={trade.id} trade={trade} pageColor="#1B4332" onExpire={handleTradeExpire} />
              ))}
              {activeTrades.length > 3 && (
                <button onClick={() => setShowAllTrades(p => !p)}
                  className="w-full text-xs font-semibold py-1.5 rounded-xl border mb-1"
                  style={{color:'#92400E', borderColor:'#F59E0B', backgroundColor:'#FFFBEB'}}>
                  {showAllTrades ? 'Show less ▲' : `Show all (${activeTrades.length}) ▼`}
                </button>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i=>(
                <div key={i} className="rounded-2xl border p-4 animate-pulse" style={{borderColor:C.g200}}>
                  <div className="flex gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl" style={{backgroundColor:C.g200}}/>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 rounded w-2/3" style={{backgroundColor:C.g200}}/>
                      <div className="h-2.5 rounded w-1/3" style={{backgroundColor:C.g100}}/>
                    </div>
                  </div>
                  <div className="h-2.5 rounded w-full mb-2" style={{backgroundColor:C.g100}}/>
                  <div className="h-2.5 rounded w-4/5" style={{backgroundColor:C.g100}}/>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {loadError && !loading && (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4"
                style={{backgroundColor:'#FEF2F2'}}>
                <AlertTriangle size={28} style={{color:C.danger}}/>
              </div>
              <p className="font-black text-base mb-1" style={{color:C.g800}}>Connection issue</p>
              <p className="text-sm mb-4" style={{color:C.g400}}>Server may be busy. Please try again.</p>
              <button onClick={()=>{ setLoading(true); loadListings(1, true); }}
                className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition flex items-center gap-2 mx-auto"
                style={{backgroundColor:C.forest}}>
                <RefreshCw size={14}/> Try Again
              </button>
            </div>
          )}

          {/* Retrying banner */}
          {retrying && !loadError && (
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
              style={{backgroundColor:'#FFFBEB', border:'1px solid #FDE68A'}}>
              <RefreshCw size={13} className="animate-spin" style={{color:C.warn}}/>
              <span className="text-xs font-bold" style={{color:'#92400E'}}>
                Server is warming up — retrying...
              </span>
            </div>
          )}

          {/* Empty state */}
          {!loading && !loadError && sorted.length === 0 && (
            <div className="text-center py-16 px-4">
              <p className="text-5xl mb-4">🔍</p>
              <p className="font-black text-base mb-1" style={{color:C.g800}}>No USDT offers found</p>
              <p className="text-sm" style={{color:C.g400}}>
                {/* TODO: once backend sends USDT listings with asset:'USDT', this will show real offers */}
                No USDT listings yet. Create the first offer or adjust your filters.
              </p>
              <button onClick={()=>handleCreateOffer()}
                className="mt-4 px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition"
                style={{backgroundColor:C.forest}}>
                + Create USDT Offer
              </button>
            </div>
          )}

          {/* Offer grid */}
          {!loading && !loadError && sorted.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sorted.map(l => (
                <OfferCard key={l.id}
                  listing={l}
                  usdtPriceUSD={usdtPrice}
                  onViewSeller={()=>setModal({type:'profile', seller:l.users, listing:l})}
                  onBuy={()=>handleBuy(l.id)}
                  liked={liked.has(l.id)}
                  onToggleLike={()=>setLiked(prev=>{
                    const next = new Set(prev);
                    if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                    return next;
                  })}
                  featuredType={null}
                  liveSeenAt={liveStatus[getUser(l.users)?.id]}
                  userBuyAmt={buyAmt}
                />
              ))}
            </div>
          )}

          {/* Last synced */}
          {lastSynced && (
            <div className="flex items-center justify-between mt-4 mb-2">
              <p className="text-xs" style={{color:C.g400}}>
                Updated {lastSynced.toLocaleTimeString()}
              </p>
              <button onClick={handleRefresh} disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition hover:bg-gray-50"
                style={{borderColor:C.g200, color:C.g600}}>
                <RefreshCw size={12} className={isRefreshing?'animate-spin':''}/>
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          )}

          {/* ── 4. AFFILIATE SECTION ── */}
          <div className="mt-8 rounded-2xl overflow-hidden border"
            style={{borderColor:C.g200, background:'#FFFBEB'}}>
            <div className="p-5 sm:p-7">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{backgroundColor:'#FEF3C7'}}>
                  <span className="text-sm font-black" style={{color:'#F59E0B'}}>₮</span>
                </div>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontSize:9,fontWeight:800,color:'#F59E0B',background:'#FEF3C7',border:'1px solid #FDE68A',borderRadius:4,padding:'1px 6px',letterSpacing:0.4,textTransform:'uppercase'}}>₮ USDT Affiliate</span>
                    <span style={{fontSize:9,fontWeight:700,color:'#10B981',background:'#ECFDF5',border:'1px solid #A7F3D0',borderRadius:4,padding:'1px 5px',display:'flex',alignItems:'center',gap:3}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:'#10B981',display:'inline-block'}}/>LIVE
                    </span>
                  </div>
                  <p style={{margin:'2px 0 0',fontSize:13,fontWeight:800,color:'#92400E',lineHeight:1.2}}>
                    Earn USDT on every referral trade
                  </p>
                </div>
              </div>
              <p style={{margin:0,fontSize:12,color:'#B45309',lineHeight:1.4}}>
                Share your referral link and earn a percentage of every trade your referrals make. Your earnings are paid in USDT.
              </p>
            </div>
          </div>

          {/* ── 5. FOOTER ── */}
          <div className="mt-8">
            <PRQFooter/>
          </div>

        </div>
      </div>

      {modal && (
        <ProfileModal
          seller={modal.seller}
          listing={modal.listing}
          onClose={()=>setModal(null)}
          onTrade={()=>handleBuy(modal.listing?.id)}
          usdtPriceUSD={usdtPrice}
        />
      )}
    </div>
  );
}
