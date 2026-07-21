import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../App";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { toast } from "react-toastify";

const PRAQEN = {
  primary: "#2D5F4F",
  secondary: "#FFD700",
  lightBg: "#f0f8f5",
};

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email });
      setSubmitted(true);
      toast.success("Reset link sent to your email");
    } catch (error) {
      console.error("Error:", error);
      toast.error(error?.response?.data?.error || "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: PRAQEN.lightBg }}
      >
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle size={64} className="mx-auto mb-4 text-green-500" />
          <h2
            className="text-2xl font-black mb-2"
            style={{ color: PRAQEN.primary }}
          >
            Check Your Email
          </h2>
          <p className="text-gray-600 mb-6">
            We've sent a password reset link to <strong>{email}</strong>
          </p>
          <Link
            to="/login"
            className="text-sm hover:underline"
            style={{ color: PRAQEN.primary }}
          >
            ← Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: PRAQEN.lightBg }}
    >
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: PRAQEN.lightBg }}
          >
            <Mail size={32} style={{ color: PRAQEN.primary }} />
          </div>
          <h1 className="text-2xl font-black" style={{ color: PRAQEN.primary }}>
            Forgot Password?
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            Enter your email and we'll send you a link to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 border-2 rounded-lg focus:outline-none transition"
              style={{ borderColor: "#d1d5db" }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg text-white font-bold transition hover:opacity-80"
            style={{ backgroundColor: PRAQEN.primary }}
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>

          <p className="text-center text-sm">
            <Link
              to="/login"
              className="hover:underline"
              style={{ color: PRAQEN.primary }}
            >
              ← Back to Login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
