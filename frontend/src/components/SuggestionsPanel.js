import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  X, ChevronUp, Lightbulb, Send, TrendingUp, Clock,
  MessageCircle, CheckCircle, RefreshCw, Sparkles,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', gold: '#F4A422',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444',
};

const CATS = [
  { id: 'feature',     label: 'Feature Request', emoji: '💡', color: '#1D4ED8', bg: '#EFF6FF' },
  { id: 'trading',     label: 'Trading Tip',      emoji: '📈', color: '#166534', bg: '#F0FDF4' },
  { id: 'bug',         label: 'Bug Report',       emoji: '🐛', color: '#991B1B', bg: '#FEF2F2' },
  { id: 'improvement', label: 'Improvement',      emoji: '⚡', color: '#92400E', bg: '#FFFBEB' },
  { id: 'other',       label: 'Other',            emoji: '💬', color: '#6D28D9', bg: '#F5F3FF' },
];

const STATUSES = {
  open:      { label: 'Open',         color: '#3B82F6', bg: '#EFF6FF',  dot: '🔵' },
  reviewing: { label: 'Under Review', color: '#92400E', bg: '#FFFBEB',  dot: '🟡' },
  planned:   { label: 'Planned',      color: '#6D28D9', bg: '#F5F3FF',  dot: '🗺️' },
  building:  { label: 'Building',     color: '#EA580C', bg: '#FFF7ED',  dot: '🔨' },
  done:      { label: 'Done ✅',       color: '#166534', bg: '#F0FDF4',  dot: '✅' },
  rejected:  { label: 'Not Planned',  color: '#6B7280', bg: '#F9FAFB',  dot: '❌' },
};

const authH = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

function fmtAge(ts) {
  if (!ts) return '';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
}

function catOf(id)    { return CATS.find(c => c.id === id)    || CATS[4]; }
function statusOf(s)  { return STATUSES[s]                    || STATUSES.open; }

// ─── Upvote button ────────────────────────────────────────────
function VoteBtn({ count, voted, onClick }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-0.5 py-2 px-2.5 rounded-xl transition-all hover:scale-110 active:scale-95 flex-shrink-0"
      style={{
        backgroundColor: voted ? C.forest : C.g100,
        color: voted ? '#fff' : C.g500,
        minWidth: 40,
      }}>
      <ChevronUp size={15} strokeWidth={voted ? 3 : 2} />
      <span className="text-xs font-black leading-none">{count}</span>
    </button>
  );
}

