import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";

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
  g400: "#94A3B8",
  g500: "#64748B",
  g600: "#475569",
  g700: "#334155",
  success: "#10B981",
  danger: "#EF4444",
  paid: "#3B82F6",
};

export default function EmailConfirmation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying"); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const token = searchParams.get("token");
        const type = searchParams.get("type");

        if (!token) {
          setStatus("error");
          setMessage("Invalid verification link. No token provided.");
          return;
        }

        // Verify the email confirmation
        const { error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: type || "email",
        });

        if (error) {
          setStatus("error");
          setMessage(error.message || "Email verification failed.");
        } else {
          setStatus("success");
          setMessage("Email verified successfully! You can now log in.");
          // Redirect to login after 3 seconds
          setTimeout(() => {
            navigate("/login");
          }, 3000);
        }
      } catch (err) {
        setStatus("error");
        setMessage("An unexpected error occurred during verification.");
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: C.mist }}
    >
      <div className="max-w-md w-full mx-4">
        <div
          className="bg-white rounded-2xl shadow-xl border overflow-hidden"
          style={{ borderColor: C.g200 }}
        >
          {/* Header */}
          <div className="px-6 py-8 text-center">
            {status === "verifying" && (
              <>
                <RefreshCw
                  size={48}
                  className="animate-spin mx-auto mb-4"
                  style={{ color: C.gold }}
                />
                <h1
                  className="text-2xl font-black mb-2"
                  style={{ color: C.forest }}
                >
                  Verifying Email
                </h1>
                <p className="text-sm" style={{ color: C.g500 }}>
                  Please wait while we confirm your email address...
                </p>
              </>
            )}

            {status === "success" && (
              <>
                <CheckCircle
                  size={48}
                  className="mx-auto mb-4"
                  style={{ color: C.success }}
                />
                <h1
                  className="text-2xl font-black mb-2"
                  style={{ color: C.forest }}
                >
                  Email Verified!
                </h1>
                <p className="text-sm mb-4" style={{ color: C.g500 }}>
                  {message}
                </p>
                <p className="text-xs" style={{ color: C.g400 }}>
                  Redirecting to login in 3 seconds...
                </p>
              </>
            )}

            {status === "error" && (
              <>
                <XCircle
                  size={48}
                  className="mx-auto mb-4"
                  style={{ color: C.danger }}
                />
                <h1
                  className="text-2xl font-black mb-2"
                  style={{ color: C.forest }}
                >
                  Verification Failed
                </h1>
                <p className="text-sm mb-4" style={{ color: C.g500 }}>
                  {message}
                </p>
                <button
                  onClick={() => navigate("/login")}
                  className="w-full py-3 rounded-xl font-bold text-white"
                  style={{
                    background: `linear-gradient(135deg,${C.green},${C.mint})`,
                  }}
                >
                  Go to Login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
