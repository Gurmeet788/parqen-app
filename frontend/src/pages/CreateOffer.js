import React, { useState, useEffect, useRef } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../App';
import {
  Bitcoin, TrendingUp, Check, Info, AlertTriangle, Clock,
  DollarSign, Shield, ArrowRight, RefreshCw, Plus, Minus,
  Eye, ChevronRight, ChevronLeft, ShoppingCart, Tag,
  BarChart2, Settings2, FileText, ArrowUpRight, ArrowDownRight,
  Gift, Search, ChevronDown, X,
  Smartphone, Banknote, Zap, Star, Wallet
} from 'lucide-react';
import { toast } from 'react-toastify';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', amber:'#F59E0B', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0', g300:'#CBD5E1',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', paid:'#3B82F6', purple:'#8B5CF6',
  orange:'#F97316',
};

const fmt = (n, d = 2) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n || 0);

const COUNTRIES = [
  { code:'GH', name:'Ghana',          currency:'GHS', symbol:'₵',   flag:'🇬🇭' },
  { code:'NG', name:'Nigeria',        currency:'NGN', symbol:'₦',   flag:'🇳🇬' },
  { code:'KE', name:'Kenya',          currency:'KES', symbol:'KSh', flag:'🇰🇪' },
  { code:'ZA', name:'South Africa',   currency:'ZAR', symbol:'R',   flag:'🇿🇦' },
  { code:'UG', name:'Uganda',         currency:'UGX', symbol:'USh', flag:'🇺🇬' },
  { code:'TZ', name:'Tanzania',       currency:'TZS', symbol:'TSh', flag:'🇹🇿' },
  { code:'US', name:'United States',  currency:'USD', symbol:'$',   flag:'🇺🇸' },
  { code:'GB', name:'United Kingdom', currency:'GBP', symbol:'£',   flag:'🇬🇧' },
  { code:'EU', name:'Europe',         currency:'EUR', symbol:'€',   flag:'🇪🇺' },
  { code:'CM', name:'Cameroon',       currency:'XAF', symbol:'CFA', flag:'🇨🇲' },
  { code:'SN', name:'Senegal',        currency:'XOF', symbol:'CFA', flag:'🇸🇳' },
  { code:'CI', name:"Côte d'Ivoire",  currency:'XOF', symbol:'CFA', flag:'🇨🇮' },
  { code:'RW', name:'Rwanda',         currency:'RWF', symbol:'RF',  flag:'🇷🇼' },
  { code:'ET', name:'Ethiopia',       currency:'ETB', symbol:'Br',  flag:'🇪🇹' },
  { code:'AU', name:'Australia',      currency:'AUD', symbol:'A$',  flag:'🇦🇺' },
  { code:'CA', name:'Canada',         currency:'CAD', symbol:'C$',  flag:'🇨🇦' },
  { code:'SG', name:'Singapore',      currency:'SGD', symbol:'S$',  flag:'🇸🇬' },
  { code:'IN', name:'India',          currency:'INR', symbol:'₹',   flag:'🇮🇳' },
  // Europe
  { code:'DE', name:'Germany',        currency:'EUR', symbol:'€',   flag:'🇩🇪' },
  { code:'ES', name:'Spain',          currency:'EUR', symbol:'€',   flag:'🇪🇸' },
  { code:'RU', name:'Russia',         currency:'RUB', symbol:'₽',   flag:'🇷🇺' },
  // Americas
  { code:'VE', name:'Venezuela',      currency:'VES', symbol:'Bs.', flag:'🇻🇪' },
  // Asia
  { code:'CN', name:'China',          currency:'CNY', symbol:'¥',   flag:'🇨🇳' },
  { code:'JP', name:'Japan',          currency:'JPY', symbol:'¥',   flag:'🇯🇵' },
  { code:'KR', name:'South Korea',    currency:'KRW', symbol:'₩',   flag:'🇰🇷' },
  { code:'PH', name:'Philippines',    currency:'PHP', symbol:'₱',   flag:'🇵🇭' },
  { code:'TH', name:'Thailand',       currency:'THB', symbol:'฿',   flag:'🇹🇭' },
  { code:'MY', name:'Malaysia',       currency:'MYR', symbol:'RM',  flag:'🇲🇾' },
  { code:'ID', name:'Indonesia',      currency:'IDR', symbol:'Rp',  flag:'🇮🇩' },
  { code:'VN', name:'Vietnam',        currency:'VND', symbol:'₫',   flag:'🇻🇳' },
  { code:'PK', name:'Pakistan',       currency:'PKR', symbol:'₨',   flag:'🇵🇰' },
  { code:'BD', name:'Bangladesh',     currency:'BDT', symbol:'৳',   flag:'🇧🇩' },
];

// Deduplicated currency list derived from COUNTRIES
const CURRENCIES_LIST = [...new Map(
  COUNTRIES.map(c => [c.currency, { code: c.currency, symbol: c.symbol }])
).values()];

// USD_RATES is now provided by RatesContext — do NOT define a static object here

// ── Payment methods — comprehensive list with categories ──────────────────────
const PAYMENT_METHODS = [
  // Mobile Money
  { id:'mtn_momo',      name:'MTN Mobile Money',             icon:'📱', cat:'Mobile Money',   countries:['GH','NG','UG','CM','RW','CI'] },
  { id:'vodafone',      name:'Vodafone Cash',                icon:'📱', cat:'Mobile Money',   countries:['GH'] },
  { id:'airteltigo',    name:'AirtelTigo Money',             icon:'📱', cat:'Mobile Money',   countries:['GH'] },
  { id:'mpesa',         name:'M-Pesa',                       icon:'📱', cat:'Mobile Money',   countries:['KE','TZ'] },
  { id:'airtel_money',  name:'Airtel Money',                 icon:'📱', cat:'Mobile Money',   countries:['UG','TZ','KE'] },
  { id:'orange_money',  name:'Orange Money',                 icon:'📱', cat:'Mobile Money',   countries:['CM','SN','CI'] },
  { id:'wave',          name:'Wave',                         icon:'🌊', cat:'Mobile Money',   countries:['SN','CI'] },
  { id:'chipper',       name:'Chipper Cash',                 icon:'💚', cat:'Mobile Money',   countries:[] },
  { id:'ecocash',       name:'EcoCash',                      icon:'📱', cat:'Mobile Money',   countries:['ZW'] },
  { id:'tigo_pesa',     name:'Tigo Pesa / Mixx',             icon:'📱', cat:'Mobile Money',   countries:['TZ'] },
  { id:'moov_money',    name:'Moov Money',                   icon:'📱', cat:'Mobile Money',   countries:['BJ','CI','TG'] },
  { id:'africell',      name:'Africell Money',               icon:'📱', cat:'Mobile Money',   countries:['SL','GM'] },
  { id:'paga',          name:'Paga',                         icon:'🟢', cat:'Mobile Money',   countries:['NG'] },
  // Digital Wallets & E-wallets
  { id:'paypal',        name:'PayPal',                       icon:'💰', cat:'Digital Wallet', countries:['US','GB','EU','AU','CA'] },
  { id:'cash_app',      name:'Cash App',                     icon:'💸', cat:'Digital Wallet', countries:['US','GB'] },
  { id:'apple_pay',     name:'Apple Pay',                    icon:'🍎', cat:'Digital Wallet', countries:['US','GB','EU','AU','CA'] },
  { id:'alipay',        name:'Alipay',                       icon:'💙', cat:'Digital Wallet', countries:[] },
  { id:'wechat_pay',    name:'WeChat Pay',                   icon:'💬', cat:'Digital Wallet', countries:[] },
  { id:'venmo',         name:'Venmo',                        icon:'🔵', cat:'Digital Wallet', countries:['US'] },
  { id:'zelle',         name:'Zelle',                        icon:'💜', cat:'Digital Wallet', countries:['US'] },
  { id:'revolut',       name:'Revolut',                      icon:'🔷', cat:'Digital Wallet', countries:['GB','EU'] },
  { id:'skrill',        name:'Skrill',                       icon:'💳', cat:'Digital Wallet', countries:[] },
  { id:'neteller',      name:'Neteller',                     icon:'💳', cat:'Digital Wallet', countries:[] },
  { id:'payeer',        name:'Payeer',                       icon:'💳', cat:'Digital Wallet', countries:[] },
  { id:'perfect_money', name:'Perfect Money',                icon:'💳', cat:'Digital Wallet', countries:[] },
  // Remittance
  { id:'wise',          name:'Wise',                         icon:'🌍', cat:'Remittance',     countries:['US','GB','EU','AU','CA'] },
  { id:'worldremit',    name:'WorldRemit',                   icon:'🌐', cat:'Remittance',     countries:[] },
  { id:'remitly',       name:'Remitly',                      icon:'🚀', cat:'Remittance',     countries:[] },
  { id:'western_union', name:'Western Union',                icon:'🏢', cat:'Remittance',     countries:[] },
  { id:'moneygram',     name:'MoneyGram',                    icon:'🏢', cat:'Remittance',     countries:[] },
  // FinTech / Neobank
  { id:'opay',          name:'OPay',                         icon:'🟢', cat:'FinTech',        countries:['NG'] },
  { id:'palmpay',       name:'PalmPay',                      icon:'🌴', cat:'FinTech',        countries:['NG'] },
  { id:'kuda',          name:'Kuda Bank',                    icon:'🏦', cat:'FinTech',        countries:['NG'] },
  { id:'moniepoint',    name:'Moniepoint',                   icon:'🏦', cat:'FinTech',        countries:['NG'] },
  { id:'gtbank',        name:'GTBank',                       icon:'🏦', cat:'FinTech',        countries:['NG'] },
  { id:'access',        name:'Access Bank',                  icon:'🏦', cat:'FinTech',        countries:['NG'] },
  { id:'paystack',      name:'Paystack',                     icon:'💚', cat:'FinTech',        countries:['NG','GH','ZA'] },
  { id:'flutterwave',   name:'Flutterwave (Barter)',          icon:'🦋', cat:'FinTech',        countries:['NG','GH','KE','ZA'] },
  // Bank
  { id:'bank_transfer', name:'Bank Transfer',                icon:'🏦', cat:'Bank',           countries:[] },
  { id:'wire_transfer', name:'Wire Transfer',                icon:'🔗', cat:'Bank',           countries:[] },
  { id:'mobile_banking',name:'Mobile Banking App',           icon:'📲', cat:'Bank',           countries:[] },
  { id:'interbank',     name:'Interbank (GhIPSS/NIBSS/EFT)', icon:'🏦', cat:'Bank',           countries:['GH','NG'] },
  { id:'ussd',          name:'USSD Bank Transfer',           icon:'📞', cat:'Bank',           countries:[] },
  { id:'instant_eft',   name:'Instant EFT (South Africa)',   icon:'🏦', cat:'Bank',           countries:['ZA'] },
  { id:'cash_deposit',  name:'Cash Deposit (Bank Counter)',  icon:'🏦', cat:'Bank',           countries:[] },
  // Cash
  { id:'cash_person',   name:'Cash in Person (Face-to-Face)',icon:'💵', cat:'Cash',           countries:[] },
  { id:'cash_out',      name:'Cash Out',                     icon:'💵', cat:'Cash',           countries:[] },
  // Crypto
  { id:'usdt',          name:'USDT (Tether – TRC20)',         icon:'💵', cat:'Crypto',         countries:[] },
  { id:'binance_pay',   name:'Binance Pay',                  icon:'🟡', cat:'Crypto',         countries:[] },
  { id:'btc_pay',       name:'Bitcoin (BTC)',                 icon:'₿',  cat:'Crypto',         countries:[] },
  { id:'eth_pay',       name:'Ethereum (ETH)',               icon:'⬡',  cat:'Crypto',         countries:[] },
  { id:'luno',          name:'Luno Wallet',                  icon:'🌙', cat:'Crypto',         countries:[] },
  { id:'yellow_card',   name:'Yellow Card Wallet',           icon:'💛', cat:'Crypto',         countries:[] },
  // Gift Card / Voucher payment
  { id:'pls_gc',        name:'PLS Gift Card',                icon:'🎁', cat:'Gift Card Pay',  countries:[] },
  { id:'vanilla',       name:'Vanilla Card',                 icon:'🎁', cat:'Gift Card Pay',  countries:[] },
  { id:'razer_gold',    name:'Razer Gold Gift Card',          icon:'🎮', cat:'Gift Card Pay',  countries:[] },
  { id:'moneypak',      name:'MoneyPak',                     icon:'💚', cat:'Gift Card Pay',  countries:['US'] },
  { id:'postepay',      name:'PostePay',                     icon:'🟡', cat:'Gift Card Pay',  countries:['IT'] },
  { id:'walmart_w2w',   name:'Walmart to Walmart',           icon:'🛒', cat:'Gift Card Pay',  countries:['US'] },
  { id:'psn_pay',       name:'PlayStation Gift Card',        icon:'🎮', cat:'Gift Card Pay',  countries:[] },
];

