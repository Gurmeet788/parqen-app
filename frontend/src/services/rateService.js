// Central exchange rate service — fetches from backend (which proxies live sources)
// Backend endpoint: GET /api/rates  →  { btcUsd, rates, updatedAt }
// Fallback chain (if backend unreachable): Binance → Coinbase for BTC,
//                                          open.er-api.com → Frankfurter for FX

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const FALLBACK_RATES = {
  GHS: 16.0,  NGN: 1650,  KES: 129,  ZAR: 18.4,  UGX: 3730,
  TZS: 2690,  USD: 1,     GBP: 0.79, EUR: 0.92,  XAF: 614,
  XOF: 614,   RWF: 1325,  ETB: 58,   AUD: 1.55,  CAD: 1.37,
  SGD: 1.35,  INR: 83.5,  MAD: 10.1, ZMW: 26.5,  MWK: 1730,
};

const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute

class RateService {
  constructor() {
    this.rates       = { ...FALLBACK_RATES };
    this.btcUsd      = 0;
    this.lastUpdated = null;
    this.listeners   = [];
    this._fetchPromise = null;
    this._timer        = null;
  }

  async fetchRates() {
    if (this._fetchPromise) return this._fetchPromise;

    this._fetchPromise = (async () => {
      try {
        // ── PRIMARY: our own backend (already has working live rate fetching) ──
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res   = await fetch(`${API_URL}/rates`, { signal: ctrl.signal });
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          if (data.btcUsd > 0)  this.btcUsd = data.btcUsd;
          if (data.rates)       Object.assign(this.rates, data.rates);
          this.lastUpdated = new Date();
          console.log(`[RateService] ✅ via backend — BTC $${Math.round(this.btcUsd).toLocaleString()} · GHS ${this.rates.GHS?.toFixed(4)}`);
          this._notifyListeners();
          return { rates: this.rates, btcUsd: this.btcUsd };
        }
      } catch (e) {
        console.warn('[RateService] backend /api/rates failed, trying direct APIs:', e.message);
      }

      // ── FALLBACK: fetch directly from third-party APIs ──
      try {
        const ctrl2  = new AbortController();
        const timer2 = setTimeout(() => ctrl2.abort(), 10000);

        const [btcResult, fxResult] = await Promise.allSettled([
          // BTC: Binance → Coinbase
          fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { signal: ctrl2.signal })
            .then(r => r.json()).then(d => parseFloat(d.price))
            .catch(() =>
              fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', { signal: ctrl2.signal })
                .then(r => r.json()).then(d => parseFloat(d?.data?.amount))
            ),
          // FX: open.er-api.com
          fetch('https://open.er-api.com/v6/latest/USD', { signal: ctrl2.signal })
            .then(r => r.json())
            .then(d => (d?.result === 'success' ? d.rates : null)),
        ]);
        clearTimeout(timer2);

        if (btcResult.status === 'fulfilled' && btcResult.value > 0) this.btcUsd = btcResult.value;
        if (fxResult.status  === 'fulfilled' && fxResult.value)      Object.assign(this.rates, fxResult.value);

        this.lastUpdated = new Date();
        console.log(`[RateService] ✅ via direct APIs — BTC $${Math.round(this.btcUsd).toLocaleString()} · GHS ${this.rates.GHS?.toFixed(4)}`);
      } catch (err) {
        console.warn('[RateService] all sources failed, using fallback rates:', err.message);
      }

      this._notifyListeners();
      return { rates: this.rates, btcUsd: this.btcUsd };
    })().finally(() => { this._fetchPromise = null; });

    return this._fetchPromise;
  }

  startAutoRefresh() {
    this.fetchRates();
    if (!this._timer) {
      this._timer = setInterval(() => this.fetchRates(), REFRESH_INTERVAL_MS);
    }
  }

  stopAutoRefresh() {
    clearInterval(this._timer);
    this._timer = null;
  }

  getRate(currency) {
    return this.rates[currency] || FALLBACK_RATES[currency] || 1;
  }

  getBTCInLocal(currency) {
    return this.btcUsd * this.getRate(currency);
  }

  getRatesSnapshot() {
    return { ...this.rates };
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  _notifyListeners() {
    this.listeners.forEach(l => l({ rates: this.rates, btcUsd: this.btcUsd }));
  }
}

export const rateService = new RateService();
export default rateService;
