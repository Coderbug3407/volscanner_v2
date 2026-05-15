// api/trigger.js — test thủ công: /api/trigger?action=scan|alert
export const config = { maxDuration: 60 };

export default async function handler(req) {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') || 'scan';
  const target = action === 'alert'
    ? `${url.origin}/api/alert-check`
    : `${url.origin}/api/scan`;

  try {
    const res  = await fetch(target);
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
