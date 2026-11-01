// Failure detection: polls each service's /health and /metrics (the same data Prometheus scrapes).
const cfg = require('../../common/config');

const targets = { 'api-gateway': cfg.GATEWAY, 'auth-service': cfg.AUTH, 'product-service': cfg.PRODUCT, 'cart-service': cfg.CART, 'order-service': cfg.ORDER, 'payment-service': cfg.PAYMENT, 'notification-service': cfg.NOTIFICATION };
// who calls whom: used for dependency-aware root-cause correlation
const deps = {
  'api-gateway': ['auth-service', 'product-service', 'cart-service', 'order-service', 'notification-service'],
  'order-service': ['auth-service', 'cart-service', 'product-service', 'payment-service'],
  'cart-service': ['auth-service', 'product-service'],
  'notification-service': ['auth-service'],
};
const T = { memoryMB: 180, errorRate: 0.5, latencyMs: 1500, minReq: 3, strikesNeeded: 2 };
let prev = {}, last = {}, strikes = {};

function parse(text) {
  let total = 0, err = 0, sum = 0, cnt = 0, mem = 0;
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const m = line.match(/^(\w+)(?:\{(.*)\})?\s+([\d.eE+-]+)$/);
    if (!m) continue;
    const [, name, labels = '', val] = m; const v = Number(val);
    if (name === 'process_resident_memory_bytes') { mem = v / 1048576; continue; }
    if (!['http_requests_total', 'http_request_duration_seconds_sum', 'http_request_duration_seconds_count'].includes(name)) continue;
    const l = Object.fromEntries([...labels.matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    const r = l.route || '';
    if (r === '/health' || r === '/metrics' || r.startsWith('/chaos')) continue; // business traffic only
    if (name === 'http_requests_total') { total += v; if (Number(l.status) >= 500) err += v; }
    else if (name.endsWith('_sum')) sum += v; else cnt += v;
  }
  return { total, err, sum, cnt, mem };
}

async function sample(name) {
  const base = targets[name]; const out = { name, status: 'down' };
  try { out.status = (await fetch(base + '/health', { signal: AbortSignal.timeout(1500) })).ok ? 'up' : 'unhealthy'; } catch { return out; }
  try {
    const c = parse(await (await fetch(base + '/metrics', { signal: AbortSignal.timeout(1500) })).text());
    out.memoryMB = Math.round(c.mem);
    const p = prev[name];
    if (!p || c.total < p.total) { prev[name] = c; delete last[name]; }        // first sample, or service restarted
    else if (c.total - p.total >= T.minReq) {                                   // enough new traffic to judge
      const dT = c.total - p.total, dC = c.cnt - p.cnt;
      last[name] = { errorRate: (c.err - p.err) / dT, avgLatencyMs: dC ? Math.round(((c.sum - p.sum) / dC) * 1000) : 0 };
      prev[name] = c;
    }
    Object.assign(out, last[name] || {});
  } catch { /* metrics optional */ }
  return out;
}

function anomalyOf(s) {
  if (s.status === 'down') return { type: 'down', severity: 'high', detail: 'service not responding to health check' };
  if (s.status === 'unhealthy') return { type: 'unhealthy', severity: 'high', detail: 'health endpoint reports unhealthy' };
  if (s.memoryMB > T.memoryMB) return { type: 'high_memory', severity: 'medium', detail: `memory ${s.memoryMB} MB exceeds ${T.memoryMB} MB` };
  if (s.errorRate >= T.errorRate) return { type: 'high_error_rate', severity: 'high', detail: `${Math.round(s.errorRate * 100)}% of requests failing (5xx)` };
  if (s.avgLatencyMs > T.latencyMs) return { type: 'high_latency', severity: 'medium', detail: `avg latency ${s.avgLatencyMs} ms exceeds ${T.latencyMs} ms` };
  return null;
}

async function scan() {
  const samples = await Promise.all(Object.keys(targets).map(sample));
  const anoms = {};
  for (const s of samples) {
    const a = anomalyOf(s);
    if (a) { strikes[s.name] = (strikes[s.name] || 0) + 1; if (strikes[s.name] >= T.strikesNeeded) anoms[s.name] = { ...a, metrics: s }; }
    else strikes[s.name] = 0;
  }
  const roots = [], suppressed = [];
  for (const [name, a] of Object.entries(anoms)) {
    const causes = (deps[name] || []).filter((d) => anoms[d] || strikes[d] > 0);
    causes.length ? suppressed.push({ service: name, causedBy: causes }) : roots.push({ service: name, dependencies: deps[name] || [], ...a });
  }
  return { samples, roots, suppressed };
}
const resetBaselines = () => { prev = {}; last = {}; strikes = {}; };
module.exports = { scan, resetBaselines, targets, T };
