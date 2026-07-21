import { useState, useEffect } from "react";

function ProfileFlag() {
  const [countryData, setCountryData] = useState({ code: null, name: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((res) => res.json())
      .then((data) => {
        setCountryData({
          code: data.country_code?.toLowerCase(),
          name: data.country_name,
        });
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching location:", err);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) return <span className="text-gray-400">...</span>;
  if (!countryData.code) return null;

  // Use emoji flag
  const flagEmoji = countryData.code
    ? String.fromCodePoint(
        ...[...countryData.code.toUpperCase()].map(
          (c) => 0x1f1e6 + c.charCodeAt(0) - 65,
        ),
      )
    : "🌍";

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{flagEmoji}</span>
      <span className="text-sm text-gray-600">{countryData.name}</span>
    </div>
  );
}

export default ProfileFlag;
