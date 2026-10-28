const path = require('path');
const fs = require('fs');
const express = require('express');
const { createService, listen, ah } = require('../../common/base');
const cfg = require('../../common/config');

const app = createService('api-gateway');
const routes = { auth: cfg.AUTH, products: cfg.PRODUCT, cart: cfg.CART, orders: cfg.ORDER, notifications: cfg.NOTIFICATION, sentinel: cfg.INCIDENT, policy: cfg.POLICY };
const services = { 'auth-service': cfg.AUTH, 'product-service': cfg.PRODUCT, 'cart-service': cfg.CART, 'order-service': cfg.ORDER, 'payment-service': cfg.PAYMENT, 'notification-service': cfg.NOTIFICATION };
const internal = [/^\/reserve$/, /^\/release$/, /^\/send$/]; // not exposed publicly

app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*').set('Access-Control-Allow-Headers', 'Content-Type, Authorization').set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS'); req.method === 'OPTIONS' ? res.sendStatus(204) : next(); });

// Aggregated health for the System tab (demo/UI helper)
app.get('/system/health', ah(async (req, res) => {
  const check = async ([name, base]) => {
    const t = Date.now();
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
      const d = await r.json().catch(() => ({}));
      return { name, status: r.ok ? 'up' : 'unhealthy', latencyMs: Date.now() - t, memoryMB: d.memoryMB, uptimeSec: d.uptimeSec };
    } catch { return { name, status: 'down', latencyMs: null }; }
  };
  const list = await Promise.all(Object.entries(services).map(check));
  res.json([{ name: 'api-gateway', status: 'up', latencyMs: 0, memoryMB: Math.round(process.memoryUsage().rss / 1048576), uptimeSec: Math.round(process.uptime()) }, ...list]);
}));
// Demo failure injection (NOT part of Sentinel itself)
app.post('/system/chaos/:svc/:action', ah(async (req, res) => {
  const base = services[req.params.svc];
  if (!base || !['crash', 'slow', 'errors', 'leak', 'unhealthy', 'reset'].includes(req.params.action)) return res.status(400).json({ error: 'bad service or action' });
  try {
    const r = await fetch(`${base}/chaos/${req.params.action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body || {}), signal: AbortSignal.timeout(2000) });
    res.status(r.status).json(await r.json());
  } catch { res.status(502).json({ error: 'service_unreachable', service: req.params.svc }); }
}));

// Public API: /api/<route>/... -> service
app.all(/^\/api\/([^/]+)(\/.*)?$/, ah(async (req, res) => {
  const route = req.params[0];
  const target = routes[route];
  req.metricsRoute = `/api/${route}`;
  if (!target) return res.status(404).json({ error: 'unknown route' });
  const sub = req.params[1] || '/';
  if (internal.some((r) => r.test(sub))) return res.status(403).json({ error: 'internal endpoint' });
  try {
    const r = await fetch(target + sub + (req.url.includes('?') ? '?' + req.url.split('?')[1] : ''), {
      method: req.method, signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
      body: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    res.status(r.status).type('json').send(await r.text());
  } catch { res.status(502).json({ error: 'dependency_failure', service: route, message: 'upstream service unavailable' }); }
}));

// Serve the built React shop when running without Docker/nginx
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) app.use(express.static(dist));
listen(app, 'api-gateway', 3000);
