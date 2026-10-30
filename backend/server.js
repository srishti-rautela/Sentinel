const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dns = require('dns').promises;
const net = require('net');

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'local-development-secret-change-before-deploying';
const DB_PATH = process.env.SENTINEL_DB_PATH || path.join(__dirname, 'data.json');
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));

app.use(express.json({ limit: '1mb' }));

// Lightweight Prometheus-compatible request metrics. Labels use Express route
// templates where available to avoid high-cardinality project IDs.
const requestMetrics = new Map();
function metricLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}
function metricKey(method, route, status) {
  return JSON.stringify([method, route, status]);
}
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : req.path;
    const key = metricKey(req.method, route, res.statusCode);
    const current = requestMetrics.get(key) || { method: req.method, route, status: res.statusCode, count: 0, durationSum: 0 };
    current.count += 1;
    current.durationSum += elapsedSeconds;
    requestMetrics.set(key, current);
    // JSON stdout logs are collected by the Docker log driver / Promtail.
    console.log(JSON.stringify({
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      event: 'http_request',
      method: req.method,
      path: route,
      status: res.statusCode,
      duration_ms: Math.round(elapsedSeconds * 1000),
      timestamp: new Date().toISOString()
    }));
  });
  next();
});

app.get('/metrics', (req, res) => {
  res.type('text/plain; version=0.0.4; charset=utf-8');
  const lines = [
    '# HELP sentinel_http_requests_total Total HTTP requests handled by Sentinel API.',
    '# TYPE sentinel_http_requests_total counter'
  ];
  for (const metric of requestMetrics.values()) {
    lines.push(`sentinel_http_requests_total{method="${metricLabel(metric.method)}",route="${metricLabel(metric.route)}",status="${metric.status}"} ${metric.count}`);
  }
  lines.push(
    '# HELP sentinel_http_request_duration_seconds_sum Total HTTP request duration in seconds.',
    '# TYPE sentinel_http_request_duration_seconds_sum counter'
  );
  for (const metric of requestMetrics.values()) {
    lines.push(`sentinel_http_request_duration_seconds_sum{method="${metricLabel(metric.method)}",route="${metricLabel(metric.route)}",status="${metric.status}"} ${metric.durationSum.toFixed(6)}`);
  }
  lines.push(
    '# HELP sentinel_http_request_duration_seconds_count Number of observed HTTP request durations.',
    '# TYPE sentinel_http_request_duration_seconds_count counter',
    `sentinel_process_uptime_seconds ${process.uptime().toFixed(2)}`,
    `sentinel_process_resident_memory_bytes ${process.memoryUsage().rss}`
  );
  res.send(`${lines.join('\n')}\n${dockerMonitor ? dockerMonitor.metricsText() : ''}`);
});

