'use strict';
// Sentinel Recovery Controller
// -----------------------------------------------------------------------------------------------------------
// The ONLY component that touches the Docker socket. It exposes a tiny, fixed API:
//   GET  /v1/services                      -> state of the allowlisted containers
//   POST /v1/services/:key/{stop|start|restart}
//   GET  /v1/services/:key/logs?tail=N
//   GET  /health, /metrics
// Safety properties:
//   * every /v1 request needs `Authorization: Bearer $RECOVERY_TOKEN` (constant-time compare);
//   * `:key` must be in the hard-coded ALLOWLIST below; container names are NEVER taken from the request;
//   * only stop / start / restart / inspect / logs are implemented — no exec, no create, no arbitrary Docker call;
//   * it is attached to the internal Docker network only and has no published port.
const http = require('http');
const crypto = require('crypto');

const TOKEN = process.env.RECOVERY_TOKEN || '';
const SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const PORT = Number(process.env.PORT || 7000);
const STOP_GRACE_SECONDS = 10;
const ALLOWLIST = Object.freeze({
  gateway: 'tilda-gateway', auth: 'tilda-auth', products: 'tilda-products', orders: 'tilda-orders', media: 'tilda-media'
});
const startedAt = new Date().toISOString();
const counters = { restart: 0, stop: 0, start: 0, denied: 0, failed: 0 };
const iso = () => new Date().toISOString();
const log = (level, event, f = {}) => process.stdout.write(`${JSON.stringify({ timestamp: iso(), service: 'recovery-controller', level, event, ...f })}\n`);

if (!TOKEN || TOKEN.length < 16) { log('error', 'startup_failed', { error: 'RECOVERY_TOKEN must be set (16+ characters).' }); process.exit(1); }

function docker(method, path, { raw = false, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: SOCKET, path, method, timeout: timeoutMs }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (raw) return resolve({ status: res.statusCode, body: buf });
        let json = null; try { json = buf.length ? JSON.parse(buf.toString('utf8')) : null; } catch { /* not json */ }
        resolve({ status: res.statusCode, body: json, text: buf.toString('utf8') });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Docker API timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function describe(key) {
  const name = ALLOWLIST[key];
  const r = await docker('GET', `/containers/${name}/json`);
  if (r.status === 404) return { service: key, container: name, exists: false, running: false, status: 'not created' };
  if (r.status !== 200) throw Object.assign(new Error(`Docker inspect failed (HTTP ${r.status})`), { status: 502 });
  const s = r.body.State || {};
  return {
    service: key, container: name, exists: true, running: !!s.Running, status: s.Status, health: s.Health?.Status || null, exitCode: s.ExitCode,
    oomKilled: !!s.OOMKilled, startedAt: s.StartedAt, finishedAt: s.FinishedAt, restartCount: r.body.RestartCount
  };
}

async function act(key, action) {
  const name = ALLOWLIST[key];
  const path = action === 'start' ? `/containers/${name}/start` : `/containers/${name}/${action}?t=${STOP_GRACE_SECONDS}`;
  const r = await docker('POST', path, { timeoutMs: (STOP_GRACE_SECONDS + 20) * 1000 });
  // 204 = done, 304 = already in that state (idempotent), 404 = no such container
  if (r.status === 404) throw Object.assign(new Error(`Container ${name} does not exist. Create it with: docker compose up -d ${key}`), { status: 404 });
  if (![204, 304].includes(r.status)) throw Object.assign(new Error(`Docker refused to ${action} ${name}: ${r.body?.message || `HTTP ${r.status}`}`), { status: 502 });
  // Wait until Docker reports the expected state, so callers get a truthful answer.
  const wantRunning = action !== 'stop';
  const deadline = Date.now() + 20000;
  for (;;) {
    const d = await describe(key);
    if (d.running === wantRunning) return d;
    if (Date.now() > deadline) throw Object.assign(new Error(`${name} did not reach the expected state after ${action}.`), { status: 504 });
    await new Promise(r2 => setTimeout(r2, 400));
  }
}

// Docker multiplexes stdout/stderr with 8-byte frame headers when the container has no TTY.
function parseLogs(buf) {
  const out = []; let i = 0;
  const push = (stream, text) => {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const sp = line.indexOf(' ');
      const ts = sp > 20 ? line.slice(0, sp) : null; const raw = ts ? line.slice(sp + 1) : line;
      let p = null; if (raw.startsWith('{')) { try { p = JSON.parse(raw); } catch { /* plain text */ } }
      out.push({ timestamp: p?.timestamp || ts || null, stream, level: p?.level || (stream === 'stderr' ? 'error' : 'info'), event: p?.event || null, requestId: p?.requestId || null, incidentId: p?.incidentId || null, message: p ? (p.error || p.message || p.event || raw) : raw, raw });
    }
  };
  while (i + 8 <= buf.length) {
    const type = buf[i]; const size = buf.readUInt32BE(i + 4);
    if ((type !== 1 && type !== 2) || i + 8 + size > buf.length) { push('stdout', buf.slice(i).toString('utf8')); return out; }
    push(type === 2 ? 'stderr' : 'stdout', buf.slice(i + 8, i + 8 + size).toString('utf8')); i += 8 + size;
  }
  return out;
}

