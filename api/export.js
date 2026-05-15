// api/export.js — GET /api/export?date=YYYY-MM-DD
import { getDayData, getAvailableDates } from '../lib/github-storage.js';

export const config = { maxDuration: 60 };

export default async function handler(req) {
  const url = new URL(req.url);

  if (url.searchParams.get('list') === '1') {
    const dates = await getAvailableDates();
    return new Response(JSON.stringify({ dates }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const date  = url.searchParams.get('date') || today;

  try {
    const rows = await getDayData(date);
    if (!rows.length)
      return new Response(`Không có dữ liệu cho ngày ${date}`, { status: 404 });

    const BOM = '\uFEFF';
    const header = ['Ngày','Giờ (VN)','Symbol','Vol 24h (USDT)','Thay đổi 24h (%)','Giá (USDT)'];

    // Summary: Vol tăng nhiều nhất
    const symMap = new Map();
    for (const r of rows) {
      if (!symMap.has(r.symbol)) symMap.set(r.symbol, []);
      symMap.get(r.symbol).push(r);
    }
    const summary = [];
    for (const [sym, rs] of symMap) {
      const sorted = rs.sort((a,b) => a.hour.localeCompare(b.hour));
      const first = sorted[0], last = sorted[sorted.length-1];
      const grow  = first.volume24h > 0 ? ((last.volume24h - first.volume24h) / first.volume24h * 100) : 0;
      let maxStreak = 0, streak = 0;
      for (let i = 1; i < sorted.length; i++) {
        const g = (sorted[i].volume24h - sorted[i-1].volume24h) / sorted[i-1].volume24h * 100;
        streak  = g >= 5 ? streak + 1 : 0;
        maxStreak = Math.max(maxStreak, streak);
      }
      summary.push({ sym, grow, maxStreak, first, last, n: sorted.length });
    }
    summary.sort((a,b) => b.grow - a.grow);

    const sHeader = ['Symbol','Vol Đầu','Vol Cuối','Tăng (%)','Chuỗi Tăng Dài Nhất (giờ)','Giá Cuối','Thay Đổi Giá 24h (%)','Số Mẫu'];
    const sRows   = summary.map(s => [
      s.sym, s.first.volume24h.toFixed(0), s.last.volume24h.toFixed(0),
      s.grow.toFixed(2), s.maxStreak, s.last.price.toFixed(8),
      s.last.priceChange24h.toFixed(4), s.n,
    ]);
    const dRows = rows.map(r => [r.date, r.hour, r.symbol, r.volume24h.toFixed(2), r.priceChange24h.toFixed(4), r.price.toFixed(8)]);

    const csv = BOM + [
      `=== VOL SCANNER ${date} ===`, '',
      '--- TỔNG KẾT ---',
      sHeader.join(','),
      ...sRows.map(r => r.map(c => `"${c}"`).join(',')),
      '', '--- RAW DATA ---',
      header.join(','),
      ...dRows.map(r => r.map(c => `"${c}"`).join(',')),
    ].join('\r\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vol-scanner-${date}.csv"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
