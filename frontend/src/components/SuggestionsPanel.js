import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  MessageCircle, X, Send, RefreshCw, ChevronLeft,
  Lightbulb, CheckCircle, User, Bot, Headphones,
  Ticket, ArrowRight, Shield, Clock,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const authH = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// ── Topics ────────────────────────────────────────────────────────────────────
const TOPICS = [
  { id: 'buy',     label: 'Buy Bitcoin',       emoji: '🟠', cat: 'general',  color: '#1B4332', bg: '#F0FDF4',
    hint: 'Browse offers, start a trade, payment help' },
  { id: 'sell',    label: 'Sell Bitcoin',       emoji: '💰', cat: 'general',  color: '#D97706', bg: '#FFFBEB',
    hint: 'Create listings, find buyers, pricing help' },
  { id: 'trade',   label: 'Trade Issue',        emoji: '🔄', cat: 'trade',    color: '#7C3AED', bg: '#F5F3FF',
    hint: 'Stuck trade, dispute, escrow problem' },
  { id: 'payment', label: 'Payment Problem',    emoji: '💳', cat: 'payment',  color: '#0D9488', bg: '#F0FDFA',
    hint: 'MoMo, bank transfer, payment failed' },
  { id: 'account', label: 'My Account',         emoji: '👤', cat: 'account',  color: '#2563EB', bg: '#EFF6FF',
    hint: 'Login, password, profile settings' },
  { id: 'wallet',  label: 'Wallet / Balance',   emoji: '👛', cat: 'general',  color: '#EA580C', bg: '#FFF7ED',
    hint: 'Deposit, withdraw, balance mismatch' },
  { id: 'kyc',     label: 'Verification / KYC', emoji: '🪪', cat: 'account',  color: '#6D28D9', bg: '#F5F3FF',
    hint: 'ID upload, KYC review, limits' },
  { id: 'other',   label: 'Something else',     emoji: '💬', cat: 'other',    color: '#475569', bg: '#F8FAFC',
    hint: 'Any other question or request' },
];

// ── Suggestion categories ─────────────────────────────────────────────────────
const SUG_CATS = [
  { id: 'feature',     label: 'Feature Request', emoji: '💡' },
  { id: 'improvement', label: 'Improvement',      emoji: '⚡' },
  { id: 'trading',     label: 'Trading Tip',      emoji: '📈' },
  { id: 'bug',         label: 'Bug Report',       emoji: '🐛' },
  { id: 'other',       label: 'Other',            emoji: '💬' },
];

// ── Markdown-lite renderer ────────────────────────────────────────────────────
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

