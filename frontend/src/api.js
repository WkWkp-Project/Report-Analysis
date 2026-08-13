// api.js — เรียก backend FastAPI
// dev ใช้ proxy ใน vite.config.js (/api → :8000) จึงเรียก path สัมพัทธ์ได้เลย

export async function fetchAnalysis({ since, until, demo } = {}) {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (until) params.set('until', until);
  if (demo) params.set('demo', '1');
  const qs = params.toString();
  const res = await fetch(`/api/analyze${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) detail = body.error;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

async function requestJson(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || body.error || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export function fetchFacebookStatus() {
  return requestJson('/api/facebook/status');
}

export async function startFacebookConnection() {
  const data = await requestJson('/api/facebook/oauth/start');
  if (!data.authorization_url) throw new Error('Backend ไม่ได้ส่ง Facebook authorization URL');
  return data.authorization_url;
}

export function refreshFacebookConnection() {
  return requestJson('/api/facebook/refresh', { method: 'POST' });
}

export function disconnectFacebook() {
  return requestJson('/api/facebook/connection', { method: 'DELETE' });
}
