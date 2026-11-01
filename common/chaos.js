// Failure injection (demo only): lets us trigger incidents on demand for Sentinel to detect.
const state = { slowMs: 0, errorRate: 0, unhealthy: false, leak: [] };

function mount(app, name) {
  const r = require('express').Router();
  r.post('/crash', (req, res) => { res.json({ service: name, chaos: 'crash', note: 'process exiting' }); setTimeout(() => process.exit(1), 100); });
  r.post('/slow', (req, res) => { state.slowMs = Number(req.body?.ms ?? 3000); res.json({ service: name, chaos: 'slow', ms: state.slowMs }); });
  r.post('/errors', (req, res) => { state.errorRate = Number(req.body?.rate ?? 1); res.json({ service: name, chaos: 'errors', rate: state.errorRate }); });
  r.post('/unhealthy', (req, res) => { state.unhealthy = true; res.json({ service: name, chaos: 'unhealthy' }); });
  r.post('/leak', (req, res) => {
    const mb = Math.min(Number(req.body?.mb ?? 50), 100);
    state.leak.push(Buffer.alloc(mb * 1024 * 1024, 1));
    res.json({ service: name, chaos: 'leak', leakedMB: state.leak.length * mb });
  });
  r.post('/reset', (req, res) => { state.slowMs = 0; state.errorRate = 0; state.unhealthy = false; state.leak = []; res.json({ service: name, chaos: 'reset' }); });
  r.get('/status', (req, res) => res.json({ service: name, slowMs: state.slowMs, errorRate: state.errorRate, unhealthy: state.unhealthy, leakedChunks: state.leak.length }));
  app.use('/chaos', r);
  // applies to every route registered after this point (business routes)
  app.use(async (req, res, next) => {
    if (state.slowMs) await new Promise((ok) => setTimeout(ok, state.slowMs));
    if (state.errorRate && Math.random() < state.errorRate) return res.status(500).json({ error: 'injected_error', service: name });
    next();
  });
}
module.exports = { mount, state };
