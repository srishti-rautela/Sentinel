// Service-to-service HTTP call with timeout. Throws DEPENDENCY_DOWN if the target is unreachable/too slow.
async function call(base, path, { method = 'GET', body, token, timeout = 3000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(base + path, {
      method, signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null; try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch {
    const e = new Error(`dependency unreachable or timed out: ${base}`);
    e.code = 'DEPENDENCY_DOWN';
    throw e;
  } finally { clearTimeout(t); }
}
module.exports = { call };