const CAT_COLORS = {
  'Mobile Money':  C.success,
  'Digital Wallet':'#3B82F6',
  'Remittance':    '#0D9488',
  'FinTech':       C.amber,
  'Bank':          '#7C3AED',
  'Cash':          C.gold,
  'Crypto':        '#F97316',
  'Gift Card Pay': '#EC4899',
};

// ── Gift card brands ──────────────────────────────────────────────────────────
const GC_BRANDS = [
  { name:'Amazon',              icon:'📦', color:'#FF9900' },
  { name:'Apple / iTunes',      icon:'🍎', color:'#555555' },
  { name:'iTunes Denmark',      icon:'🍎', color:'#C5001A' },
  { name:'Google Play',         icon:'▶️',  color:'#34A853' },
  { name:'Steam',               icon:'🎮', color:'#1B2838' },
  { name:'eBay',                icon:'🛍️', color:'#E53238' },
  { name:'Walmart',             icon:'🛒', color:'#0071CE' },
  { name:'Target',              icon:'🎯', color:'#CC0000' },
  { name:'Visa Gift Card',      icon:'💳', color:'#1A1F71' },
  { name:'Mastercard GC',       icon:'💳', color:'#EB001B' },
  { name:'Amex Gift Card',      icon:'💳', color:'#007BC1' },
  { name:'Netflix',             icon:'🎬', color:'#E50914' },
  { name:'Spotify',             icon:'🎵', color:'#1DB954' },
  { name:'Xbox',                icon:'🎮', color:'#107C10' },
  { name:'PlayStation',         icon:'🎮', color:'#003087' },
  { name:'Nintendo',            icon:'🎮', color:'#E4000F' },
  { name:'Razer Gold',          icon:'🟡', color:'#44D62C' },
  { name:'Nike Gift Card',      icon:'👟', color:'#111111' },
  { name:'MoneyPak',            icon:'💚', color:'#00A651' },
  { name:'PostePay',            icon:'🟡', color:'#FFCC00' },
  { name:'PLS Gift Card',       icon:'🎁', color:'#FF6B6B' },
  { name:'Vanilla Card',        icon:'🎁', color:'#8B4513' },
  { name:'Roblox',              icon:'🟥', color:'#E62E2E' },
  { name:'Fortnite V-Bucks',    icon:'🎮', color:'#1D76DB' },
  { name:'Other',               icon:'🎁', color:'#94A3B8' },
];

const GC_FACE_VALUES = [10, 20, 25, 50, 100, 200, 500, 1000];
const TIME_LIMITS = [15, 30, 45, 60, 90, 120];

const GC_CURRENCIES = [
  { region:'iTunes USA',        currency:'USD', symbol:'$',  flag:'🇺🇸' },
  { region:'iTunes UK',         currency:'GBP', symbol:'£',  flag:'🇬🇧' },
  { region:'iTunes Germany',    currency:'EUR', symbol:'€',  flag:'🇩🇪' },
  { region:'iTunes France',     currency:'EUR', symbol:'€',  flag:'🇫🇷' },
  { region:'iTunes Spain',      currency:'EUR', symbol:'€',  flag:'🇪🇸' },
  { region:'iTunes Italy',      currency:'EUR', symbol:'€',  flag:'🇮🇹' },
  { region:'iTunes Netherlands',currency:'EUR', symbol:'€',  flag:'🇳🇱' },
  { region:'iTunes Canada',     currency:'CAD', symbol:'C$', flag:'🇨🇦' },
  { region:'iTunes Australia',  currency:'AUD', symbol:'A$', flag:'🇦🇺' },
  { region:'iTunes Japan',      currency:'JPY', symbol:'¥',  flag:'🇯🇵' },
  { region:'iTunes Poland',     currency:'PLN', symbol:'zł', flag:'🇵🇱' },
  { region:'iTunes Sweden',     currency:'SEK', symbol:'kr', flag:'🇸🇪' },
  { region:'iTunes Norway',     currency:'NOK', symbol:'kr', flag:'🇳🇴' },
  { region:'iTunes Denmark',    currency:'DKK', symbol:'kr', flag:'🇩🇰' },
  { region:'iTunes Switzerland',currency:'CHF', symbol:'Fr', flag:'🇨🇭' },
  { region:'iTunes Mexico',     currency:'MXN', symbol:'$',  flag:'🇲🇽' },
  { region:'iTunes Brazil',     currency:'BRL', symbol:'R$', flag:'🇧🇷' },
  { region:'Amazon USA',        currency:'USD', symbol:'$',  flag:'🇺🇸' },
  { region:'Amazon UK',         currency:'GBP', symbol:'£',  flag:'🇬🇧' },
  { region:'Amazon Germany',    currency:'EUR', symbol:'€',  flag:'🇩🇪' },
  { region:'Amazon Canada',     currency:'CAD', symbol:'C$', flag:'🇨🇦' },
  { region:'Amazon Australia',  currency:'AUD', symbol:'A$', flag:'🇦🇺' },
  { region:'Amazon India',      currency:'INR', symbol:'₹',  flag:'🇮🇳' },
  { region:'Amazon Japan',      currency:'JPY', symbol:'¥',  flag:'🇯🇵' },
  { region:'Google Play USA',   currency:'USD', symbol:'$',  flag:'🇺🇸' },
  { region:'Google Play UK',    currency:'GBP', symbol:'£',  flag:'🇬🇧' },
  { region:'Google Play Germany',currency:'EUR',symbol:'€',  flag:'🇩🇪' },
  { region:'Google Play Canada',currency:'CAD', symbol:'C$', flag:'🇨🇦' },
  { region:'Google Play Australia',currency:'AUD',symbol:'A$',flag:'🇦🇺' },
  { region:'Steam USA',         currency:'USD', symbol:'$',  flag:'🇺🇸' },
  { region:'Steam Europe',      currency:'EUR', symbol:'€',  flag:'🇪🇺' },
  { region:'Steam UK',          currency:'GBP', symbol:'£',  flag:'🇬🇧' },
  { region:'Razer Gold Global', currency:'USD', symbol:'$',  flag:'🌍' },
  { region:'Vanilla Visa USA',  currency:'USD', symbol:'$',  flag:'🇺🇸' },
  { region:'Vanilla Visa Europe',currency:'EUR',symbol:'€',  flag:'🇪🇺' },
];

// ── Step configs ──────────────────────────────────────────────────────────────
const BTC_STEPS  = [
  { id:1, label:'Type',    icon:Tag },
  { id:2, label:'Payment', icon:DollarSign },
  { id:3, label:'Pricing', icon:BarChart2 },
  { id:4, label:'Limits',  icon:Settings2 },
  { id:5, label:'Review',  icon:FileText },
];
const GC_STEPS = [
  { id:1, label:'Type',    icon:Tag },
  { id:2, label:'Card',    icon:Gift },
  { id:3, label:'Payment', icon:DollarSign },
  { id:4, label:'Rate',    icon:BarChart2 },
  { id:5, label:'Review',  icon:FileText },
];

