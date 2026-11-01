const express = require('express');
const client = require('prom-client');
const chaos = require('./chaos');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createService(name) {
  const app = express();
  const register = new client.Registry();
  register.setDefaultLabels({ service: name });
  client.collectDefaultMetrics({ register });
  const labelNames = ['method', 'route', 'status'];
  const count = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames, registers: [register] });
  const dur = new client.Histogram({ name: 'http_request_duration_seconds', help: 'Request latency', labelNames, buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [register] });

  app.use(express.json());
  app.use((req, res, next) => {
    const end = dur.startTimer();
    res.on('finish', () => {
      const route = req.metricsRoute || (req.route ? (req.baseUrl || '') + req.route.path : 'unmatched');
      const l = { method: req.method, route, status: res.statusCode };
      count.inc(l); end(l);
    });
    next();
  });
  app.get('/health', (req, res) => {
    const m = process.memoryUsage();
    const body = { service: name, status: chaos.state.unhealthy ? 'unhealthy' : 'ok', uptimeSec: Math.round(process.uptime()), memoryMB: Math.round(m.rss / 1048576) };
    res.status(chaos.state.unhealthy ? 503 : 200).json(body);
  });
  app.get('/metrics', async (req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); });
  chaos.mount(app, name);
  return app;
}

function listen(app, name, port) {
  app.use((req, res) => res.status(404).json({ error: 'not_found', service: name }));
  app.use((err, req, res, next) => {
    if (err.code === 'DEPENDENCY_DOWN') return res.status(502).json({ error: 'dependency_failure', service: name, message: err.message });
    console.error(`[${name}]`, err);
    res.status(500).json({ error: 'internal_error', service: name });
  });
  const p = process.env.PORT || port;
  app.listen(p, () => console.log(`${name} listening on ${p}`));
}
module.exports = { createService, listen, ah };
