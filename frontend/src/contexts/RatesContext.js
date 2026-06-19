import React, { createContext, useContext, useState, useEffect } from 'react';
import rateService from '../services/rateService';

const FALLBACK = {
  GHS: 11.21, NGN: 1635, KES: 129, ZAR: 18.4, UGX: 3730,
  TZS: 2690,  USD: 1,    GBP: 0.79, EUR: 0.92, XAF: 614, XOF: 614,
};

const RatesContext = createContext({
  rates:  FALLBACK,
  btcUsd: 0,
  loading: true,
});

export function RatesProvider({ children }) {
  const [rates,  setRates]  = useState(FALLBACK);
  const [btcUsd, setBtcUsd] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Start auto-refresh (fetches immediately on mount)
    rateService.startAutoRefresh();

    // Subscribe to rate updates
    const unsub = rateService.subscribe(({ rates: r, btcUsd: b }) => {
      setRates({ ...r });
      setBtcUsd(b);
      setLoading(false);
    });

    // If rates were already fetched before this component mounted, hydrate immediately
    if (rateService.lastUpdated) {
      setRates(rateService.getRatesSnapshot());
      setBtcUsd(rateService.btcUsd);
      setLoading(false);
    }

    return () => {
      unsub();
      rateService.stopAutoRefresh();
    };
  }, []);

  return (
    <RatesContext.Provider value={{ rates, btcUsd, loading }}>
      {children}
    </RatesContext.Provider>
  );
}

// Hook — use in any component to access live rates
export function useRates() {
  return useContext(RatesContext);
}

export default RatesContext;