export default function CreateOffer() {
  const navigate = useNavigate();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  const payRef = useRef(null);

  const [step,         setStep]         = useState(1);
  const [submitting,   setSubmitting]   = useState(false);
  const [dupOfferWarning, setDupOfferWarning] = useState(null); // { status, id }
  const [btcPrice,     setBtcPrice]     = useState(68000);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [walletBal,    setWalletBal]    = useState({ btc: 0, usd: 0 });

  // Step 1
  const [offerType, setOfferType] = useState('sell'); // sell | buy | gc_buy

  // Step 2 – GC
  const [gcBrand,       setGcBrand]       = useState('Amazon');
  const [gcCardType,    setGcCardType]    = useState('both');   // 'physical' | 'ecode' | 'both'
  const [gcCardValues,  setGcCardValues]  = useState([50]);     // array of selected denominations
  const [gcSearch,      setGcSearch]      = useState('');
  const [gcCurrencies,  setGcCurrencies]  = useState([]);       // selected currency regions (max 10)
  const [gcCurrSearch,  setGcCurrSearch]  = useState('');

  // Step 2/3 – Country + Payment
  const [country,        setCountry]        = useState('GH');
  const [countrySearch,  setCountrySearch]  = useState('');
  const [currencyCode,   setCurrencyCode]   = useState('GHS');
  const [currencySymbol, setCurrencySymbol] = useState('₵');
  const [currencySearch, setCurrencySearch] = useState('');
  const [payMethod,      setPayMethod]      = useState('');
  const [paySearch,      setPaySearch]      = useState('');
  const [showPayMenu,    setShowPayMenu]    = useState(false);

  // Step 3/4 – Pricing
  const [pricingType, setPricingType] = useState('market');
  const [margin,      setMargin]      = useState(5);
  const [fixedPrice,  setFixedPrice]  = useState('');

  // Step 4 – Limits (BTC only)
  const [minLimit,  setMinLimit]  = useState('');
  const [maxLimit,  setMaxLimit]  = useState('');
  const [timeLimit, setTimeLimit] = useState(30);

  // Step 5 – Text
  const [instructions, setInstructions] = useState('');
  const [terms,        setTerms]        = useState('');

  const isGC = offerType === 'gc_buy';
  const steps = isGC ? GC_STEPS : BTC_STEPS;

  // Derived values
  const curr       = COUNTRIES.find(c => c.code === country);
  const localRate  = USD_RATES[currencyCode] || 1;
  const btcLocal   = btcPrice * localRate;
  const effectiveRate = pricingType === 'fixed' && fixedPrice
    ? parseFloat(fixedPrice)
    : btcLocal * (1 + margin / 100);
  const sym = currencySymbol || '$';
  const cur = currencyCode   || 'USD';

  // Grouped payment methods for dropdown
  const matchesPay = (m) => {
    if (!paySearch) return true;
    return m.name.toLowerCase().includes(paySearch.toLowerCase()) ||
           m.cat.toLowerCase().includes(paySearch.toLowerCase());
  };
  const localMethods = PAYMENT_METHODS.filter(m =>
    (m.countries.length === 0 || m.countries.includes(country)) && matchesPay(m)
  );
  const otherMethods = paySearch
    ? PAYMENT_METHODS.filter(m => m.countries.length > 0 && !m.countries.includes(country) && matchesPay(m))
    : [];
  const selectedPay = PAYMENT_METHODS.find(m => m.id === payMethod);

  // Filtered GC brands
  const filteredBrands = GC_BRANDS.filter(b =>
    b.name.toLowerCase().includes(gcSearch.toLowerCase())
  );

  // BTC amounts
  const gcMinVal    = gcCardValues.length ? Math.min(...gcCardValues) : 0;
  const gcMaxVal    = gcCardValues.length ? Math.max(...gcCardValues) : 0;
  const minLocalVal = isGC ? gcMinVal : (parseFloat(minLimit) || 0);
  const maxLocalVal = isGC ? gcMaxVal : (parseFloat(maxLimit) || 0);
  const minUSDVal   = isGC ? gcMinVal : (minLocalVal / localRate);
  const maxUSDVal   = isGC ? gcMaxVal : (maxLocalVal / localRate);

  // Wallet capacity in local currency
  // SELL/gc_buy: user locks BTC → capacity = BTC balance × local BTC price
  // BUY: no wallet restriction — buyer pays fiat out-of-platform, any limit is valid
  const isSellSide = offerType === 'sell' || offerType === 'gc_buy';
  const walletCapacityLocal = (() => {
    if (isSellSide) return walletBal.btc * effectiveRate;
    return 0; // buy offers: no platform-wallet cap
  })();
  const walletCapacityUSD = isSellSide ? walletBal.btc * btcPrice : 0;
  // Only warn sell-side offers when max exceeds actual BTC balance
  const maxExceedsWallet = isSellSide && parseFloat(maxLimit) > 0 && walletCapacityLocal > 0 && parseFloat(maxLimit) > walletCapacityLocal;

  // Sync BTC price from RatesContext (already auto-refreshed by rateService)
  useEffect(() => { if (contextBtcUsd > 0) { setBtcPrice(contextBtcUsd); setLoadingPrice(false); } }, [contextBtcUsd]);

  useEffect(() => {
    const iv = setInterval(() => {}, 60000); // kept to preserve cleanup shape

    // Fetch wallet balance so we can enforce limits
    const token = localStorage.getItem('token');
    if (token) {
      axios.get(`${API_URL}/user/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => setWalletBal({ btc: parseFloat(r.data.balance_btc||0), usd: parseFloat(r.data.balance_usd||0) }))
        .catch(() => {});
    }

    return () => clearInterval(iv);
  }, []);

  // Close payment dropdown on outside click
  useEffect(() => {
    const h = e => { if (payRef.current && !payRef.current.contains(e.target)) setShowPayMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Reset payment + auto-update currency when country changes
  useEffect(() => {
    setPayMethod('');
    const c = COUNTRIES.find(ct => ct.code === country);
    if (c) { setCurrencyCode(c.currency); setCurrencySymbol(c.symbol); }
  }, [country]);

  const canNext = () => {
    if (step === 1) return !!offerType;
    if (step === 2) {
      if (isGC) return !!gcBrand && gcCardValues.length > 0;
      return !!country && !!payMethod;
    }
    if (step === 3) {
      if (isGC) return !!country;
      if (pricingType === 'fixed') return !!fixedPrice && parseFloat(fixedPrice) > 0;
      return true;
    }
    if (step === 4) {
      if (isGC) return true;
      const mn = parseFloat(minLimit), mx = parseFloat(maxLimit);
      if (!(mn > 0 && mx > 0 && mx >= mn)) return false;
      if (minUSDVal < 10) return false;
      // Max cannot exceed what the seller actually has in their wallet
      if ((offerType === 'sell') && walletCapacityLocal > 0 && mx > walletCapacityLocal) return false;
      return true;
    }
    return true;
  };

  const next = () => {
    if (canNext()) {
      setStep(s => Math.min(s + 1, 5));
    } else if (step === 4 && !isGC) {
      const mn = parseFloat(minLimit), mx = parseFloat(maxLimit);
      if (minUSDVal < 10) {
        toast.warn(`Minimum must be at least $10 USD — that's ${sym}${fmt(10 * localRate, 0)} ${cur}`);
      } else if (offerType === 'sell' && walletCapacityLocal > 0 && mx > walletCapacityLocal) {
        toast.warn(`Maximum cannot exceed your wallet balance of ${sym}${fmt(walletCapacityLocal, 0)} ${cur}`);
      } else if (!(mn > 0 && mx > 0 && mx >= mn)) {
        toast.warn('Maximum must be greater than or equal to minimum');
      } else {
        toast.warn('Please complete all required fields');
      }
    } else {
      toast.warn('Please complete all required fields');
    }
  };
  const back = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    // Hard block: minimum must be ≥ $10 for non-gift-card offers (catches any bypass of step 4)
    if (!isGC && minUSDVal < 10) {
      toast.error(`Minimum must be at least $10 USD — that's ${sym}${fmt(10 * localRate, 0)} ${cur}`);
      setStep(4);
      return;
    }
    setSubmitting(true);
    try {
      const user  = JSON.parse(localStorage.getItem('user')  || '{}');
      const token = localStorage.getItem('token');
      if (!user.id) { toast.error('Please login to create an offer'); navigate('/login'); return; }

      const listingTypeMap = { sell:'SELL', buy:'BUY', gc_buy:'BUY_GIFT_CARD' };

      const rateUSD = pricingType === 'fixed' && fixedPrice
        ? parseFloat(fixedPrice)
        : btcPrice * (1 + margin / 100);

      const payload = {
        type:              offerType,
        listing_type:      listingTypeMap[offerType],
        gift_card_brand:      isGC ? gcBrand : null,
        face_value:           isGC ? gcMinVal : null,
        card_values:          isGC && gcCardValues.length > 0 ? gcCardValues.map(Number) : null,
        card_type:            isGC ? gcCardType : null,
        gift_card_currencies: isGC && gcCurrencies.length > 0 ? gcCurrencies : null,
        amount_usd:        isGC ? gcMinVal : minUSDVal,
        bitcoin_price:     rateUSD,
        margin:            pricingType === 'market' ? margin : 0,
        payment_method:    isGC ? gcBrand : (selectedPay?.name || payMethod),
        country:           country,
        currency:          cur,
        currency_symbol:   sym,
        min_limit_usd:     minUSDVal,
        max_limit_usd:     maxUSDVal,
        min_limit_local:   minLocalVal,
        max_limit_local:   maxLocalVal,
        time_limit:        timeLimit,
        pricing_type:      pricingType,
        description:       instructions,
        listing_terms:     terms,
        trade_instructions:instructions,
        created_at:        new Date().toISOString(),
      };

      const r = await axios.post(`${API_URL}/offers`, payload, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (r.data.success || r.data.offer) {
        toast.success('🎉 Offer published successfully!');
        if (offerType === 'sell') navigate('/buy-bitcoin');
        else if (offerType === 'buy') navigate('/sell-bitcoin');
        else navigate('/gift-cards');
      } else {
        toast.error(r.data.error || 'Failed to publish offer');
      }
    } catch (e) {
      const errData = e.response?.data;
      if (errData?.existingOfferId) {
        setDupOfferWarning({ status: errData.existingOfferStatus, id: errData.existingOfferId });
      } else {
        toast.error(errData?.error || 'Failed to publish offer');
      }
    } finally { setSubmitting(false); }
  };

  // ── Payment method dropdown — fixed bottom sheet on mobile ───────────────
  const PayDropdown = () => {
    const cats = [...new Set(localMethods.map(m => m.cat))];
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => { setShowPayMenu(false); setPaySearch(''); }} />
        {/* Bottom sheet */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: '72vh', animation: 'slideUp .22s ease' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <p className="font-black text-sm" style={{ color: C.g800 }}>Select Payment Method</p>
            <button onClick={() => { setShowPayMenu(false); setPaySearch(''); }}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: C.g100 }}>
              <X size={15} style={{ color: C.g500 }} />
            </button>
          </div>
          {/* Search — 16px font, no autoFocus */}
          <div className="px-3 pb-2 border-b flex-shrink-0" style={{ borderColor: C.g100 }}>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
              <input type="text" value={paySearch} onChange={e => setPaySearch(e.target.value)}
                placeholder="Search payment method…"
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border focus:outline-none font-semibold"
                style={{ borderColor: C.g200, fontSize: '16px' }} />
            </div>
          </div>
          {/* Scrollable list */}
          <div className="overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>
            {localMethods.length > 0 && (
              <div>
                <p className="px-3 pt-2 pb-1 text-xs font-black uppercase tracking-widest"
                  style={{ color: C.g400 }}>
                  {curr?.flag} Available in {curr?.name}
                </p>
                {cats.map(cat => {
                  const items = localMethods.filter(m => m.cat === cat);
                  if (!items.length) return null;
                  return (
                    <div key={cat}>
                      <p className="px-3 py-1 text-xs font-bold uppercase"
                        style={{ color: CAT_COLORS[cat] || C.g500 }}>{cat}</p>
                      {items.map(m => (
                        <button key={m.id}
                          onClick={() => { setPayMethod(m.id); setShowPayMenu(false); setPaySearch(''); setDupOfferWarning(null); }}
                          className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-gray-100 transition"
                          style={{ backgroundColor: payMethod === m.id ? `${C.green}08` : undefined }}>
                          <span className="text-xl w-7 text-center flex-shrink-0">{m.icon}</span>
                          <span className="text-sm font-semibold flex-1" style={{ color: C.g800 }}>{m.name}</span>
                          {payMethod === m.id && <Check size={14} style={{ color: C.green }} />}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            {otherMethods.length > 0 && (
              <div>
                <p className="px-3 pt-2 pb-1 text-xs font-black uppercase tracking-widest"
                  style={{ color: C.g400 }}>Other Methods</p>
                {otherMethods.map(m => (
                  <button key={m.id}
                    onClick={() => { setPayMethod(m.id); setShowPayMenu(false); setPaySearch(''); setDupOfferWarning(null); }}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-gray-100 transition">
                    <span className="text-xl w-7 text-center flex-shrink-0">{m.icon}</span>
                    <span className="text-sm font-semibold flex-1" style={{ color: C.g800 }}>{m.name}</span>
                    <span className="text-xs" style={{ color: C.g400 }}>{m.cat}</span>
                    {payMethod === m.id && <Check size={14} style={{ color: C.green }} />}
                  </button>
                ))}
              </div>
            )}
            {localMethods.length === 0 && otherMethods.length === 0 && (
              <p className="text-center text-sm py-8" style={{ color: C.g400 }}>No methods found</p>
            )}
            <div style={{ height: 'max(env(safe-area-inset-bottom), 20px)' }} />
          </div>
        </div>
      </>
    );
  };

  // ── Market card preview ───────────────────────────────────────────────────
  const MarketCardPreview = () => (
    <div className="rounded-xl border overflow-hidden shadow-sm" style={{ borderColor: C.g200, width:'100%', boxSizing:'border-box' }}>
      <div className="px-3 pt-3 pb-2 border-b" style={{ borderColor: C.g100 }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-sm"
            style={{ backgroundColor: C.green }}>You</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black" style={{ color: C.g800 }}>Your Offer</span>
              <span className="text-xs">{curr?.flag}</span>
              <span className="text-xs font-black px-1.5 py-0.5 rounded-sm text-white"
                style={{ backgroundColor: C.green }}>⭐ Pro</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs mt-0.5 font-black" style={{ color: C.g500 }}>
              <span style={{ color: C.success }}>👍 0</span>
              <span>·</span><span>0 Trades</span>
              <span>·</span><span style={{ color: C.success }}>● Active</span>
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 py-2 border-b grid grid-cols-2 gap-2" style={{ borderColor: C.g100 }}>
        {isGC ? (
          <>
            <div>
              <p className="text-xs font-black uppercase tracking-wide mb-0.5" style={{ color: C.g500 }}>Card Range</p>
              <div className="flex flex-wrap gap-1">
                {gcCardValues.length > 0 ? gcCardValues.map(v => (
                  <span key={v} className="text-xs font-black px-1.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: C.purple }}>${v}</span>
                )) : <span className="text-xs" style={{ color: C.g400 }}>—</span>}
              </div>
            </div>
            <div className="border-l pl-2" style={{ borderColor: C.g100 }}>
              <p className="text-xs font-black uppercase tracking-wide mb-0.5" style={{ color: C.g500 }}>{gcBrand}</p>
              <p className="text-xs font-black" style={{ color: C.g800 }}>
                {gcCardType === 'physical' ? 'Physical Card' : gcCardType === 'ecode' ? 'E-Code' : 'Physical & E-Code'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs font-black uppercase tracking-wide mb-0.5" style={{ color: C.g500 }}>
                {offerType === 'sell' ? 'BTC Amount' : 'You Pay'}
              </p>
              <p className="text-xs font-black" style={{ color: C.g800 }}>
                {minLimit ? `₿${(parseFloat(minLimit) / effectiveRate).toFixed(5)}` : '₿ —'}
              </p>
            </div>
            <div className="border-l pl-2" style={{ borderColor: C.g100 }}>
              <p className="text-xs font-black uppercase tracking-wide mb-0.5" style={{ color: C.g500 }}>
                {selectedPay?.name || 'Payment'}
              </p>
              <p className="text-xs font-black" style={{ color: C.g800 }}>
                {minLimit ? `${sym}${fmt(parseFloat(minLimit))} ${cur}` : `${sym}— ${cur}`}
              </p>
            </div>
          </>
        )}
      </div>
      <div className="px-3 py-2 border-b" style={{ borderColor: C.g100 }}>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-black" style={{ color: C.danger }}>
            ₿ {sym}{fmt(effectiveRate)} {cur}
          </span>
          <span className="text-xs font-black px-1.5 py-0.5 rounded-sm"
            style={{ color: margin < 0 ? C.danger : C.success, backgroundColor: margin < 0 ? `${C.danger}15` : `${C.success}15` }}>
            {margin > 0 ? '+' : ''}{margin}%
          </span>
        </div>
        <div className="flex items-center justify-between text-xs" style={{ color: C.g400 }}>
          {isGC ? (
            <span>
              {gcBrand} · {gcCardValues.length ? gcCardValues.map(v => `$${v}`).join(', ') : '—'}
            </span>
          ) : (
            <span>{minLimit && maxLimit
              ? `${sym}${fmt(parseFloat(minLimit))} – ${sym}${fmt(parseFloat(maxLimit))} ${cur}`
              : 'Set limits in previous step'}</span>
          )}
          <span>⏱ {timeLimit}min</span>
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="w-full py-1.5 rounded-lg text-white text-xs font-black text-center"
          style={{ backgroundColor: offerType === 'sell' ? C.green : offerType === 'buy' ? C.paid : C.purple }}>
          {offerType === 'sell' ? 'Buy BTC →' : offerType === 'buy' ? 'Sell BTC →' : offerType === 'gc_buy' ? 'Sell Gift Card →' : 'Buy Gift Card →'}
        </div>
      </div>
    </div>
  );

  // ── Offer type config ─────────────────────────────────────────────────────
  const OFFER_TYPES = [
    {
      id: 'sell',
      title: 'Sell Bitcoin',
      subtitle: 'I have BTC, I want local currency',
      icon: Bitcoin,
      color: C.green,
      badge: '🟢 Listed on Buy Bitcoin page',
      badgeColor: C.success,
      desc: 'You own Bitcoin and want to sell it. Buyers pay you in local cash via MTN, bank, PayPal, etc.',
    },
    {
      id: 'buy',
      title: 'Buy Bitcoin',
      subtitle: 'I have cash, I want BTC',
      icon: ShoppingCart,
      color: C.paid,
      badge: '🔵 Listed on Sell Bitcoin page',
      badgeColor: C.paid,
      desc: 'Post your buy offer. Bitcoin sellers come to you and you pay them in local currency.',
    },
    {
      id: 'gc_buy',
      title: 'Buy Gift Card',
      subtitle: 'I have BTC, I want a gift card',
      icon: Gift,
      color: C.purple,
      badge: '💜 Listed on Gift Cards page',
      badgeColor: C.purple,
      desc: 'Spend your Bitcoin on gift cards. Users with unused gift cards come to trade with you — you pay in BTC.',
    },
  ];

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen py-4 px-3" style={{ backgroundColor: C.mist, fontFamily: "'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }}>      <style>{`
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        * { -webkit-tap-highlight-color: transparent; }
        input, select, textarea { font-size: 16px !important; }
      `}</style>

      <div className="max-w-2xl mx-auto" style={{ width:'100%', boxSizing:'border-box' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-base flex-shrink-0"
              style={{ background: `linear-gradient(135deg,${C.forest},${C.mint})`, color: C.white }}>P</div>
            <div className="min-w-0">
              <h1 className="text-lg font-black leading-none" style={{ color: C.forest, fontFamily:"'Syne',sans-serif" }}>
                Create an Offer
              </h1>
              <p className="text-xs mt-0.5" style={{ color: C.g500 }}>
                Live BTC:{' '}
                <span className="font-black" style={{ color: C.forest }}>
                  {loadingPrice ? '…' : `$${fmt(btcPrice, 0)} USD`}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* ── Step progress bar ────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-4">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const done   = step > s.id;
            const active = step === s.id;
            return (
              <React.Fragment key={s.id}>
                <div className="flex flex-col items-center flex-shrink-0 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
                    style={{
                      backgroundColor: done ? C.success : active ? C.green : C.g100,
                      color: (done || active) ? C.white : C.g400,
                    }}>
                    {done ? <Check size={15} /> : <Icon size={15} />}
                  </div>
                  <p className="mt-0.5 font-black text-center"
                    style={{ color: active ? C.green : done ? C.success : C.g400, fontSize: '9px' }}>
                    {s.label}
                  </p>
                </div>
                {i < steps.length - 1 && (
                  <div className="flex-1 h-0.5 rounded-full"
                    style={{ backgroundColor: step > s.id ? C.success : C.g200 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Card ─────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 mb-4" style={{ borderColor: C.g200, width:'100%', boxSizing:'border-box' }}>

          {/* ━━ STEP 1: Offer Type ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black mb-0.5" style={{ color: C.forest }}>What would you like to do?</h2>
                <p className="text-xs" style={{ color: C.g500 }}>Your offer will appear in the matching marketplace.</p>
              </div>

              {/* BTC section */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: C.g400 }}>
                  <Bitcoin size={10} /> Bitcoin Offers
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {OFFER_TYPES.filter(t => !t.id.startsWith('gc')).map(ot => {
                    const Icon = ot.icon;
                    const active = offerType === ot.id;
                    return (
                      <button key={ot.id} onClick={() => setOfferType(ot.id)}
                        className="relative p-4 rounded-2xl text-left border-2 transition-all duration-200 hover:shadow-sm"
                        style={{
                          borderColor: active ? ot.color : C.g200,
                          backgroundColor: active ? `${ot.color}08` : C.white,
                        }}>
                        {active && (
                          <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: ot.color }}>
                            <Check size={11} className="text-white" />
                          </div>
                        )}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5"
                          style={{ backgroundColor: active ? ot.color : C.g100 }}>
                          <Icon size={18} style={{ color: active ? C.white : C.g400 }} />
                        </div>
                        <p className="font-black text-sm mb-0.5" style={{ color: C.forest }}>{ot.title}</p>
                        <p className="text-xs mb-2 leading-relaxed" style={{ color: C.g500 }}>{ot.desc}</p>
                        <div className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${ot.badgeColor}15`, color: ot.badgeColor }}>
                          {ot.badge}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gift Card section — single option, full-width card */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: C.g400 }}>
                  <Gift size={10} /> Gift Card Offers
                </p>
                {(() => {
                  const ot = OFFER_TYPES.find(t => t.id === 'gc_buy');
                  if (!ot) return null;
                  const Icon = ot.icon;
                  const active = offerType === ot.id;
                  return (
                    <button onClick={() => setOfferType(ot.id)}
                      className="relative w-full p-4 rounded-2xl text-left border-2 transition-all duration-200 hover:shadow-sm"
                      style={{
                        borderColor: active ? ot.color : C.g200,
                        backgroundColor: active ? `${ot.color}08` : C.white,
                      }}>
                      {active && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: ot.color }}>
                          <Check size={11} className="text-white" />
                        </div>
                      )}
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: active ? ot.color : C.g100 }}>
                          <Icon size={22} style={{ color: active ? C.white : C.g400 }} />
                        </div>
                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-base mb-0.5" style={{ color: C.forest }}>{ot.title}</p>
                          <p className="text-xs mb-2 leading-relaxed" style={{ color: C.g500 }}>{ot.desc}</p>
                          <div className="flex flex-wrap gap-2 items-center">
                            <div className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: `${ot.badgeColor}15`, color: ot.badgeColor }}>
                              {ot.badge}
                            </div>
                            <span className="text-xs" style={{ color: C.g400 }}>
                              Supported: Amazon · Apple · Steam · Google Play · Visa + more
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })()}
              </div>

              <div className="p-3.5 rounded-2xl flex items-start gap-2.5"
                style={{ backgroundColor: `${C.gold}12`, border: `1px solid ${C.gold}30` }}>
                <Shield size={13} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs leading-relaxed" style={{ color: C.g700 }}>
                  <strong>Escrow Protected:</strong> Bitcoin is automatically locked in escrow when a trade starts.
                  PRAQEN charges <strong>0.5% fee</strong> only on completed trades.
                </p>
              </div>

              {/* Wallet balance reminder — shown when user picks Sell Bitcoin */}
              {offerType === 'sell' && (
                <div className="p-3.5 rounded-2xl flex items-start gap-2.5"
                  style={{ backgroundColor: walletBal.btc * btcPrice >= 10 ? '#F0FDF4' : '#FFFBEB',
                           border: `1px solid ${walletBal.btc * btcPrice >= 10 ? '#86EFAC' : '#FCD34D'}` }}>
                  <Wallet size={13} style={{ color: walletBal.btc * btcPrice >= 10 ? '#16A34A' : '#D97706', flexShrink: 0, marginTop: 1 }} />
                  <div className="flex-1 min-w-0">
                    {walletBal.btc * btcPrice >= 10 ? (
                      <p className="text-xs leading-relaxed" style={{ color: '#15803D' }}>
                        ✅ <strong>Wallet ready:</strong> Your balance is <strong>${(walletBal.btc * btcPrice).toFixed(2)}</strong>.
                        Your offer will be visible in the Buy Bitcoin market.
                      </p>
                    ) : (
                      <p className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
                        ⚠️ <strong>Top up required:</strong> Your wallet has <strong>${(walletBal.btc * btcPrice).toFixed(2)}</strong>.
                        You need at least <strong>$10 in BTC</strong> for your offer to appear in the Buy Bitcoin market.{' '}
                        <button
                          type="button"
                          onClick={() => navigate('/wallet')}
                          style={{ color: '#D97706', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>
                          Top up your wallet →
                        </button>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ━━ STEP 2 (GC): Gift Card Brand + Face Value ━━━━━━━━━━━━━━━━━━━ */}
          {step === 2 && isGC && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black mb-0.5" style={{ color: C.forest }}>
                  {offerType === 'gc_buy' ? 'Which gift card do you want?' : 'Which gift card do you have?'}
                </h2>
                <p className="text-xs" style={{ color: C.g500 }}>Select the brand and face value.</p>
              </div>

              {/* Brand search */}
              <div>
                <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                  Gift Card Brand <span style={{ color: C.danger }}>*</span>
                </label>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
                  <input type="text" placeholder="Search brand…" value={gcSearch}
                    onChange={e => setGcSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none"
                    style={{ borderColor: C.g200 }} />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {filteredBrands.map(b => {
                    const active = gcBrand === b.name;
                    return (
                      <button key={b.name} onClick={() => {
                          setGcBrand(b.name);
                          if (b.name === 'iTunes Denmark') {
                            setGcCurrencies([{ region:'iTunes Denmark', currency:'DKK', symbol:'kr', flag:'🇩🇰' }]);
                          }
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-xl border-2 text-left transition-all"
                        style={{
                          borderColor: active ? C.purple : C.g200,
                          backgroundColor: active ? `${C.purple}10` : C.white,
                          width:'100%', boxSizing:'border-box',
                        }}>
                        <span className="text-base flex-shrink-0">{b.icon}</span>
                        <span className="text-xs font-bold truncate flex-1 min-w-0" style={{ color: C.g800 }}>{b.name}</span>
                        {active && <Check size={11} style={{ color: C.purple, flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Card Type */}
              <div>
                <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                  Card Type <span style={{ color: C.danger }}>*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val:'physical', label:'Physical' },
                    { val:'ecode',    label:'E-Code' },
                    { val:'both',     label:'Both' },
                  ].map(({ val, label }) => (
                    <button key={val} onClick={() => setGcCardType(val)}
                      className="py-2.5 rounded-xl font-bold text-xs transition-all border-2"
                      style={{
                        borderColor: gcCardType === val ? C.purple : C.g200,
                        backgroundColor: gcCardType === val ? C.purple : C.white,
                        color: gcCardType === val ? C.white : C.g700,
                        width:'100%', boxSizing:'border-box',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Card Range (multi-select denominations) */}
              <div>
                <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                  Card Range (USD) <span style={{ color: C.danger }}>*</span>
                </label>
                <p className="text-xs mb-2" style={{ color: C.g500 }}>
                  Tap denominations you accept — select one or many.
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {GC_FACE_VALUES.map(v => {
                    const selected = gcCardValues.includes(v);
                    return (
                      <button key={v}
                        onClick={() => setGcCardValues(prev =>
                          selected ? prev.filter(x => x !== v) : [...prev, v].sort((a, b) => a - b)
                        )}
                        className="relative py-3 rounded-xl font-black text-sm transition-all border-2"
                        style={{
                          borderColor: selected ? C.purple : C.g200,
                          backgroundColor: selected ? C.purple : C.white,
                          color: selected ? C.white : C.g700,
                        }}>
                        ${v}
                        {selected && (
                          <span className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
                            <Check size={9} style={{ color: C.white }} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {gcCardValues.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl flex items-start gap-3"
                    style={{ backgroundColor: `${C.purple}08`, border: `1px solid ${C.purple}20` }}>
                    <div className="flex-1">
                      <p className="text-xs font-bold mb-1.5" style={{ color: C.g500 }}>Selected card range</p>
                      <div className="flex flex-wrap gap-1.5">
                        {gcCardValues.map(v => (
                          <span key={v} className="text-xs font-black px-2.5 py-1 rounded-full text-white"
                            style={{ backgroundColor: C.purple }}>${v}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs" style={{ color: C.g400 }}>BTC equiv.</p>
                      <p className="text-xs font-black" style={{ color: C.forest }}>
                        ₿{(gcMinVal / btcPrice).toFixed(6)}
                      </p>
                      <p className="text-xs" style={{ color: C.g400 }}>at min ${gcMinVal}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Card Currency Regions (optional, up to 10) ── */}
              <div>
                <label className="block text-sm font-bold mb-0.5" style={{ color: C.g700 }}>
                  Card Currency Regions
                  <span className="ml-1.5 text-xs font-normal" style={{ color: C.g400 }}>(optional · up to 10)</span>
                </label>
                <p className="text-xs mb-2" style={{ color: C.g500 }}>
                  Add the regions / currencies your card supports. Buyers will pick which region their card is from.
                </p>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
                  <input
                    type="text"
                    placeholder="Search region or currency…"
                    value={gcCurrSearch}
                    onChange={e => setGcCurrSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none"
                    style={{ borderColor: C.g200 }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {GC_CURRENCIES.filter(c =>
                    !gcCurrSearch || c.region.toLowerCase().includes(gcCurrSearch.toLowerCase()) || c.currency.toLowerCase().includes(gcCurrSearch.toLowerCase())
                  ).map(c => {
                    const sel = gcCurrencies.some(x => x.region === c.region);
                    return (
                      <button key={c.region}
                        onClick={() => {
                          if (sel) {
                            setGcCurrencies(prev => prev.filter(x => x.region !== c.region));
                          } else if (gcCurrencies.length < 10) {
                            setGcCurrencies(prev => [...prev, { region: c.region, currency: c.currency, symbol: c.symbol, flag: c.flag }]);
                          } else {
                            toast.warn('Maximum 10 currency regions allowed');
                          }
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-xl border-2 text-left transition-all"
                        style={{
                          borderColor: sel ? C.mint : C.g200,
                          backgroundColor: sel ? `${C.mint}12` : C.white,
                          boxSizing: 'border-box',
                        }}>
                        <span className="text-base flex-shrink-0">{c.flag}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate" style={{ color: C.g800 }}>{c.region}</p>
                          <p className="text-xs" style={{ color: C.g500 }}>{c.symbol} {c.currency}</p>
                        </div>
                        {sel && <Check size={11} style={{ color: C.mint, flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
                {gcCurrencies.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl" style={{ backgroundColor: `${C.mint}08`, border: `1px solid ${C.mint}25` }}>
                    <p className="text-xs font-bold mb-2" style={{ color: C.g600 }}>Selected regions ({gcCurrencies.length}/10)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {gcCurrencies.map(c => (
                        <button key={c.region}
                          onClick={() => setGcCurrencies(prev => prev.filter(x => x.region !== c.region))}
                          className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                          style={{ backgroundColor: C.mint, color: C.white }}>
                          {c.flag} {c.region}
                          <X size={9} className="ml-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ━━ STEP 2 (BTC) / STEP 3 (GC): Country + Payment ━━━━━━━━━━━━━━ */}
          {((step === 2 && !isGC) || (step === 3 && isGC)) && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black mb-0.5" style={{ color: C.forest }}>
                  {isGC ? 'Location & Gift Card' : 'Location & Payment'}
                </h2>
                <p className="text-xs" style={{ color: C.g500 }}>
                  {offerType === 'sell' ? 'Where should buyers pay you?' :
                   offerType === 'buy'  ? 'Where will you pay sellers?' :
                   isGC ? 'Where are you located? Gift card details from previous step.' :
                   'Where are you located?'}
                </p>
              </div>

              {/* Country selector */}
              <div>
                <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                  Your Country <span style={{ color: C.danger }}>*</span>
                </label>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
                  <input type="text" placeholder="Search country…"
                    value={countrySearch} onChange={e => setCountrySearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none"
                    style={{ borderColor: C.g200 }} />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {COUNTRIES.filter(c =>
                    c.name.toLowerCase().includes(countrySearch.toLowerCase())
                  ).map(c => (
                    <button key={c.code}
                      onClick={() => { setCountry(c.code); setCountrySearch(''); }}
                      className="flex items-center gap-2 p-2 rounded-xl border-2 text-left transition-all"
                      style={{
                        borderColor: country === c.code ? C.green : C.g200,
                        backgroundColor: country === c.code ? `${C.green}10` : C.white,
                        width:'100%', boxSizing:'border-box',
                      }}>
                      <span className="text-base flex-shrink-0">{c.flag}</span>
                      <span className="text-xs font-bold truncate flex-1 min-w-0" style={{ color: C.g800 }}>{c.name}</span>
                      {country === c.code && <Check size={11} style={{ color: C.green, flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Currency selector — separate from country */}
              <div>
                <label className="block text-sm font-bold mb-0.5" style={{ color: C.g700 }}>
                  Currency
                </label>
                <p className="text-xs mb-2" style={{ color: C.g500 }}>
                  Auto-set from country — change independently if needed.
                </p>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
                  <input type="text" placeholder="Search currency…"
                    value={currencySearch} onChange={e => setCurrencySearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none"
                    style={{ borderColor: C.g200 }} />
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                  {CURRENCIES_LIST.filter(c =>
                    c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
                    c.symbol.toLowerCase().includes(currencySearch.toLowerCase())
                  ).map(c => (
                    <button key={c.code}
                      onClick={() => { setCurrencyCode(c.code); setCurrencySymbol(c.symbol); setCurrencySearch(''); }}
                      className="flex items-center gap-2 p-2.5 rounded-xl border-2 text-left transition-all hover:shadow-sm"
                      style={{
                        borderColor: currencyCode === c.code ? C.green : C.g200,
                        backgroundColor: currencyCode === c.code ? `${C.green}10` : C.white,
                      }}>
                      <span className="text-sm font-black flex-shrink-0" style={{ color: C.forest }}>{c.symbol}</span>
                      <span className="text-xs font-bold truncate flex-1" style={{ color: C.g800 }}>{c.code}</span>
                      {currencyCode === c.code && <Check size={11} style={{ color: C.green, flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment section — GC shows brand card, BTC shows payment dropdown */}
              {curr && (
                isGC ? (
                  <div>
                    <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                      Gift Card as Payment
                    </label>
                    <p className="text-xs mb-3" style={{ color: C.g500 }}>
                      Sellers will bring you this gift card in exchange for your Bitcoin.
                    </p>
                    <div className="p-4 rounded-2xl border-2 flex items-center gap-4"
                      style={{ borderColor: C.purple, backgroundColor: `${C.purple}06` }}>
                      <span className="text-4xl flex-shrink-0">
                        {GC_BRANDS.find(b => b.name === gcBrand)?.icon || '🎁'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-base" style={{ color: C.forest }}>{gcBrand}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.g500 }}>
                          {gcCardType === 'physical' ? 'Physical Card' : gcCardType === 'ecode' ? 'E-Code' : 'Physical Card & E-Code'}
                        </p>
                        {gcCardValues.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {gcCardValues.map(v => (
                              <span key={v} className="text-xs font-black px-2 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: C.purple }}>${v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `${C.purple}15`, color: C.purple }}>
                        Payment
                      </span>
                    </div>
                    <p className="text-xs mt-2" style={{ color: C.g400 }}>
                      To change brand or denominations, go back to the previous step.
                    </p>
                  </div>
                ) : (
                  <div ref={payRef} className="relative">
                    <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                      Payment Method <span style={{ color: C.danger }}>*</span>
                    </label>
                    <p className="text-xs mb-2" style={{ color: C.g500 }}>
                      How {offerType === 'sell' ? 'buyers pay you' : 'you pay sellers'}
                    </p>

                    <button onClick={() => setShowPayMenu(!showPayMenu)}
                      className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 text-left transition"
                      style={{
                        borderColor: payMethod ? C.green : C.g200,
                        backgroundColor: payMethod ? `${C.green}05` : C.white,
                        minHeight: 60,
                      }}>
                      {selectedPay ? (
                        <>
                          <span className="text-2xl flex-shrink-0">{selectedPay.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-bold" style={{ color: C.g800 }}>{selectedPay.name}</p>
                            <p className="text-xs mt-0.5" style={{ color: CAT_COLORS[selectedPay.cat] || C.g400 }}>
                              {selectedPay.cat}
                            </p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); setPayMethod(''); }}
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: C.g100 }}>
                            <X size={13} style={{ color: C.g400 }} />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: C.g100 }}>
                            <DollarSign size={18} style={{ color: C.g400 }} />
                          </div>
                          <span className="flex-1 text-sm font-semibold" style={{ color: C.g400 }}>Tap to select payment method…</span>
                          <ChevronDown size={18} style={{ color: C.g400 }} />
                        </>
                      )}
                    </button>
                    {showPayMenu && <PayDropdown />}

                    {/* Category legend */}
                    <div className="flex flex-wrap gap-1.5 mt-2" style={{ rowGap: 6 }}>
                      {Object.entries(CAT_COLORS).map(([cat, color]) => (
                        <span key={cat} className="font-bold px-2 py-1 rounded-full"
                          style={{ backgroundColor: `${color}15`, color, fontSize: '10px' }}>
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* ━━ STEP 3 (BTC) / STEP 4 (GC): Pricing / Rate ━━━━━━━━━━━━━━━━━ */}
          {((step === 3 && !isGC) || (step === 4 && isGC)) && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black mb-0.5" style={{ color: C.forest }}>
                  {isGC ? 'Set BTC Rate' : 'Set Your Bitcoin Rate'}
                </h2>
                <p className="text-xs" style={{ color: C.g500 }}>
                  Control your price. Higher margin = more profit per trade.
                </p>
              </div>

              {/* Live price banner */}
              <div className="p-4 rounded-2xl text-white"
                style={{ background: `linear-gradient(135deg,${C.forest},${C.green})`, width:'100%', boxSizing:'border-box' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <p className="text-xs text-white/60 mb-0.5">Live Market Price</p>
                    <p className="text-xl font-black" style={{ wordBreak:'break-all' }}>
                      {loadingPrice ? '…' : `${sym}${fmt(btcLocal, 0)}`}
                    </p>
                    <p className="text-xs text-white/50 mt-0.5">{cur}/BTC · auto-refresh</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-white/60 mb-0.5">USD</p>
                    <p className="text-base font-black">${fmt(btcPrice, 0)}</p>
                    <button onClick={() => setLoadingPrice(true)}
                      className="mt-1 text-xs text-white/40 flex items-center gap-1 ml-auto hover:text-white/70">
                      <RefreshCw size={9} /> Refresh
                    </button>
                  </div>
                </div>
              </div>

              {/* Rate type */}
              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: C.g700 }}>Rate Type</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { val:'market', icon:TrendingUp, title:'Market Rate', desc:'Auto-adjusts with BTC price. Always competitive.' },
                    { val:'fixed',  icon:Tag,        title:'Fixed Rate',  desc:'You lock a price. Stays constant even if BTC moves.' },
                  ].map(({ val, icon: Icon, title, desc }) => (
                    <button key={val} onClick={() => setPricingType(val)}
                      className="p-3 rounded-xl text-left border-2 transition-all"
                      style={{
                        borderColor: pricingType === val ? C.green : C.g200,
                        backgroundColor: pricingType === val ? `${C.green}08` : C.white,
                        width:'100%', boxSizing:'border-box',
                      }}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: pricingType === val ? C.green : C.g100 }}>
                          <Icon size={13} style={{ color: pricingType === val ? C.white : C.g400 }} />
                        </div>
                        <p className="font-black text-sm" style={{ color: C.forest }}>{title}</p>
                        {pricingType === val && <Check size={12} style={{ color: C.green, marginLeft:'auto', flexShrink:0 }} />}
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: C.g500 }}>{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Market margin — -10 to 100% */}
              {pricingType === 'market' && (
                <div>
                  <div className="mb-2">
                    <label className="text-sm font-bold block mb-1.5" style={{ color: C.g700 }}>Your Margin</label>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs flex-shrink-0" style={{ color: C.g500 }}>Quick:</span>
                      {[-5,-1,0,1,3,5,10,20].map(v => (
                        <button key={v} onClick={() => setMargin(v)}
                          className="px-1.5 py-0.5 rounded-full text-xs font-bold transition"
                          style={{
                            backgroundColor: margin === v ? (v < 0 ? C.danger : v === 0 ? C.g500 : C.green) : C.g100,
                            color: margin === v ? C.white : C.g600,
                          }}>{v > 0 ? '+' : ''}{v}%</button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border-2" style={{ borderColor: C.g200 }}>
                    {/* Big margin display + stepper */}
                    <div className="flex items-center gap-3 mb-4">
                      <button onClick={() => setMargin(m => Math.max(-10, parseFloat((m - 0.5).toFixed(1))))}
                        className="w-11 h-11 rounded-xl flex items-center justify-center border-2 active:scale-95 flex-shrink-0"
                        style={{ borderColor: C.danger, backgroundColor: `${C.danger}10` }}>
                        <Minus size={16} style={{ color: C.danger }} />
                      </button>
                      <div className="flex-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-4xl font-black"
                            style={{ color: margin < 0 ? C.danger : margin === 0 ? C.g500 : C.success }}>
                            {margin > 0 ? '+' : ''}{margin}%
                          </span>
                          {margin < 0
                            ? <ArrowDownRight size={22} style={{ color: C.danger }} />
                            : <ArrowUpRight size={22} style={{ color: margin === 0 ? C.g500 : C.success }} />}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: C.g400 }}>
                          {margin < 0 ? 'Discount below market — buyers get more BTC' : margin === 0 ? 'Exactly at market rate' : 'Your markup rate above market'}
                        </p>
                      </div>
                      <button onClick={() => setMargin(m => Math.min(100, parseFloat((m + 0.5).toFixed(1))))}
                        className="w-11 h-11 rounded-xl flex items-center justify-center border-2 active:scale-95 flex-shrink-0"
                        style={{ borderColor: C.success, backgroundColor: `${C.success}10` }}>
                        <Plus size={16} style={{ color: C.success }} />
                      </button>
                    </div>

                    {/* Slider -10 to 100 */}
                    <input type="range" min="-10" max="100" step="0.5"
                      value={margin} onChange={e => setMargin(parseFloat(e.target.value))}
                      className="w-full" style={{ accentColor: margin < 0 ? C.danger : C.success }} />
                    <div className="flex justify-between text-xs mt-0.5" style={{ color: C.g400 }}>
                      <span>-10%</span>
                      <span>0% (market)</span>
                      <span>+100%</span>
                    </div>

                    {/* Type exact margin */}
                    <div className="mt-3 flex items-center gap-2">
                      <label className="text-xs font-bold flex-shrink-0" style={{ color: C.g500 }}>Custom:</label>
                      <div className="relative flex-1">
                        <input type="number" min="-10" max="100" step="0.5"
                          value={margin} onChange={e => setMargin(Math.min(100, Math.max(-10, parseFloat(e.target.value) || 0)))}
                          className="w-full pl-3 pr-7 py-2 text-xs border-2 rounded-xl focus:outline-none font-black"
                          style={{ borderColor: C.g200, color: C.forest }} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black" style={{ color: C.g400 }}>%</span>
                      </div>
                    </div>

                    {/* ── Trade Breakdown — crystal clear profit explanation ── */}
                    {curr && (() => {
                      // How margin works:
                      // Your offer rate = market × (1 + margin/100)
                      // Buyer pays $100 cash → receives BTC worth $100 ÷ (1 + margin/100) at market
                      // Your profit = $100 − buyer's BTC value
                      const exampleCash    = 100;                                             // $100 example trade
                      const buyerGetsUSD   = (exampleCash / (1 + margin / 100)) * 0.995;      // USD value of NET BTC buyer receives
                      const yourProfitUSD  = exampleCash - buyerGetsUSD;                 // your cash profit
                      const yourProfitPct  = (yourProfitUSD / exampleCash) * 100;        // real % of cash received
                      const buyerGetsLocal = buyerGetsUSD  * localRate;
                      const profitLocal    = yourProfitUSD * localRate;
                      return (
                        <div className="mt-3 rounded-xl overflow-hidden border-2"
                          style={{ borderColor: `${C.success}30`, width:'100%', boxSizing:'border-box' }}>
                          {/* Header */}
                          <div className="px-3 py-2 flex items-center justify-between flex-wrap gap-1"
                            style={{ backgroundColor: `${C.success}12` }}>
                            <p className="text-xs font-black" style={{ color: C.success }}>
                              💡 Per $100 trade
                            </p>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: C.success, color: C.white }}>
                              {margin > 0 ? '+' : ''}{margin}% margin
                            </span>
                          </div>
                          {/* Rows */}
                          <div className="px-3 py-2 space-y-2" style={{ backgroundColor: `${C.success}05` }}>
                            {[
                              {
                                n: '1',
                                label: offerType === 'sell' ? 'Buyer pays you' : 'You pay seller',
                                val: `$${fmt(exampleCash, 0)}`,
                                color: C.g800,
                              },
                              {
                                n: '2',
                                label: offerType === 'sell' ? 'Buyer gets BTC worth' : 'You get BTC worth',
                                val: `$${fmt(buyerGetsUSD, 2)}`,
                                color: C.paid,
                              },
                            ].map(({ n, label, val, color }) => (
                              <div key={n} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                                    style={{ backgroundColor: C.paid, color: C.white }}>{n}</span>
                                  <span className="text-xs truncate" style={{ color: C.g600 }}>{label}</span>
                                </div>
                                <span className="text-xs font-black flex-shrink-0" style={{ color }}>{val}</span>
                              </div>
                            ))}
                            <div className="flex items-start justify-between gap-2 pt-1.5 border-t"
                              style={{ borderColor: yourProfitUSD < 0 ? `${C.danger}25` : `${C.success}25` }}>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                                  style={{ backgroundColor: yourProfitUSD < 0 ? C.danger : C.success, color: C.white }}>
                                  {yourProfitUSD < 0 ? '↓' : '✓'}
                                </span>
                                <span className="text-xs font-bold" style={{ color: C.g700 }}>
                                  {yourProfitUSD < 0 ? 'Your loss' : 'Your profit'}
                                </span>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span className="text-sm font-black"
                                  style={{ color: yourProfitUSD < 0 ? C.danger : C.success }}>
                                  {yourProfitUSD < 0 ? '-' : '+'}${fmt(Math.abs(yourProfitUSD), 2)}
                                </span>
                                <p className="text-xs" style={{ color: C.g400 }}>
                                  {fmt(Math.abs(yourProfitPct), 1)}%
                                </p>
                              </div>
                            </div>
                          </div>
                          {/* Rate row */}
                          <div className="px-3 py-2 flex items-center justify-between gap-2 border-t"
                            style={{ borderColor: `${C.success}20`, backgroundColor: C.white }}>
                            <div className="min-w-0">
                              <p className="text-xs" style={{ color: C.g500 }}>Your rate</p>
                              <p className="text-xs font-black truncate" style={{ color: C.forest }}>
                                {sym}{fmt(effectiveRate, 0)} {cur}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs" style={{ color: C.g400 }}>Market</p>
                              <p className="text-xs font-semibold" style={{ color: C.g500 }}>
                                {sym}{fmt(btcLocal, 0)} {cur}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Fixed price */}
              {pricingType === 'fixed' && (
                <div>
                  <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                    Fixed Price ({cur} per BTC)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-sm" style={{ color: C.g500 }}>{sym}</span>
                    <input type="number" value={fixedPrice} onChange={e => setFixedPrice(e.target.value)}
                      placeholder={fmt(btcLocal, 0)}
                      className="w-full pl-10 pr-24 py-3.5 border-2 rounded-xl text-sm font-black focus:outline-none"
                      style={{ borderColor: fixedPrice ? C.green : C.g200, color: C.forest }} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: C.g400 }}>
                      {cur}/BTC
                    </span>
                  </div>
                  {fixedPrice && btcLocal > 0 && (
                    <p className="text-xs mt-1.5 font-semibold"
                      style={{ color: parseFloat(fixedPrice) >= btcLocal ? C.success : C.danger }}>
                      {parseFloat(fixedPrice) >= btcLocal
                        ? `✅ +${((parseFloat(fixedPrice) / btcLocal - 1) * 100).toFixed(1)}% above market`
                        : `⚠️ −${((1 - parseFloat(fixedPrice) / btcLocal) * 100).toFixed(1)}% below market`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ━━ STEP 4 (BTC): Limits + Time ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 4 && !isGC && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black mb-0.5" style={{ color: C.forest }}>Trade Limits & Timer</h2>
                <p className="text-xs" style={{ color: C.g500 }}>
                  Set min/max trade sizes in {cur} ({curr?.flag} {curr?.name}) and the payment window.
                </p>
              </div>

              {/* Wallet balance banner */}
              {isSellSide ? (
                <div className="rounded-xl border overflow-hidden"
                  style={{ backgroundColor: walletCapacityLocal > 0 ? '#F0FDF4' : '#FFFBEB',
                           borderColor: walletCapacityLocal > 0 ? '#A7F3D0' : '#FDE68A' }}>
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">💼</span>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide"
                          style={{ color: walletCapacityLocal > 0 ? C.forest : '#92400E' }}>
                          BTC Wallet
                        </p>
                        <p className="text-xs font-black"
                          style={{ color: walletCapacityLocal > 0 ? C.forest : '#B45309' }}>
                          ₿{walletBal.btc.toFixed(6)} ≈ ${fmt(walletBal.btc * btcPrice, 0)} USD
                        </p>
                        {cur !== 'USD' && walletCapacityLocal > 0 && (
                          <p className="text-xs font-semibold" style={{ color: C.g500 }}>
                            Max offer: {sym}{fmt(walletCapacityLocal, 0)} {cur}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs font-black text-right flex-shrink-0 ml-2" style={{ color: C.g500 }}>
                      Max you<br/>can offer
                    </p>
                  </div>
                  {walletCapacityLocal === 0 && (
                    <div className="px-3 pb-2">
                      <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
                        💡 No balance yet — you can still create this offer. BTC is only locked when a buyer opens a trade.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border p-3 flex items-start gap-2.5"
                  style={{ backgroundColor: '#F0FDF4', borderColor: '#A7F3D0' }}>
                  <span className="text-sm flex-shrink-0">💡</span>
                  <p className="text-xs font-semibold" style={{ color: C.forest }}>
                    No wallet balance needed. You're setting how much BTC you want to buy — sellers will fill your order. Set any limits you like.
                  </p>
                </div>
              )}

              {/* Min / Max in local currency */}
              <div className="p-3 rounded-2xl border-2 space-y-3" style={{ borderColor: C.g200, width:'100%', boxSizing:'border-box' }}>
                <h3 className="font-black text-sm flex items-center gap-2" style={{ color: C.forest }}>
                  <BarChart2 size={14} style={{ color: C.green }} /> Limits in {sym} {cur}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key:'min', label:'Minimum', val:minLimit, set:setMinLimit, ph:`Min ${sym}${Math.ceil(10*localRate)}` },
                    { key:'max', label:'Maximum', val:maxLimit, set:setMaxLimit, ph:`Max ${sym}${isSellSide && walletCapacityLocal > 0 ? fmt(Math.floor(walletCapacityLocal), 0) : '5000'}` },
                  ].map(({ key, label, val, set, ph }) => {
                    const isMin = key === 'min';
                    const isMax = key === 'max';
                    const belowMin = isMin && val && parseFloat(val) / localRate < 10;
                    const aboveCap = isMax && isSellSide && walletCapacityLocal > 0 && parseFloat(val) > walletCapacityLocal;
                    const hasError = belowMin || aboveCap;
                    return (
                    <div key={key}>
                      <label className="block text-xs font-bold mb-1.5" style={{ color: C.g600 }}>
                        {label} per Trade <span style={{ color: C.danger }}>*</span>
                        {isMax && isSellSide && walletCapacityLocal > 0 && (
                          <span className="ml-1 font-semibold" style={{ color: C.g400 }}>
                            (cap: {sym}{fmt(Math.floor(walletCapacityLocal), 0)})
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black"
                          style={{ color: C.g500 }}>{sym}</span>
                        <input type="number" value={val}
                          onChange={e => set(e.target.value)}
                          onBlur={() => {
                            if (isMax && isSellSide && walletCapacityLocal > 0 && parseFloat(val) > walletCapacityLocal) {
                              set(String(Math.floor(walletCapacityLocal)));
                            }
                            if (isMin && parseFloat(val) < Math.ceil(10 * localRate)) {
                              set(String(Math.ceil(10 * localRate)));
                            }
                          }}
                          placeholder={ph}
                          min={isMin ? Math.ceil(10 * localRate) : 1}
                          max={isMax && isSellSide && walletCapacityLocal > 0 ? Math.floor(walletCapacityLocal) : undefined}
                          className="w-full pl-8 pr-3 py-3 border-2 rounded-xl text-sm font-bold focus:outline-none"
                          style={{ borderColor: hasError ? C.danger : val ? C.green : C.g200, color: C.forest }} />
                      </div>
                      {val && effectiveRate > 0 && (
                        <p className="text-xs mt-0.5 font-semibold" style={{ color: hasError ? C.danger : C.g400 }}>
                          ≈ ₿{(parseFloat(val) / effectiveRate).toFixed(6)}
                          <span className="ml-1">(${fmt(parseFloat(val) / localRate, 0)} USD)</span>
                        </p>
                      )}
                    </div>
                    );
                  })}
                </div>

                {minLimit && minUSDVal < 10 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ backgroundColor: `${C.danger}10` }}>
                    <AlertTriangle size={13} style={{ color: C.danger }} />
                    <p className="text-xs font-semibold" style={{ color: C.danger }}>
                      Minimum must be at least $10 USD — that's {sym}{fmt(10 * localRate, 0)} {cur} in your currency.
                    </p>
                  </div>
                )}
                {offerType === 'sell' && maxLimit && walletCapacityLocal > 0 && parseFloat(maxLimit) > walletCapacityLocal && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ backgroundColor: `${C.danger}10` }}>
                    <AlertTriangle size={13} style={{ color: C.danger }} />
                    <p className="text-xs font-semibold" style={{ color: C.danger }}>
                      Maximum ({sym}{fmt(parseFloat(maxLimit), 0)}) exceeds your wallet balance of {sym}{fmt(walletCapacityLocal, 0)} {cur}.
                      Your maximum has been auto-corrected on blur.
                    </p>
                  </div>
                )}
                {minLimit && maxLimit && parseFloat(maxLimit) < parseFloat(minLimit) && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ backgroundColor: `${C.danger}10` }}>
                    <AlertTriangle size={13} style={{ color: C.danger }} />
                    <p className="text-xs font-semibold" style={{ color: C.danger }}>Maximum must be higher than minimum</p>
                  </div>
                )}
                {maxExceedsWallet && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>💡</span>
                    <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
                      Your limit exceeds your current wallet balance — that's OK! You can create the offer now and your BTC will be locked only when a buyer opens a trade.
                    </p>
                  </div>
                )}

                {minLimit && maxLimit && curr && parseFloat(maxLimit) >= parseFloat(minLimit) && (
                  <div className="p-3 rounded-xl space-y-1.5" style={{ backgroundColor: C.mist, width:'100%', boxSizing:'border-box' }}>
                    <p className="text-xs font-black mb-1" style={{ color: C.forest }}>📣 Offer card preview:</p>
                    {[
                      { label:'Range', val:`${sym}${fmt(parseFloat(minLimit))} – ${sym}${fmt(parseFloat(maxLimit))} ${cur}` },
                      { label:'USD', val:`$${fmt(parseFloat(minLimit)/localRate,0)} – $${fmt(parseFloat(maxLimit)/localRate,0)}` },
                      { label:'Rate', val:`${sym}${fmt(effectiveRate,0)} ${cur}/BTC` },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                        <span className="text-xs" style={{ color: C.g500, flexShrink:0 }}>{label}</span>
                        <span className="text-xs font-bold" style={{ color: C.g800, textAlign:'right', wordBreak:'break-all' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Time limit */}
              <div className="p-3 rounded-2xl border-2 space-y-3" style={{ borderColor: C.g200, width:'100%', boxSizing:'border-box' }}>
                <h3 className="font-black text-sm flex items-center gap-2" style={{ color: C.forest }}>
                  <Clock size={14} style={{ color: C.green }} /> Payment Window
                </h3>
                <p className="text-xs" style={{ color: C.g500 }}>
                  How long your trade partner has to send payment before the trade auto-cancels.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_LIMITS.map(t => (
                    <button key={t} onClick={() => setTimeLimit(t)}
                      className="py-2.5 rounded-xl font-black text-sm transition border-2"
                      style={{
                        borderColor: timeLimit === t ? C.green : C.g200,
                        backgroundColor: timeLimit === t ? C.green : C.white,
                        color: timeLimit === t ? C.white : C.g600,
                      }}>
                      {t}<span className="text-xs font-bold ml-0.5">m</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: `${C.success}10` }}>
                  <Clock size={13} style={{ color: C.success }} />
                  <p className="text-xs" style={{ color: C.g700 }}>
                    Trade partner has <strong>{timeLimit} minutes</strong> to pay after opening the trade.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ━━ STEP 5: Instructions + Review ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-black mb-0.5" style={{ color: C.forest }}>Instructions & Review</h2>
                <p className="text-xs" style={{ color: C.g500 }}>Add trade instructions then publish your offer.</p>
              </div>

              <div>
                <label className="block text-sm font-bold mb-0.5" style={{ color: C.g700 }}>
                  Trade Instructions <span className="text-xs font-normal" style={{ color: C.g400 }}>(recommended)</span>
                </label>
                <p className="text-xs mb-2" style={{ color: C.g500 }}>
                  {offerType === 'sell' ? 'Tell buyers exactly how to pay you — MoMo number, bank details, etc.' :
                   offerType === 'buy'  ? 'Tell sellers how you will send payment and what info you need.' :
                   offerType === 'gc_buy' ? 'Tell gift card sellers how to send you the code and redemption steps.' :
                   'Tell BTC buyers how to pay you and what info you need to send the gift card code.'}
                </p>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3}
                  placeholder={
                    offerType === 'sell'
                      ? 'e.g. Send MTN MoMo to: 024-XXX-XXXX (Your Name). Include your username as reference. Send screenshot.'
                      : offerType === 'buy'
                      ? 'e.g. I will pay via MTN MoMo within 10 minutes. Share your number when trade starts.'
                      : 'e.g. Send gift card code and PIN photo. Code must be unused and unredeemed.'
                  }
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none resize-none"
                  style={{ borderColor: instructions ? C.green : C.g200 }} />
              </div>

              <div>
                <label className="block text-sm font-bold mb-0.5" style={{ color: C.g700 }}>
                  Offer Terms <span className="text-xs font-normal" style={{ color: C.g400 }}>(optional)</span>
                </label>
                <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2}
                  placeholder="e.g. Verified traders only. No partial payments. Must confirm trade details before starting."
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none resize-none"
                  style={{ borderColor: terms ? C.green : C.g200 }} />
              </div>

              {/* Full review + market card preview */}
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: C.g200, width:'100%', boxSizing:'border-box' }}>
                <div className="px-4 py-3 flex items-center gap-2"
                  style={{ background: `linear-gradient(135deg,${C.forest},${C.mint})` }}>
                  <Eye size={14} className="text-white" />
                  <p className="text-sm font-black text-white">Offer Preview</p>
                </div>

                <div className="p-3 bg-white space-y-4">
                  {/* Details list */}
                  <div className="space-y-1">
                    {[
                      { label:'Type',    val: OFFER_TYPES.find(o => o.id === offerType)?.title },
                      ...(isGC ? [
                        { label:'Brand',      val: gcBrand },
                        { label:'Card Type',  val: gcCardType === 'physical' ? 'Physical' : gcCardType === 'ecode' ? 'E-Code' : 'Physical & E-Code' },
                        { label:'Range',      val: gcCardValues.length ? gcCardValues.map(v => `$${v}`).join(', ') : '—' },
                      ] : []),
                      { label:'Country',  val: curr ? `${curr.flag} ${curr.name}` : '—' },
                      { label:'Currency', val: curr ? `${curr.symbol} ${curr.currency}` : '—' },
                      { label:'Payment',  val: selectedPay?.name || '—' },
                      { label:'Rate',     val: curr ? `${sym}${fmt(effectiveRate, 0)} ${cur}/BTC` : '—' },
                      { label:'Margin',   val: pricingType === 'market' ? `${margin > 0 ? '+' : ''}${margin}%` : 'Fixed' },
                      ...(!isGC ? [
                        { label:'Limits', val: minLimit && maxLimit && curr
                          ? `${sym}${fmt(parseFloat(minLimit))} – ${sym}${fmt(parseFloat(maxLimit))} ${cur}`
                          : '—' },
                      ] : []),
                      { label:'Window',  val: `${timeLimit} min` },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
                        paddingTop:4, paddingBottom:4, borderBottom:`1px solid ${C.g100}` }}>
                        <span className="text-xs flex-shrink-0" style={{ color: C.g500 }}>{label}</span>
                        <span className="text-xs font-bold" style={{ color: C.g800, textAlign:'right', wordBreak:'break-all' }}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Market card preview — full width on mobile */}
                  <div>
                    <p className="text-xs font-black uppercase mb-2" style={{ color: C.g400 }}>Market Card Preview</p>
                    <div style={{ maxWidth:'100%', overflowX:'hidden' }}>
                      <MarketCardPreview />
                    </div>
                  </div>
                </div>
              </div>

              {/* Publish warning */}
              <div className="p-3.5 rounded-2xl flex items-start gap-2.5"
                style={{ backgroundColor: `${C.gold}12`, border: `1px solid ${C.gold}30` }}>
                <Info size={13} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs leading-relaxed" style={{ color: C.g700 }}>
                  Your offer goes live immediately after publishing. You can edit or pause it anytime from your dashboard.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Navigation ──────────────────────────────────────────────────── */}
        <div style={{ display:'flex', gap:10, width:'100%', boxSizing:'border-box' }}>
          {dupOfferWarning && (
            <div style={{
              width:'100%', marginBottom:10, padding:'12px 14px',
              borderRadius:12, backgroundColor:'#FFF7ED',
              border:'1.5px solid #FDE68A', display:'flex', flexDirection:'column', gap:8,
            }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                <AlertTriangle size={15} style={{ color:'#D97706', flexShrink:0, marginTop:1 }} />
                <div>
                  <p style={{ fontWeight:800, fontSize:13, color:'#92400E', margin:0 }}>
                    {dupOfferWarning.status === 'PAUSED' ? 'You have a paused offer for this payment method' : 'You already have an active offer for this payment method'}
                  </p>
                  <p style={{ fontSize:12, color:'#B45309', margin:'4px 0 0' }}>
                    {dupOfferWarning.status === 'PAUSED'
                      ? 'Go to your Dashboard and activate your existing offer instead of creating a duplicate. One payment method per market is the rule.'
                      : 'Go to your Dashboard and edit your existing offer instead of creating a duplicate. One payment method per market is the rule.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  alignSelf:'flex-start', padding:'7px 14px', borderRadius:8,
                  backgroundColor:'#D97706', color:'#fff', fontWeight:800,
                  fontSize:12, border:'none', cursor:'pointer',
                }}>
                Go to Dashboard →
              </button>
            </div>
          )}
          {step > 1 && (
            <button onClick={back}
              style={{
                display:'flex', alignItems:'center', gap:6, padding:'14px 18px',
                borderRadius:14, fontWeight:700, fontSize:14, border:`2px solid ${C.g200}`,
                color:C.g600, background:C.white, cursor:'pointer', flexShrink:0, whiteSpace:'nowrap',
              }}>
              <ChevronLeft size={16} />Back
            </button>
          )}
          <button
            onClick={step < 5 ? next : handleSubmit}
            disabled={!canNext() || submitting}
            style={{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              padding:'14px 12px', borderRadius:14, fontWeight:900, fontSize:14,
              backgroundColor: canNext() ? C.green : C.g300, color:C.white,
              border:'none', cursor: canNext() ? 'pointer' : 'not-allowed', opacity: submitting ? 0.7 : 1,
              transition:'opacity 0.15s',
            }}>
            {submitting
              ? <><RefreshCw size={16} className="animate-spin" />Publishing…</>
              : step < 5
                ? <>Continue <ChevronRight size={16} /></>
                : <>🚀 Publish Offer</>}
          </button>
        </div>

        {/* Security note */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:12, paddingBottom:24 }}>
          <Shield size={12} style={{ color: C.g400, flexShrink:0 }} />
          <p style={{ fontSize:11, color: C.g400, textAlign:'center', margin:0 }}>
            All trades escrow-protected · 0.5% fee on completed trades only
          </p>
        </div>
      </div>
    </div>
  );
}
