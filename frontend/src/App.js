import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { RatesProvider } from './contexts/RatesContext';
import axios from 'axios';
import { identifyUser, unidentifyUser } from './utils/notifications';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import WelcomeModal from './components/WelcomeModal';
import WelcomeBonusModal from './components/WelcomeBonusModal';
import SuggestionsPanel from './components/SuggestionsPanel';
import { NotificationPrompt, AndroidInstallBanner, IOSInstallGuide } from './components/PushSetup';

// Silence all non-error console output in production
if (process.env.NODE_ENV === 'production') {
  const noop = () => {};
  console.log   = noop;
  console.info  = noop;
  console.debug = noop;
  console.warn  = noop;
}

// Lazy-loaded pages — each becomes its own JS chunk
const GiftCardMarketplace   = lazy(() => import('./pages/GiftCardMarketplace'));
const Home                  = lazy(() => import('./pages/Home'));
const LandingPage           = lazy(() => import('./pages/LandingPage'));
const Register              = lazy(() => import('./pages/Register'));
const Login                 = lazy(() => import('./pages/Login'));
const CreateListing         = lazy(() => import('./pages/CreateListing'));
const CreateOffer           = lazy(() => import('./pages/CreateOffer'));
const ListingDetail         = lazy(() => import('./pages/ListingDetail'));
const MyTrades              = lazy(() => import('./pages/MyTrades'));
const TradeDetail           = lazy(() => import('./pages/TradeDetail'));
const Profile               = lazy(() => import('./pages/Profile'));
const AdminDashboard        = lazy(() => import('./pages/AdminDashboard'));
const ModeratorDashboard    = lazy(() => import('./pages/ModeratorDashboard'));
const EscrowVerification    = lazy(() => import('./pages/EscrowVerification'));
const WalletPage            = lazy(() => import('./pages/Wallet'));
const Dashboard             = lazy(() => import('./pages/Dashboard'));
const Settings              = lazy(() => import('./pages/Settings'));
const MyListings            = lazy(() => import('./pages/MyListings'));
const EditListing           = lazy(() => import('./pages/EditListing'));
const ForgotPassword        = lazy(() => import('./pages/ForgotPassword'));
const Feedback              = lazy(() => import('./pages/Feedback'));
const TradeChat             = lazy(() => import('./pages/TradeChat'));
const BuyBitcoin            = lazy(() => import('./pages/BuyBitcoin'));
const SellBitcoin           = lazy(() => import('./pages/SellBitcoin'));
const SellGiftCardMarketplace = lazy(() => import('./pages/SellGiftCardMarketplace'));
const VerifyOTP             = lazy(() => import('./pages/VerifyOTP'));
const ResetPassword         = lazy(() => import('./pages/ResetPassword'));
const EmailConfirmation     = lazy(() => import('./pages/EmailConfirmation'));

function PageLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(145deg,#1B4332 0%,#0c2418 50%,#2D6A4F 100%)',
      zIndex: 9998,
    }}>
      <div style={{
        width: 56, height: 56, background: '#F4A422', borderRadius: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 900, color: '#1B4332',
        fontFamily: 'Georgia,serif', marginBottom: 14,
        animation: 'prq-pulse 1.6s ease-in-out infinite',
        boxShadow: '0 0 30px rgba(244,164,34,0.4)',
      }}>P</div>
      <p style={{ color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: 3, fontFamily: 'Georgia,serif', margin: 0 }}>
        PRAQEN
      </p>
      <style>{`@keyframes prq-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}`}</style>
    </div>
  );
}


