import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../App';
import { supabase } from '../lib/supabaseClient';
import ProfileFlag from '../components/ProfileFlag';
import CountryFlag from '../components/CountryFlag';
import {
  Star, MapPin, Calendar, Award, Shield, CheckCircle,
  Users, Clock, MessageCircle, Camera, Copy, Globe,
  Zap, Medal, Crown, RefreshCw, Edit2, Save, X,
  BadgeCheck, AlertTriangle, TrendingUp, Lock,
  ChevronRight, Phone, Mail, FileText, ThumbsUp,
  ThumbsDown, Target, Smartphone, Info, ArrowRight,
  Bitcoin, Flame, Eye, Settings
} from 'lucide-react';
import { toast } from 'react-toastify';
import { BadgeChip } from '../lib/badge';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', amber:'#F59E0B', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0', g300:'#CBD5E1',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', warn:'#F59E0B', paid:'#3B82F6',
  online:'#22C55E', purple:'#8B5CF6',
};

const BADGE_DEFS = [
  { id:'verified_identity', label:'Verified Identity', icon:'🪪', color:'#3B82F6', bg:'#EFF6FF',
    desc:'Completed full KYC identity verification.', check:(u)=>!!(u?.kyc_verified||u?.is_id_verified) },
  { id:'top_trader', label:'Top Trader', icon:'🏆', color:'#F4A422', bg:'#FFFBEB',
    desc:'Completed 100+ successful trades.', check:(u)=>parseInt(u?.total_trades||0)>=100 },
  { id:'high_volume', label:'High Volume', icon:'📈', color:'#10B981', bg:'#ECFDF5',
    desc:'Traded over $10,000 in total volume.', check:(u)=>parseInt(u?.total_trades||0)*100>=10000 },
  { id:'fast_responder', label:'Fast Responder', icon:'⚡', color:'#8B5CF6', bg:'#F5F3FF',
    desc:'Average reply time under 5 minutes.', check:(u)=>parseInt(u?.avg_reply_minutes||99)<5 },
  { id:'trusted_seller', label:'Trusted Seller', icon:'🔒', color:'#EF4444', bg:'#FEF2F2',
    desc:'98%+ positive feedback with 20+ trades.', check:(u)=>parseInt(u?.total_trades||0)>=20&&parseFloat(u?.completion_rate||0)>=98 },
  { id:'veteran', label:'Veteran Trader', icon:'🎖️', color:'#6D28D9', bg:'#F5F3FF',
    desc:'Account older than 1 year.', check:(u)=>u?.created_at&&(Date.now()-new Date(u.created_at))/(1000*60*60*24*365)>=1 },
];

// FLAGS object for real country emoji flags
const FLAGS = {
  GH:'🇬🇭', NG:'🇳🇬', KE:'🇰🇪', ZA:'🇿🇦', UG:'🇺🇬', TZ:'🇹🇿', 
  US:'🇺🇸', GB:'🇬🇧', EU:'🇪🇺', CM:'🇨🇲', SN:'🇸🇳', ZM:'🇿🇲', 
  MZ:'🇲🇿', MW:'🇲🇼', RW:'🇷🇼', BI:'🇧🇮', DJ:'🇩🇯', ER:'🇪🇷',
  ET:'🇪🇹', SO:'🇸🇴', SS:'🇸🇸', SD:'🇸🇩', TD:'🇹🇩', CF:'🇨🇫',
  CD:'🇨🇩', CG:'🇨🇬', GA:'🇬🇦', GQ:'🇬🇶', AO:'🇦🇴', NA:'🇳🇦',
  BW:'🇧🇼', ZW:'🇿🇼', LS:'🇱🇸', SZ:'🇸🇿'
};

const fmt = (n,d=0)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n||0);
const fmtAge = (d)=>{
  if(!d)return'Recently';
  const s=(Date.now()-new Date(d))/1000;
  if(s<300)return'Online now';
  if(s<3600)return`${~~(s/60)}m ago`;
  if(s<86400)return`${~~(s/3600)}h ago`;
  const diff=Math.floor(s/86400);
  if(diff<30)return`${diff}d ago`;
  if(diff<365)return`${Math.floor(diff/30)}mo ago`;
  return`${Math.floor(diff/365)}y ago`;
};

function calcTrust(u,reviews){
  let s=0;
  if(u?.is_email_verified||u?.email_verified)s+=10;
  if(u?.is_phone_verified||u?.phone_verified)s+=15;
  if(u?.kyc_verified||u?.is_id_verified)s+=15;
  s+=Math.min(30,Math.floor(parseInt(u?.total_trades||0)/2));
  s+=Math.floor(parseFloat(u?.average_rating||0)/5*20);
  if(u?.created_at)s+=Math.min(10,Math.floor((Date.now()-new Date(u.created_at))/(1000*60*60*24*36)));
  return Math.min(100,s);
}
const trustLvl=(s)=>s>=71?{label:'High Trust',color:C.success,bg:'#ECFDF5'}:s>=41?{label:'Medium Trust',color:C.warn,bg:'#FFFBEB'}:{label:'Low Trust',color:C.danger,bg:'#FEF2F2'};

const TIERS=[
  {label:'Basic',    limit:500,   color:C.g400,  requires:[]},
  {label:'Standard', limit:2000,  color:C.paid,  requires:['email','phone']},
  {label:'Advanced', limit:10000, color:C.success,requires:['email','phone','kyc']},
  {label:'VIP',      limit:50000, color:C.gold,  requires:['email','phone','kyc','50trades']},
];
function getTier(u){
  const e=!!(u?.is_email_verified||u?.email_verified),p=!!(u?.is_phone_verified||u?.phone_verified),k=!!(u?.kyc_verified||u?.is_id_verified),t=parseInt(u?.total_trades||0);
  if(e&&p&&k&&t>=50)return 3;if(e&&p&&k)return 2;if(e&&p)return 1;return 0;
}


