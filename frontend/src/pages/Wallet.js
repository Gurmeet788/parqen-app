import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useRates } from '../contexts/RatesContext';
import {
  Copy, Bitcoin, RefreshCw, CheckCircle,
  ArrowDownLeft, ArrowUpRight, Shield, AlertTriangle,
  Clock, Eye, EyeOff, QrCode, Zap,
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

// ─── Withdraw Modal ────────────────────────────────────────────────────────────
function WithdrawModal({ balance, btcPrice, onClose, onSend }) {
  const [address,   setAddress]   = useState('');
  const [amount,    setAmount]    = useState('');   // BTC input
  const [usdAmount, setUsdAmount] = useState('');   // USD input
  const [inputMode, setInputMode] = useState('btc'); // 'btc' | 'usd'
  const [confirm,   setConfirm]   = useState(false);
  const [sending,   setSending]   = useState(false);

  const price  = btcPrice || 88000;

  // Derive btcAmt regardless of which input mode is active
  const btcAmt = inputMode === 'usd'
    ? parseFloat((parseFloat(usdAmount || 0) / price).toFixed(8))
    : parseFloat(amount || 0);

  const fee       = btcAmt * 0.001;
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

  const switchMode = (mode) => {
    setInputMode(mode);
    setAmount('');
    setUsdAmount('');
  };

  const handleSend = async () => {
    if (!valid) return;
    setSending(true);
    try { await onSend(address.trim(), btcAmt); onClose(); }
    finally { setSending(false); }
  };

  const fmtUsdVal = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl mb-16 sm:mb-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${C.danger}15` }}>
              <ArrowUpRight size={15} style={{ color: C.danger }} />
            </div>
            <div>
              <h2 className="font-black text-sm" style={{ color: C.g800 }}>Send Bitcoin</h2>
              <p className="text-xs" style={{ color: C.g400 }}>On-chain · ~10 min · 0.1% fee</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-100">
            <X size={14} style={{ color: C.g500 }} />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Balance */}
          <div className="flex items-center justify-between p-3 rounded-xl"
            style={{ backgroundColor: C.g50, border: `1px solid ${C.g200}` }}>
            <div>
              <p className="text-xs font-bold mb-0.5" style={{ color: C.g500 }}>Available Balance</p>
              <p className="font-black text-lg" style={{ color: C.green }}>₿ {fmt(balance)}</p>
            </div>
            <p className="text-xs font-bold" style={{ color: C.g400 }}>
              ≈ {fmtUsdVal(parseFloat(balance) * price)}
            </p>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: C.g700 }}>Recipient Bitcoin Address</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="bc1q… or 1… or 3… (Bitcoin mainnet only)"
              className="w-full px-4 py-3 text-sm border-2 rounded-xl focus:outline-none font-mono"
              style={{ borderColor: !address ? C.g200 : addrOk ? C.green : C.danger }} />
            {address.length > 5 && !addrOk && (
              <p className="text-xs mt-1 font-semibold" style={{ color: C.danger }}>
                Invalid address — mainnet only (bc1…, 1…, 3…). Testnet addresses not accepted.
              </p>
            )}
          </div>

          {/* Amount — with BTC / USD toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold" style={{ color: C.g700 }}>Amount</label>
              {/* Toggle pill */}
              <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
                {['btc', 'usd'].map(mode => (
                  <button key={mode} onClick={() => switchMode(mode)}
                    className="px-3 py-1 text-xs font-black transition"
                    style={{
                      backgroundColor: inputMode === mode ? C.forest : 'transparent',
                      color: inputMode === mode ? '#fff' : C.g500,
                    }}>
                    {mode === 'btc' ? '₿ BTC' : '$ USD'}
                  </button>
                ))}
              </div>
            </div>

            {inputMode === 'btc' ? (
              /* BTC input */
              <div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-sm"
                    style={{ color: C.g400 }}>₿</span>
                  <input type="number" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00000000" step="0.00000001"
                    className="w-full pl-7 pr-14 py-3 text-sm border-2 rounded-xl focus:outline-none"
                    style={{ borderColor: !amount ? C.g200 : hasEnough ? C.green : C.danger }} />
                  <button onClick={() => setAmount((parseFloat(balance || 0) * 0.999).toFixed(8))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black px-2 py-1 rounded-lg"
                    style={{ backgroundColor: `${C.green}15`, color: C.green }}>MAX</button>
                </div>
                {/* USD preview */}
                {btcAmt > 0 && (
                  <p className="text-xs mt-1 font-bold" style={{ color: C.g400 }}>
                    ≈ {fmtUsdVal(btcAmt * price)} USD
                  </p>
                )}
              </div>
            ) : (
              /* USD input */
              <div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-sm"
                    style={{ color: C.g400 }}>$</span>
                  <input type="number" value={usdAmount}
                    onChange={e => setUsdAmount(e.target.value)}
                    placeholder="0.00" min="0"
                    className="w-full pl-7 pr-4 py-3 text-sm border-2 rounded-xl focus:outline-none"
                    style={{ borderColor: !usdAmount ? C.g200 : hasEnough ? C.green : C.danger }} />
                </div>
                {/* BTC preview */}
                {parseFloat(usdAmount) > 0 && (
                  <p className="text-xs mt-1 font-bold" style={{ color: C.green }}>
                    ≈ ₿ {btcAmt.toFixed(8)}
                  </p>
                )}
              </div>
            )}

            {btcAmt > 0 && !hasEnough && (
              <p className="text-xs mt-1 font-semibold" style={{ color: C.danger }}>
                Insufficient balance — need ₿ {fmt(total)} ({fmtUsdVal(totalUsd)}) incl. fee
              </p>
            )}
          </div>

          {/* Breakdown */}
          {btcAmt > 0 && (
            <div className="space-y-2 p-3 rounded-xl" style={{ backgroundColor: `${C.green}08`, border: `1px solid ${C.green}20` }}>
              {[
                { label: 'Amount',              btc: btcAmt,  usd: btcAmt * price },
                { label: 'Network fee (~0.1%)', btc: fee,     usd: fee * price    },
                { label: 'Total deducted',      btc: total,   usd: totalUsd, bold: true },
              ].map(({ label, btc, usd, bold }) => (
                <div key={label} className="flex justify-between items-center text-xs">
                  <span style={{ color: C.g500 }}>{label}</span>
                  <div className="text-right">
                    <span className={bold ? 'font-black' : 'font-semibold'}
                      style={{ color: bold ? C.forest : C.g700 }}>₿ {fmt(btc)}</span>
                    <span className="ml-1.5 font-medium" style={{ color: C.g400 }}>
                      ({fmtUsdVal(usd)})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Confirm checkbox */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)}
              className="mt-0.5 accent-green-600" />
            <p className="text-xs font-semibold" style={{ color: C.g600 }}>
              I confirm this address is correct. Bitcoin transactions cannot be reversed.
            </p>
          </label>

          {/* Send button */}
          <button onClick={handleSend} disabled={!valid || !confirm || sending}
            className="w-full py-3.5 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition"
            style={{ backgroundColor: C.danger }}>
            {sending
              ? <><RefreshCw size={14} className="animate-spin" /> Sending…</>
              : <><ArrowUpRight size={14} /> Send {btcAmt > 0 ? `₿ ${fmt(btcAmt)} (${fmtUsdVal(btcAmt * price)})` : 'Bitcoin'}</>}
          </button>

          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <AlertTriangle size={12} style={{ color: C.warn, flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
              Double-check the address. Sending to the wrong address results in permanent loss of funds.
            </p>
          </div>
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

// ─── Transaction Row ───────────────────────────────────────────────────────────
function TxRow({ tx }) {
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
    <div className="flex items-center gap-3 py-3 border-b last:border-0" style={{ borderColor: C.g100 }}>
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
            {tx.notes || (txHash ? `${txHash.slice(0, 14)}…` : fmtAge(tx.created_at))}
          </p>
          {txHash && !isInternal && (
            <a href={`${explorerBase}/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-bold flex-shrink-0 hover:underline"
              style={{ color: C.paid }}>↗</a>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-black" style={{ color }}>
          {isSend ? '−' : '+'}₿{fmt(Math.abs(tx.amount_btc || 0))}
        </p>
        <p className="text-xs" style={{ color: C.g400 }}>{fmtAge(tx.created_at)}</p>
      </div>
    </div>
  );
}

