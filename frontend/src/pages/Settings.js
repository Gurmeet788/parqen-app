import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  User, Lock, Mail, Phone, CreditCard, Bell,
  Shield, Globe, Save, Eye, EyeOff, CheckCircle,
  AlertCircle, Smartphone, LogOut, ChevronRight,
  Camera, BadgeCheck, Clock, Upload, RefreshCw,
  FileText, DollarSign, Languages, MapPin, X,
  ToggleLeft, ToggleRight
} from 'lucide-react';
import { toast } from 'react-toastify';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', mist: '#F0FAF5', white: '#FFFFFF',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', warn: '#F59E0B', paid: '#3B82F6',
};

const authH = () => { const t = localStorage.getItem('token'); return t ? { Authorization: `Bearer ${t}` } : {}; };

const maskEmail = (email) => {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const show = Math.min(4, local.length);
  const masked = local.slice(0, show) + '•'.repeat(Math.max(3, local.length - show));
  return `${masked}@${domain}`;
};

// ─── Verification Step ────────────────────────────────────────────────────────
function VerifStep({ n, title, desc, done, active, badge }) {
  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border transition ${done ? 'bg-green-50 border-green-200' : active ? 'border-blue-200 bg-blue-50' : 'bg-gray-50 border-gray-100'}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
        {done ? <CheckCircle size={18} /> : n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-bold text-sm ${done ? 'text-green-800' : active ? 'text-blue-800' : 'text-gray-600'}`}>{title}</p>
          {badge && <span className={`text-xs font-black px-2 py-0.5 rounded-full ${done ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>{badge}</span>}
        </div>
        <p className={`text-xs mt-0.5 ${done ? 'text-green-600' : active ? 'text-blue-600' : 'text-gray-400'}`}>{desc}</p>
      </div>
      {done ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" /> :
        active ? <span className="text-xs font-bold text-blue-600 flex-shrink-0 mt-0.5">Required →</span> :
        <Clock size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />}
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-green-500' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function Settings({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('account');

  // Read ?tab= URL param so Profile can deep-link to a specific tab
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    const validTabs = ['account', 'verification', 'security', 'preferences', 'payment', 'notifications'];
    if (tabParam && validTabs.includes(tabParam)) setActiveTab(tabParam);
  }, [location.search]);
  const [loading, setLoading] = useState(false);

  // Account info
  const [accountForm, setAccountForm] = useState({ username: '', fullName: '', email: '', phone: '', bio: '' });

  // Security
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });

  // Preferences
  const [prefs, setPrefs] = useState({
    nameDisplay: 'full',      // full | initial | hide
    currency: 'GHS',
    language: 'en',
    timezone: 'Africa/Accra',
  });

  // Notifications
  const [notifs, setNotifs] = useState({
    email_trades: true, email_security: true, email_marketing: false,
    push_trades: true, push_messages: true, push_disputes: true,
  });

  // Payment methods
  const [payments, setPayments] = useState({ bankName: '', accountNumber: '', mobileProvider: '', mobileNumber: '' });

  // Hide full name toggle
  const [hideFullName, setHideFullName] = useState(false);

  // Phone verification flow
  const [phoneStep,    setPhoneStep]    = useState('idle'); // idle | sending | otp | verifying | done
  const [phoneOtp,     setPhoneOtp]     = useState('');

  // Email verification flow (inline in Account tab)
  const [emailVerifyStep,   setEmailVerifyStep]   = useState('idle'); // idle | otp | verifying
  const [emailCode,         setEmailCode]         = useState('');
  const [emailCodeLoading,  setEmailCodeLoading]  = useState(false);

  // KYC upload
  const [kycFiles,     setKycFiles]     = useState({ id: null, selfie: null });
  const [kycLoading,   setKycLoading]   = useState(false);
  const [kycSubmitted, setKycSubmitted] = useState(false);
  const [kycStatus,    setKycStatus]    = useState(user?.kyc_status || null); // null | 'pending' | 'approved'

  // Resend attempt counters — persisted so they survive page refresh
  const [emailResendCount, setEmailResendCount] = useState(() => parseInt(localStorage.getItem('prq_email_resend') || '0'));
  const [phoneResendCount, setPhoneResendCount] = useState(() => parseInt(localStorage.getItem('prq_phone_resend') || '0'));

  // Verification status — own state so it updates without depending on parent re-rendering
  const [emailVerified, setEmailVerified] = useState(!!(user?.is_email_verified || user?.email_verified));
  const [phoneVerified, setPhoneVerified] = useState(!!(user?.is_phone_verified || user?.phone_verified));
  const [kycVerified,   setKycVerified]   = useState(!!(user?.kyc_verified || user?.is_id_verified));
  const [verificationSyncing, setVerificationSyncing] = useState(true);
  const verLevel = kycVerified ? 3 : phoneVerified ? 2 : emailVerified ? 1 : 0;

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    setAccountForm({ username: user.username || '', fullName: user.full_name || '', email: user.email || '', phone: user.phone || '', bio: user.bio || '' });
    setPrefs(p => ({
      ...p,
      currency: user.preferred_currency || localStorage.getItem('praqen_currency') || 'GHS',
      language: user.preferred_language || localStorage.getItem('praqen_language') || 'en',
    }));
    // Seed hideFullName from user object or localStorage
    const saved = localStorage.getItem('hide_full_name');
    if (saved !== null) {
      setHideFullName(saved === 'true');
    } else if (user.hide_full_name !== undefined) {
      setHideFullName(!!user.hide_full_name);
    }
    // Sync verification state whenever user prop changes
    setEmailVerified(!!(user.is_email_verified || user.email_verified));
    setPhoneVerified(!!(user.is_phone_verified || user.phone_verified));
    setKycVerified(!!(user.kyc_verified || user.is_id_verified));
  }, [user]);

  // On mount, fetch fresh profile from API and update verification state directly.
  // This ensures status is correct even when the user prop is stale from localStorage.
  useEffect(() => {
    const tk = localStorage.getItem('token');
    if (!tk) { setVerificationSyncing(false); return; }
    axios.get(`${API_URL}/users/profile`, { headers: authH() })
      .then(r => {
        const fresh = r.data.user || r.data;
        if (fresh?.id) {
          const emailOk = !!(fresh.is_email_verified || fresh.email_verified);
          const phoneOk = !!(fresh.is_phone_verified || fresh.phone_verified);
          setEmailVerified(emailOk);
          setPhoneVerified(phoneOk);
          setKycVerified(!!(fresh.kyc_verified || fresh.is_id_verified));
          if (fresh.kyc_status) setKycStatus(fresh.kyc_status);
          // Clear retry counters once the user is actually verified
          if (emailOk) { localStorage.removeItem('prq_email_resend'); setEmailResendCount(0); }
          if (phoneOk) { localStorage.removeItem('prq_phone_resend'); setPhoneResendCount(0); }
          if (setUser) setUser(u => ({ ...u, ...fresh }));
          const stored = JSON.parse(localStorage.getItem('user') || '{}');
          localStorage.setItem('user', JSON.stringify({ ...stored, ...fresh }));
        }
      })
      .catch(() => {})
      .finally(() => setVerificationSyncing(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccountUpdate = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const r = await axios.put(`${API_URL}/users/profile`, { username: accountForm.username, fullName: accountForm.fullName, phone: accountForm.phone, bio: accountForm.bio }, { headers: authH() });
      if (setUser) setUser({ ...user, username: accountForm.username, full_name: accountForm.fullName, phone: accountForm.phone });
      // Persist to localStorage
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, username: accountForm.username, full_name: accountForm.fullName, phone: accountForm.phone }));
      window.dispatchEvent(new Event('userUpdated'));
      toast.success('Account updated!');
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to update'); }
    finally { setLoading(false); }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (passwordForm.newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/change-password`, { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }, { headers: authH() });
      toast.success('Password changed!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to change password'); }
    finally { setLoading(false); }
  };

  const handlePaymentUpdate = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await axios.put(`${API_URL}/users/payment-methods`, payments, { headers: authH() });
      toast.success('Payment methods saved!');
    } catch { toast.error('Failed to save payment methods'); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    toast.info('Logged out'); navigate('/login');
  };

  const handleSendPhoneOtp = async () => {
    const phone = accountForm.phone.trim();
    if (!phone) { toast.error('Enter your phone number first'); return; }
    setPhoneStep('sending');
    try {
      const r = await axios.post(`${API_URL}/users/send-phone-otp`, { phone }, { headers: authH() });
      toast.success(`OTP sent to ${phone}`);
      setPhoneStep('otp');
      const nc = phoneResendCount + 1;
      setPhoneResendCount(nc);
      localStorage.setItem('prq_phone_resend', String(nc));
      // Dev mode: auto-fill OTP if server couldn't send SMS
      if (r.data?.devCode) {
        setPhoneOtp(r.data.devCode);
        toast.info(`🛠 Dev: code auto-filled (${r.data.devCode})`, { autoClose: 8000 });
      }
    } catch (e) {
      const errData = e?.response?.data;
      // Even if SMS failed, server may have returned devCode
      if (errData?.devCode) {
        setPhoneOtp(errData.devCode);
        setPhoneStep('otp');
        toast.warning(`SMS failed — dev code auto-filled: ${errData.devCode}`, { autoClose: 10000 });
      } else {
        toast.error(errData?.error || 'Failed to send OTP');
        setPhoneStep('idle');
      }
    }
  };

  const handleSendEmailCode = async () => {
    setEmailCodeLoading(true);
    try {
      const r = await axios.post(`${API_URL}/users/resend-verification`, {}, { headers: authH() });
      toast.success('Verification code sent! Check your inbox and spam/junk folder.');
      setEmailVerifyStep('otp');
      const nc = emailResendCount + 1;
      setEmailResendCount(nc);
      localStorage.setItem('prq_email_resend', String(nc));
      // Dev mode: auto-fill code if email delivery had issues
      if (r.data?.devCode) {
        setEmailCode(r.data.devCode);
        toast.info(`🛠 Dev: code auto-filled (${r.data.devCode})`, { autoClose: 8000 });
      }
    } catch (e) {
      const errData = e?.response?.data;
      if (errData?.devCode) {
        setEmailCode(errData.devCode);
        setEmailVerifyStep('otp');
        toast.warning(`Email failed — dev code auto-filled: ${errData.devCode}`, { autoClose: 10000 });
      } else {
        toast.error(errData?.error || 'Failed to send code');
      }
    }
    finally { setEmailCodeLoading(false); }
  };

  const handleVerifyEmailCode = async () => {
    if (emailCode.length < 6) { toast.error('Enter the 6-digit code'); return; }
    setEmailVerifyStep('verifying');
    try {
      await axios.post(`${API_URL}/users/verify-email-code`, { code: emailCode }, { headers: authH() });
      toast.success('Email verified! ✅');
      setEmailVerified(true); // update local state immediately — no prop dependency
      if (setUser) setUser(u => ({ ...u, is_email_verified: true, email_verified: true }));
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, is_email_verified: true, email_verified: true }));
      window.dispatchEvent(new Event('userUpdated'));
      setEmailVerifyStep('idle');
      setEmailCode('');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Invalid or expired code');
      setEmailVerifyStep('otp');
    }
  };

  const toggleFullName = async (hide) => {
    setHideFullName(hide);
    localStorage.setItem('hide_full_name', hide ? 'true' : 'false');
    try {
      await axios.put(`${API_URL}/users/profile`, { hide_full_name: hide }, { headers: authH() });
    } catch { /* non-critical — local state already updated */ }
  };

  const handleVerifyPhone = async () => {
    if (phoneOtp.length < 6) { toast.error('Enter the 6-digit OTP'); return; }
    setPhoneStep('verifying');
    try {
      await axios.post(`${API_URL}/users/verify-phone-otp`, { phone: accountForm.phone.trim(), otp: phoneOtp }, { headers: authH() });
      toast.success('Phone verified! ✅');
      setPhoneVerified(true); // update local state immediately — no prop dependency
      setPhoneStep('done');
      if (setUser) setUser(u => ({ ...u, is_phone_verified: true, phone_verified: true, phone: accountForm.phone.trim() }));
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, is_phone_verified: true, phone_verified: true, phone: accountForm.phone.trim() }));
      window.dispatchEvent(new Event('userUpdated'));
    } catch (e) { toast.error(e?.response?.data?.error || 'Invalid OTP'); setPhoneStep('otp'); }
  };

  const handleKycSubmit = async () => {
    if (!kycFiles.id || !kycFiles.selfie) { toast.error('Please upload both documents'); return; }
    setKycLoading(true);
    try {
      await axios.post(`${API_URL}/kyc/submit`,
        { idDocName: kycFiles.id.name, selfieDocName: kycFiles.selfie.name },
        { headers: authH() }
      );
      toast.success("Documents received! We'll review within 24 hours.");
      setKycSubmitted(true);
      setKycStatus('pending');
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to submit KYC'); }
    finally { setKycLoading(false); }
  };

  const handleSavePreferences = async () => {
    setLoading(true);
    try {
      await axios.put(`${API_URL}/users/preferences`, prefs, { headers: authH() });
      localStorage.setItem('praqen_currency', prefs.currency);
      localStorage.setItem('praqen_language', prefs.language);
      if (setUser) setUser(u => ({ ...u, preferred_currency: prefs.currency, preferred_language: prefs.language }));
      toast.success('Preferences saved!');
    } catch (e) { toast.error('Failed to save preferences'); }
    finally { setLoading(false); }
  };

  const TABS = [
    { id: 'account',       icon: User,     label: 'Account' },
    { id: 'verification',  icon: Shield,   label: 'Verification' },
    { id: 'security',      icon: Lock,     label: 'Security' },
    { id: 'preferences',   icon: Globe,    label: 'Preferences' },
    { id: 'payment',       icon: CreditCard, label: 'Payment' },
    { id: 'notifications', icon: Bell,     label: 'Notifications' },
  ];

  const inputCls = "w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none transition";
  const inputStyle = (active) => ({ borderColor: active ? C.green : C.g200, color: C.g800 });
  const labelCls = "block text-sm font-bold mb-1.5 text-gray-700";

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.mist, fontFamily: "'DM Sans',sans-serif" }}>

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black" style={{ color: C.forest, fontFamily: "'Syne',sans-serif" }}>Settings</h1>
          <p className="text-sm mt-1" style={{ color: C.g500 }}>Manage your account, security and preferences</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">

          {/* Sidebar tabs */}
          <div className="md:w-52 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: C.g200 }}>
              {TABS.map(({ id, icon: Icon, label }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition border-b last:border-0 hover:bg-gray-50"
                  style={{ borderColor: C.g100, backgroundColor: activeTab === id ? `${C.green}10` : 'transparent', borderLeft: activeTab === id ? `3px solid ${C.green}` : '3px solid transparent' }}>
                  <Icon size={16} style={{ color: activeTab === id ? C.green : C.g400 }} />
                  <span className="text-sm font-bold" style={{ color: activeTab === id ? C.green : C.g600 }}>{label}</span>
                </button>
              ))}
              {/* Logout */}
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-red-50" style={{ borderTop: `1px solid ${C.g100}` }}>
                <LogOut size={16} className="text-red-400" />
                <span className="text-sm font-bold text-red-500">Log Out</span>
              </button>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* ── ACCOUNT ─────────────────────────────────────────── */}
            {activeTab === 'account' && (
              <>
                {/* Account information */}
                <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                  <h2 className="text-lg font-black mb-5" style={{ color: C.forest }}>Account Information</h2>
                  <form onSubmit={handleAccountUpdate} className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Username — editable until changed once */}
                      <div>
                        <label className={labelCls} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          Username {user?.username_changed && <Lock size={12} style={{ color: C.g400 }} />}
                        </label>
                        {user?.username_changed ? (
                          <div className="px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center justify-between"
                            style={{ borderColor: C.g200, backgroundColor: C.g100, color: C.g500 }}>
                            <span>{accountForm.username}</span>
                            <Lock size={13} style={{ color: C.g400 }} />
                          </div>
                        ) : (
                          <input type="text" value={accountForm.username}
                            onChange={e => setAccountForm({ ...accountForm, username: e.target.value })}
                            className={inputCls} required style={inputStyle(accountForm.username)} />
                        )}
                        {user?.username_changed
                          ? <p className="text-xs mt-1 flex items-center gap-1" style={{ color: C.g400 }}><Lock size={9} />Username is permanently locked.</p>
                          : <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#D97706' }}>⚠ You can only change your username once. Choose carefully.</p>
                        }
                      </div>
                      {/* Full Name — editable until KYC */}
                      <div>
                        <label className={labelCls} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          Full Name {kycVerified && <Lock size={12} style={{ color: C.g400 }} />}
                        </label>
                        {kycVerified ? (
                          <div className="px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center justify-between"
                            style={{ borderColor: C.g200, backgroundColor: C.g100, color: C.g500 }}>
                            <span>{accountForm.fullName}</span>
                            <Lock size={13} style={{ color: C.g400 }} />
                          </div>
                        ) : (
                          <input type="text" value={accountForm.fullName}
                            onChange={e => setAccountForm({ ...accountForm, fullName: e.target.value })}
                            className={inputCls} style={inputStyle(accountForm.fullName)} />
                        )}
                        {kycVerified
                          ? <p className="text-xs mt-1 flex items-center gap-1" style={{ color: C.g400 }}><Lock size={9} />Locked after ID verification.</p>
                          : <p className="text-xs mt-1" style={{ color: C.g500 }}>ℹ Full name cannot be changed after ID verification.</p>
                        }
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Email — read-only (can't change), show full email + verify button if not verified */}
                      <div>
                        <label className={labelCls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          Email Address
                          {emailVerified
                            ? <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#ECFDF5', color: C.success }}>✓ Verified</span>
                            : <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF7ED', color: C.warn }}>⚠ Unverified</span>}
                        </label>
                        <div className="px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center justify-between"
                          style={{ borderColor: emailVerified ? '#DCFCE7' : '#FDE68A', backgroundColor: C.g50, color: C.g700 }}>
                          <span className="truncate">{maskEmail(accountForm.email)}</span>
                          {emailVerified
                            ? <CheckCircle size={14} style={{ color: C.success, flexShrink: 0 }} />
                            : <AlertCircle size={14} style={{ color: C.warn, flexShrink: 0 }} />}
                        </div>
                        <p className="text-xs mt-1" style={{ color: C.g400 }}>This is the email used to register. It cannot be changed.</p>
                        {!emailVerified && (
                          <div className="mt-2 space-y-2">
                            {emailVerifyStep === 'idle' && (
                              <button type="button" onClick={handleSendEmailCode} disabled={emailCodeLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black disabled:opacity-60"
                                style={{ backgroundColor: C.paid, color: 'white' }}>
                                {emailCodeLoading ? <RefreshCw size={11} className="animate-spin" /> : <Mail size={11} />}
                                {emailCodeLoading ? 'Sending code…' : 'Verify Email →'}
                              </button>
                            )}
                            {(emailVerifyStep === 'otp' || emailVerifyStep === 'verifying') && (
                              <>
                                <p className="text-xs" style={{ color: C.g500 }}>Code sent to your email — enter it below:</p>
                                <div className="flex gap-2 flex-wrap items-center">
                                  <input type="text" inputMode="numeric" maxLength={6}
                                    placeholder="000000" value={emailCode}
                                    onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="px-3 py-2 border-2 rounded-xl text-sm font-black focus:outline-none w-36"
                                    style={{ borderColor: C.paid, letterSpacing: '0.2em', color: C.g800 }} />
                                  <button type="button" onClick={handleVerifyEmailCode}
                                    disabled={emailVerifyStep === 'verifying' || emailCode.length < 6}
                                    className="px-3 py-2 rounded-xl text-white text-xs font-black disabled:opacity-50"
                                    style={{ backgroundColor: C.success }}>
                                    {emailVerifyStep === 'verifying' ? 'Verifying…' : '✓ Confirm'}
                                  </button>
                                  <button type="button" onClick={() => { setEmailVerifyStep('idle'); setEmailCode(''); }}
                                    className="text-xs underline" style={{ color: C.g400 }}>Resend</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Phone — editable until verified, then locked */}
                      <div>
                        <label className={labelCls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          Phone Number
                          {phoneVerified || phoneStep === 'done'
                            ? <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#ECFDF5', color: C.success }}>✓ Verified</span>
                            : accountForm.phone
                              ? <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF7ED', color: C.warn }}>⚠ Unverified</span>
                              : null}
                        </label>
                        {phoneVerified || phoneStep === 'done' ? (
                          <div className="px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center justify-between"
                            style={{ borderColor: '#DCFCE7', backgroundColor: C.g50, color: C.g700 }}>
                            <span>{accountForm.phone}</span>
                            <CheckCircle size={14} style={{ color: C.success, flexShrink: 0 }} />
                          </div>
                        ) : (
                          <input type="tel" value={accountForm.phone}
                            onChange={e => setAccountForm({ ...accountForm, phone: e.target.value })}
                            placeholder="+233 XX XXX XXXX" className={inputCls} style={inputStyle(accountForm.phone)} />
                        )}
                        {phoneVerified || phoneStep === 'done'
                          ? <p className="text-xs mt-1 flex items-center gap-1" style={{ color: C.g400 }}><Lock size={9} />Phone number locked after verification.</p>
                          : <p className="text-xs mt-1" style={{ color: C.g400 }}>Save your number then tap Verify Phone to get an OTP.</p>}
                        {/* Inline phone OTP flow — only when phone exists and not verified */}
                        {!phoneVerified && phoneStep !== 'done' && accountForm.phone && (
                          <div className="mt-2 space-y-2">
                            {(phoneStep === 'idle' || phoneStep === 'sending') && (
                              <button type="button" onClick={handleSendPhoneOtp} disabled={phoneStep === 'sending'}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black disabled:opacity-60"
                                style={{ backgroundColor: C.paid, color: 'white' }}>
                                <Smartphone size={11} />
                                {phoneStep === 'sending' ? 'Sending OTP…' : 'Verify Phone →'}
                              </button>
                            )}
                            {(phoneStep === 'otp' || phoneStep === 'verifying') && (
                              <>
                                <p className="text-xs" style={{ color: C.g500 }}>OTP sent to {accountForm.phone}:</p>
                                <div className="flex gap-2 flex-wrap items-center">
                                  <input type="text" inputMode="numeric" maxLength={6}
                                    placeholder="000000" value={phoneOtp}
                                    onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="px-3 py-2 border-2 rounded-xl text-sm font-black focus:outline-none w-36"
                                    style={{ borderColor: C.paid, letterSpacing: '0.2em', color: C.g800 }} />
                                  <button type="button" onClick={handleVerifyPhone}
                                    disabled={phoneStep === 'verifying' || phoneOtp.length < 6}
                                    className="px-3 py-2 rounded-xl text-white text-xs font-black disabled:opacity-50"
                                    style={{ backgroundColor: C.success }}>
                                    {phoneStep === 'verifying' ? 'Verifying…' : '✓ Confirm'}
                                  </button>
                                  <button type="button" onClick={() => { setPhoneStep('idle'); setPhoneOtp(''); }}
                                    className="text-xs underline" style={{ color: C.g400 }}>Resend</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bio with 100-word limit */}
                    <div>
                      <label className={labelCls}>Bio <span className="font-normal text-gray-400">(optional)</span></label>
                      <textarea
                        value={accountForm.bio}
                        onChange={e => {
                          const val = e.target.value;
                          const wc = val.trim() === '' ? 0 : val.trim().split(/\s+/).length;
                          if (wc <= 100) setAccountForm({ ...accountForm, bio: val });
                        }}
                        placeholder="Tell traders a bit about yourself… (max 100 words)"
                        rows={2}
                        className={inputCls + " resize-none"} style={inputStyle(accountForm.bio)} />
                      <p className="text-xs mt-0.5 text-right"
                        style={{ color: (accountForm.bio || '').trim() === '' ? C.g400 : (accountForm.bio || '').trim().split(/\s+/).length >= 100 ? C.danger : C.g400 }}>
                        {(accountForm.bio || '').trim() === '' ? 0 : (accountForm.bio || '').trim().split(/\s+/).length}/100 words
                      </p>
                    </div>

                    <button type="submit" disabled={loading}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: C.green }}>
                      {loading ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Changes</>}
                    </button>
                  </form>
                </div>

                {/* Name display preferences */}
                <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                  <h2 className="text-lg font-black mb-1" style={{ color: C.forest }}>Name Display</h2>
                  <p className="text-xs text-gray-400 mb-4">How your name appears to other traders on the platform</p>
                  <div className="space-y-2">
                    {[
                      { val: 'full', label: 'Show full name', desc: 'e.g. Samuel Kwame', example: accountForm.fullName || 'Samuel Kwame' },
                      { val: 'initial', label: 'Show first name and last initial', desc: 'e.g. Samuel K.', example: accountForm.fullName ? accountForm.fullName.split(' ').map((w, i) => i === 0 ? w : w[0] + '.').join(' ') : 'Samuel K.' },
                      { val: 'hide', label: 'Hide full name', desc: 'Only username is shown', example: accountForm.username || 'samuel123' },
                    ].map(({ val, label, desc, example }) => (
                      <label key={val} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${prefs.nameDisplay === val ? 'border-green-300 bg-green-50' : 'border-gray-100 hover:border-gray-200'}`}>
                        <input type="radio" name="nameDisplay" value={val} checked={prefs.nameDisplay === val} onChange={() => { setPrefs({ ...prefs, nameDisplay: val }); toggleFullName(val === 'hide'); }} className="accent-green-600" />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-800">{label}</p>
                          <p className="text-xs text-gray-500">{desc}</p>
                        </div>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600">{example}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── VERIFICATION ────────────────────────────────────── */}
            {activeTab === 'verification' && (
              <div className="space-y-5">
                {verificationSyncing && (
                  <div className="bg-white rounded-2xl shadow-sm border p-8 flex items-center justify-center gap-3" style={{ borderColor: C.g200 }}>
                    <RefreshCw size={18} className="animate-spin" style={{ color: C.green }} />
                    <span className="text-sm font-bold" style={{ color: C.g500 }}>Loading verification status…</span>
                  </div>
                )}
                {!verificationSyncing && <>
                {/* Verification level banner */}
                <div className="rounded-2xl p-5 border"
                  style={{ background: `linear-gradient(135deg,${C.forest},${C.green})`, borderColor: C.green }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                      <Shield size={24} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white font-black text-lg">Verification Level {verLevel}/3</p>
                      <p className="text-white/70 text-xs">
                        {verLevel === 3 ? '✅ Fully verified — maximum trade limits' :
                          verLevel === 2 ? '⚡ KYC required for higher limits' :
                          verLevel === 1 ? '⚠️ Add phone to unlock more features' :
                          '🔴 Start verification to begin trading'}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-white/70 text-xs mb-1">Trade limit</p>
                      <p className="text-white font-black text-sm">
                        {verLevel >= 3 ? 'Unlimited' : verLevel >= 2 ? '$2,000' : verLevel >= 1 ? '$500' : '$100'}
                      </p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-white/20">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${(verLevel / 3) * 100}%`, backgroundColor: C.gold }} />
                  </div>
                </div>

                {/* Verification steps */}
                <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                  <h2 className="text-lg font-black mb-5" style={{ color: C.forest }}>Verification Steps</h2>
                  <div className="space-y-3">

                    {/* ── Step 1 — Email ── */}
                    {(() => {
                      const underReview = !emailVerified && emailResendCount >= 3;
                      return (
                        <div className={`p-4 rounded-xl border transition ${emailVerified ? 'bg-green-50 border-green-200' : underReview ? 'bg-amber-50 border-amber-200' : 'border-blue-200 bg-blue-50'}`}>
                          <div className="flex items-start gap-4">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${emailVerified ? 'bg-green-500 text-white' : underReview ? 'bg-amber-400 text-white' : 'bg-blue-500 text-white'}`}>
                              {emailVerified ? <CheckCircle size={18}/> : underReview ? <Clock size={18}/> : 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`font-bold text-sm ${emailVerified ? 'text-green-800' : underReview ? 'text-amber-800' : 'text-blue-800'}`}>Email Verification</p>
                                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${emailVerified ? 'bg-green-200 text-green-800' : underReview ? 'bg-amber-200 text-amber-800' : 'bg-blue-200 text-blue-800'}`}>
                                  {emailVerified ? '✓ Verified' : underReview ? '⏳ Under Review' : 'Basic'}
                                </span>
                              </div>
                              <p className={`text-xs mt-0.5 ${emailVerified ? 'text-green-600' : underReview ? 'text-amber-700' : 'text-blue-600'}`}>
                                {emailVerified ? `${maskEmail(accountForm.email)} is verified ✓` : underReview ? 'Being reviewed by our team' : 'Verify your email address to start trading'}
                              </p>

                              {/* Under-review card */}
                              {underReview && (
                                <div className="mt-3 rounded-xl border overflow-hidden" style={{borderColor:'#FDE68A'}}>
                                  <div className="px-4 py-2.5 flex items-center gap-2" style={{backgroundColor:'#FEF3C7', borderBottom:'1px solid #FDE68A'}}>
                                    <Mail size={13} style={{color:'#D97706', flexShrink:0}}/>
                                    <p className="text-xs font-black" style={{color:'#92400E'}}>Email is Under Manual Review</p>
                                  </div>
                                  <div className="px-4 py-3 space-y-2" style={{backgroundColor:'#FFFBEB'}}>
                                    <p className="text-xs leading-relaxed" style={{color:'#78350F'}}>
                                      We tried to send a code to <strong>{maskEmail(accountForm.email)}</strong> but couldn't confirm delivery.
                                      Our team will manually verify your email and notify you within <strong>24 hours</strong>.
                                    </p>
                                    <p className="text-xs" style={{color:'#92400E'}}>You'll receive an update once your email is approved or rejected.</p>
                                    <a href="mailto:hello@hellopraqen.com"
                                      className="inline-flex items-center gap-1.5 text-xs font-black mt-1"
                                      style={{color:'#D97706'}}>
                                      <Mail size={11}/> hello@hellopraqen.com
                                    </a>
                                  </div>
                                </div>
                              )}

                              {/* Normal OTP flow */}
                              {!emailVerified && !underReview && (
                                <div className="mt-3 space-y-2">
                                  {emailVerifyStep === 'idle' && (
                                    <button onClick={handleSendEmailCode} disabled={emailCodeLoading}
                                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-60"
                                      style={{ backgroundColor: C.paid }}>
                                      <Mail size={13} />
                                      {emailCodeLoading ? 'Sending…' : 'Send Verification Code →'}
                                    </button>
                                  )}
                                  {(emailVerifyStep === 'otp' || emailVerifyStep === 'verifying') && (
                                    <>
                                      <p className="text-xs" style={{ color: '#1e40af' }}>Code sent! Check your inbox and spam folder:</p>
                                      <div className="flex gap-2 flex-wrap items-center">
                                        <input type="text" inputMode="numeric" maxLength={6}
                                          placeholder="000000" value={emailCode}
                                          onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                          className="px-3 py-2 border-2 rounded-xl text-sm font-black focus:outline-none w-36"
                                          style={{ borderColor: '#3b82f6', letterSpacing: '0.2em', color: C.g800 }} />
                                        <button onClick={handleVerifyEmailCode}
                                          disabled={emailVerifyStep === 'verifying' || emailCode.length < 6}
                                          className="px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-50"
                                          style={{ backgroundColor: C.success }}>
                                          {emailVerifyStep === 'verifying' ? 'Verifying…' : '✓ Verify'}
                                        </button>
                                        <button onClick={() => { setEmailVerifyStep('idle'); setEmailCode(''); }} className="text-xs underline text-gray-400">Resend</button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                            {emailVerified
                              ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5"/>
                              : underReview ? <Clock size={16} style={{color:'#D97706', flexShrink:0, marginTop:2}}/>
                              : <span className="text-xs font-bold text-blue-600 flex-shrink-0 mt-0.5">Required →</span>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Step 2 — Phone ── */}
                    {(() => {
                      const done = phoneVerified || phoneStep === 'done';
                      const underReview = !done && phoneResendCount >= 3;
                      return (
                        <div className={`p-4 rounded-xl border transition ${done ? 'bg-green-50 border-green-200' : underReview ? 'bg-amber-50 border-amber-200' : emailVerified ? 'border-blue-200 bg-blue-50' : 'bg-gray-50 border-gray-100'}`}>
                          <div className="flex items-start gap-4">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${done ? 'bg-green-500 text-white' : underReview ? 'bg-amber-400 text-white' : emailVerified ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                              {done ? <CheckCircle size={18}/> : underReview ? <Clock size={18}/> : 2}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`font-bold text-sm ${done ? 'text-green-800' : underReview ? 'text-amber-800' : emailVerified ? 'text-blue-800' : 'text-gray-600'}`}>Phone Number</p>
                                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${done ? 'bg-green-200 text-green-800' : underReview ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-600'}`}>
                                  {done ? '✓ Verified' : underReview ? '⏳ Under Review' : 'Standard'}
                                </span>
                              </div>
                              <p className={`text-xs mt-0.5 ${done ? 'text-green-600' : underReview ? 'text-amber-700' : emailVerified ? 'text-blue-600' : 'text-gray-400'}`}>
                                {done ? `${accountForm.phone || 'Phone'} verified ✓` : underReview ? 'Being reviewed by our team' : 'Verify your phone number to unlock $2,000 trade limit'}
                              </p>

                              {/* Under-review card */}
                              {underReview && (
                                <div className="mt-3 rounded-xl border overflow-hidden" style={{borderColor:'#FDE68A'}}>
                                  <div className="px-4 py-2.5 flex items-center gap-2" style={{backgroundColor:'#FEF3C7', borderBottom:'1px solid #FDE68A'}}>
                                    <Smartphone size={13} style={{color:'#D97706', flexShrink:0}}/>
                                    <p className="text-xs font-black" style={{color:'#92400E'}}>Phone is Under Manual Review</p>
                                  </div>
                                  <div className="px-4 py-3 space-y-2" style={{backgroundColor:'#FFFBEB'}}>
                                    <p className="text-xs leading-relaxed" style={{color:'#78350F'}}>
                                      We tried to send an OTP to <strong>{accountForm.phone}</strong> but couldn't confirm delivery.
                                      Our team will manually verify your number and notify you within <strong>24 hours</strong>.
                                    </p>
                                    <p className="text-xs" style={{color:'#92400E'}}>You'll receive an update once your number is approved or rejected.</p>
                                    <a href="mailto:hello@hellopraqen.com"
                                      className="inline-flex items-center gap-1.5 text-xs font-black mt-1"
                                      style={{color:'#D97706'}}>
                                      <Mail size={11}/> hello@hellopraqen.com
                                    </a>
                                  </div>
                                </div>
                              )}

                              {/* Normal OTP flow */}
                              {!done && !underReview && emailVerified && (
                                <div className="mt-3 space-y-2">
                                  {(phoneStep === 'idle' || phoneStep === 'sending') && (
                                    <button onClick={handleSendPhoneOtp} disabled={phoneStep === 'sending'}
                                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-60"
                                      style={{backgroundColor: C.paid}}>
                                      <Smartphone size={13}/>
                                      {phoneStep === 'sending' ? 'Sending OTP…' : `Send OTP to ${accountForm.phone || 'your phone'}`}
                                    </button>
                                  )}
                                  {(phoneStep === 'otp' || phoneStep === 'verifying') && (
                                    <div className="flex gap-2 items-center flex-wrap">
                                      <input type="text" inputMode="numeric" maxLength={6}
                                        placeholder="Enter 6-digit OTP"
                                        value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                                        className="px-3 py-2 border-2 rounded-xl text-sm font-black tracking-widest focus:outline-none w-40"
                                        style={{borderColor: C.paid, color: C.g800, letterSpacing: '0.2em'}}/>
                                      <button onClick={handleVerifyPhone} disabled={phoneStep === 'verifying'}
                                        className="px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-60"
                                        style={{backgroundColor: C.success}}>
                                        {phoneStep === 'verifying' ? 'Verifying…' : '✓ Verify'}
                                      </button>
                                      <button onClick={() => { setPhoneStep('idle'); setPhoneOtp(''); }} className="text-xs text-gray-400 underline">Resend</button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {done
                              ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5"/>
                              : underReview ? <Clock size={16} style={{color:'#D97706', flexShrink:0, marginTop:2}}/>
                              : emailVerified ? null
                              : <Clock size={16} className="text-gray-300 flex-shrink-0 mt-0.5"/>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Step 3 — KYC ── */}
                    {(() => {
                      const kycPending = (kycSubmitted || kycStatus === 'pending') && !kycVerified;
                      return (
                        <div className={`p-4 rounded-xl border transition ${kycVerified ? 'bg-green-50 border-green-200' : kycPending ? 'bg-amber-50 border-amber-200' : phoneVerified ? 'border-blue-200 bg-blue-50' : 'bg-gray-50 border-gray-100'}`}>
                          <div className="flex items-start gap-4">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${kycVerified ? 'bg-green-500 text-white' : kycPending ? 'bg-amber-400 text-white' : phoneVerified ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                              {kycVerified ? <CheckCircle size={18}/> : kycPending ? <Clock size={18}/> : 3}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`font-bold text-sm ${kycVerified ? 'text-green-800' : kycPending ? 'text-amber-800' : phoneVerified ? 'text-blue-800' : 'text-gray-600'}`}>Identity (KYC)</p>
                                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${kycVerified ? 'bg-green-200 text-green-800' : kycPending ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-600'}`}>
                                  {kycVerified ? '✓ Verified' : kycPending ? '⏳ Pending' : 'Advanced'}
                                </span>
                              </div>
                              <p className={`text-xs mt-0.5 ${kycVerified ? 'text-green-600' : kycPending ? 'text-amber-700' : phoneVerified ? 'text-blue-600' : 'text-gray-400'}`}>
                                {kycVerified ? 'Identity verified — unlimited trading unlocked ✓' : kycPending ? 'Documents received — under review by our team' : 'Upload your government ID + selfie for unlimited trading'}
                              </p>

                              {/* KYC pending card */}
                              {kycPending && (
                                <div className="mt-3 rounded-xl border overflow-hidden" style={{borderColor:'#FDE68A'}}>
                                  <div className="px-4 py-2.5 flex items-center gap-2" style={{backgroundColor:'#FEF3C7', borderBottom:'1px solid #FDE68A'}}>
                                    <Clock size={13} style={{color:'#D97706', flexShrink:0}}/>
                                    <p className="text-xs font-black" style={{color:'#92400E'}}>Documents Under Review</p>
                                    <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full" style={{backgroundColor:'#FCD34D', color:'#78350F'}}>Pending</span>
                                  </div>
                                  <div className="px-4 py-3 space-y-2" style={{backgroundColor:'#FFFBEB'}}>
                                    {kycFiles.id && <div className="flex items-center gap-2"><CheckCircle size={12} style={{color:'#D97706', flexShrink:0}}/><span className="text-xs font-semibold" style={{color:'#92400E'}}>ID document received</span></div>}
                                    {kycFiles.selfie && <div className="flex items-center gap-2"><CheckCircle size={12} style={{color:'#D97706', flexShrink:0}}/><span className="text-xs font-semibold" style={{color:'#92400E'}}>Selfie received</span></div>}
                                    {!kycFiles.id && !kycFiles.selfie && <div className="flex items-center gap-2"><CheckCircle size={12} style={{color:'#D97706', flexShrink:0}}/><span className="text-xs font-semibold" style={{color:'#92400E'}}>Documents submitted</span></div>}
                                    <p className="text-xs leading-relaxed" style={{color:'#78350F'}}>
                                      Our team is reviewing your identity documents. You will be notified within <strong>24 hours</strong> whether your KYC is approved or if we need more information.
                                    </p>
                                    <a href="mailto:hello@hellopraqen.com"
                                      className="inline-flex items-center gap-1.5 text-xs font-black"
                                      style={{color:'#D97706'}}>
                                      <Mail size={11}/> hello@hellopraqen.com
                                    </a>
                                  </div>
                                </div>
                              )}

                              {/* KYC upload form */}
                              {!kycVerified && !kycPending && phoneVerified && (
                                <div className="mt-3 space-y-2">
                                  {[
                                    { key: 'id',     label: '🪪 National ID / Passport' },
                                    { key: 'selfie', label: '🤳 Selfie holding your ID' },
                                  ].map(({ key, label }) => (
                                    <label key={key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-dashed cursor-pointer hover:border-blue-400 transition"
                                      style={{borderColor: kycFiles[key] ? C.success : C.g200}}>
                                      <Upload size={14} style={{color: kycFiles[key] ? C.success : C.g400, flexShrink:0}}/>
                                      <span className="text-xs font-bold flex-1" style={{color: kycFiles[key] ? C.success : C.g600}}>
                                        {kycFiles[key] ? `✓ ${kycFiles[key].name}` : label}
                                      </span>
                                      <input type="file" accept="image/*,.pdf" className="hidden"
                                        onChange={e => setKycFiles(f => ({...f, [key]: e.target.files[0] || null}))}/>
                                    </label>
                                  ))}
                                  <button onClick={handleKycSubmit} disabled={kycLoading || !kycFiles.id || !kycFiles.selfie}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-50 mt-1"
                                    style={{backgroundColor: C.green}}>
                                    {kycLoading ? <><RefreshCw size={13} className="animate-spin"/> Submitting…</> : <><Upload size={13}/> Submit for Review</>}
                                  </button>
                                </div>
                              )}
                            </div>
                            {kycVerified
                              ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5"/>
                              : kycPending ? <Clock size={16} style={{color:'#D97706', flexShrink:0, marginTop:2}}/>
                              : phoneVerified ? null
                              : <Clock size={16} className="text-gray-300 flex-shrink-0 mt-0.5"/>}
                          </div>
                        </div>
                      );
                    })()}

                  </div>
                </div>

                {/* Benefits table */}
                <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                  <h2 className="text-lg font-black mb-4" style={{ color: C.forest }}>Verification Benefits</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b" style={{ borderColor: C.g100 }}>
                          <th className="text-left pb-3 font-bold text-gray-500">Feature</th>
                          <th className="text-center pb-3 font-bold text-gray-500">Basic</th>
                          <th className="text-center pb-3 font-bold text-gray-500">Standard</th>
                          <th className="text-center pb-3 font-bold text-gray-500">Advanced</th>
                        </tr>
                      </thead>
                      <tbody className="space-y-2">
                        {[
                          { feat: 'Trade limit', b: '$100', s: '$2,000', a: 'Unlimited' },
                          { feat: 'Create offers', b: '✅', s: '✅', a: '✅' },
                          { feat: 'P2P Trading', b: '✅', s: '✅', a: '✅' },
                          { feat: 'Gift cards', b: '✅', s: '✅', a: '✅' },
                          { feat: 'Affiliate program', b: '❌', s: '✅', a: '✅' },
                          { feat: 'VIP badge', b: '❌', s: '❌', a: '✅' },
                        ].map(({ feat, b, s, a }) => (
                          <tr key={feat} className="border-b last:border-0" style={{ borderColor: C.g50 }}>
                            <td className="py-2.5 font-semibold text-gray-700">{feat}</td>
                            <td className="py-2.5 text-center text-gray-600">{b}</td>
                            <td className="py-2.5 text-center text-gray-600">{s}</td>
                            <td className="py-2.5 text-center font-bold" style={{ color: C.green }}>{a}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                </>}
              </div>
            )}

            {/* ── SECURITY ────────────────────────────────────────── */}
            {activeTab === 'security' && (
              <div className="space-y-5">
                <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                  <h2 className="text-lg font-black mb-5" style={{ color: C.forest }}>Change Password</h2>
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    {[
                      { key: 'currentPassword', label: 'Current Password', show: showPw.current, toggle: () => setShowPw({ ...showPw, current: !showPw.current }) },
                      { key: 'newPassword',      label: 'New Password',     show: showPw.new,     toggle: () => setShowPw({ ...showPw, new: !showPw.new }) },
                      { key: 'confirmPassword',  label: 'Confirm New Password', show: showPw.confirm, toggle: () => setShowPw({ ...showPw, confirm: !showPw.confirm }) },
                    ].map(({ key, label, show, toggle }) => (
                      <div key={key}>
                        <label className={labelCls}>{label}</label>
                        <div className="relative">
                          <input type={show ? 'text' : 'password'} value={passwordForm[key]}
                            onChange={e => setPasswordForm({ ...passwordForm, [key]: e.target.value })}
                            className={inputCls + " pr-10"} style={inputStyle(passwordForm[key])} required />
                          <button type="button" onClick={toggle} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                            {show ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {/* Password strength */}
                    {passwordForm.newPassword && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Password strength</p>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map(i => {
                            const len = passwordForm.newPassword.length;
                            const hasUpper = /[A-Z]/.test(passwordForm.newPassword);
                            const hasNum = /\d/.test(passwordForm.newPassword);
                            const hasSpec = /[^a-zA-Z0-9]/.test(passwordForm.newPassword);
                            const score = (len >= 8 ? 1 : 0) + (len >= 12 ? 1 : 0) + (hasUpper && hasNum ? 1 : 0) + (hasSpec ? 1 : 0);
                            const color = score <= 1 ? C.danger : score === 2 ? C.warn : score === 3 ? C.paid : C.success;
                            return <div key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: i <= score ? color : C.g200 }} />;
                          })}
                        </div>
                      </div>
                    )}
                    <button type="submit" disabled={loading}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: C.green }}>
                      {loading ? <><RefreshCw size={15} className="animate-spin" /> Updating…</> : <><Lock size={15} /> Update Password</>}
                    </button>
                  </form>
                </div>

                {/* Active sessions */}
                <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                  <h2 className="text-lg font-black mb-4" style={{ color: C.forest }}>Account Actions</h2>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: C.g100 }}>
                      <div>
                        <p className="text-sm font-bold text-gray-800">Two-Factor Authentication</p>
                        <p className="text-xs text-gray-400">Add extra security to your account</p>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">Coming Soon</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border border-red-100 bg-red-50">
                      <div>
                        <p className="text-sm font-bold text-red-700">Log Out</p>
                        <p className="text-xs text-red-400">Sign out of your account on this device</p>
                      </div>
                      <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold" style={{ backgroundColor: C.danger }}>
                        <LogOut size={13} /> Log Out
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── PREFERENCES ─────────────────────────────────────── */}
            {activeTab === 'preferences' && (
              <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                <h2 className="text-lg font-black mb-5" style={{ color: C.forest }}>Account Preferences</h2>
                <div className="space-y-5">
                  {/* Currency */}
                  <div>
                    <label className={labelCls}><DollarSign size={14} className="inline mr-1" /> Preferred Currency</label>
                    <select value={prefs.currency} onChange={e => setPrefs({ ...prefs, currency: e.target.value })}
                      className={inputCls} style={inputStyle(true)}>
                      {[['GHS', 'Ghana Cedi (₵)'], ['NGN', 'Nigerian Naira (₦)'], ['KES', 'Kenyan Shilling (KSh)'], ['ZAR', 'South African Rand (R)'], ['USD', 'US Dollar ($)'], ['EUR', 'Euro (€)'], ['GBP', 'British Pound (£)']].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>

                  {/* Language */}
                  <div>
                    <label className={labelCls}><Languages size={14} className="inline mr-1" /> Language</label>
                    <select value={prefs.language} onChange={e => setPrefs({ ...prefs, language: e.target.value })}
                      className={inputCls} style={inputStyle(true)}>
                      {[['en', 'English'], ['fr', 'French'], ['pt', 'Portuguese'], ['sw', 'Swahili'], ['ha', 'Hausa']].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>

                  {/* Timezone */}
                  <div>
                    <label className={labelCls}><MapPin size={14} className="inline mr-1" /> Timezone</label>
                    <select value={prefs.timezone} onChange={e => setPrefs({ ...prefs, timezone: e.target.value })}
                      className={inputCls} style={inputStyle(true)}>
                      {[
                        ['Africa/Accra', 'Africa/Accra (GMT+0)'], ['Africa/Lagos', 'Africa/Lagos (GMT+1)'],
                        ['Africa/Nairobi', 'Africa/Nairobi (GMT+3)'], ['Africa/Johannesburg', 'Africa/Johannesburg (GMT+2)'],
                        ['Europe/London', 'Europe/London (GMT+0/+1)'], ['America/New_York', 'America/New_York (GMT-5/-4)'],
                        ['America/Los_Angeles', 'America/Los_Angeles (GMT-8/-7)'],
                      ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>

                  <button onClick={handleSavePreferences} disabled={loading}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: C.green }}>
                    {loading ? <><RefreshCw size={15} className="animate-spin"/> Saving…</> : <><Save size={15}/> Save Preferences</>}
                  </button>
                  <p className="text-xs mt-2" style={{color:C.g400}}>Currency selection affects how values display in your wallet.</p>
                </div>
              </div>
            )}

            {/* ── PAYMENT METHODS ──────────────────────────────────── */}
            {activeTab === 'payment' && (
              <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                <h2 className="text-lg font-black mb-2" style={{ color: C.forest }}>Payment Methods</h2>
                <p className="text-xs text-gray-400 mb-5">These details are shared with buyers/sellers during a trade</p>
                <form onSubmit={handlePaymentUpdate} className="space-y-4">
                  <div>
                    <label className={labelCls}>Bank Name</label>
                    <input type="text" value={payments.bankName} onChange={e => setPayments({ ...payments, bankName: e.target.value })}
                      placeholder="e.g. GCB Bank, GTBank, Ecobank" className={inputCls} style={inputStyle(payments.bankName)} />
                  </div>
                  <div>
                    <label className={labelCls}>Bank Account Number</label>
                    <input type="text" value={payments.accountNumber} onChange={e => setPayments({ ...payments, accountNumber: e.target.value })}
                      placeholder="Enter account number" className={inputCls} style={inputStyle(payments.accountNumber)} />
                  </div>
                  <div>
                    <label className={labelCls}>Mobile Money Provider</label>
                    <select value={payments.mobileProvider} onChange={e => setPayments({ ...payments, mobileProvider: e.target.value })}
                      className={inputCls} style={inputStyle(payments.mobileProvider)}>
                      <option value="">Select provider</option>
                      <option value="mtn">MTN Mobile Money</option>
                      <option value="vodafone">Vodafone Cash</option>
                      <option value="airteltigo">AirtelTigo Money</option>
                      <option value="mpesa">M-Pesa</option>
                      <option value="opay">OPay</option>
                      <option value="palmpay">PalmPay</option>
                      <option value="wave">Wave</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Mobile Money Number</label>
                    <input type="tel" value={payments.mobileNumber} onChange={e => setPayments({ ...payments, mobileNumber: e.target.value })}
                      placeholder="+233 XX XXX XXXX" className={inputCls} style={inputStyle(payments.mobileNumber)} />
                  </div>
                  <div className="p-3 rounded-xl text-xs font-semibold flex items-start gap-2" style={{ backgroundColor: `${C.warn}12`, color: '#92400E' }}>
                    <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                    Your payment details are only shared with your trade partner during an active trade. Never share outside the platform.
                  </div>
                  <button type="submit" disabled={loading}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: C.green }}>
                    {loading ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Payment Methods</>}
                  </button>
                </form>
              </div>
            )}

            {/* ── NOTIFICATIONS ───────────────────────────────────── */}
            {activeTab === 'notifications' && (
              <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                <h2 className="text-lg font-black mb-5" style={{ color: C.forest }}>Notification Preferences</h2>
                <div className="space-y-4">
                  {[
                    { section: '📧 Email Notifications', items: [
                      { key: 'email_trades',   label: 'Trade Updates',     desc: 'New trades, payments, releases' },
                      { key: 'email_security', label: 'Security Alerts',   desc: 'Login attempts, password changes' },
                      { key: 'email_marketing',label: 'News & Promotions', desc: 'Platform updates and offers' },
                    ]},
                    { section: '🔔 Push Notifications', items: [
                      { key: 'push_trades',   label: 'Trade Alerts',   desc: 'Real-time trade status updates' },
                      { key: 'push_messages', label: 'Chat Messages',  desc: 'New messages in trade chat' },
                      { key: 'push_disputes', label: 'Dispute Alerts', desc: 'Dispute opened or resolved' },
                    ]},
                  ].map(({ section, items }) => (
                    <div key={section}>
                      <p className="text-sm font-black text-gray-700 mb-2">{section}</p>
                      <div className="space-y-2">
                        {items.map(({ key, label, desc }) => (
                          <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border" style={{ borderColor: C.g100 }}>
                            <div>
                              <p className="text-sm font-bold text-gray-800">{label}</p>
                              <p className="text-xs text-gray-500">{desc}</p>
                            </div>
                            <Toggle checked={notifs[key]} onChange={v => setNotifs({ ...notifs, [key]: v })} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => toast.success('Notification preferences saved!')}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90"
                    style={{ backgroundColor: C.green }}>
                    <Save size={15} /> Save Preferences
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: C.forest }}>
        <div className="max-w-5xl mx-auto px-4 pt-10 pb-6">
          <div className="grid md:grid-cols-3 gap-8 mb-6">
            <div>
              <span className="text-xl font-black" style={{ fontFamily: "'Syne',sans-serif" }}>
                <span className="text-white">PRA</span><span style={{ color: C.gold }}>QEN</span>
              </span>
              <p className="text-xs leading-relaxed my-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Africa's most trusted P2P Bitcoin platform. Escrow-protected. 0.5% fee only.
              </p>
              <div className="flex gap-2 flex-wrap">
                {[
                  {label:'TikTok',    href:'https://www.tiktok.com/@praqen', bg:'rgba(0,0,0,0.55)', color:'#ffffff', d:'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'},
                  {label:'Instagram', href:'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr', bg:'rgba(228,64,95,0.3)', color:'#E4405F', d:'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z'},
                  {label:'X (Twitter)', href:'https://x.com/praqenapp?s=21', bg:'rgba(255,255,255,0.12)', color:'#ffffff', d:'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'},
                  {label:'WhatsApp',  href:'https://chat.whatsapp.com/LHVjrw9SK8qGoXcKvprjWz?mode=gi_t', bg:'rgba(37,211,102,0.25)', color:'#25D366', d:'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z'},
                  {label:'Discord',   href:'https://discord.gg/V6zCZxfdy', bg:'rgba(88,101,242,0.35)', color:'#5865F2', d:'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z'},
                  {label:'LinkedIn',  href:'https://www.linkedin.com/in/pra-qen-045373402/', bg:'rgba(10,102,194,0.35)', color:'#0A66C2', d:'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'},
                ].map(({label,href,bg,color,d})=>(
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:scale-110 transition-transform"
                    style={{backgroundColor:bg}}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill={color} aria-hidden="true"><path d={d}/></svg>
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Account</p>
              <div className="space-y-2">
                {[['Profile', '/profile'], ['My Trades', '/my-trades'], ['My Listings', '/my-listings'], ['Wallet', '/wallet'], ['Dashboard', '/dashboard']].map(([l, h]) => (
                  <a key={l} href={h} className="block text-xs hover:text-white transition" style={{ color: 'rgba(255,255,255,0.4)' }}>{l}</a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Support</p>
              <div className="space-y-2">
                {[
                  ['WhatsApp Community', 'https://chat.whatsapp.com/LHVjrw9SK8qGoXcKvprjWz?mode=gi_t'],
                  ['Discord', 'https://discord.gg/V6zCZxfdy'],
                  ['support@praqen.com', 'mailto:support@praqen.com'],
                ].map(([l, h]) => (
                  <a key={l} href={h} target="_blank" rel="noopener noreferrer" className="block text-xs hover:text-white transition" style={{ color: 'rgba(255,255,255,0.4)' }}>{l}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>© {new Date().getFullYear()} PRAQEN. All rights reserved.</p>
            <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <Shield size={10} /> Escrow Protected · 0.5% fee on completion only
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
