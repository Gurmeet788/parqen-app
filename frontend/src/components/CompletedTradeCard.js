import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ShieldCheck, Clock, AlertCircle } from 'lucide-react';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', amber:'#F59E0B', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', warn:'#F59E0B', paid:'#3B82F6',
  online:'#22C55E', purple:'#8B5CF6',
};

export default function CompletedTradeCard({
  tradeId,
  isBuyer,
  status, // { bg, color, short, label }
  typeLabel, // "🎁 GIFT CARD" | "🛒 BUYING BTC" | "💰 SELLING BTC"
  typeColor, // C.purple, C.amber, C.green
  isActive, // boolean
  counterparty, // { name, flag }
  paymentMethod,
  payDisplay,
  btcEscrow, // string formatted
  youReceive, // string formatted
  ageStr, // string
}) {
  return (
    <Link to={`/trade/${tradeId}`}
      className="block bg-white rounded-[1.25rem] overflow-hidden hover:shadow-lg hover:-translate-y-[1px] transition-all duration-200 group relative"
      style={{
        border: isActive ? `1.5px solid ${typeColor}40` : `1px solid ${C.g200}`,
        boxShadow: isActive ? `0 4px 15px ${typeColor}15` : '0 2px 8px rgba(0,0,0,0.02)',
      }}>

      {/* Active Indicator Line */}
      {isActive && (
        <div className="absolute top-0 left-0 w-full h-1 z-10" style={{ backgroundColor: typeColor }}></div>
      )}

      {/* Header Strip */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b relative"
        style={{ backgroundColor: isActive ? `${typeColor}05` : C.g50, borderColor: isActive ? `${typeColor}15` : C.g100 }}>
        <div className="flex items-center gap-2.5">
          <span className="font-black text-[10px] sm:text-xs uppercase tracking-wider px-2.5 py-1 rounded-md text-white shadow-sm"
            style={{ backgroundColor: typeColor }}>
            {typeLabel}
          </span>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded border shadow-sm"
            style={{ backgroundColor: status.bg, color: status.color, borderColor: `${status.color}30` }}>
            {status.short}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest px-2 py-1 rounded bg-white shadow-sm" style={{ color: C.g500 }}>
            #{String(tradeId || '').slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Details Grid */}
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:gap-y-5">
          
          {/* Counterparty */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.g400 }}>
              {isBuyer ? 'Seller' : 'Buyer'}
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm shadow-sm rounded-sm bg-white border border-gray-100 flex-shrink-0">{counterparty.flag}</span>
              <span className="font-black text-[13px] sm:text-sm truncate" style={{ color: C.g800 }}>
                {counterparty.name}
              </span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.g400 }}>
              Payment
            </span>
            <span className="font-bold text-[13px] sm:text-sm truncate" style={{ color: C.g700 }}>
              {paymentMethod}
            </span>
          </div>

          {/* You Pay / Buyer Pays */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.g400 }}>
              {isBuyer ? 'You Pay' : 'Buyer Pays'}
            </span>
            <span className="font-black text-[14px] sm:text-[15px] truncate" style={{ color: C.g800 }}>
              {payDisplay}
            </span>
          </div>

          {/* Escrow */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.g400 }}>
              BTC Escrow
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              <ShieldCheck size={14} style={{ color: C.amber, flexShrink:0 }}/>
              <span className="font-black text-[14px] sm:text-[15px] truncate" style={{ color: C.amber }}>
                {btcEscrow}
              </span>
            </div>
          </div>

        </div>

        <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: C.g100 }}>
          {/* You Receive */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest bg-gray-50 px-2 py-1 rounded" style={{ color: C.g500 }}>
              You Receive
            </span>
            <span className="font-black text-base sm:text-lg" style={{ color: isBuyer ? C.success : typeColor }}>
              {youReceive}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 sm:px-5 py-3 border-t flex items-center justify-between transition-colors group-hover:bg-gray-50/50"
        style={{ borderColor: C.g100, backgroundColor: '#FAFAFA' }}>
        <div className="flex items-center gap-1.5">
          <Clock size={12} style={{ color: C.g400 }}/>
          <span className="text-[11px] font-medium" style={{ color: C.g400 }}>{ageStr}</span>
        </div>
        <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-transform group-hover:translate-x-1" style={{ color: typeColor }}>
          View Trade <ChevronRight size={13} strokeWidth={3}/>
        </span>
      </div>
    </Link>
  );
}