const CURRENCY_SYMBOLS = { USD:'$', GBP:'£', EUR:'€', GHS:'₵', NGN:'₦', KES:'KSh ', ZAR:'R ' };

// ─── Internal Transfer Modal ───────────────────────────────────────────────────
function InternalTransferModal({ balance, btcPrice, displayCurrency, fxRate, currentUserId, onClose, onDone }) {
  const [step,        setStep]        = useState('form'); // 'form' | 'confirm' | 'success'
  const [username,    setUsername]    = useState('');
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

  const findUser = async () => {
    const q = username.trim().replace(/^@/, '');
    if (!q) return;
    setLooking(true); setLookupError(''); setRecipient(null);
    try {
      const r = await axios.get(`${API_URL}/users/${encodeURIComponent(q)}`, { headers: authH() });
      const u = r.data?.user || r.data;
      if (!u?.id) { setLookupError('User not found on PRAQEN.'); return; }
      if (String(u.id) === String(currentUserId)) { setLookupError('You cannot send to yourself.'); return; }
      setRecipient(u);
    } catch {
      setLookupError('User not found on PRAQEN.');
    } finally { setLooking(false); }
  };

  const send = async () => {
    if (!recipient || btcAmount <= 0 || !hasEnough) return;
    setSending(true);
    try {
      const r = await axios.post(`${API_URL}/wallet/internal-transfer`,
        { toUsername: recipient.username, amountBtc: btcAmount },
        { headers: authH() }
      );
      toast.success(`₿${btcAmount.toFixed(8)} sent to @${recipient.username} — free & instant!`);
      onDone(r.data.new_balance);
      setStep('success');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Transfer failed. Please try again.');
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl mb-16 sm:mb-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${C.paid}15` }}>
              <Users size={15} style={{ color: C.paid }} />
            </div>
            <div>
              <h2 className="font-black text-sm" style={{ color: C.g800 }}>Send to PRAQEN User</h2>
              <p className="text-xs" style={{ color: C.g400 }}>⚡ Instant · 🎁 Free · No network fees</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-100">
            <X size={14} style={{ color: C.g500 }} />
          </button>
        </div>

        {/* ── SUCCESS ── */}
        {step === 'success' && (
          <div className="p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
              style={{ backgroundColor: `${C.success}15` }}>
              <CheckCircle size={32} style={{ color: C.success }} />
            </div>
            <div>
              <p className="font-black text-xl" style={{ color: C.forest }}>Transfer Complete!</p>
              <p className="text-sm mt-2" style={{ color: C.g500 }}>
                ₿{btcAmount.toFixed(8)} sent to <span className="font-black" style={{ color: C.forest }}>@{recipient?.username}</span>
              </p>
              <p className="text-xs mt-1 font-bold" style={{ color: C.success }}>Instant &amp; Free — no fees deducted</p>
            </div>
            <button onClick={onClose}
              className="w-full py-3 rounded-xl text-white font-black text-sm hover:opacity-90"
              style={{ backgroundColor: C.green }}>
              Done
            </button>
          </div>
        )}

        {/* ── CONFIRM ── */}
        {step === 'confirm' && (
          <div className="p-5 space-y-4">
            <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
              <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: C.g100 }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-white text-base flex-shrink-0"
                  style={{ backgroundColor: C.green }}>
                  {(recipient?.username || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-black text-sm" style={{ color: C.forest }}>@{recipient?.username}</p>
                  <p className="text-xs" style={{ color: C.g400 }}>
                    {recipient?.badge ? `${recipient.badge} · ` : ''}{recipient?.total_trades || 0} trades
                    {recipient?.country ? ` · ${recipient.country}` : ''}
                  </p>
                </div>
              </div>
              {[
                { label: 'You send',      val: `${sym}${localNum.toLocaleString()} ${displayCurrency}`, bold: true },
                { label: '≈ BTC',         val: `₿ ${btcAmount.toFixed(8)}` },
                { label: 'Network fee',   val: '₿ 0.00000000', green: true, tag: 'FREE' },
                { label: 'They receive',  val: `₿ ${btcAmount.toFixed(8)}`, bold: true },
              ].map(({ label, val, bold, green, tag }) => (
                <div key={label} className="flex justify-between items-center text-xs">
                  <span style={{ color: C.g500 }}>{label}</span>
                  <div className="flex items-center gap-1.5">
                    {tag && <span className="font-black px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${C.success}15`, color: C.success, fontSize: 9 }}>{tag}</span>}
                    <span className={bold ? 'font-black' : 'font-semibold'} style={{ color: green ? C.success : bold ? C.forest : C.g700 }}>{val}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep('form')}
                className="flex-1 py-3 rounded-xl border font-bold text-sm hover:bg-gray-50 transition"
                style={{ borderColor: C.g200, color: C.g600 }}>
                Back
              </button>
              <button onClick={send} disabled={sending}
                className="flex-1 py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition"
                style={{ backgroundColor: C.paid }}>
                {sending
                  ? <><RefreshCw size={14} className="animate-spin" /> Sending…</>
                  : <><Zap size={14} /> Confirm Send</>}
              </button>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: `1px solid ${C.paid}20` }}>
              <Shield size={12} style={{ color: C.paid, flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs font-semibold text-blue-700">
                Instant &amp; irreversible. Double-check the username before confirming.
              </p>
            </div>
          </div>
        )}

        {/* ── FORM ── */}
        {step === 'form' && (
          <div className="p-5 space-y-4">
            {/* Balance */}
            <div className="p-3 rounded-xl" style={{ backgroundColor: C.g50, border: `1px solid ${C.g200}` }}>
              <p className="text-xs font-bold mb-0.5" style={{ color: C.g500 }}>Available Balance</p>
              <p className="font-black text-lg" style={{ color: C.green }}>₿ {fmt(balance)}</p>
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: C.g700 }}>
                Recipient's PRAQEN Username
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm" style={{ color: C.g400 }}>@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={e => { setUsername(e.target.value.replace(/^@/, '')); setRecipient(null); setLookupError(''); }}
                    onKeyDown={e => e.key === 'Enter' && findUser()}
                    placeholder="username"
                    className="w-full pl-7 pr-4 py-3 text-sm border-2 rounded-xl focus:outline-none"
                    style={{ borderColor: recipient ? C.green : lookupError ? C.danger : C.g200 }}
                  />
                </div>
                <button onClick={findUser} disabled={!username.trim() || looking}
                  className="px-4 py-3 rounded-xl text-white font-black text-xs flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40 transition"
                  style={{ backgroundColor: C.green }}>
                  {looking ? <RefreshCw size={12} className="animate-spin" /> : <><Search size={12} /> Find</>}
                </button>
              </div>
              {lookupError && (
                <p className="text-xs mt-1 font-semibold" style={{ color: C.danger }}>{lookupError}</p>
              )}
            </div>

            {/* Recipient card */}
            {recipient && (
              <div className="flex items-center gap-3 p-3 rounded-xl border"
                style={{ borderColor: `${C.success}30`, backgroundColor: `${C.success}08` }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white flex-shrink-0"
                  style={{ backgroundColor: C.green }}>
                  {recipient.username[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm" style={{ color: C.forest }}>@{recipient.username}</p>
                  <p className="text-xs truncate" style={{ color: C.g400 }}>
                    {recipient.badge ? `${recipient.badge} · ` : ''}{recipient.total_trades || 0} trades
                    {recipient.country ? ` · ${recipient.country}` : ''}
                  </p>
                </div>
                <CheckCircle size={16} style={{ color: C.success, flexShrink: 0 }} />
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: C.g700 }}>
                Amount to Send ({displayCurrency})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm" style={{ color: C.g500 }}>{sym}</span>
                <input
                  type="number"
                  value={localAmount}
                  onChange={e => setLocalAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  className="w-full pl-8 pr-4 py-3 text-sm border-2 rounded-xl focus:outline-none"
                  style={{ borderColor: !localAmount ? C.g200 : hasEnough ? C.green : C.danger }}
                />
              </div>
              {localNum > 0 && (
                <p className="text-xs mt-1 font-bold" style={{ color: C.green }}>
                  ≈ ₿ {btcAmount.toFixed(8)}
                </p>
              )}
              {localNum > 0 && !hasEnough && (
                <p className="text-xs mt-0.5 font-semibold" style={{ color: C.danger }}>
                  Insufficient balance — you only have ₿ {fmt(balance)}
                </p>
              )}
            </div>

            {/* Free badge */}
            <div className="flex items-center gap-2 p-3 rounded-xl"
              style={{ backgroundColor: `${C.success}08`, border: `1px solid ${C.success}20` }}>
              <Zap size={12} style={{ color: C.success }} />
              <p className="text-xs font-bold" style={{ color: C.success }}>
                ⚡ Instant & FREE — no network fees, no blockchain wait
              </p>
            </div>

            <button
              onClick={() => setStep('confirm')}
              disabled={!recipient || !hasEnough || btcAmount <= 0}
              className="w-full py-3.5 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition"
              style={{ backgroundColor: C.paid }}>
              <ArrowUpRight size={14} /> Review Transfer
            </button>
          </div>
        )}
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
  const [displayCurrency,  setDisplayCurrency]  = useState(localStorage.getItem('praqen_currency') || 'USD');

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
  }, []);

  // ── Load wallet from HD wallet endpoint ────────────────────────────────────
  const loadWallet = async () => {
    try {
      const r = await axios.get(`${API_URL}/hd-wallet/wallet`, { headers: authH() });
      setWalletData({
        address:       r.data.address,
        balance_btc:   r.data.balance_btc,
        locked_btc:    r.data.locked_btc    || 0,
        available_btc: r.data.available_btc || r.data.balance_btc,
        balance_usd:   parseFloat(r.data.balance_usd || 0),
        network:       r.data.network,
        has_address:   r.data.has_address,
      });
      setLockedBtc(r.data.locked_btc || 0);
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
  const sendBitcoin = async (toAddress, amountBtc) => {
    try {
      const r = await axios.post(`${API_URL}/hd-wallet/send`,
        { toAddress, amountBtc },
        { headers: authH() }
      );
      toast.success(`₿${fmt(amountBtc)} sent! TX: ${r.data.txid?.slice(0,12)}…`);
      await loadWallet();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to send Bitcoin');
      throw e;
    }
  };

  const balance      = parseFloat(walletData?.balance_btc   || 0); // total (available + locked)
  const lockedBal    = parseFloat(lockedBtc                 || 0);
  const availableBal = parseFloat(walletData?.available_btc ?? balance); // already deducted server-side
  // Always compute USD from live BTC price — the DB balance_usd column can be stale or 0
  const balUsd       = balance * (btcPrice || 88000);
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
                  <p className="text-white font-black text-sm">Bitcoin Wallet</p>
                  <p className="text-white/60 text-xs">{user?.username} · Live Balance</p>
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
                  <p className="text-white/70 text-sm mt-1">≈ {fmtLocal(balUsd)}</p>

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
                        <p className="text-white/80 text-xs font-bold">₿ {fmt(balance)}</p>
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
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Receive',  icon: ArrowDownLeft, color: C.success, action: () => setShowRecv(true)     },
                { label: 'Send',     icon: ArrowUpRight,  color: C.danger,  action: () => setShowSend(true)     },
                { label: 'Transfer', icon: Users,         color: C.paid,    action: () => setShowInternal(true) },
                { label: 'Check',    icon: Zap,           color: C.gold,    action: checkDeposit                },
              ].map(({ label, icon: Icon, color, action }) => (
                <button key={label} onClick={action}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl hover:opacity-90 transition"
                  style={{ backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${color}25` }}>
                    <Icon size={15} style={{ color }} />
                  </div>
                  <span className="text-white text-xs font-bold">{label}</span>
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
              transactions.map((tx, i) => <TxRow key={tx.id || i} tx={tx} />)
            )}
          </div>
        </div>

        {/* ── SUPPORT ──────────────────────────────────────────────── */}
        <a href="https://chat.whatsapp.com/LHVjrw9SK8qGoXcKvprjWz?mode=gi_t"
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-between p-4 rounded-2xl border hover:bg-gray-50 transition"
          style={{ borderColor: C.g200, backgroundColor: 'white' }}>
          <div className="flex items-center gap-3">
            <span className="text-xl">💬</span>
            <div>
              <p className="text-sm font-black" style={{ color: C.g800 }}>Need wallet help?</p>
              <p className="text-xs" style={{ color: C.g400 }}>Reach PRAQEN support on WhatsApp</p>
            </div>
          </div>
          <ChevronRight size={15} style={{ color: C.g400 }} />
        </a>
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
                  {label:'WhatsApp',  href:'https://chat.whatsapp.com/LHVjrw9SK8qGoXcKvprjWz?mode=gi_t', bg:'rgba(37,211,102,0.25)', color:'#25D366', d:'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z'},
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
                  ['📧 support@praqen.com', 'mailto:support@praqen.com'],
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

      {showSend && <WithdrawModal balance={availableBal} btcPrice={btcPrice} onClose={() => setShowSend(false)} onSend={sendBitcoin} />}
      {showRecv && <ReceiveModal address={walletData?.address} network={network} onClose={() => setShowRecv(false)} />}
      {showInternal && (
        <InternalTransferModal
          balance={availableBal}
          btcPrice={btcPrice || 88000}
          displayCurrency={displayCurrency}
          fxRate={fxRate}
          currentUserId={user?.id}
          onClose={() => setShowInternal(false)}
          onDone={(newBal) => {
            setWalletData(prev => prev ? { ...prev, available_btc: newBal, balance_btc: newBal } : prev);
            setShowInternal(false);
            loadWallet();
          }}
        />
      )}
    </div>
  );
}
