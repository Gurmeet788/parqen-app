import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  MessageCircle, X, Send, RefreshCw, ChevronLeft,
  Lightbulb, CheckCircle, User, Bot, Headphones,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const authH = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// ── Topics shown on home screen ───────────────────────────────────────────────
const TOPICS = [
  { id: 'buy',     label: 'Buy Bitcoin',       emoji: '🟠', cat: 'general',  color: '#1B4332', bg: '#F0FDF4' },
  { id: 'sell',    label: 'Sell Bitcoin',       emoji: '💰', cat: 'general',  color: '#D97706', bg: '#FFFBEB' },
  { id: 'trade',   label: 'Trade Issue',        emoji: '🔄', cat: 'trade',    color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'payment', label: 'Payment Problem',    emoji: '💳', cat: 'payment',  color: '#0D9488', bg: '#F0FDFA' },
  { id: 'account', label: 'My Account',         emoji: '👤', cat: 'account',  color: '#2563EB', bg: '#EFF6FF' },
  { id: 'wallet',  label: 'Wallet / Balance',   emoji: '👛', cat: 'general',  color: '#EA580C', bg: '#FFF7ED' },
  { id: 'kyc',     label: 'Verification / KYC', emoji: '🪪', cat: 'account',  color: '#6D28D9', bg: '#F5F3FF' },
  { id: 'other',   label: 'Something else',     emoji: '💬', cat: 'other',    color: '#475569', bg: '#F8FAFC' },
];

// ── Suggestion categories ─────────────────────────────────────────────────────
const SUG_CATS = [
  { id: 'feature',     label: 'Feature Request', emoji: '💡' },
  { id: 'improvement', label: 'Improvement',      emoji: '⚡' },
  { id: 'trading',     label: 'Trading Tip',      emoji: '📈' },
  { id: 'bug',         label: 'Bug Report',       emoji: '🐛' },
  { id: 'other',       label: 'Other',            emoji: '💬' },
];

