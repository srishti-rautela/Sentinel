let token = localStorage.getItem('token');
export const setToken = (t) => { token = t; t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); };
export async function api(method, path, body) {
  try {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: { error: 'network_error' } }; }
}
export const errText = (r) => r.data?.error === 'dependency_failure'
  ? `Service unavailable (${r.data.service || 'dependency'}). Please try again shortly.`
  : r.data?.error === 'payment_declined' ? 'Payment declined (amount over limit).'
  : r.data?.error || `Request failed (${r.status})`;
