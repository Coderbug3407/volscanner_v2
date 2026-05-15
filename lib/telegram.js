// lib/telegram.js
const TG = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendMessage(text) {
  const res = await fetch(`${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:                  process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode:               'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) console.error('TG error:', await res.text());
  return res.ok;
}

function fvol(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

export function formatAlertMessage(alerts, opts = {}) {
  const time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const { totalAlerts = alerts.length, batchNum = 1, totalBatches = 1, conditions = {} } = opts;
  const bLabel = totalBatches > 1 ? ` (${batchNum}/${totalBatches})` : '';

  const lines = alerts.map(a => {
    const grow   = `+${a.growthPct.toFixed(1)}%`;
    const emoji  = a.priceChange24h >= 0 ? '📈' : '📉';
    const hourly = a.hourlyGrowths
      ? a.hourlyGrowths.map(g => (g >= 0 ? `+${g.toFixed(1)}` : g.toFixed(1)) + '%').join(' → ')
      : '';
    return (
      `🔥 <b>${a.symbol}</b>\n` +
      `   Vol: <code>${fvol(a.firstVol)}</code> → <code>${fvol(a.lastVol)}</code> (<b>${grow}</b>)\n` +
      (hourly ? `   📊 Mỗi giờ: <code>${hourly}</code>\n` : '') +
      `   ${emoji} Giá: <code>${a.price.toFixed(6)}</code> | 24h: ${a.priceChange24h >= 0 ? '+' : ''}${a.priceChange24h.toFixed(2)}%\n` +
      `   ⏱ Tăng liên tục: <b>${a.consecutiveHours}h</b>`
    );
  });

  const cond = conditions.MIN_CONSECUTIVE_HOURS
    ? `\n⚙️ Ngưỡng: ≥${conditions.MIN_CONSECUTIVE_HOURS}h | ≥${conditions.MIN_GROWTH_PCT_PER_HOUR}%/h | tổng ≥${conditions.MIN_TOTAL_GROWTH_PCT}%`
    : '';

  return (
    `🚨 <b>VOL TĂNG MẠNH${bLabel}</b> — ${totalAlerts} coin\n` +
    `📅 ${time}${cond}\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    lines.join('\n\n━━━━━━━━━━━━━━━━━\n') +
    `\n\n<i>Binance Vol Scanner</i>`
  );
}