// API Base URL
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Resolves /ref/:username → /signup?ref=CODE by looking up the real referral code
function RefRedirect() {
  const { username } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API_URL}/ref/${encodeURIComponent(username)}`)
      .then(({ data }) => {
        const code = data.referral_code || username;
        navigate(`/signup?ref=${encodeURIComponent(code)}`, { replace: true });
      })
      .catch(() => {
        navigate(`/signup?ref=${encodeURIComponent(username)}`, { replace: true });
      });
  }, [username, navigate]);

  return <PageLoader />;
}

function AppShell({ children }) {
  const location = useLocation();
  const isTradeRoute = location.pathname.startsWith('/trade/');
  return (
    <div className={`min-h-screen${isTradeRoute ? '' : ' pb-nav-mobile'}`}>
      {children}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);

  // Setup axios interceptor for auth
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Cleanup: remove any bad market cache (empty array or all-null users) so cards
  // always have avatar/flag/feedback data on the next load.
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
      if (c) {
        const empty = !Array.isArray(c.data) || c.data.length === 0;
        const noUsers = !empty && !c.data.some(l => l.users && (l.users.id || l.users.username));
        if (empty || noUsers) localStorage.removeItem('praqen_market_all');
      }
    } catch {}
  }, []);

  // Pre-warm the backend and pre-fetch marketplace listings as soon as app loads.
  // This means by the time the user clicks Buy/Sell, the server is already awake
  // and the listings are cached — so those pages open instantly.
  useEffect(() => {
    const prefetch = async () => {
      try {
        const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
        if (c && Date.now() - c.ts < 60000) return; // already fresh, skip
        const r = await axios.get(`${API_URL}/listings`, { timeout: 20000 });
        const all = (r.data.listings || []).map(l => ({
          ...l, users: Array.isArray(l.users) ? l.users[0] : l.users,
        }));
        if (all.length > 0) {
          localStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() }));
        }
      } catch {}
    };
    // Delay 800ms so it doesn't compete with the auth/profile fetch on startup
    const t = setTimeout(prefetch, 800);
    return () => clearTimeout(t);
  }, []);

  // Load user profile on mount
  useEffect(() => {
    if (token) {
      loadProfile();
    } else {
      setLoading(false);
    }

    // Listen for user updates from other pages (e.g., Profile page)
    const handleUserUpdated = () => {
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      if (storedUser && storedUser.id) {
        setUser(storedUser);
      }
    };

    window.addEventListener('userUpdated', handleUserUpdated);
    return () => window.removeEventListener('userUpdated', handleUserUpdated);
  }, [token]);

  // Show welcome bonus modal first, then the tour — each fires once per user
  useEffect(() => {
    if (!user?.id) return;
    const bonusKey  = `prq_bonus_shown_${user.id}`;
    const tourKey   = `prq_welcomed_${user.id}`;
    if (!localStorage.getItem(bonusKey)) {
      setShowBonusModal(true); // tour deferred until bonus modal closes
    } else if (!localStorage.getItem(tourKey)) {
      setShowWelcome(true);
    }
  }, [user?.id]);

  const loadProfile = async () => {
    try {
      const response = await axios.get(`${API_URL}/users/profile`, { timeout: 10000 });
      const userData = response.data.user;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      window.dispatchEvent(new Event('userUpdated'));
      // Re-link push subscription on every session restore (covers page refresh)
      if (userData?.id) identifyUser(userData.id).catch(() => {});
    } catch (error) {
      if (error.response?.status === 401) {
        // Token is invalid or expired — log out
        logout();
      } else {
        // Network/server error — stay logged in using cached data
        const cached = JSON.parse(localStorage.getItem('user') || 'null');
        if (cached) setUser(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Online heartbeat: keep last_seen_at fresh while logged in ──────────────
  useEffect(() => {
    if (!token) return;

    const ping = () => {
      axios.post(`${API_URL}/users/heartbeat`).catch(() => {});
    };

    // Fire immediately so status shows Online right away
    ping();

    // Re-ping every 60 seconds
    const interval = setInterval(ping, 60000);

    // Also ping whenever the user switches back to this tab
    const onVisible = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token]);

  const login = (userData, token) => {
    setToken(token);
    setUser(userData);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    window.dispatchEvent(new Event('userUpdated'));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    toast.success('Logged in successfully!');
    // Link this browser's push subscription to the user's account
    if (userData?.id) identifyUser(userData.id).catch(() => {});
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    toast.info('Logged out');
    // Unlink push subscription from this account on logout
    unidentifyUser().catch(() => {});
  };

  if (loading) return <PageLoader />;

  return (
    <HelmetProvider>
    <RatesProvider>
    <Router>
      <AppShell>
        <Navbar user={user} onLogout={logout} />

        {showBonusModal && user && (
          <WelcomeBonusModal user={user} onClose={() => {
            localStorage.setItem(`prq_bonus_shown_${user.id}`, '1');
            setShowBonusModal(false);
            if (!localStorage.getItem(`prq_welcomed_${user.id}`)) {
              setShowWelcome(true);
            }
          }} />
        )}

        {showWelcome && user && !showBonusModal && (
          <WelcomeModal user={user} onClose={() => setShowWelcome(false)} />
        )}

        {/* Push notification permission prompt — shows 3s after login, once per user */}
        {user && <NotificationPrompt userId={user.id} />}

        {/* Android PWA install banner — shows when browser offers install */}
        <AndroidInstallBanner />

        {/* iOS Safari guide — shows once on iPhone to walk through Add to Home Screen */}
        <IOSInstallGuide />

        <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* HOME ROUTE */}
          <Route path="/" element={<LandingPage user={user} />} />
          
          {/* Public Routes */}
          <Route path="/listing/:id" element={<ListingDetail user={user} />} />
          
          {/* Gift Card Marketplace - MAIN PAGE */}
          <Route path="/gift-cards" element={<GiftCardMarketplace user={user} />} />
          
          {/* Redirect old marketplace to new gift cards */}
          <Route path="/marketplace" element={<Navigate to="/gift-cards" />} />

          {/* Auth Routes */}
          <Route path="/register" element={!user ? <Register onLogin={login} /> : <Navigate to="/" />} />
          <Route path="/signup" element={!user ? <Register onLogin={login} /> : <Navigate to="/" />} />
          <Route path="/login" element={!user ? <Login onLogin={login} /> : <Navigate to="/" />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          
          {/* ✅ OTP AND RESET PASSWORD ROUTES - ADDED */}
          <Route path="/verify-otp" element={<VerifyOTP onLogin={login} />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/confirm" element={<EmailConfirmation />} />
          
          {/* Sell Gift Card Marketplace */}
          <Route path="/sell-gift-card" element={<SellGiftCardMarketplace user={user} />} />
          
          {/* Bitcoin Marketplace Routes */}
          <Route path="/buy-bitcoin" element={<BuyBitcoin user={user} />} />
          <Route path="/sell-bitcoin" element={<SellBitcoin user={user} />} />

          {/* Protected Routes - Core Features */}
          <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} />
          <Route path="/wallet" element={user ? <WalletPage user={user} /> : <Navigate to="/login" />} />
          <Route path="/settings" element={user ? <Settings user={user} setUser={setUser} /> : <Navigate to="/login" />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route path="/profile" element={user ? <Profile userId={user.id} /> : <Navigate to="/login" />} />

          {/* Listing Management */}
          <Route path="/create-listing" element={user ? <CreateListing user={user} /> : <Navigate to="/login" />} />
          <Route path="/create-offer" element={user ? <CreateOffer user={user} /> : <Navigate to="/login" />} />
          <Route path="/edit-listing/:id" element={user ? <EditListing user={user} /> : <Navigate to="/login" />} />
          <Route path="/my-listings" element={user ? <MyListings user={user} /> : <Navigate to="/login" />} />

          {/* Trade Routes */}
          <Route path="/my-trades" element={user ? <MyTrades user={user} /> : <Navigate to="/login" />} />
          <Route path="/trade/:id" element={user ? <TradeDetail user={user} /> : <Navigate to="/login" />} />
          <Route path="/trade-chat/:id" element={user ? <TradeChat user={user} /> : <Navigate to="/login" />} />
          <Route path="/feedback/:tradeId/:userId" element={user ? <Feedback user={user} /> : <Navigate to="/login" />} />

          {/* Admin/Moderator Routes */}
          <Route path="/admin" element={<AdminDashboard user={user} onLogin={login} />} />
          <Route path="/moderator" element={<ModeratorDashboard user={user} />} />
          <Route path="/escrow/:id" element={user ? <EscrowVerification user={user} /> : <Navigate to="/login" />} />

          {/* Referral short-links — /ref/username → /signup?ref=CODE */}
          <Route path="/ref/:username" element={<RefRedirect />} />

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </Suspense>

        <BottomNav user={user} />
        <SuggestionsPanel user={user} />
        <ToastContainer position="bottom-right" autoClose={3000} />
      </AppShell>
    </Router>
    </RatesProvider>
    </HelmetProvider>
  );
}

export default App;