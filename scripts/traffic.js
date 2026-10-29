// Generates shop traffic so error-rate / latency metrics have data. Ctrl+C to stop.
const G = process.env.GATEWAY || 'http://localhost:3000';
const j = (token) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) });
(async () => {
  const { token } = await (await fetch(G + '/api/auth/login', { method: 'POST', headers: j(), body: JSON.stringify({ email: 'demo@sentinel.com', password: 'demo123' }) })).json();
  console.log('traffic running (1 order every 2s)...');
  setInterval(async () => {
    try {
      await fetch(G + '/api/cart/items', { method: 'POST', headers: j(token), body: JSON.stringify({ productId: 2, qty: 1 }) });
      const r = await fetch(G + '/api/orders/checkout', { method: 'POST', headers: j(token) });
      console.log(new Date().toLocaleTimeString(), 'checkout ->', r.status);
    } catch { console.log('request failed'); }
  }, 2000);
})();
