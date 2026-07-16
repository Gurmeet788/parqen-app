import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useRates } from '../contexts/RatesContext';
import Notifications from './Notifications';
import {
  Wallet, User, Settings, LogOut, ChevronDown,
  BarChart3, Gift, List, Eye, EyeOff, ShoppingCart, Tag, TrendingUp,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', goldDark: '#D4891A', goldLight: '#FEF3C7',
  mist: '#F0FAF5', dark: '#0D1F14',
  g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g700: '#334155', g800: '#1E293B',
  purple: '#8B5CF6', purpleLight: '#EDE9FE',
};

const fmt    = (n, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n || 0);
const fmtBtc = (n)        => parseFloat(n || 0).toFixed(4);

export default function Navbar({ user, onLogout }) {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { rates: USD_RATES, btcUsd } = useRates();
  const [profileDrop,     setProfileDrop]     = useState(false);
  const [marketDrop,      setMarketDrop]      = useState(false);
  const [hdBalance,       setHdBalance]       = useState(() => parseFloat(localStorage.getItem('praqen_btc_balance') || 0));
  const [balanceUsd,      setBalanceUsd]      = useState(() => parseFloat(localStorage.getItem('praqen_usd_balance') || 0));
  const [lockedBtc,       setLockedBtc]       = useState(() => parseFloat(localStorage.getItem('praqen_locked_btc') || 0));
  const [usdtBalance,     setUsdtBalance]     = useState(() => parseFloat(localStorage.getItem('praqen_usdt_balance') || 0));
  const [localUser,       setLocalUser]       = useState(user);
  const [showBal,         setShowBal]         = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState(localStorage.getItem('praqen_currency') || 'USD');
  const dropRef   = useRef(null);
  const marketRef = useRef(null);

  useEffect(() => {
    const sync = () => {
      const s = JSON.parse(localStorage.getItem('user') || '{}');
      if (s?.id) setLocalUser(s);
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('userUpdated', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('userUpdated', sync); };
  }, []);

  useEffect(() => { if (user?.id) setLocalUser(user); }, [user?.id]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (res.data.preferred_currency) {
          setDisplayCurrency(res.data.preferred_currency);
          localStorage.setItem('praqen_currency', res.data.preferred_currency);
        }
      })
      .catch(() => {
        const saved = localStorage.getItem('praqen_currency');
        if (saved) setDisplayCurrency(saved);
      });
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    loadBalance();
    const iv = setInterval(loadBalance, 30000);
    return () => clearInterval(iv);
  }, [user]);

  const loadBalance = async () => {
    try {
      const tk = localStorage.getItem('token');
      if (!tk) return;
      const headers = { Authorization: `Bearer ${tk}` };

      // Fetch BTC + USDT in parallel
      const [btcRes, usdtRes] = await Promise.all([
        axios.get(`${API_URL}/hd-wallet/wallet`, { headers }),
        axios.get(`${API_URL}/wallet/usdt`, { headers }).catch(() => ({ data: {} })),
      ]);

      const avail      = parseFloat(btcRes.data?.available_btc ?? btcRes.data?.balance_btc ?? 0);
      const locked     = parseFloat(btcRes.data?.locked_btc || 0);
      const btcPrice   = parseFloat(btcRes.data?.btc_price || 0);
      // Total BTC value includes escrow-locked funds (money is still the user's)
      const totalBtcUsd = btcPrice > 0 ? (avail + locked) * btcPrice : parseFloat(btcRes.data?.balance_usd || 0);

      const usdtAvail  = parseFloat(usdtRes.data?.balance_usdt || 0);
      const usdtLocked = parseFloat(usdtRes.data?.locked_balance_usdt || 0);
      const totalUsdt  = usdtAvail + usdtLocked; // USDT is 1:1 with USD

      const combinedUsd = totalBtcUsd + totalUsdt;

      setHdBalance(avail);
      setLockedBtc(locked);
      setUsdtBalance(totalUsdt);
      setBalanceUsd(combinedUsd);

      localStorage.setItem('praqen_btc_balance',  avail.toString());
      localStorage.setItem('praqen_locked_btc',   locked.toString());
      localStorage.setItem('praqen_usdt_balance', totalUsdt.toString());
      localStorage.setItem('praqen_usd_balance',  combinedUsd.toString());
    } catch {}
  };

  useEffect(() => {
    const h = e => {
      if (dropRef.current   && !dropRef.current.contains(e.target))   setProfileDrop(false);
      if (marketRef.current && !marketRef.current.contains(e.target)) setMarketDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const displayUser = localUser?.id ? localUser : user;
  const totalBtc    = parseFloat(hdBalance || 0);
  const fxRate      = displayCurrency === 'USD' ? 1 : (USD_RATES?.[displayCurrency] || 1);
  // Combined USD = BTC (available + locked) * price + USDT (available + locked)
  // Fall back to live BTC price + cached USDT when API hasn't responded yet.
  const totalLocal  = balanceUsd > 0
    ? balanceUsd * fxRate
    : (totalBtc * (btcUsd || 88000) + (usdtBalance || 0)) * fxRate;
  const localCode   = displayCurrency;
  const CURRENCY_SYMBOLS = { USD:'$', GBP:'£', EUR:'€', GHS:'₵', NGN:'₦', KES:'KSh', ZAR:'R' };
  const sym         = CURRENCY_SYMBOLS[displayCurrency] || '';
  const handleLogout = () => { onLogout(); navigate('/login'); };

  const isActive       = (path) => location.pathname === path;
  const isMarketActive = ['/buy-bitcoin', '/sell-bitcoin', '/buy-usdt', '/sell-usdt'].some(p => location.pathname.startsWith(p));
  const isGiftActive   = location.pathname.startsWith('/gift-cards');

  // ── Desktop Nav Links ───────────────────────────────────────────────────────
  const DesktopNavLinks = () => (
    <div className="hidden md:flex items-center gap-3 flex-1 justify-center">

      {/* Dashboard */}
      <Link to="/dashboard"
        style={{
          color: isActive('/dashboard') ? '#fff' : C.forest,
          background: isActive('/dashboard') ? C.forest : 'transparent',
          borderRadius: '10px', padding: '9px 18px',
          fontSize: '14px', fontWeight: 800,
          textDecoration: 'none', whiteSpace: 'nowrap',
          border: isActive('/dashboard') ? `1px solid ${C.forest}` : `1px solid transparent`,
          transition: 'all 0.2s',
        }}>
        Dashboard
      </Link>

      {/* P2P Marketplace Dropdown */}
      <div className="relative" ref={marketRef}>
        <button
          onClick={() => setMarketDrop(!marketDrop)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            color: isMarketActive ? '#fff' : C.green,
            background: isMarketActive ? C.green : '#F0FAF5',
            borderRadius: '10px', padding: '9px 18px',
            fontSize: '14px', fontWeight: 800,
            border: `1px solid ${isMarketActive ? C.green : '#c8e6d4'}`,
            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
          }}>
          <TrendingUp size={14} />
          P2P Trade
          <span style={{
            fontSize: '9px', background: C.gold, color: '#fff',
            padding: '2px 5px', borderRadius: '20px', fontWeight: 900,
          }}>BETA</span>
          <ChevronDown size={13} style={{ transform: marketDrop ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {marketDrop && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0,
            width: '200px', background: '#fff', borderRadius: '14px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: `1px solid ${C.g100}`,
            overflow: 'hidden', zIndex: 50,
          }}>
            <Link to="/buy-bitcoin" onClick={() => setMarketDrop(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', textDecoration: 'none', borderBottom: `1px solid ${C.g100}`, background: isActive('/buy-bitcoin') ? C.mist : '#fff', transition: 'background 0.15s' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShoppingCart size={16} color="#16A34A" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.g800 }}>Buy Bitcoin</p>
                <p style={{ margin: 0, fontSize: 10, color: C.g400 }}>Pay with local currency</p>
              </div>
            </Link>
            <Link to="/sell-bitcoin" onClick={() => setMarketDrop(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', textDecoration: 'none', borderBottom: `1px solid ${C.g100}`, background: isActive('/sell-bitcoin') ? C.mist : '#fff', transition: 'background 0.15s' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FEF9C3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Tag size={16} color={C.goldDark} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.g800 }}>Sell Bitcoin</p>
                <p style={{ margin: 0, fontSize: 10, color: C.g400 }}>Get paid in local currency</p>
              </div>
            </Link>
            {/* USDT divider */}
            <div style={{ height: 1, background: C.g100, margin: '0 12px' }} />
            <Link to="/buy-usdt" onClick={() => setMarketDrop(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', textDecoration: 'none', borderBottom: `1px solid ${C.g100}`, background: isActive('/buy-usdt') ? C.mist : '#fff', transition: 'background 0.15s' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#0D9488' }}>₮</span>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.g800 }}>Buy USDT</p>
                <p style={{ margin: 0, fontSize: 10, color: C.g400 }}>Pay with local currency</p>
              </div>
            </Link>
            <Link to="/sell-usdt" onClick={() => setMarketDrop(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', textDecoration: 'none', background: isActive('/sell-usdt') ? C.mist : '#fff', transition: 'background 0.15s' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FEF9C3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: C.goldDark }}>₮</span>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.g800 }}>Sell USDT</p>
                <p style={{ margin: 0, fontSize: 10, color: C.g400 }}>Get paid in local currency</p>
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* Gift Cards — direct link */}
      <Link to="/gift-cards"
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          color: isGiftActive ? '#fff' : C.purple,
          background: isGiftActive ? C.purple : '#F5F3FF',
          borderRadius: '10px',
          fontSize: '14px', fontWeight: 800,
          textDecoration: 'none', whiteSpace: 'nowrap', padding: '9px 18px',
          border: `1px solid ${isGiftActive ? C.purple : '#d4c5ff'}`,
          transition: 'all 0.2s',
        }}>
        <Gift size={14} color={isGiftActive ? '#fff' : C.purple} />
        Gift Cards
      </Link>

      {/* My Trades */}
      <Link to="/my-trades"
        style={{
          color: isActive('/my-trades') ? '#fff' : C.g700,
          background: isActive('/my-trades') ? C.g700 : 'transparent',
          borderRadius: '10px', padding: '9px 18px',
          fontSize: '14px', fontWeight: 800,
          textDecoration: 'none', whiteSpace: 'nowrap',
          border: isActive('/my-trades') ? `1px solid ${C.g700}` : `1px solid transparent`,
          transition: 'all 0.2s',
        }}>
        My Trades
      </Link>

      {/* Create Offer CTA */}
      <Link to="/create-offer"
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          background: isActive('/create-offer')
            ? `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`
            : `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
          color: '#0D1F14', borderRadius: '10px', padding: '9px 20px',
          fontSize: '14px', fontWeight: 900,
          textDecoration: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 2px 12px rgba(244,164,34,0.45)',
          transition: 'all 0.2s',
        }}>
        + Create Offer
      </Link>
    </div>
  );

  // ── Guest Navbar ────────────────────────────────────────────────────────────
  if (!user) return (
    <nav style={{
      background: '#ffffff',
      position: 'sticky', top: 0, zIndex: 50,
      borderBottom: `1px solid ${C.g200}`,
      boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
      fontFamily: "'DM Sans', sans-serif",
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>      <div className="max-w-[1280px] mx-auto px-4 md:px-8">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: 12 }}>
          <Link to="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px' }}>
              <span style={{ color: C.forest }}>PRA</span><span style={{ color: C.gold }}>QEN</span>
            </span>
          </Link>
          <DesktopNavLinks />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Link to="/login" className="hidden sm:inline-block" style={{
              padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 800,
              border: `2px solid ${C.g200}`, color: C.forest,
              textDecoration: 'none', transition: 'all 0.2s', background: 'transparent',
            }}>Log In</Link>
            <Link to="/register" style={{
              padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 800,
              background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
              color: C.dark, textDecoration: 'none',
              boxShadow: '0 2px 12px rgba(244,164,34,0.4)',
            }}>Sign Up</Link>
          </div>
        </div>
      </div>
    </nav>
  );

  // ── Authenticated Navbar ────────────────────────────────────────────────────
  return (
    <nav style={{
      background: '#ffffff',
      position: 'sticky', top: 0, zIndex: 50,
      borderBottom: `1px solid ${C.g200}`,
      boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
      fontFamily: "'DM Sans', sans-serif",
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>      <div className="max-w-[1400px] mx-auto px-4 md:px-10">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: 12 }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px' }}>
              <span style={{ color: C.forest }}>PRA</span><span style={{ color: C.gold }}>QEN</span>
            </span>
          </Link>

          {/* Center Nav */}
          <DesktopNavLinks />

          {/* Right: Wallet (desktop) · Avatar · Bell */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

            {/* Wallet — compact mobile pill */}
            <div className="flex md:hidden items-center"
              style={{ background: C.mist, border: `1px solid #c8e6d4`, borderRadius: 8, overflow: 'hidden' }}>
              <Link to="/wallet"
                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 8px', textDecoration: 'none' }}>
                <Wallet size={12} color={C.forest} />
                <span style={{ fontSize: 11, fontWeight: 900, color: C.forest, whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {showBal ? `${localCode} ${sym}${fmt(totalLocal, 2)}` : '•••'}
                </span>
              </Link>
              <button
                onClick={() => setShowBal(!showBal)}
                style={{ background: 'none', border: 'none', borderLeft: `1px solid #c8e6d4`, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '5px 6px' }}>
                {showBal ? <Eye size={11} color={C.green} /> : <EyeOff size={11} color={C.g400} />}
              </button>
            </div>

            {/* Wallet balance pill — desktop only */}
            <div className="hidden md:flex items-center"
              style={{ gap: 6, background: C.mist, border: `1px solid #c8e6d4`, borderRadius: 10, padding: '6px 12px' }}>
              <button onClick={() => setShowBal(!showBal)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                title={showBal ? 'Hide balance' : 'Show balance'}>
                {showBal
                  ? <Eye size={14} color={C.green} />
                  : <EyeOff size={14} color={C.g400} />}
              </button>
              <Link to="/wallet" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Wallet size={13} color={C.forest} />
                <span style={{ fontSize: 13, fontWeight: 900, color: C.forest }}>
                  {showBal ? `${localCode} ${sym}${fmt(totalLocal, 2)}` : '••••••'}
                </span>
              </Link>
            </div>

            {/* Avatar + dropdown */}
            <div style={{ position: 'relative' }} ref={dropRef}>
              <button
                onClick={() => setProfileDrop(!profileDrop)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: C.g100, border: `1px solid ${C.g200}`,
                  borderRadius: 10, padding: '5px 10px 5px 5px',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 13, color: '#fff', flexShrink: 0,
                  background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
                }}>
                  {displayUser?.avatar_url
                    ? <img src={displayUser.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: C.dark }}>{displayUser?.username?.charAt(0)?.toUpperCase() || 'U'}</span>}
                </div>
                <span className="hidden md:block" style={{ fontSize: 13, fontWeight: 800, color: C.g800, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayUser?.username || 'User'}
                </span>
                <ChevronDown size={13} color={C.g400}
                  style={{ transform: profileDrop ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>

              {/* Dropdown */}
              {profileDrop && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  width: 240, background: '#fff', borderRadius: 16,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: `1px solid ${C.g100}`,
                  overflow: 'hidden', zIndex: 50,
                }}>
                  {/* User header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${C.g100}`, background: C.mist }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: 14,
                      background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
                    }}>
                      {displayUser?.avatar_url
                        ? <img src={displayUser.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ color: C.dark }}>{displayUser?.username?.charAt(0)?.toUpperCase() || 'U'}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 900, fontSize: 13, color: C.forest, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayUser?.username || 'User'}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: C.g400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayUser?.email || ''}
                      </p>
                    </div>
                  </div>

                  {/* P2P Trade row */}
                  <Link to="/buy-bitcoin" onClick={() => setProfileDrop(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 16px', textDecoration: 'none',
                      borderBottom: `1px solid ${C.g100}`,
                      background: isMarketActive ? C.mist : '#fff',
                    }}>
                    <TrendingUp size={14} color={isMarketActive ? C.forest : C.green} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: isMarketActive ? C.forest : C.g800 }}>P2P Trade</span>
                  </Link>

                  {/* Nav links */}
                  <div style={{ padding: '6px 0' }}>
                    {[
                      { to: '/profile',     icon: User,     label: 'Your Profile',  color: C.green },
                      { to: '/my-trades',   icon: List,     label: 'My Trades',     color: C.green },
                      { to: '/my-listings', icon: BarChart3, label: 'My Offers',    color: C.green },
                      { to: '/gift-cards',  icon: Gift,     label: 'Gift Cards',    color: C.purple },
                      { to: '/settings',    icon: Settings, label: 'Settings',      color: C.green },
                    ].map(({ to, icon: Icon, label, color }) => (
                      <Link key={to} to={to} onClick={() => setProfileDrop(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 16px', textDecoration: 'none',
                          background: isActive(to) ? C.mist : '#fff',
                          transition: 'background 0.15s',
                        }}>
                        <Icon size={14} color={isActive(to) ? C.forest : color} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: isActive(to) ? C.forest : C.g800 }}>{label}</span>
                      </Link>
                    ))}
                  </div>

                  <div style={{ borderTop: `1px solid ${C.g100}`, margin: '2px 12px' }} />
                  <button onClick={() => { setProfileDrop(false); handleLogout(); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left', marginBottom: 4,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <LogOut size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#DC2626' }}>Log out</span>
                  </button>
                </div>
              )}
            </div>

            {/* Notifications */}
            <Notifications user={displayUser} />
          </div>
        </div>
      </div>
    </nav>
  );
}
