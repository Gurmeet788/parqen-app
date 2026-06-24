import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useRates } from '../contexts/RatesContext';
import { supabase } from '../lib/supabaseClient';
import {
  Copy, Bitcoin, RefreshCw, CheckCircle,
  ArrowDownLeft, ArrowUpRight, Shield, AlertTriangle,
  Clock, Eye, EyeOff, QrCode, Zap, Download, Send, ArrowLeftRight,
  ChevronRight, X, Wallet, Users, Search,
} from 'lucide-react';
import { toast } from 'react-toastify';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C', sage: '#52B788',
  gold: '#F4A422', mist: '#F0FAF5',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', warn: '#F59E0B', paid: '#3B82F6',
};

const authH  = () => { const t = localStorage.getItem('token'); return t ? { Authorization: `Bearer ${t}` } : {}; };
const fmt    = (n, d = 8) => parseFloat(n || 0).toFixed(d);
const fmtUsd = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtAge = d => {
  if (!d) return '—';
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)    return 'Just now';
  if (s < 3600)  return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};

const fmtDate = d => {
  if (!d) return '—';
  const dt = new Date(d);
  const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { date, time };
};

// ─── Withdraw Modal ────────────────────────────────────────────────────────────
function WithdrawModal({ balance, btcPrice, onClose, onSend, kycStatus }) {
  const [address,   setAddress]   = useState('');
  const [amount,    setAmount]    = useState('');
  const [usdAmount, setUsdAmount] = useState('');
  const [inputMode, setInputMode] = useState('btc');
  const [confirm,   setConfirm]   = useState(false);
  const [sending,   setSending]   = useState(false);
  // 2FA step
  const [step,       setStep]       = useState('form'); // 'form' | 'code'
  const [codeInput,  setCodeInput]  = useState('');
  const [sending2FA, setSending2FA] = useState(false);
  const [riskyAttempt, setRiskyAttempt] = useState(false); // true after first risky-wallet warning

  const price  = btcPrice || 88000;

  const btcAmt = inputMode === 'usd'
    ? parseFloat((parseFloat(usdAmount || 0) / price).toFixed(8))
    : parseFloat(amount || 0);

  // Tiered withdrawal fee — mirrors backend calcWithdrawalFee()
  // Use raw USD input when in USD mode to avoid BTC round-trip floating-point boundary errors
  const calcFeeByUsd = (usd) => {
    if (usd <= 0)    return { feeUsd: 0,  feeBtc: 0,            label: '' };
    if (usd < 50)    return { feeUsd: 5,  feeBtc: 5  / price,   label: '$5 flat fee' };
    if (usd < 100)   return { feeUsd: 10, feeBtc: 10 / price,   label: '$10 flat fee' };
    if (usd < 250)   return { feeUsd: 15, feeBtc: 15 / price,   label: '$15 flat fee' };
    if (usd < 500)   return { feeUsd: 25, feeBtc: 25 / price,   label: '$25 flat fee' };
    return { feeUsd: usd * 0.05, feeBtc: (usd * 0.05) / price,  label: '5% fee' };
  };
  const calcFee = (btc) => {
    // Round to nearest cent before tier comparison to avoid floating-point boundary mismatches
    const usd = Math.round(btc * price * 100) / 100;
    return calcFeeByUsd(usd);
  };
  const { feeUsd, feeBtc: fee, label: feeLabel } = inputMode === 'usd'
    ? calcFeeByUsd(parseFloat(usdAmount || 0))
    : calcFee(btcAmt);
  const total     = btcAmt + fee;
  const totalUsd  = total * price;
  const hasEnough = total <= parseFloat(balance || 0);

  const isMainnetAddr = (addr) => {
    if (!addr || addr.length < 26) return false;
    if (/^tb1[a-z0-9]{25,87}$/.test(addr)) return false;
    if (/^[mn][a-zA-Z0-9]{25,34}$/.test(addr)) return false;
    return /^(bc1[a-z0-9]{25,87}|[13][a-zA-HJ-NP-Z1-9]{25,34})$/.test(addr);
  };
  const addrOk = isMainnetAddr(address.trim());
  const valid  = addrOk && btcAmt > 0 && hasEnough;

  const switchMode = (mode) => { setInputMode(mode); setAmount(''); setUsdAmount(''); };

  const requestCode = async () => {
    if (!valid) return;
    setSending2FA(true);
    try {
      const t = localStorage.getItem('token');
      await axios.post(`${API_URL}/auth/send-action-code`, { action: 'send_btc' },
        { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      setCodeInput('');
      setStep('code');
      toast.success('Security code sent! Check your email inbox.', { autoClose: 5000 });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not send security code. Please try again.');
    } finally {
      setSending2FA(false);
    }
  };

  const handleSend = async () => {
    if (!codeInput || codeInput.length !== 6) { toast.error('Please enter the 6-digit code sent to your email.'); return; }
    setSending(true);
    try {
      if (riskyAttempt) {
        toast.info('Since you still want to send, you can proceed. Once sent, PRAQEN is not responsible for any loss.', { autoClose: 7000 });
      }
      await onSend(address.trim(), btcAmt, codeInput, riskyAttempt);
      toast.success('BTC Sent Successfully! Your transaction is on its way.', { autoClose: 6000 });
      onClose();
    } catch (e) {
      const msg = e?.response?.data?.error || '';
      if (msg.toLowerCase().includes('risky') || msg.toLowerCase().includes('blockchain issue')) {
        setRiskyAttempt(true);
        toast.warning(msg, { autoClose: 10000 });
      } else if (msg) {
        toast.error(msg, { autoClose: 8000 });
      } else {
        toast.error('Something went wrong. Your funds are safe — please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const fmtUsdVal = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        style={{ marginBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>

        {/* ── Header ── */}
        <div style={{ background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)', padding: '20px 20px 18px' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 14px rgba(239,68,68,0.5)' }}>
                <Send size={18} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="font-black text-base text-white">Send Bitcoin</h2>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>On-chain · ~10 min · blockchain fee applies</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <X size={15} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto" style={{ maxHeight: '75vh' }}>

          {/* ── KYC gate ── */}
          {kycStatus && !(kycStatus.email && kycStatus.phone && kycStatus.kyc) ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)', border: '1px solid #f59e0b30' }}>
                  <Shield size={30} style={{ color: C.warn }} />
                </div>
                <h3 className="font-black text-base mb-1" style={{ color: C.g800 }}>Verification Required</h3>
                <p className="text-sm" style={{ color: C.g500 }}>
                  Complete all 3 steps to send Bitcoin to an external wallet.
                </p>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Email Verified',    done: kycStatus.email, step: 1 },
                  { label: 'Phone Verified',    done: kycStatus.phone, step: 2 },
                  { label: 'ID / KYC Verified', done: kycStatus.kyc,   step: 3 },
                ].map(({ label, done, step }) => (
                  <div key={step} className="flex items-center gap-3 p-3 rounded-2xl"
                    style={{ backgroundColor: done ? `${C.success}08` : `${C.warn}08`, border: `1px solid ${done ? C.success : C.warn}30` }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: done ? `${C.success}20` : `${C.warn}20` }}>
                      {done
                        ? <CheckCircle size={15} style={{ color: C.success }} />
                        : <span className="text-xs font-black" style={{ color: C.warn }}>{step}</span>}
                    </div>
                    <p className="text-sm font-bold flex-1" style={{ color: done ? C.success : C.g700 }}>{label}</p>
                    {done
                      ? <CheckCircle size={14} style={{ color: C.success }} />
                      : <span className="text-xs font-black px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${C.warn}20`, color: C.warn }}>Pending</span>}
                  </div>
                ))}
              </div>
              <a href="/profile" onClick={onClose}
                className="w-full py-3.5 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 transition"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}>
                <Shield size={15} /> Complete Verification Now
              </a>
              <p className="text-xs text-center" style={{ color: C.g400 }}>
                Internal transfers to PRAQEN users don't require KYC.
              </p>
            </div>
          ) : (
          <div className="space-y-4">

            {/* ── Balance pill ── */}
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
              <div>
                <p className="text-xs font-bold mb-0.5" style={{ color: '#166534' }}>Available Balance</p>
                <p className="font-black text-xl" style={{ color: '#15803d' }}>₿ {fmt(balance)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold" style={{ color: '#166534' }}>≈</p>
                <p className="font-black text-base" style={{ color: '#166534' }}>{fmtUsdVal(parseFloat(balance) * price)}</p>
              </div>
            </div>

            {/* ── Address ── */}
            <div>
              <label className="block text-xs font-black mb-2" style={{ color: C.g700 }}>
                Recipient Bitcoin Address
              </label>
              <div className="relative">
                <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="bc1q… or 1… or 3… (mainnet only)"
                  className="w-full px-4 py-3.5 text-sm rounded-2xl focus:outline-none font-mono transition"
                  style={{
                    border: `2px solid ${!address ? C.g200 : addrOk ? '#10b981' : '#ef4444'}`,
                    backgroundColor: !address ? '#fafafa' : addrOk ? '#f0fdf4' : '#fff5f5',
                    color: C.g800,
                    paddingRight: address ? '40px' : '16px',
                  }} />
                {address && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {addrOk
                      ? <CheckCircle size={16} style={{ color: '#10b981' }} />
                      : <AlertTriangle size={16} style={{ color: '#ef4444' }} />}
                  </div>
                )}
              </div>
              {address.length > 5 && !addrOk && (
                <p className="text-xs mt-1.5 font-semibold flex items-center gap-1" style={{ color: '#ef4444' }}>
                  <AlertTriangle size={11} /> Mainnet only — bc1…, 1…, or 3… Testnet not accepted.
                </p>
              )}
              {addrOk && (
                <p className="text-xs mt-1.5 font-semibold flex items-center gap-1" style={{ color: '#10b981' }}>
                  <CheckCircle size={11} /> Valid Bitcoin mainnet address
                </p>
              )}
            </div>

            {/* ── Amount ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-black" style={{ color: C.g700 }}>Amount</label>
                <div className="flex rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}` }}>
                  {['btc', 'usd'].map(mode => (
                    <button key={mode} onClick={() => switchMode(mode)}
                      className="px-3 py-1.5 text-xs font-black transition"
                      style={{
                        background: inputMode === mode ? 'linear-gradient(135deg, #1a1a2e, #16213e)' : 'transparent',
                        color: inputMode === mode ? '#fff' : C.g500,
                      }}>
                      {mode === 'btc' ? '₿ BTC' : '$ USD'}
                    </button>
                  ))}
                </div>
              </div>

              {inputMode === 'btc' ? (
                <div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-base" style={{ color: C.g400 }}>₿</span>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="0.00000000" step="0.00000001"
                      className="w-full pl-8 pr-16 py-3.5 text-sm rounded-2xl focus:outline-none font-mono transition"
                      style={{
                        border: `2px solid ${!amount ? C.g200 : hasEnough ? '#10b981' : '#ef4444'}`,
                        backgroundColor: !amount ? '#fafafa' : hasEnough ? '#f0fdf4' : '#fff5f5',
                      }} />
                    <button onClick={() => setAmount((parseFloat(balance || 0) * 0.999).toFixed(8))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black px-2.5 py-1 rounded-xl transition"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}>
                      MAX
                    </button>
                  </div>
                  {btcAmt > 0 && (
                    <p className="text-xs mt-1.5 font-bold" style={{ color: C.g400 }}>≈ {fmtUsdVal(btcAmt * price)} USD</p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-base" style={{ color: C.g400 }}>$</span>
                    <input type="number" value={usdAmount} onChange={e => setUsdAmount(e.target.value)}
                      placeholder="0.00" min="0"
                      className="w-full pl-8 pr-4 py-3.5 text-sm rounded-2xl focus:outline-none transition"
                      style={{
                        border: `2px solid ${!usdAmount ? C.g200 : hasEnough ? '#10b981' : '#ef4444'}`,
                        backgroundColor: !usdAmount ? '#fafafa' : hasEnough ? '#f0fdf4' : '#fff5f5',
                      }} />
                  </div>
                  {parseFloat(usdAmount) > 0 && (
                    <p className="text-xs mt-1.5 font-bold" style={{ color: '#10b981' }}>≈ ₿ {btcAmt.toFixed(8)}</p>
                  )}
                </div>
              )}

              {btcAmt > 0 && !hasEnough && (
                <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
                  <AlertTriangle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
                  <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>
                    Insufficient balance — need ₿ {fmt(total)} ({fmtUsdVal(totalUsd)}) incl. fee
                  </p>
                </div>
              )}
            </div>

            {/* ── Breakdown ── */}
            {btcAmt > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
                {[
                  { label: 'You send',                             btc: btcAmt, usd: btcAmt * price, icon: '→' },
                  { label: `Blockchain fee (${feeLabel || '—'})`,  btc: fee,    usd: feeUsd,         icon: '⛓' },
                  { label: 'Total deducted',                       btc: total,  usd: totalUsd,        bold: true },
                ].map(({ label, btc, usd, bold, icon }, i, arr) => (
                  <div key={label}
                    className="flex justify-between items-center px-4 py-2.5"
                    style={{
                      backgroundColor: bold ? '#f8fafc' : '#fff',
                      borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                      borderTop: bold ? '2px solid #e2e8f0' : i > 0 ? '1px solid #f1f5f9' : 'none',
                    }}>
                    <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: bold ? C.g700 : C.g500 }}>
                      {icon && <span>{icon}</span>}{label}
                    </span>
                    <div className="text-right">
                      <span className={`text-xs ${bold ? 'font-black' : 'font-bold'}`}
                        style={{ color: bold ? '#1e293b' : C.g700 }}>₿ {fmt(btc)}</span>
                      <span className="ml-1.5 text-xs font-medium" style={{ color: C.g400 }}>({fmtUsdVal(usd)})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Confirm checkbox ── */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-2xl transition"
              style={{ backgroundColor: confirm ? '#f0fdf4' : '#fafafa', border: `1.5px solid ${confirm ? '#bbf7d0' : C.g200}` }}>
              <div className="mt-0.5 w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: confirm ? '#10b981' : '#fff', border: `2px solid ${confirm ? '#10b981' : C.g300}` }}>
                {confirm && <CheckCircle size={10} color="#fff" strokeWidth={3} />}
              </div>
              <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} className="sr-only" />
              <p className="text-xs font-semibold leading-relaxed" style={{ color: confirm ? '#166534' : C.g600 }}>
                I confirm this address is correct. Bitcoin transactions are irreversible and cannot be undone.
              </p>
            </label>

            {/* ── Step 1: Send code ── */}
            {step === 'form' && (
              <div className="space-y-3">
                <button onClick={requestCode} disabled={!valid || !confirm || sending2FA}
                  className="w-full py-4 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-40"
                  style={{ background: (!valid || !confirm || sending2FA) ? '#94a3b8' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: (!valid || !confirm) ? 'none' : '0 6px 20px rgba(239,68,68,0.4)' }}>
                  {sending2FA
                    ? <><RefreshCw size={15} className="animate-spin" /> Sending security code…</>
                    : <><Shield size={15} /> Get Security Code &amp; Continue</>}
                </button>
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                  style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                  <AlertTriangle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
                  <p className="text-xs font-semibold" style={{ color: '#92400e' }}>
                    A 6-digit security code will be emailed to you to confirm this withdrawal.
                  </p>
                </div>
              </div>
            )}

            {/* ── Step 2: Enter code ── */}
            {step === 'code' && (
              <div className="space-y-3">
                <div className="flex flex-col items-center text-center px-4 py-4 rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-2"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.35)' }}>
                    <Shield size={18} color="#fff" />
                  </div>
                  <p className="font-black text-sm" style={{ color: '#166534' }}>Security Code Sent</p>
                  <p className="text-xs mt-0.5" style={{ color: '#15803d' }}>
                    Enter the 6-digit code emailed to you to confirm sending ₿{fmt(btcAmt)}
                  </p>
                </div>

                <input
                  type="text" inputMode="numeric" value={codeInput} autoFocus
                  onChange={e => setCodeInput(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="0  0  0  0  0  0"
                  className="w-full text-center py-4 rounded-2xl font-mono tracking-[0.5em] focus:outline-none transition"
                  style={{
                    fontSize: 28, fontWeight: 900,
                    border: `2.5px solid ${codeInput.length === 6 ? '#10b981' : C.g200}`,
                    backgroundColor: codeInput.length === 6 ? '#f0fdf4' : '#fafafa',
                    color: C.g800,
                    letterSpacing: '0.5em',
                  }}
                  maxLength={6}
                />

                <p className="text-xs text-center" style={{ color: C.g400 }}>
                  Didn't receive it?{' '}
                  <button onClick={requestCode} disabled={sending2FA}
                    className="font-black underline disabled:opacity-50 transition"
                    style={{ color: '#10b981' }}>
                    {sending2FA ? 'Sending…' : 'Resend code'}
                  </button>
                </p>

                <div className="flex gap-3">
                  <button onClick={() => { setStep('form'); setCodeInput(''); }}
                    className="flex-1 py-3.5 rounded-2xl border font-bold text-sm hover:bg-gray-50 transition"
                    style={{ borderColor: C.g200, color: C.g600 }}>
                    ← Back
                  </button>
                  <button onClick={handleSend} disabled={codeInput.length !== 6 || sending}
                    className="flex-1 py-3.5 rounded-2xl text-white font-black text-sm transition disabled:opacity-40"
                    style={{
                      background: codeInput.length === 6 && !sending ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#94a3b8',
                      boxShadow: codeInput.length === 6 && !sending ? '0 6px 20px rgba(239,68,68,0.4)' : 'none',
                    }}>
                    {sending
                      ? <span className="flex items-center justify-center gap-2"><RefreshCw size={15} className="animate-spin" /> Sending…</span>
                      : <span className="flex items-center justify-center gap-2"><Send size={15} /> Confirm Send</span>}
                  </button>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Receive Modal ─────────────────────────────────────────────────────────────
function ReceiveModal({ address, network, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success('Address copied!');
    setTimeout(() => setCopied(false), 3000);
  };

  const explorerUrl = `https://mempool.space/address/${address}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.g100 }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${C.success}15` }}>
              <ArrowDownLeft size={15} style={{ color: C.success }} />
            </div>
            <h2 className="font-black text-sm" style={{ color: C.g800 }}>Receive Bitcoin</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-100">
            <X size={14} style={{ color: C.g500 }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">Send BTC to your unique address. Credited after 1 confirmation (~10 min).</p>

          <div>
            <label className="block text-xs font-bold mb-1.5 text-gray-600">Your Bitcoin Address</label>
            <div className="p-3 rounded-xl border font-mono text-xs break-all"
              style={{ borderColor: C.g200, backgroundColor: C.g50, color: C.g700 }}>
              {address || 'Loading…'}
            </div>
          </div>

          <button onClick={copy} disabled={!address}
            className="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: copied ? C.success : C.green }}>
            {copied ? <><CheckCircle size={15} /> Copied!</> : <><Copy size={15} /> Copy Address</>}
          </button>

          {address && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-50"
              style={{ borderColor: C.g200, color: C.g600 }}>
              View on Mempool Explorer ↗
            </a>
          )}

          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: `1px solid ${C.paid}20` }}>
            <Shield size={12} style={{ color: C.paid, flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs font-semibold text-blue-700">
              Only send Bitcoin (BTC) to this address. Other coins will be lost permanently.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const normalizeNotes = (notes) => {
  if (!notes) return notes;
  if (/^Queued withdrawal/i.test(notes)) {
    const feeMatch = notes.match(/₿([\d.]+)\)/);
    const feePart  = feeMatch ? ` Fee (₿${feeMatch[1]}) held.` : '';
    return `User confirmed twice before sending. Warned of risky wallet and proceeded.${feePart} PRAQEN is not responsible for any loss from this transaction.`;
  }
  return notes;
};

// ─── Transaction Receipt Modal ─────────────────────────────────────────────────
function TxReceiptModal({ tx, onClose, onRepeat }) {
  const type       = (tx.type || '').toUpperCase();
  const isSend     = type === 'WITHDRAWAL' || type === 'SEND' || type === 'TRANSFER_OUT';
  const isInternal = type === 'TRANSFER_IN' || type === 'TRANSFER_OUT';
  const isTrade    = type === 'TRADE' || type === 'ESCROW';
  const isOnChain  = type === 'WITHDRAWAL' || type === 'SEND' || type === 'DEPOSIT';
  const isPending  = tx.status === 'PENDING' || tx.status === 'pending';
  const color      = isSend ? C.danger : C.success;

  // Extract counterpart username from notes for internal transfers
  const counterpartMatch = isInternal && tx.notes
    ? (tx.notes.match(/from @(\S+)/i) || tx.notes.match(/→ @(\S+)/i) || tx.notes.match(/to @(\S+)/i))
    : null;
  const counterpart = counterpartMatch ? counterpartMatch[1].replace(/\s*[·\-].*$/, '').trim() : null;

  const label = type === 'TRANSFER_OUT' ? 'PRAQEN Send'
    : type === 'TRANSFER_IN'  ? 'PRAQEN Received'
    : type === 'WITHDRAWAL'   ? 'Bitcoin Sent'
    : type === 'DEPOSIT'      ? 'Bitcoin Received'
    : isTrade                 ? 'Trade'
    : isSend                  ? 'Sent'
    : 'Received';

  const walletType = isInternal ? 'PRAQEN Internal Transfer'
    : isTrade       ? 'PRAQEN Escrow'
    : 'On-chain Bitcoin';

  const txHash = tx.tx_hash || tx.txHash;
  const fullDate = tx.created_at
    ? new Date(tx.created_at).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';
  const refId = tx.id ? `#${String(tx.id).slice(0, 16).toUpperCase()}` : '—';

  const rows = [
    { label: 'Type',         value: label },
    { label: 'Wallet',       value: walletType },
    { label: 'Amount',       value: `${isSend ? '−' : '+'}₿${fmt(Math.abs(tx.amount_btc || 0))}`, colored: true },
    tx.fee_btc ? { label: 'Fee',         value: `₿${fmt(tx.fee_btc)}` }       : null,
    { label: 'Status',       value: isPending ? 'Pending' : 'Confirmed',        statusBadge: true },
    { label: 'Date & Time',  value: fullDate },
    tx.to_address   ? { label: 'To Address',   value: tx.to_address,   mono: true } : null,
    tx.from_address ? { label: 'From Address', value: tx.from_address, mono: true } : null,
    txHash          ? { label: 'TX Hash',      value: txHash, mono: true,
                        link: isInternal ? null : `https://mempool.space/tx/${txHash}` } : null,
    tx.notes        ? { label: 'Notes',        value: normalizeNotes(tx.notes), isNotes: true } : null,
    { label: 'Reference',    value: refId, mono: true },
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl">

        {/* Receipt header — green gradient (screenshot branding) */}
        <div className="relative" style={{ background: `linear-gradient(135deg,${C.forest} 0%,${C.green} 100%)` }}>
          <div className="px-5 pt-5 pb-10 text-center">
            {/* Close button */}
            <button onClick={onClose}
              className="absolute top-4 right-4 w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <X size={13} className="text-white" />
            </button>

            <p className="text-white/50 text-xs font-black tracking-widest mb-0.5">PRAQEN</p>
            <p className="text-white font-black text-base">Transaction Receipt</p>

            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mt-4"
              style={{
                backgroundColor: isPending ? 'rgba(245,158,11,0.25)' : isSend ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)',
                border: `2px solid ${isPending ? C.warn : isSend ? C.danger : C.success}50`,
              }}>
              {isPending
                ? <Clock size={24} style={{ color: C.warn }} />
                : isSend
                  ? <ArrowUpRight size={24} style={{ color: C.danger }} />
                  : <ArrowDownLeft size={24} style={{ color: C.success }} />}
            </div>

            <p className="text-white font-black text-2xl mt-3">
              {isSend ? '−' : '+'}₿{fmt(Math.abs(tx.amount_btc || 0))}
            </p>
            {counterpart && (
              <p className="text-white font-black text-sm mt-1 tracking-wide">
                {type === 'TRANSFER_IN' ? 'From' : 'To'}{' '}
                <span style={{ color: '#6EE7B7' }}>@{counterpart}</span>
              </p>
            )}
            <span className="text-xs font-black px-3 py-1 rounded-full mt-2 inline-block"
              style={{
                backgroundColor: isPending ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)',
                color: isPending ? '#FDE68A' : '#6EE7B7',
              }}>
              {isPending ? '⏳ PENDING' : '✅ CONFIRMED'}
            </span>
          </div>
          {/* Wave cut */}
          <div className="h-5 bg-white" style={{ borderRadius: '50% 50% 0 0 / 100% 100% 0 0', marginTop: -1 }} />
        </div>

        {/* Receipt rows */}
        <div className="px-5 pb-2 overflow-y-auto" style={{ maxHeight: '40vh' }}>
          <div className="border-t-2 border-dashed mb-3" style={{ borderColor: C.g200 }} />
          {rows.map(({ label, value, colored, mono, link, statusBadge, isNotes }) => {
            if (isNotes) {
              const isRisky = /confirmed twice|risky wallet/i.test(value);
              const feeMatch = value.match(/Fee \(₿([\d.]+)\)/);
              const feeAmt = feeMatch ? feeMatch[1] : null;
              return (
                <div key={label} className="py-3 border-b" style={{ borderColor: C.g100 }}>
                  <p className="text-xs font-black mb-2" style={{ color: C.g400 }}>Notes</p>
                  {isRisky ? (
                    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: `${C.warn}40` }}>
                      {/* Header strip */}
                      <div className="px-3 py-2 flex items-center gap-2"
                        style={{ backgroundColor: `${C.warn}18` }}>
                        <AlertTriangle size={13} style={{ color: C.warn, flexShrink: 0 }} />
                        <p className="text-xs font-black" style={{ color: C.warn }}>Risky Wallet Warning</p>
                      </div>
                      {/* Bullet points */}
                      <div className="px-3 py-3 space-y-2.5" style={{ backgroundColor: '#FFFDF5' }}>
                        {[
                          { icon: '✅', text: 'User confirmed twice before sending' },
                          { icon: '⚠️', text: 'Warned this is a risky wallet and chose to proceed' },
                          feeAmt ? { icon: '💰', text: `Fee of ₿${feeAmt} held by PRAQEN` } : null,
                          { icon: '🚫', text: 'PRAQEN is not responsible for any loss from this transaction' },
                        ].filter(Boolean).map(({ icon, text }) => (
                          <div key={text} className="flex items-start gap-2">
                            <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>
                            <p className="text-xs font-semibold leading-relaxed" style={{ color: C.g700 }}>{text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold leading-relaxed" style={{ color: C.g700 }}>{value}</p>
                  )}
                </div>
              );
            }
            return (
            <div key={label} className="flex justify-between items-center py-2 border-b last:border-0"
              style={{ borderColor: C.g100 }}>
              <p className="text-xs font-bold flex-shrink-0 mr-4" style={{ color: C.g400 }}>{label}</p>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono hover:underline text-right"
                  style={{ color: C.paid }}>
                  {value.slice(0, 18)}…↗
                </a>
              ) : statusBadge ? (
                <span className="text-xs font-black px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: value === 'Pending' ? `${C.warn}20` : `${C.success}15`,
                    color: value === 'Pending' ? C.warn : C.success,
                  }}>
                  {value}
                </span>
              ) : (
                <p className={`text-xs text-right break-all ${mono ? 'font-mono' : 'font-semibold'}`}
                  style={{ color: colored ? color : C.g700, maxWidth: '60%' }}>
                  {mono && value.length > 22 ? `${value.slice(0, 22)}…` : value}
                </p>
              )}
            </div>
            );
          })}
          {isOnChain && (
            <div className="border-t-2 border-dashed mt-3 pt-3 text-center">
              <p className="text-xs font-semibold" style={{ color: C.g400 }}>
                🔗 Blockchain External Wallet Send-Out
              </p>
              <p className="text-xs mt-1 font-semibold" style={{ color: C.warn }}>
                ⚠️ The blockchain network is responsible for this external wallet transaction. PRAQEN is not liable once funds leave to an external address.
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 pt-3 pb-5 space-y-2">
          {txHash && isOnChain && (
            <a href={`https://mempool.space/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="w-full py-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-50"
              style={{ borderColor: C.g200, color: C.g600 }}>
              View on Mempool Explorer ↗
            </a>
          )}
          {isInternal && counterpart && onRepeat && (
            <button onClick={() => onRepeat(counterpart)}
              className="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition"
              style={{ background: `linear-gradient(135deg,${C.forest} 0%,${C.green} 100%)`, boxShadow: '0 4px 14px rgba(27,67,50,0.35)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
              </svg>
              Repeat Transfer to @{counterpart}
            </button>
          )}
          <button onClick={onClose}
            className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition border"
            style={{ borderColor: C.g200, color: C.g600, backgroundColor: C.g50 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
            Back to Wallet
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Transaction Row ───────────────────────────────────────────────────────────
function TxRow({ tx, onClick }) {
  const type      = (tx.type || '').toUpperCase();
  const isSend    = type === 'WITHDRAWAL' || type === 'SEND' || type === 'TRANSFER_OUT';
  const isInternal = type === 'TRANSFER_IN' || type === 'TRANSFER_OUT';
  const isPending = tx.status === 'PENDING'  || tx.status === 'pending';
  const color     = isSend ? C.danger : C.success;
  const label     = type === 'TRANSFER_OUT' ? 'PRAQEN Send'
    : type === 'TRANSFER_IN'  ? 'PRAQEN Received'
    : isSend                  ? 'Sent'
    : type === 'DEPOSIT'      ? 'Received'
    : 'Trade';
  const txHash    = tx.tx_hash || tx.txHash;
  const explorerBase = 'https://mempool.space/tx';

  return (
    <div
      className="flex items-center gap-3 py-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 rounded-xl px-2 -mx-2 transition"
      style={{ borderColor: C.g100 }}
      onClick={onClick}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: isInternal ? `${C.paid}15` : `${color}10` }}>
        {isInternal
          ? <Users size={15} style={{ color: C.paid }} />
          : isSend
            ? <ArrowUpRight size={16} style={{ color }} />
            : <ArrowDownLeft size={16} style={{ color }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold" style={{ color: C.g800 }}>{label}</p>
          {isInternal && (
            <span className="text-xs font-black px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${C.paid}15`, color: C.paid }}>FREE</span>
          )}
          {isPending && (
            <span className="text-xs font-black px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${C.warn}20`, color: C.warn }}>PENDING</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <p className="text-xs truncate" style={{ color: C.g400 }}>
            {normalizeNotes(tx.notes) || (txHash ? `${txHash.slice(0, 14)}…` : fmtAge(tx.created_at))}
          </p>
          {txHash && !isInternal && (
            <a href={`${explorerBase}/${txHash}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs font-bold flex-shrink-0 hover:underline"
              style={{ color: C.paid }}>↗</a>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0 min-w-0">
        <p className="text-sm font-black" style={{ color }}>
          {isSend ? '−' : '+'}₿{fmt(Math.abs(tx.amount_btc || 0))}
        </p>
        {tx.created_at && (() => {
          const { date, time } = fmtDate(tx.created_at);
          return (
            <>
              <p className="text-xs font-semibold" style={{ color: C.g600 }}>{date}</p>
              <p className="text-xs" style={{ color: C.g400 }}>{time} · {fmtAge(tx.created_at)}</p>
            </>
          );
        })()}
      </div>
      <ChevronRight size={13} style={{ color: C.g300, flexShrink: 0 }} />
    </div>
  );
}

const CURRENCY_SYMBOLS = { USD:'$', GBP:'£', EUR:'€', GHS:'₵', NGN:'₦', KES:'KSh ', ZAR:'R ' };

// ─── Internal Transfer Modal ───────────────────────────────────────────────────
function InternalTransferModal({ balance, btcPrice, displayCurrency, fxRate, currentUserId, currentUser, onClose, onDone, initialUsername }) {
  const [step,        setStep]        = useState('form');
  const [inputMode,   setInputMode]   = useState('username'); // 'username' | 'address'
  const [query,       setQuery]       = useState(initialUsername || '');
  const [recipient,   setRecipient]   = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [looking,     setLooking]     = useState(false);
  const [localAmount, setLocalAmount] = useState('');
  const [sending,     setSending]     = useState(false);

  const sym         = CURRENCY_SYMBOLS[displayCurrency] || `${displayCurrency} `;
  const btcPriceLoc = (btcPrice || 88000) * (fxRate || 1);
  const localNum    = parseFloat(localAmount) || 0;
  const btcAmount   = localNum > 0 ? parseFloat((localNum / btcPriceLoc).toFixed(8)) : 0;
  const hasEnough   = btcAmount > 0 && btcAmount <= parseFloat(balance || 0);

  // Auto-detect if pasted value looks like a BTC address
  const handleQueryChange = (val) => {
    setQuery(val); setRecipient(null); setLookupError('');
    if (/^(bc1|[13])[a-zA-Z0-9]{10,}/.test(val.trim())) setInputMode('address');
    else if (val && !val.startsWith('bc1') && !val.startsWith('1') && !val.startsWith('3')) setInputMode('username');
  };

  const findUser = async () => {
    const q = query.trim().replace(/^@/, '');
    if (!q) return;
    setLooking(true); setLookupError(''); setRecipient(null);
    try {
      if (inputMode === 'username') {
        const r = await axios.get(`${API_URL}/users/${encodeURIComponent(q)}`, { headers: authH() });
        const u = r.data?.user || r.data;
        if (!u?.id) { setLookupError('Username not found on PRAQEN.'); return; }
        if (String(u.id) === String(currentUserId)) { setLookupError('You cannot send to yourself.'); return; }
        setRecipient({ ...u, resolvedVia: 'username' });
      } else {
        // BTC address — backend will tell us if it's a PRAQEN internal address
        setRecipient({ address: q, username: null, resolvedVia: 'address' });
      }
    } catch {
      setLookupError(inputMode === 'username' ? 'Username not found on PRAQEN.' : 'Could not verify address.');
    } finally { setLooking(false); }
  };

  const send = async () => {
    if (!recipient || btcAmount <= 0 || !hasEnough) return;
    setSending(true);
    try {
      const payload = recipient.resolvedVia === 'address'
        ? { toAddress: recipient.address, amountBtc: btcAmount }
        : { toUsername: recipient.username, amountBtc: btcAmount };
      const r = await axios.post(`${API_URL}/wallet/internal-transfer`, payload, { headers: authH() });
      onDone(r.data.new_balance);
      setStep('success');
    } catch (e) {
      const err = e.response?.data?.error || 'Transfer failed. Please try again.';
      toast.error(err, { autoClose: 8000 });
      if (e.response?.data?.isExternal) {
        setLookupError('This is an external address — use the Send (on-chain) button instead.');
        setStep('form');
      }
    } finally { setSending(false); }
  };

  const recipientLabel = recipient?.username ? `@${recipient.username}` : recipient?.address ? `${recipient.address.slice(0,12)}…` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        style={{ marginBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>

        {/* ── Header ── */}
        <div style={{ background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)', padding: '20px 20px 18px' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', boxShadow: '0 4px 14px rgba(99,102,241,0.5)' }}>
                <ArrowLeftRight size={18} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="font-black text-base text-white">PRAQEN Transfer</h2>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>⚡ Instant · FREE · No blockchain fees</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <X size={15} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '75vh' }}>

          {/* ── SUCCESS ── */}
          {step === 'success' && (
            <div className="p-8 text-center space-y-5">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 8px 24px rgba(16,185,129,0.4)' }}>
                <CheckCircle size={38} color="#fff" />
              </div>
              <div>
                <p className="font-black text-2xl" style={{ color: C.forest }}>Sent!</p>
                <p className="text-sm mt-2 font-semibold" style={{ color: C.g500 }}>
                  <span className="font-black" style={{ color: C.forest }}>₿{btcAmount.toFixed(8)}</span> transferred to{' '}
                  <span className="font-black" style={{ color: C.forest }}>{recipientLabel}</span>
                </p>
                <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full"
                  style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <Zap size={11} style={{ color: '#10b981' }} />
                  <span className="text-xs font-black" style={{ color: '#166534' }}>Instant · Zero fees</span>
                </div>
              </div>
              <button onClick={onClose}
                className="w-full py-4 rounded-2xl text-white font-black text-sm transition"
                style={{ background: 'linear-gradient(135deg, #1B4332, #2D6A4F)', boxShadow: '0 4px 14px rgba(27,67,50,0.35)' }}>
                Done
              </button>
            </div>
          )}

          {/* ── CONFIRM ── */}
          {step === 'confirm' && (
            <div className="p-5 space-y-4">

              {/* Hero amount display */}
              <div className="rounded-3xl p-5 text-center"
                style={{ background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)', boxShadow: '0 8px 28px rgba(27,67,50,0.35)' }}>
                <p className="text-xs font-bold mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>You are sending</p>
                <p className="font-black text-4xl text-white mb-0.5">
                  {sym}{localNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>₿ {btcAmount.toFixed(8)}</p>
                <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <Zap size={11} color="#4ade80" />
                  <span className="text-xs font-black text-white">Instant · Zero fees</span>
                </div>
              </div>

              {/* FROM → TO */}
              <div className="flex items-center gap-2">
                {/* From: you */}
                <div className="flex-1 flex flex-col items-center gap-2 p-3 rounded-2xl"
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  {currentUser?.avatar_url
                    ? <img src={currentUser.avatar_url} alt="you"
                        className="w-11 h-11 rounded-2xl object-cover flex-shrink-0" />
                    : <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base"
                        style={{ background: 'linear-gradient(135deg, #475569, #334155)' }}>
                        {(currentUser?.username || currentUser?.full_name || 'Y')[0].toUpperCase()}
                      </div>}
                  <p className="text-xs font-black text-center truncate w-full" style={{ color: C.g700 }}>
                    {currentUser?.username ? `@${currentUser.username}` : currentUser?.full_name || 'You'}
                  </p>
                  <p className="text-xs font-bold" style={{ color: C.g400 }}>Sender</p>
                </div>

                {/* Arrow */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>
                    <ArrowLeftRight size={14} color="#fff" />
                  </div>
                </div>

                {/* To: recipient */}
                <div className="flex-1 flex flex-col items-center gap-2 p-3 rounded-2xl"
                  style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base"
                    style={{ background: 'linear-gradient(135deg, #1B4332, #2D6A4F)' }}>
                    {recipient?.username ? recipient.username[0].toUpperCase() : '₿'}
                  </div>
                  <p className="text-xs font-black text-center truncate w-full" style={{ color: C.forest }}>
                    {recipient?.username ? `@${recipient.username}` : 'Address'}
                  </p>
                  <p className="text-xs font-bold" style={{ color: '#10b981' }}>Recipient</p>
                </div>
              </div>

              {/* Breakdown */}
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
                {[
                  { label: 'Amount',       val: `${sym}${localNum.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${displayCurrency}` },
                  { label: 'In BTC',       val: `₿ ${btcAmount.toFixed(8)}` },
                  { label: 'Network fee',  free: true },
                  { label: 'They receive', val: `₿ ${btcAmount.toFixed(8)}`, bold: true },
                ].map(({ label, val, bold, free }, i) => (
                  <div key={label} className="flex justify-between items-center px-4 py-3"
                    style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', backgroundColor: bold ? '#f8fafc' : '#fff' }}>
                    <span className="text-xs font-semibold" style={{ color: C.g500 }}>{label}</span>
                    {free
                      ? <span className="text-xs font-black px-2.5 py-1 rounded-full"
                          style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', color: '#15803d', border: '1px solid #86efac' }}>
                          ✓ FREE
                        </span>
                      : <span className={`text-xs ${bold ? 'font-black' : 'font-bold'}`}
                          style={{ color: bold ? C.forest : C.g700 }}>{val}</span>}
                  </div>
                ))}
              </div>

              {/* Warning */}
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                <AlertTriangle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
                <p className="text-xs font-semibold" style={{ color: '#92400e' }}>
                  This transfer is instant and irreversible. Double-check the recipient.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button onClick={() => setStep('form')}
                  className="flex-1 py-3.5 rounded-2xl border font-bold text-sm hover:bg-gray-50 transition"
                  style={{ borderColor: C.g200, color: C.g600 }}>
                  ← Back
                </button>
                <button onClick={send} disabled={sending}
                  className="flex-1 py-4 rounded-2xl text-white font-black text-sm transition disabled:opacity-40"
                  style={{
                    background: sending ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    boxShadow: sending ? 'none' : '0 6px 20px rgba(99,102,241,0.4)',
                  }}>
                  {sending
                    ? <span className="flex items-center justify-center gap-2"><RefreshCw size={14} className="animate-spin" /> Sending…</span>
                    : <span className="flex items-center justify-center gap-2"><Zap size={15} /> Confirm Transfer</span>}
                </button>
              </div>
            </div>
          )}

          {/* ── FORM ── */}
          {step === 'form' && (
            <div className="p-5 space-y-4">

              {/* Balance */}
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
                <div>
                  <p className="text-xs font-bold mb-0.5" style={{ color: '#166534' }}>Available Balance</p>
                  <p className="font-black text-xl" style={{ color: '#15803d' }}>₿ {fmt(balance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold" style={{ color: '#166534' }}>≈</p>
                  <p className="font-black text-base" style={{ color: '#166534' }}>{sym}{(parseFloat(balance) * btcPriceLoc).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Input mode toggle */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black" style={{ color: C.g700 }}>Send To</label>
                  <div className="flex rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}` }}>
                    {[['username', '@ Username'], ['address', '₿ Address']].map(([mode, label]) => (
                      <button key={mode} onClick={() => { setInputMode(mode); setQuery(''); setRecipient(null); setLookupError(''); }}
                        className="px-3 py-1.5 text-xs font-black transition"
                        style={{ background: inputMode === mode ? 'linear-gradient(135deg, #1B4332, #2D6A4F)' : 'transparent', color: inputMode === mode ? '#fff' : C.g500 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    {inputMode === 'username' && (
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-sm" style={{ color: C.g400 }}>@</span>
                    )}
                    <input
                      type="text"
                      value={query}
                      onChange={e => handleQueryChange(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && findUser()}
                      placeholder={inputMode === 'username' ? 'username' : 'bc1q… or 1… or 3…'}
                      className="w-full py-3.5 text-sm rounded-2xl focus:outline-none transition font-mono"
                      style={{
                        paddingLeft: inputMode === 'username' ? '28px' : '16px',
                        paddingRight: '12px',
                        border: `2px solid ${recipient ? '#10b981' : lookupError ? '#ef4444' : C.g200}`,
                        backgroundColor: recipient ? '#f0fdf4' : lookupError ? '#fff5f5' : '#fafafa',
                      }}
                    />
                  </div>
                  <button onClick={findUser} disabled={!query.trim() || looking}
                    className="px-4 rounded-2xl text-white font-black text-xs flex items-center gap-1.5 transition disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #1B4332, #2D6A4F)', boxShadow: '0 4px 12px rgba(27,67,50,0.3)', minWidth: 64 }}>
                    {looking ? <RefreshCw size={13} className="animate-spin" /> : <><Search size={13} /> Find</>}
                  </button>
                </div>

                {lookupError && (
                  <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
                    <AlertTriangle size={12} style={{ color: '#ef4444' }} />
                    <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>{lookupError}</p>
                  </div>
                )}
              </div>

              {/* Recipient card */}
              {recipient && (
                <div className="flex items-center gap-3 p-3.5 rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid #86efac' }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1B4332, #2D6A4F)' }}>
                    {recipient.username ? recipient.username[0].toUpperCase() : '₿'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm" style={{ color: C.forest }}>
                      {recipient.username ? `@${recipient.username}` : 'PRAQEN Wallet Address'}
                    </p>
                    <p className="text-xs truncate font-mono" style={{ color: C.g500 }}>
                      {recipient.address
                        ? `${recipient.address.slice(0, 20)}…`
                        : `${recipient.badge ? recipient.badge + ' · ' : ''}${recipient.total_trades || 0} trades${recipient.country ? ' · ' + recipient.country : ''}`}
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#10b981' }}>
                    <CheckCircle size={14} color="#fff" />
                  </div>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-black mb-2" style={{ color: C.g700 }}>
                  Amount ({displayCurrency})
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-base" style={{ color: C.g400 }}>{sym}</span>
                  <input
                    type="number" value={localAmount} onChange={e => setLocalAmount(e.target.value)}
                    placeholder="0.00" min="0"
                    className="w-full pl-8 pr-4 py-3.5 text-sm rounded-2xl focus:outline-none transition"
                    style={{
                      border: `2px solid ${!localAmount ? C.g200 : hasEnough ? '#10b981' : '#ef4444'}`,
                      backgroundColor: !localAmount ? '#fafafa' : hasEnough ? '#f0fdf4' : '#fff5f5',
                    }}
                  />
                </div>
                {localNum > 0 && (
                  <p className="text-xs mt-1.5 font-bold" style={{ color: '#10b981' }}>≈ ₿ {btcAmount.toFixed(8)}</p>
                )}
                {localNum > 0 && !hasEnough && (
                  <div className="flex items-center gap-1.5 mt-1.5 px-3 py-2 rounded-xl" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
                    <AlertTriangle size={12} style={{ color: '#ef4444' }} />
                    <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>
                      Insufficient balance — you have ₿ {fmt(balance)}
                    </p>
                  </div>
                )}
              </div>

              {/* Free badge */}
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
                <Zap size={14} style={{ color: '#10b981' }} />
                <p className="text-xs font-black" style={{ color: '#166534' }}>
                  Instant &amp; FREE — no blockchain fees, no waiting
                </p>
              </div>

              <button
                onClick={() => setStep('confirm')}
                disabled={!recipient || !hasEnough || btcAmount <= 0}
                className="w-full py-4 rounded-2xl text-white font-black text-sm transition disabled:opacity-40"
                style={{
                  background: (!recipient || !hasEnough || btcAmount <= 0) ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  boxShadow: (!recipient || !hasEnough || btcAmount <= 0) ? 'none' : '0 6px 20px rgba(99,102,241,0.4)',
                }}>
                <span className="flex items-center justify-center gap-2">
                  <ArrowLeftRight size={15} /> Review Transfer
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Wallet Page ──────────────────────────────────────────────────────────
export default function WalletPage({ user }) {
  const navigate = useNavigate();
  const { rates: USD_RATES } = useRates();

  const [walletData,       setWalletData]       = useState(null);
  const [lockedBtc,        setLockedBtc]        = useState(0);
  const [transactions,     setTransactions]     = useState([]);
  const [btcPrice,         setBtcPrice]         = useState(0);
  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [checking,         setChecking]         = useState(false);
  const [showBal,          setShowBal]          = useState(true);
  const [showSend,         setShowSend]         = useState(false);
  const [showRecv,         setShowRecv]         = useState(false);
  const [showInternal,     setShowInternal]     = useState(false);
  const [repeatUsername,   setRepeatUsername]   = useState(null);
  const [selectedTx,       setSelectedTx]       = useState(null);
  const [displayCurrency,  setDisplayCurrency]  = useState(localStorage.getItem('praqen_currency') || 'USD');
  const [userVerif,        setUserVerif]        = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const profile = res.data.user || res.data;
        if (profile.preferred_currency) {
          setDisplayCurrency(profile.preferred_currency);
          localStorage.setItem('praqen_currency', profile.preferred_currency);
        }
        setUserVerif({
          email: !!(profile.is_email_verified || profile.email_verified),
          phone: !!(profile.is_phone_verified  || profile.phone_verified),
          kyc:   !!(profile.is_id_verified     || profile.kyc_verified),
        });
      })
      .catch(() => {
        const saved = localStorage.getItem('praqen_currency');
        if (saved) setDisplayCurrency(saved);
      });
  }, []);

  // ── Load wallet from HD wallet endpoint ────────────────────────────────────
  const loadWallet = async () => {
    try {
      const r = await axios.get(`${API_URL}/hd-wallet/wallet`, { headers: authH() });
      setWalletData({
        address:       r.data.address,
        balance_btc:   r.data.balance_btc,
        locked_btc:    r.data.locked_btc ?? 0,
        // Use ?? not || so available_btc=0 (all funds locked) is preserved, not overwritten with total
        available_btc: r.data.available_btc != null ? r.data.available_btc : r.data.balance_btc,
        balance_usd:   parseFloat(r.data.balance_usd || 0),
        network:       r.data.network,
        has_address:   r.data.has_address,
      });
      setLockedBtc(r.data.locked_btc || 0);
      // Seed BTC price from API response so USD shows immediately (CoinGecko may be slower)
      if (r.data.btc_price && r.data.btc_price > 0) setBtcPrice(p => p > 0 ? p : r.data.btc_price);
      setTransactions(r.data.transactions || []);
    } catch (e) {
      console.error('[Wallet] Load error:', e.message);
      toast.error('Failed to load wallet');
    }
  };

  // ── Fetch live BTC price ───────────────────────────────────────────────────
  const loadBtcPrice = async () => {
    try {
      const r = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      setBtcPrice(r.data.bitcoin.usd);
    } catch {
      try {
        const r2 = await axios.get('https://api.coinbase.com/v2/prices/BTC-USD/spot');
        setBtcPrice(parseFloat(r2.data.data.amount));
      } catch {
        setBtcPrice(88000); // fallback
      }
    }
  };

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const init = async () => {
      setLoading(true);
      await Promise.all([loadWallet(), loadBtcPrice()]);
      setLoading(false);
    };
    init();
  }, [user]);

  // ── Auto-poll every 15 s while the tab is visible ─────────────────────────
  const prevBalRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    const poll = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await axios.get(`${API_URL}/hd-wallet/wallet`, { headers: authH() });
        const incoming = parseFloat(r.data.balance_btc || 0);
        if (prevBalRef.current !== null && incoming > prevBalRef.current) {
          const diff = (incoming - prevBalRef.current).toFixed(8);
          toast.success(`₿ ${diff} BTC received!`, { autoClose: 6000 });
        }
        prevBalRef.current = incoming;
        setWalletData({
          address:       r.data.address,
          balance_btc:   r.data.balance_btc,
          locked_btc:    r.data.locked_btc ?? 0,
          available_btc: r.data.available_btc != null ? r.data.available_btc : r.data.balance_btc,
          balance_usd:   parseFloat(r.data.balance_usd || 0),
          network:       r.data.network,
          has_address:   r.data.has_address,
        });
        setLockedBtc(r.data.locked_btc || 0);
        setTransactions(r.data.transactions || []);
        if (r.data.btc_price && r.data.btc_price > 0) setBtcPrice(p => p > 0 ? p : r.data.btc_price);
      } catch { /* silent — avoid toast spam on network blip */ }
    }, 15000);
    return () => clearInterval(poll);
  }, [user]);

  // ── Supabase Realtime — instant update when a wallet notification arrives ──
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`wallet_notif_${user.id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${user.id}`,
      }, async (payload) => {
        const t = payload.new?.type || '';
        const title = payload.new?.title || '';
        // Refresh on any wallet-related or system notification (covers TRANSFER_IN, deposits, etc.)
        if (t === 'wallet' || t === 'system' || /received|sent|transfer|deposit/i.test(title)) {
          await loadWallet();
          toast.success(title || '₿ Wallet updated!', { autoClose: 5000 });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWallet(), loadBtcPrice()]);
    setRefreshing(false);
    toast.success('Wallet refreshed');
  };

  // ── Generate address ───────────────────────────────────────────────────────
  const generateAddress = async () => {
    try {
      const r = await axios.post(`${API_URL}/hd-wallet/generate-address`, {}, { headers: authH() });
      toast.success('Bitcoin address generated!');
      setWalletData(prev => ({ ...prev, address: r.data.address, has_address: true }));
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to generate address');
    }
  };

  // ── Check for new deposits ─────────────────────────────────────────────────
  const checkDeposit = async () => {
    setChecking(true);
    try {
      const r = await axios.post(`${API_URL}/hd-wallet/check-deposit`, {}, { headers: authH() });
      toast.info(r.data.message || 'Check complete');
      await loadWallet(); // refresh balance after check
    } catch (e) {
      toast.error('Failed to check deposits');
    } finally { setChecking(false); }
  };

  // ── Send BTC (real on-chain withdrawal) ────────────────────────────────────
  const sendBitcoin = async (toAddress, amountBtc, actionCode, force = false) => {
    try {
      const r = await axios.post(`${API_URL}/hd-wallet/send`,
        { toAddress, amountBtc, actionCode, force },
        { headers: authH() }
      );
      await loadWallet();
      return r;
    } catch (e) {
      throw e;
    }
  };

  const balance      = parseFloat(walletData?.balance_btc   || 0); // total (available + locked)
  const lockedBal    = parseFloat(lockedBtc                 || 0);
  const availableBal = parseFloat(walletData?.available_btc ?? balance); // already deducted server-side
  const livePrice    = btcPrice || 88000;
  // USD values — always computed from live price, never from stale DB column
  const availableUsd = availableBal * livePrice;  // USD value of spendable BTC
  const totalUsd     = balance * livePrice;        // USD value of total (available + locked)
  const balUsd       = totalUsd; // kept for legacy references elsewhere in this component
  console.log('[Wallet] balance_btc=', balance, 'locked=', lockedBal, 'available=', availableBal, 'btcPrice=', livePrice, 'availableUsd=', availableUsd, 'totalUsd=', totalUsd);
  const network = walletData?.network || 'mainnet';

  const fxRate   = displayCurrency === 'USD' ? 1 : (USD_RATES?.[displayCurrency] || 1);
  const sym      = CURRENCY_SYMBOLS[displayCurrency] || `${displayCurrency} `;
  const fmtLocal = n => `${sym}${(n * fxRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.mist }}>
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 rounded-full animate-spin mx-auto"
          style={{ borderColor: C.sage, borderTopColor: 'transparent' }} />
        <p className="text-sm font-semibold" style={{ color: C.green }}>Loading wallet…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.g50, fontFamily: "'DM Sans',sans-serif" }}>

      <div className="max-w-2xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4">

        {/* ── WALLET CARD ──────────────────────────────────────────── */}
        <div className="rounded-3xl overflow-hidden shadow-lg relative"
          style={{ background: `linear-gradient(135deg,${C.forest} 0%,${C.green} 60%,${C.mint} 100%)` }}>

          <div className="relative p-6">
            {/* Top row */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  <Wallet size={17} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-black text-sm">Bitcoin Wallet</p>
                    <span className="flex items-center gap-1 text-xs font-black px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(16,185,129,0.25)', color: '#6EE7B7' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                      Live
                    </span>
                  </div>
                  <p className="text-white/60 text-xs">{user?.username} · Auto-refreshing</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowBal(!showBal)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  {showBal ? <Eye size={13} className="text-white" /> : <EyeOff size={13} className="text-white" />}
                </button>
                <button onClick={refresh} disabled={refreshing}
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  <RefreshCw size={13} className={`text-white ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Balance */}
            <div className="mb-6">
              {showBal ? (
                <>
                  {/* Available — primary figure */}
                  <p className="text-white/60 text-xs mb-1">Available Balance</p>
                  <p className="font-black text-white tracking-tight" style={{ fontSize: 'clamp(1.6rem, 6vw, 2.5rem)' }}>
                    ₿ {fmt(availableBal)}
                  </p>
                  <p className="text-white/70 text-sm mt-1">≈ {fmtLocal(availableUsd)}</p>

                  {/* Locked + Total breakdown */}
                  <div className="flex gap-4 mt-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
                      <div>
                        <p className="text-white/40 text-xs">Locked in Escrow</p>
                        <p className="text-white/80 text-xs font-bold">₿ {fmt(lockedBal)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#52B788' }} />
                      <div>
                        <p className="text-white/40 text-xs">Total Balance</p>
                        <p className="text-white/80 text-xs font-bold">₿ {fmt(balance)} ≈ {fmtLocal(totalUsd)}</p>
                      </div>
                    </div>
                  </div>

                  {btcPrice > 0 && (
                    <p className="text-white/40 text-xs mt-2">BTC price: {fmtLocal(btcPrice)}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-white/60 text-xs mb-1">Available Balance</p>
                  <p className="text-4xl font-black text-white">••••••••</p>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: 'Receive',
                  icon: Download,
                  grad: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  shadow: 'rgba(16,185,129,0.45)',
                  action: () => setShowRecv(true),
                },
                {
                  label: 'Send',
                  icon: Send,
                  grad: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  shadow: 'rgba(239,68,68,0.45)',
                  action: () => setShowSend(true),
                },
                {
                  label: 'Transfer',
                  icon: ArrowLeftRight,
                  grad: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  shadow: 'rgba(99,102,241,0.45)',
                  action: () => setShowInternal(true),
                },
              ].map(({ label, icon: Icon, grad, shadow, action }) => (
                <button key={label} onClick={action}
                  className="flex flex-col items-center gap-2 py-4 rounded-2xl transition active:scale-95"
                  style={{ backgroundColor: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: grad, boxShadow: `0 6px 18px ${shadow}` }}>
                    <Icon size={20} color="#fff" strokeWidth={2.2} />
                  </div>
                  <span className="text-white text-xs font-extrabold tracking-wide">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── DEPOSIT ADDRESS CARD ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border shadow-sm p-5" style={{ borderColor: C.g200 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ArrowDownLeft size={15} style={{ color: C.success }} />
              <p className="font-black text-sm" style={{ color: C.g800 }}>Your Deposit Address</p>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: walletData?.address ? `${C.success}15` : `${C.warn}15`,
                color: walletData?.address ? C.success : C.warn
              }}>
              {walletData?.address ? '✅ Ready' : '⚠️ Not Generated'}
            </span>
          </div>

          {walletData?.address ? (
            <div className="space-y-3">
              {/* Address display */}
              <div className="p-3 rounded-xl border font-mono text-xs break-all"
                style={{ borderColor: C.g100, backgroundColor: C.g50, color: C.g700 }}>
                {walletData.address}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(walletData.address); toast.success('Address copied!'); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white font-bold text-xs hover:opacity-90"
                  style={{ backgroundColor: C.green }}>
                  <Copy size={13} /> Copy Address
                </button>
                <button onClick={() => setShowRecv(true)}
                  className="px-3 py-2.5 rounded-xl border font-bold text-xs hover:bg-gray-50"
                  style={{ borderColor: C.g200, color: C.g600 }}>
                  <QrCode size={14} />
                </button>
              </div>

              {/* Check for new deposits */}
              <button onClick={checkDeposit} disabled={checking}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold hover:bg-gray-50 transition"
                style={{ borderColor: C.g200, color: C.g600 }}>
                {checking
                  ? <><RefreshCw size={12} className="animate-spin" /> Checking mempool…</>
                  : <><Zap size={12} style={{ color: C.gold }} /> Check for New Deposits</>}
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <Bitcoin size={36} className="mx-auto mb-3" style={{ color: C.g300 }} />
              <p className="text-sm font-bold text-gray-600 mb-1">No address generated yet</p>
              <p className="text-xs text-gray-400 mb-4">Generate your unique Bitcoin deposit address</p>
              <button onClick={generateAddress}
                className="px-6 py-2.5 rounded-xl text-white font-black text-sm hover:opacity-90"
                style={{ backgroundColor: C.green }}>
                <Bitcoin size={14} className="inline mr-1.5" /> Generate My Address
              </button>
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 p-3 rounded-xl"
            style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <AlertTriangle size={12} style={{ color: C.warn, flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
              Only send Bitcoin (BTC) to this address. Sending other coins will result in permanent loss.
            </p>
          </div>
        </div>

        {/* ── STATS ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: 'Available',    value: `₿${fmt(availableBal, 6)}`, color: C.gold },
            { label: `${displayCurrency} Value`, value: fmtLocal(availableBal * (btcPrice || 88000)), color: C.success },
            { label: 'Transactions', value: `${transactions.length}`, color: C.paid },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border p-3 sm:p-4 shadow-sm text-center" style={{ borderColor: C.g200 }}>
              <p className="font-black truncate" style={{ color, fontSize: 'clamp(0.75rem, 3vw, 1.25rem)' }}>{value}</p>
              <p className="text-xs font-semibold mt-0.5 truncate" style={{ color: C.g400 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── SECURITY INFO ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: C.g200 }}>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={14} style={{ color: C.green }} />
            <p className="font-black text-sm" style={{ color: C.g800 }}>Wallet Security</p>
          </div>
          <div className="space-y-2">
            {[
              { icon: '🔑', label: 'Self-Custodial HD Wallet',  desc: 'Your keys derived from master seed — PRAQEN controls nothing' },
              { icon: '🔒', label: 'Escrow Protected Trades',   desc: 'Trade funds locked until both parties confirm' },
              { icon: '⚡', label: 'Auto Deposit Detection',    desc: 'Balance updates automatically when BTC arrives' },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ backgroundColor: C.g50 }}>
                <span className="text-lg flex-shrink-0">{icon}</span>
                <div>
                  <p className="text-xs font-bold" style={{ color: C.g700 }}>{label}</p>
                  <p className="text-xs" style={{ color: C.g400 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── TRANSACTION HISTORY ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.g100 }}>
            <p className="font-black text-sm" style={{ color: C.g800 }}>Transaction History</p>
            <span className="text-xs font-black px-2 py-0.5 rounded-full"
              style={{ backgroundColor: C.g100, color: C.g500 }}>
              {transactions.length} records
            </span>
          </div>
          <div className="px-5">
            {transactions.length === 0 ? (
              <div className="text-center py-12">
                <Clock size={36} className="mx-auto mb-3" style={{ color: C.g300 }} />
                <p className="font-bold text-sm" style={{ color: C.g500 }}>No transactions yet</p>
                <p className="text-xs mt-1" style={{ color: C.g400 }}>Deposits and trades appear here</p>
                <button onClick={() => navigate('/buy-bitcoin')}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl text-white font-black text-xs mx-auto"
                  style={{ backgroundColor: C.green }}>
                  <Bitcoin size={12} /> Start Trading
                </button>
              </div>
            ) : (
              transactions.map((tx, i) => (
                <TxRow key={tx.id || i} tx={tx} onClick={() => setSelectedTx(tx)} />
              ))
            )}
          </div>
        </div>

      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: C.forest }}>
        <div className="max-w-2xl mx-auto px-4 pt-8 pb-5">
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div>
              <span className="text-xl font-black" style={{ fontFamily: "'Syne',sans-serif" }}>
                <span className="text-white">PRA</span><span style={{ color: C.gold }}>QEN</span>
              </span>
              <p className="text-xs leading-relaxed my-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Africa's most trusted P2P Bitcoin platform.
              </p>
              <div className="flex gap-2 flex-wrap">
                {[
                  {label:'TikTok',    href:'https://www.tiktok.com/@praqen', bg:'rgba(0,0,0,0.55)', color:'#ffffff', d:'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'},
                  {label:'Instagram', href:'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr', bg:'rgba(228,64,95,0.3)', color:'#E4405F', d:'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z'},
                  {label:'X (Twitter)', href:'https://x.com/praqenapp?s=21', bg:'rgba(255,255,255,0.12)', color:'#ffffff', d:'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'},
                  {label:'Discord',   href:'https://discord.gg/V6zCZxfdy', bg:'rgba(88,101,242,0.35)', color:'#5865F2', d:'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z'},
                  {label:'LinkedIn',  href:'https://www.linkedin.com/in/pra-qen-045373402/', bg:'rgba(10,102,194,0.35)', color:'#0A66C2', d:'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'},
                ].map(({label,href,bg,color,d})=>(
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:scale-110 transition-transform"
                    style={{backgroundColor:bg}}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill={color} aria-hidden="true">
                      <path d={d}/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Quick Links</p>
              <div className="space-y-2">
                {[
                  ['Buy Bitcoin',  '/buy-bitcoin'],
                  ['Sell Bitcoin', '/sell-bitcoin'],
                  ['My Trades',   '/my-trades'],
                  ['Settings',    '/settings'],
                  ['📧 hello@praqen.com', 'mailto:hello@praqen.com'],
                ].map(([l, h]) => (
                  <a key={l} href={h} className="block text-xs hover:text-white transition"
                    style={{ color: 'rgba(255,255,255,0.4)' }}>{l}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-4 border-t"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              © {new Date().getFullYear()} PRAQEN. All rights reserved.
            </p>
            <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <Shield size={10} /> Self-Custodial HD Wallet · 0.5% fee on trades
            </p>
          </div>
        </div>
      </footer>

      {selectedTx && <TxReceiptModal tx={selectedTx} onClose={() => setSelectedTx(null)}
          onRepeat={(username) => { setSelectedTx(null); setRepeatUsername(username); setShowInternal(true); }} />}
      {showSend && <WithdrawModal balance={availableBal} btcPrice={btcPrice} onClose={() => setShowSend(false)} onSend={sendBitcoin} kycStatus={userVerif} />}
      {showRecv && <ReceiveModal address={walletData?.address} network={network} onClose={() => setShowRecv(false)} />}
      {showInternal && (
        <InternalTransferModal
          balance={availableBal}
          btcPrice={btcPrice || 88000}
          displayCurrency={displayCurrency}
          fxRate={fxRate}
          currentUserId={user?.id}
          currentUser={user}
          initialUsername={repeatUsername}
          onClose={() => { setShowInternal(false); setRepeatUsername(null); }}
          onDone={(newBal) => {
            setWalletData(prev => prev ? { ...prev, available_btc: newBal, balance_btc: newBal } : prev);
            setShowInternal(false);
            setRepeatUsername(null);
            setTimeout(() => loadWallet(), 600);
          }}
        />
      )}
    </div>
  );
}
