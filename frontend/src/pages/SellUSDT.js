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
  Ban,
} from 'lucide-react';
import { toast } from 'react-toastify';
import CountryFlag, { resolveCode } from '../components/CountryFlag';
import { deriveBadge } from '../lib/badge';
import ActiveTradeCard from '../components/ActiveTradeCard';
import PRQFooter from '../components/PRQFooter';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', sell:'#D97706',
  mist:'#F0FAF5', white:'#FFFFFF',
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

const fmt   = (n, d=0) => new Intl.NumberFormat('en-US', {minimumFractionDigits:0, maximumFractionDigits:d}).format(n||0);
const fUsdt = (n)       => parseFloat(n||0).toFixed(2);

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
const getRateUSD = (l, usdtPrice) => {
  if (l.pricing_type==='fixed') { const s=parseFloat(l.bitcoin_price||0); if(s>0.01) return s; }
  return (usdtPrice || 1) * (1 + parseFloat(l.margin||0)/100);
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
      style={{width:size, height:size, backgroundColor:C.sell, fontSize:Math.round(size*0.38)}}>
      {(u?.username||'?').charAt(0).toUpperCase()}
    </div>
  );
}

// ── Buyer Offer Card (Sell USDT) ───────────────────────────────────────────────
function OfferCard({listing, usdtPriceUSD, onViewBuyer, onSell, liked, onToggleLike, liveSeenAt, userSellAmt}) {
  const { rates: USD_RATES } = useRates();
  const u         = getUser(listing.users);
  const badge     = deriveBadge(u);
  const [seen, setSeen] = useState(() => getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at }));
  useEffect(() => { setSeen(getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at })); }, [liveSeenAt]);
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

  const examplePay = (userSellAmt && parseFloat(userSellAmt) > 0)
    ? parseFloat(userSellAmt)
    : (minLocal || Math.round(100*usdRate));
  const usdtAmount = examplePay / rateLocal;

  const marginLabel = margin===0 ? 'Market rate' : margin>0 ? `+${margin}%` : `${Math.abs(margin)}%`;
  const marginBg    = margin>0 ? C.danger : margin<0 ? C.success : C.g400;

  const pos   = parseInt(u.positive_feedback||0);
  const neg   = parseInt(u.negative_feedback||0);
  const pmLabel = listing.payment_method || 'Payment';

  return (
    <div className="rounded-2xl overflow-hidden transition-all w-full" style={{border:`1px solid ${C.g200}`, background:'#fff'}}>
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <button onClick={onViewBuyer}>
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
              <CountryFlag countryCode={u?.country_code || u?.country || u?.location || null} className="w-4 h-3 rounded-sm flex-shrink-0"/>
              <button onClick={onViewBuyer} className="font-black text-sm hover:underline leading-tight truncate"
                style={{color:C.g800, maxWidth:'130px'}}>{getDisplayName(u) || 'Buyer'}</button>
              {isVerified(u) && <BadgeCheck size={14} style={{color:'#3B82F6', flexShrink:0}}/>}
              {u.country && <span className="text-xs font-semibold flex-shrink-0" style={{color:C.g500}}>· {resolveCode(u.country)?.toUpperCase() || u.country}</span>}
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
              <div className="flex items-center gap-2">
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
          <span className="inline-flex flex-col px-2.5 py-1.5 rounded-lg" style={{backgroundColor:C.g100}}>
            <span className="text-xs font-normal leading-tight" style={{color:C.g400}}>Payment method:</span>
            <span className="text-xs font-black leading-tight tracking-wide" style={{color:C.g700}}>{pmLabel.toUpperCase()}</span>
          </span>
        </div>
      </div>

      <div style={{height:1, backgroundColor:C.g100}}/>

      <div className="px-4 py-3 grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{color:C.g500}}>YOU SELL</p>
          <p className="text-lg font-bold leading-tight truncate" style={{color:C.gold}}>
            USDT {fUsdt(usdtAmount)}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>≈ {sym}{fmt(examplePay, 2)} {cur}</p>
        </div>
        <div className="border-l pl-3" style={{borderColor:C.g100}}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{color:C.g500}}>YOU RECEIVE</p>
          <p className="text-lg font-bold leading-tight truncate" style={{color:C.g800}}>
            {sym}{fmt(examplePay, 2)}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{color:C.g400}}>{cur}</p>
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
            LIMIT {fmt(minLocal)} – {fmt(maxLocal)} {cur}
          </p>
        </div>
      )}

      <div className="px-4 pb-4 flex items-center gap-2">
        <button onClick={onViewBuyer}
          className="w-10 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 transition"
          style={{borderColor:C.g200, backgroundColor:'transparent'}}>
          <Info size={15} style={{color:C.g400}}/>
        </button>
        <button onClick={onSell}
          className="flex-1 h-11 rounded-xl text-white font-black text-base flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition"
          style={{background:`linear-gradient(135deg,${C.sell},${C.gold})`, boxShadow:'0 4px 14px rgba(217,119,6,0.35)'}}>
          SELL USDT <ArrowRight size={15}/>
        </button>
      </div>
    </div>
  );
}

