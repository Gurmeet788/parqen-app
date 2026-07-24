import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Send, MessageCircle, Copy, Paperclip } from 'lucide-react';
import { toast } from 'react-toastify';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = { green:'#2D6A4F', danger:'#EF4444', g400:'#94A3B8', g200:'#E2E8F0' };

const authH = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const fmtBtc = (n, d = 8) => parseFloat(n || 0).toFixed(d);

export default function TradeChat({ user }) {
  const { id } = useParams();
  const [trade, setTrade] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    loadTrade();
    loadMessages();
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadTrade = async () => {
    try {
      const r = await axios.get(`${API_URL}/trades/${id}`, { headers: authH() });
      setTrade(r.data.trade || r.data);
    } catch (error) {
      console.error('Failed to load trade:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await axios.get(`${API_URL}/messages/${id}`, { headers: authH() });
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    try {
      await axios.post(`${API_URL}/messages`, { tradeId: id, message: newMessage }, { headers: authH() });
      setNewMessage('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      await loadMessages();
    } catch (error) {
      const serverError = error?.response?.data?.error || error?.response?.data?.message;
      toast.error(serverError || 'Failed to send message');
    }
  };

  if (loading) return <div className="text-center py-10">Loading chat...</div>;

  const isBuyer = trade && user && trade.buyer_id === user.id;
  const isSeller = trade && user && trade.seller_id === user.id;
  const payMethod = trade?.payment_method || trade?.pay_method || 'the agreed method';
  const cur = trade?.local_currency || trade?.currency || 'USD';
  const fiatAmt = parseFloat(trade?.amount_local || trade?.amount_usd || 0);
  const btcAmt = parseFloat(trade?.amount_btc || 0);
  const otherName = isBuyer ? trade?.seller_name : trade?.buyer_name;

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0">
        <MessageCircle size={20} style={{ color: C.green }} />
        <h3 className="text-lg font-bold text-slate-900">Chat with {otherName || 'counterparty'}</h3>
      </div>

      {trade && (
        <div className="flex-shrink-0 px-3 py-2.5" style={{ backgroundColor: isSeller ? C.danger : C.green }}>
          <p className="text-xs leading-snug font-black uppercase tracking-wide" style={{ color: '#fff' }}>
            {isBuyer
              ? `YOU ARE BUYING ${fmtBtc(btcAmt)} BTC FOR ${fiatAmt.toFixed(2)} ${cur} ${payMethod}`
              : isSeller
                ? `YOU ARE SELLING ${fmtBtc(btcAmt)} BTC FOR ${fiatAmt.toFixed(2)} ${cur} ${payMethod}`
                : `TRADE: ${fmtBtc(btcAmt)} BTC FOR ${fiatAmt.toFixed(2)} ${cur}`}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundColor: '#F9FAFB', minHeight: 0 }}>
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className="relative max-w-xs px-3.5 py-2.5 rounded-2xl shadow-md"
                  style={{ background: isOwn ? C.green : '#334155', color: '#fff', paddingRight: 32 }}>
                  <p className="text-xs font-black mb-1" style={{ opacity: 0.85 }}>
                    {isOwn ? 'You' : (otherName || 'User')}
                  </p>
                  <p className="text-sm break-words">{msg.message_text}</p>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(msg.message_text); toast.success('Copied!'); }}
                    className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center"
                    title="Copy message">
                    <Copy size={13} style={{ color: 'rgba(255,255,255,0.7)' }} />
                  </button>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {new Date(msg.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}{' '}
                    {new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="flex-shrink-0 flex items-end gap-2 p-3 border-t bg-white">
        <button type="button" className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100">
          <Paperclip size={18} style={{ color: C.g400 }} />
        </button>
        <textarea
          ref={textareaRef}
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); }
          }}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 px-4 py-2.5 border-2 rounded-2xl focus:outline-none resize-none"
          style={{ borderColor: newMessage ? C.green : C.g200, fontSize: 15, maxHeight: 120, overflowY: 'auto', lineHeight: 1.4 }}
        />
        <button type="submit" disabled={!newMessage.trim()}
          className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-white disabled:opacity-40"
          style={{ background: C.green }}>
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
