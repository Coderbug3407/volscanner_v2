// lib/github-storage.js
// Dùng GitHub repo làm database miễn phí
// Cấu trúc: data/YYYY-MM-DD/HH.json  +  data/alerts/YYYY-MM-DD.json

const OWNER  = process.env.GH_OWNER;
const REPO   = process.env.GH_REPO;
const BRANCH = process.env.GH_BRANCH || 'main';
const TOKEN  = process.env.GH_TOKEN;
const API    = 'https://api.github.com';

function headers() {
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept':        'application/vnd.github+json',
    'Content-Type':  'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// Đọc file JSON từ repo, trả về { sha, content } hoặc null nếu không có
async function ghGet(path) {
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: headers(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GH GET ${path}: ${res.status}`);
  const d = await res.json();
  return {
    sha:     d.sha,
    content: JSON.parse(Buffer.from(d.content, 'base64').toString('utf-8')),
  };
}

// Ghi file JSON vào repo (tạo mới hoặc update)
async function ghPut(path, data, msg) {
  const existing = await ghGet(path);
  const body = {
    message: msg,
    content: Buffer.from(JSON.stringify(data)).toString('base64'),
    branch:  BRANCH,
    ...(existing ? { sha: existing.sha } : {}),
  };
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${path}`, {
    method:  'PUT',
    headers: headers(),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GH PUT ${path}: ${res.status} — ${t}`);
  }
}

// ─── Helpers thời gian (UTC+7) ────────────────────────────────────────────────
function vnNow() { return new Date(Date.now() + 7 * 3600_000); }
function dateKey(d = vnNow()) { return d.toISOString().slice(0, 10); }
function hourKey(d = vnNow()) { return String(d.getUTCHours()).padStart(2, '0'); }

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

// Lưu snapshot giờ hiện tại
export async function saveHourlySnapshot(pairs) {
  const date = dateKey();
  const hour = hourKey();
  await ghPut(
    `data/${date}/${hour}.json`,
    { timestamp: new Date().toISOString(), date, hour, pairs },
    `snapshot ${date} ${hour}:00 (${pairs.length} pairs)`
  );
  console.log(`[gh] Saved ${pairs.length} pairs → data/${date}/${hour}.json`);
}

// Đọc N giờ gần nhất → Map<symbol, [{timestamp,volume24h,priceChange24h,price}]>
export async function getRecentSnapshots(hours = 8) {
  const result = new Map();
  const now = vnNow();

  // Đọc tuần tự để tránh rate limit GitHub (60 req/h unauthenticated, 5000 authenticated)
  for (let h = hours; h >= 0; h--) {
    const d   = new Date(now - h * 3600_000);
    const path = `data/${dateKey(d)}/${hourKey(d)}.json`;
    try {
      const file = await ghGet(path);
      if (!file) continue;
      for (const p of file.content.pairs) {
        if (!result.has(p.symbol)) result.set(p.symbol, []);
        result.get(p.symbol).push({
          timestamp:     file.content.timestamp,
          volume24h:     p.volume24h,
          priceChange24h: p.priceChange24h,
          price:         p.price,
        });
      }
    } catch (e) {
      console.warn(`[gh] Skip ${path}: ${e.message}`);
    }
  }
  return result;
}

// Lưu alert vào log ngày
export async function saveAlerts(alerts) {
  const date = dateKey();
  const path = `data/alerts/${date}.json`;
  const existing = await ghGet(path);
  const current  = existing ? existing.content : { date, alerts: [] };
  current.alerts.push({ time: new Date().toISOString(), items: alerts });
  await ghPut(path, current, `alerts ${date}`);
}

// Lấy set symbols đã alert trong N giờ gần đây (chống spam)
export async function getAlertedSymbols(withinHours = 3) {
  const date = dateKey();
  try {
    const file = await ghGet(`data/alerts/${date}.json`);
    if (!file) return new Set();
    const cutoff = new Date(Date.now() - withinHours * 3600_000).toISOString();
    const set = new Set();
    for (const batch of file.content.alerts) {
      if (batch.time >= cutoff) batch.items.forEach(i => set.add(i.symbol));
    }
    return set;
  } catch { return new Set(); }
}

// Lấy data cả ngày để xuất CSV
export async function getDayData(date) {
  const rows = [];
  for (let h = 0; h < 24; h++) {
    const hour = String(h).padStart(2, '0');
    try {
      const file = await ghGet(`data/${date}/${hour}.json`);
      if (!file) continue;
      for (const p of file.content.pairs) {
        rows.push({ date, hour: `${hour}:00`, timestamp: file.content.timestamp, ...p });
      }
    } catch {}
  }
  return rows;
}

// Danh sách ngày có data
export async function getAvailableDates() {
  try {
    const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/data?ref=${BRANCH}`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    const items = await res.json();
    return items
      .filter(i => i.type === 'dir' && /^\d{4}-\d{2}-\d{2}$/.test(i.name))
      .map(i => i.name).sort().reverse();
  } catch { return []; }
}
