// End-to-end self-healing test: needs all services running. Usage: npm run test:heal (takes about 1 min)
const G = process.env.GATEWAY || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (m, p, b, tok) => { try { const r = await fetch(G + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: m === 'GET' ? undefined : JSON.stringify(b || {}) }); return { status: r.status, data: await r.json().catch(() => ({})) }; } catch { return { status: 0, data: {} }; } };
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); };
async function waitFor(service, since, statuses, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await api('GET', '/api/sentinel/incidents');
    const i = (r.data || []).find((x) => x.service === service && Date.parse(x.createdAt) >= since);
    if (i && statuses.includes(i.status)) return i;
    await sleep(1000);
  }
  return null;
}
(async () => {
  await api('POST', '/api/policy/audit/reset');
  // 1. non-critical crash -> auto-heal
  let t0 = Date.now(); await api('POST', '/system/chaos/notification-service/crash');
  let i = await waitFor('notification-service', t0, ['resolved', 'failed', 'blocked']);
  ok('non-critical crash: detected, policy=allow, auto-recovered', i && i.status === 'resolved' && i.policy.decision === 'allow');
  // 2. unhealthy state -> auto-heal
  t0 = Date.now(); await api('POST', '/system/chaos/product-service/unhealthy');
  i = await waitFor('product-service', t0, ['resolved', 'failed', 'blocked']);
  ok('unhealthy non-critical service auto-recovered', i && i.status === 'resolved');
  // 3. critical crash -> human approval -> recovery
  t0 = Date.now(); await api('POST', '/system/chaos/payment-service/crash');
  i = await waitFor('payment-service', t0, ['awaiting_approval', 'resolved', 'failed']);
  ok('critical crash: policy asks for manual review', i && i.status === 'awaiting_approval' && i.policy.decision === 'manual_review');
  if (i) await api('POST', `/api/sentinel/incidents/${i.id}/approve`);
  i = await waitFor('payment-service', t0, ['resolved', 'failed']);
  ok('after approval: payment-service recovered and verified', i && i.status === 'resolved');
  const l = await api('POST', '/api/auth/login', { email: 'demo@sentinel.com', password: 'demo123' });
  await api('POST', '/api/cart/items', { productId: 1, qty: 1 }, l.data.token);
  ok('checkout works again after healing', (await api('POST', '/api/orders/checkout', {}, l.data.token)).status === 201);
  const a = await api('GET', '/api/policy/audit');
  ok('policy audit trail recorded decisions', Array.isArray(a.data) && a.data.length >= 4);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