// ── Typing dots ───────────────────────────────────────────────────────────────
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

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step, total }) {
  return (
    <div className="flex items-center gap-1.5 justify-center py-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i}
          className="rounded-full transition-all duration-300"
          style={{
            height: 4,
            width: i + 1 === step ? 20 : 8,
            backgroundColor: i + 1 <= step ? '#1B4332' : '#E2E8F0',
          }} />
      ))}
      <span className="text-[10px] font-bold ml-1" style={{ color: '#94A3B8' }}>
        Step {step} of {total}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function SuggestionsPanel({ user }) {
  // mode: 'home' | 'topic-selected' | 'ticket-form' | 'ticket-created' | 'chat' | 'suggest'
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const [mode, setMode] = useState('home');
  const [topic, setTopic] = useState(null);

  // ── Ticket form ───────────────────────────────────────────────────────────
  const [subject, setSubject]     = useState('');
  const [msgBody, setMsgBody]     = useState('');
  const [creating, setCreating]   = useState(false);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const [ticket, setTicket]       = useState(null);
  const [chatMsgs, setChatMsgs]   = useState([]);
  const [aiMsgs, setAiMsgs]       = useState([]);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying]   = useState(false);
  const [aiLoading, setAiLoad]    = useState(false);
  const pollRef  = useRef(null);
  const chatRef  = useRef(null);
  const inputRef = useRef(null);

  // ── Suggestion form ───────────────────────────────────────────────────────
  const [sugTitle, setSugTitle] = useState('');
  const [sugBody,  setSugBody]  = useState('');
  const [sugCat,   setSugCat]   = useState('feature');
  const [sugPosting, setSugPost]= useState(false);
  const [sugDone,  setSugDone]  = useState(false);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMsgs, aiMsgs, aiLoading]);

  // Lock body scroll on mobile when panel is open
  useEffect(() => {
    if (open && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open, isMobile]);

  // Stop polling when leaving chat
  useEffect(() => {
    if (mode !== 'chat' && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [mode]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goHome = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setMode('home');
    setTopic(null);
    setTicket(null);
    setSubject(''); setMsgBody('');
    setChatMsgs([]); setAiMsgs([]);
    setReplyText('');
  };

  const openPanel = () => {
    if (!open) setMode('home');
    setOpen(o => !o);
  };

  // Step 1 → 2: pick topic
  const pickTopic = (t) => {
    setTopic(t);
    setSubject(`Help with ${t.label}`);
    setMsgBody('');
    setMode('topic-selected');
  };

  // Step 2 → 3: go to ticket form
  const goToForm = () => {
    setMode('ticket-form');
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  // ── Poll for new messages ─────────────────────────────────────────────────
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

  // ── Build conversation history for the AI ────────────────────────────────
  // Interleaves user ticket messages with previous AI replies so the AI
  // never repeats itself and understands the full conversation context.
  const buildHistory = (currentAiMsgs, currentChatMsgs) => {
    const history = [];
    const userMsgs = currentChatMsgs.filter(m => m.sender_type === 'user');
    const maxPairs = Math.min(userMsgs.length, currentAiMsgs.length);
    for (let i = 0; i < maxPairs; i++) {
      history.push({ role: 'user', text: userMsgs[i].message });
      history.push({ role: 'ai',   text: currentAiMsgs[i].text });
    }
    for (let i = maxPairs; i < userMsgs.length; i++) {
      history.push({ role: 'user', text: userMsgs[i].message });
    }
    return history;
  };

  // ── Support-mode smart fallback (no API needed) ───────────────────────────
  const supportFallback = (message, currentAiMsgs) => {
    const q = (message || '').toLowerCase().trim();
    const turn = currentAiMsgs.length;
    const name = user?.username ? `, ${user.username}` : '';

    // Greeting detection — always respond with a welcome, never topic info
    if (/^(hey|hi|hello|good\s*(morning|afternoon|evening)|howdy|yo|hiya|sup)\b/.test(q)) {
      const greetings = [
        `Hi${name}! 👋 I'm Alex from PRAQEN support. I'm looking at your ticket right now — how can I help you?`,
        `Hey${name}! Great to have you here. Your ticket is open and the team is on it. What would you like to update?`,
        `Hello${name}! I'm reviewing your case right now. What can I help you with?`,
      ];
      return greetings[turn % greetings.length];
    }

    if (/thank|thanks|okay|ok\b|great|perfect|got it|cool|nice/.test(q)) {
      const pool = [
        'Happy to help! Let me know if anything else comes up.',
        'Great! I\'ve noted that. Anything else you\'d like to add to your ticket?',
        'Awesome — the team will follow up too. Is there anything else I can do for you?',
      ];
      return pool[turn % pool.length];
    }

    if (/wait|how long|still|not yet|update|any news/.test(q)) {
      const pool = [
        'I completely understand the wait can be frustrating. The team is actively on your case — do you have any updates from your side?',
        'We haven\'t forgotten about you! Our team aims to resolve tickets within 24 hours. Any new details I should add?',
        'Still on it — I\'ve flagged this for priority review. Anything new to report?',
      ];
      return pool[turn % pool.length];
    }

    if (/paid|sent|payment|transferred|deposit|momo|bank/.test(q)) {
      const pool = [
        'Thanks for the update — I\'ve noted the payment details on your ticket. Has the other party confirmed receipt yet?',
        'Got it, payment noted. Please keep your receipt handy. Has anything changed since you sent it?',
        'Noted on the payment. The team will look into this. Can you share the exact amount and method used?',
      ];
      return pool[turn % pool.length];
    }

    if (/dispute|scam|fraud|problem|stuck|issue|wrong|error|fail/.test(q)) {
      const pool = [
        'I\'ve flagged this as urgent on your ticket. If you haven\'t already, go to **My Trades → Raise Dispute** to protect the escrow. Can you describe what happened?',
        'On it — I\'ve escalated this. The team will investigate. Can you share any screenshots or trade IDs?',
        'Understood, this has been marked urgent. Our team is reviewing it now. Any additional info will help us move faster.',
      ];
      return pool[turn % pool.length];
    }

    if (/trade|escrow|sell|buy|btc|bitcoin/.test(q)) {
      const pool = [
        'I hear you — I\'ve added that to your ticket. The team is working on it. Do you need anything else right now?',
        'Noted on the trade details. I\'ll make sure the team sees this. Is there a trade ID or reference I should attach?',
        'Thanks for the info. Your ticket has been updated and the team is reviewing it. Anything else?',
      ];
      return pool[turn % pool.length];
    }

    // Generic by turn count — vary so it never repeats
    const generic = [
      `Got it${name}! I\'m reviewing your ticket now. Can you tell me more about what\'s happening?`,
      'Noted — I\'ve updated your ticket with that. Our team is working on it. Anything else to add?',
      'Thanks for that. I\'ve passed it to the team. Is there anything urgent you need right now?',
      'Understood — the team is on your case. Do you have any new updates I should note?',
      'I hear you. I\'ve flagged this for the team. Can you share any extra details that might help?',
    ];
    return generic[turn % generic.length];
  };

  // ── AI response ───────────────────────────────────────────────────────────
  const fetchAI = async (message, topicObj, currentAiMsgs = [], currentChatMsgs = []) => {
    setAiLoad(true);
    try {
      const history = buildHistory(currentAiMsgs, currentChatMsgs);
      const res = await fetch(`${API_URL}/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({
          message,
          mode: 'support',
          section: topicObj?.id || null,
          history,
          user: user ? { username: user.username, id: user.id } : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const replyText = data.reply?.trim() || '';

      setAiMsgs(prev => {
        // If server returned the same text as a previous reply, use smart fallback
        const isDuplicate = replyText && prev.some(m => m.text.trim() === replyText);
        const finalText = isDuplicate || !replyText
          ? supportFallback(message, prev)
          : replyText;
        return [...prev, { role: 'ai', text: finalText }];
      });
    } catch {
      setAiMsgs(prev => [...prev, { role: 'ai', text: supportFallback(message, prev) }]);
    } finally {
      setAiLoad(false);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  };

  // ── Create ticket (Step 3 submit) ─────────────────────────────────────────
  const createTicket = async () => {
    if (!msgBody.trim()) return toast.error('Please describe your issue first');
    if (!user) return toast.info('Please log in to create a support ticket');
    setCreating(true);
    try {
      const r = await axios.post(`${API_URL}/support/tickets`, {
        subject: subject.trim() || `Help with ${topic?.label || 'General'}`,
        category: topic?.cat || 'general',
        message: msgBody.trim(),
      }, { headers: authH() });

      const newTicket = r.data.ticket;
      setTicket(newTicket);

      const msgsRes = await axios.get(`${API_URL}/support/tickets/${newTicket.id}/messages`, { headers: authH() });
      const initialMsgs = msgsRes.data.messages || [];
      setChatMsgs(initialMsgs);
      setAiMsgs([]);

      // Show success screen first
      setMode('ticket-created');
      startPolling(newTicket.id);
      // Pass empty history — this is the very first AI reply
      fetchAI(msgBody.trim(), topic, [], initialMsgs);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create ticket. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  // ── Send reply (in chat) ──────────────────────────────────────────────────
  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || replying || aiLoading || !ticket) return;
    setReplying(true);
    setReplyText('');
    try {
      const r = await axios.post(`${API_URL}/support/tickets/${ticket.id}/messages`, { message: text }, { headers: authH() });
      const updatedChatMsgs = [...chatMsgs, r.data.message];
      setChatMsgs(updatedChatMsgs);
      // Pass full history so AI never repeats itself
      fetchAI(text, topic, aiMsgs, updatedChatMsgs);
    } catch (e) {
      setReplyText(text);
      toast.error(e.response?.data?.error || 'Failed to send. Please try again.');
    } finally {
      setReplying(false);
    }
  };

  // ── Submit suggestion ─────────────────────────────────────────────────────
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

  // ── Header config per mode ────────────────────────────────────────────────
  const headerCfg = {
    'home':           { title: 'PRAQEN Support',         sub: 'How can we help you today?',                        icon: <MessageCircle size={18} color="white" />,  step: null },
    'topic-selected': { title: topic?.label || 'Support', sub: 'Step 1 of 2 — Review your topic',                  icon: <span style={{fontSize:16}}>{topic?.emoji}</span>, step: [1,2] },
    'ticket-form':    { title: 'Describe Your Issue',     sub: 'Step 2 of 2 — Tell us what\'s happening',          icon: <Ticket size={18} color="white" />,            step: [2,2] },
    'ticket-created': { title: 'Ticket Created!',         sub: `Ticket #${ticket?.id?.slice(0,8).toUpperCase() || '…'}`, icon: <CheckCircle size={18} color="white" />, step: null },
    'chat':           { title: 'Live Support Chat',       sub: ticket ? `Ticket #${ticket.id.slice(0,8).toUpperCase()} · Open` : '…', icon: <Headphones size={18} color="white" />, step: null },
    'suggest':        { title: 'Drop a Suggestion',       sub: 'We read every single one',                          icon: <Lightbulb size={18} color="white" />,         step: null },
  };
  const hdr = headerCfg[mode] || headerCfg['home'];

  const canGoBack = mode !== 'home' && mode !== 'chat' && mode !== 'ticket-created';

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating button — hidden on mobile when panel is open ── */}
      {!(open && isMobile) && (
        <button onClick={openPanel}
          className="fixed flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95"
          style={{
            /* On mobile: sit above BottomNav (60px) + safe area + 14px gap */
            bottom: isMobile
              ? 'calc(60px + env(safe-area-inset-bottom, 0px) + 14px)'
              : 24,
            right: isMobile ? 16 : 24,
            width: isMobile ? 54 : 58,
            height: isMobile ? 54 : 58,
            borderRadius: '50%',
            zIndex: 1002,  /* above BottomNav (1000) */
            background: 'linear-gradient(135deg,#1B4332,#2D6A4F)',
            border: '3px solid rgba(255,255,255,0.18)',
            boxShadow: '0 8px 32px rgba(27,67,50,0.45)',
            WebkitTapHighlightColor: 'transparent',
          }}>
          {open
            ? <X size={22} color="white" />
            : <MessageCircle size={24} color="white" fill="rgba(255,255,255,0.15)" />}
          {!open && (
            <span className="absolute w-full h-full rounded-full animate-ping"
              style={{ backgroundColor: 'rgba(45,106,79,0.35)' }} />
          )}
        </button>
      )}

      {/* ── Widget panel ── */}
      {open && (
        <>
          {/* Backdrop — mobile only */}
          {isMobile && (
            <div onClick={() => setOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                zIndex: 1001,
                backgroundColor: 'rgba(0,0,0,0.55)',
              }} />
          )}
        <div className="fixed flex flex-col"
          style={isMobile ? {
            /* Mobile: full-screen sheet — above BottomNav (z:1000) */
            bottom: 0, left: 0, right: 0,
            height: '92dvh', maxHeight: '92dvh',
            borderRadius: '22px 22px 0 0',
            backgroundColor: '#fff',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.22)',
            overflow: 'hidden',
            zIndex: 1002,
          } : {
            /* Desktop: floating panel bottom-right */
            bottom: 96, right: 16,
            width: 'min(400px, calc(100vw - 32px))',
            height: 'min(600px, calc(100vh - 120px))',
            borderRadius: 22, backgroundColor: '#fff',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
            border: '1.5px solid #E2E8F0',
            overflow: 'hidden',
            zIndex: 1002,
          }}>

          {/* ── Header ── */}
          <div className="flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
            {/* Drag handle — mobile only */}
            {isMobile && (
              <div className="flex justify-center pt-3 pb-1">
                <div style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.3)' }} />
              </div>
            )}
            <div className="flex items-center gap-3 px-4 py-3" style={{ minHeight: isMobile ? 60 : 56 }}>
              {canGoBack && (
                <button onClick={() => {
                  if (mode === 'ticket-form')      setMode('topic-selected');
                  else if (mode === 'topic-selected') goHome();
                  else if (mode === 'suggest')     goHome();
                }}
                  style={{
                    width: isMobile ? 40 : 32, height: isMobile ? 40 : 32,
                    borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0, color: 'rgba(255,255,255,0.9)',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  <ChevronLeft size={isMobile ? 22 : 18} color="white" />
                </button>
              )}

              <div style={{
                width: isMobile ? 40 : 36, height: isMobile ? 40 : 36,
                borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {hdr.icon}
              </div>

              <div className="flex-1 min-w-0">
                <p style={{ fontWeight: 900, fontSize: isMobile ? 16 : 14, color: '#fff', lineHeight: 1, margin: 0 }}
                  className="truncate">{hdr.title}</p>
                <p className="truncate flex items-center gap-1"
                  style={{ fontSize: isMobile ? 12 : 11, marginTop: 3, color: 'rgba(255,255,255,0.7)', margin: '3px 0 0' }}>
                  {mode === 'chat' && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: '#4ADE80', flexShrink: 0 }} />}
                  {hdr.sub}
                </p>
              </div>

              <button onClick={() => setOpen(false)}
                style={{
                  width: isMobile ? 40 : 32, height: isMobile ? 40 : 32,
                  borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <X size={isMobile ? 18 : 15} color="white" />
              </button>
            </div>
          </div>

          {/* ── Step bar ── */}
          {hdr.step && (
            <div className="flex-shrink-0 border-b" style={{ borderColor: '#F1F5F9', backgroundColor: '#FAFAFA' }}>
              <StepBar step={hdr.step[0]} total={hdr.step[1]} />
            </div>
          )}

          {/* ════════════ HOME ════════════ */}
          {mode === 'home' && (
            <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#F8FAFC' }}>
              {/* Welcome banner */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                    {user?.avatar_url
                      ? <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                      : <User size={18} color="white" />}
                  </div>
                  <div>
                    <p className="text-sm font-black text-white leading-none">
                      Hi{user ? `, ${user.username || user.full_name}` : ' there'}! 👋
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
                      What do you need help with today?
                    </p>
                  </div>
                </div>
              </div>

              {/* Topic grid */}
              <div className="px-4 pb-3">
                <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, color: '#94A3B8' }}>
                  Choose a topic
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 10 : 8 }}>
                  {TOPICS.map(t => (
                    <button key={t.id} onClick={() => pickTopic(t)}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        padding: isMobile ? '14px 12px' : '12px',
                        borderRadius: 16, textAlign: 'left', cursor: 'pointer',
                        backgroundColor: '#fff', border: `1.5px solid ${t.color}25`,
                        WebkitTapHighlightColor: 'transparent', transition: 'box-shadow 0.15s',
                        minHeight: isMobile ? 90 : 80,
                      }}>
                      <span style={{ fontSize: isMobile ? 24 : 20 }}>{t.emoji}</span>
                      <span style={{ fontSize: isMobile ? 13 : 12, fontWeight: 900, lineHeight: 1.2, color: t.color }}>{t.label}</span>
                      <span style={{ fontSize: isMobile ? 11 : 10, lineHeight: 1.4, color: '#94A3B8' }}>{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="mx-4 border-t mb-3" style={{ borderColor: '#F1F5F9' }} />

              {/* Drop suggestion */}
              <div className="px-4 pb-4">
                <button onClick={() => { setMode('suggest'); setSugTitle(''); setSugBody(''); setSugCat('feature'); setSugDone(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition hover:shadow-md hover:-translate-y-0.5"
                  style={{ backgroundColor: '#fff', border: '1.5px solid #FDE68A' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                    <Lightbulb size={16} color="white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black" style={{ color: '#92400E' }}>Drop a Suggestion</p>
                    <p className="text-[10px]" style={{ color: '#94A3B8' }}>Share ideas · Our team reads them all</p>
                  </div>
                  <ArrowRight size={14} color="#D97706" />
                </button>
              </div>

              {/* Trust badges */}
              <div className="mx-4 mb-4 flex gap-2">
                {[
                  { icon: <Shield size={11} color="#1B4332" />, text: 'Secure & Private' },
                  { icon: <Clock size={11} color="#1B4332" />, text: 'Fast Response' },
                  { icon: <Headphones size={11} color="#1B4332" />, text: 'Human + AI Support' },
                ].map(b => (
                  <div key={b.text} className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl"
                    style={{ backgroundColor: '#F0FDF4' }}>
                    {b.icon}
                    <span className="text-[9px] font-bold text-center leading-tight" style={{ color: '#1B4332' }}>{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════ STEP 1: TOPIC SELECTED ════════════ */}
          {mode === 'topic-selected' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>

              {/* Topic card */}
              <div className="p-4 rounded-2xl"
                style={{ backgroundColor: topic?.bg || '#F0FDF4', border: `2px solid ${topic?.color || '#1B4332'}25` }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{topic?.emoji}</span>
                  <div>
                    <p className="text-sm font-black" style={{ color: topic?.color }}>{topic?.label}</p>
                    <p className="text-[11px]" style={{ color: '#64748B' }}>{topic?.hint}</p>
                  </div>
                </div>
              </div>

              {/* What happens next */}
              <div className="p-4 rounded-2xl space-y-3"
                style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                <p className="text-xs font-black" style={{ color: '#1E293B' }}>What happens when you create a ticket:</p>
                {[
                  { n: '1', text: 'You describe your issue in the next step' },
                  { n: '2', text: 'A ticket is created instantly with a unique ID' },
                  { n: '3', text: 'Our AI responds immediately with helpful info' },
                  { n: '4', text: 'A human support agent follows up in the chat' },
                ].map(s => (
                  <div key={s.n} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black text-white"
                      style={{ backgroundColor: '#1B4332', marginTop: 1 }}>{s.n}</span>
                    <p className="text-[11px] leading-relaxed" style={{ color: '#64748B' }}>{s.text}</p>
                  </div>
                ))}
              </div>

              {/* Account info */}
              {user ? (
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: '#fff', border: '1.5px solid #D1FAE5' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#F0FDF4' }}>
                    {user.avatar_url
                      ? <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
                      : <User size={16} color="#1B4332" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black truncate" style={{ color: '#1E293B' }}>
                      {user.full_name || user.username}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: '#64748B' }}>@{user.username}</p>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#D1FAE5', color: '#1B4332' }}>✓ Logged in</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: '#FEF2F2', border: '1.5px solid #FECACA' }}>
                  <User size={16} color="#DC2626" />
                  <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>
                    You need to be logged in to create a support ticket.
                  </p>
                </div>
              )}

              {/* CTA */}
              <button onClick={goToForm} disabled={!user}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                <Ticket size={16} />
                Create a Support Ticket
                <ArrowRight size={14} />
              </button>

              <p className="text-[10px] text-center" style={{ color: '#CBD5E1' }}>
                Your account info is sent with the ticket so we can help faster
              </p>
            </div>
          )}

          {/* ════════════ STEP 2: TICKET FORM ════════════ */}
          {mode === 'ticket-form' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>

              {/* Topic badge */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ backgroundColor: topic?.bg || '#F0FDF4', border: `1.5px solid ${topic?.color || '#1B4332'}20` }}>
                <span className="text-base">{topic?.emoji}</span>
                <p className="text-xs font-black" style={{ color: topic?.color }}>{topic?.label}</p>
              </div>

              {/* Subject */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  Subject
                </label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder={`Help with ${topic?.label || 'my issue'}…`}
                  className="w-full px-3 py-2.5 rounded-xl border-2 focus:outline-none transition"
                  style={{ borderColor: subject ? '#1B4332' : '#E2E8F0', backgroundColor: '#fff', fontSize: 16, fontFamily: 'inherit' }} />
              </div>

              {/* Message */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  Describe your issue <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea ref={inputRef} value={msgBody} onChange={e => setMsgBody(e.target.value)}
                  placeholder={`Tell us exactly what's happening with your ${topic?.label?.toLowerCase() || 'issue'}. Include trade IDs, amounts, or any relevant details…`}
                  rows={isMobile ? 4 : 5}
                  className="w-full px-3 py-2.5 rounded-xl border-2 focus:outline-none resize-none transition"
                  style={{ borderColor: msgBody ? '#1B4332' : '#E2E8F0', backgroundColor: '#fff', fontSize: 16, fontFamily: 'inherit' }} />
                <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>
                  The more detail you give, the faster we can help
                </p>
              </div>

              {/* Submit */}
              <button onClick={createTicket} disabled={creating || !msgBody.trim()}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                {creating
                  ? <><RefreshCw size={14} className="animate-spin" /> Creating your ticket…</>
                  : <><Ticket size={14} /> Create Ticket &amp; Open Chat <ArrowRight size={13} /></>}
              </button>

              <p className="text-[10px] text-center" style={{ color: '#CBD5E1' }}>
                By submitting you agree to our support terms · Response time: &lt; 24 hours
              </p>
            </div>
          )}

          {/* ════════════ TICKET CREATED SUCCESS ════════════ */}
          {mode === 'ticket-created' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4"
              style={{ backgroundColor: '#F8FAFC' }}>

              {/* Big check */}
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#D1FAE5,#A7F3D0)' }}>
                <CheckCircle size={40} color="#1B4332" />
              </div>

              <div>
                <p className="text-lg font-black" style={{ color: '#1B4332' }}>Ticket Created!</p>
                <p className="text-[12px] mt-1" style={{ color: '#64748B' }}>
                  Your support request has been submitted
                </p>
              </div>

              {/* Ticket ID badge */}
              <div className="px-6 py-3 rounded-2xl w-full"
                style={{ backgroundColor: '#fff', border: '2px solid #1B4332' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#94A3B8' }}>
                  Your Ticket Number
                </p>
                <p className="text-xl font-black tracking-widest" style={{ color: '#1B4332' }}>
                  #{ticket?.id?.slice(0, 8).toUpperCase() || '…'}
                </p>
                <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>
                  Save this number to follow up on your request
                </p>
              </div>

              {/* Status info */}
              <div className="w-full space-y-2">
                {[
                  { icon: '✅', text: 'Ticket submitted to our support team' },
                  { icon: '🤖', text: 'PRAQEN AI is typing a quick response…' },
                  { icon: '👨‍💼', text: 'A human agent will reply within 24 hours' },
                ].map(s => (
                  <div key={s.text} className="flex items-center gap-2 px-3 py-2 rounded-xl text-left"
                    style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                    <span className="text-sm flex-shrink-0">{s.icon}</span>
                    <p className="text-[11px]" style={{ color: '#475569' }}>{s.text}</p>
                  </div>
                ))}
              </div>

              {/* Open chat button */}
              <button onClick={() => setMode('chat')}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                <Headphones size={16} />
                Open Live Chat
                <ArrowRight size={14} />
              </button>

              <button onClick={goHome} className="text-[11px] font-bold" style={{ color: '#94A3B8' }}>
                ← Back to home
              </button>
            </div>
          )}

          {/* ════════════ CHAT ════════════ */}
          {mode === 'chat' && (
            <>
              {/* Ticket info bar */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b"
                style={{ borderColor: '#E2E8F0', backgroundColor: '#F0FDF4' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black truncate" style={{ color: '#1B4332' }}>
                    {ticket?.subject}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <p className="text-[10px]" style={{ color: '#64748B' }}>
                      {topic?.emoji} {topic?.label} · AI + Human support · Ticket #{ticket?.id?.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                </div>
                <button onClick={goHome}
                  className="text-[11px] font-bold flex-shrink-0 ml-2 px-2 py-1 rounded-lg transition hover:bg-white"
                  style={{ color: '#94A3B8' }}>
                  New
                </button>
              </div>

              {/* Messages */}
              <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
                style={{ backgroundColor: '#F8FAFC' }}>

                {/* Ticket confirmed notice */}
                <div className="flex flex-col items-center gap-1 py-2 text-center">
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full"
                    style={{ backgroundColor: '#D1FAE5', color: '#1B4332' }}>
                    ✓ Ticket #{ticket?.id?.slice(0, 8).toUpperCase()} · Open
                  </span>
                  <p className="text-[10px]" style={{ color: '#94A3B8' }}>Chat below — we'll reply here</p>
                </div>

                {/* Chat messages (ticket + AI interleaved) */}
                {(() => {
                  const timeline = [];

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
                            {isUser ? (user?.username || 'You') : (m.sender_name || 'Support Agent')}
                          </p>
                          <p>{m.message}</p>
                        </div>
                      </div>
                    );
                  });

                  aiMsgs.forEach((m, i) => {
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
                    );
                  });

                  return timeline;
                })()}

                {aiLoading && <Typing />}
                <div style={{ float: 'left', clear: 'both' }} />
              </div>

              {/* Reply input */}
              <div className="flex-shrink-0 flex gap-2 items-end"
                style={{
                  padding: isMobile ? '10px 14px' : '10px 12px',
                  paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 10,
                  borderTop: '1.5px solid #E2E8F0', backgroundColor: '#fff',
                }}>
                <textarea ref={inputRef} value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder={isMobile ? 'Type a message…' : 'Type your message… (Enter to send)'}
                  rows={1}
                  style={{
                    flex: 1, padding: isMobile ? '12px 14px' : '10px 12px',
                    borderRadius: 14, fontSize: 16, /* 16px prevents iOS zoom */
                    resize: 'none', outline: 'none', lineHeight: 1.4,
                    border: `2px solid ${replyText ? '#1B4332' : '#E2E8F0'}`,
                    maxHeight: isMobile ? 120 : 90,
                    WebkitTapHighlightColor: 'transparent',
                    fontFamily: 'inherit',
                  }} />
                <button onClick={sendReply} disabled={!replyText.trim() || replying || aiLoading}
                  style={{
                    width: isMobile ? 48 : 40, height: isMobile ? 48 : 40,
                    borderRadius: 14, border: 'none', cursor: 'pointer', flexShrink: 0,
                    background: 'linear-gradient(135deg,#1B4332,#2D6A4F)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: (!replyText.trim() || replying || aiLoading) ? 0.4 : 1,
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {replying
                    ? <RefreshCw size={isMobile ? 18 : 15} color="white" className="animate-spin" />
                    : <Send size={isMobile ? 18 : 15} color="white" />}
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
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                      Title *
                    </label>
                    <input value={sugTitle} onChange={e => setSugTitle(e.target.value)}
                      placeholder="Give your idea a short title…"
                      className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none transition"
                      style={{ borderColor: sugTitle ? '#D97706' : '#E2E8F0', backgroundColor: '#fff' }} />
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                      Details (optional)
                    </label>
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
        </>
      )}
    </>
  );
}
