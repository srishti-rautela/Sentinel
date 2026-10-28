// Smoke test: run while services are up (npm run start:all or docker compose up). Usage: npm test
const G = process.env.GATEWAY || 'http://localhost:3000';
let pass = 0, fail = 0, token;
const api = async (m, p, body, auth = true) => {
  const r = await fetch(G + p, { method: m, headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };
const chaos = (s, a, b) => api('POST', `/system/chaos/${s}/${a}`, b, false);
const stock = async () => (await api('GET', '/api/products/2', null, false)).data.stock;

(async () => {
  const h = await api('GET', '/system/health', null, false);
  check('all 7 services up', h.data.length === 7 && h.data.every((s) => s.status === 'up'));
  const l = await api('POST', '/api/auth/login', { email: 'demo@sentinel.com', password: 'demo123' }, false);
  token = l.data.token; check('login returns JWT', !!token);
  check('bad password rejected', (await api('POST', '/api/auth/login', { email: 'demo@sentinel.com', password: 'x' }, false)).status === 401);
  check('internal endpoint blocked at gateway', (await api('POST', '/api/products/reserve', { items: [] }, false)).status === 403);

  await api('DELETE', '/api/cart');
  await api('POST', '/api/cart/items', { productId: 2, qty: 3 });
  const s0 = await stock();
  const o = await api('POST', '/api/orders/checkout');
  check('checkout confirmed', o.status === 201 && o.data.status === 'confirmed' && o.data.total === 240);
  check('stock reduced by 3', (await stock()) === s0 - 3);
  check('notification delivered', (await api('GET', '/api/notifications')).data.some((n) => n.message.includes(`#${o.data.id}`)));

  // Failure 1: payment errors -> order fails with 502, stock rolled back
  await api('POST', '/api/cart/items', { productId: 2, qty: 1 });
  const s1 = await stock();
  await chaos('payment-service', 'errors', { rate: 1 });
  const f = await api('POST', '/api/orders/checkout');
  check('payment failure -> 502 dependency_failure', f.status === 502 && f.data.error === 'dependency_failure');
  check('stock rolled back after payment failure', (await stock()) === s1);
  await chaos('payment-service', 'reset');

  // Failure 2: notification down is non-critical -> order still succeeds
  await chaos('notification-service', 'errors', { rate: 1 });
  const ok = await api('POST', '/api/orders/checkout');
  check('order succeeds when notification-service fails', ok.status === 201);
  await chaos('notification-service', 'reset');

  // Failure 3: unhealthy flag visible in aggregated health
  await chaos('cart-service', 'unhealthy');
  const h2 = (await api('GET', '/system/health', null, false)).data.find((s) => s.name === 'cart-service');
  check('unhealthy service detected by /health', h2.status === 'unhealthy');
  await chaos('cart-service', 'reset');

  const m = await (await fetch('http://localhost:3005/metrics')).text();
  check('payment-service exposes Prometheus metrics', m.includes('http_requests_total') && m.includes('process_cpu_seconds_total'));
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