export default function Profile({userId:propUserId}){
  const {id:urlId}=useParams(); const navigate=useNavigate(); const fileRef=useRef(null);
  const userId=urlId||propUserId;
  const [user,setUser]=useState(null); const [reviews,setReviews]=useState([]);
  const [loading,setLoading]=useState(true); const [loadError,setLoadError]=useState(false);
  const [tab,setTab]=useState('overview');
  const [uploading,setUploading]=useState(false); const [own,setOwn]=useState(false);
  const [editing,setEditing]=useState(false); const [saving,setSaving]=useState(false);
  const [badges,setBadges]=useState([]);
  const [form,setForm]=useState({username:'',full_name:'',bio:'',location:'Ghana',website:''});
  const [userCountry] = useState('GH'); // default country; detected server-side via user.country

  useEffect(()=>{
    if(!userId){
      let cu={};try{cu=JSON.parse(localStorage.getItem('user')||'{}');}catch{}
      cu.id?navigate(`/profile/${cu.id}`):navigate('/login');
      return;
    }
    let cu={};try{cu=JSON.parse(localStorage.getItem('user')||'{}');}catch{}
    setOwn(cu.id===userId);
  },[userId]);

  // Load profile only when userId changes — NOT when `own` changes.
  // `own` is also computed fresh inside load() to avoid stale closure issues.
  useEffect(()=>{if(userId)load();},[userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const load=async()=>{
    setLoading(true);
    setLoadError(false);
    try{
      const tk=localStorage.getItem('token');
      let cu={};
      try{ cu=JSON.parse(localStorage.getItem('user')||'{}'); }catch{ cu={}; }
      // Compute isOwn fresh — do NOT call setOwn here (would trigger useEffect loop)
      const isOwn=!!(tk&&cu.id&&cu.id===userId);

      if(isOwn){
        // Own profile — always fetch fresh authenticated data
        const r=await axios.get(`${API_URL}/users/profile`,{headers:{Authorization:`Bearer ${tk}`}});
        const u=r.data.user||r.data;
        if(!u||!u.id) throw new Error('profile_empty');
        setUser(u);
        try{ localStorage.setItem('user',JSON.stringify(u)); }catch{}
        setForm({username:u.username||'',full_name:u.full_name||'',bio:u.bio||'',location:u.location||'Ghana',website:u.website||''});
      } else {
        // Another user's profile — accepts both UUID and username in URL
        const r=await axios.get(`${API_URL}/users/${userId}`);
        const u=r.data.user;
        if(!u||!u.id) throw new Error('profile_empty');
        setUser(u); setReviews(r.data.reviews||[]);
      }

      // Badge check — isolated, NEVER allowed to break the profile load
      if(isOwn && tk){
        try{
          const badgeRes=await axios.post(`${API_URL}/users/check-badges`,{},{headers:{Authorization:`Bearer ${tk}`}});
          setBadges(badgeRes.data.badges||[]);
        }catch{
          setBadges([]);
        }
      }
    }catch(e){
      console.error('[Profile] load error:', e?.response?.status, e?.response?.data || e?.message);
      const status=e?.response?.status;
      if(status===404){
        // Genuinely doesn't exist — show not-found UI
        setUser(null);
        setLoadError(false);
      } else if(status===401){
        setLoadError(true);
        toast.error('Please log in to view this profile.');
      } else if(e?.message==='profile_empty'){
        setLoadError(true);
        toast.error('This profile could not be loaded. Please try again.');
      } else {
        setLoadError(true);
        toast.error('We couldn\'t load this profile. Please check your connection and try again.');
      }
    }
    finally{setLoading(false);}
  };

  const upload=async(e)=>{
    const f=e.target.files[0]; if(!f||!f.type.startsWith('image/'))return;
    if(f.size>2*1024*1024){toast.error('Image must be under 2MB');return;}
    setUploading(true);
    try{
      const b64=await new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.onerror=rej;rd.readAsDataURL(f);});
      const tk=localStorage.getItem('token');
      const r=await axios.post(`${API_URL}/users/upload-avatar`,{image:b64,userId},{headers:{Authorization:`Bearer ${tk}`}});
      if(r.data.success){const url=r.data.avatar_url;if(url){setUser(p=>({...p,avatar_url:url}));const cu=JSON.parse(localStorage.getItem('user')||'{}');cu.avatar_url=url;localStorage.setItem('user',JSON.stringify(cu));window.dispatchEvent(new Event('userUpdated'));}toast.success('Photo updated!');}
    }catch(e){toast.error('Upload failed');}
    finally{setUploading(false);if(fileRef.current)fileRef.current.value='';}
  };

  const saveProfile=async(e)=>{
    e.preventDefault();setSaving(true);
    try{
      const tk=localStorage.getItem('token');
      const r=await axios.put(`${API_URL}/users/profile`,form,{headers:{Authorization:`Bearer ${tk}`}});
      if(r.data.success){const u=r.data.user||{...user,...form};setUser(u);const cu=JSON.parse(localStorage.getItem('user')||'{}');Object.assign(cu,form);localStorage.setItem('user',JSON.stringify(cu));window.dispatchEvent(new Event('userUpdated'));toast.success('Profile updated!');setEditing(false);}
    }catch(e){toast.error('Update failed');}
    finally{setSaving(false);}
  };

  if(loading)return(<div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}><div className="w-12 h-12 border-4 rounded-full animate-spin" style={{borderColor:C.sage,borderTopColor:'transparent'}}/></div>);
  if(!loading&&loadError)return(
    <div className="min-h-screen flex items-center justify-center p-4" style={{backgroundColor:C.mist}}>
      <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-sm" style={{border:`1px solid ${C.g200}`}}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{backgroundColor:'#FFF7ED'}}>
          <span style={{fontSize:32}}>⚠️</span>
        </div>
        <h2 className="font-black text-lg mb-2" style={{color:C.forest}}>Couldn't Load Profile</h2>
        <p className="text-sm mb-6 leading-relaxed" style={{color:C.g500}}>
          Something went wrong loading this profile. Please check your connection and try again.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={()=>load()} className="px-5 py-2.5 rounded-xl text-white font-bold text-sm" style={{backgroundColor:C.green}}>Try Again</button>
          <button onClick={()=>navigate('/buy-bitcoin')} className="px-5 py-2.5 rounded-xl font-bold text-sm" style={{backgroundColor:C.g100,color:C.g700}}>Go to Marketplace</button>
        </div>
      </div>
    </div>
  );
  if(!loading&&!user)return(
    <div className="min-h-screen flex items-center justify-center p-4" style={{backgroundColor:C.mist}}>
      <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-sm" style={{border:`1px solid ${C.g200}`}}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{backgroundColor:'#FEF2F2'}}>
          <span style={{fontSize:32}}>👤</span>
        </div>
        <h2 className="font-black text-lg mb-2" style={{color:C.forest}}>Profile Not Found</h2>
        <p className="text-sm mb-6 leading-relaxed" style={{color:C.g500}}>
          This profile doesn't exist or may have been removed.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={()=>navigate('/buy-bitcoin')} className="px-5 py-2.5 rounded-xl text-white font-bold text-sm" style={{backgroundColor:C.green}}>Go to Marketplace</button>
        </div>
      </div>
    </div>
  );

  // Resolve country code — prefer stored 2-letter code, fallback GH
  const rawCC   = user.country || userCountry || 'GH';
  const userCC  = (rawCC.length === 2 ? rawCC : (rawCC.slice(0,2))).toUpperCase();
  const phoneCC = ((user.phone_country||rawCC).slice(0,2)).toUpperCase();
  const kycCC   = ((user.kyc_country||rawCC).slice(0,2)).toUpperCase();

  const score=calcTrust(user,reviews); const trust=trustLvl(score);
  const tierIdx=getTier(user); const tier=TIERS[tierIdx]; const nextTier=TIERS[tierIdx+1];
  const emailOk=!!(user.is_email_verified||user.email_verified);
  const phoneOk=!!(user.is_phone_verified||user.phone_verified);
  const kycOk=!!(user.kyc_verified||user.is_id_verified);
  const verifPct=Math.round([emailOk,phoneOk,kycOk].filter(Boolean).length/3*100);
  const earned=BADGE_DEFS.filter(b=>badges.some(badge=>badge.badge_name===b.label&&badge.is_unlocked)||b.check(user));
  const trades=parseInt(user.total_trades||0); const rating=parseFloat(user.average_rating||0);
  const posPct=reviews.length?Math.round(reviews.filter(r=>r.rating>=4).length/reviews.length*100):100;
  const status=trades>=50?'Active Trader':trades>=5?'Growing Trader':trades>=1?'New Trader':'Unverified';
  const statusColor=trades>=50?C.success:trades>=5?C.paid:trades>=1?C.warn:C.danger;

  const TABS=[
    {id:'overview',      label:'Overview'},
    {id:'verification',  label:`Verification ${verifPct<100?`(${verifPct}%)`:''}`},
    {id:'reputation',    label:`Reputation (${reviews.length})`},
    {id:'badges',        label:`🏅 Badges (${earned.length}/${BADGE_DEFS.length})`},
    ...(own?[{id:'settings',label:'Settings'}]:[]),
  ];

  // Convert ISO-2 code to emoji flag (works for any country)
  const toEmojiFlag = (cc) => {
    if (!cc || cc.length !== 2) return '🌍';
    return cc.toUpperCase().replace(/./g, c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65));
  };
  const displayFlag = FLAGS[userCC] || toEmojiFlag(userCC) || '🌍';

  return(
    <div className="min-h-screen pb-0" style={{backgroundColor:C.mist,fontFamily:"'DM Sans',sans-serif",width:'100%',maxWidth:'100vw'}}>
      {/* ── PROFILE CARD ──────────────────────────────────────────────────── */}
      <div className="pt-4 pb-0 px-3 sm:px-5 lg:px-8" style={{backgroundColor:C.mist,boxSizing:'border-box'}}>
        <div style={{maxWidth:'100%',width:'100%',margin:'0 auto'}} className="lg:max-w-5xl">
          <div className="rounded-2xl sm:rounded-3xl bg-white" style={{border:'3px solid #8B5CF6',boxShadow:'0 4px 24px rgba(139,92,246,0.14)',overflow:'hidden',width:'100%',boxSizing:'border-box'}}>

            {/* ── Profile Header ── */}
            <div className="px-3 sm:px-5 lg:px-8 pt-4 pb-4 border-b" style={{borderColor:C.g100,boxSizing:'border-box',width:'100%'}}>

              {/* Row 1: Username */}
              <div className="mb-4">
                <h1 style={{
                  color:'#111827', fontFamily:"'Syne',sans-serif",
                  fontSize:'clamp(1.1rem,4vw,1.9rem)', fontWeight:900,
                  letterSpacing:'0.04em', textTransform:'uppercase',
                  lineHeight:1.15, wordBreak:'break-word', overflowWrap:'anywhere',
                }}>
                  {user.username}
                </h1>
              </div>

              {/* Row 2: Avatar + Info + Verifications */}
              <div className="flex gap-3 sm:gap-4 items-start">

                {/* Avatar — fixed width, no flex shrink issues */}
                <div className="relative" style={{flexShrink:0,width:80}}>
                  <div className="rounded-full overflow-hidden shadow-lg" style={{width:80,height:80,backgroundColor:'#0f172a',border:'3px solid #E2E8F0'}}>
                    {user.avatar_url
                      ?<img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover"/>
                      :<div className="w-full h-full flex items-center justify-center font-black text-3xl" style={{color:'#F4A422'}}>{user.username?.charAt(0)?.toUpperCase()||'?'}</div>}
                  </div>
                  {own&&(
                    <button onClick={()=>fileRef.current?.click()} disabled={uploading}
                      className="absolute rounded-full shadow-md flex items-center justify-center"
                      style={{bottom:-4,right:-4,width:28,height:28,backgroundColor:'white',border:'1.5px solid #E2E8F0'}}>
                      {uploading?<RefreshCw size={12} className="animate-spin" style={{color:C.green}}/>:<Camera size={12} style={{color:C.green}}/>}
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={upload} className="hidden"/>
                </div>

                {/* Info block — takes remaining width */}
                <div style={{flex:1,minWidth:0}}>

                  {/* Badge — full width row, no overflow */}
                  <div className="mb-2" style={{display:'inline-block',maxWidth:'100%'}}>
                    <BadgeChip user={user}/>
                  </div>

                  {/* ID + Location inline */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2" style={{fontSize:12}}>
                    <span className="font-mono font-bold flex items-center gap-1" style={{color:'#6B7280'}}>
                      ID: #{String(user.id||'').slice(0,8).toUpperCase()}
                      <button onClick={()=>{navigator.clipboard.writeText(user.id||'');toast.success('ID copied!');}} className="hover:opacity-70"><Copy size={10}/></button>
                    </span>
                    <span style={{color:'#D1D5DB'}}>·</span>
                    <span className="font-bold" style={{color:'#6B7280'}}>
                      Location: {user.location||'Unknown'} {displayFlag}
                    </span>
                  </div>

                  {/* Verification rows */}
                  <div className="flex flex-col gap-1 mb-2">
                    {[
                      {ok:emailOk, label:'Email'},
                      {ok:phoneOk, label:'Phone', flag:true},
                      {ok:kycOk,   label:'ID',    flag:true},
                    ].map(({ok,label,flag})=>(
                      <div key={label} className="flex items-center gap-2">
                        {ok
                          ?<CheckCircle size={14} style={{color:'#10B981',flexShrink:0}}/>
                          :<div style={{width:14,height:14,borderRadius:'50%',border:'2px solid #D1D5DB',flexShrink:0}}/>}
                        <span style={{fontSize:12,fontWeight:500,color:ok?'#374151':'#9CA3AF'}}>
                          {label} {ok?'verified':'unverified'}{flag?` ${displayFlag}`:''}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Bio — below verifications */}
                  {user.bio&&<p style={{color:C.g500,fontSize:12,lineHeight:1.5}}>{user.bio}</p>}

                </div>

              </div>
            </div>

            {/* Row 2: Stats section - Full width */}
            <div className="px-3 py-4 sm:px-5 lg:px-8 lg:py-5" style={{boxSizing:'border-box',width:'100%'}}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* FEEDBACK Card */}
                <div className="rounded-2xl overflow-hidden" style={{backgroundColor:'#FEFCE8',border:'2px solid #FDE68A'}}>
                  <p className="text-xs font-black text-center pt-2 uppercase tracking-wider" style={{color:'#78350F'}}>FEEDBACK</p>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor:'rgba(22,163,74,0.12)'}}>
                        <ThumbsUp size={18} style={{color:'#166534'}}/>
                      </div>
                      <div>
                        <p className="text-2xl lg:text-3xl font-black leading-none" style={{color:'#16A34A'}}>{fmt(user.positive_feedback||0)}</p>
                        <p className="text-xs font-bold" style={{color:'#166534'}}>Positive</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor:'rgba(239,68,68,0.1)'}}>
                        <ThumbsDown size={18} style={{color:'#991B1B'}}/>
                      </div>
                      <div>
                        <p className="text-2xl lg:text-3xl font-black leading-none" style={{color:'#EF4444'}}>{fmt(user.negative_feedback||0)}</p>
                        <p className="text-xs font-bold" style={{color:'#991B1B'}}>Negative</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Green Stats Card */}
                <div className="rounded-2xl overflow-hidden" style={{backgroundColor:'#16A34A'}}>
                  <div className="grid grid-cols-3 divide-x divide-white/20">
                    {[
                      ['Trades', fmt(user.total_trades||0)],
                      ['Rating', parseFloat(user.average_rating||0).toFixed(1)],
                      ['Trust Score', String(score)],
                    ].map(([label,value],i)=>(
                      <div key={i} className="text-center px-3 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide leading-none mb-1" style={{color:'rgba(255,255,255,0.72)'}}>{label}</p>
                        <p className="text-xl lg:text-2xl font-black leading-none text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-white/20 border-t border-white/20">
                    {[
                      ['Trusted By', fmt(user.trusted_by_count||user.trust_count||0)],
                      ['Blocked By', fmt(user.blocked_by_count||0)],
                    ].map(([label,value],i)=>(
                      <div key={i} className="text-center px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide leading-none mb-0.5" style={{color:'rgba(255,255,255,0.72)'}}>{label}</p>
                        <p className="text-lg font-black leading-none text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Joined + Edit Profile row */}
              <div className="flex items-center justify-between flex-wrap gap-y-2 mt-4 pt-3 border-t" style={{borderColor:C.g100}}>
                <div className="flex items-center flex-wrap gap-y-1" style={{fontSize:12}}>
                  <div className="flex items-center gap-1 pr-2">
                    <Clock size={12} style={{color:C.g400}}/>
                    <span className="font-bold" style={{color:C.g600}}>Joined:</span>
                    <span style={{color:C.g700}}>{fmtAge(user.created_at)}</span>
                  </div>
                  {user.created_at&&(
                    <>
                      <span className="px-1.5" style={{color:C.g300}}>|</span>
                      <span className="pr-2" style={{color:C.g400}}>
                        {new Date(user.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                      </span>
                    </>
                  )}
                  <span className="px-1.5" style={{color:C.g300}}>|</span>
                  <span className="font-bold" style={{color:C.g500}}>
                    Has blocked: {fmt(user.blocked_count||user.blocks_count||0)}
                  </span>
                </div>
                {own&&!editing&&(
                  <button onClick={()=>setEditing(true)}
                    className="flex items-center gap-1 rounded-xl font-black transition hover:opacity-80"
                    style={{padding:'5px 12px',backgroundColor:`${C.green}12`,color:C.green,border:`1.5px solid ${C.sage}`,fontSize:11,whiteSpace:'nowrap'}}>
                    <Edit2 size={11}/>Edit Profile
                  </button>
                )}
              </div>
            </div>

            {/* ── Edit Form (below stats) ── */}
            {own&&editing&&(
              <div className="px-4 sm:px-6 lg:px-8 py-5 border-t" style={{borderColor:C.g100,backgroundColor:C.g50}}>
                <p className="text-xs font-black uppercase tracking-wider mb-3" style={{color:C.forest}}>Edit Profile</p>
                <form onSubmit={saveProfile} className="space-y-3 max-w-2xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Username — locked after first change */}
                    <div>
                      <label className="text-xs font-bold mb-1 flex items-center gap-1" style={{color:C.g600}}>
                        Username
                        {user.username_changed&&<Lock size={10} style={{color:C.g400}}/>}
                      </label>
                      <input
                        value={form.username}
                        onChange={e=>setForm({...form,username:e.target.value})}
                        placeholder="Username"
                        disabled={!!user.username_changed}
                        className="w-full px-3 py-2 rounded-xl text-sm font-bold border-2 focus:outline-none"
                        style={{borderColor:user.username_changed?C.g200:C.sage,backgroundColor:user.username_changed?C.g100:'white',color:user.username_changed?C.g400:C.g800,cursor:user.username_changed?'not-allowed':'text'}}
                      />
                      {user.username_changed
                        ? <p className="text-xs mt-1 flex items-center gap-1" style={{color:C.g400}}><Lock size={9}/>Username is permanently locked.</p>
                        : <p className="text-xs mt-1 flex items-center gap-1" style={{color:'#D97706'}}>⚠ You can only change your username once. Choose carefully.</p>
                      }
                    </div>
                    {/* Full name — locked after KYC */}
                    <div>
                      <label className="text-xs font-bold mb-1 flex items-center gap-1" style={{color:C.g600}}>
                        Full Name
                        {kycOk&&<Lock size={10} style={{color:C.g400}}/>}
                      </label>
                      <input
                        value={form.full_name}
                        onChange={e=>setForm({...form,full_name:e.target.value})}
                        placeholder="Full Name"
                        disabled={kycOk}
                        className="w-full px-3 py-2 rounded-xl text-sm border-2 focus:outline-none"
                        style={{borderColor:kycOk?C.g200:C.sage,backgroundColor:kycOk?C.g100:'white',color:kycOk?C.g400:C.g800,cursor:kycOk?'not-allowed':'text'}}
                      />
                      {kycOk
                        ? <p className="text-xs mt-1 flex items-center gap-1" style={{color:C.g400}}><Lock size={9}/>Locked after ID verification.</p>
                        : <p className="text-xs mt-1 flex items-center gap-1" style={{color:C.g500}}>ℹ Full name cannot be changed after ID verification.</p>
                      }
                    </div>
                  </div>
                  <input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Location"
                    className="w-full px-3 py-2 rounded-xl text-sm border-2 focus:outline-none" style={{borderColor:C.sage}}/>
                  <div>
                    <textarea
                      value={form.bio}
                      onChange={e=>{
                        const val=e.target.value;
                        const wc=val.trim()===''?0:val.trim().split(/\s+/).length;
                        if(wc<=100) setForm({...form,bio:val});
                      }}
                      placeholder="Bio (max 100 words)"
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl text-sm border-2 focus:outline-none resize-none"
                      style={{borderColor:C.sage}}
                    />
                    <p className="text-xs mt-0.5 text-right" style={{color:(form.bio||'').trim()===''?C.g400:(form.bio||'').trim().split(/\s+/).length>=100?C.danger:C.g400}}>
                      {(form.bio||'').trim()===''?0:(form.bio||'').trim().split(/\s+/).length}/100 words
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-xs text-white"
                      style={{backgroundColor:C.green}}>
                      {saving?<RefreshCw size={11} className="animate-spin"/>:<Save size={11}/>}{saving?'Saving…':'Save'}
                    </button>
                    <button type="button" onClick={()=>setEditing(false)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-xs border" style={{borderColor:C.g200,color:C.g600}}>
                      <X size={11}/>Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── REFERRAL LINK (own profile only) ─────────────────────────────── */}
      {own && user && (
        <div className="max-w-5xl mx-auto px-3 sm:px-5 lg:px-8 mt-3" style={{boxSizing:'border-box',width:'100%'}}>
          <div className="rounded-2xl border overflow-hidden" style={{backgroundColor:'#FFFBEB',borderColor:'#FDE68A'}}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{borderColor:'#FDE68A'}}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{backgroundColor:'rgba(244,164,34,0.15)'}}>
                  <span style={{fontSize:14}}>🔗</span>
                </div>
                <p className="font-black text-sm" style={{color:'#92400E'}}>Your Referral Link</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="font-black text-sm leading-none" style={{color:'#1B4332'}}>{user.total_referrals||0}</p>
                  <p className="text-gray-400 leading-none mt-0.5" style={{fontSize:9}}>Referrals</p>
                </div>
                <div className="w-px h-6 bg-amber-200"/>
                <div className="text-center">
                  <p className="font-black text-sm leading-none" style={{color:'#F4A422'}}>
                    ₿{(user.referral_earnings_btc||0).toFixed(6)}
                  </p>
                  <p className="text-gray-400 leading-none mt-0.5" style={{fontSize:9}}>Earned</p>
                </div>
              </div>
            </div>

            {/* Link row */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={`https://praqen.com/ref/${user.referral_code||user.username}`}
                  className="flex-1 min-w-0 text-xs font-medium rounded-xl border px-3 py-2 focus:outline-none truncate"
                  style={{backgroundColor:'white',borderColor:'#FDE68A',color:'#78350F'}}
                />
                <button
                  onClick={()=>{
                    navigator.clipboard.writeText(`https://praqen.com/ref/${user.referral_code||user.username}`);
                    toast.success('Referral link copied!');
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs text-white hover:opacity-90 active:scale-95 transition"
                  style={{backgroundColor:'#F4A422',whiteSpace:'nowrap'}}>
                  📋 Copy
                </button>
                <button
                  onClick={()=>{
                    const link=`https://praqen.com/ref/${user.referral_code||user.username}`;
                    if(navigator.share){navigator.share({title:'Join PRAQEN',text:'Trade Bitcoin safely with me on PRAQEN!',url:link});}
                    else{navigator.clipboard.writeText(link);toast.success('Link copied!');}
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs text-white hover:opacity-90 active:scale-95 transition"
                  style={{backgroundColor:'#1B4332',whiteSpace:'nowrap'}}>
                  ↑ Share
                </button>
              </div>
              <p className="text-xs mt-2" style={{color:'#92400E'}}>
                Earn <strong>0.1% BTC commission</strong> on every trade your referrals complete.
              </p>
            </div>

          </div>
        </div>
      )}

      {/* ── TAB NAV ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm mt-3" style={{borderColor:C.g200,width:'100%',overflowX:'hidden'}}>
        <div className="max-w-5xl mx-auto px-3 sm:px-5 lg:px-8 flex gap-0" style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className="px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold whitespace-nowrap border-b-2 transition"
              style={{color:tab===t.id?C.green:C.g500,borderColor:tab===t.id?C.green:'transparent',backgroundColor:tab===t.id?`${C.green}06`:'transparent'}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ──────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-3 sm:px-5 lg:px-8 py-4 space-y-4" style={{boxSizing:'border-box',width:'100%'}}>

        {/* ── OVERVIEW ────────────────────────────────────────────────── */}
        {tab==='overview'&&(
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="space-y-5 lg:col-span-1">
              {/* Trust score card */}
              <div className="bg-white rounded-2xl border shadow-sm p-5" style={{borderColor:C.g200}}>
                <div className="flex items-center gap-2 mb-3"><Shield size={14} style={{color:C.green}}/><p className="font-black text-sm" style={{color:C.forest}}>Trust Score</p></div>

                <div className="flex items-center gap-3 mb-3 p-3 rounded-2xl" style={{background:'linear-gradient(135deg,rgba(134,239,172,0.12),rgba(252,165,165,0.08))',border:`1.5px solid ${C.g100}`}}>
                  <div className="flex-1 text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <ThumbsUp size={16} style={{color:C.success}}/>
                      <p className="text-2xl lg:text-3xl font-black leading-none" style={{color:C.success}}>{fmt(user.positive_feedback||0)}</p>
                    </div>
                    <p className="text-xs font-semibold" style={{color:C.g500}}>Positive</p>
                  </div>
                  <div className="w-px self-stretch" style={{backgroundColor:C.g200}}/>
                  <div className="flex-1 text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <ThumbsDown size={16} style={{color:C.danger}}/>
                      <p className="text-2xl lg:text-3xl font-black leading-none" style={{color:C.danger}}>{fmt(user.negative_feedback||0)}</p>
                    </div>
                    <p className="text-xs font-semibold" style={{color:C.g500}}>Negative</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <p className="text-4xl lg:text-5xl font-black" style={{color:trust.color}}>{score}</p>
                  <span className="text-xs font-black px-3 py-1.5 rounded-xl" style={{backgroundColor:trust.bg,color:trust.color}}>{trust.label}</span>
                </div>
                <div className="h-3 rounded-full mb-3" style={{backgroundColor:C.g200}}>
                  <div className="h-3 rounded-full" style={{width:`${score}%`,backgroundColor:trust.color}}/>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="rounded-xl px-3 py-2 text-center" style={{backgroundColor:C.g50,border:`1px solid ${C.g100}`}}>
                    <p className="font-black text-lg leading-none" style={{color:C.forest}}>{fmt(user.total_trades||0)}</p>
                    <p className="text-xs mt-0.5" style={{color:C.g400}}>Trades</p>
                  </div>
                  <div className="rounded-xl px-3 py-2 text-center" style={{backgroundColor:C.g50,border:`1px solid ${C.g100}`}}>
                    <div className="flex items-center justify-center gap-1">
                      <Star size={12} className="fill-yellow-400 text-yellow-400"/>
                      <p className="font-black text-lg leading-none" style={{color:C.gold}}>{parseFloat(user.average_rating||0).toFixed(1)}</p>
                    </div>
                    <p className="text-xs mt-0.5" style={{color:C.g400}}>Rating</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {[
                    {label:'Email verified', done:emailOk, pts:10},
                    {label:'Phone verified', done:phoneOk, pts:15},
                    {label:'KYC completed',  done:kycOk,   pts:15},
                    {label:'Trade activity', done:trades>0,pts:30},
                    {label:'Rating score',   done:rating>0,pts:20},
                    {label:'Account age',    done:true,    pts:10},
                  ].map(({label,done,pts})=>(
                    <div key={label} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        {done?<CheckCircle size={10} style={{color:C.success}}/>:<div className="w-2.5 h-2.5 rounded-full border" style={{borderColor:C.g300}}/>}
                        <span style={{color:done?C.g700:C.g400}}>{label}</span>
                      </div>
                      <span className="font-bold" style={{color:done?C.success:C.g400}}>+{pts}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Badges preview */}
              <div className="bg-white rounded-2xl border shadow-sm p-5" style={{borderColor:C.g200}}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2"><Award size={14} style={{color:C.gold}}/><p className="font-black text-sm" style={{color:C.forest}}>Badge Collection</p></div>
                  <button onClick={()=>setTab('badges')} className="text-xs font-bold" style={{color:C.green}}>View all →</button>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-2 rounded-full" style={{backgroundColor:C.g100}}>
                    <div className="h-2 rounded-full transition-all" style={{width:`${(earned.length/BADGE_DEFS.length)*100}%`,background:`linear-gradient(90deg,${C.gold},${C.amber})`}}/>
                  </div>
                  <span className="text-xs font-black" style={{color:C.gold}}>{earned.length}/{BADGE_DEFS.length}</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {BADGE_DEFS.map(b=>{
                    const unlocked=badges.some(ba=>ba.badge_name===b.label&&ba.is_unlocked)||b.check(user);
                    return(
                      <div key={b.id} title={b.label}
                        className="aspect-square rounded-xl flex items-center justify-center text-base cursor-pointer hover:scale-110 transition-transform"
                        style={{
                          backgroundColor:unlocked?`${b.color}15`:'rgba(0,0,0,0.04)',
                          filter:unlocked?'none':'grayscale(1)',
                          opacity:unlocked?1:0.35,
                          border:`1.5px solid ${unlocked?b.color+'40':C.g100}`,
                        }}>
                        {b.icon}
                      </div>
                    );
                  })}
                </div>
                {earned.length===0&&<p className="text-xs text-center mt-3" style={{color:C.g400}}>Complete tasks to unlock your first badge</p>}
                {earned.length>0&&earned.length<BADGE_DEFS.length&&(
                  <p className="text-xs text-center mt-3" style={{color:C.g400}}>{BADGE_DEFS.length-earned.length} more badge{BADGE_DEFS.length-earned.length!==1?'s':''} to unlock</p>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-5">
              {/* Trade limit */}
              <div className="bg-white rounded-2xl border shadow-sm p-5" style={{borderColor:C.g200}}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2"><Lock size={14} style={{color:C.green}}/><p className="font-black text-sm" style={{color:C.forest}}>Trade Limits</p></div>
                  <span className="text-xs font-black px-2.5 py-1 rounded-full text-white" style={{backgroundColor:tier.color}}>{tier.label} Tier</span>
                </div>
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-3xl lg:text-4xl font-black" style={{color:tier.color}}>${fmt(tier.limit)}</p>
                    <p className="text-xs" style={{color:C.g400}}>Per transaction limit</p>
                  </div>
                  {nextTier&&<div className="text-right"><p className="text-sm font-black" style={{color:C.g600}}>${fmt(nextTier.limit)}</p><p className="text-xs" style={{color:C.g400}}>Next tier</p></div>}
                </div>
                <div className="flex gap-1 mb-3">
                  {TIERS.map((t,i)=><div key={i} className="flex-1 h-2 rounded-full" style={{backgroundColor:i<=tierIdx?t.color:C.g200}}/>)}
                </div>
                {nextTier&&own&&(
                  <div className="p-3 rounded-xl border" style={{backgroundColor:`${C.gold}08`,borderColor:`${C.gold}30`}}>
                    <p className="text-xs font-black mb-2" style={{color:C.forest}}>🎯 Unlock {nextTier.label} — ${fmt(nextTier.limit)}/trade</p>
                    <div className="space-y-1 mb-2">
                      {nextTier.requires.map(req=>{
                        const done=req==='email'?emailOk:req==='phone'?phoneOk:req==='kyc'?kycOk:trades>=50;
                        return(
                          <div key={req} className="flex items-center gap-1.5 text-xs">
                            {done?<CheckCircle size={10} style={{color:C.success}}/>:<div className="w-2.5 h-2.5 rounded-full border-2" style={{borderColor:C.warn}}/>}
                            <span style={{color:done?C.success:C.g600}}>{req==='email'?'Verify email':req==='phone'?'Verify phone':req==='kyc'?'Complete KYC':'Complete 50+ trades'}</span>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={()=>navigate('/settings?tab=verification')}
                      className="w-full py-2 rounded-xl text-white text-xs font-black hover:opacity-90 transition"
                      style={{backgroundColor:C.green}}>
                      Upgrade Account → Increase Trade Limits
                    </button>
                  </div>
                )}
              </div>

              {/* Recent Reviews */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-black text-sm" style={{color:C.forest}}>Recent Reviews</p>
                  {reviews.length>3&&<button onClick={()=>setTab('reputation')} className="text-xs font-bold" style={{color:C.green}}>View all →</button>}
                </div>
                <div className="space-y-3">
                  {reviews.slice(0,3).map(r=>(
                    <div key={r.id} className="bg-white rounded-2xl border shadow-sm p-4 flex gap-3" style={{borderColor:C.g200}}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white flex-shrink-0" style={{backgroundColor:C.green}}>
                        {r.reviewer?.username?.charAt(0)?.toUpperCase()||'?'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-black text-xs" style={{color:C.forest}}>{r.reviewer?.username||'Trader'}</span>
                          <div className="flex gap-0.5">{[1,2,3,4,5].map(i=><Star key={i} size={9} className={i<=r.rating?'fill-yellow-400 text-yellow-400':'text-gray-200'}/>)}</div>
                          {r.is_verified_trade&&<span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{backgroundColor:`${C.success}15`,color:C.success}}>✓ Verified</span>}
                        </div>
                        {r.comment&&<p className="text-xs" style={{color:C.g600}}>{r.comment}</p>}
                        <p className="text-xs mt-1" style={{color:C.g400}}>{fmtAge(r.created_at)}</p>
                      </div>
                    </div>
                  ))}
                  {reviews.length===0&&(
                    <div className="bg-white rounded-2xl border shadow-sm p-8 text-center" style={{borderColor:C.g200}}>
                      <MessageCircle size={32} className="mx-auto mb-2 opacity-20" style={{color:C.g400}}/>
                      <p className="text-xs" style={{color:C.g400}}>No reviews yet. Complete trades to get feedback.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── VERIFICATION ────────────────────────────────────────────── */}
        {tab==='verification'&&(
          <div className="space-y-4 max-w-3xl">
            <div className="rounded-2xl p-5 text-white"
              style={{background:verifPct===100?`linear-gradient(135deg,${C.success},${C.mint})`:`linear-gradient(135deg,${C.forest},${C.green})`}}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-black text-lg" style={{fontFamily:"'Syne',sans-serif"}}>{verifPct===100?'✅ Fully Verified!':'Complete Verification'}</p>
                  <p className="text-white/70 text-xs mt-0.5">{[emailOk,phoneOk,kycOk].filter(Boolean).length}/3 steps completed — unlock higher trade limits</p>
                </div>
                <div className="text-right"><p className="text-3xl font-black">{verifPct}%</p><p className="text-white/50 text-xs">Complete</p></div>
              </div>
              <div className="h-2.5 rounded-full bg-white/20"><div className="h-2.5 rounded-full" style={{width:`${verifPct}%`,backgroundColor:C.gold}}/></div>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm p-4"
              style={{borderColor: verifPct===100 ? C.success : C.g200}}>
              <div className="flex items-center justify-between mb-1">
                <p className="font-black text-sm" style={{color:C.forest}}>Verification Status</p>
                {verifPct===100 && (
                  <span className="text-xs font-black px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{backgroundColor:`${C.success}15`, color:C.success}}>
                    <Lock size={10}/> Fully Locked
                  </span>
                )}
              </div>
              <p className="text-xs mb-4"
                style={{color: verifPct===100 ? C.success : C.g400}}>
                {verifPct===100
                  ? '✅ All 3 verifications complete — your account is fully unlocked!'
                  : 'Go to Settings → Verification to complete your profile.'}
              </p>

              {/* Fully-verified celebration banner */}
              {verifPct===100 && (
                <div className="mb-4 rounded-xl p-3 flex items-center gap-3"
                  style={{background:`linear-gradient(135deg,${C.success},${C.mint})`, border:`1px solid ${C.success}`}}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{backgroundColor:'rgba(255,255,255,0.2)'}}>
                    <Lock size={18} className="text-white"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-sm">🏆 Account Fully Verified</p>
                    <p className="text-white/80 text-xs mt-0.5">Email · Phone · ID — all locked and verified</p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {/* Email */}
                <div className="rounded-2xl border-2 p-4 flex items-center gap-3 transition-all"
                  style={{borderColor:emailOk?C.success:C.g200,backgroundColor:emailOk?'#ECFDF5':'white'}}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{backgroundColor:emailOk?`${C.success}15`:`${C.paid}15`}}>
                    {emailOk?<CheckCircle size={18} style={{color:C.success}}/>:<Mail size={18} style={{color:C.paid}}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black" style={{color:C.forest}}>Email</p>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{backgroundColor:emailOk?`${C.success}15`:'#FEF2F2',color:emailOk?C.success:C.danger}}>
                        {emailOk?'✅ Email verified':'❌ Email not verified'}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{color:C.g500}}>
                      {emailOk
                        ?`${user.email||''}  — required to create offers & trade`
                        :'Not verified yet. Go to Settings → Verification to verify your email.'}
                    </p>
                  </div>
                  {emailOk && <Lock size={14} style={{color:C.success, flexShrink:0}}/>}
                </div>

                {/* Phone */}
                <div className="rounded-2xl border-2 p-4 flex items-center gap-3 transition-all"
                  style={{
                    borderColor: phoneOk ? C.success : user.phone ? '#FCD34D' : C.g200,
                    backgroundColor: phoneOk ? '#ECFDF5' : user.phone ? '#FFFBEB' : 'white',
                  }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{backgroundColor:phoneOk?`${C.success}15`:'#FEF3C7'}}>
                    {phoneOk?<CheckCircle size={18} style={{color:C.success}}/>:<Phone size={18} style={{color:'#D97706'}}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black" style={{color:C.forest}}>Phone Number</p>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: phoneOk ? `${C.success}15` : user.phone ? '#FEF3C7' : C.g100,
                          color: phoneOk ? C.success : user.phone ? '#92400E' : C.g500,
                        }}>
                        {phoneOk ? '✅ Phone verified' : user.phone ? '⏳ Under Review' : '⚠️ Not Added'}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{color:C.g500}}>
                      {phoneOk
                        ? `${user.phone||''}  — verified`
                        : user.phone
                          ? `${user.phone} — waiting for approval`
                          : 'Not submitted yet. Go to Settings → Verification to add your phone number.'}
                    </p>
                  </div>
                  {phoneOk
                    ? <Lock size={14} style={{color:C.success, flexShrink:0}}/>
                    : user.phone
                      ? <Clock size={14} style={{color:'#D97706', flexShrink:0}}/>
                      : null
                  }
                </div>

                {/* KYC */}
                <div className="rounded-2xl border-2 p-4 flex items-center gap-3 transition-all"
                  style={{borderColor:kycOk?C.success:user.kyc_status==='pending'?C.warn:C.g200,backgroundColor:kycOk?'#ECFDF5':user.kyc_status==='pending'?'#FFFBEB':'white'}}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{backgroundColor:kycOk?`${C.success}15`:`${C.gold}15`}}>
                    {kycOk?<CheckCircle size={18} style={{color:C.success}}/>:<FileText size={18} style={{color:C.gold}}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black" style={{color:C.forest}}>Identity (KYC)</p>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{backgroundColor:kycOk?`${C.success}15`:user.kyc_status==='pending'?'#FEF3C7':'#FFFBEB',color:kycOk?C.success:user.kyc_status==='pending'?'#92400E':C.warn}}>
                        {kycOk?'✓ Verified':user.kyc_status==='pending'?'⏳ Under Review':'Not Verified'}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{color:C.g500}}>
                      {kycOk
                        ? 'ID verified — Advanced & VIP limits unlocked'
                        : user.kyc_status==='pending'
                          ? 'Documents submitted — waiting for approval'
                          : 'Not submitted yet. Go to Settings → Verification to upload your ID.'}
                    </p>
                  </div>
                  {kycOk
                    ? <Lock size={14} style={{color:C.success, flexShrink:0}}/>
                    : user.kyc_status==='pending'
                      ? <Clock size={16} style={{color:C.warn,flexShrink:0}}/>
                      : null
                  }
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm p-4" style={{borderColor:C.g200}}>
              <div className="flex items-center gap-2 mb-3"><Shield size={13} style={{color:C.green}}/><p className="font-black text-sm" style={{color:C.forest}}>Account Security</p></div>
              <div className="space-y-2.5">
                {[
                  {icon:MapPin,     label:'Registered Country', value:`${displayFlag} ${user.country||'Ghana'}`, color:C.paid},
                  {icon:Clock,      label:'Last Active',          value:fmtAge(user.last_seen_at||user.last_login||user.updated_at),  color:C.success},
                  {icon:Smartphone, label:'Device Access',       value:'Mobile & Web Browser',                              color:C.purple},
                  {icon:Globe,      label:'Language',            value:'English',                                            color:C.g500},
                ].map(({icon:Icon,label,value,color})=>(
                  <div key={label} className="flex items-center justify-between py-2 border-b last:border-0 text-xs" style={{borderColor:C.g100}}>
                    <div className="flex items-center gap-2"><Icon size={12} style={{color}}/><span style={{color:C.g500}}>{label}</span></div>
                    <span className="font-bold" style={{color:C.g700}}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ── REPUTATION ──────────────────────────────────────────────── */}
        {tab==='reputation'&&(
          <div className="space-y-4 max-w-3xl">
            <div className="bg-white rounded-2xl border shadow-sm p-5" style={{borderColor:C.g200}}>
              <p className="font-black text-sm mb-4" style={{color:C.forest}}>Reputation Summary</p>
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  {label:'Avg Rating',value:rating.toFixed(1),sub:'out of 5.0',color:C.amber},
                  {label:'Positive',  value:`${posPct}%`,     sub:`${reviews.filter(r=>r.rating>=4).length} reviews`,color:C.success},
                  {label:'Negative',  value:`${100-posPct}%`, sub:`${reviews.filter(r=>r.rating<4).length} reviews`,color:C.danger},
                ].map(({label,value,sub,color})=>(
                  <div key={label} className="text-center p-3 rounded-xl" style={{backgroundColor:C.g50}}>
                    <p className="text-2xl font-black" style={{color}}>{value}</p>
                    <p className="text-xs font-bold mt-0.5" style={{color:C.g500}}>{label}</p>
                    <p className="text-xs" style={{color:C.g400}}>{sub}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-center gap-0.5 mb-5">
                {[1,2,3,4,5].map(i=><Star key={i} size={18} className={i<=Math.round(rating)?'fill-yellow-400 text-yellow-400':'text-gray-200'}/>)}
              </div>
              {[5,4,3,2,1].map(n=>{
                const cnt=reviews.filter(r=>r.rating===n).length;
                const pct=reviews.length?Math.round(cnt/reviews.length*100):0;
                return(
                  <div key={n} className="flex items-center gap-2 text-xs mb-1.5">
                    <span className="w-4 font-bold text-right" style={{color:C.g500}}>{n}</span>
                    <Star size={10} className="fill-yellow-400 text-yellow-400 flex-shrink-0"/>
                    <div className="flex-1 h-2 rounded-full" style={{backgroundColor:C.g200}}>
                      <div className="h-2 rounded-full" style={{width:`${pct}%`,backgroundColor:C.amber}}/>
                    </div>
                    <span className="w-8 text-right font-semibold" style={{color:C.g400}}>{cnt}</span>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{borderColor:C.g200}}>
              <div className="px-4 py-3 border-b" style={{borderColor:C.g100}}>
                <p className="font-black text-sm" style={{color:C.forest}}>All Reviews ({reviews.length})</p>
              </div>
              {reviews.length===0?(
                <div className="p-8 text-center">
                  <MessageCircle size={32} className="mx-auto mb-2 opacity-20" style={{color:C.g400}}/>
                  <p className="text-xs" style={{color:C.g400}}>No reviews yet. Complete trades to get feedback.</p>
                </div>
              ):reviews.map(r=>(
                <div key={r.id} className="flex gap-3 px-4 py-3 border-b last:border-0 hover:bg-gray-50" style={{borderColor:C.g50}}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white flex-shrink-0" style={{backgroundColor:C.green}}>
                    {r.reviewer?.username?.charAt(0)?.toUpperCase()||'?'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-black text-xs" style={{color:C.forest}}>{r.reviewer?.username||'Trader'}</span>
                      <div className="flex gap-0.5">{[1,2,3,4,5].map(i=><Star key={i} size={9} className={i<=r.rating?'fill-yellow-400 text-yellow-400':'text-gray-200'}/>)}</div>
                      {r.is_verified_trade&&<span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{backgroundColor:`${C.success}15`,color:C.success}}>✓ Verified Trade</span>}
                    </div>
                    {r.comment&&<p className="text-xs" style={{color:C.g600}}>{r.comment}</p>}
                    <p className="text-xs mt-1" style={{color:C.g400}}>{fmtAge(r.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BADGES ──────────────────────────────────────────────────── */}
        {tab==='badges'&&(
          <div className="space-y-5 max-w-3xl">
            <div className="rounded-2xl p-5 text-white relative overflow-hidden"
              style={{background:`linear-gradient(135deg,${C.forest} 0%,${C.mint} 100%)`}}>
              <div className="absolute inset-0 opacity-5" style={{backgroundImage:'radial-gradient(circle at 2px 2px,white 1px,transparent 0)',backgroundSize:'20px 20px'}}/>
              <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-10 blur-3xl" style={{backgroundColor:C.gold}}/>
              <div className="relative flex items-center justify-between gap-4 flex-wrap mb-4">
                <div>
                  <p className="font-black text-xl" style={{fontFamily:"'Syne',sans-serif"}}>🏅 Badge Collection</p>
                  <p className="text-white/70 text-sm mt-0.5">
                    {earned.length===0?'Complete tasks below to start earning badges':
                     earned.length===BADGE_DEFS.length?'🎉 All badges earned — legendary status!':
                     `${earned.length} earned · ${BADGE_DEFS.length-earned.length} more to unlock`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-4xl font-black leading-none">{earned.length}<span className="text-white/40 text-2xl">/{BADGE_DEFS.length}</span></p>
                  <p className="text-white/50 text-xs mt-1">badges earned</p>
                </div>
              </div>
              <div className="relative">
                <div className="h-3 rounded-full" style={{backgroundColor:'rgba(255,255,255,0.15)'}}>
                  <div className="h-3 rounded-full transition-all duration-700"
                    style={{width:`${(earned.length/BADGE_DEFS.length)*100}%`,background:`linear-gradient(90deg,${C.gold},${C.amber})`}}/>
                </div>
                <div className="flex mt-2 gap-1.5">
                  {BADGE_DEFS.map(b=>{
                    const unlocked=badges.some(ba=>ba.badge_name===b.label&&ba.is_unlocked)||b.check(user);
                    return(
                      <div key={b.id} title={b.label} className="flex-1 h-1.5 rounded-full transition-all duration-300"
                        style={{backgroundColor:unlocked?C.gold:'rgba(255,255,255,0.2)'}}/>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {BADGE_DEFS.map(b=>{
                const has=badges.some(ba=>ba.badge_name===b.label&&ba.is_unlocked)||b.check(user);
                const daysOld=user?.created_at?Math.floor((Date.now()-new Date(user.created_at))/(1000*60*60*24)):0;
                const daysLeft=Math.max(0,365-daysOld);
                return(
                  <div key={b.id} className="rounded-2xl border-2 overflow-hidden transition-all duration-300"
                    style={{
                      borderColor:has?b.color:C.g200,
                      backgroundColor:has?b.bg:'#FAFAFA',
                      boxShadow:has?`0 4px 24px ${b.color}20`:'none',
                    }}>
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                          style={{
                            backgroundColor:has?`${b.color}20`:'rgba(0,0,0,0.05)',
                            filter:has?'none':'grayscale(1)',
                            opacity:has?1:0.45,
                          }}>
                          {b.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <p className="font-black text-sm" style={{color:has?b.color:C.g500}}>{b.label}</p>
                            {has
                              ?<span className="text-xs font-black px-2 py-0.5 rounded-full text-white" style={{backgroundColor:b.color}}>✓ EARNED</span>
                              :<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{backgroundColor:C.g100,color:C.g400}}>🔒 LOCKED</span>
                            }
                          </div>
                          <p className="text-xs leading-relaxed" style={{color:has?C.g700:C.g400}}>{b.desc}</p>
                        </div>
                      </div>

                      {!has&&b.id==='top_trader'&&(
                        <div className="mt-4 p-3 rounded-xl" style={{backgroundColor:'rgba(244,164,34,0.08)'}}>
                          <div className="flex justify-between text-xs mb-2">
                            <span style={{color:C.g500}} className="font-bold">Progress</span>
                            <span className="font-black" style={{color:b.color}}>{Math.min(100,trades)}/100 trades</span>
                          </div>
                          <div className="h-2.5 rounded-full" style={{backgroundColor:C.g200}}>
                            <div className="h-2.5 rounded-full" style={{width:`${Math.min(100,trades)}%`,backgroundColor:b.color}}/>
                          </div>
                          <p className="text-xs mt-1.5" style={{color:C.g400}}>{Math.max(0,100-trades)} more trades needed</p>
                        </div>
                      )}
                      {!has&&b.id==='high_volume'&&(
                        <div className="mt-4 p-3 rounded-xl" style={{backgroundColor:'rgba(16,185,129,0.08)'}}>
                          <div className="flex justify-between text-xs mb-2">
                            <span style={{color:C.g500}} className="font-bold">Volume traded</span>
                            <span className="font-black" style={{color:b.color}}>${fmt(Math.min(trades*100,10000))}/$10,000</span>
                          </div>
                          <div className="h-2.5 rounded-full" style={{backgroundColor:C.g200}}>
                            <div className="h-2.5 rounded-full" style={{width:`${Math.min(100,(trades*100/10000)*100)}%`,backgroundColor:b.color}}/>
                          </div>
                          <p className="text-xs mt-1.5" style={{color:C.g400}}>${fmt(Math.max(0,10000-trades*100))} more volume needed</p>
                        </div>
                      )}
                      {!has&&b.id==='trusted_seller'&&(
                        <div className="mt-4 p-3 rounded-xl" style={{backgroundColor:'rgba(239,68,68,0.06)'}}>
                          <div className="flex justify-between text-xs mb-2">
                            <span style={{color:C.g500}} className="font-bold">Trades toward goal</span>
                            <span className="font-black" style={{color:b.color}}>{Math.min(20,trades)}/20</span>
                          </div>
                          <div className="h-2.5 rounded-full" style={{backgroundColor:C.g200}}>
                            <div className="h-2.5 rounded-full" style={{width:`${Math.min(100,(trades/20)*100)}%`,backgroundColor:b.color}}/>
                          </div>
                          <p className="text-xs mt-1.5" style={{color:C.g400}}>Also requires 98%+ positive feedback</p>
                        </div>
                      )}
                      {!has&&b.id==='veteran'&&(
                        <div className="mt-4 p-3 rounded-xl" style={{backgroundColor:'rgba(109,40,217,0.06)'}}>
                          <div className="flex justify-between text-xs mb-2">
                            <span style={{color:C.g500}} className="font-bold">Account age</span>
                            <span className="font-black" style={{color:b.color}}>{Math.min(365,daysOld)}/365 days</span>
                          </div>
                          <div className="h-2.5 rounded-full" style={{backgroundColor:C.g200}}>
                            <div className="h-2.5 rounded-full" style={{width:`${Math.min(100,(daysOld/365)*100)}%`,backgroundColor:b.color}}/>
                          </div>
                          <p className="text-xs mt-1.5" style={{color:C.g400}}>{daysLeft>0?`${daysLeft} more day${daysLeft!==1?'s':''} to go`:'Unlock is imminent!'}</p>
                        </div>
                      )}
                    </div>

                    <div className="px-5 py-3 border-t flex items-start gap-2.5"
                      style={{borderColor:has?`${b.color}25`:C.g100,backgroundColor:has?`${b.color}06`:'rgba(0,0,0,0.02)'}}>
                      {has?(
                        <><CheckCircle size={13} style={{color:b.color,flexShrink:0,marginTop:1}}/><p className="text-xs font-bold" style={{color:b.color}}>Achievement unlocked · Badge visible on your public profile</p></>
                      ):(
                        <>
                          <ArrowRight size={13} style={{color:C.g400,flexShrink:0,marginTop:1}}/>
                          <div>
                            <p className="text-xs font-black mb-0.5" style={{color:C.g500}}>HOW TO EARN</p>
                            <p className="text-xs leading-relaxed" style={{color:C.g400}}>
                              {b.id==='verified_identity'&&<span>Go to <button onClick={()=>navigate('/settings?tab=verification')} style={{color:C.green,fontWeight:700,textDecoration:'underline',background:'none',border:'none',cursor:'pointer',padding:0}}>Settings → Verification</button> and complete KYC identity check.</span>}
                              {b.id==='top_trader'&&`Complete ${Math.max(0,100-trades)} more successful trades to reach 100 total.`}
                              {b.id==='high_volume'&&`Trade $${fmt(Math.max(0,10000-trades*100))} more in total volume across all trades.`}
                              {b.id==='fast_responder'&&'Consistently respond to trade requests within 5 minutes of receiving them.'}
                              {b.id==='trusted_seller'&&'Reach 20 completed trades while keeping 98%+ positive feedback.'}
                              {b.id==='veteran'&&(daysLeft>0?`Account must be 1+ year old. Keep trading — ${daysLeft} day${daysLeft!==1?'s':''} remaining.`:'Your veteran badge is nearly ready — keep trading!')}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {earned.length<BADGE_DEFS.length&&own&&(
              <div className="rounded-2xl p-5 border" style={{borderColor:`${C.gold}50`,background:'linear-gradient(135deg,#FFFBEB,#FFF7ED)'}}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">💡</span>
                  <div>
                    <p className="font-black text-sm mb-3" style={{color:'#92400E'}}>Tips to earn badges faster</p>
                    <div className="space-y-2">
                      {[
                        ['✅','Start with Verification — completing KYC unlocks the Verified Identity badge immediately.'],
                        ['📈','Every completed trade counts toward Top Trader (100 trades) and High Volume ($10k).'],
                        ['⚡','Reply to trade requests in under 5 minutes consistently to earn Fast Responder.'],
                        ['🔒','Complete 20+ trades with 98%+ positive feedback to unlock Trusted Seller.'],
                        ['🎖️','Veteran badge is time-based — it unlocks automatically after your account turns 1 year old.'],
                      ].map(([icon,tip],i)=>(
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>
                          <p className="text-xs leading-relaxed" style={{color:'#B45309'}}>{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {earned.length===BADGE_DEFS.length&&(
              <div className="rounded-2xl p-6 text-center relative overflow-hidden"
                style={{background:`linear-gradient(135deg,${C.forest},${C.gold})`}}>
                <div className="absolute inset-0 opacity-10" style={{backgroundImage:'radial-gradient(circle at 2px 2px,white 1px,transparent 0)',backgroundSize:'16px 16px'}}/>
                <p className="text-4xl mb-2">🎉</p>
                <p className="font-black text-xl text-white mb-1" style={{fontFamily:"'Syne',sans-serif"}}>Legendary Status!</p>
                <p className="text-white/70 text-sm">You've earned all 6 badges. You're among the most trusted traders on PRAQEN.</p>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS ────────────────────────────────────────────────── */}
        {tab==='settings'&&own&&(
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border shadow-sm p-5" style={{borderColor:C.g200}}>
              <p className="font-black text-sm mb-4" style={{color:C.forest}}>Edit Profile</p>
              <form onSubmit={saveProfile} className="space-y-3">
                {/* Username */}
                <div>
                  <label className="text-xs font-bold mb-1 flex items-center gap-1" style={{color:C.g600}}>
                    Username {user.username_changed&&<Lock size={10} style={{color:C.g400}}/>}
                  </label>
                  <input type="text" value={form.username||''} onChange={e=>setForm({...form,username:e.target.value})} placeholder="johndoe"
                    disabled={!!user.username_changed}
                    className="w-full px-3 py-2.5 text-sm border-2 rounded-xl focus:outline-none"
                    style={{borderColor:user.username_changed?C.g200:form.username?C.green:C.g200,backgroundColor:user.username_changed?C.g100:'white',color:user.username_changed?C.g400:C.g800,cursor:user.username_changed?'not-allowed':'text'}}/>
                  {user.username_changed
                    ? <p className="text-xs mt-1 flex items-center gap-1" style={{color:C.g400}}><Lock size={9}/>Username is permanently locked.</p>
                    : <p className="text-xs mt-1 flex items-center gap-1" style={{color:'#D97706'}}>⚠ You can only change your username once. Choose carefully.</p>
                  }
                </div>
                {/* Full Name */}
                <div>
                  <label className="text-xs font-bold mb-1 flex items-center gap-1" style={{color:C.g600}}>
                    Full Name {kycOk&&<Lock size={10} style={{color:C.g400}}/>}
                  </label>
                  <input type="text" value={form.full_name||''} onChange={e=>setForm({...form,full_name:e.target.value})} placeholder="John Doe"
                    disabled={kycOk}
                    className="w-full px-3 py-2.5 text-sm border-2 rounded-xl focus:outline-none"
                    style={{borderColor:kycOk?C.g200:form.full_name?C.green:C.g200,backgroundColor:kycOk?C.g100:'white',color:kycOk?C.g400:C.g800,cursor:kycOk?'not-allowed':'text'}}/>
                  {kycOk
                    ? <p className="text-xs mt-1 flex items-center gap-1" style={{color:C.g400}}><Lock size={9}/>Locked after ID verification.</p>
                    : <p className="text-xs mt-1 flex items-center gap-1" style={{color:C.g500}}>ℹ Full name cannot be changed after ID verification.</p>
                  }
                </div>
                {/* Location */}
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{color:C.g600}}>Location</label>
                  <input type="text" value={form.location||''} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Accra, Ghana"
                    className="w-full px-3 py-2.5 text-sm border-2 rounded-xl focus:outline-none"
                    style={{borderColor:form.location?C.green:C.g200}}/>
                </div>
                {/* Website — disabled */}
                <div>
                  <label className="text-xs font-bold mb-1 flex items-center gap-1" style={{color:C.g400}}>
                    Website <Lock size={10} style={{color:C.g300}}/>
                  </label>
                  <input type="url" value={form.website||''} placeholder="Coming soon" disabled
                    className="w-full px-3 py-2.5 text-sm border-2 rounded-xl focus:outline-none"
                    style={{borderColor:C.g200,backgroundColor:C.g100,color:C.g400,cursor:'not-allowed'}}/>
                  <p className="text-xs mt-1" style={{color:C.g400}}>Website link is currently unavailable.</p>
                </div>
                {/* Bio */}
                <div>
                  <label className="text-xs font-bold mb-1 block" style={{color:C.g600}}>Bio</label>
                  <textarea
                    value={form.bio||''}
                    onChange={e=>{
                      const val=e.target.value;
                      const wc=val.trim()===''?0:val.trim().split(/\s+/).length;
                      if(wc<=100) setForm({...form,bio:val});
                    }}
                    placeholder="Tell traders about yourself… (max 100 words)"
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm border-2 rounded-xl focus:outline-none resize-none"
                    style={{borderColor:form.bio?C.green:C.g200}}/>
                  <p className="text-xs mt-0.5 text-right" style={{color:(form.bio||'').trim()===''?C.g400:(form.bio||'').trim().split(/\s+/).length>=100?C.danger:C.g400}}>
                    {(form.bio||'').trim()===''?0:(form.bio||'').trim().split(/\s+/).length}/100 words
                  </p>
                </div>
                <button type="submit" disabled={saving}
                  className="w-full py-3 rounded-xl text-white font-black text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{backgroundColor:C.green}}>
                  {saving?<><RefreshCw size={14} className="animate-spin"/>Saving…</>:<><Save size={14}/>Save Changes</>}
                </button>
              </form>
            </div>
          </div>
        )}
        {tab==='settings'&&!own&&(
          <div className="max-w-2xl"><div className="bg-white rounded-2xl border shadow-sm p-8 text-center" style={{borderColor:C.g200}}><Lock size={32} className="mx-auto mb-3 opacity-20" style={{color:C.g400}}/><p className="text-sm" style={{color:C.g400}}>Settings are only visible to the account owner.</p></div></div>
        )}

      </div>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="mt-10" style={{backgroundColor:C.forest}}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xl" style={{backgroundColor:C.gold,color:C.forest}}>P</div>
                <span className="text-white font-black text-lg" style={{fontFamily:"'Syne',sans-serif"}}>PRAQEN</span>
              </div>
              <p className="text-xs leading-relaxed mb-4" style={{color:'rgba(255,255,255,0.45)'}}>Africa's most trusted P2P Bitcoin platform. Escrow-protected. Fast. Honest.</p>
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
                    className="w-9 h-9 rounded-xl flex items-center justify-center hover:scale-110 transition-transform"
                    style={{backgroundColor:bg}}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill={color} aria-hidden="true"><path d={d}/></svg>
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Trade</p>
              <div className="space-y-2">
                {[['Buy Bitcoin','/buy-bitcoin'],['Sell Bitcoin','/sell-bitcoin'],['Create Offer','/create-offer'],['My Trades','/my-trades'],['My Listings','/my-listings']].map(([l,h])=>(
                  <a key={l} href={h} className="block text-xs hover:text-white transition" style={{color:'rgba(255,255,255,0.45)'}}>{l}</a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Community & Support</p>
              <div className="space-y-2">
                {[
                  ['TikTok',             'https://www.tiktok.com/@praqen'],
                  ['WhatsApp Community', 'https://chat.whatsapp.com/LHVjrw9SK8qGoXcKvprjWz?mode=gi_t'],
                  ['Discord Server',     'https://discord.gg/V6zCZxfdy'],
                  ['X (Twitter)',        'https://x.com/praqenapp?s=21'],
                  ['Instagram',          'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr'],
                  ['LinkedIn',           'https://www.linkedin.com/in/pra-qen-045373402/'],
                  ['support@praqen.com', 'mailto:support@praqen.com'],
                ].map(([l,h])=>(
                  <a key={l} href={h} target={h.startsWith('mailto')?'_self':'_blank'} rel="noopener noreferrer" className="block text-xs hover:text-white transition" style={{color:'rgba(255,255,255,0.45)'}}>{l}</a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Legal</p>
              <div className="space-y-2">
                {[['Terms of Service','/terms'],['Privacy Policy','/privacy'],['Cookie Policy','/cookies'],['Contact','mailto:support@praqen.com']].map(([l,h])=>(
                  <a key={l} href={h} className="block text-xs hover:text-white transition" style={{color:'rgba(255,255,255,0.45)'}}>{l}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-5 border-t" style={{borderColor:'rgba(255,255,255,0.08)'}}>
            <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>© {new Date().getFullYear()} PRAQEN. All rights reserved.</p>
            <p className="text-xs flex items-center gap-1.5" style={{color:'rgba(255,255,255,0.3)'}}>
              <Shield size={11}/> Escrow Protected · 0.5% fee on completion only
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}