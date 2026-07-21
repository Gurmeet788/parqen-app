import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_URL } from "../App";
import { Send, MessageCircle } from "lucide-react";
import { toast } from "react-toastify";

export default function TradeChat({ tradeId, userId, otherUserName }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadMessages();
    // Poll for new messages every 2 seconds
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [tradeId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadMessages = async () => {
    try {
      const response = await axios.get(`${API_URL}/messages/${tradeId}`);
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      await axios.post(`${API_URL}/messages`, {
        tradeId,
        message: newMessage,
      });
      setNewMessage("");
      await loadMessages();
    } catch (error) {
      const serverError =
        error?.response?.data?.error || error?.response?.data?.message;
      console.error("Error sending message:", serverError || error);
      toast.error(serverError || "Failed to send message");
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading chat...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle size={24} className="text-blue-600" />
        <h3 className="text-xl font-semibold text-slate-900">
          Live Chat with {otherUserName}
        </h3>
      </div>

      {/* Messages Container */}
      <div className="bg-gray-50 rounded-lg h-96 overflow-y-auto p-4 mb-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender_id === userId ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.sender_id === userId
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-300"
                }`}
              >
                <p className="text-sm">{msg.message_text}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.sender_id === userId ? "text-blue-100" : "text-gray-500"
                  }`}
                >
                  {new Date(msg.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition"
        >
          <Send size={18} />
          Send
        </button>
      </form>

      {/* Buyer Tip */}
      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
        💡 <strong>Tip:</strong> Communicate here before confirming. Ask
        questions about the gift card!
      </div>
    </div>
  );
}