function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { users: [], projects: [], incidents: [], checks: [] }; }
}
let db = loadDb();
let dockerMonitor = null; // trusted internal Docker-service monitor (see docker-monitor.js); public URL validation is untouched
function saveDb() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function id() { return require('crypto').randomUUID(); }
function safeUser(u) { return { id: u.id, name: u.name, email: u.email, workspaceId: u.workspaceId }; }
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { if (!token) throw new Error('missing'); req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Please sign in again.' }); }
}
function tenantProject(req, res, next) {
  const p = db.projects.find(x => x.id === req.params.id && x.workspaceId === req.user.workspaceId);
  if (!p) return res.status(404).json({ error: 'Project not found.' });
  req.project = p; next();
}
// Trusted internal monitoring path: targets come ONLY from service-registry.js / SERVICE_REGISTRY_FILE, never from API input.
const { createDockerMonitor } = require('./docker-monitor');
dockerMonitor = createDockerMonitor({ app, auth, db, saveDb, newId: id, dbPath: DB_PATH });
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a,b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80:') || x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.');
  }
  return true;
}
async function validatePublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Enter a valid URL including https://'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (u.username || u.password) throw new Error('URLs must not contain embedded credentials.');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || net.isIP(host) && isPrivateIp(host)) throw new Error('For safety, URL monitoring only accepts public hosts. Use Agent / local mode for private or local projects.');
  if (!net.isIP(host)) {
    let records;
    try { records = await dns.lookup(host, { all: true, verbatim: true }); } catch { throw new Error('The hostname could not be resolved.'); }
    if (!records.length || records.some(r => isPrivateIp(r.address))) throw new Error('The hostname resolves to a private or restricted address and cannot be monitored by URL mode.');
  }
  return u.toString();
}
async function checkProject(project) {
  if (project.connectionType !== 'url' || !project.targetUrl) return null;
  const started = Date.now();
  let result;
  try {
    const safeUrl = await validatePublicUrl(project.targetUrl);
    const response = await fetch(safeUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'Sentinel-Monitor/0.1' } });
    const status = response.status;
    result = { status: status >= 200 && status < 400 ? 'healthy' : 'degraded', httpStatus: status, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), message: status >= 200 && status < 400 ? 'Endpoint responded successfully.' : `Endpoint returned HTTP ${status}.` };
    try { await response.body?.cancel(); } catch {}
  } catch (e) {
    result = { status: 'unhealthy', httpStatus: null, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), message: e.name === 'TimeoutError' ? 'Health check timed out.' : e.message || 'Endpoint could not be reached.' };
  }
  project.lastCheck = result;
  project.updatedAt = new Date().toISOString();
  const check = { id: id(), workspaceId: project.workspaceId, projectId: project.id, ...result };
  db.checks.push(check);
  if (db.checks.length > 5000) db.checks = db.checks.slice(-5000);
  if (result.status === 'unhealthy' || result.status === 'degraded') {
    const existing = db.incidents.find(i => i.projectId === project.id && i.status === 'open');
    if (!existing) db.incidents.push({ id: id(), workspaceId: project.workspaceId, projectId: project.id, projectName: project.name, severity: result.status === 'unhealthy' ? 'high' : 'medium', title: result.status === 'unhealthy' ? 'Application endpoint unreachable' : `Endpoint returned HTTP ${result.httpStatus}`, description: result.message, status: 'open', createdAt: result.checkedAt, resolvedAt: null });
  } else {
    db.incidents.filter(i => i.projectId === project.id && i.status === 'open').forEach(i => { i.status = 'resolved'; i.resolvedAt = result.checkedAt; });
  }
  saveDb();
  return result;
}

