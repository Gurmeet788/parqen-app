import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Save, ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const PRAQEN = {
  primary: "#2D5F4F",
  secondary: "#FFD700",
  lightBg: "#f0f8f5",
};

export default function EditListing({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    giftCardBrand: "",
    amountUsd: "",
    bitcoinPrice: "",
    processingTime: 15,
    description: "",
  });

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    loadListing();
  }, [id]);

  const loadListing = async () => {
    try {
      const response = await axios.get(`${API_URL}/listings/${id}`);
      const listing = response.data.listing;
      setFormData({
        giftCardBrand: listing.gift_card_brand,
        amountUsd: listing.amount_usd,
        bitcoinPrice: listing.bitcoin_price,
        processingTime: listing.processing_time_minutes || 15,
        description: listing.description || "",
      });
    } catch (error) {
      console.error("Failed to load listing:", error);
      toast.error("Failed to load listing");
      navigate("/my-listings");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.put(`${API_URL}/listings/${id}`, formData);
      toast.success("Listing updated successfully!");
      navigate("/my-listings");
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update listing");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: PRAQEN.lightBg }}
      >
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{
              borderColor: PRAQEN.primary,
              borderTopColor: PRAQEN.secondary,
            }}
          ></div>
          <p style={{ color: PRAQEN.primary }}>Loading listing...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ backgroundColor: PRAQEN.lightBg }}
    >
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate("/my-listings")}
          className="flex items-center gap-2 mb-6 hover:opacity-70"
          style={{ color: PRAQEN.primary }}
        >
          <ArrowLeft size={20} />
          Back to My Listings
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1
            className="text-2xl font-black mb-6"
            style={{ color: PRAQEN.primary }}
          >
            Edit Listing
          </h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Gift Card Brand
              </label>
              <input
                type="text"
                value={formData.giftCardBrand}
                onChange={(e) =>
                  setFormData({ ...formData, giftCardBrand: e.target.value })
                }
                className="w-full px-4 py-2 border-2 rounded-lg focus:outline-none"
                style={{ borderColor: "#d1d5db" }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Amount (USD)
                </label>
                <input
                  type="number"
                  value={formData.amountUsd}
                  onChange={(e) =>
                    setFormData({ ...formData, amountUsd: e.target.value })
                  }
                  className="w-full px-4 py-2 border-2 rounded-lg focus:outline-none"
                  style={{ borderColor: "#d1d5db" }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Bitcoin Price
                </label>
                <input
                  type="number"
                  step="0.00000001"
                  value={formData.bitcoinPrice}
                  onChange={(e) =>
                    setFormData({ ...formData, bitcoinPrice: e.target.value })
                  }
                  className="w-full px-4 py-2 border-2 rounded-lg focus:outline-none"
                  style={{ borderColor: "#d1d5db" }}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Processing Time (minutes)
              </label>
              <input
                type="number"
                value={formData.processingTime}
                onChange={(e) =>
                  setFormData({ ...formData, processingTime: e.target.value })
                }
                className="w-full px-4 py-2 border-2 rounded-lg focus:outline-none"
                style={{ borderColor: "#d1d5db" }}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Description (Optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows="3"
                className="w-full px-4 py-2 border-2 rounded-lg focus:outline-none"
                style={{ borderColor: "#d1d5db" }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-white font-bold transition hover:opacity-80"
              style={{ backgroundColor: PRAQEN.primary }}
            >
              <Save size={18} />
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
