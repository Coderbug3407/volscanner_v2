// api/scan.js — Vercel Cron: 5 * * * * (lúc :05 mỗi giờ)
import { getAllUSDTPairs }    from '../lib/binance.js';
import { saveHourlySnapshot } from '../lib/github-storage.js';

export const config = { maxDuration: 60 };

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'POST')
    return new Response('Method not allowed', { status: 405 });

  try {
    const t0    = Date.now();
    const pairs = await getAllUSDTPairs();
    await saveHourlySnapshot(pairs);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[scan] ${pairs.length} pairs saved in ${elapsed}s`);
    return new Response(
      JSON.stringify({ success: true, pairs: pairs.length, elapsed: `${elapsed}s` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[scan]', err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