// ─── Suggestion card ──────────────────────────────────────────
function SuggestionCard({ s, onVote, pinned }) {
  const cat  = catOf(s.category);
  const stat = statusOf(s.status);
  return (
    <div className="bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5"
      style={{ borderColor: pinned ? C.gold : C.g200, borderWidth: pinned ? 2 : 1 }}>
      {pinned && (
        <div className="px-4 py-1.5 text-xs font-black flex items-center gap-1.5"
          style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
          📌 Pinned by PRAQEN Team
        </div>
      )}
      <div className="flex gap-3 p-4">
        <VoteBtn count={s.upvotes || 0} voted={s.user_voted} onClick={() => onVote(s.id)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className="font-black text-sm leading-snug" style={{ color: C.g800 }}>{s.title}</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-black flex-shrink-0 whitespace-nowrap"
              style={{ backgroundColor: stat.bg, color: stat.color }}>
              {stat.label}
            </span>
          </div>
          {s.body && (
            <p className="text-xs mb-2 leading-relaxed" style={{ color: C.g500 }}>
              {s.body.slice(0, 130)}{s.body.length > 130 ? '…' : ''}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0"
              style={{ backgroundColor: cat.bg, color: cat.color }}>
              {cat.emoji} {cat.label}
            </span>
            <span className="text-xs" style={{ color: C.g400 }}>
              {s.username} · {fmtAge(s.created_at)}
            </span>
          </div>
          {s.admin_reply && (
            <div className="mt-3 flex gap-2.5 p-3 rounded-xl"
              style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: C.forest }}>
                <span className="text-xs font-black text-white" style={{ fontFamily: 'Georgia,serif' }}>P</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black mb-0.5" style={{ color: '#166534' }}>PRAQEN Team</p>
                <p className="text-xs leading-relaxed" style={{ color: '#15803D' }}>{s.admin_reply}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────
export default function SuggestionsPanel({ user }) {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState('browse');
  const [suggestions, setSugs]  = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [sort, setSort]         = useState('votes');
  const [catFilter, setCat]     = useState('');
  const [page, setPage]         = useState(1);
  const [hasMore, setHasMore]   = useState(false);
  const LIMIT = 15;

  // Post form
  const [title, setTitle]       = useState('');
  const [body, setBody]         = useState('');
  const [category, setCategory] = useState('feature');
  const [posting, setPosting]   = useState(false);

  const listRef = useRef(null);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    const p = reset ? 1 : page;
    try {
      const r = await axios.get(`${API_URL}/suggestions`, {
        headers: authH(),
        params: { sort, category: catFilter, page: p, limit: LIMIT },
      });
      const incoming = r.data.suggestions || [];
      setSugs(prev => reset ? incoming : [...prev, ...incoming]);
      setTotal(r.data.total || 0);
      setHasMore((reset ? incoming.length : (suggestions.length + incoming.length)) < (r.data.total || 0));
    } catch {}
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, catFilter, page]);

  useEffect(() => {
    if (open) { setPage(1); load(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sort, catFilter]);

  const vote = async (id) => {
    if (!user) return toast.info('Login to vote on suggestions');
    // Optimistic update
    setSugs(prev => prev.map(s =>
      s.id === id ? { ...s, user_voted: !s.user_voted, upvotes: s.upvotes + (s.user_voted ? -1 : 1) } : s
    ));
    try {
      const r = await axios.post(`${API_URL}/suggestions/${id}/vote`, {}, { headers: authH() });
      setSugs(prev => prev.map(s => s.id === id ? { ...s, user_voted: r.data.voted, upvotes: r.data.upvotes } : s));
    } catch {
      // Revert on fail
      setSugs(prev => prev.map(s =>
        s.id === id ? { ...s, user_voted: !s.user_voted, upvotes: s.upvotes + (s.user_voted ? 1 : -1) } : s
      ));
    }
  };

  const post = async () => {
    if (!title.trim()) return toast.error('Please enter a title for your idea');
    if (!user) return toast.info('Login to share ideas');
    setPosting(true);
    try {
      const r = await axios.post(`${API_URL}/suggestions`, { title, body, category }, { headers: authH() });
      setSugs(prev => [r.data.suggestion, ...prev]);
      setTotal(t => t + 1);
      setTitle(''); setBody(''); setCategory('feature');
      toast.success('Idea submitted! 🎉 Thank you for helping PRAQEN grow!');
      setTab('browse');
      if (listRef.current) listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to submit'); }
    finally { setPosting(false); }
  };

  const loadMore = () => {
    setPage(p => p + 1);
    load(false);
  };

  return (
    <>
      {/* ── Floating trigger ── */}
      <button onClick={() => setOpen(true)}
        className="fixed z-40 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-xl transition-all hover:scale-105 hover:shadow-2xl"
        style={{
          bottom: '88px', right: '16px',
          background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)`,
          boxShadow: '0 8px 28px rgba(27,67,50,0.45)',
        }}>
        <Lightbulb size={16} style={{ color: C.gold }} />
        <span className="text-xs font-black text-white tracking-wide">Suggest</span>
        {total > 0 && (
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black leading-none"
            style={{ backgroundColor: C.gold, color: C.forest }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* ── Backdrop + Panel ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 transition-opacity"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
            onClick={() => setOpen(false)} />

          {/* Slide-in panel */}
          <div className="relative flex flex-col bg-white shadow-2xl overflow-hidden"
            style={{
              width: '100%', maxWidth: 420, height: '100dvh',
              animation: 'prq-slide-in 0.22s cubic-bezier(0.22,1,0.36,1)',
            }}>

            {/* ── Header ── */}
            <div className="flex-shrink-0"
              style={{ background: `linear-gradient(145deg, ${C.forest} 0%, #0c2418 55%, ${C.green} 100%)` }}>
              {/* Title row */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: C.gold }}>
                    <span className="font-black text-lg" style={{ color: C.forest, fontFamily: 'Georgia,serif' }}>P</span>
                  </div>
                  <div>
                    <h2 className="text-white font-black text-base leading-tight">Community Board</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {total > 0 ? `${total} ideas from the community` : 'Share ideas to shape PRAQEN'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition hover:bg-white/20">
                  <X size={16} className="text-white" />
                </button>
              </div>

              {/* Tabs */}
              <div className="px-5 pb-4">
                <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                  {[
                    { id: 'browse', icon: TrendingUp, label: 'Browse Ideas' },
                    { id: 'post',   icon: Sparkles,   label: 'Share Idea'   },
                  ].map(t => {
                    const Icon = t.icon;
                    return (
                      <button key={t.id} onClick={() => setTab(t.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-black transition"
                        style={{
                          backgroundColor: tab === t.id ? '#fff' : 'transparent',
                          color: tab === t.id ? C.forest : 'rgba(255,255,255,0.65)',
                        }}>
                        <Icon size={12} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {tab === 'browse' ? (
              <>
                {/* ── Filter bar ── */}
                <div className="flex-shrink-0 px-4 py-3 border-b flex items-center gap-2 overflow-x-auto"
                  style={{ borderColor: C.g200 }}>
                  <button onClick={() => setSort(s => s === 'votes' ? 'new' : 'votes')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black flex-shrink-0 transition hover:bg-gray-200"
                    style={{ backgroundColor: C.g100, color: C.g700 }}>
                    {sort === 'votes' ? <TrendingUp size={11} /> : <Clock size={11} />}
                    {sort === 'votes' ? 'Top Voted' : 'Latest'}
                  </button>
                  <div className="w-px h-5 flex-shrink-0" style={{ backgroundColor: C.g200 }} />
                  <button onClick={() => setCat('')}
                    className="px-3 py-1.5 rounded-full text-xs font-black flex-shrink-0 transition"
                    style={{ backgroundColor: catFilter === '' ? C.forest : C.g100, color: catFilter === '' ? '#fff' : C.g600 }}>
                    All
                  </button>
                  {CATS.map(c => (
                    <button key={c.id} onClick={() => setCat(catFilter === c.id ? '' : c.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black flex-shrink-0 transition"
                      style={{ backgroundColor: catFilter === c.id ? C.forest : C.g100, color: catFilter === c.id ? '#fff' : C.g600 }}>
                      {c.emoji} <span className="hidden sm:inline">{c.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>

                {/* ── Suggestions list ── */}
                <div ref={listRef} className="flex-1 overflow-y-auto">
                  {loading && suggestions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                      <div className="w-10 h-10 border-4 rounded-full animate-spin"
                        style={{ borderColor: `${C.forest}20`, borderTopColor: C.forest }} />
                      <p className="text-xs font-semibold" style={{ color: C.g400 }}>Loading ideas…</p>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="flex flex-col items-center py-20 px-6 text-center">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                        style={{ backgroundColor: '#FFFBEB' }}>
                        <span className="text-3xl">💡</span>
                      </div>
                      <p className="font-black text-base mb-1" style={{ color: C.g800 }}>
                        {catFilter ? 'No ideas in this category yet' : 'Be the first to suggest!'}
                      </p>
                      <p className="text-sm mb-6" style={{ color: C.g400 }}>
                        Share your ideas and help make PRAQEN better for everyone
                      </p>
                      <button onClick={() => setTab('post')}
                        className="px-6 py-3 rounded-xl text-sm font-black text-white transition hover:opacity-90"
                        style={{ backgroundColor: C.forest }}>
                        Share Your Idea
                      </button>
                    </div>
                  ) : (
                    <div className="px-4 pt-3 pb-4 space-y-3">
                      {suggestions.map(s => (
                        <SuggestionCard key={s.id} s={s} onVote={vote} pinned={s.is_pinned} />
                      ))}
                      {hasMore && (
                        <button onClick={loadMore} disabled={loading}
                          className="w-full py-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                          style={{ backgroundColor: C.g100, color: C.g600 }}>
                          {loading
                            ? <><RefreshCw size={12} className="animate-spin" /> Loading…</>
                            : `Load more (${total - suggestions.length} remaining)`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* ── Post tab ── */
              <div className="flex-1 overflow-y-auto p-5">
                {!user ? (
                  <div className="flex flex-col items-center py-16 text-center px-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: C.g100 }}>
                      <span className="text-3xl">🔒</span>
                    </div>
                    <p className="font-black text-base mb-2" style={{ color: C.g800 }}>Login to share ideas</p>
                    <p className="text-sm mb-6" style={{ color: C.g400 }}>
                      Join the PRAQEN community and help shape the platform
                    </p>
                    <a href="/login"
                      className="px-8 py-3 rounded-xl text-sm font-black text-white block w-full text-center transition hover:opacity-90"
                      style={{ backgroundColor: C.forest }}>
                      Login / Register
                    </a>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Intro */}
                    <div className="p-4 rounded-2xl flex items-start gap-3"
                      style={{ background: `linear-gradient(135deg, #F0FDF4, #ECFDF5)`, border: `1px solid #86EFAC` }}>
                      <span className="text-2xl flex-shrink-0">💡</span>
                      <div>
                        <p className="font-black text-sm" style={{ color: '#166534' }}>Your voice matters!</p>
                        <p className="text-xs mt-0.5" style={{ color: '#15803D' }}>
                          Every idea is reviewed by the PRAQEN team. The most-voted ones get built first.
                        </p>
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="text-xs font-black block mb-2" style={{ color: C.g600 }}>
                        What kind of idea is this?
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {CATS.map(c => (
                          <button key={c.id} onClick={() => setCategory(c.id)}
                            className="flex flex-col items-center gap-1.5 py-3.5 rounded-xl border-2 transition"
                            style={{
                              backgroundColor: category === c.id ? c.bg : '#fff',
                              borderColor:     category === c.id ? c.color : C.g200,
                              color:           category === c.id ? c.color : C.g500,
                            }}>
                            <span className="text-xl">{c.emoji}</span>
                            <span className="text-xs font-bold leading-tight text-center px-1">{c.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Title */}
                    <div>
                      <label className="text-xs font-black block mb-1.5" style={{ color: C.g600 }}>
                        Your idea in one sentence <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        maxLength={200}
                        placeholder={
                          category === 'bug'      ? 'e.g. The trade timer disappears on mobile' :
                          category === 'trading'  ? 'e.g. Add a BTC price alert feature'         :
                          category === 'feature'  ? 'e.g. Add a dark mode for the dashboard'     :
                          'Describe your idea briefly…'
                        }
                        className="w-full border rounded-xl px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-green-200"
                        style={{ borderColor: title.length > 0 ? C.forest : C.g200, color: C.g800 }}
                      />
                      <p className="text-xs mt-1 text-right"
                        style={{ color: title.length > 160 ? '#EF4444' : C.g400 }}>
                        {title.length}/200
                      </p>
                    </div>

                    {/* Body */}
                    <div>
                      <label className="text-xs font-black block mb-1.5" style={{ color: C.g600 }}>
                        More details <span style={{ color: C.g400 }}>(optional)</span>
                      </label>
                      <textarea
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        maxLength={1000}
                        rows={4}
                        placeholder="What problem does it solve? How should it work? The more detail, the better!"
                        className="w-full border rounded-xl px-4 py-3 text-sm outline-none resize-none transition focus:ring-2 focus:ring-green-200"
                        style={{ borderColor: C.g200, color: C.g800 }}
                      />
                      <p className="text-xs mt-1 text-right" style={{ color: C.g400 }}>{body.length}/1000</p>
                    </div>

                    {/* Submit */}
                    <button onClick={post} disabled={posting || !title.trim()}
                      className="w-full py-4 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition hover:opacity-90"
                      style={{
                        backgroundColor: posting || !title.trim() ? C.g200 : C.forest,
                        color: posting || !title.trim() ? C.g400 : '#fff',
                      }}>
                      {posting
                        ? <><RefreshCw size={14} className="animate-spin" /> Submitting…</>
                        : <><Send size={14} /> Submit Idea</>}
                    </button>

                    <p className="text-xs text-center" style={{ color: C.g400 }}>
                      Your idea is visible to the whole PRAQEN community. Be constructive and respectful.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Footer ── */}
            <div className="flex-shrink-0 px-5 py-3 border-t flex items-center justify-between"
              style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: C.g400 }}>
                <CheckCircle size={11} style={{ color: C.success }} />
                Built with community feedback
              </p>
              {tab === 'browse' && user && (
                <button onClick={() => setTab('post')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition hover:opacity-80"
                  style={{ backgroundColor: C.forest, color: '#fff' }}>
                  <Lightbulb size={11} /> Share Idea
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes prq-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