// ── Buyer Modal ───────────────────────────────────────────────────────────────
function BuyerModal({buyer, listing, onClose, onTrade, usdtPriceUSD}) {
  const [tab,        setTab]        = useState('overview');
  const [reviews,    setReviews]    = useState([]);
  const [rvLoad,     setRvLoad]     = useState(false);
  const [freshBuyer, setFreshBuyer] = useState(null);
  const { rates: USD_RATES } = useRates();

  const buyerId = getUser(buyer)?.id;
  useEffect(() => {
    if (!buyerId) return;
    axios.get(`${API_URL}/users/${buyerId}`)
      .then(r => { const d = r.data.user || r.data; if (d?.id) setFreshBuyer(d); })
      .catch(() => {});
  }, [buyerId]);

  const u      = getUser(freshBuyer || buyer);
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

  const phoneOk = !!(u.is_phone_verified || u.phone_verified);
  const emailOk = !!(u.is_email_verified || u.email_verified);
  const kycOk   = !!(u.is_id_verified || u.kyc_verified);
  const pos     = parseInt(u.positive_feedback || 0);
  const neg     = parseInt(u.negative_feedback || 0);
  const total   = pos + neg;
  const trust   = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;
  const compRate = parseFloat(u.completion_rate || 0);
  const ccCode  = resolveCode(u.country || u.location);
  const avgReply = u.avg_response_time || u.avg_reply_minutes;
  const payMins = parseFloat(u.avg_payment_time || u.avg_response_time || u.avg_reply_minutes || 0);
  const avgPayDisplay = payMins > 0 ? (() => { const m=Math.floor(payMins),s=Math.round((payMins-m)*60); return s>0?`${m}m ${s}s`:m>0?`${m}m`:`${s}s`; })() : '—';

  useEffect(() => {
    if (tab !== 'feedback' || !u.id || reviews.length) return;
    setRvLoad(true);
    axios.get(`${API_URL}/users/${u.id}/reviews`)
      .then(r => setReviews(r.data.reviews || []))
      .catch(() => {})
      .finally(() => setRvLoad(false));
  }, [tab, u.id]);

  if (!buyer) return null;

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
        style={{maxHeight:'92dvh', marginBottom:'calc(60px + env(safe-area-inset-bottom, 0px))', border:`1px solid ${C.g200}`, animation:'slideUp .28s cubic-bezier(0.34,1.56,0.64,1)'}}>
        <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{backgroundColor:C.g200}}/>
        </div>

        <div className="relative px-4 pt-3 pb-4 flex-shrink-0"
          style={{background:`linear-gradient(135deg,${C.sell} 0%,#D97706 50%,${C.gold} 100%)`}}>
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
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
                <span className="font-black text-white text-base leading-tight truncate">{getDisplayName(u) || 'User'}</span>
                {kycOk && <BadgeCheck size={15} style={{color:'#93C5FD', flexShrink:0}}/>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <CountryFlag countryCode={ccCode} className="w-4 h-3 rounded-sm"/>
                <span className="text-white/60 text-xs">{seen.online ? '🟢 Active now' : seen.label}</span>
              </div>
              <span className={`inline-flex items-center gap-px px-2 py-0.5 rounded-full border text-xs font-black ${badge.animate ? 'shadow' : ''}`}
                style={{background:badge.bg, borderColor:badge.borderColor, boxShadow:badge.glow?`0 0 6px ${badge.glow}`:undefined}}>
                <span style={{color:badge.iconColor||badge.textColor}}>{badge.icon}</span>
                <span style={{color:badge.textColor}}>{badge.label}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex border-b flex-shrink-0 overflow-x-auto" style={{borderColor:C.g200}}>
          {TABS.map(({id, label}) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-shrink-0 px-3 py-2.5 text-xs font-bold whitespace-nowrap transition"
              style={{
                color: tab===id ? C.sell : C.g500,
                borderBottom: tab===id ? `2px solid ${C.sell}` : '2px solid transparent',
                backgroundColor: tab===id ? `${C.sell}08` : 'transparent',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-4 space-y-3 flex-1">
          <div className="rounded-xl p-3" style={{backgroundColor:C.mist, border:`1px solid ${C.g200}`}}>
            <p className="text-xs font-bold mb-1.5" style={{color:C.g500}}>Offer Summary</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{color:C.g500}}>Limit</span>
                <span className="text-xs font-black" style={{color:C.g800}}>
                  {sym}{fmt(minLocal, 2)} – {sym}{fmt(maxLocal, 2)} {cur}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{color:C.g500}}>Rate</span>
                <span className="text-xs font-black" style={{color:C.forest}}>{sym}{fmt(rateLocal)}/USDT</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{backgroundColor:'#FEF2F2', border:'1px solid #FCA5A5'}}>
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{color:C.danger}}/>
            <p className="text-xs leading-relaxed" style={{color:'#991B1B'}}>
              <strong>Never release USDT</strong> before confirming payment is received. Escrow protects every trade.
            </p>
          </div>
        </div>

        <div className="p-4 pt-2 flex-shrink-0">
          <button onClick={onTrade}
            className="w-full py-3 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-[0.98] transition"
            style={{background:`linear-gradient(135deg,${C.sell},${C.gold})`}}>
            <Bitcoin size={15}/> SELL USDT
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RateBar ────────────────────────────────────────────────────────────────────
function RateBar({usdtPrice}) {
  return (
    <div className="p-4 sm:p-6 rounded-2xl text-white relative overflow-hidden"
      style={{background:`linear-gradient(135deg,#B45309 0%,${C.sell} 50%,${C.gold} 100%)`}}>
      <div className="flex items-center justify-between flex-wrap gap-2 relative z-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider opacity-70">USDT Market</p>
          <p className="text-2xl sm:text-3xl font-black mt-1">Sell USDT</p>
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
export default function SellUSDT({user}) {
  const navigate = useNavigate();
  const { rates: USD_RATES } = useRates();
  // TODO: backend will provide asset:'USDT' field on /listings response
  const _cacheAll = () => {
    try {
      const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
      if (c && Array.isArray(c.data)) return c.data;
    } catch {}
    return null;
  };
  const _buyNow   = () => { const a=_cacheAll(); return a?a.filter(l=>l.asset==='USDT'&&(l.listing_type==='BUY'||l.listing_type==='BUY_BITCOIN')):[]; };
  const [offers,       setOffers]       = useState(()=>_buyNow());
  const [loading,      setLoading]      = useState(()=>_buyNow().length===0);
  const [loadError,    setLoadError]    = useState(false);
  const [selCountry,    setSelCountry]    = useState(COUNTRIES[0]);
  const [countrySearch, setCountrySearch] = useState('');
  const [selPayment,    setSelPayment]    = useState('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [showCountry,   setShowCountry]   = useState(false);
  const [showPayment,   setShowPayment]   = useState(false);
  const [sortBy,       setSortBy]       = useState('rate_high');
  const [modal,        setModal]        = useState(null);
  const [sellAmt,      setSellAmt]      = useState('');
  const [activeTrades, setActiveTrades] = useState([]);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [traderSearch, setTraderSearch] = useState('');
  const [selCurrency,  setSelCurrency]  = useState(CURRENCIES[0]);
  const [showCurrency, setShowCurrency] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [liveStatus,   setLiveStatus]   = useState({});
  const currencyRef = useRef(null);
  const countryRef  = useRef(null);
  const paymentRef  = useRef(null);

  const usdtPrice = 1;

  const selPmInfo  = PAYMENT_OPTIONS.find(p => p.value === selPayment);
  const hasFilters = selPayment !== 'all' || selCountry.code !== 'ALL' || selCurrency.code !== 'USD' || sortBy !== 'rate_high' || !!sellAmt || !!traderSearch;

  const loadListings = async (attempt = 1, force = false) => {
    if (attempt === 1 && !force) {
      try {
        const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
        if (c && Array.isArray(c.data) && c.data.length > 0) {
          const age = Date.now() - (c.ts || 0);
          const hasProfiles = c.data.some(l => l.users && (l.users.id || l.users.username));
          if (age < 300000 && hasProfiles) {
            const buyOffers = c.data.filter(l => l.asset==='USDT'&&(l.listing_type==='BUY'||l.listing_type==='BUY_BITCOIN'));
            if (buyOffers.length > 0) {
              setOffers(buyOffers);
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
      const data = all.filter(l => l.asset==='USDT'&&(l.listing_type==='BUY'||l.listing_type==='BUY_BITCOIN'));
      if (all.length > 0) {
        try { localStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() })); } catch {}
      }
      if (data.length > 0) {
        setOffers(data);
      } else if (!offers.length) {
        setOffers([]);
      }
      setLoading(false);
    } catch (err) {
      if (attempt < 3) {
        setTimeout(() => loadListings(attempt + 1, force), retryDelay);
      } else {
        try {
          const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
          if (c && Array.isArray(c.data)) {
            const buyOffers = c.data.filter(l => l.asset==='USDT'&&(l.listing_type==='BUY'||l.listing_type==='BUY_BITCOIN'));
            if (buyOffers.length > 0) {
              setOffers(buyOffers);
              toast.warn('Showing cached offers — server is busy. Prices may be outdated.', { autoClose: 6000 });
            }
          }
        } catch {}
        setLoading(false);
        if (!offers.length) setLoadError(true);
      }
    }
  };

  useEffect(() => {
    loadListings();
    const interval = setInterval(() => loadListings(1, true), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const h = e => {
      if (currencyRef.current && !currencyRef.current.contains(e.target)){setShowCurrency(false);setCurrencySearch('');}
      if (countryRef.current && !countryRef.current.contains(e.target)){setShowCountry(false);setCountrySearch('');}
      if (paymentRef.current && !paymentRef.current.contains(e.target)){setShowPayment(false);setPaymentSearch('');}
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (offers.length === 0) return;
    const uids = [...new Set(offers.map(l => getUser(l.users)?.id).filter(Boolean))];
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
  }, [offers]);

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

  const filtered = offers.filter(l => {
    const cur = (l.currency || 'USD').toUpperCase();
    const pm  = (l.payment_method || '').toLowerCase();
    if (selCountry.code !== 'ALL' && (l.country || '').toUpperCase() !== selCountry.code) return false;
    if (selCurrency.code !== 'USD' && cur !== selCurrency.code) return false;
    if (selPayment !== 'all' && pm !== selPayment && !pm.includes(selPayment)) return false;
    if (traderSearch && !getDisplayName(l.users).toLowerCase().includes(traderSearch.toLowerCase())) return false;
    if (sellAmt && parseFloat(sellAmt) > 0) {
      const amt = parseFloat(sellAmt);
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

  const handleSell = (id) => {
    if (!user) {
      navigate('/login?message=Please log in to start trading');
      return;
    }
    const listing = offers.find(l => l.id === id);
    if (listing) {
      setModal({ type: 'buyer', buyer: listing.users, listing });
    }
  };

  return (
    <div style={{backgroundColor:'#FFFCF5', minHeight:'100vh', fontFamily:"'DM Sans', sans-serif"}}>
      <SEO
        title="Sell USDT for Local Currency | PRAQEN P2P Marketplace"
        description="Sell USDT (Tether) to verified buyers and get paid in local currency — mobile money, bank transfer, and more on PRAQEN."
        url="/sell-usdt"
      />

      <div className="max-w-[1280px] mx-auto px-4 py-6 md:px-8">

        {/* ── 0. RATE BAR ── */}
        <RateBar usdtPrice={usdtPrice} />

        {/* ── 1. TAB NAVIGATION ── */}
        <div className="flex w-full mt-6">
          {[
            {label:'Buy',       path:'/buy-usdt',   active:false, color:'#1B4332'},
            {label:'Sell USDT', path:'/sell-usdt',  active:true,  color:'#D97706'},
            {label:'Sell BTC',  path:'/sell-bitcoin', active:false, color:'#D97706'},
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
            <div className="relative flex-1 min-w-[120px]">
              <input type="number" placeholder="Amount"
                value={sellAmt} onChange={e=>setSellAmt(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold border-2 rounded-xl focus:outline-none"
                style={{borderColor:sellAmt?C.sell:C.g200, color:C.g800}}/>
            </div>

            <div className="relative" ref={currencyRef}>
              <button onClick={()=>setShowCurrency(!showCurrency)}
                className="flex items-center gap-1 px-3 py-2 text-sm font-bold border-2 rounded-xl transition"
                style={{borderColor:C.g200, color:C.g800}}>
                {selCurrency.symbol} {selCurrency.code}
                <ChevronDown size={12}/>
              </button>
              {showCurrency && (
                <div className="absolute top-full mt-1 left-0 bg-white border rounded-xl shadow-lg z-30"
                  style={{width:220, borderColor:C.g200, maxHeight:260, overflow:'auto'}}>
                  <div className="p-2">
                    <input type="text" placeholder="🔍  Search currency…"
                      value={currencySearch} onChange={e=>setCurrencySearch(e.target.value)} autoFocus
                      className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none" style={{borderColor:C.g200}}/>
                  </div>
                  {CURRENCIES.filter(c=>!currencySearch||c.code.toLowerCase().includes(currencySearch.toLowerCase())||c.name.toLowerCase().includes(currencySearch.toLowerCase())).map(c=>(
                    <button key={c.code} onClick={()=>{setSelCurrency(c);setShowCurrency(false);setCurrencySearch('');}}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                      style={{borderColor:C.g50,backgroundColor:selCurrency.code===c.code?`${C.sell}08`:'transparent'}}>
                      <span className="text-base">{c.symbol}</span>
                      <span className="text-xs font-semibold" style={{color:C.g700}}>{c.code} – {c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative" ref={countryRef}>
              <button onClick={()=>setShowCountry(!showCountry)}
                className="flex items-center gap-1 px-3 py-2 text-sm font-bold border-2 rounded-xl transition"
                style={{borderColor:C.g200, color:C.g800}}>
                {selCountry.flag} {selCountry.code==='ALL'?'All':selCountry.code}
                <ChevronDown size={12}/>
              </button>
              {showCountry && (
                <div className="absolute top-full mt-1 left-0 bg-white border rounded-xl shadow-lg z-30"
                  style={{width:240, borderColor:C.g200, maxHeight:280, overflow:'auto'}}>
                  <div className="p-2">
                    <input type="text" placeholder="🔍  Search country…"
                      value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} autoFocus
                      className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none" style={{borderColor:C.g200}}/>
                  </div>
                  {COUNTRIES.filter(c=>!countrySearch||c.name.toLowerCase().includes(countrySearch.toLowerCase())||c.code.toLowerCase().includes(countrySearch.toLowerCase())).map(c=>(
                    <button key={c.code} onClick={()=>{setSelCountry(c);setShowCountry(false);setCountrySearch('');}}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                      style={{borderColor:C.g50,backgroundColor:selCountry.code===c.code?`${C.sell}08`:'transparent'}}>
                      <span className="text-base">{c.flag}</span>
                      <span className="text-xs font-semibold" style={{color:C.g700}}>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative" ref={paymentRef}>
              <button onClick={()=>setShowPayment(!showPayment)}
                className="flex items-center gap-1 px-3 py-2 text-sm font-bold border-2 rounded-xl transition"
                style={{borderColor:C.g200, color:C.g800}}>
                {selPmInfo?.icon||'💳'} {selPayment==='all'?'Payment':selPmInfo?.label}
                <ChevronDown size={12}/>
              </button>
              {showPayment && (
                <div className="absolute top-full mt-1 right-0 bg-white border rounded-xl shadow-lg z-30"
                  style={{width:260, borderColor:C.g200, maxHeight:320, overflow:'auto'}}>
                  <div className="p-2">
                    <input type="text" placeholder="🔍  Search payment…"
                      value={paymentSearch} onChange={e=>setPaymentSearch(e.target.value)} autoFocus
                      className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none" style={{borderColor:C.g200}}/>
                  </div>
                  {PAYMENT_OPTIONS.filter(p=>p.value==='all'||!paymentSearch||p.label.toLowerCase().includes(paymentSearch.toLowerCase())).map(p=>(
                    <button key={p.value} onClick={()=>{setSelPayment(p.value);setShowPayment(false);setPaymentSearch('');}}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                      style={{borderColor:C.g50,backgroundColor:selPayment===p.value?`${C.sell}08`:'transparent'}}>
                      <span>{p.icon}</span>
                      <span className="text-xs font-semibold" style={{color:C.g700}}>{p.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-xs font-black flex-shrink-0" style={{color:C.g500}}>Sort:</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              className="flex-shrink-0 px-2 py-2 font-bold border-2 rounded-xl focus:outline-none"
              style={{borderColor:sortBy!=='rate_high'?C.sell:C.g200, color:C.g800, fontSize:'13px', width:'105px'}}>
              <option value="rate_low">Rate: Low</option>
              <option value="rate_high">Rate: High</option>
            </select>

            <button onClick={()=>handleCreateOffer()}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl text-white font-black text-xs transition hover:opacity-90 active:scale-[0.97]"
              style={{backgroundColor:C.sell, whiteSpace:'nowrap'}}>
              <PlusCircle size={12}/> Create Offer
            </button>

            {hasFilters && (
              <button onClick={()=>{setSellAmt('');setSelPayment('all');setSelCountry(COUNTRIES[0]);setSelCurrency(CURRENCIES[0]);setSortBy('rate_high');setPaymentSearch('');setTraderSearch('');setCurrencySearch('');setCountrySearch('');}}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black border-2 transition"
                style={{borderColor:C.danger, color:C.danger, backgroundColor:'#FEF2F2'}}>
                <X size={12}/>
              </button>
            )}
          </div>

          <div className="mt-3">
            <input placeholder="🔍  Search buyer by name…"
              value={traderSearch} onChange={e=>setTraderSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm font-semibold border-2 rounded-xl focus:outline-none"
              style={{borderColor:traderSearch?C.sell:C.g200}}/>
          </div>
        </div>

        {/* ── 3. CONTENT ── */}
        <div className="mt-4">
          {/* ── Inline active trade cards ── */}
          {activeTrades.length > 0 && (
            <div className="px-3 mb-2 max-w-7xl mx-auto w-full">
              {activeTrades.slice(0, showAllTrades ? activeTrades.length : 3).map(trade => (
                <ActiveTradeCard key={trade.id} trade={trade} pageColor="#D97706" onExpire={handleTradeExpire} />
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

          {loadError && !loading && (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4"
                style={{backgroundColor:'#FEF2F2'}}>
                <AlertTriangle size={28} style={{color:C.danger}}/>
              </div>
              <p className="font-black text-base mb-1" style={{color:C.g800}}>Connection issue</p>
              <p className="text-sm mb-4" style={{color:C.g400}}>Server may be busy. Please try again.</p>
              <button onClick={()=>{setLoading(true);loadListings(1,true);}}
                className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition flex items-center gap-2 mx-auto"
                style={{backgroundColor:C.sell}}>
                <RefreshCw size={14}/> Try Again
              </button>
            </div>
          )}

          {!loading && !loadError && sorted.length === 0 && (
            <div className="text-center py-16 px-4">
              <p className="text-5xl mb-4">🔍</p>
              <p className="font-black text-base mb-1" style={{color:C.g800}}>No USDT buy offers found</p>
              <p className="text-sm" style={{color:C.g400}}>
                {/* TODO: once backend sends USDT listings with asset:'USDT', this will show real offers */}
                No USDT buy offers yet. Be the first to list a USDT offer.
              </p>
              <button onClick={()=>handleCreateOffer()}
                className="mt-4 px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition"
                style={{backgroundColor:C.sell}}>
                + Create USDT Offer
              </button>
            </div>
          )}

          {!loading && !loadError && sorted.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sorted.map(l => (
                <OfferCard key={l.id}
                  listing={l}
                  usdtPriceUSD={usdtPrice}
                  onViewBuyer={()=>setModal({type:'buyer', buyer:l.users, listing:l})}
                  onSell={()=>handleSell(l.id)}
                  liked={false}
                  onToggleLike={()=>{}}
                  liveSeenAt={liveStatus[getUser(l.users)?.id]}
                  userSellAmt={sellAmt}
                />
              ))}
            </div>
          )}

          {/* ── 4. AFFILIATE SECTION ── */}
          <div className="mt-8 rounded-2xl overflow-hidden border"
            style={{borderColor:C.g200, background:'#FFFBEB'}}>
            <div className="p-5 sm:p-7">
              <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                <span style={{fontSize:9,fontWeight:800,color:'#F59E0B',background:'#FEF3C7',border:'1px solid #FDE68A',borderRadius:4,padding:'1px 6px',letterSpacing:0.4,textTransform:'uppercase'}}>₮ USDT Affiliate</span>
                <span style={{fontSize:9,color:'#94A3B8',fontWeight:500}}>Earn on every referral trade</span>
              </div>
              <p style={{margin:0,fontSize:13,fontWeight:800,color:'#1E293B',lineHeight:1.2}}>Invite friends. Earn USDT forever.</p>
              <p style={{margin:'4px 0 0',fontSize:11,color:'#64748B',lineHeight:1.4}}>
                Share your unique referral link and earn commissions when your referrals complete trades.
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
        <BuyerModal
          buyer={modal.buyer}
          listing={modal.listing}
          onClose={()=>setModal(null)}
          onTrade={()=>handleSell(modal.listing?.id)}
          usdtPriceUSD={usdtPrice}
        />
      )}
    </div>
  );
}
