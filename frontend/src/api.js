// api.js — เรียก backend FastAPI
// dev ใช้ proxy ใน vite.config.js (/api → :8000) จึงเรียก path สัมพัทธ์ได้เลย

async function responseError(res) {
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    detail = body.detail || body.error || detail;
  } catch {}
  const error = new Error(detail);
  error.status = res.status;
  return error;
}

export async function fetchAnalysis({ since, until, demo } = {}) {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (until) params.set('until', until);
  if (demo) params.set('demo', '1');
  const qs = params.toString();
  const res = await fetch(`/api/analyze${qs ? `?${qs}` : ''}`, { credentials: 'same-origin' });
  if (!res.ok) throw await responseError(res);
  return res.json();
}

async function requestJson(path, options) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  if (!res.ok) throw await responseError(res);
  return res.json();
}

export function fetchAuthStatus() {
  return requestJson('/api/auth/status');
}

export function login(password) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function logout() {
  return requestJson('/api/auth/logout', { method: 'POST' });
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

export function fetchPortfolio() {
  return requestJson('/api/portfolio');
}

export function createBrand(payload) {
  return requestJson('/api/portfolio/brands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function createProject(payload) {
  return requestJson('/api/portfolio/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function createCampaign(payload) {
  return requestJson('/api/portfolio/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchReportElements(projectId, reportKey = 'working') {
  const params = new URLSearchParams({ report_key: reportKey });
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/elements?${params}`);
}

export function createReportElement(projectId, payload) {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/elements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateReportElement(projectId, elementId, payload) {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/elements/${encodeURIComponent(elementId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteReportElement(projectId, elementId) {
  return requestJson(`/api/projects/${encodeURIComponent(projectId)}/elements/${encodeURIComponent(elementId)}`, {
    method: 'DELETE',
  });
}
