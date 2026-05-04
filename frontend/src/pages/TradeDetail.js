import React, { useState, useEffect, useRef } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Send, Star, Clock, CheckCircle, AlertCircle, Lock,
  MessageCircle, Bitcoin, Shield, AlertTriangle,
  X, RefreshCw, Info, Check, CheckCheck, Timer,
  Paperclip, Flag, BadgeCheck, FileText, Copy,
  ChevronDown, ChevronUp, DollarSign, CreditCard,
  Smartphone, Building2, ThumbsUp, ThumbsDown, Gift,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { deriveBadge } from '../lib/badge';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', amber:'#F59E0B', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0', g300:'#CBD5E1',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', paid:'#3B82F6', warn:'#F59E0B',
  online:'#22C55E', purple:'#8B5CF6',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBtc = (n,d=8) => parseFloat(n||0).toFixed(d);
const fmtUsd = (n)     => `$${parseFloat(n||0).toFixed(2)}`;
const fmt    = (n,d=0) => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n||0);
const authH  = ()      => { const t=localStorage.getItem('token'); return t?{Authorization:`Bearer ${t}`}:{}; };

// USD_RATES is now provided by RatesContext — do NOT define a static object here
const CUR_SYM   = {GHS:'₵',NGN:'₦',KES:'KSh',ZAR:'R',UGX:'USh',USD:'$',GBP:'£',EUR:'€'};

function isoToFlag(code) {
  if(!code||code.length!==2)return'🌍';
  return code.toUpperCase().replace(/./g,c=>String.fromCodePoint(0x1F1E0+c.charCodeAt(0)-65));
}


