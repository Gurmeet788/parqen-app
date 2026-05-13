import { useState, useEffect, useRef } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useNavigate, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import axios from 'axios';
import {
  CheckCircle, RefreshCw, AlertTriangle,
  BadgeCheck, Timer, X, Info, Shield,
  ArrowRight, PlusCircle, Filter, MapPin, Heart,
  Home, Wallet, User, Gift, Bitcoin,
  ChevronDown, CreditCard, ThumbsUp, ThumbsDown, Repeat2,
  Phone, Mail, Ban
} from 'lucide-react';
import { toast } from 'react-toastify';
import CountryFlag from '../components/CountryFlag';
import { TRUST_MAP, deriveBadge } from '../lib/badge';
import ActiveTradeCard from '../components/ActiveTradeCard';
import PRQFooter from '../components/PRQFooter';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', accent:'#0D9488', mist:'#F0FAF5',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g300:'#CBD5E1', g400:'#94A3B8', g500:'#64748B',
  g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', online:'#22C55E',
  warn:'#F59E0B',
};

// ── Trust badge map ───────────────────────────────────────────────────────────

const CUR_SYM = {
  GHS:'₵',  NGN:'₦',  KES:'KSh', ZAR:'R',  UGX:'USh', TZS:'TSh',
  USD:'$',  GBP:'£',  EUR:'€',   XAF:'CFA', XOF:'CFA',
  INR:'₹',  CNY:'¥',  JPY:'¥',  KRW:'₩',  PHP:'₱',  THB:'฿',
  MYR:'RM', IDR:'Rp', VND:'₫',  PKR:'₨',  BDT:'৳',  RUB:'₽', VES:'Bs.',
};

const COUNTRY_REGIONS = {
  Africa:'#10B981', Asia:'#3B82F6', 'Middle East':'#F97316',
  Americas:'#EC4899', Europe:'#7C3AED',
};

const COUNTRIES = [
  {code:'ALL', name:'All Countries',  flag:'🌍', region:null},
  // Africa
  {code:'GH',  name:'Ghana',          flag:'🇬🇭', region:'Africa'},
  {code:'NG',  name:'Nigeria',        flag:'🇳🇬', region:'Africa'},
  {code:'KE',  name:'Kenya',          flag:'🇰🇪', region:'Africa'},
  {code:'TZ',  name:'Tanzania',       flag:'🇹🇿', region:'Africa'},
  {code:'UG',  name:'Uganda',         flag:'🇺🇬', region:'Africa'},
  {code:'RW',  name:'Rwanda',         flag:'🇷🇼', region:'Africa'},
  {code:'CI',  name:"Côte d'Ivoire",  flag:'🇨🇮', region:'Africa'},
  {code:'CM',  name:'Cameroon',       flag:'🇨🇲', region:'Africa'},
  {code:'SN',  name:'Senegal',        flag:'🇸🇳', region:'Africa'},
  {code:'ML',  name:'Mali',           flag:'🇲🇱', region:'Africa'},
  {code:'BF',  name:'Burkina Faso',   flag:'🇧🇫', region:'Africa'},
  {code:'BJ',  name:'Benin',          flag:'🇧🇯', region:'Africa'},
  {code:'TG',  name:'Togo',           flag:'🇹🇬', region:'Africa'},
  {code:'NE',  name:'Niger',          flag:'🇳🇪', region:'Africa'},
  {code:'CD',  name:'DR Congo',       flag:'🇨🇩', region:'Africa'},
  {code:'ZM',  name:'Zambia',         flag:'🇿🇲', region:'Africa'},
  {code:'ZW',  name:'Zimbabwe',       flag:'🇿🇼', region:'Africa'},
  {code:'MZ',  name:'Mozambique',     flag:'🇲🇿', region:'Africa'},
  {code:'ZA',  name:'South Africa',   flag:'🇿🇦', region:'Africa'},
  {code:'EG',  name:'Egypt',          flag:'🇪🇬', region:'Africa'},
  {code:'MA',  name:'Morocco',        flag:'🇲🇦', region:'Africa'},
  // Asia
  {code:'IN',  name:'India',          flag:'🇮🇳', region:'Asia'},
  {code:'CN',  name:'China',          flag:'🇨🇳', region:'Asia'},
  {code:'PH',  name:'Philippines',    flag:'🇵🇭', region:'Asia'},
  {code:'ID',  name:'Indonesia',      flag:'🇮🇩', region:'Asia'},
  {code:'PK',  name:'Pakistan',       flag:'🇵🇰', region:'Asia'},
  {code:'BD',  name:'Bangladesh',     flag:'🇧🇩', region:'Asia'},
  {code:'VN',  name:'Vietnam',        flag:'🇻🇳', region:'Asia'},
  {code:'TH',  name:'Thailand',       flag:'🇹🇭', region:'Asia'},
  {code:'MY',  name:'Malaysia',       flag:'🇲🇾', region:'Asia'},
  {code:'SG',  name:'Singapore',      flag:'🇸🇬', region:'Asia'},
  // Middle East
  {code:'AE',  name:'UAE',            flag:'🇦🇪', region:'Middle East'},
  {code:'SA',  name:'Saudi Arabia',   flag:'🇸🇦', region:'Middle East'},
  // Americas
  {code:'US',  name:'United States',  flag:'🇺🇸', region:'Americas'},
  {code:'BR',  name:'Brazil',         flag:'🇧🇷', region:'Americas'},
  {code:'MX',  name:'Mexico',         flag:'🇲🇽', region:'Americas'},
  {code:'CO',  name:'Colombia',       flag:'🇨🇴', region:'Americas'},
  // Europe
  {code:'GB',  name:'United Kingdom', flag:'🇬🇧', region:'Europe'},
  {code:'TR',  name:'Turkey',         flag:'🇹🇷', region:'Europe'},
  {code:'PL',  name:'Poland',         flag:'🇵🇱', region:'Europe'},
  {code:'UA',  name:'Ukraine',        flag:'🇺🇦', region:'Europe'},
  {code:'EU',  name:'Europe (EUR)',   flag:'🇪🇺', region:'Europe'},
];

const CURRENCIES = [
  {code:'GHS', symbol:'₵',   name:'Ghana Cedi'},
  {code:'NGN', symbol:'₦',   name:'Nigerian Naira'},
  {code:'KES', symbol:'KSh', name:'Kenyan Shilling'},
  {code:'ZAR', symbol:'R',   name:'SA Rand'},
  {code:'USD', symbol:'$',   name:'US Dollar'},
  {code:'GBP', symbol:'£',   name:'British Pound'},
  {code:'EUR', symbol:'€',   name:'Euro'},
  {code:'XAF', symbol:'CFA', name:'CFA Franc'},
  {code:'INR', symbol:'₹',   name:'Indian Rupee'},
  {code:'CNY', symbol:'¥',   name:'Chinese Yuan'},
  {code:'JPY', symbol:'¥',   name:'Japanese Yen'},
  {code:'KRW', symbol:'₩',   name:'Korean Won'},
  {code:'RUB', symbol:'₽',   name:'Russian Ruble'},
  {code:'PHP', symbol:'₱',   name:'Philippine Peso'},
];

