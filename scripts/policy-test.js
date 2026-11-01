// Policy Engine tests (service must be running on :4003). Usage: npm run test:policy
const P = process.env.POLICY || 'http://localhost:4003';
const post = async (p, b) => (await fetch(P + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) })).json();
let pass = 0, fail = 0;
const t = (name, got, want) => { const ok = got === want; ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -> ${got}${ok ? '' : ` (expected ${want})`}`); };
(async () => {
  await post('/audit/reset');
  t('restart non-critical (production)', (await post('/validate', { service: 'notification-service', action: 'restart', severity: 'medium', environment: 'production' })).decision, 'allow');
  t('restart critical (production) needs human', (await post('/validate', { service: 'payment-service', action: 'restart', severity: 'high', environment: 'production' })).decision, 'manual_review');
  t('restart critical (dev) is allowed', (await post('/validate', { service: 'payment-service', action: 'restart', severity: 'high', environment: 'dev' })).decision, 'allow');
  t('unknown action "delete" is denied', (await post('/validate', { service: 'cart-service', action: 'delete' })).decision, 'deny');
  t('scale to 8 replicas exceeds cap', (await post('/validate', { service: 'cart-service', action: 'scale', replicas: 8 })).decision, 'deny');
  t('scale to 3 replicas is allowed', (await post('/validate', { service: 'cart-service', action: 'scale', replicas: 3 })).decision, 'allow');
  t('unregistered service goes to review', (await post('/validate', { service: 'mystery-service', action: 'restart' })).decision, 'manual_review');
  for (let i = 0; i < 3; i++) await post('/validate', { service: 'product-service', action: 'restart' });
  t('4th restart in 5 min hits cooldown', (await post('/validate', { service: 'product-service', action: 'restart' })).decision, 'deny');
  await post('/audit/reset');
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