const STATUS_CFG = {
  CREATED:     {label:'Escrow Active',  color:C.green,   bg:`${C.green}15`,  icon:Lock},
  FUNDS_LOCKED:{label:'Escrow Active',  color:C.green,   bg:`${C.green}15`,  icon:Lock},
  PAYMENT_SENT:{label:'Payment Sent',   color:C.paid,    bg:`${C.paid}15`,   icon:Clock},
  PAID:        {label:'Payment Sent',   color:C.paid,    bg:`${C.paid}15`,   icon:Clock},
  COMPLETED:   {label:'Completed ✅',  color:C.success, bg:`${C.success}15`,icon:CheckCircle},
  CANCELLED:   {label:'Cancelled',      color:C.g500,    bg:`${C.g500}15`,   icon:X},
  DISPUTED:    {label:'Disputed 🚨',    color:C.danger,  bg:`${C.danger}15`, icon:AlertTriangle},
};
const getS = s=>STATUS_CFG[s?.toUpperCase()]||STATUS_CFG.CREATED;
const fmtAge=d=>{if(!d)return'—';const s=(Date.now()-new Date(d))/1000;if(s<300)return'Online';if(s<3600)return`${~~(s/60)}m ago`;if(s<86400)return`${~~(s/3600)}h ago`;return`${~~(s/86400)}d ago`;};

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({user,size=40,radius='rounded-full'}) {
  const [err,setErr]=useState(false);
  if(user?.avatar_url&&!err) return(
    <img src={user.avatar_url.startsWith('/')?`${API_URL}${user.avatar_url}`:user.avatar_url}
      onError={()=>setErr(true)} alt={user.username}
      className={`object-cover flex-shrink-0 ${radius}`} style={{width:size,height:size}}/>
  );
  return(
    <div className={`flex-shrink-0 flex items-center justify-center font-black text-white ${radius}`}
      style={{width:size,height:size,backgroundColor:C.green,fontSize:size*0.38}}>
      {(user?.username||'?').charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Feedback modal ───────────────────────────────────────────────────────────
function FeedbackModal({name,onClose,onSubmit,submitting}) {
  const [isPositive, setIsPositive] = useState(null);
  const [comment,    setComment]    = useState('');

  const rating = isPositive ? 5 : 1;
  const canSubmit = isPositive !== null;

  const placeholder = isPositive === null
    ? 'Select Positive or Negative first…'
    : isPositive
      ? 'What went well? Tell the community… (optional)'
      : 'What went wrong? Your feedback helps others… (optional)';

  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{backgroundColor:'rgba(0,0,0,0.65)',backdropFilter:'blur(4px)'}}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl animate-slideUp sm:animate-bounceIn max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="p-5 text-white text-center"
          style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
          <h2 className="text-lg font-black">Rate Your Trade</h2>
          <p className="text-white/70 text-xs mt-1">How was trading with <span className="font-black text-white">{name}</span>?</p>
        </div>

        <div className="p-5 space-y-4">

          {/* Positive / Negative selector */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={()=>setIsPositive(true)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                isPositive===true
                  ? 'bg-emerald-50 border-emerald-500 scale-[1.02] shadow-md'
                  : 'bg-white border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30'
              }`}>
              <div className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
                isPositive===true ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                <ThumbsUp size={22} fill={isPositive===true?'currentColor':'none'}/>
              </div>
              <span className={`font-black text-xs uppercase tracking-wide ${
                isPositive===true ? 'text-emerald-700' : 'text-gray-400'
              }`}>Positive</span>
            </button>

            <button onClick={()=>setIsPositive(false)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                isPositive===false
                  ? 'bg-rose-50 border-rose-500 scale-[1.02] shadow-md'
                  : 'bg-white border-gray-100 hover:border-rose-200 hover:bg-rose-50/30'
              }`}>
              <div className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
                isPositive===false ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                <ThumbsDown size={22} fill={isPositive===false?'currentColor':'none'}/>
              </div>
              <span className={`font-black text-xs uppercase tracking-wide ${
                isPositive===false ? 'text-rose-700' : 'text-gray-400'
              }`}>Negative</span>
            </button>
          </div>

          {/* Selected sentiment label */}
          {isPositive!==null&&(
            <p className="text-center text-xs font-bold"
              style={{color:isPositive?'#059669':'#EF4444'}}>
              {isPositive?'👍 Great experience!':'👎 Bad experience'}
            </p>
          )}

          {/* Comment textarea */}
          <textarea value={comment} onChange={e=>setComment(e.target.value)}
            placeholder={placeholder}
            rows={3}
            disabled={isPositive===null}
            className="w-full px-3 py-2.5 border-2 rounded-xl text-sm focus:outline-none resize-none transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              borderColor: isPositive===false ? '#FCA5A5' : isPositive===true ? '#6EE7B7' : C.g200,
            }}/>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm border"
              style={{borderColor:C.g200,color:C.g600}}>Skip</button>
            <button onClick={()=>onSubmit(rating,comment)} disabled={submitting||!canSubmit}
              className="flex-1 py-2.5 rounded-xl font-black text-sm disabled:opacity-40 transition"
              style={{
                backgroundColor: isPositive===false ? '#EF4444' : C.gold,
                color: isPositive===false ? '#fff' : C.forest,
              }}>
              {submitting?'Submitting…':'Submit Feedback'}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes bounceIn {0%{transform:scale(0.85) translateY(20px);opacity:0;}60%{transform:scale(1.03) translateY(-8px);opacity:1;}100%{transform:scale(1) translateY(0);opacity:1;}} .animate-bounceIn{animation:bounceIn 0.55s ease-out;} @keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}} .animate-slideUp{animation:slideUp 0.3s ease-out;}`}</style>
    </div>
  );
}

// ─── Confirm action modal (Pay / Release) ────────────────────────────────────
function ConfirmActionModal({icon:Icon, iconBg, title, lines, confirmLabel, confirmBg, confirmColor='#fff', onClose, onConfirm, submitting}) {
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}}>
      <div className="w-full sm:max-w-[360px] max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor:'#fff',
          borderRadius:'20px 20px 0 0',
          overflow:'hidden',
          boxShadow:'0 25px 60px rgba(0,0,0,0.3)',
          animation:'slideUp .3s ease',
          boxSizing:'border-box',
        }}>
        {/* Icon + title */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'24px 20px 16px'}}>
          <div style={{
            width:56,height:56,borderRadius:14,
            display:'flex',alignItems:'center',justifyContent:'center',
            backgroundColor:iconBg,marginBottom:12,
            boxShadow:'0 4px 14px rgba(0,0,0,0.15)',
          }}>
            <Icon size={26} style={{color:'#fff'}}/>
          </div>
          <p style={{fontWeight:900,fontSize:16,color:'#1E293B',margin:0,textAlign:'center'}}>{title}</p>
        </div>

        {/* Info lines */}
        <div style={{padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:8}}>
          {lines.map((l,i)=>(
            <div key={i} style={{
              display:'flex',alignItems:'flex-start',gap:10,
              padding:'10px 12px',borderRadius:12,backgroundColor:'#F8FAFC',
              boxSizing:'border-box',
            }}>
              <span style={{fontSize:16,flexShrink:0,lineHeight:1.3}}>{l.icon}</span>
              <p style={{fontSize:12,color:'#334155',margin:0,lineHeight:1.5}}>{l.text}</p>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:'0 16px 20px',boxSizing:'border-box'}}>
          <button onClick={onClose} disabled={submitting}
            style={{
              padding:'13px 0',borderRadius:14,fontWeight:700,fontSize:13,
              border:'2px solid #E2E8F0',backgroundColor:'#fff',color:'#64748B',
              cursor:'pointer',
            }}>
            Go Back
          </button>
          <button onClick={onConfirm} disabled={submitting}
            style={{
              padding:'13px 0',borderRadius:14,fontWeight:900,fontSize:13,
              backgroundColor:confirmBg,color:confirmColor,border:'none',
              cursor:submitting?'not-allowed':'pointer',
              opacity:submitting?0.5:1,
              display:'flex',alignItems:'center',justifyContent:'center',gap:6,
            }}>
            {submitting?<><RefreshCw size={14} style={{animation:'spin 1s linear infinite'}}/>Processing…</>:confirmLabel}
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Cancel modal ─────────────────────────────────────────────────────────────
function CancelModal({onClose,onConfirm,submitting}) {
  const [reason,setReason]=useState('');
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}}>
      <div className="w-full sm:max-w-[360px] max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor:'#fff',
          borderRadius:'20px 20px 0 0',
          overflow:'hidden',
          boxShadow:'0 25px 60px rgba(0,0,0,0.3)',
          animation:'slideUp .3s ease',
        }}>
        {/* Header */}
        <div style={{padding:'20px 20px 16px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',gap:'12px'}}>
          <div style={{width:42,height:42,borderRadius:12,backgroundColor:'#FEE2E2',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <AlertTriangle size={20} style={{color:C.danger}}/>
          </div>
          <div>
            <p style={{fontWeight:900,fontSize:15,color:'#1E293B',margin:0}}>Cancel Trade?</p>
            <p style={{fontSize:12,color:C.g500,margin:0,marginTop:2}}>Escrow returns to seller</p>
          </div>
        </div>

        {/* Body */}
        <div style={{padding:'16px 20px 20px'}}>
          <p style={{fontSize:12,color:C.g600,marginBottom:8,fontWeight:600}}>Reason for cancelling:</p>
          <textarea
            value={reason}
            onChange={e=>setReason(e.target.value)}
            placeholder="e.g. Payment method not working…"
            rows={3}
            style={{
              width:'100%',boxSizing:'border-box',
              padding:'10px 12px',fontSize:13,
              border:`2px solid ${reason.trim()?C.danger:C.g200}`,
              borderRadius:12,outline:'none',resize:'none',
              fontFamily:'inherit',color:'#1E293B',
            }}
          />
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:14}}>
            <button onClick={onClose} disabled={submitting}
              style={{
                padding:'12px 0',borderRadius:14,fontWeight:700,fontSize:13,
                border:`2px solid ${C.g200}`,backgroundColor:'#fff',color:C.g600,
                cursor:'pointer',
              }}>
              Go Back
            </button>
            <button onClick={()=>onConfirm(reason)} disabled={!reason.trim()||submitting}
              style={{
                padding:'12px 0',borderRadius:14,fontWeight:900,fontSize:13,
                backgroundColor:C.danger,color:'#fff',border:'none',
                cursor:reason.trim()&&!submitting?'pointer':'not-allowed',
                opacity:reason.trim()&&!submitting?1:0.45,
                display:'flex',alignItems:'center',justifyContent:'center',gap:6,
              }}>
              {submitting?<><RefreshCw size={13} style={{animation:'spin 1s linear infinite'}}/>Cancelling…</>:'Confirm Cancel'}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Image viewer ─────────────────────────────────────────────────────────────
function ImgModal({src,onClose}) {
  return(
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <img src={src} alt="Proof" className="max-w-full max-h-screen object-contain rounded-xl"/>
      <button onClick={onClose} className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg"><X size={20}/></button>
    </div>
  );
}

// ─── User profile popup ───────────────────────────────────────────────────────
function ProfilePopup({user,label,onClose}) {
  if(!user) return null;
  const badge=deriveBadge(user);
  const flag=isoToFlag(user.country||'');
  const rating=parseFloat(user.average_rating||0);
  const seen=fmtAge(user.last_login||user.updated_at);
  const online=seen==='Online';
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div className="bg-white w-full sm:max-w-xs rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{animation:'slideUp .3s ease'}} onClick={e=>e.stopPropagation()}>
        <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}}`}</style>
        <div className="relative p-5 text-white"
          style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
          <button onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <X size={13} className="text-white"/>
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <Avatar user={user} size={52} radius="rounded-2xl"/>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
                style={{backgroundColor:online?C.online:C.g400}}/>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-black text-lg">{user.username}</h3>
                {user.kyc_verified&&<BadgeCheck size={14} style={{color:'#93C5FD'}}/>}
              </div>
              <span className={`inline-flex items-center gap-0.5 text-xs font-black px-1.5 py-0.5 rounded-full border ${badge.animate?'shadow-md':''}`}
                style={{background:badge.bg,borderColor:badge.borderColor,boxShadow:badge.glow?`0 0 8px ${badge.glow}`:undefined}}>
                <span style={{color:badge.iconColor||badge.textColor}}>{badge.icon}</span>
                <span style={{color:badge.textColor}}>{badge.label}</span>
              </span>
            </div>
          </div>
          <div className="flex gap-0.5 mb-1">
            {[1,2,3,4,5].map(s=><Star key={s} size={14} className={s<=Math.round(rating)?'fill-yellow-400 text-yellow-400':'text-white/30'}/>)}
            <span className="text-white font-bold text-xs ml-1">{rating.toFixed(1)}</span>
          </div>
          <p className="text-white/60 text-xs flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:online?C.online:C.g400}}/>{seen}
            {user.country&&<span className="ml-2">{flag} {user.country}</span>}
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2 mb-3">
            {(()=>{
              // Normalize completion: could be 0.21 or 21.4 or 21.428571...
              const raw = parseFloat(user.completion_rate||0);
              const comp = (raw > 0 && raw <= 1) ? (raw*100).toFixed(1) : raw.toFixed(1);
              return [
                {label:'Trades',     value:fmt(user.total_trades||0),        color:C.green},
                {label:'Rating',     value:`${rating.toFixed(1)}★`,           color:C.warn},
                {label:'Completion', value:`${comp}%`,                        color:C.success},
                {label:'Reviews',    value:fmt(user.feedback_count||0),       color:C.paid},
              ];
            })().map(s=>(
              <div key={s.label} className="text-center p-2.5 rounded-xl" style={{backgroundColor:C.g50}}>
                <p className="font-black text-sm" style={{color:s.color}}>{s.value}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-0 border-t pt-2" style={{borderColor:C.g100}}>
            {[
              {label:'Location',     value:`${flag} ${user.country||'—'}`},
              {label:'Member since', value:user.created_at?new Date(user.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'}):'—'},
              {label:'Identity',     value:user.kyc_verified?'✅ KYC Verified':'Not verified'},
              {label:'Response',     value:'< 5 minutes'},
            ].map(({label,value})=>(
              <div key={label} className="flex justify-between text-xs py-1.5 border-b last:border-0"
                style={{borderColor:C.g50}}>
                <span style={{color:C.g400}}>{label}</span>
                <span className="font-bold" style={{color:C.g700}}>{value}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-center mt-2" style={{color:C.g400}}>
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Offer terms accordion ────────────────────────────────────────────────────
function OfferTerms({trade}) {
  const [open,setOpen]=useState(false);
  const terms=trade?.trade_instructions||trade?.listing_terms||trade?.offer_terms||
    'Standard trade rules apply. Send payment within the time limit and click "I Have Paid". Include trade ID as reference.';
  return(
    <div className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{borderColor:C.g200}}>
      <button onClick={()=>setOpen(!open)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50 transition">
        <FileText size={13} style={{color:C.green}}/>
        <span className="text-xs font-bold flex-1" style={{color:C.g700}}>Trade Instructions</span>
        {open?<ChevronUp size={12} style={{color:C.g400}}/>:<ChevronDown size={12} style={{color:C.g400}}/>}
      </button>
      {open&&(
        <div className="border-t px-3 pb-3 pt-2 text-xs leading-relaxed whitespace-pre-wrap"
          style={{borderColor:C.g100,color:C.g600}}>
          {terms}
        </div>
      )}
    </div>
  );
}

// ─── Main Trade Detail ────────────────────────────────────────────────────────
export default function TradeDetail({user}) {
  const {id}       = useParams();
  const navigate   = useNavigate();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  const msgEnd     = useRef(null);
  const chatRef    = useRef(null);
  const fileRef    = useRef(null);
  const scrolled        = useRef(false);
  const prevMsgCount    = useRef(0);
  const autoCancelled   = useRef(false);
  const typingTimer     = useRef(null);

  const [trade,     setTrade]     = useState(null);
  const [btcPrice,  setBtcPrice]  = useState(68000); // Default to standard market price during load
  const [seller,    setSeller]    = useState(null);
  const [buyer,     setBuyer]     = useState(null);
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [msg,       setMsg]       = useState('');
  const [sending,   setSending]   = useState(false);
  const [submitting,setSubmitting]= useState(false);
  const [uploading, setUploading] = useState(false);
  const [images,    setImages]    = useState([]);
  const [timeLeft,  setTimeLeft]  = useState(null);
  const [showCancel,     setShowCancel]     = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [showRelConfirm, setShowRelConfirm] = useState(false);
  const [showFb,         setShowFb]         = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [tradeCompleted, setTradeCompleted] = useState(false);
  const [imgSrc,    setImgSrc]    = useState(null);
  const [fbSub,     setFbSub]     = useState(false);
  const [profUser,  setProfUser]  = useState(null);
  const [profLabel, setProfLabel] = useState('');
  const [loadErr,   setLoadErr]   = useState(false);
  const [infoOpen,  setInfoOpen]  = useState(false);
  const [cpTyping,  setCpTyping]  = useState(false);

  const status = (trade?.status||'').toUpperCase();
  const isBuyer     = user&&trade&&String(user.id)===String(trade.buyer_id);
  const isSeller    = user&&trade&&String(user.id)===String(trade.seller_id);
  const isCompleted = status==='COMPLETED';
  const isCancelled = status==='CANCELLED';
  const isDisputed  = status==='DISPUTED';
  const isPaid      = ['PAYMENT_SENT','PAID'].includes(status);
  const isEscrow    = ['CREATED','FUNDS_LOCKED','ESCROW','ACTIVE','OPEN'].includes(status);

  useEffect(() => {
    if (contextBtcUsd > 0) setBtcPrice(contextBtcUsd);
  }, [contextBtcUsd]);

  const isActive    = !isCompleted&&!isCancelled;
  const cfg         = getS(status);
  const CfgIcon     = cfg.icon;
  const tradeAge    = trade?.created_at ? (()=>{
    const diff=Math.floor((Date.now()-new Date(trade.created_at))/1000);
    if(diff<3600)return`${Math.floor(diff/60)} min ago`;
    if(diff<86400)return`${Math.floor(diff/3600)}h ago`;
    return`${Math.floor(diff/86400)}d ago`;
  })() : '—';

  useEffect(()=>{
    if(!user){navigate('/login');return;}
    if(!id)return;
    loadAll();
    const iv=setInterval(()=>{refreshTrade();loadMessages();},5000);
    const tv=setInterval(()=>{fetchTyping();},2000);
    return()=>{clearInterval(iv);clearInterval(tv);};
  },[id,user]);

  useEffect(()=>{
    if(!trade?.created_at||!isActive)return;
    // Use the stored expires_at (authoritative). Fallback to created_at + time_limit for old trades.
    const deadline = trade.expires_at
      ? new Date(trade.expires_at).getTime()
      : new Date(trade.created_at).getTime() + (Math.max(trade?.listing?.time_limit||0, trade?.time_limit||0, 30)) * 60 * 1000;
    const iv=setInterval(()=>{
      const rem=Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setTimeLeft(rem);
      if(rem<=0 && isEscrow && !autoCancelled.current){
        autoCancelled.current = true;
        clearInterval(iv);
        autoCancel();
      }
    },1000);
    return()=>clearInterval(iv);
  },[trade?.expires_at,trade?.created_at,status]);

  useEffect(()=>{
    if(isCompleted && !trade?.user_gave_feedback && !tradeCompleted){
      const t=setTimeout(()=>setShowFb(true),1500);
      return()=>clearTimeout(t);
    }
  },[isCompleted, trade?.user_gave_feedback, tradeCompleted]);

  useEffect(()=>{
    if(messages.length===0)return;
    const isNewMsg=messages.length>prevMsgCount.current;
    prevMsgCount.current=messages.length;
    if(!isNewMsg||!scrolled.current)return;
    const el=chatRef.current;
    if(!el)return;
    const distFromBottom=el.scrollHeight-el.scrollTop-el.clientHeight;
    if(distFromBottom<150) el.scrollTop=el.scrollHeight;
  },[messages]);

  const loadAll=async()=>{
    await loadTrade();
    await loadMessages();
    await loadImages();
  };

  const loadTrade=async()=>{
    if(!id)return;
    try{
      setLoadErr(false);
      const r=await axios.get(`${API_URL}/trades/${id}`,{headers:authH()});
      const t=r.data.trade;
      setTrade(t);
      if(t.seller_id)try{const s=await axios.get(`${API_URL}/users/${t.seller_id}`,{headers:authH()});setSeller(s.data.user||s.data);}catch{}
      if(t.buyer_id) try{const b=await axios.get(`${API_URL}/users/${t.buyer_id}`, {headers:authH()});setBuyer(b.data.user||b.data);}catch{}
    }catch(e){
      setLoadErr(true);
      if(e.response?.status===400)toast.error('Trade not found');
      else toast.error('Failed to load trade');
    }finally{setLoading(false);}
  };

  const refreshTrade=async()=>{
    if(!id)return;
    try{
      const r=await axios.get(`${API_URL}/trades/${id}`,{headers:authH()});
      setTrade(r.data.trade);
    }catch{}
  };

  const loadMessages=async()=>{
    if(!id)return;
    try{
      const r=await axios.get(`${API_URL}/messages/${id}`,{headers:authH()});
      const msgs=r.data.messages||[];
      setMessages(msgs);
      if(!scrolled.current&&msgs.length>0){
        scrolled.current=true;
        setTimeout(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},100);
      }
    }catch{}
  };

  const loadImages=async()=>{
    if(!id)return;
    try{const r=await axios.get(`${API_URL}/trades/${id}/images`,{headers:authH()});setImages(r.data.images||[]);}catch{}
  };

  const fetchTyping=async()=>{
    if(!id)return;
    try{const r=await axios.get(`${API_URL}/trades/${id}/typing`,{headers:authH()});setCpTyping(!!r.data.isTyping);}catch{}
  };

  const sendTypingPing=()=>{
    if(!id)return;
    clearTimeout(typingTimer.current);
    axios.post(`${API_URL}/trades/${id}/typing`,{},{headers:authH()}).catch(()=>{});
    typingTimer.current=setTimeout(()=>{},3000);
  };

  const postSys=async(text)=>{
    try{await axios.post(`${API_URL}/messages`,{tradeId:id,message:text},{headers:authH()});await loadMessages();}catch{}
  };

  const sendMessage=async(e)=>{
    e.preventDefault();
    if(!msg.trim())return;
    setSending(true);
    try{
      await axios.post(`${API_URL}/messages`,{tradeId:id,message:msg},{headers:authH()});
      setMsg('');await loadMessages();
      setTimeout(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},100);
    }catch{toast.error('Send failed');}
    finally{setSending(false);}
  };

  const uploadImage=async(file)=>{
    if(!file||!file.type.startsWith('image/')){toast.error('Select an image');return;}
    if(file.size>5*1024*1024){toast.error('Max 5MB');return;}
    setUploading(true);
    try{
      const b64=await new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.onerror=rej;rd.readAsDataURL(file);});
      await axios.post(`${API_URL}/trades/${id}/upload-image`,{image:b64,type:isBuyer?'payment':'giftcard'},{headers:authH()});
      // Send as a real chat message so both users see the image inline
      await axios.post(`${API_URL}/messages`,{tradeId:id,message:b64},{headers:authH()});
      toast.success('Uploaded! Image sent in chat.');
      await loadImages();await loadMessages();
      setTimeout(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},100);
    }catch{toast.error('Upload failed');}
    finally{setUploading(false);if(fileRef.current)fileRef.current.value='';}
  };

  const markPaid=async()=>{
    setShowPayConfirm(false);
    setSubmitting(true);
    try{
      await axios.post(`${API_URL}/trades/${id}/mark-paid`,{},{headers:authH()});
      const sysMsg = isGiftCardTrade
        ? '🎁 Seller sent the gift card code. Buyer: verify the code and release Bitcoin.'
        : '💰 Buyer confirmed payment sent. Seller: verify and release Bitcoin.';
      await postSys(sysMsg);
      toast.success(isGiftCardTrade ? 'Code sent! Waiting for buyer to verify.' : 'Payment confirmed!');
      await loadTrade();
    }catch(e){toast.error(e?.response?.data?.error||'Failed');}
    finally{setSubmitting(false);}
  };

  const releaseBtc=async()=>{
    setShowRelConfirm(false);
    setSubmitting(true);
    try{
      await axios.post(`${API_URL}/trades/${id}/release`,{},{headers:authH()});
      await postSys('🎉 TRADE COMPLETE! Bitcoin has been released to the buyer. Congratulations to both parties — always come back and trade safely on PRAQEN! 🙌');
      toast.success('✅ Trade complete! Please leave feedback.');
      setTradeCompleted(true);
      setShowSuccessModal(true);
      await loadTrade();
    }catch(e){toast.error(e?.response?.data?.error||'Failed');}
    finally{setSubmitting(false);}
  };

  const cancelTrade=async(reason)=>{
    setSubmitting(true);
    try{
      await axios.post(`${API_URL}/trades/${id}/cancel`,{reason},{headers:authH()});
      await postSys(`❌ Trade cancelled. Reason: ${reason}. Escrow funds returned.`);
      toast.info('Cancelled');setShowCancel(false);await loadTrade();
    }catch(e){
      console.error('Cancel trade error:', e);
      toast.error(e?.response?.data?.error || 'Failed to cancel trade. Please try again.');
    }
    finally{setSubmitting(false);}
  };

  const autoCancel=async()=>{
    try{
      await axios.post(`${API_URL}/trades/${id}/auto-cancel`,{reason:'30-minute payment window expired'},{headers:authH()});
      await postSys('⏰ Time expired — 30-minute payment window closed. Trade cancelled and Bitcoin returned to seller\'s wallet.');
      toast.warning('⏰ Time expired — Bitcoin returned to seller wallet');
      await loadTrade();
    }catch(e){console.error('Auto cancel error:',e);}
  };

  const openDispute=async()=>{
    const reason=window.prompt('Please explain why you are opening a dispute:');
    if(!reason?.trim()){toast.error('Please provide a reason');return;}
    if(!window.confirm('Open a dispute? A moderator will review within 24h.'))return;
    try{
      await axios.post(`${API_URL}/trades/${id}/dispute`,{reason},{headers:authH()});
      await postSys(`🚨 DISPUTE OPENED. Reason: ${reason}. Moderator will review within 24 hours.`);
      toast.warning('Dispute opened.');await loadTrade();
    }catch{toast.error('Failed');}
  };

  const submitFeedback=async(rating,comment)=>{
    setFbSub(true);
    try{
      await axios.post(`${API_URL}/trades/${id}/feedback`,{rating,comment,toUserId:isBuyer?trade.seller_id:trade.buyer_id},{headers:authH()});
      toast.success('Feedback submitted!');
      setShowFb(false);
      setShowSuccessModal(false);
      await loadTrade();
    }catch(e){toast.error(e?.response?.data?.error||'Failed');}
    finally{setFbSub(false);}
  };

  const fmtTimer=s=>{
    if(s===null||s===undefined)return'--:--';
    if(s<=0)return'00:00';
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
    return h>0?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`
      :`${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
  };

  if(loading) return(
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-full border-4 animate-spin mx-auto" style={{borderColor:C.sage,borderTopColor:'transparent'}}/>
        <p className="text-sm font-semibold" style={{color:C.green}}>Loading trade…</p>
      </div>
    </div>
  );

  if(loadErr||!trade) return(
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center space-y-4 p-8 bg-white rounded-2xl shadow-lg max-w-md">
        <AlertCircle size={56} style={{color:C.danger}} className="mx-auto"/>
        <p className="font-black text-xl" style={{color:C.forest}}>Trade not found</p>
        <p className="text-sm text-gray-500">This trade doesn't exist or you don't have access.</p>
        <button onClick={()=>navigate('/dashboard')} className="px-6 py-2.5 rounded-xl font-bold text-white text-sm" style={{backgroundColor:C.green}}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );

  // ── REAL DATA CALCULATIONS ──────────────────────────────────────────────────
  const shortId    = (trade.id||'').slice(0,8).toUpperCase();
  const cur        = trade.local_currency || trade.currency || trade.listing?.currency || 'GHS';
  const sym        = CUR_SYM[cur] || trade.currency_symbol || trade.listing?.currency_symbol || '₵';

  // VERIFIED FORMULAS
  const userPays    = parseFloat(trade.amount_local || (parseFloat(trade.amount_usd || 0) * (USD_RATES[cur] || 1)) || 0);
  const margin      = parseFloat(trade.margin || trade.listing?.margin || 0);
  const btcReceived = parseFloat(trade.amount_btc || 0); // From database (already correct)

  // btcValueInLocal calculation: local amount / (1 + margin%) = Market value of the received BTC
  const btcValueInLocal = margin !== 0 ? userPays / (1 + margin / 100) : userPays;

  // Back-calculate Gross BTC and Fee for the expandable breakdown
  const FEE_RATE     = 0.005;
  const btcGross     = btcReceived / (1 - FEE_RATE);
  const feeBtc       = btcGross - btcReceived;

  // Rate locked at trade creation
  const sellerRate   = parseFloat(trade.seller_rate_local || trade.seller_rate || (btcGross > 0 ? userPays / btcGross : 0));

  const localAmt     = userPays; // map for legacy button logic
  const usdRate      = (USD_RATES && USD_RATES[cur]) ? USD_RATES[cur] : 0;
  const timeLimit    = trade?.listing?.time_limit || trade?.time_limit || 30;
  const urgent       = timeLeft !== null && timeLeft < 300 && timeLeft > 0;
  const payMethod    = trade.payment_method || 'Mobile Money';

  // Counterparty
  const cp         = isBuyer?seller:buyer;
  const cpBadge    = deriveBadge(cp);
  const cpSeen     = fmtAge(cp?.last_login||cp?.updated_at);
  const cpOnline   = cpSeen==='Online';
  const cpPos      = parseInt(cp?.positive_feedback||0);
  const cpNeg      = parseInt(cp?.negative_feedback||0);
  const cpFeedbackPct = (cpPos+cpNeg)>0 ? ((cpPos/(cpPos+cpNeg))*100).toFixed(1) : (parseFloat(cp?.completion_rate||100).toFixed(1));

  // Gift card trade: card SELLER marks "sent code", BTC BUYER releases after confirming
  // BTC trade:       BTC BUYER marks "sent payment", BTC SELLER releases after confirming
  //
  // IMPORTANT: gift_card_brand = 'Bitcoin' means it is a BTC trade, NOT a gift card trade.
  // Only trust the listing_type from the Supabase join. The gift_card_brand field alone
  // is unreliable because some Bitcoin listings have gift_card_brand = 'Bitcoin'.
  const gcBrand = (trade?.gift_card_brand || '').toLowerCase().trim();
  const BTCBrands = ['bitcoin', 'btc', 'sell bitcoin', 'buy bitcoin', ''];
  const isGiftCardTrade = !!(
    (gcBrand && !BTCBrands.includes(gcBrand)) ||
    trade?.listing?.listing_type?.includes('GIFT_CARD')
  );
  const showMarkPaid  = isGiftCardTrade ? (isSeller&&isEscrow&&isActive) : (isBuyer&&isEscrow&&isActive);
  const showRelease   = isGiftCardTrade ? (isBuyer&&isPaid&&isActive)    : (isSeller&&isPaid&&isActive);
  // Trade opener = buyer when trade_type is BUY, seller when trade_type is SELL
  const isTradeOpener = (trade.trade_type||'').toUpperCase()==='BUY' ? isBuyer : isSeller;
  const showCancelBtn = isTradeOpener&&isEscrow&&isActive;
  const showDispute   = isActive&&!isDisputed&&(isBuyer||isSeller);

  // Read receipts: timestamp of the last message the counterparty sent
  const lastCpMsgTime = messages
    .filter(m=>m.sender_id&&String(m.sender_id)!==String(user?.id))
    .reduce((max,m)=>Math.max(max,new Date(m.created_at).getTime()),0);

  return(
    <div className="min-h-screen flex flex-col" style={{backgroundColor:C.g50,fontFamily:"'DM Sans',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-3 py-3 pb-4">

        <div className="grid lg:grid-cols-12 gap-3 lg:[height:calc(100vh-56px)]">

          {/* ── LEFT PANEL ───────────────────────────────────────────────── */}
          <div className="order-2 lg:order-1 lg:col-span-4 space-y-3 lg:overflow-y-auto pb-3 lg:[max-height:calc(100vh-56px)]">

            {/* ── TRADE PROGRESS ───────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border shadow-sm p-4" style={{borderColor:C.g200}}>
              <p className="text-xs font-black uppercase tracking-wider mb-3" style={{color:C.g400}}>📋 Trade Progress</p>
              <div className="space-y-2.5">
                {(isGiftCardTrade ? [
                  {label:'Trade opened — Alice\'s BTC locked in escrow',  done:true},
                  {label:'Card seller sends gift card code to buyer',      done:isPaid||isCompleted},
                  {label:'Buyer verifies the code is valid',              done:isCompleted},
                  {label:'Buyer releases BTC to card seller (0.5% fee)',  done:isCompleted},
                ] : [
                  {label:'Trade opened — BTC locked in escrow',           done:true},
                  {label:`Buyer sends payment via ${payMethod}`,          done:isPaid||isCompleted},
                  {label:'Seller confirms payment received',              done:isPaid||isCompleted},
                  {label:'Bitcoin released to buyer (0.5% fee deducted)', done:isCompleted},
                ]).map(({label,done},i)=>(
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{backgroundColor:done?C.green:C.g200}}>
                      {done?<Check size={11} className="text-white"/>
                        :<div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:C.g400}}/>}
                    </div>
                    <span className="text-xs leading-tight"
                      style={{color:done?C.g700:C.g400,fontWeight:done?600:400}}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── ACTION BUTTONS ───────────────────────────────────────── */}
            <div className="space-y-2">

              {/* ── WHAT TO DO NEXT — instruction banner ─────────────── */}
              {isActive&&isEscrow&&(
                <div className="p-3 rounded-xl text-xs font-semibold border"
                  style={{backgroundColor:'#FFFBEB',borderColor:'#FDE68A',color:'#92400E'}}>
                  {isGiftCardTrade
                    ? isSeller
                      ? '🎁 Your turn: Send your gift card code to the buyer in the chat, then click "I SENT THE CODE".'
                      : '⏳ Waiting for the card seller to send you the gift card code…'
                    : isBuyer
                      ? `💳 Your turn: Send ${payMethod} payment now, then click "I HAVE PAID" to notify the seller.`
                      : '⏳ Waiting for the buyer to send payment…'}
                </div>
              )}
              {isActive&&isPaid&&(
                <div className="p-3 rounded-xl text-xs font-semibold border"
                  style={{backgroundColor:isGiftCardTrade?'#F0FDF4':'#EFF6FF',
                          borderColor:isGiftCardTrade?'#86EFAC':'#BFDBFE',
                          color:isGiftCardTrade?'#166534':'#1E40AF'}}>
                  {isGiftCardTrade
                    ? isBuyer
                      ? '✅ Code received! Test it now — if it works, click "RELEASE BITCOIN" to pay the seller.'
                      : '⏳ Buyer is verifying your gift card code. BTC releases once they confirm.'
                    : isSeller
                      ? '💰 Buyer confirmed payment sent. Verify you received it, then click "RELEASE BITCOIN".'
                      : '⏳ Payment confirmed — waiting for seller to verify and release your Bitcoin.'}
                </div>
              )}

              {/* ── MARK PAID / SENT CODE button — desktop only; mobile uses sticky bar ── */}
              {showMarkPaid&&(
                <button onClick={()=>setShowPayConfirm(true)} disabled={submitting}
                  className="hidden lg:flex w-full py-4 rounded-xl font-black text-base shadow-lg hover:opacity-90 disabled:opacity-50 items-center justify-center gap-2 transition"
                  style={{backgroundColor:C.gold,color:C.forest}}>
                  {submitting
                    ?<><RefreshCw size={16} className="animate-spin"/>Processing…</>
                    :isGiftCardTrade
                      ?<><Check size={18}/>🎁 I SENT THE CODE</>
                      :<><Check size={18}/>✅ I HAVE PAID</>}
                </button>
              )}

              {/* ── RELEASE BITCOIN button — desktop only; mobile uses sticky bar ── */}
              {showRelease&&(
                <button onClick={()=>setShowRelConfirm(true)} disabled={submitting}
                  className="hidden lg:flex w-full py-4 rounded-xl text-white font-black text-base shadow-lg hover:opacity-90 disabled:opacity-50 items-center justify-center gap-2 transition"
                  style={{backgroundColor:C.green}}>
                  {submitting
                    ?<><RefreshCw size={16} className="animate-spin"/>Processing…</>
                    :<><Bitcoin size={18}/>🔓 RELEASE BITCOIN</>}
                </button>
              )}
              {showDispute&&(
                <button onClick={openDispute}
                  className="w-full py-2.5 rounded-xl font-semibold text-xs border flex items-center justify-center gap-1.5 hover:bg-red-50 transition"
                  style={{borderColor:`${C.danger}40`,color:C.danger}}>
                  <Flag size={12}/> Open Dispute
                </button>
              )}
              {showCancelBtn&&(
                <button onClick={()=>setShowCancel(true)}
                  className="w-full py-2 rounded-xl font-semibold text-xs border hover:bg-gray-50 transition"
                  style={{borderColor:C.g200,color:C.g500}}>
                  Cancel Trade
                </button>
              )}
              {isCompleted&&(
                <div className="py-4 px-5 rounded-xl text-center text-white shadow"
                  style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
                  <CheckCircle size={24} className="mx-auto mb-1"/>
                  <p className="font-black text-sm">Trade Complete 🎉</p>
                  <p className="text-xs text-white/60 mt-0.5">0.5% fee auto-collected by escrow</p>
                  {!trade?.user_gave_feedback&&(
                    <button onClick={()=>setShowFb(true)} className="mt-2 text-xs underline text-white/80">
                      Leave feedback →
                    </button>
                  )}
                </div>
              )}
              {isCancelled&&(
                <div className="py-3 px-5 rounded-xl text-center border" style={{backgroundColor:C.g100,borderColor:C.g200}}>
                  <X size={20} className="mx-auto mb-1" style={{color:C.g500}}/>
                  <p className="font-bold text-sm" style={{color:C.g700}}>Trade Cancelled</p>
                  <p className="text-xs mt-0.5" style={{color:C.g400}}>Escrow funds returned</p>
                </div>
              )}
              {isDisputed&&(
                <div className="py-3 px-5 rounded-xl text-center text-white"
                  style={{backgroundColor:C.danger}}>
                  <AlertTriangle size={20} className="mx-auto mb-1"/>
                  <p className="font-bold text-sm">Dispute Active</p>
                  <p className="text-xs text-white/70 mt-0.5">Moderator reviews within 24h</p>
                </div>
              )}
            </div>

            {/* Trade instructions accordion */}
            <OfferTerms trade={trade}/>

            {/* ── TRADE INFO + ACTIONS — single collapsible ─────────── */}
            {(()=>{

              return(
                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{borderColor:C.g200}}>
                  {/* Accordion header */}
                  <button onClick={()=>setInfoOpen(!infoOpen)}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition"
                    style={{borderBottom:infoOpen?`1px solid ${C.g100}`:'none'}}>
                    <Info size={13} style={{color:C.green}}/>
                    <span className="text-xs font-black flex-1 text-left" style={{color:C.forest}}>
                      Trade Info & Actions
                    </span>
                    <span className="text-xs font-mono mr-1" style={{color:C.g400}}>#{shortId}</span>
                    {infoOpen?<ChevronUp size={13} style={{color:C.g400}}/>:<ChevronDown size={13} style={{color:C.g400}}/>}
                  </button>

                  {infoOpen&&(
                    <div className="p-3 space-y-1">
                      {/* Info rows */}
                      {[
                        {label:'Trade ID',    val:<div className="flex items-center gap-1.5"><span className="font-mono font-bold text-xs" style={{color:C.forest}}>#{shortId}</span><button onClick={()=>{navigator.clipboard.writeText(trade.id||'');toast.success('Copied!');}} className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100"><Copy size={10} style={{color:C.g400}}/></button></div>},
                        {label:'Offer',       val:<div className="flex items-center gap-1.5"><span className="font-mono font-bold text-xs" style={{color:C.g700}}>#{String(trade.listing_id||'').slice(0,8).toUpperCase()}</span><button onClick={()=>{navigator.clipboard.writeText(trade.listing_id||'');toast.success('Copied!');}} className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100"><Copy size={10} style={{color:C.g400}}/></button></div>},
                        {label:'Started',     val:<span className="font-bold text-xs" style={{color:C.g700}}>{tradeAge}</span>},
                        {label:'Rate',        val:<span className="font-black text-xs" style={{color:C.forest}}>{sym}{fmt(sellerRate)} {cur}/BTC</span>},
                        {label:'Payment',     val:<span className="font-bold text-xs" style={{color:C.g700}}>{payMethod}</span>},
                        {label:'Status',      val:<span className="font-black text-xs px-2 py-0.5 rounded-full" style={{backgroundColor:cfg.bg,color:cfg.color}}>{cfg.label}</span>},
                      ].map(({label,val})=>(
                        <div key={label} className="flex items-center justify-between py-1.5 border-b last:border-0 text-xs"
                          style={{borderColor:C.g50}}>
                          <span style={{color:C.g400}}>{label}</span>
                          {val}
                        </div>
                      ))}

                      {/* Actions */}
                      <div className="pt-2 space-y-1.5">
                        <p className="text-xs font-black uppercase tracking-widest" style={{color:C.g400}}>Actions</p>

                        <button onClick={()=>{navigator.clipboard.writeText(trade.id||'');toast.success('Trade ID copied!');}}
                          className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-gray-50 transition text-left border"
                          style={{borderColor:C.g100}}>
                          <Copy size={12} style={{color:C.paid}}/>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black" style={{color:C.g700}}>Copy Trade ID</p>
                            <p className="text-xs font-mono truncate" style={{color:C.g400}}>{(trade.id||'').slice(0,20)}…</p>
                          </div>
                        </button>

                        <button
                          onClick={()=>{
                            const reason=window.prompt('Describe the problem:');
                            if(!reason?.trim())return;
                            const sub=encodeURIComponent(`Trade Report: #${shortId}`);
                            const body=encodeURIComponent(`Trade ID: ${trade.id}\nOffer: ${trade.listing_id||'—'}\nProblem: ${reason}\nUser: ${user?.username||'—'}`);
                            window.open(`mailto:support@praqen.com?subject=${sub}&body=${body}`,'_blank');
                            toast.info('Email opened to report trade');
                          }}
                          className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-red-50 transition text-left border"
                          style={{borderColor:C.g100}}>
                          <Flag size={12} style={{color:C.danger}}/>
                          <p className="text-xs font-black" style={{color:C.danger}}>Report a Problem</p>
                        </button>

                        <a href="https://chat.whatsapp.com/LHVjrw9SK8qGoXcKvprjWz?mode=gi_t"
                          target="_blank" rel="noopener noreferrer"
                          className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-green-50 transition border"
                          style={{borderColor:C.g100}}>
                          <MessageCircle size={12} style={{color:C.success}}/>
                          <p className="text-xs font-black" style={{color:C.forest}}>Reach PRAQEN Support</p>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Escrow info */}
            <div className="bg-white rounded-2xl border p-4 space-y-1.5" style={{borderColor:C.g200}}>
              <div className="flex items-center gap-2 mb-2">
                <Shield size={13} style={{color:C.green}}/>
                <span className="text-xs font-black" style={{color:C.forest}}>Escrow Protection</span>
              </div>
              {[
                '🔒 BTC locked in escrow when trade opens',
                '💰 Buyer pays via agreed payment method',
                '✅ Seller confirms → releases BTC to buyer',
                '💸 0.5% fee auto-deducted to PRAQEN wallet',
                '🚨 Open dispute if problem — resolved in 24h',
              ].map(t=><p key={t} className="text-xs" style={{color:C.g600}}>{t}</p>)}

              {/* Trade Reference */}
              {(trade?.trade_ref) && (
                <div className="mt-3 pt-3 border-t" style={{borderColor:C.g100}}>
                  <p className="text-xs font-semibold mb-1" style={{color:C.g500}}>Trade Reference</p>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2" style={{border:`1.5px solid ${C.g200}`}}>
                    <span className="font-mono font-black text-sm flex-1" style={{color:C.forest, letterSpacing:'0.05em'}}>
                      {trade.trade_ref}
                    </span>
                    <button
                      onClick={()=>{navigator.clipboard.writeText(trade.trade_ref);toast.success('Reference copied!');}}
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-200 transition"
                      title="Copy reference">
                      <Copy size={12} style={{color:C.g500}}/>
                    </button>
                  </div>
                  <p className="text-xs mt-1" style={{color:C.g400}}>Share this ID with support if you have issues</p>
                </div>
              )}
            </div>
          </div>

          {/* ── CHAT COLUMN ──────────────────────────────────────────────── */}
          <div className="order-1 lg:order-2 lg:col-span-8 flex flex-col min-h-[55vh] lg:min-h-0 lg:[max-height:calc(100vh-56px)]">
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col flex-1"
              style={{borderColor:C.g200}}>

              {/* ── TRADE HEADER ─────────────────────────────────── */}
              <div className="flex-shrink-0 border-b overflow-hidden"
                style={{borderColor:C.g100, background:`linear-gradient(135deg,${C.forest} 0%,${C.green} 100%)`}}>

                {/* Top row: avatar + name + timer */}
                <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-2">
                  <button
                    onClick={()=>{setProfUser(cp);setProfLabel(isBuyer?'Seller':'Buyer');}}
                    className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 active:opacity-60 transition">
                    <div className="relative flex-shrink-0">
                      <Avatar user={cp} size={28} radius="rounded-lg"/>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                        style={{borderColor:C.forest,backgroundColor:cpOnline?C.online:C.g400}}/>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-white text-xs">{cp?.username||'—'}</span>
                        {cp?.kyc_verified&&<BadgeCheck size={11} style={{color:'#93C5FD'}}/>}
                        <span className={`inline-flex items-center gap-0.5 text-xs font-black px-1.5 py-0.5 rounded-full border ${cpBadge.animate?'shadow-md':''}`}
                          style={{background:cpBadge.bg,borderColor:cpBadge.borderColor,boxShadow:cpBadge.glow?`0 0 8px ${cpBadge.glow}`:undefined}}>
                          <span style={{color:cpBadge.iconColor||cpBadge.textColor}}>{cpBadge.icon}</span>
                          <span style={{color:cpBadge.textColor}}>{cpBadge.label}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5" style={{fontSize:'10px',color:'rgba(255,255,255,0.55)'}}>
                        <span style={{color:'#86EFAC'}}>👍{cpPos}</span>
                        <span style={{color:'#FCA5A5'}}>👎{cpNeg}</span>
                        <span className="opacity-40">·</span>
                        <span>{fmt(cp?.total_trades||0)} trades</span>
                        <span className="opacity-40">·</span>
                        <span style={{color:cpOnline?'#86EFAC':'rgba(255,255,255,0.45)'}}>{cpSeen}</span>
                      </div>
                    </div>
                  </button>
                  {/* Status badge */}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0"
                    style={{backgroundColor:'rgba(255,255,255,0.12)',fontSize:'10px'}}>
                    <CfgIcon size={10} className="text-white/70"/>
                    <span className="font-bold text-white/70">{cfg.label}</span>
                  </div>
                </div>

                {/* ── Compact Trade Summary ── */}
                <div className="mx-3 mb-2 p-2.5 rounded-xl"
                  style={{border:'1px solid rgba(255,255,255,0.12)', backgroundColor:'rgba(255,255,255,0.06)'}}>

                  {/* PAY | RECEIVE side by side */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <p className="text-white/60 font-semibold mb-0.5 text-xs">💵 You Pay</p>
                      <p className="text-base font-black text-white leading-tight">{sym}{fmt(userPays, 0)}</p>
                      <p className="text-white/60 font-semibold mt-0.5 text-xs">{cur} · {payMethod}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/60 font-semibold mb-0.5 text-xs">🛒 You Receive</p>
                      <p className="text-base font-black leading-tight" style={{color:C.gold}}>₿ {btcReceived.toFixed(8)}</p>
                      <p className="text-white/60 font-semibold mt-0.5 text-xs">≈ {sym}{fmt(btcValueInLocal, 2)} {cur}</p>
                    </div>
                  </div>

                  {/* Rate row */}
                  <div className="flex items-center justify-between border-t border-white/10 pt-1.5">
                    <div className="flex items-center gap-1 text-white/40" style={{fontSize:'10px'}}>
                      <Lock size={9}/>
                      <span>Rate locked</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-white" style={{fontSize:'10px'}}>{sym}{fmt(sellerRate, 0)} {cur}/BTC</span>
                      <span className="font-black px-1.5 py-0.5 rounded-full" style={{backgroundColor:'rgba(244,164,34,0.2)',color:C.gold,fontSize:'10px'}}>
                        {margin > 0 ? `+${margin}%` : `${margin}%`}
                      </span>
                    </div>
                  </div>

                </div>

                {/* ── Prominent Timer Banner ── */}
                {isActive&&(
                  <div className={urgent?'animate-pulse':''} style={{
                    display:'flex',alignItems:'center',justifyContent:'center',gap:10,
                    padding:'10px 12px',
                    backgroundColor: timeLeft===0 ? '#7f1d1d' : urgent ? C.danger : 'rgba(0,0,0,0.28)',
                    borderTop:'1px solid rgba(255,255,255,0.08)',
                  }}>
                    <Timer size={15} style={{color: urgent||timeLeft===0 ? '#fff' : C.gold, flexShrink:0}}/>
                    <span style={{fontWeight:900,color:'#fff',fontSize:22,letterSpacing:'0.06em',lineHeight:1}}>
                      {timeLeft===0 ? 'EXPIRED' : fmtTimer(timeLeft)}
                    </span>
                    <div style={{display:'flex',flexDirection:'column',gap:1}}>
                      <span style={{color:'rgba(255,255,255,0.5)',fontSize:10,fontWeight:600,lineHeight:1}}>
                        {timeLeft===0 ? '⚠️ Trade cancelled' : urgent ? '⚠️ Pay now!' : `${timeLimit} min limit`}
                      </span>
                      <span style={{color:'rgba(255,255,255,0.35)',fontSize:9,lineHeight:1}}>
                        {timeLeft===0 ? 'BTC returned to seller' : 'BTC returns to seller on expiry'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dispute active banner */}
              {isDisputed&&(
                <div className="px-4 py-2 border-b flex-shrink-0 flex items-center justify-center gap-2"
                  style={{backgroundColor:'#EDE9FE',borderColor:'#8B5CF6'}}>
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"/>
                  <Shield size={12} style={{color:'#6D28D9'}}/>
                  <span className="text-xs font-bold" style={{color:'#6D28D9'}}>
                    👨‍⚖️ Dispute active — Moderator reviewing within 24h
                  </span>
                </div>
              )}

              {/* ── SYSTEM MESSAGE STRIP ── */}
              <div className="flex-shrink-0 border-b px-3 py-2"
                style={{borderColor:'rgba(180,160,80,0.2)', backgroundColor:'rgba(250,240,200,0.25)'}}>
                <div className="flex items-center gap-2">
                  <Shield size={11} style={{color:'#a08040',flexShrink:0}}/>
                  <p className="text-xs leading-snug" style={{color:'#8a7040'}}>
                    🔔 Pay via <span className="font-black">{payMethod}</span>, then tap <span className="font-black">✅ I HAVE PAID</span>. Do not share links or trade outside escrow.
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{backgroundColor:'#F9FAFB',minHeight:0}}>

                {/* Proof images */}
                {images.length>0&&(
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-xs w-full font-bold" style={{color:C.g400}}>📎 Uploaded Proofs:</span>
                    {images.map((img,i)=>{
                      const src=img.image_url||img.url;
                      if(!src)return null;
                      const fullSrc=(src.startsWith('http')||src.startsWith('data:')||src.startsWith('blob:'))?src:`${API_URL}${src}`;
                      return(
                        <button key={i} onClick={()=>setImgSrc(fullSrc)}
                          className="w-14 h-14 rounded-xl overflow-hidden border-2 hover:opacity-80 transition"
                          style={{borderColor:C.green}}>
                          <img src={fullSrc} alt="Proof" className="w-full h-full object-cover"
                            onError={e=>{e.target.style.display='none';}}/>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Messages */}
                {messages.length===0?(
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <MessageCircle size={40} className="mb-2 opacity-15" style={{color:C.green}}/>
                    <p className="text-sm font-semibold" style={{color:C.g400}}>No messages yet</p>
                    <p className="text-xs" style={{color:C.g300}}>Start the conversation below</p>
                  </div>
                ):messages.map((m,i)=>{
                  const isOwn=String(m.sender_id)===String(user?.id);
                  const isMod=m.sender_role==='moderator';
                  const isSys=!m.sender_id||m.message_type==='SYSTEM'||m.sender_role==='system';
                  const text=m.message_text||m.message||'';

                  if(isSys){
                    // Classify the message type for styling
                    const tl = text.toLowerCase();
                    const isSuccess = /complet|released|btc.*released|paid.*confirmed|verified|unlock/i.test(text);
                    const isDanger  = /disput|cancel|expired|refund|failed/i.test(text);
                    const isWarn    = /warning|urgent|expir|time.*left|5 minute/i.test(text);
                    const isPmt     = /payment.*sent|paid|mark.*paid|sent.*payment/i.test(text);
                    const isOpen    = /trade.*open|escrow.*lock|btc.*locked|opened/i.test(text);
                    const isMod2    = /moderator|support.*review|dispute.*open/i.test(text);

                    let bg, border, color, icon;
                    if (isSuccess)    { bg='#F0FDF4'; border='#86EFAC'; color='#166534'; icon='✅'; }
                    else if (isDanger){ bg='#FEF2F2'; border='#FCA5A5'; color='#991B1B'; icon='❌'; }
                    else if (isWarn)  { bg='#FFFBEB'; border='#FCD34D'; color='#92400E'; icon='⚠️'; }
                    else if (isPmt)   { bg='#EFF6FF'; border='#93C5FD'; color='#1E40AF'; icon='💳'; }
                    else if (isOpen)  { bg='#F0FDF4'; border='#6EE7B7'; color='#065F46'; icon='🔒'; }
                    else if (isMod2)  { bg='#EDE9FE'; border='#C4B5FD'; color='#4C1D95'; icon='👨‍⚖️'; }
                    else              { bg=C.g50;     border=C.g200;    color=C.g600;    icon='ℹ️'; }

                    return(
                      <div key={i} className="flex justify-center my-1">
                        <div className="max-w-[92%] rounded-2xl border px-4 py-2.5 text-center"
                          style={{backgroundColor:bg, borderColor:border}}>
                          <p className="text-xs font-semibold leading-relaxed" style={{color}}>
                            <span className="mr-1">{icon}</span>{text}
                          </p>
                          <p className="text-xs mt-1 opacity-60" style={{color}}>
                            {new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if(isMod) return(
                    <div key={i} className="flex justify-center">
                      <div className="max-w-[85%] rounded-2xl p-3 border shadow-sm"
                        style={{backgroundColor:'#EDE9FE',borderColor:'#8B5CF6'}}>
                        <div className="flex items-center justify-center gap-1.5 mb-1.5">
                          <Shield size={12} style={{color:'#6D28D9'}}/>
                          <span className="text-xs font-black" style={{color:'#6D28D9'}}>MODERATOR</span>
                        </div>
                        <p className="text-xs text-center font-medium" style={{color:'#4C1D95'}}>{text}</p>
                        <p className="text-xs text-center mt-1" style={{color:'#6D28D9'}}>
                          {new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                        </p>
                      </div>
                    </div>
                  );

                  const isImage = text.startsWith('data:image/');
                  return(
                    <div key={i} className={`flex ${isOwn?'justify-end':'justify-start'}`}>
                      {!isOwn&&(
                        <button onClick={()=>{setProfUser(cp);setProfLabel(isBuyer?'Seller':'Buyer');}}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black mr-2 flex-shrink-0 self-end hover:opacity-80 transition"
                          style={{backgroundColor:C.mint,color:C.white}}>
                          {cp?.username?.charAt(0)?.toUpperCase()||'?'}
                        </button>
                      )}
                      <div className="max-w-[75%]">
                        {!isOwn&&<p className="text-xs font-bold mb-0.5 ml-1" style={{color:C.g500}}>{cp?.username}</p>}
                        {isImage?(
                          <button onClick={()=>setImgSrc(text)}
                            className="block rounded-2xl overflow-hidden border-2 hover:opacity-90 transition shadow-md"
                            style={{borderColor:isOwn?C.mint:C.g200,maxWidth:220}}>
                            <img src={text} alt="Shared" className="block w-full h-auto object-cover"
                              style={{maxHeight:280}}
                              onError={e=>{e.currentTarget.style.display='none';e.currentTarget.parentElement.innerHTML='<span style="padding:8px;font-size:12px;color:#94A3B8">Image unavailable</span>';}}/>
                            <p className="text-center text-xs py-1 font-semibold" style={{backgroundColor:isOwn?C.mint:'#F1F5F9',color:isOwn?'#fff':C.g500}}>
                              📎 Tap to enlarge
                            </p>
                          </button>
                        ):(
                          <div className="px-3.5 py-2.5 text-sm font-medium break-words shadow-sm"
                            style={{
                              backgroundColor:isOwn?C.green:'#fff',
                              color:isOwn?'#fff':C.g800,
                              fontWeight:isOwn?600:500,
                              lineHeight:'1.45',
                              borderRadius:isOwn?'18px 18px 4px 18px':'4px 18px 18px 18px',
                              border:isOwn?'none':`1px solid ${C.g200}`,
                            }}>
                            {text}
                          </div>
                        )}
                        <div className={`flex items-center gap-1 mt-1 ${isOwn?'justify-end':'ml-1'}`}>
                          <span className="text-xs font-medium" style={{color:C.g400}}>
                            {new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                          </span>
                          {isOwn&&(
                            m.is_read||new Date(m.created_at).getTime()<lastCpMsgTime
                              ?<CheckCheck size={13} style={{color:'#3B82F6'}}/>
                              :<Check size={13} style={{color:C.g300}}/>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ── Typing indicator ── */}
                {cpTyping&&(
                  <div className="flex justify-start">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black mr-2 flex-shrink-0"
                      style={{backgroundColor:C.mint,color:C.white}}>
                      {cp?.username?.charAt(0)?.toUpperCase()||'?'}
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-tl shadow-sm flex items-center gap-1"
                      style={{backgroundColor:'#fff',border:`1px solid ${C.g200}`}}>
                      <span className="text-xs font-semibold mr-1" style={{color:C.g400}}>{cp?.username||'User'}</span>
                      {[0,1,2].map(d=>(
                        <span key={d} className="w-2 h-2 rounded-full inline-block"
                          style={{backgroundColor:C.g400,animation:`typingDot 1.2s ease-in-out ${d*0.2}s infinite`}}/>
                      ))}
                    </div>
                  </div>
                )}
                <style>{`@keyframes typingDot{0%,60%,100%{transform:translateY(0);opacity:0.4;}30%{transform:translateY(-4px);opacity:1;}}`}</style>

                {/* ── Congratulations banner ── */}
                {isCompleted&&(
                  <div className="mx-1 my-2 rounded-xl overflow-hidden shadow-md"
                    style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
                    <div className="px-4 py-3 text-center">
                      <p className="text-white font-black text-sm">🎉 Congratulations! 🙌</p>
                      <p className="text-xs font-bold mt-0.5 mb-2" style={{color:'rgba(255,255,255,0.8)'}}>
                        You just {isBuyer?'bought':'sold'} Bitcoin successfully!
                      </p>
                      <p className="text-xs mb-3 leading-snug" style={{color:'rgba(255,255,255,0.7)'}}>
                        Always come back &amp; trade more — PRAQEN's safe escrow protects every trade. 🔒
                      </p>
                      <div className="flex gap-2 justify-center">
                        <button onClick={()=>navigate('/buy-bitcoin')}
                          className="px-3 py-1.5 rounded-lg font-black text-xs hover:opacity-90 transition"
                          style={{backgroundColor:C.gold,color:C.forest}}>
                          Trade Again 🚀
                        </button>
                        <button onClick={()=>navigate('/dashboard')}
                          className="px-3 py-1.5 rounded-lg font-black text-xs border hover:bg-white/10 transition"
                          style={{borderColor:'rgba(255,255,255,0.35)',color:'#fff'}}>
                          Dashboard →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={msgEnd}/>
              </div>

              {/* Input */}
              {isActive?(
                <div className="border-t flex-shrink-0" style={{borderColor:C.g200,backgroundColor:'#fff',padding:'10px 12px 8px'}}>
                  <form onSubmit={sendMessage} className="flex items-center gap-2">
                    <button type="button" onClick={()=>fileRef.current?.click()} disabled={uploading}
                      className="w-10 h-10 rounded-xl flex items-center justify-center border-2 hover:bg-gray-50 disabled:opacity-40 flex-shrink-0 transition"
                      style={{borderColor:C.g200,backgroundColor:'#F8FAFC'}}>
                      {uploading?<RefreshCw size={15} className="animate-spin" style={{color:C.green}}/>
                        :<Paperclip size={15} style={{color:C.green}}/>}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" onChange={e=>uploadImage(e.target.files[0])} className="hidden"/>
                    <input type="text" value={msg}
                      onChange={e=>{setMsg(e.target.value);sendTypingPing();}}
                      placeholder={`Message ${cp?.username||'counterparty'}…`}
                      className="flex-1 px-4 py-3 font-medium border-2 rounded-2xl focus:outline-none transition"
                      style={{borderColor:msg?C.green:C.g200,fontSize:15,color:C.g800,backgroundColor:'#F8FAFC'}}/>
                    <button type="submit" disabled={!msg.trim()||sending}
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 transition disabled:opacity-30 shadow-sm"
                      style={{backgroundColor:msg.trim()?C.green:C.g300}}>
                      {sending?<RefreshCw size={15} className="animate-spin"/>:<Send size={15}/>}
                    </button>
                  </form>
                  <p className="text-xs text-center mt-1.5 font-medium" style={{color:C.g400}}>
                    📎 Tap the clip to attach payment proof · 🔒 Encrypted
                  </p>
                </div>
              ):(
                <div className="border-t p-3 text-center text-sm font-bold flex-shrink-0"
                  style={{borderColor:C.g100,color:C.g400}}>
                  Chat closed — trade {isCompleted?'completed successfully ✅':'cancelled ❌'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE STICKY ACTION BAR ─────────────────────────────────────── */}
      {(showMarkPaid||showRelease)&&(
        <div className="lg:hidden fixed left-0 right-0 z-40 px-3 py-2.5"
          style={{bottom:0,backgroundColor:'rgba(255,255,255,0.97)',borderTop:`1px solid ${C.g200}`,backdropFilter:'blur(8px)',paddingBottom:'env(safe-area-inset-bottom, 10px)'}}>
          {showMarkPaid&&(
            <button onClick={()=>setShowPayConfirm(true)} disabled={submitting}
              className="w-full py-4 rounded-2xl font-black text-base shadow-lg active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{backgroundColor:C.gold,color:C.forest}}>
              {submitting
                ?<><RefreshCw size={16} className="animate-spin"/>Processing…</>
                :isGiftCardTrade
                  ?<><Check size={18}/>🎁 I SENT THE CODE</>
                  :<><Check size={18}/>✅ I HAVE PAID</>}
            </button>
          )}
          {showRelease&&(
            <button onClick={()=>setShowRelConfirm(true)} disabled={submitting}
              className="w-full py-4 rounded-2xl text-white font-black text-base shadow-lg active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{backgroundColor:C.green}}>
              {submitting
                ?<><RefreshCw size={16} className="animate-spin"/>Processing…</>
                :<><Bitcoin size={18}/>🔓 RELEASE BITCOIN</>}
            </button>
          )}
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      {profUser && <ProfilePopup user={profUser} label={profLabel} onClose={()=>setProfUser(null)}/>}
      {showSuccessModal && <FeedbackModal name={cp?.username} onClose={()=>setShowSuccessModal(false)} onSubmit={submitFeedback} submitting={fbSub}/>}
      {showFb && <FeedbackModal name={cp?.username} onClose={()=>setShowFb(false)} onSubmit={submitFeedback} submitting={fbSub}/>}
      {showCancel && <CancelModal onClose={()=>setShowCancel(false)} onConfirm={cancelTrade} submitting={submitting}/>}
      {imgSrc && <ImgModal src={imgSrc} onClose={()=>setImgSrc(null)}/>}

      {/* ── Pay confirmation modal ───────────────────────────────────── */}
      {showPayConfirm && (
        <ConfirmActionModal
          icon={isGiftCardTrade ? Gift : Check}
          iconBg={C.gold}
          title={isGiftCardTrade ? 'Confirm Gift Card Sent?' : 'Confirm Payment Sent?'}
          lines={isGiftCardTrade ? [
            {icon:'🎁', text:'You are confirming you have sent the gift card code to the buyer in the chat.'},
            {icon:'⚠️', text:'Only confirm if you have already shared the code. This cannot be undone.'},
            {icon:'🔒', text:'The buyer will verify the code before Bitcoin is released.'},
          ] : [
            {icon:'💳', text:`You are confirming you have sent the full payment via ${payMethod}.`},
            {icon:'⚠️', text:'Only confirm if you have already completed the transfer. This cannot be undone.'},
            {icon:'🔒', text:'The seller will verify payment before releasing Bitcoin to you.'},
          ]}
          confirmLabel={isGiftCardTrade ? '🎁 Yes, I Sent the Code' : '✅ Yes, I Have Paid'}
          confirmBg={C.gold}
          confirmColor={C.forest}
          onClose={()=>setShowPayConfirm(false)}
          onConfirm={markPaid}
          submitting={submitting}
        />
      )}

      {/* ── Release confirmation modal ───────────────────────────────── */}
      {showRelConfirm && (
        <ConfirmActionModal
          icon={Bitcoin}
          iconBg={C.green}
          title="Release Bitcoin to Buyer?"
          lines={[
            {icon:'✅', text:'Only release Bitcoin AFTER you have confirmed the payment in your bank or mobile money account.'},
            {icon:'⚠️', text:'This action is PERMANENT and cannot be reversed. Bitcoin will leave escrow immediately.'},
            {icon:'🔒', text:'A 0.5% fee will be automatically deducted by the escrow system.'},
          ]}
          confirmLabel="🔓 Release Bitcoin"
          confirmBg={C.green}
          confirmColor="#fff"
          onClose={()=>setShowRelConfirm(false)}
          onConfirm={releaseBtc}
          submitting={submitting}
        />
      )}
    </div>
  );
}