const PAYMENT_OPTIONS = [
  'All Payments','MTN Mobile Money','Vodafone Cash','AirtelTigo Money',
  'M-Pesa','Bank Transfer','PayPal','Cash App','OPay','PalmPay',
  'Orange Money','Wave','Zelle','Revolut',
];

const GC_BRANDS = [
  'All Brands','Amazon','Apple / iTunes','Google Play','Steam','eBay',
  'Walmart','Target','Visa Gift Card','Mastercard GC','Netflix',
  'Spotify','Xbox','PlayStation','Nintendo','Razer Gold','Roblox','Other',
];

const GC_FACE_VALUES = [10,20,25,50,100,200,500,1000];

const fmt  = (n,d=0) => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n||0);
const fBtc = (n)     => parseFloat(n||0).toFixed(8);

const getUser     = (u) => Array.isArray(u)?u[0]:(u||{});
const getDisplayName = (u) => (u?.username || '');
const isVerified  = (u) => !!(u?.kyc_verified||u?.is_verified||u?.is_id_verified||u?.is_email_verified);
const getTrades   = (u) => parseInt(u?.total_trades??u?.trade_count??0);
const getLastSeen = (u) => {
  const d=u?.last_seen_at||u?.last_login||u?.updated_at||u?.created_at;
  if(!d) return {label:'—',online:false};
  const s=(Date.now()-new Date(d))/1000;
  if(s<300)   return {label:'ACTIVE NOW', online:true};
  if(s<3600)  { const m=~~(s/60); return {label:`${m} ${m===1?'min':'mins'} ago`, online:false}; }
  if(s<86400) { const h=~~(s/3600); return {label:`${h} ${h===1?'hr':'hrs'} ago`, online:false}; }
  const dy=~~(s/86400); return {label:`${dy} ${dy===1?'day':'days'} ago`, online:false};
};
const getRateUSD  = (l,btcPrice) => {
  if(l.pricing_type==='fixed'){const s=parseFloat(l.bitcoin_price||0);if(s>100)return s;}
  return btcPrice*(1+parseFloat(l.margin||0)/100);
};
const getBrand = (l) => l.gift_card_brand||l.giftCardBrand||l.card_brand||'Gift Card';
const getFaceVal = (l) => { const v=l.face_value||l.card_value||l.amount_usd; return v?parseFloat(v):null; };
const getCardRange = (l) => {
  let arr = l.card_values||l.face_values||l.accepted_denominations||l.denominations||l.card_denominations;
  if (typeof arr === 'string') {
    // Handle PostgreSQL array format: {10,20,50}
    if (arr.startsWith('{')) arr = arr.replace(/[{}]/g, '').split(',').map(Number).filter(Boolean);
    else { try { arr = JSON.parse(arr); } catch { arr = arr.split(',').map(Number).filter(Boolean); } }
  }
  if(Array.isArray(arr)&&arr.length) return arr.map(v=>parseFloat(v)).filter(Boolean).sort((a,b)=>a-b);
  const fv = getFaceVal(l);
  if(fv) return [fv];
  const min = l.min_face_value||l.min_card_value; const max = l.max_face_value||l.max_card_value;
  if(min&&max) return [{min:parseFloat(min),max:parseFloat(max),isRange:true}];
  return null;
};

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({user, size=48, radius='rounded-xl'}) {
  const [err,setErr] = useState(false);
  const u = getUser(user);
  if(u?.avatar_url&&!err) return (
    <img src={u.avatar_url} alt={u.username||'user'} onError={()=>setErr(true)}
      className={`object-cover flex-shrink-0 ${radius}`} style={{width:size,height:size}}/>
  );
  return (
    <div className={`flex-shrink-0 flex items-center justify-center font-black text-white ${radius}`}
      style={{width:size,height:size,backgroundColor:C.accent,fontSize:Math.round(size*0.38)}}>
      {(u?.username||'?').charAt(0).toUpperCase()}
    </div>
  );
}

