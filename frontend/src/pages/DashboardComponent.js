import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLocalUser } from "../hooks/useLocalUser";
import {
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Star,
  DollarSign,
  ArrowRight,
  Shield,
  Activity,
  MapPin,
  Calendar,
  BadgeCheck,
  Send,
  Eye,
  EyeOff,
  Bitcoin,
  MessageCircle,
  Gift,
  Copy,
  RefreshCw,
  Users,
  Medal,
  Crown,
  Zap,
  BarChart3,
  ChevronRight,
  PlusCircle,
  X,
  Link,
  TrendingDown,
  Award,
  Flame,
  UserCheck,
  UserX,
  Target,
  Percent,
  Lock,
} from "lucide-react";
import { toast } from "react-toastify";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// ─── Color palette ─────────────────────────────────────────────────────────────
const C = {
  forest: "#1B4332",
  green: "#2D6A4F",
  mint: "#40916C",
  sage: "#52B788",
  gold: "#F4A422",
  amber: "#F59E0B",
  mist: "#F0FAF5",
  white: "#FFFFFF",
  g50: "#F8FAFC",
  g100: "#F1F5F9",
  g200: "#E2E8F0",
  g300: "#CBD5E1",
  g400: "#94A3B8",
  g500: "#64748B",
  g600: "#475569",
  g700: "#334155",
  g800: "#1E293B",
  success: "#10B981",
  danger: "#EF4444",
  warn: "#F59E0B",
  paid: "#3B82F6",
  online: "#22C55E",
  purple: "#8B5CF6",
};

// ─── Placeholder Components ───────────────────────────────────────────────────
function RecentActivity({ user }) {
  return (
    <div
      className="bg-white rounded-2xl p-6 shadow-sm"
      style={{ border: `1px solid ${C.g200}` }}
    >
      <h3 className="font-black text-lg mb-4" style={{ color: C.forest }}>
        Recent Activity
      </h3>
      <p className="text-sm" style={{ color: C.g500 }}>
        Activity feed coming soon...
      </p>
    </div>
  );
}

function MyTradesSection({ user }) {
  return (
    <div
      className="bg-white rounded-2xl p-6 shadow-sm"
      style={{ border: `1px solid ${C.g200}` }}
    >
      <h3 className="font-black text-lg mb-4" style={{ color: C.forest }}>
        My Trades
      </h3>
      <p className="text-sm" style={{ color: C.g500 }}>
        Trade history coming soon...
      </p>
    </div>
  );
}

function WithdrawModal({ balance, onClose, onSuccess }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
        <h3 className="font-black text-lg mb-4" style={{ color: C.forest }}>
          Withdraw Funds
        </h3>
        <p className="text-sm mb-4" style={{ color: C.g500 }}>
          Withdraw modal coming soon...
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl font-bold text-white"
          style={{ backgroundColor: C.green }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard Component ─────────────────────────────────────────────────
export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const { localUser, updateLocalUser } = useLocalUser();

  // ── State ───────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState({});
  const [stats, setStats] = useState({});
  const [earnings, setEarnings] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [activeTab, setActiveTab] = useState("overview");
  const [showWithdraw, setShowWithdraw] = useState(false);

  // ── HD Wallet Balance Fetch ─────────────────────────────────────────────────
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const response = await fetch(`${API_URL}/hd-wallet/wallet`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success) {
          setBalance(data.balance_btc || 0);
        }
      } catch (error) {
        console.error("Failed to fetch wallet balance:", error);
      }
    };

    fetchBalance();
    // Refresh every 60 seconds
    const interval = setInterval(fetchBalance, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Load Dashboard Data ─────────────────────────────────────────────────────
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      // Load user profile
      const profileRes = await axios.get(`${API_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(profileRes.data.user || profileRes.data);

      // Load user stats
      const statsRes = await axios.get(`${API_URL}/users/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(statsRes.data.stats || statsRes.data);

      // Load affiliate earnings
      const earningsRes = await axios.get(
        `${API_URL}/users/affiliate-earnings`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setEarnings(earningsRes.data.earnings || []);

      // Load wallet balance from user_wallets (source of truth)
      const walletRes = await axios.get(`${API_URL}/hd-wallet/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWalletBalance(parseFloat(walletRes.data.balance_btc || 0));
    } catch (err) {
      console.error("Dashboard load error:", err);
      setError(err.response?.data?.error || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // ── Loading State ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: C.g50 }}
      >
        <div className="text-center">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: C.green }}
          />
          <p style={{ color: C.g600 }}>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // ── Error State ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: C.g50 }}
      >
        <div
          className="bg-white rounded-2xl p-8 text-center max-w-md shadow-sm"
          style={{ border: `1px solid ${C.g200}` }}
        >
          <AlertCircle
            size={48}
            className="mx-auto mb-4"
            style={{ color: C.danger }}
          />
          <h2 className="font-black text-lg mb-2" style={{ color: C.g800 }}>
            Oops!
          </h2>
          <p className="text-sm mb-6" style={{ color: C.g600 }}>
            {error}
          </p>
          <button
            onClick={loadDashboardData}
            className="px-6 py-2 rounded-xl font-bold text-white"
            style={{ backgroundColor: C.green }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Main Dashboard ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: C.g50 }}>
      {/* Header with Balance */}
      <div className="bg-white border-b" style={{ borderColor: C.g200 }}>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black" style={{ color: C.forest }}>
                Welcome back, {profile?.username || user?.username}!
              </h1>
              <p className="text-sm mt-1" style={{ color: C.g500 }}>
                Here's what's happening with your account
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2">
                <Bitcoin size={20} style={{ color: C.gold }} />
                <span className="font-black text-lg" style={{ color: C.g800 }}>
                  {balance.toFixed(8)} BTC
                </span>
              </div>
              <p className="text-xs" style={{ color: C.g500 }}>
                Wallet Balance
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Stats Cards */}
          <StatCard
            icon={Wallet}
            label="Wallet Balance"
            value={`${walletBalance.toFixed(8)} BTC`}
            color={C.green}
          />
          <StatCard
            icon={TrendingUp}
            label="Total Trades"
            value={stats?.totalTrades || 0}
            color={C.paid}
          />
          <StatCard
            icon={Star}
            label="Completion Rate"
            value={`${stats?.completionRate || 0}%`}
            color={C.gold}
          />
        </div>

        {/* Tab Navigation */}
        <div
          className="flex gap-1 mb-6 bg-white rounded-xl p-1"
          style={{ border: `1px solid ${C.g200}` }}
        >
          {[
            { id: "overview", label: "Overview", icon: BarChart3 },
            { id: "trades", label: "My Trades", icon: Activity },
            { id: "affiliate", label: "Affiliate", icon: Users },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold text-sm transition-all ${
                activeTab === tab.id
                  ? "bg-green-50 text-green-700 shadow-sm"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <ProfileSummary user={user} profile={profile} stats={stats} />
            <RecentActivity user={user} />
          </div>
        )}

        {activeTab === "trades" && <MyTradesSection user={user} />}

        {activeTab === "affiliate" && (
          <AffiliateSection user={user} profile={profile} earnings={earnings} />
        )}
      </div>

      {/* Withdraw modal */}
      {showWithdraw && (
        <WithdrawModal
          balance={walletBalance}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            setShowWithdraw(false);
            loadDashboardData();
          }}
        />
      )}
    </div>
  );
}