// ── Bold + newline renderer ───────────────────────────────────────────────────
function Msg({ text }) {
  return (
    <>
      {text.split('\n').map((line, i, arr) => {
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <span key={i}>
            {parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}
            {i < arr.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function Typing() {
  return (
    <div className="flex justify-start">
      <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
        style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
        <Bot size={13} color="white" />
      </div>
      <div className="px-4 py-3 rounded-2xl bg-white shadow-sm" style={{ borderRadius: '4px 18px 18px 18px' }}>
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: '#94A3B8', animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function SuggestionsPanel({ user }) {
  const [open, setOpen]       = useState(false);
  // mode: 'home' | 'ticket' | 'chat' | 'suggest'
  const [mode, setMode]       = useState('home');
  const [topic, setTopic]     = useState(null);

  // ── Ticket creation form ───────────────────────────────────────────────────
  const [ticketMsg, setTicketMsg]     = useState('');
  const [ticketSubject, setTicketSubj]= useState('');
  const [creating, setCreating]       = useState(false);

  // ── Chat state (after ticket created) ─────────────────────────────────────
  const [ticket, setTicket]       = useState(null);
  const [chatMsgs, setChatMsgs]   = useState([]); // support ticket messages
  const [aiMsgs, setAiMsgs]       = useState([]); // AI messages (local only)
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying]   = useState(false);
  const [aiLoading, setAiLoad]    = useState(false);
  const pollRef    = useRef(null);
  const chatRef    = useRef(null);
  const replyRef   = useRef(null);

  // ── Suggestion form ────────────────────────────────────────────────────────
  const [sugTitle, setSugTitle] = useState('');
  const [sugBody, setSugBody]   = useState('');
  const [sugCat, setSugCat]     = useState('feature');
  const [sugPosting, setSugPost]= useState(false);
  const [sugDone, setSugDone]   = useState(false);

  // ── Scroll chat to bottom on new messages ─────────────────────────────────
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMsgs, aiMsgs, aiLoading]);

  // ── Stop polling when leaving chat ────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'chat' && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [mode]);

  // ── Reset everything when panel re-opens ──────────────────────────────────
  const goHome = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setMode('home');
    setTopic(null);
    setTicketMsg(''); setTicketSubj('');
    setReplyText('');
  };

  const openPanel = () => {
    if (!open) setMode('home');
    setOpen(o => !o);
  };

  // ── Pick a topic → go to ticket form ──────────────────────────────────────
  const pickTopic = (t) => {
    setTopic(t);
    setTicketSubj(`Help with ${t.label}`);
    setTicketMsg('');
    setMode('ticket');
  };

  // ── Poll ticket messages ───────────────────────────────────────────────────
  const startPolling = useCallback((ticketId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API_URL}/support/tickets/${ticketId}/messages`, { headers: authH() });
        const incoming = r.data.messages || [];
        setChatMsgs(prev => incoming.length !== prev.length ? incoming : prev);
      } catch {}
    }, 5000);
  }, []);

  // ── Fetch AI response ──────────────────────────────────────────────────────
  const fetchAI = async (message, topicObj) => {
    setAiLoad(true);
    try {
      const res = await fetch(`${API_URL}/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({
          message,
          section: topicObj?.id || null,
          history: [],
          user: user ? { username: user.username, id: user.id } : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAiMsgs(prev => [...prev, {
        role: 'ai',
        text: data.reply || 'I\'m here to help. A support agent can also reply to your ticket.',
      }]);
    } catch (err) {
      console.warn('[AI chat]', err.message);
      // Use local keyword fallback so the user always gets a response
      const q = (message || '').toLowerCase();
      const sec = topicObj?.id || topic?.id || '';
      let fallback = '';
      if (sec === 'buy' || q.includes('buy'))       fallback = 'To **buy Bitcoin**, browse seller offers on the **Buy BTC** page. Click any offer, then the seller locks BTC in escrow before you send payment.';
      else if (sec === 'sell' || q.includes('sell')) fallback = 'To **sell Bitcoin**, go to the **Sell BTC** page and browse buyer offers, or create your own listing. Your BTC balance must be above $10 for your offer to appear.';
      else if (sec === 'trade' || q.includes('trade') || q.includes('dispute')) fallback = 'For trade issues, open the trade from **My Trades** and click **Raise Dispute**. Moderators review within 24 hours. Never release escrow until you confirm payment received.';
      else if (sec === 'payment' || q.includes('payment')) fallback = 'Payments go directly between you and the trader. Always use the method shown in the trade and keep your receipt as proof.';
      else if (sec === 'account' || q.includes('account') || q.includes('password')) fallback = 'For account issues, visit **Settings** to update your profile or change your password. Use **Forgot Password** on the login page if you\'re locked out.';
      else if (sec === 'wallet' || q.includes('wallet') || q.includes('balance')) fallback = 'Your **Wallet** holds Bitcoin. You can deposit to your PRAQEN address or withdraw to any external Bitcoin address. Locked balance is BTC held in active trades.';
      else if (sec === 'kyc' || q.includes('kyc') || q.includes('verif')) fallback = 'To verify your identity, go to **Profile → Verification** and upload a government-issued ID. KYC unlocks higher limits and builds trust.';
      else fallback = 'Thanks for reaching out! Your ticket has been created and our support team will reply soon. You can also check our **FAQ** page for quick answers.';
      setAiMsgs(prev => [...prev, { role: 'ai', text: fallback }]);
    } finally {
      setAiLoad(false);
      setTimeout(() => replyRef.current?.focus(), 200);
    }
  };

  // ── Create ticket ──────────────────────────────────────────────────────────
  const createTicket = async () => {
    if (!ticketMsg.trim()) return toast.error('Please describe your issue');
    if (!user) return toast.info('Please log in to create a support ticket');
    setCreating(true);
    try {
      const r = await axios.post(`${API_URL}/support/tickets`, {
        subject: ticketSubject.trim() || `Help with ${topic?.label || 'General'}`,
        category: topic?.cat || 'general',
        message: ticketMsg.trim(),
      }, { headers: authH() });

      const newTicket = r.data.ticket;
      setTicket(newTicket);

      // Load initial messages
      const msgsRes = await axios.get(`${API_URL}/support/tickets/${newTicket.id}/messages`, { headers: authH() });
      const initialMsgs = msgsRes.data.messages || [];
      setChatMsgs(initialMsgs);
      setAiMsgs([]);
      setMode('chat');

      // Start polling + get AI first response
      startPolling(newTicket.id);
      fetchAI(ticketMsg.trim(), topic);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create ticket. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  // ── Reply in ticket chat ───────────────────────────────────────────────────
  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || replying || !ticket) return;
    setReplying(true);
    setReplyText('');
    try {
      const r = await axios.post(`${API_URL}/support/tickets/${ticket.id}/messages`, { message: text }, { headers: authH() });
      setChatMsgs(prev => [...prev, r.data.message]);
      // Get AI response too
      fetchAI(text, topic);
    } catch (e) {
      setReplyText(text);
      toast.error(e.response?.data?.error || 'Failed to send');
    } finally {
      setReplying(false);
    }
  };

  // ── Submit suggestion ──────────────────────────────────────────────────────
  const submitSuggestion = async () => {
    if (!sugTitle.trim()) return toast.error('Please enter a title');
    if (!user) return toast.info('Please log in to submit a suggestion');
    setSugPost(true);
    try {
      await axios.post(`${API_URL}/suggestions`, {
        title: sugTitle.trim(), body: sugBody.trim(), category: sugCat,
      }, { headers: authH() });
      setSugDone(true);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit. Please try again.');
    } finally { setSugPost(false); }
  };

  // ── Header labels ──────────────────────────────────────────────────────────
  const headerTitle = mode === 'ticket' ? `${topic?.emoji || '💬'} ${topic?.label || 'Support'}` :
    mode === 'chat' ? 'Support Chat' :
    mode === 'suggest' ? 'Drop a Suggestion' : 'How can we help?';
  const headerSub = mode === 'ticket' ? 'Create a ticket to get help' :
    mode === 'chat' ? `Ticket #${ticket?.id?.slice(0,8) || '…'} · Open` :
    mode === 'suggest' ? 'Share your ideas with our team' : 'Choose a topic below';

  // ── Merge + sort chat messages for display ─────────────────────────────────
  // chatMsgs = real ticket messages, aiMsgs = local AI replies
  // We interleave them by index: user msg → ai reply → user msg → ai reply…
  const buildChatTimeline = () => {
    const timeline = [];
    const userMsgs = chatMsgs.filter(m => m.sender_type === 'user');
    const adminMsgs = chatMsgs.filter(m => m.sender_type !== 'user');
    // Add all ticket messages in order
    chatMsgs.forEach(m => timeline.push({ type: 'ticket', data: m }));
    // Add AI messages
    aiMsgs.forEach(m => timeline.push({ type: 'ai', data: m }));
    return timeline;
  };

  return (
    <>
      {/* ── Floating button ── */}
      <button onClick={openPanel}
        className="fixed z-50 flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95"
        style={{
          bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg,#1B4332,#2D6A4F)',
          border: '3px solid rgba(255,255,255,0.18)',
          boxShadow: '0 8px 32px rgba(27,67,50,0.45)',
        }}>
        {open ? <X size={22} color="white" />
          : <MessageCircle size={24} color="white" fill="rgba(255,255,255,0.15)" />}
        {!open && <span className="absolute w-full h-full rounded-full animate-ping"
          style={{ backgroundColor: 'rgba(45,106,79,0.35)' }} />}
      </button>

      {/* ── Chat popup ── */}
      {open && (
        <div className="fixed z-50 flex flex-col"
          style={{
            bottom: 92, right: 16,
            width: 'min(390px, calc(100vw - 32px))',
            height: 'min(590px, calc(100vh - 120px))',
            borderRadius: 20, backgroundColor: '#fff',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
            border: '1.5px solid #E2E8F0', overflow: 'hidden',
          }}>

          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
            {mode !== 'home' && (
              <button onClick={goHome}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-white/20 flex-shrink-0"
                style={{ color: 'rgba(255,255,255,0.8)' }}>
                <ChevronLeft size={16} />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              {mode === 'suggest' ? <Lightbulb size={18} color="white" />
                : mode === 'chat'   ? <Headphones size={18} color="white" />
                : <MessageCircle size={18} color="white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm text-white leading-none truncate">{headerTitle}</p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {mode === 'chat' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1 align-middle" />}
                {headerSub}
              </p>
            </div>
            <button onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-white/20"
              style={{ color: 'white' }}>
              <X size={15} />
            </button>
          </div>

          {/* ════════════ HOME ════════════ */}
          {mode === 'home' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ backgroundColor: '#F8FAFC' }}>
              <p className="text-xs font-semibold text-center" style={{ color: '#64748B' }}>
                👋 Hi{user ? ` ${user.username || user.full_name}` : ''}! What do you need help with?
              </p>

              {/* Topic grid */}
              <div className="grid grid-cols-2 gap-2">
                {TOPICS.map(t => (
                  <button key={t.id} onClick={() => pickTopic(t)}
                    className="flex items-center gap-2.5 px-3 py-3 rounded-2xl text-left transition hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]"
                    style={{ backgroundColor: '#fff', border: `1.5px solid ${t.color}20` }}>
                    <span className="text-xl flex-shrink-0">{t.emoji}</span>
                    <span className="text-xs font-black leading-tight" style={{ color: t.color }}>{t.label}</span>
                  </button>
                ))}
              </div>

              {/* Suggestion option */}
              <button onClick={() => { setMode('suggest'); setSugTitle(''); setSugBody(''); setSugCat('feature'); setSugDone(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition hover:shadow-md hover:-translate-y-0.5"
                style={{ backgroundColor: '#fff', border: '1.5px solid #FDE68A' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                  <Lightbulb size={16} color="white" />
                </div>
                <div>
                  <p className="text-xs font-black" style={{ color: '#92400E' }}>Drop a Suggestion</p>
                  <p className="text-[11px]" style={{ color: '#94A3B8' }}>Share ideas · Our team reads them all</p>
                </div>
              </button>
            </div>
          )}

          {/* ════════════ TICKET FORM ════════════ */}
          {mode === 'ticket' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>

              {/* Topic badge */}
              <div className="flex items-center gap-2 p-3 rounded-xl"
                style={{ backgroundColor: topic?.bg || '#F0FDF4', border: `1.5px solid ${topic?.color || '#1B4332'}20` }}>
                <span className="text-lg">{topic?.emoji}</span>
                <div>
                  <p className="text-xs font-black" style={{ color: topic?.color }}>{topic?.label}</p>
                  <p className="text-[11px]" style={{ color: '#64748B' }}>Fill in the form below to create your ticket</p>
                </div>
              </div>

              {/* User account info */}
              {user ? (
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#F0FDF4' }}>
                    {user.avatar_url
                      ? <img src={user.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
                      : <User size={16} color="#1B4332" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate" style={{ color: '#1E293B' }}>
                      {user.full_name || user.username}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: '#64748B' }}>
                      @{user.username} · {user.email}
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#D1FAE5', color: '#1B4332' }}>✓ Verified</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: '#FEF2F2', border: '1.5px solid #FECACA' }}>
                  <User size={16} color="#DC2626" />
                  <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>
                    You must be logged in to create a support ticket.
                  </p>
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  Subject
                </label>
                <input value={ticketSubject} onChange={e => setTicketSubj(e.target.value)}
                  placeholder={`Help with ${topic?.label || 'issue'}…`}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none transition"
                  style={{ borderColor: ticketSubject ? '#1B4332' : '#E2E8F0', backgroundColor: '#fff' }} />
              </div>

              {/* Message */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  Describe your issue *
                </label>
                <textarea value={ticketMsg} onChange={e => setTicketMsg(e.target.value)}
                  placeholder={`Tell us about your ${topic?.label?.toLowerCase() || 'issue'} in detail…`}
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none resize-none transition"
                  style={{ borderColor: ticketMsg ? '#1B4332' : '#E2E8F0', backgroundColor: '#fff' }} />
                <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>
                  Include trade IDs, amounts, or screenshots if relevant
                </p>
              </div>

              <button onClick={createTicket}
                disabled={creating || !ticketMsg.trim() || !user}
                className="w-full py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                {creating
                  ? <><RefreshCw size={14} className="animate-spin" />Creating ticket…</>
                  : <><Send size={14} />Create Ticket & Send</>}
              </button>

              <p className="text-[10px] text-center" style={{ color: '#CBD5E1' }}>
                Your account details are sent with the ticket so we can help you faster
              </p>
            </div>
          )}

          {/* ════════════ CHAT (after ticket created) ════════════ */}
          {mode === 'chat' && (
            <>
              {/* Ticket info bar */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b"
                style={{ borderColor: '#E2E8F0', backgroundColor: '#F0FDF4' }}>
                <div className="min-w-0">
                  <p className="text-xs font-black truncate" style={{ color: '#1B4332' }}>
                    {ticket?.subject}
                  </p>
                  <p className="text-[10px]" style={{ color: '#64748B' }}>
                    {topic?.emoji} {topic?.label} · Ticket open · AI + human support
                  </p>
                </div>
                <button onClick={goHome} className="text-[11px] font-bold flex-shrink-0 ml-2" style={{ color: '#94A3B8' }}>
                  New
                </button>
              </div>

              {/* Messages */}
              <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
                style={{ backgroundColor: '#F8FAFC' }}>

                {/* Merge: ticket messages + AI messages interleaved */}
                {(() => {
                  // Build unified timeline
                  const timeline = [];
                  // Group: for each user message, show it + the corresponding AI reply
                  const userMsgs = chatMsgs.filter(m => m.sender_type === 'user');
                  const agentMsgs = chatMsgs.filter(m => m.sender_type !== 'user');

                  // All ticket messages first
                  chatMsgs.forEach((m, i) => {
                    const isUser = m.sender_type === 'user';
                    timeline.push(
                      <div key={`t-${i}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                        {!isUser && (
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                            style={{ background: 'linear-gradient(135deg,#1D4ED8,#3B82F6)' }}>
                            <Headphones size={12} color="white" />
                          </div>
                        )}
                        <div className="px-3 py-2.5 text-sm leading-relaxed"
                          style={{
                            maxWidth: '80%',
                            backgroundColor: isUser ? '#1B4332' : '#fff',
                            color: isUser ? 'white' : '#1E293B',
                            borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                          }}>
                          <p className="text-[10px] font-bold mb-1 opacity-60">
                            {isUser ? (user?.username || 'You') : (m.sender_name || 'Support')}
                          </p>
                          <p>{m.message}</p>
                        </div>
                      </div>
                    );
                  });

                  // AI messages
                  aiMsgs.forEach((m, i) => (
                    timeline.push(
                      <div key={`ai-${i}`} className="flex justify-start">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                          style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                          <Bot size={12} color="white" />
                        </div>
                        <div className="px-3 py-2.5 text-sm leading-relaxed"
                          style={{
                            maxWidth: '80%', backgroundColor: '#fff', color: '#1E293B',
                            borderRadius: '4px 18px 18px 18px',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                          }}>
                          <p className="text-[10px] font-bold mb-1 opacity-60">PRAQEN AI</p>
                          <Msg text={m.text} />
                        </div>
                      </div>
                    )
                  ));

                  return timeline;
                })()}

                {/* Ticket created notice */}
                {chatMsgs.length === 0 && aiMsgs.length === 0 && !aiLoading && (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: '#D1FAE5' }}>
                      <CheckCircle size={20} color="#1B4332" />
                    </div>
                    <p className="text-xs font-black" style={{ color: '#1B4332' }}>Ticket created!</p>
                    <p className="text-[11px]" style={{ color: '#64748B' }}>
                      Our team has been notified. AI is typing a quick response…
                    </p>
                  </div>
                )}

                {aiLoading && <Typing />}
                <div style={{ float: 'left', clear: 'both' }} />
              </div>

              {/* Reply input */}
              <div className="flex-shrink-0 px-3 py-3 border-t flex gap-2 items-end"
                style={{ borderColor: '#E2E8F0', backgroundColor: '#fff' }}>
                <textarea ref={replyRef} value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="Reply to your ticket…" rows={1}
                  className="flex-1 px-3 py-2.5 rounded-xl text-sm resize-none focus:outline-none border-2 transition"
                  style={{ borderColor: replyText ? '#1B4332' : '#E2E8F0', maxHeight: 90, lineHeight: 1.4 }} />
                <button onClick={sendReply} disabled={!replyText.trim() || replying || aiLoading}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                  {replying
                    ? <RefreshCw size={15} color="white" className="animate-spin" />
                    : <Send size={15} color="white" />}
                </button>
              </div>
            </>
          )}

          {/* ════════════ SUGGESTION FORM ════════════ */}
          {mode === 'suggest' && (
            <div className="flex-1 overflow-y-auto px-4 py-4" style={{ backgroundColor: '#F8FAFC' }}>
              {sugDone ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-2">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                    <CheckCircle size={32} color="white" />
                  </div>
                  <div>
                    <p className="font-black text-base" style={{ color: '#92400E' }}>Thank you! 🙏</p>
                    <p className="text-sm mt-1 leading-relaxed" style={{ color: '#64748B' }}>
                      Your suggestion is sent to the PRAQEN team. We read every single one!
                    </p>
                  </div>
                  <button onClick={() => { setSugTitle(''); setSugBody(''); setSugCat('feature'); setSugDone(false); }}
                    className="px-5 py-2.5 rounded-xl font-black text-sm text-white transition hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                    Send Another
                  </button>
                  <button onClick={goHome} className="text-sm font-bold" style={{ color: '#94A3B8' }}>← Back</button>
                </div>
              ) : !user ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                  <Lightbulb size={40} style={{ color: '#94A3B8' }} />
                  <p className="font-black text-sm" style={{ color: '#334155' }}>Login required</p>
                  <p className="text-xs" style={{ color: '#64748B' }}>Please log in to submit a suggestion.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* User info */}
                  <div className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#FEF3C7' }}>
                      <User size={15} color="#D97706" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate" style={{ color: '#1E293B' }}>
                        {user.full_name || user.username}
                      </p>
                      <p className="text-[11px]" style={{ color: '#64748B' }}>@{user.username}</p>
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>Category</label>
                    <div className="flex flex-wrap gap-1.5">
                      {SUG_CATS.map(c => (
                        <button key={c.id} onClick={() => setSugCat(c.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold transition"
                          style={{
                            backgroundColor: sugCat === c.id ? '#D97706' : '#fff',
                            color: sugCat === c.id ? 'white' : '#475569',
                            border: `1.5px solid ${sugCat === c.id ? '#D97706' : '#E2E8F0'}`,
                          }}>
                          {c.emoji} {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>Title *</label>
                    <input value={sugTitle} onChange={e => setSugTitle(e.target.value)}
                      placeholder="Give your idea a short title…"
                      className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none transition"
                      style={{ borderColor: sugTitle ? '#D97706' : '#E2E8F0', backgroundColor: '#fff' }} />
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>Details (optional)</label>
                    <textarea value={sugBody} onChange={e => setSugBody(e.target.value)}
                      placeholder="Describe your idea…" rows={4}
                      className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none resize-none transition"
                      style={{ borderColor: sugBody ? '#D97706' : '#E2E8F0', backgroundColor: '#fff' }} />
                  </div>

                  <button onClick={submitSuggestion} disabled={sugPosting || !sugTitle.trim()}
                    className="w-full py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                    {sugPosting ? <><RefreshCw size={14} className="animate-spin" />Sending…</> : <><Send size={14} />Send Suggestion</>}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </>
  );
}