// ── Gift Card Offer Card ──────────────────────────────────────────────────────
function GCCard({listing, btcPriceUSD, onViewSeller, onTrade}) {
  const {rates:USD_RATES} = useRates();
  const u        = getUser(listing.users);
  const badge    = deriveBadge(u);
  const [seen, setSeen] = useState(() => getLastSeen(u));
  useEffect(() => {
    const id = setInterval(() => setSeen(getLastSeen(u)), 30000);
    return () => clearInterval(id);
  }, []);
  const trades   = getTrades(u);
  const brand    = getBrand(listing);
  const fv       = getFaceVal(listing);
  const margin   = parseFloat(listing.margin||0);
  const cur      = listing.currency||'USD';
  const sym      = listing.currency_symbol||CUR_SYM[cur]||'$';
  const usdRate  = USD_RATES[cur]||1;
  const rateUSD  = getRateUSD(listing, btcPriceUSD);
  const rateLocal= rateUSD*usdRate;

  const cardType  = listing.card_type || 'both';
  const cardRange = getCardRange(listing);
  const youGive = (() => {
    if (!cardRange) { const ml=listing.min_limit_local||(fv?fv*usdRate:0); return {val:`${sym}${fmt(ml)}`,sub:cur}; }
    if (cardRange[0]?.isRange) return {val:`$${cardRange[0].min}`,sub:'USD starting'};
    if (cardRange.length===1) return {val:`$${cardRange[0]}`,sub:'USD card'};
    return {val:`$${cardRange[0]}`,sub:'USD starting'};
  })();
  const refUSD   = cardRange ? (cardRange[0]?.isRange ? cardRange[0].min : cardRange[0]) : (fv||1);
  const btcOut = refUSD / rateUSD;

  const marginLabel = margin===0 ? 'Market rate' : margin>0 ? `+${margin}% above market` : `${Math.abs(margin)}% below market`;
  const marginBg    = margin>10?C.danger:margin>0?C.warn:C.success;

  const pos   = parseInt(u.positive_feedback||0);
  const neg   = parseInt(u.negative_feedback||0);

  const pmLabel  = listing.payment_method||'Payment';

  return (
    <div className="bg-white rounded-2xl overflow-hidden border hover:shadow-lg transition-all w-full min-w-0"
      style={{borderColor:C.g200}}>

      {/* ─ Seller row ────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start gap-2">

          {/* Avatar + online */}
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

          {/* Name + badge + stats */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-1 flex-wrap">
              <CountryFlag
                countryCode={(u?.country_code||u?.country||'gh').toLowerCase()}
                className="w-4 h-3 rounded-sm flex-shrink-0"/>
              <button onClick={onViewSeller}
                className="font-black text-sm hover:underline leading-tight truncate flex-shrink min-w-0"
                style={{color:C.g800, maxWidth:'110px'}}>
                {getDisplayName(u) || 'Seller'}
              </button>
              {isVerified(u) && <BadgeCheck size={13} style={{color:'#3B82F6',flexShrink:0}}/>}
              <span className={`inline-flex items-center gap-px font-medium px-1 py-0 rounded-full border flex-shrink-0 ${badge.animate ? 'shadow-md' : ''}`}
                style={{background:badge.bg, borderColor:badge.borderColor, fontSize:'8px', boxShadow: badge.glow ? `0 0 8px ${badge.glow}` : undefined}}>
                <span style={{color:badge.iconColor||badge.textColor}}>{badge.icon}</span>
                <span style={{color:badge.textColor}}>{badge.label}</span>
              </span>
            </div>

            {/* Stats row — all chips wrap naturally, nothing pushed off-screen */}
            <div className="flex items-center flex-wrap gap-1 mt-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold"
                style={{backgroundColor:'#DCFCE7', color:'#16A34A'}}>
                <ThumbsUp size={9} strokeWidth={2.5}/>{fmt(pos)}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold"
                style={{backgroundColor:'#FEE2E2', color:'#DC2626'}}>
                <ThumbsDown size={9} strokeWidth={2.5}/>{fmt(neg)}
              </span>
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

            {/* Card brand + type */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex flex-col px-2.5 py-1 rounded-xl min-w-0 max-w-full"
                style={{backgroundColor:C.g100}}>
                <span className="text-[10px] font-normal leading-snug" style={{color:C.g400}}>Seller accepts:</span>
                <span className="text-xs font-black leading-snug tracking-wide truncate" style={{color:C.g700, maxWidth:'130px'}}>
                  {/card/i.test(brand) ? brand.toUpperCase() : `${brand.toUpperCase()} CARD`}
                </span>
              </span>
              <div className="flex items-center gap-1 flex-wrap">
                {(cardType==='physical'||cardType==='both') && (
                  <span className="inline-flex items-center font-bold rounded-full"
                    style={{backgroundColor:'#DCFCE7', color:'#166534', fontSize:'8px', padding:'2px 7px'}}>
                    Physical
                  </span>
                )}
                {(cardType==='ecode'||cardType==='both') && (
                  <span className="inline-flex items-center font-bold rounded-full"
                    style={{backgroundColor:'#EDE9FE', color:'#5B21B6', fontSize:'8px', padding:'2px 7px'}}>
                    E-Code
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─ Divider ───────────────────────────────────────────────── */}
      <div style={{height:1,backgroundColor:C.g100}}/>

      {/* ─ You Give / You Receive ────────────────────────────────── */}
      <div className="px-3 py-3 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{color:C.g500}}>YOU GIVE</p>
          <p className="text-xl font-black leading-tight truncate" style={{color:C.g800}}>{youGive.val}</p>
          <p className="text-xs font-semibold mt-0.5" style={{color:C.g400}}>CARD</p>
        </div>
        <div className="border-l pl-2.5 min-w-0" style={{borderColor:C.g100}}>
          <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{color:C.g500}}>YOU RECEIVE</p>
          <p className="font-black leading-tight truncate" style={{color:C.gold, fontSize:'16px'}}>
            ₿{fBtc(btcOut)}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{color:C.g400}}>Bitcoin</p>
        </div>
      </div>

      {/* ─ Denominations ────────────────────────────────────────── */}
      <div className="px-4 pb-2">
        <p className="font-semibold mb-0.5" style={{color:C.g400, fontSize:'10px'}}>Available range</p>
        {!cardRange ? (
          <span className="text-xs font-bold" style={{color:C.g400}}>Any Value</span>
        ) : cardRange[0]?.isRange ? (
          <span className="text-xs font-bold" style={{color:C.forest}}>
            ${cardRange[0].min} – ${cardRange[0].max}
          </span>
        ) : (
          <p className="text-xs font-bold" style={{color:C.forest}}>
            {cardRange.map((v,i) => (
              <span key={v}>
                {i > 0 && <span style={{color:C.g300}}> | </span>}
                ${v}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* ─ Margin ────────────────────────────────────────────────── */}
      <div className="px-4 pb-2">
        <span className="font-semibold px-1.5 py-0.5 rounded"
          style={{backgroundColor:marginBg, color:'#fff', fontSize:'10px'}}>
          {marginLabel}
        </span>
      </div>

      {/* ─ Actions ───────────────────────────────────────────────── */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <button onClick={onViewSeller}
          className="w-10 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 hover:bg-gray-50 transition"
          style={{borderColor:C.g200}}>
          <Info size={14} style={{color:C.g400}}/>
        </button>
        <button onClick={onTrade}
          className="flex-1 h-11 rounded-xl text-white font-black text-base flex items-center justify-center gap-1.5 hover:opacity-90 transition active:scale-[0.98]"
          style={{backgroundColor:C.forest}}>
          TRADE <ArrowRight size={14}/>
        </button>
      </div>
    </div>
  );
}

// ── Seller Modal ──────────────────────────────────────────────────────────────
function SellerModal({seller, listing, onClose, onTrade, btcPriceUSD}) {
  const [tab,         setTab]         = useState('overview');
  const [reviews,     setReviews]     = useState([]);
  const [rvLoad,      setRvLoad]      = useState(false);
  const [freshSeller, setFreshSeller] = useState(null);
  const {rates:USD_RATES} = useRates();

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
  const brand  = getBrand(listing || {});
  const fv     = getFaceVal(listing || {});
  const cur    = listing?.currency || 'USD';
  const sym    = listing?.currency_symbol || CUR_SYM[cur] || '$';
  const usdRate = USD_RATES[cur] || 1;
  const rate    = getRateUSD(listing || {}, btcPriceUSD || 68000) * usdRate;
  const margin  = parseFloat(listing?.margin || 0);

  const phoneOk  = !!(u.is_phone_verified || u.phone_verified);
  const emailOk  = !!(u.is_email_verified || u.email_verified);
  const kycOk    = !!(u.is_id_verified || u.kyc_verified);
  const pos      = parseInt(u.positive_feedback || 0);
  const neg      = parseInt(u.negative_feedback || 0);
  const total    = pos + neg;
  const trust    = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;
  const compRate = parseFloat(u.completion_rate || 0);
  const blocks   = parseInt(u.blocks_received || u.blocks_count || 0);
  const ccCode   = (u.country || 'gh').slice(0, 2).toLowerCase();
  const avgReply = u.avg_response_time || u.avg_reply_minutes;
  const payMins  = parseFloat(u.avg_payment_time || u.avg_response_time || u.avg_reply_minutes || 0);
  const avgPayDisplay = payMins > 0 ? (() => { const m=Math.floor(payMins),s=Math.round((payMins-m)*60); return s>0?`${m}m ${s}s`:m>0?`${m}m`:`${s}s`; })() : '—';
  const locCC    = (u.country || '').slice(0,2).toUpperCase() || ccCode.toUpperCase();
  const CC_NAME  = {GH:'Ghana',NG:'Nigeria',KE:'Kenya',ZA:'S. Africa',UG:'Uganda',TZ:'Tanzania',RW:'Rwanda',CM:'Cameroon',SN:'Senegal',ML:'Mali',CI:"Côte d'Ivoire",CD:'DR Congo',ZM:'Zambia',MZ:'Mozambique',ZW:'Zimbabwe',BF:'Burkina Faso',BJ:'Benin',TG:'Togo',NE:'Niger',US:'USA',GB:'UK',EU:'Europe'};
  const countryName = (u.country && u.country.length > 2) ? u.country : (CC_NAME[locCC] || u.location || locCC || '—');

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
    { id:'overview', label:'👤 Profile'           },
    { id:'feedback', label:`💬 Reviews (${total})`},
    { id:'rules',    label:'📋 Rules'              },
    { id:'offer',    label:'📊 Offer'              },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{backgroundColor:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col mb-16 sm:mb-0"
        style={{maxHeight:'92dvh', border:`1px solid ${C.g200}`, animation:'slideUp .28s cubic-bezier(0.34,1.56,0.64,1)'}}>
        <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{backgroundColor:C.g200}}/>
        </div>

        {/* Header */}
        <div className="relative px-4 pt-3 pb-4 flex-shrink-0"
          style={{background:`linear-gradient(135deg,${C.forest} 0%,${C.mint} 100%)`}}>
          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
            style={{backgroundColor:'rgba(255,255,255,0.18)'}}>
            <X size={15} className="text-white"/>
          </button>

          {/* Gift card brand tag */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg mb-3"
            style={{backgroundColor:'rgba(255,255,255,0.15)'}}>
            <CreditCard size={11} className="text-white/70"/>
            <span className="text-xs font-black text-white">{brand}</span>
            {fv && <span className="text-xs font-black text-white/70">${fv}</span>}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-shrink-0">
              <Avatar user={u} size={56} radius="rounded-2xl"/>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
                style={{backgroundColor: seen.online ? C.online : C.g400}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className="font-black text-white text-base leading-tight truncate">{getDisplayName(u) || 'Seller'}</span>
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

          {/* Stats 2×2 grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Last active */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: seen.online ? '#4ADE80' : '#94A3B8'}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">{seen.online ? 'Online now' : seen.label}</p>
                <p className="text-white/50 text-xs leading-tight">Last active</p>
              </div>
            </div>
            {/* Location — real flag image, real country name */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <CountryFlag countryCode={ccCode} className="w-5 h-3.5 rounded-sm flex-shrink-0"/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">{countryName}</p>
                <p className="text-white/50 text-xs leading-tight">Location</p>
              </div>
            </div>
            {/* Avg. response */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Timer size={14} style={{color:'#FDE68A', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{avgPayDisplay}</p>
                <p className="text-white/50 text-xs leading-tight">Avg. response</p>
              </div>
            </div>
            {/* Trusted by */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Heart size={14} style={{color: pos > 0 ? '#86EFAC' : 'rgba(255,255,255,0.5)', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{pos > 0 ? `${fmt(pos)} users` : 'No ratings yet'}</p>
                <p className="text-white/50 text-xs leading-tight">Trusted by</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
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

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4" style={{WebkitOverflowScrolling:'touch', minHeight:0}}>

          {/* OVERVIEW */}
          {tab==='overview' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  {label:'Trades',     value:fmt(trades),               sub:'completed'},
                  {label:'Rating',     value:`⭐ ${rating.toFixed(1)}`, sub:'of 5.0'},
                  {label:'Completion', value:`${compRate.toFixed(0)}%`, sub:'rate'},
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
              <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
                <p className="text-xs font-black px-3 py-2 uppercase tracking-wider"
                  style={{color:C.g500, backgroundColor:C.g50}}>Verification</p>
                {[
                  {label:'Phone Number', ok:phoneOk, icon:'📱'},
                  {label:'Email Address',ok:emailOk, icon:'📧'},
                  {label:'ID / KYC',     ok:kycOk,   icon:'🪪'},
                ].map(({label,ok,icon}) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2.5 border-t"
                    style={{borderColor:C.g100}}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{icon}</span>
                      <span className="text-xs font-semibold" style={{color:C.g700}}>{label}</span>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full"
                      style={{backgroundColor: ok ? '#F0FDF4' : '#FEF2F2', color: ok ? '#16A34A' : '#DC2626'}}>
                      {ok ? '✓ Verified' : '✗ Not verified'}
                    </span>
                  </div>
                ))}
              </div>
              {u.bio && (
                <div className="rounded-xl p-3" style={{backgroundColor:C.g50, border:`1px solid ${C.g200}`}}>
                  <p className="text-xs font-bold mb-1" style={{color:C.g500}}>About</p>
                  <p className="text-xs leading-relaxed" style={{color:C.g700}}>{u.bio}</p>
                </div>
              )}
              <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
                {[
                  avgReply ? {label:'Avg. Response', value:`~${Math.round(avgReply)} min`} : null,
                  {label:'Country', value: (() => {
                    const cc = (u.country||'').slice(0,2).toUpperCase();
                    if (!cc) return '—';
                    const flag = cc.replace(/./g,c=>String.fromCodePoint(0x1F1E0+c.charCodeAt(0)-65));
                    return `${flag} ${u.country || cc}`;
                  })()},
                  {label:'Member since', value: u.created_at ? new Date(u.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : '—'},
                ].filter(Boolean).map(({label,value}) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0"
                    style={{borderColor:C.g100}}>
                    <span className="text-xs font-semibold" style={{color:C.g500}}>{label}</span>
                    <span className="text-xs font-black" style={{color:C.g800}}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FEEDBACK */}
          {tab==='feedback' && (
            <div className="space-y-3">
              <div className="flex gap-2 p-3 rounded-xl"
                style={{backgroundColor:C.mist, border:`1px solid ${C.g200}`}}>
                <div className="text-center px-3">
                  <p className="text-2xl font-black" style={{color:C.forest}}>{rating.toFixed(1)}</p>
                  <p className="text-xs" style={{color:C.g400}}>Rating</p>
                </div>
                <div className="w-px" style={{backgroundColor:C.g200}}/>
                <div className="flex-1 flex items-center gap-3 px-2">
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:'#16A34A'}}>{fmt(pos)}</p>
                    <p className="text-xs" style={{color:C.g400}}>👍 Positive</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:'#DC2626'}}>{fmt(neg)}</p>
                    <p className="text-xs" style={{color:C.g400}}>👎 Negative</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:C.forest}}>{trust}%</p>
                    <p className="text-xs" style={{color:C.g400}}>Trust</p>
                  </div>
                </div>
              </div>
              {rvLoad ? (
                <div className="space-y-2">
                  {[1,2,3].map(i=>(
                    <div key={i} className="rounded-xl p-3 border animate-pulse" style={{borderColor:C.g200}}>
                      <div className="flex gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full" style={{backgroundColor:C.g200}}/>
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 rounded w-1/3" style={{backgroundColor:C.g200}}/>
                          <div className="h-2 rounded w-1/4" style={{backgroundColor:C.g100}}/>
                        </div>
                      </div>
                      <div className="h-2.5 rounded w-4/5" style={{backgroundColor:C.g100}}/>
                    </div>
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-3xl mb-2">💬</p>
                  <p className="font-bold text-sm" style={{color:C.g700}}>No reviews yet</p>
                  <p className="text-xs mt-1" style={{color:C.g400}}>Be the first to trade with this seller</p>
                </div>
              ) : (
                reviews.slice(0, 20).map((rv, i) => {
                  const isPos = rv.rating >= 4;
                  const ago = rv.created_at ? (() => {
                    const s = (Date.now()-new Date(rv.created_at))/1000;
                    if(s<3600) return `${~~(s/60)}m ago`;
                    if(s<86400) return `${~~(s/3600)}h ago`;
                    return `${~~(s/86400)}d ago`;
                  })() : '';
                  return (
                    <div key={i} className="rounded-xl border p-3"
                      style={{borderColor: isPos ? '#86EFAC' : '#FCA5A5', backgroundColor: isPos ? '#F0FDF4' : '#FEF2F2'}}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{backgroundColor: isPos ? '#16A34A' : '#DC2626'}}>
                            {isPos ? '👍' : '👎'}
                          </div>
                          <span className="text-xs font-black" style={{color: isPos ? '#166534' : '#991B1B'}}>
                            {rv.reviewer?.username || 'Anonymous'}
                          </span>
                        </div>
                        <span className="text-xs" style={{color:C.g400}}>{ago}</span>
                      </div>
                      {rv.comment && (
                        <p className="text-xs leading-relaxed pl-8" style={{color: isPos ? '#14532D' : '#7F1D1D'}}>
                          "{rv.comment}"
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TRADE RULES */}
          {tab==='rules' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap"
                style={{backgroundColor:C.mist, color:C.g700, border:`1px solid ${C.g200}`}}>
                {listing?.trade_instructions || listing?.listing_terms || listing?.description ||
                  'Send the gift card code and PIN in the trade chat. Wait for buyer confirmation before release.'}
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl"
                style={{backgroundColor:'#FFFBEB', border:'1px solid #FDE68A'}}>
                <Timer size={14} style={{color:C.warn, flexShrink:0}}/>
                <p className="text-xs font-bold" style={{color:'#92400E'}}>
                  Time limit: {listing?.time_limit||30} min — auto-cancels if not completed
                </p>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{backgroundColor:'#FEF2F2', border:'1px solid #FCA5A5'}}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{color:C.danger}}/>
                <p className="text-xs leading-relaxed" style={{color:'#991B1B'}}>
                  Only share card codes inside the active trade chat. Escrow protects both parties.
                </p>
              </div>
            </div>
          )}

          {/* OFFER DETAILS */}
          {tab==='offer' && (
            <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
              {[
                {label:'Card Brand',     value:brand},
                {label:'Face Value',     value:fv ? `$${fv} USD` : 'Varies'},
                {label:'Payment Method', value:listing?.payment_method||'—'},
                {label:'Rate / BTC',     value:`${sym}${fmt(rate,0)} ${cur}`},
                {label:'Margin',         value:margin===0?'At market':margin>0?`+${margin}% above market`:`${margin}% below market`},
                {label:'Time Limit',     value:`${listing?.time_limit||30} minutes`},
                {label:'Country',        value: (() => {
                  const raw = listing?.country_name || u.country || '';
                  if (!raw) return '—';
                  const cc = raw.slice(0,2).toUpperCase();
                  const flag = cc.replace(/./g,c=>String.fromCodePoint(0x1F1E0+c.charCodeAt(0)-65));
                  return `${flag} ${raw}`;
                })()},
              ].map(({label,value}) => (
                <div key={label} className="flex items-center justify-between px-3.5 py-3 border-b last:border-0"
                  style={{borderColor:C.g100}}>
                  <span className="text-xs font-semibold" style={{color:C.g500}}>{label}</span>
                  <span className="text-xs font-black text-right ml-4" style={{color:C.g800, maxWidth:'60%'}}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 flex gap-3 flex-shrink-0 border-t" style={{borderColor:C.g200}}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl border text-sm font-bold hover:bg-gray-50 transition"
            style={{borderColor:C.g200, color:C.g600}}>
            Close
          </button>
          <button onClick={() => { onClose(); onTrade(); }}
            className="flex-1 py-3 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition"
            style={{backgroundColor:C.forest}}>
            Trade Now <ArrowRight size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border animate-pulse w-full" style={{borderColor:C.g200}}>
      <div className="h-16 rounded-t-2xl" style={{backgroundColor:C.g200}}/>
      <div className="px-4 pt-3 pb-4 space-y-2.5">
        <div className="h-3 rounded-lg w-2/3" style={{backgroundColor:C.g200}}/>
        <div className="h-2.5 rounded-lg w-1/2" style={{backgroundColor:C.g100}}/>
        <div className="h-9 rounded-xl mt-1" style={{backgroundColor:C.g200}}/>
      </div>
    </div>
  );
}

// ── Main GiftCards Page ───────────────────────────────────────────────────────
export default function GiftCards({user}) {
  const navigate = useNavigate();
  const {rates:USD_RATES, btcUsd:contextBtcUsd} = useRates();
  const _cacheAll = () => { try { const c=JSON.parse(sessionStorage.getItem('praqen_market_all')||'null'); if(!c||Date.now()-c.ts>180000) return null; return c?.data||null; } catch { return null; } };
  const _gcNow    = () => { const a=_cacheAll(); return a?a.filter(l=>l.listing_type==='BUY_GIFT_CARD'||l.listing_type==='SELL_GIFT_CARD'):[]; };
  const [listings,     setListings]     = useState(()=>_gcNow());
  const [loading,      setLoading]      = useState(()=>_gcNow().length===0);
  const [loadError,    setLoadError]    = useState(false);
  const [btcPrice,     setBtcPrice]     = useState(68000);
  const [selCurrency,  setSelCurrency]  = useState(CURRENCIES[0]);
  const [selBrand,     setSelBrand]     = useState('All Brands');
  const [selCountry,   setSelCountry]   = useState(COUNTRIES[0]);
  const [amountInput,  setAmountInput]  = useState('');
  const [sortBy,       setSortBy]       = useState('rate_low');
  const [traderSearch, setTraderSearch] = useState('');
  const [showCurrency, setShowCurrency] = useState(false);
  const [showBrand,    setShowBrand]    = useState(false);
  const [showCountry,  setShowCountry]  = useState(false);
  const [modal,        setModal]        = useState(null);
  const [activeTrades, setActiveTrades] = useState([]);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [pausedOffer,  setPausedOffer]  = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [brandSearch,    setBrandSearch]    = useState('');
  const [countrySearch,  setCountrySearch]  = useState('');
  const currencyRef = useRef(null);
  const brandRef    = useRef(null);
  const countryRef  = useRef(null);

  useEffect(()=>{ if(contextBtcUsd>0) setBtcPrice(contextBtcUsd); },[contextBtcUsd]);
  useEffect(()=>{
    loadListings();
    const interval = setInterval(loadListings, 60000);
    return () => clearInterval(interval);
  },[]);
  useEffect(()=>{
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
    const iv1 = setInterval(() => axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => {}), 60000);
    const iv2 = setInterval(fetchTrades, 10000);
    return () => { clearInterval(iv1); clearInterval(iv2); };
  },[user]);
  useEffect(()=>{
    const h=e=>{
      if(currencyRef.current&&!currencyRef.current.contains(e.target)) { setShowCurrency(false); setCurrencySearch(''); }
      if(brandRef.current&&!brandRef.current.contains(e.target))       { setShowBrand(false); setBrandSearch(''); }
      if(countryRef.current&&!countryRef.current.contains(e.target)) { setShowCountry(false); setCountrySearch(''); }
    };
    document.addEventListener('mousedown',h);
    return()=>document.removeEventListener('mousedown',h);
  },[]);

  const loadListings = async () => {
    setLoadError(false);
    try {
      const r = await axios.get(`${API_URL}/listings`, { timeout: 12000 });
      const all=(r.data.listings||[]).map(l=>({...l,users:Array.isArray(l.users)?l.users[0]:l.users}));
      const data=all.filter(l=>l.listing_type==='BUY_GIFT_CARD'||l.listing_type==='SELL_GIFT_CARD');
      setListings(data);
      // Store ALL listings in shared cache so Buy/Sell tabs load instantly
      try { sessionStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() })); } catch {}
      // Check for paused offers in background — non-blocking
      const tk = localStorage.getItem('token');
      if (tk) {
        axios.get(`${API_URL}/my-listings`, { headers: { Authorization: `Bearer ${tk}` } })
          .then(myR => {
            const myPaused=(myR.data.listings||[]).filter(l=>
              l.status==='PAUSED'&&(l.listing_type==='BUY_GIFT_CARD'||l.listing_type==='SELL_GIFT_CARD')
            );
            setPausedOffer(myPaused.length>0);
          }).catch(()=>{});
      }
    } catch {
      if (!listings.length) setLoadError(true);
    }
    finally { setLoading(false); }
  };

  const getFiltered = () => {
    let list=[...listings];
    if(selBrand!=='All Brands') list=list.filter(l=>(getBrand(l)||'').toLowerCase().includes(selBrand.toLowerCase()));
    const amt=parseFloat(amountInput);
    if(!isNaN(amt)&&amt>0) list=list.filter(l=>{
      const range=getCardRange(l);
      if(!range) return true;
      if(range[0]?.isRange) return amt>=range[0].min&&amt<=range[0].max;
      return range.some(v=>Math.abs(v-amt)<0.01);
    });
    if(selCountry.code!=='ALL') list=list.filter(l=>
      (l.country_code||'').toUpperCase()===selCountry.code||
      (l.users?.country_code||'').toUpperCase()===selCountry.code
    );
    if(traderSearch.trim()) list=list.filter(l=>
      (l.users?.username||'').toLowerCase().includes(traderSearch.trim().toLowerCase())
    );
    if(sortBy==='rate_low')  list.sort((a,b)=>parseFloat(a.margin||0)-parseFloat(b.margin||0));
    if(sortBy==='rate_high') list.sort((a,b)=>parseFloat(b.margin||0)-parseFloat(a.margin||0));
    if(sortBy==='rating')    list.sort((a,b)=>(b.users?.average_rating||0)-(a.users?.average_rating||0));
    if(sortBy==='trades')    list.sort((a,b)=>getTrades(b.users)-getTrades(a.users));

    // One offer per seller per payment method
    const seen = new Set();
    list = list.filter(l => {
      const key = `${l.seller_id}:${String(l.payment_method||'').toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return list;
  };

  const handleTradeExpire = (id) => setActiveTrades(prev => prev.filter(t =>
    t.id !== id ||
    ['PAYMENT_SENT','DISPUTED'].includes(t.status) ||
    !t.expires_at  // server cleared the deadline (buyer marked paid) — never remove
  ));

  const handleTrade = (id) => {
    if(!user){ navigate('/login?message=Please log in to start trading'); return; }
    navigate(`/listing/${id}`);
  };

  const filtered    = getFiltered();
  const cur         = selCurrency.code||'GHS';
  const sym         = selCurrency.symbol||'₵';
  const usdRate     = USD_RATES[cur]||1;
  const btcLocal    = btcPrice*usdRate;
  const onlineCnt   = listings.filter(l=>(Date.now()-new Date(l.users?.last_seen_at||l.users?.last_login||0))/1000<300).length;
  const sellerCount = new Set(listings.map(l=>l.seller_id)).size;
  const hasFilters  = amountInput.trim()!==''||selBrand!=='All Brands'||selCountry.code!=='ALL'||traderSearch.trim()!==''||sortBy!=='rate_low';

  return (
    <div className="min-h-screen flex flex-col"
      style={{backgroundColor:C.g100,fontFamily:"'DM Sans',sans-serif",overflowX:'hidden'}}>
      <SEO />
      <style>{`
        @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        html,body{overscroll-behavior:none}
        .dropdown-panel{max-width:calc(100vw - 24px)}
      `}</style>

      {/* ══════════════════════════════════════════════════
          1. RATE BAR
      ══════════════════════════════════════════════════ */}
      <div style={{backgroundColor:C.forest}} className="w-full">
        <div className="max-w-7xl mx-auto px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-xl md:text-3xl font-black text-white leading-tight mb-1.5">
                Gift Card <span style={{color:C.gold}}>Marketplace</span>
              </p>
              <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.5)'}}>
                  1 BTC = <span className="font-black" style={{color:'rgba(255,255,255,0.9)'}}>${fmt(btcPrice)} USD</span>
                </span>
                <span style={{color:'rgba(255,255,255,0.2)',fontSize:10}}>|</span>
                <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.5)'}}>
                  1 USD = <span className="font-black" style={{color:'rgba(255,255,255,0.75)'}}>
                    {cur==='USD' ? `₵${fmt(USD_RATES['GHS']||1,2)} GHS` : `${sym}${fmt(usdRate,2)} ${cur}`}
                  </span>
                </span>
              </div>
            </div>
            <button onClick={loadListings}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition hover:bg-white/20 flex-shrink-0"
              style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
              <RefreshCw size={15} className={`text-white ${loading?'animate-spin':''}`}/>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          2. TAB NAVIGATION
      ══════════════════════════════════════════════════ */}
      <div className="bg-white border-b sticky top-16 z-30 flex-shrink-0" style={{borderColor:C.g200}}>
        {/* 3 equal tabs — always fits any phone */}
        <div className="flex w-full">
          {[
            {label:'Buy BTC',    path:'/buy-bitcoin',  active:false, color:'#1B4332'},
            {label:'Sell BTC',   path:'/sell-bitcoin', active:false, color:'#D97706'},
            {label:'Gift Cards', path:'/gift-cards',   active:true,  color:'#0D9488'},
          ].map(tab=>(
            <Link key={tab.path} to={tab.path}
              className="flex-1 text-center py-3 text-xs font-black border-b-2 transition-all"
              style={{
                borderColor:     tab.active ? tab.color : 'transparent',
                color:           tab.active ? tab.color : C.g400,
                backgroundColor: tab.active ? tab.color+'18' : 'transparent',
              }}>
              {tab.label}
            </Link>
          ))}
        </div>
        {/* Stats row — always visible below tabs */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t" style={{borderColor:C.g100, backgroundColor:C.g50}}>
          <span className="text-xs font-semibold" style={{color:C.g400}}>
            {sellerCount} seller{sellerCount!==1?'s':''}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{backgroundColor: onlineCnt>0 ? C.online : C.g300,
                      boxShadow: onlineCnt>0 ? `0 0 0 3px ${C.online}30` : 'none'}}/>
            <span className="text-xs font-semibold"
              style={{color: onlineCnt>0 ? C.online : C.g400}}>
              {onlineCnt>0 ? `${onlineCnt} online` : 'offline — offers still available'}
            </span>
          </span>
        </div>
      </div>

      {/* ══ PAUSED OFFER BANNER — shown to seller when their gift card offer is paused ══ */}
      {pausedOffer && (
        <div className="flex-shrink-0 px-3 pt-3">
          <div className="max-w-7xl mx-auto rounded-2xl p-4 flex items-start gap-3"
            style={{backgroundColor:'#FFFBEB', border:'1.5px solid #FCD34D'}}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{backgroundColor:'#FEF3C7'}}>
              <Wallet size={16} style={{color:'#D97706'}}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black" style={{color:'#92400E'}}>Your gift card offer is off the market</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{color:'#B45309'}}>
                Your Bitcoin wallet is empty, so your offer has been automatically paused. Top up your wallet to bring it back to the marketplace.
              </p>
            </div>
            <button
              onClick={()=>window.location.href='/wallet'}
              className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-black text-white"
              style={{backgroundColor:'#D97706'}}>
              Top Up Wallet
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          4. FILTER BAR
      ══════════════════════════════════════════════════ */}
      <div className="bg-white border-b" style={{borderColor:C.g200}}>
        <div className="max-w-7xl mx-auto px-3 py-3">

          {/* 2×2 grid on mobile, 4-col on sm+ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

            {/* ── AMOUNT ── */}
            <div>
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>AMOUNT</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black pointer-events-none select-none"
                  style={{color:amountInput?C.forest:C.g400}}>$</span>
                <input
                  type="number" min="0" placeholder="e.g. 50"
                  value={amountInput}
                  onChange={e=>setAmountInput(e.target.value)}
                  className="w-full pl-6 pr-7 py-2.5 rounded-xl border-2 font-black focus:outline-none"
                  style={{
                    borderColor:amountInput?C.forest:C.g200,
                    color:C.g800,
                    backgroundColor:amountInput?`${C.forest}08`:'transparent',
                    fontSize:'16px',
                  }}
                />
                {amountInput&&(
                  <button onClick={()=>setAmountInput('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full"
                    style={{backgroundColor:C.g200}}>
                    <X size={9} style={{color:C.g600}}/>
                  </button>
                )}
              </div>
            </div>

            {/* ── CURRENCY ── */}
            <div>
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>CURRENCY</p>
              <div className="relative" ref={currencyRef}>
                <button onClick={()=>{setShowCurrency(!showCurrency);setCurrencySearch('');setShowBrand(false);setShowCountry(false);}}
                  className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-bold transition"
                  style={{
                    borderColor:selCurrency.code!=='GHS'?C.forest:C.g200,
                    color:selCurrency.code!=='GHS'?C.forest:C.g600,
                    backgroundColor:selCurrency.code!=='GHS'?`${C.forest}08`:'transparent'
                  }}>
                  <span className="text-xs font-black flex-shrink-0">{selCurrency.symbol}</span>
                  <span className="text-xs font-black flex-1 text-left">{selCurrency.code}</span>
                  <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${showCurrency?'rotate-180':''}`}
                    style={{color:C.g400}}/>
                </button>
                {showCurrency&&(
                  <div className="dropdown-panel absolute top-full right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                    style={{borderColor:C.g100,minWidth:'200px',maxWidth:'calc(100vw - 24px)'}}>
                    <div className="px-2 py-2 border-b sticky top-0 bg-white" style={{borderColor:C.g100}}>
                      <input type="text" placeholder="Search currency..." value={currencySearch}
                        onChange={e=>setCurrencySearch(e.target.value)} onClick={e=>e.stopPropagation()}
                        className="w-full px-2.5 py-1.5 rounded-lg focus:outline-none"
                        style={{border:`1.5px solid ${C.g200}`,color:C.g800,backgroundColor:C.g50,fontSize:'16px'}}/>
                    </div>
                    <div style={{maxHeight:240,overflowY:'auto'}}>
                      {CURRENCIES.filter(c=>c.name.toLowerCase().includes(currencySearch.toLowerCase())||c.code.toLowerCase().includes(currencySearch.toLowerCase())).map(c=>(
                        <button key={c.code} onClick={()=>{setSelCurrency(c);setShowCurrency(false);setCurrencySearch('');}}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                          style={{borderColor:C.g50}}>
                          <span className="text-sm font-black w-6 text-center flex-shrink-0" style={{color:C.forest}}>{c.symbol}</span>
                          <div className="flex-1 text-left">
                            <p className="font-bold text-xs" style={{color:C.g800}}>{c.code}</p>
                            <p className="text-xs" style={{color:C.g400}}>{c.name}</p>
                          </div>
                          {selCurrency.code===c.code&&<CheckCircle size={13} style={{color:C.green}}/>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── PAYMENT (Gift Card Brand) ── */}
            <div>
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>PAYMENT</p>
              <div className="relative" ref={brandRef}>
                <button onClick={()=>{setShowBrand(!showBrand);setBrandSearch('');setShowCurrency(false);setShowCountry(false);}}
                  className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-bold transition"
                  style={{
                    borderColor:selBrand!=='All Brands'?C.forest:C.g200,
                    color:selBrand!=='All Brands'?C.forest:C.g600,
                    backgroundColor:selBrand!=='All Brands'?`${C.forest}08`:'transparent'
                  }}>
                  <span className="text-xs font-black flex-1 text-left truncate">
                    {selBrand==='All Brands'?'All Cards':selBrand}
                  </span>
                  <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${showBrand?'rotate-180':''}`}
                    style={{color:selBrand!=='All Brands'?C.forest:C.g400}}/>
                </button>
                {showBrand&&(
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                    style={{borderColor:C.g100}}>
                    <div className="px-2 py-2 border-b sticky top-0 bg-white" style={{borderColor:C.g100}}>
                      <input type="text" placeholder="Search card brand..." value={brandSearch}
                        onChange={e=>setBrandSearch(e.target.value)} onClick={e=>e.stopPropagation()}
                        className="w-full px-2.5 py-1.5 rounded-lg focus:outline-none"
                        style={{border:`1.5px solid ${C.g200}`,color:C.g800,backgroundColor:C.g50,fontSize:'16px'}}/>
                    </div>
                    <div style={{maxHeight:220,overflowY:'auto'}}>
                      {GC_BRANDS.filter(b=>b.toLowerCase().includes(brandSearch.toLowerCase())).map(b=>(
                        <button key={b} onClick={()=>{setSelBrand(b);setShowBrand(false);setBrandSearch('');}}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-gray-50 border-b last:border-0 transition"
                          style={{borderColor:C.g50}}>
                          <span className="font-semibold" style={{color:C.g800}}>{b}</span>
                          {selBrand===b&&<CheckCircle size={11} style={{color:C.green}}/>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── COUNTRY ── */}
            <div>
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>COUNTRY</p>
              <div className="relative" ref={countryRef}>
                <button onClick={()=>{setShowCountry(!showCountry);setShowCurrency(false);setShowBrand(false);}}
                  className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-bold transition"
                  style={{
                    borderColor:selCountry.code!=='ALL'?C.forest:C.g200,
                    color:selCountry.code!=='ALL'?C.forest:C.g600,
                    backgroundColor:selCountry.code!=='ALL'?`${C.forest}08`:'transparent'
                  }}>
                  <span className="text-xs">{selCountry.flag}</span>
                  <span className="text-xs font-black flex-1 text-left">{selCountry.name}</span>
                  <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${showCountry?'rotate-180':''}`}
                    style={{color:selCountry.code!=='ALL'?C.forest:C.g400}}/>
                </button>
                {showCountry&&(
                  <div className="absolute top-full right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                    style={{borderColor:C.g100,minWidth:'220px',maxWidth:'calc(100vw - 24px)'}}>
                    <div className="p-2 border-b sticky top-0 bg-white" style={{borderColor:C.g100}}>
                      <input type="text" placeholder="🔍  Search country…"
                        value={countrySearch} onChange={e=>setCountrySearch(e.target.value)}
                        className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                        style={{borderColor:C.g200,color:C.g800,fontSize:'16px'}}/>
                    </div>
                    <div className="overflow-y-auto max-h-56">
                    {(() => {
                      const q = countrySearch.toLowerCase();
                      const filtered = COUNTRIES.filter(c=>!q||c.name.toLowerCase().includes(q));
                      let lastReg = null;
                      return filtered.map(c=>{
                        const regHdr = !q && c.region && c.region!==lastReg
                          ? (lastReg=c.region, <div key={`r-${c.region}`} className="px-3 py-1" style={{backgroundColor:'#F8FAFC'}}>
                              <span className="text-xs font-black uppercase tracking-wider" style={{color:COUNTRY_REGIONS[c.region]||C.g500}}>{c.region}</span>
                            </div>)
                          : (c.region&&(lastReg=c.region), null);
                        return [regHdr,
                          <button key={c.code} onClick={()=>{setSelCountry(c);setShowCountry(false);setCountrySearch('');}}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                            style={{borderColor:C.g50,backgroundColor:selCountry.code===c.code?`${C.forest}08`:'transparent'}}>
                            <span className="text-sm">{c.flag}</span>
                            <span className="text-xs font-bold flex-1 text-left" style={{color:C.g800}}>{c.name}</span>
                            {selCountry.code===c.code&&<CheckCircle size={13} style={{color:C.green}}/>}
                          </button>
                        ];
                      });
                    })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sort + Search + Create + Clear — all on one line */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-black flex-shrink-0" style={{color:C.g500}}>Sort:</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              className="flex-shrink-0 px-2 py-2 font-bold border-2 rounded-xl focus:outline-none"
              style={{borderColor:sortBy!=='rate_low'?C.forest:C.g200,color:C.g800,fontSize:'13px',width:'105px'}}>
              <option value="rate_low">Best Rate</option>
              <option value="rate_high">Highest Rate</option>
              <option value="rating">Top Rated</option>
              <option value="trades">Most Trades</option>
            </select>
            <div className="flex-1 min-w-0 flex items-center border-2 rounded-xl overflow-hidden"
              style={{borderColor:traderSearch.trim()?C.forest:C.g200}}>
              <input
                type="text"
                placeholder="Search trader…"
                value={traderSearch}
                onChange={e=>setTraderSearch(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-2 font-bold focus:outline-none bg-transparent"
                style={{color:C.g800, fontSize:'16px'}}/>
              {traderSearch.trim()&&(
                <button onClick={()=>setTraderSearch('')} className="px-2 flex-shrink-0" style={{color:C.g400}}>
                  <X size={12}/>
                </button>
              )}
            </div>
            <button onClick={()=>navigate('/create-offer')}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl text-white font-black text-xs transition hover:opacity-90 active:scale-[0.97]"
              style={{backgroundColor:C.accent, whiteSpace:'nowrap'}}>
              <PlusCircle size={12}/> Create
            </button>
            {hasFilters&&(
              <button onClick={()=>{setAmountInput('');setSelBrand('All Brands');setSelCountry(COUNTRIES[0]);setTraderSearch('');setSortBy('rate_low');setCountrySearch('');}}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black border-2 transition"
                style={{borderColor:C.danger,color:C.danger,backgroundColor:'#FEF2F2'}}>
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          5. OFFER GRID
      ══════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto w-full px-2 sm:px-3 py-3 space-y-3">

        {/* ── Inline active trade cards ── */}
        {activeTrades.length > 0 && (
          <div className="mb-2 overflow-hidden">
            {activeTrades.slice(0, showAllTrades ? activeTrades.length : 3).map(trade => (
              <ActiveTradeCard key={trade.id} trade={trade} pageColor="#0D9488" onExpire={handleTradeExpire} />
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

        {/* Count row */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold" style={{color:C.g500}}>
            <span className="font-black text-sm" style={{color:C.g800}}>{filtered.length}</span>{' '}
            offers
            {selBrand!=='All Brands'&&` · ${selBrand}`}
            {amountInput&&` · $${amountInput}`}
            {selCountry.code!=='ALL'&&` · ${selCountry.flag} ${selCountry.name}`}
            {traderSearch.trim()&&` · "${traderSearch.trim()}"`}
          </p>
          <button onClick={()=>navigate('/create-offer')}
            className="flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-lg transition hover:opacity-80"
            style={{backgroundColor:`${C.forest}12`,color:C.forest}}>
            <PlusCircle size={12}/> Post Offer
          </button>
        </div>

        {loading && !listings.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
            {Array(6).fill(0).map((_,i)=><SkeletonCard key={i}/>)}
          </div>
        ) : loadError && !listings.length ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{borderColor:C.g200}}>
            <p className="text-5xl mb-3">📡</p>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>Couldn't load offers</p>
            <p className="text-sm mb-4" style={{color:C.g400}}>Check your internet connection and try again</p>
            <button onClick={()=>{ setLoading(true); loadListings(); }}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition flex items-center gap-2 mx-auto"
              style={{backgroundColor:C.forest}}>
              <RefreshCw size={14}/> Try Again
            </button>
          </div>
        ) : filtered.length===0?(
          <div className="bg-white rounded-2xl border p-10 text-center" style={{borderColor:C.g200}}>
            <p className="text-5xl mb-4">🎁</p>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>No gift card offers found</p>
            <p className="text-sm" style={{color:C.g400}}>Try a different brand or be the first to post</p>
            <button onClick={()=>navigate('/create-offer')}
              className="mt-4 px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition"
              style={{backgroundColor:C.forest}}>
              Post Offer
            </button>
          </div>
        ):(
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
            {filtered.map(l=>(
              <GCCard
                key={l.id}
                listing={l}
                btcPriceUSD={btcPrice}
                onViewSeller={()=>setModal({seller:l.users||{},listing:l})}
                onTrade={()=>handleTrade(l.id)}
              />
            ))}
          </div>
        )}

        {/* Safety notice */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl border"
          style={{backgroundColor:C.mist,borderColor:`${C.green}30`}}>
          <Shield size={13} className="flex-shrink-0 mt-0.5" style={{color:C.green}}/>
          <p className="text-xs leading-relaxed" style={{color:C.g700}}>
            <strong>Trade Safely:</strong> Only share gift card codes inside the active escrow trade.
            Never send codes before the trade is confirmed locked. Every trade is platform-protected.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          6. FOOTER
      ══════════════════════════════════════════════════ */}
      <PRQFooter/>

      {modal&&(
        <SellerModal
          seller={modal.seller}
          listing={modal.listing}
          btcPriceUSD={btcPrice}
          onClose={()=>setModal(null)}
          onTrade={()=>handleTrade(modal.listing?.id)}
        />
      )}
    </div>
  );
}
