import { useRates } from "../contexts/RatesContext";

function LiveRates() {
  const { rates, btcUsd } = useRates();

  const usdToGhs = rates.GHS || 11.06;
  const usdToNgn = rates.NGN || 1610;
  const btcToGhs = btcUsd * usdToGhs;
  const btcToNgn = btcUsd * usdToNgn;

  return (
    <div className="live-rates">
      <div className="rate-item">
        <span>1 USD = ₵{usdToGhs.toFixed(2)} GHS</span>
      </div>
      <div className="rate-item">
        <span>1 USD = ₦{usdToNgn.toFixed(2)} NGN</span>
      </div>
      {btcUsd > 0 && (
        <>
          <div className="rate-item font-semibold">
            <span>1 BTC = ₵{Math.round(btcToGhs).toLocaleString()}</span>
          </div>
          <div className="rate-item font-semibold">
            <span>1 BTC = ₦{Math.round(btcToNgn).toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default LiveRates;