app.get('/api/health', (req, res) => res.json({ service: 'sentinel-platform-api', status: 'ok', version: '0.1.0' }));
app.post('/api/auth/register', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Enter a name, valid email, and password with at least 8 characters.' });
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: 'An account with this email already exists.' });
  const workspaceId = id();
  const user = { id: id(), name, email, passwordHash: await bcrypt.hash(password, 12), workspaceId, createdAt: new Date().toISOString() };
  db.users.push(user);
  db.workspaces ||= [];
  db.workspaces.push({ id: workspaceId, name: `${name}'s workspace`, ownerId: user.id, createdAt: new Date().toISOString() });
  dockerMonitor.provisionWorkspace(workspaceId);
  saveDb();
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, workspaceId }, JWT_SECRET, { expiresIn: '8h' });
  res.status(201).json({ token, user: safeUser(user) });
});
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.users.find(u => u.email === email);
  if (!user || !await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, workspaceId: user.workspaceId }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: safeUser(user) });
});
app.get('/api/auth/me', auth, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id && u.workspaceId === req.user.workspaceId);
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  res.json({ user: safeUser(user) });
});
app.get('/api/projects', auth, (req, res) => res.json(db.projects.filter(p => p.workspaceId === req.user.workspaceId).sort((a,b) => b.createdAt.localeCompare(a.createdAt))));
app.post('/api/projects', auth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const connectionType = req.body?.connectionType === 'agent' ? 'agent' : 'url';
  const description = String(req.body?.description || '').trim().slice(0, 500);
  if (name.length < 2) return res.status(400).json({ error: 'Project name must contain at least 2 characters.' });
  let targetUrl = null;
  if (connectionType === 'url') {
    try { targetUrl = await validatePublicUrl(String(req.body?.targetUrl || '')); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const project = { id: id(), workspaceId: req.user.workspaceId, name, description, connectionType, targetUrl, status: connectionType === 'url' ? 'pending' : 'awaiting_agent', lastCheck: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.projects.push(project); saveDb();
  if (connectionType === 'url') await checkProject(project);
  res.status(201).json(project);
});
app.get('/api/projects/:id', auth, tenantProject, (req, res) => res.json(req.project));
app.put('/api/projects/:id', auth, tenantProject, async (req, res) => {
  if (req.project.connectionType === 'docker') {
    const dn = String(req.body?.name || '').trim();
    if (dn.length < 2) return res.status(400).json({ error: 'Project name must contain at least 2 characters.' });
    req.project.name = dn; req.project.description = String(req.body?.description || '').trim().slice(0, 500); req.project.updatedAt = new Date().toISOString();
    db.incidents.filter(i => i.projectId === req.project.id && i.workspaceId === req.user.workspaceId && i.status === 'open').forEach(i => { i.projectName = dn; });
    saveDb(); return res.json(req.project);
  }
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim().slice(0, 500);
  const connectionType = req.body?.connectionType === 'agent' ? 'agent' : 'url';
  if (name.length < 2) return res.status(400).json({ error: 'Project name must contain at least 2 characters.' });
  let targetUrl = null;
  if (connectionType === 'url') {
    try { targetUrl = await validatePublicUrl(String(req.body?.targetUrl || '')); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const connectionChanged = req.project.connectionType !== connectionType || req.project.targetUrl !== targetUrl;
  req.project.name = name;
  req.project.description = description;
  req.project.connectionType = connectionType;
  req.project.targetUrl = targetUrl;
  req.project.updatedAt = new Date().toISOString();
  if (connectionType === 'agent') {
    req.project.status = 'awaiting_agent';
    req.project.lastCheck = null;
  } else if (connectionChanged) {
    req.project.status = 'pending';
  }
  // Keep existing check history and incidents, but update open incident labels to the edited name.
  db.incidents.filter(i => i.projectId === req.project.id && i.workspaceId === req.user.workspaceId && i.status === 'open').forEach(i => { i.projectName = name; });
  saveDb();
  if (connectionType === 'url' && connectionChanged) await checkProject(req.project);
  res.json(req.project);
});
app.delete('/api/projects/:id', auth, tenantProject, (req, res) => {
  db.projects = db.projects.filter(p => p.id !== req.project.id);
  db.checks = db.checks.filter(c => c.projectId !== req.project.id || c.workspaceId !== req.user.workspaceId);
  db.incidents = db.incidents.filter(i => i.projectId !== req.project.id || i.workspaceId !== req.user.workspaceId);
  saveDb(); res.json({ ok: true });
});
app.post('/api/projects/:id/check', auth, tenantProject, async (req, res) => {
  if (req.project.connectionType === 'docker') return res.json(await dockerMonitor.checkProjectNow(req.project));
  if (req.project.connectionType !== 'url') return res.status(409).json({ error: 'This project needs a Sentinel agent integration before live checks can run.' });
  res.json(await checkProject(req.project));
});
app.get('/api/projects/:id/checks', auth, tenantProject, (req, res) => req.project.connectionType === 'docker' ? res.json(dockerMonitor.projectChecks(req.project)) : res.json(db.checks.filter(c => c.projectId === req.project.id && c.workspaceId === req.user.workspaceId).slice(-50).reverse()));
app.get('/api/incidents', auth, (req, res) => res.json(db.incidents.filter(i => i.workspaceId === req.user.workspaceId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(i => ({ ...i, source: i.source || 'url' }))));
app.post('/api/incidents/:id/resolve', auth, (req, res) => {
  const incident = db.incidents.find(i => i.id === req.params.id && i.workspaceId === req.user.workspaceId);
  if (!incident) return res.status(404).json({ error: 'Incident not found.' });
  incident.status = 'resolved'; incident.resolvedAt = new Date().toISOString();
  dockerMonitor.onManualResolve(incident, req.user); // records who resolved it and flags it as a manual (unverified) resolution
  saveDb(); res.json(incident);
});
app.get('/api/overview', auth, (req, res) => {
  const projects = db.projects.filter(p => p.workspaceId === req.user.workspaceId);
  const incidents = db.incidents.filter(i => i.workspaceId === req.user.workspaceId);
  res.json({ totalProjects: projects.length, healthy: projects.filter(p => p.lastCheck?.status === 'healthy').length, degraded: projects.filter(p => p.lastCheck?.status === 'degraded').length, unhealthy: projects.filter(p => p.lastCheck?.status === 'unhealthy').length, awaitingAgent: projects.filter(p => p.connectionType === 'agent').length, openIncidents: incidents.filter(i => i.status === 'open').length, recentIncidents: incidents.slice(-5).reverse() });
});
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error.' }); });
app.listen(PORT, () => { console.log(`Sentinel API listening at http://localhost:${PORT}`); dockerMonitor.start(); });

// Poll URL-connected projects every minute. Agent-connected projects are listed as awaiting integration.
setInterval(() => {
  db.projects.filter(p => p.connectionType === 'url' && p.targetUrl).forEach(p => checkProject(p).catch(e => console.error('monitor error', e.message)));
}, 60_000).unref();