const send = (res, status, body) => { const s = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(s); };
const authorized = req => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''); if (!m) return false;
  const a = crypto.createHash('sha256').update(m[1]).digest(); const b = crypto.createHash('sha256').update(TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
};
const readBody = req => new Promise(resolve => { let d = ''; req.on('data', c => { d += c; if (d.length > 4096) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/health') {
      let dockerOk = false; try { dockerOk = (await docker('GET', '/_ping', { timeoutMs: 2000 })).status === 200; } catch { /* unreachable */ }
      return send(res, dockerOk ? 200 : 503, { status: dockerOk ? 'ok' : 'unhealthy', service: 'recovery-controller', startedAt, dependencies: { docker: dockerOk ? 'up' : 'down' } });
    }
    if (req.method === 'GET' && p === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      return res.end(['# TYPE recovery_controller_actions_total counter', ...Object.entries(counters).map(([k, v]) => `recovery_controller_actions_total{action="${k}"} ${v}`), `recovery_controller_uptime_seconds ${process.uptime().toFixed(0)}`].join('\n') + '\n');
    }
    if (!p.startsWith('/v1/')) return send(res, 404, { error: 'Not found.' });
    if (!authorized(req)) { counters.denied += 1; log('warn', 'unauthorized_request', { path: p, remote: req.socket.remoteAddress }); return send(res, 401, { error: 'Unauthorized.' }); }

    if (req.method === 'GET' && p === '/v1/services') {
      const services = []; for (const key of Object.keys(ALLOWLIST)) services.push(await describe(key).catch(e => ({ service: key, container: ALLOWLIST[key], exists: null, error: e.message })));
      return send(res, 200, { services });
    }
    const m = /^\/v1\/services\/([a-z]+)\/(stop|start|restart|logs)$/.exec(p);
    if (!m) return send(res, 404, { error: 'Not found.' });
    const [, key, action] = m;
    if (!Object.prototype.hasOwnProperty.call(ALLOWLIST, key)) { counters.denied += 1; log('warn', 'denied_not_allowlisted', { key, action }); return send(res, 403, { error: `Service "${key}" is not on the recovery allowlist.` }); }
    if (action === 'logs') {
      if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
      const tail = Math.min(1000, Math.max(1, Number(url.searchParams.get('tail')) || 200));
      const r = await docker('GET', `/containers/${ALLOWLIST[key]}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}`, { raw: true });
      if (r.status === 404) return send(res, 404, { error: `Container ${ALLOWLIST[key]} does not exist.` });
      return send(res, 200, { container: ALLOWLIST[key], logs: parseLogs(r.body) });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    const body = await readBody(req);
    log('info', 'action_requested', { action, service: key, container: ALLOWLIST[key], requestedBy: String(body.requestedBy || 'unknown').slice(0, 120), incidentId: body.incidentId ? String(body.incidentId).slice(0, 80) : undefined });
    try {
      const d = await act(key, action); counters[action] += 1;
      log('info', 'action_completed', { action, service: key, container: d.container, status: d.status, incidentId: body.incidentId });
      return send(res, 200, { ok: true, action, ...d });
    } catch (e) {
      counters.failed += 1; log('error', 'action_failed', { action, service: key, error: e.message, incidentId: body.incidentId });
      return send(res, e.status || 502, { error: e.message });
    }
  } catch (e) {
    log('error', 'request_failed', { path: p, error: e.message });
    return send(res, 502, { error: `Docker API unavailable: ${e.message}` });
  }
});
server.listen(PORT, '0.0.0.0', () => log('info', 'service_started', { port: PORT, allowlist: Object.keys(ALLOWLIST) }));
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => server.close(() => process.exit(0)));
