// api/alert-check.js — Vercel Cron: 0 * * * * (lúc :00 mỗi giờ)
import { getRecentSnapshots, saveAlerts, getAlertedSymbols } from '../lib/github-storage.js';
import { sendMessage, formatAlertMessage } from '../lib/telegram.js';

export const config = { maxDuration: 60 };

const MIN_CONSECUTIVE_HOURS  = 3;    // giờ tăng liên tiếp tối thiểu
const MIN_GROWTH_PCT_PER_HOUR = 5;   // % tăng tối thiểu mỗi giờ
const MIN_TOTAL_GROWTH_PCT   = 15;   // % tăng tổng cộng tối thiểu
const MIN_VOL_USDT           = 500_000;
const ALERT_COOLDOWN_HOURS   = 3;

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'POST')
    return new Response('Method not allowed', { status: 405 });

  try {
    const history          = await getRecentSnapshots(8);
    const recentlyAlerted  = await getAlertedSymbols(ALERT_COOLDOWN_HOURS);
    const alertList        = [];

    for (const [symbol, readings] of history) {
      if (readings.length < MIN_CONSECUTIVE_HOURS + 1) continue;
      const last = readings[readings.length - 1];
      if (last.volume24h < MIN_VOL_USDT) continue;
      if (recentlyAlerted.has(symbol)) continue;

      // Tìm chuỗi tăng liên tục từ reading mới nhất
      let streak = 0, streakStart = readings.length - 1;
      for (let i = readings.length - 1; i >= 1; i--) {
        const prev = readings[i - 1].volume24h;
        const curr = readings[i].volume24h;
        if (prev <= 0) break;
        const g = ((curr - prev) / prev) * 100;
        if (g >= MIN_GROWTH_PCT_PER_HOUR) { streak++; streakStart = i - 1; }
        else break;
      }
      if (streak < MIN_CONSECUTIVE_HOURS) continue;

      const first        = readings[streakStart];
      const totalGrowth  = ((last.volume24h - first.volume24h) / first.volume24h) * 100;
      if (totalGrowth < MIN_TOTAL_GROWTH_PCT) continue;

      const hourlyGrowths = [];
      for (let i = streakStart + 1; i < readings.length; i++) {
        hourlyGrowths.push(
          ((readings[i].volume24h - readings[i-1].volume24h) / readings[i-1].volume24h) * 100
        );
      }

      alertList.push({
        symbol, consecutiveHours: streak,
        firstVol: first.volume24h, lastVol: last.volume24h,
        growthPct: totalGrowth, hourlyGrowths,
        priceChange24h: last.priceChange24h, price: last.price,
      });
    }

    alertList.sort((a, b) => b.consecutiveHours - a.consecutiveHours || b.growthPct - a.growthPct);

    if (alertList.length > 0) {
      await saveAlerts(alertList);
      const BATCH = 10;
      for (let i = 0; i < alertList.length; i += BATCH) {
        const msg = formatAlertMessage(alertList.slice(i, i + BATCH), {
          totalAlerts: alertList.length,
          batchNum:    Math.floor(i / BATCH) + 1,
          totalBatches: Math.ceil(alertList.length / BATCH),
          conditions:  { MIN_CONSECUTIVE_HOURS, MIN_GROWTH_PCT_PER_HOUR, MIN_TOTAL_GROWTH_PCT },
        });
        await sendMessage(msg);
        if (i + BATCH < alertList.length) await new Promise(r => setTimeout(r, 1200));
      }
    }

    return new Response(
      JSON.stringify({ success: true, symbolsAnalyzed: history.size, alertsTriggered: alertList.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[alert-check]', err.message);
    try { await sendMessage(`❌ <b>Vol Scanner Error</b>\n<code>${err.message}</code>`); } catch {}
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
