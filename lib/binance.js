// lib/binance.js
const EXCLUDED = ['XAU','XAG','PAXG','USDC','BUSD','TUSD','USDP','FDUSD','DAI','USDD','EUR','GBP','BRL','TRY','ARS'];
const BASE_URL = 'https://data-api.binance.vision';

export async function getAllUSDTPairs() {
  const res = await fetch(`${BASE_URL}/api/v3/ticker/24hr`);
  if (!res.ok) throw new Error(`Binance API ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return data
    .filter(t => {
      if (!t.symbol.endsWith('USDT')) return false;
      const base = t.symbol.replace('USDT', '');
      if (EXCLUDED.some(kw => base.includes(kw))) return false;
      if (parseFloat(t.quoteVolume) < 100000) return false;
      return true;
    })
    .map(t => ({
      symbol:        t.symbol,
      base:          t.symbol.replace('USDT', ''),
      price:         parseFloat(t.lastPrice),
      priceChange24h:parseFloat(t.priceChangePercent),
      volume24h:     parseFloat(t.quoteVolume),
      high24h:       parseFloat(t.highPrice),
      low24h:        parseFloat(t.lowPrice),
    }));
}
