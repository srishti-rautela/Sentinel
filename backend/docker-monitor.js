'use strict';
// Sentinel — trusted Docker microservice monitoring
// ----------------------------------------------------------------------------------------------
// Polls the health endpoints of registered Docker services (service-registry.js) over the shared Docker network,
// maintains a real status state machine, opens/updates/resolves incidents in Sentinel's EXISTING incident store,
// and drives verified recovery through the isolated Recovery Controller.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadRegistry } = require('./service-registry');

const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = () => new Date().toISOString();
function slog(level, event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ timestamp: iso(), service: 'sentinel-api', level, event, ...fields })}\n`);
}

function createDockerMonitor({ app, auth, db, saveDb, newId, dbPath }) {
  const env = process.env;
  const cfg = {
    enabled: env.DOCKER_MONITORING !== 'false',
    intervalMs: num(env.SERVICE_CHECK_INTERVAL_MS, 5000, 1000, 300000),
    timeoutMs: num(env.SERVICE_CHECK_TIMEOUT_MS, 3000, 500, 30000),
    failureThreshold: num(env.SERVICE_FAILURE_THRESHOLD, 2, 1, 20),
    recoveryThreshold: num(env.SERVICE_RECOVERY_THRESHOLD, 2, 1, 20),
    slowMs: num(env.SERVICE_SLOW_MS, 2000, 100, 60000),
    startupGraceMs: num(env.SERVICE_STARTUP_GRACE_MS, 90000, 0, 600000),
    verifyTimeoutMs: num(env.RECOVERY_VERIFY_TIMEOUT_MS, 90000, 10000, 600000),
    controllerUrl: (env.RECOVERY_CONTROLLER_URL || 'http://recovery-controller:7000').replace(/\/$/, ''),
    controllerToken: env.RECOVERY_TOKEN || '',
    lokiUrl: (env.LOKI_URL || 'http://loki:3100').replace(/\/$/, ''),
    statePath: env.SENTINEL_SERVICE_STATE_PATH || path.join(path.dirname(dbPath), 'service-state.json')
  };
  const registry = loadRegistry(env);
  const stacks = new Map(registry.stacks.map(s => [s.id, s]));
  const startedAt = Date.now();

  // ---- state (high-frequency telemetry lives outside data.json so the existing store is not churned) --------------
  const blank = (stack, def) => ({
    id: `${stack.id}:${def.key}`, stackId: stack.id, key: def.key, status: 'UNKNOWN', statusSince: null,
    consecutiveFailures: 0, consecutiveSuccesses: 0, totalChecks: 0, counts: { ok: 0, degraded: 0, failed: 0 },
    failureCount: 0, outages: 0, restartCount: 0, lastRestartAt: null, processStartedAt: null, everHealthy: false,
    lastCheck: null, lastLatencyMs: null, lastSuccessAt: null, lastFailureAt: null, lastError: null, uptimeSeconds: null,
    container: null, ack: {}, pendingCause: null
  });
  let state = { services: {}, checks: {}, events: [], projectChecks: {}, recoveryActions: { success: 0, failed: 0 } };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(cfg.statePath, 'utf8')) }; } catch { /* first run */ }
  const defs = new Map();
  for (const stack of registry.stacks) for (const def of stack.services) {
    defs.set(`${stack.id}:${def.key}`, { stack, def });
    state.services[`${stack.id}:${def.key}`] = { ...blank(stack, def), ...(state.services[`${stack.id}:${def.key}`] || {}) };
    state.checks[`${stack.id}:${def.key}`] ||= [];
  }
  let stateTimer = null;
  function persistState() {
    try {
      fs.mkdirSync(path.dirname(cfg.statePath), { recursive: true });
      const tmp = `${cfg.statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, cfg.statePath);
    } catch (e) { slog('warn', 'state_persist_failed', { error: e.message }); }
  }
  function scheduleStateSave() { if (!stateTimer) stateTimer = setTimeout(() => { stateTimer = null; persistState(); }, 3000); stateTimer.unref?.(); }
  const svcState = id => state.services[id];

  function addEvent(svc, type, message, extra = {}) {
    state.events.unshift({ id: newId(), serviceId: svc.id, at: iso(), type, message, ...extra });
    if (state.events.length > 800) state.events.length = 800;
    scheduleStateSave();
  }
  function pushCheck(svc, c) {
    const list = state.checks[svc.id]; list.push(c); if (list.length > 400) list.splice(0, list.length - 400);
  }

  // ---- Recovery Controller client --------------------------------------------------------------------------------
  let controllerStatus = { reachable: null, checkedAt: null, error: null };
  async function controller(method, p, body, timeoutMs = 60000) {
    if (!cfg.controllerToken) throw Object.assign(new Error('Recovery Controller is not configured (RECOVERY_TOKEN missing).'), { status: 503 });
    let res;
    try {
      res = await fetch(`${cfg.controllerUrl}${p}`, {
        method, signal: AbortSignal.timeout(timeoutMs), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.controllerToken}` }, body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      controllerStatus = { reachable: false, checkedAt: iso(), error: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || e.message) };
      throw Object.assign(new Error(`Recovery Controller unreachable (${controllerStatus.error}).`), { status: 503 });
    }
    controllerStatus = { reachable: true, checkedAt: iso(), error: null };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Recovery Controller returned HTTP ${res.status}.`), { status: res.status === 401 || res.status === 403 ? 502 : res.status });
    return data;
  }
  async function refreshContainers() {
    if (!cfg.controllerToken) return;
    try {
      const { services } = await controller('GET', '/v1/services', null, 4000);
      for (const c of services) for (const { stack, def } of defs.values()) {
        if (def.key === c.service) svcState(`${stack.id}:${def.key}`).container = { ...c, observedAt: iso() };
      }
    } catch { /* reflected in controllerStatus */ }
  }

  // ---- health probing ---------------------------------------------------------------------------------------------
  function describeError(e, def) {
    const code = e.cause?.code || e.code;
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return `Health check timed out after ${cfg.timeoutMs} ms`;
    if (code === 'ECONNREFUSED') return `Connection refused — nothing is listening on ${new URL(def.healthUrl).host}`;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `DNS lookup failed for ${new URL(def.healthUrl).hostname} — the container is stopped or removed`;
    if (code === 'ECONNRESET') return 'Connection reset by the service';
    if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'Host unreachable on the Docker network';
    return e.cause?.message || e.message || 'Health endpoint could not be reached';
  }
  async function probe(svc, def, incidentId) {
    const started = Date.now();
    const headers = { 'User-Agent': 'Sentinel-ServiceMonitor/1.0', 'X-Request-Id': `sentinel-${crypto.randomBytes(6).toString('hex')}`, Accept: 'application/json' };
    if (incidentId) headers['X-Incident-Id'] = incidentId;
    try {
      const res = await fetch(def.healthUrl, { redirect: 'manual', signal: AbortSignal.timeout(cfg.timeoutMs), headers });
      const latencyMs = Date.now() - started;
      let body = null;
      try { const text = await res.text(); body = text.length < 20000 ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
      const base = { checkedAt: iso(), httpStatus: res.status, latencyMs, startedAt: body?.startedAt || null, uptimeSeconds: body?.uptimeSeconds ?? null, dependencies: body?.dependencies || null };
      if (res.status >= 200 && res.status < 300) {
        if (body && body.status && body.status !== 'ok') return { ...base, result: 'degraded', message: `Service reports status "${body.status}"${body.reason ? `: ${body.reason}` : ''}` };
        if (latencyMs > cfg.slowMs) return { ...base, result: 'degraded', message: `Slow response (${latencyMs} ms, threshold ${cfg.slowMs} ms)` };
        return { ...base, result: 'ok', message: 'Health endpoint responded successfully.' };
      }
      const detail = body?.reason || (body?.dependencies ? Object.entries(body.dependencies).filter(([, v]) => v === 'down' || v === 'unwritable').map(([k]) => `${k} ${'unavailable'}`).join(', ') : '');
      return { ...base, result: 'failed', message: `HTTP ${res.status}${body?.status ? ` (${body.status})` : ''}${detail ? ` — ${detail}` : ''}` };
    } catch (e) {
      return { checkedAt: iso(), httpStatus: null, latencyMs: Date.now() - started, startedAt: null, uptimeSeconds: null, dependencies: null, result: 'failed', message: describeError(e, def) };
    }
  }

  // ---- incident helpers (existing Sentinel incident store: db.incidents) ------------------------------------------
  const projectsFor = stackId => db.projects.filter(p => p.stackId === stackId);
  const openIncident = (project, svc) => db.incidents.find(i => i.source === 'docker' && i.projectId === project.id && i.serviceKey === svc.key && i.status === 'open');
  const stamp = (inc, type, message, detail) => { (inc.timeline ||= []).push({ at: iso(), type, message, ...(detail ? { detail } : {}) }); if (inc.timeline.length > 120) inc.timeline.splice(0, inc.timeline.length - 120); };

  function containerNote(svc) {
    const c = svc.container;
    if (!c || c.exists === false) return '';
    if (c.running === false) return ` Container ${c.container} is ${c.status || 'stopped'}${c.exitCode != null ? ` (exit code ${c.exitCode}${c.oomKilled ? ', OOM-killed' : ''})` : ''}.`;
    return ` Container ${c.container} is running but its health endpoint is failing.`;
  }
  function recommendationsFor(def, svc) {
    const c = svc.container;
    const list = [`Approve Restart to restart only the ${def.container} container. Sentinel resolves the incident only after two consecutive healthy checks.`];
    if (c && c.running === false) list.push(`The container is not running. If it was stopped on purpose, start it with: docker compose start ${def.composeService}`);
    else list.push(`Inspect the logs for crashes or dependency errors: docker compose logs ${def.composeService}`);
    if (/mongo|database|dependency/i.test(svc.lastError || '')) list.push('The service reports a MongoDB dependency problem — check the mongo container before restarting this service.');
    list.push('If recovery fails, use Retry Recovery, or resolve manually once you have fixed the cause (manual resolution is audited).');
    return list;
  }
  function createIncident(project, svc, def, r) {
    const now = iso();
    const recent = state.checks[svc.id].slice(-6);
    const inc = {
      id: newId(), workspaceId: project.workspaceId, projectId: project.id, projectName: project.name,
      source: 'docker', severity: def.severity, title: `${def.name} DOWN`, description: def.incidentDescription,
      status: 'open', phase: 'detected', createdAt: now, resolvedAt: null,
      serviceId: svc.id, serviceKey: def.key, serviceName: def.name, containerName: def.container, healthEndpoint: def.healthUrl,
      failureReason: `${r.message}.${containerNote(svc)}`.replace(/\.\./g, '.'), impact: def.impact,
      firstDetectedAt: now, latestDetectedAt: now, failedChecks: svc.consecutiveFailures,
      restartCountAtOpen: svc.restartCount, resolutionType: null, resolvedBy: null,
      evidence: recent.map(c => ({ at: c.at, result: c.result, httpStatus: c.httpStatus, latencyMs: c.latencyMs, message: c.message })),
      recommendations: recommendationsFor(def, svc),
      recovery: { state: 'none', attempts: 0, history: [], lastRequestedAt: null, verifiedAt: null, durationMs: null, lastError: null },
      timeline: []
    };
    stamp(inc, 'detected', `${def.name} failed ${svc.consecutiveFailures} consecutive health checks.`, r.message);
    db.incidents.push(inc);
    slog('error', 'incident_opened', { incidentId: inc.id, serviceName: def.name, container: def.container, severity: def.severity, reason: r.message, projectId: project.id });
    return inc;
  }
  function resolveIncident(inc, svc, { type, by, note }) {
    const now = iso();
    inc.status = 'resolved'; inc.resolvedAt = now; inc.phase = 'resolved'; inc.resolutionType = type; inc.resolvedBy = by || null;
    inc.downtimeMs = Date.parse(now) - Date.parse(inc.firstDetectedAt || inc.createdAt);
    inc.restartsDuringIncident = Math.max(0, svc.restartCount - (inc.restartCountAtOpen || 0));
    const rec = inc.recovery;
    if (type !== 'manual' && rec) {
      const last = rec.history[rec.history.length - 1];
      if (rec.state === 'verifying' || rec.state === 'restarting') { rec.state = 'verified'; if (last) last.state = 'verified'; }
      rec.verifiedAt = now; rec.durationMs = rec.lastRequestedAt ? Date.parse(now) - Date.parse(rec.lastRequestedAt) : null;
      if (last && last.state === 'verified') { last.verifiedAt = now; }
    }
    stamp(inc, type === 'manual' ? 'resolved_manual' : 'resolved_verified', note || 'Service passed health verification.');
    slog('info', 'incident_resolved', { incidentId: inc.id, serviceName: inc.serviceName, resolutionType: type, downtimeMs: inc.downtimeMs });
  }

  function syncIncidents(svc, def, r, prev) {
    const projects = projectsFor(svc.stackId);
    let changed = false;
    for (const project of projects) {
      const open = openIncident(project, svc);
      if (svc.status === 'DOWN') {
        if (open) {
          open.latestDetectedAt = r.checkedAt; open.failedChecks = svc.consecutiveFailures; open.failureReason = `${r.message}.${containerNote(svc)}`.replace(/\.\./g, '.');
          if (r.result === 'failed') { open.evidence.push({ at: r.checkedAt, result: r.result, httpStatus: r.httpStatus, latencyMs: r.latencyMs, message: r.message }); if (open.evidence.length > 15) open.evidence.shift(); }
          if (prev === 'RECOVERING') {
            stamp(open, 'verification_failed', 'Service answered a health check but failed again before verification completed.');
            if (open.recovery.state === 'verifying') { open.phase = 'verifying'; }
          }
        } else if (!svc.ack[project.id]) {
          createIncident(project, svc, def, r); changed = true;
        }
      } else if (open && (svc.status === 'HEALTHY' || (svc.status === 'DEGRADED' && (prev === 'DOWN' || prev === 'RECOVERING')))) {
        const verified = open.recovery.state === 'verifying' || open.recovery.state === 'restarting';
        resolveIncident(open, svc, { type: verified ? 'verified_recovery' : 'auto_recovered', note: `${def.name} passed ${cfg.recoveryThreshold} consecutive health checks${verified ? ' after the approved restart' : ''}.` });
        changed = true;
      } else if (open && svc.status === 'RECOVERING') {
        open.phase = 'verifying';
        stamp(open, 'verification_progress', `Health check passed (${svc.consecutiveSuccesses}/${cfg.recoveryThreshold}).`);
        changed = true;
      }
    }
    if (svc.status === 'HEALTHY') svc.ack = {};
    if (changed) saveDb();
  }

  // ---- the status state machine ------------------------------------------------------------------------------------
  function applyResult(svc, def, r) {
    const prev = svc.status; const now = r.checkedAt;
    svc.totalChecks += 1; svc.counts[r.result] += 1;
    svc.lastCheck = { at: now, result: r.result, httpStatus: r.httpStatus, latencyMs: r.latencyMs, message: r.message };
    svc.lastLatencyMs = r.result === 'failed' ? null : r.latencyMs;
    let next = prev;
    if (r.result === 'failed') {
      svc.consecutiveFailures += 1; svc.consecutiveSuccesses = 0; svc.failureCount += 1; svc.lastFailureAt = now; svc.lastError = r.message;
      const inGrace = !svc.everHealthy && Date.now() - startedAt < cfg.startupGraceMs;
      if (prev === 'DOWN' || prev === 'RECOVERING') next = 'DOWN';
      else if (svc.consecutiveFailures >= cfg.failureThreshold) next = inGrace ? 'UNKNOWN' : 'DOWN';
      else next = prev === 'UNKNOWN' ? 'UNKNOWN' : 'DEGRADED';
      if (svc.consecutiveFailures === 1 && prev !== 'DOWN') refreshContainers();
    } else {
      svc.consecutiveFailures = 0; svc.consecutiveSuccesses += 1; svc.lastSuccessAt = now; svc.uptimeSeconds = r.uptimeSeconds;
      if (r.startedAt) {
        if (svc.processStartedAt && svc.processStartedAt !== r.startedAt) {
          svc.restartCount += 1; svc.lastRestartAt = now;
          const pc = svc.pendingCause && Date.now() - Date.parse(svc.pendingCause.at) < 300000 ? svc.pendingCause : null;
          addEvent(svc, 'restart', pc ? `Service process restarted (${pc.cause === 'sentinel_recovery' ? `approved recovery by ${pc.by}` : `Sentinel action by ${pc.by}`}).` : 'Service process restarted outside Sentinel (e.g. docker compose restart/start).',
            { cause: pc ? pc.cause : 'external', incidentId: pc?.incidentId || null });
          slog('info', 'service_restart_detected', { serviceName: def.name, container: def.container, cause: pc ? pc.cause : 'external', incidentId: pc?.incidentId });
          svc.pendingCause = null;
        }
        svc.processStartedAt = r.startedAt;
      }
      if (prev === 'DOWN' || prev === 'RECOVERING') next = svc.consecutiveSuccesses >= cfg.recoveryThreshold ? (r.result === 'ok' ? 'HEALTHY' : 'DEGRADED') : 'RECOVERING';
      else next = r.result === 'ok' ? 'HEALTHY' : 'DEGRADED';
      if (next === 'HEALTHY') svc.everHealthy = true;
      if (next === 'DEGRADED' || next === 'HEALTHY') svc.everHealthy = true;
    }
    svc.status = next;
    if (next !== prev) {
      svc.statusSince = now;
      if (next === 'DOWN' && prev !== 'RECOVERING') { svc.outages += 1; addEvent(svc, 'failure', `${def.name} is DOWN: ${r.message}`, { reason: r.message }); }
      else if (next === 'DOWN') addEvent(svc, 'failure', `${def.name} failed again while recovering: ${r.message}`, { reason: r.message });
      else addEvent(svc, 'status_change', `${def.name} changed from ${prev} to ${next}.`, { from: prev, to: next });
      slog(next === 'DOWN' ? 'error' : 'info', 'service_status_changed', { serviceName: def.name, container: def.container, from: prev, to: next, reason: r.message });
    }
    pushCheck(svc, { at: now, result: r.result, httpStatus: r.httpStatus, latencyMs: r.latencyMs, message: r.message, status: next });
    syncIncidents(svc, def, r, prev);
    scheduleStateSave();
    return { prev, next };
  }

  const inFlight = new Set();
  async function checkService(id) {
    const { def } = defs.get(id); const svc = svcState(id);
    if (inFlight.has(id)) return null;
    inFlight.add(id);
    try {
      const openIds = db.incidents.filter(i => i.source === 'docker' && i.serviceId === id && i.status === 'open');
      const r = await probe(svc, def, openIds[0]?.id);
      applyResult(svc, def, r);
      return r;
    } finally { inFlight.delete(id); }
  }

  // ---- project-level aggregate (feeds My Projects / Overview / Monitoring history) ---------------------------------
  const lastAggregate = new Map();
  function aggregate(stackId) {
    const stack = stacks.get(stackId);
    const list = stack.services.map(d => svcState(`${stackId}:${d.key}`));
    const statuses = list.map(s => s.status);
    const down = list.filter(s => s.status === 'DOWN'); const healthy = list.filter(s => s.status === 'HEALTHY');
    let status = 'pending';
    if (down.length) status = 'unhealthy';
    else if (statuses.every(s => s === 'HEALTHY')) status = 'healthy';
    else if (statuses.some(s => s !== 'UNKNOWN')) status = 'degraded';
    const lat = list.map(s => s.lastLatencyMs).filter(v => Number.isFinite(v));
    const message = down.length ? `${down.map(s => defs.get(s.id).def.name).join(', ')} down (${healthy.length}/${list.length} services healthy).` : `${healthy.length}/${list.length} services healthy.`;
    return { status, httpStatus: null, latencyMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null, checkedAt: iso(), message };
  }
  function updateProjects() {
    for (const stackId of stacks.keys()) {
      const agg = aggregate(stackId);
      const last = lastAggregate.get(stackId);
      const changed = !last || last.status !== agg.status || last.message !== agg.message;
      const due = !last || Date.now() - last.at >= 30000;
      for (const p of projectsFor(stackId)) { p.lastCheck = agg; p.status = agg.status; p.updatedAt = agg.checkedAt; }
      if (changed || due) {
        lastAggregate.set(stackId, { status: agg.status, message: agg.message, at: Date.now() });
        if (agg.status !== 'pending') {
          const list = (state.projectChecks[stackId] ||= []);
          list.push({ id: newId(), ...agg }); if (list.length > 300) list.splice(0, list.length - 300);
        }
        if (projectsFor(stackId).length) saveDb();
        scheduleStateSave();
      }
    }
  }

  // ---- scheduler -----------------------------------------------------------------------------------------------------
  let cycleRunning = false; let timer = null;
  function watchdog() {
    for (const inc of db.incidents) {
      if (inc.source !== 'docker' || inc.status !== 'open' || inc.recovery?.state !== 'verifying') continue;
      if (Date.now() - Date.parse(inc.recovery.lastRequestedAt) < cfg.verifyTimeoutMs) continue;
      const rec = inc.recovery; const last = rec.history[rec.history.length - 1];
      rec.state = 'failed'; rec.lastError = `Service did not pass ${cfg.recoveryThreshold} consecutive health checks within ${Math.round(cfg.verifyTimeoutMs / 1000)}s after the restart.`;
      if (last) { last.state = 'failed'; last.error = rec.lastError; last.finishedAt = iso(); }
      inc.phase = 'recovery_failed'; stamp(inc, 'recovery_failed', rec.lastError);
      state.recoveryActions.failed += 1;
      slog('error', 'recovery_verification_failed', { incidentId: inc.id, serviceName: inc.serviceName, error: rec.lastError });
      saveDb();
    }
  }
  async function cycle() {
    if (cycleRunning) return; cycleRunning = true;
    try {
      await Promise.allSettled([...defs.keys()].map(id => checkService(id)).concat(refreshContainers()));
      watchdog(); updateProjects();
    } catch (e) { slog('error', 'monitor_cycle_failed', { error: e.message }); }
    finally { cycleRunning = false; }
  }
  async function burst(id, count = 8, gapMs = 1000) {
    for (let i = 0; i < count; i += 1) { await sleep(gapMs); await checkService(id).catch(() => null); updateProjects(); }
  }
  async function verifyBurst(id) {
    const deadline = Date.now() + cfg.verifyTimeoutMs;
    while (Date.now() < deadline) {
      await sleep(1000);
      const open = db.incidents.find(i => i.source === 'docker' && i.serviceId === id && i.status === 'open' && i.recovery?.state === 'verifying');
      if (!open) return;
      await checkService(id).catch(() => null); updateProjects();
    }
  }
  function start() {
    if (!cfg.enabled) { slog('warn', 'docker_monitoring_disabled'); return; }
    provisionAll();
    slog('info', 'docker_monitor_started', { intervalMs: cfg.intervalMs, failureThreshold: cfg.failureThreshold, recoveryThreshold: cfg.recoveryThreshold, services: [...defs.keys()] });
    const loop = async () => { await cycle(); timer = setTimeout(loop, cfg.intervalMs); };
    loop();
    for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { persistState(); process.exit(0); });
  }

  // ---- project provisioning (uses the existing project schema; never touches existing projects) ---------------------
  function provisionWorkspace(workspaceId) {
    db.provisionedStacks ||= [];
    let created = false;
    for (const stack of registry.stacks) {
      const key = `${workspaceId}:${stack.id}`;
      if (db.provisionedStacks.includes(key)) continue;
      db.provisionedStacks.push(key);
      if (db.projects.some(p => p.workspaceId === workspaceId && p.stackId === stack.id)) continue;
      const now = iso();
      db.projects.push({
        id: newId(), workspaceId, name: stack.projectName, description: stack.description, connectionType: 'docker', stackId: stack.id,
        targetUrl: null, status: 'pending', lastCheck: null, createdAt: now, updatedAt: now
      });
      created = true;
      slog('info', 'project_provisioned', { workspaceId, project: stack.projectName });
    }
    return created;
  }
  function provisionAll() {
    const ids = new Set([...(db.users || []).map(u => u.workspaceId), ...(db.workspaces || []).map(w => w.id)].filter(Boolean));
    let any = false; for (const ws of ids) any = provisionWorkspace(ws) || any;
    saveDb(); return any;
  }

  // ---- views --------------------------------------------------------------------------------------------------------
  const openCountFor = (workspaceId, svc) => db.incidents.filter(i => i.source === 'docker' && i.workspaceId === workspaceId && i.serviceId === svc.id && i.status === 'open').length;
  function serviceView(project, svc) {
    const { def, stack } = defs.get(svc.id);
    const up = svc.counts.ok + svc.counts.degraded;
    return {
      id: svc.id, key: def.key, name: def.name, type: def.type, projectId: project.id, projectName: project.name, stackId: stack.id,
      containerName: def.container, composeService: def.composeService, healthEndpoint: def.healthUrl, severity: def.severity, impact: def.impact,
      status: svc.status, statusSince: svc.statusSince, responseTimeMs: svc.lastLatencyMs, lastCheckAt: svc.lastCheck?.at || null, lastCheckResult: svc.lastCheck,
      uptimePercent: svc.totalChecks ? Math.round((up / svc.totalChecks) * 1000) / 10 : null, totalChecks: svc.totalChecks,
      failureCount: svc.failureCount, outages: svc.outages, openIncidents: openCountFor(project.workspaceId, svc), restartCount: svc.restartCount,
      lastRestartAt: svc.lastRestartAt, consecutiveFailures: svc.consecutiveFailures, consecutiveSuccesses: svc.consecutiveSuccesses,
      lastError: svc.lastError, lastSuccessAt: svc.lastSuccessAt, lastFailureAt: svc.lastFailureAt, processUptimeSeconds: svc.uptimeSeconds, container: svc.container
    };
  }
  const monitorInfo = () => ({
    intervalMs: cfg.intervalMs, failureThreshold: cfg.failureThreshold, recoveryThreshold: cfg.recoveryThreshold, timeoutMs: cfg.timeoutMs,
    controller: controllerStatus, enabled: cfg.enabled, startupGraceMs: cfg.startupGraceMs
  });
  function resolveService(req, res) {
    const entry = defs.get(req.params.id);
    const project = entry && db.projects.find(p => p.stackId === entry.stack.id && p.workspaceId === req.user.workspaceId);
    if (!entry || !project) { res.status(404).json({ error: 'Service not found.' }); return null; }
    return { ...entry, svc: svcState(req.params.id), project };
  }
  const publicIncident = i => ({ ...i, source: i.source || 'url' });

  // ---- routes -------------------------------------------------------------------------------------------------------
  app.get('/api/services', auth, (req, res) => {
    const projects = db.projects.filter(p => p.workspaceId === req.user.workspaceId && p.stackId);
    const services = projects.flatMap(p => stacks.get(p.stackId).services.map(d => serviceView(p, svcState(`${p.stackId}:${d.key}`))));
    res.json({ monitor: monitorInfo(), projects: projects.map(p => ({ id: p.id, name: p.name, stackId: p.stackId, status: p.lastCheck?.status || 'pending' })), services });
  });
  app.get('/api/services/:id', auth, (req, res) => {
    const ctx = resolveService(req, res); if (!ctx) return;
    const { svc, project, def } = ctx;
    const checks = state.checks[svc.id].slice(-120).reverse();
    res.json({
      service: serviceView(project, svc), monitor: monitorInfo(), description: def.incidentDescription, recommendations: recommendationsFor(def, svc),
      checks, responseTimes: checks.filter(c => Number.isFinite(c.latencyMs) && c.result !== 'failed').slice(0, 60).reverse().map(c => ({ at: c.at, ms: c.latencyMs })),
      events: state.events.filter(e => e.serviceId === svc.id).slice(0, 80),
      restarts: state.events.filter(e => e.serviceId === svc.id && e.type === 'restart').slice(0, 30),
      failures: state.events.filter(e => e.serviceId === svc.id && e.type === 'failure').slice(0, 30),
      incidents: db.incidents.filter(i => i.source === 'docker' && i.workspaceId === req.user.workspaceId && i.serviceId === svc.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25).map(publicIncident)
    });
  });
  app.post('/api/services/:id/check', auth, async (req, res) => {
    const ctx = resolveService(req, res); if (!ctx) return;
    await checkService(ctx.svc.id); updateProjects();
    addEvent(ctx.svc, 'action', `Manual health check run by ${req.user.email}.`, { by: req.user.email });
    res.json({ service: serviceView(ctx.project, ctx.svc) });
  });
  app.post('/api/services/:id/:action(stop|start|restart)', auth, async (req, res) => {
    const ctx = resolveService(req, res); if (!ctx) return;
    const { svc, def, project } = ctx; const action = req.params.action;
    try {
      const out = await controller('POST', `/v1/services/${def.key}/${action}`, { requestedBy: req.user.email });
      addEvent(svc, 'action', `${action[0].toUpperCase()}${action.slice(1)} requested by ${req.user.email}; container is now ${out.status}.`, { by: req.user.email, action });
      if (action !== 'stop') svc.pendingCause = { cause: 'sentinel_action', at: iso(), by: req.user.email };
      for (const inc of db.incidents.filter(i => i.source === 'docker' && i.serviceId === svc.id && i.status === 'open')) { stamp(inc, `service_${action}`, `${action} issued from Services page by ${req.user.email}.`); }
      saveDb(); burst(svc.id).catch(() => null);
      res.json({ ok: true, container: out, service: serviceView(project, svc) });
    } catch (e) {
      addEvent(svc, 'action', `${action} requested by ${req.user.email} failed: ${e.message}`, { by: req.user.email, action, failed: true });
      res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 502).json({ error: e.message });
    }
  });
  app.get('/api/services/:id/logs', auth, async (req, res) => {
    const ctx = resolveService(req, res); if (!ctx) return;
    const { def, svc } = ctx; const tail = num(req.query.tail, 200, 1, 1000);
    const source = req.query.source === 'loki' ? 'loki' : 'docker';
    const since = req.query.since ? Date.parse(req.query.since) : null;
    try {
      let logs;
      if (source === 'loki') logs = await lokiLogs(def.container, tail);
      else logs = (await controller('GET', `/v1/services/${def.key}/logs?tail=${tail}`, null, 15000)).logs;
      let gatewayEvidence = [];
      if (req.query.include === 'gateway' && def.key !== 'gateway') {
        try {
          const gw = source === 'loki' ? await lokiLogs('tilda-gateway', 400) : (await controller('GET', '/v1/services/gateway/logs?tail=400', null, 15000)).logs;
          gatewayEvidence = gw.filter(l => /upstream_failure/.test(l.raw || '') && new RegExp(`"upstream":"${def.key}"`).test(l.raw || '')).map(l => ({ ...l, origin: 'api-gateway' }));
        } catch { /* gateway logs are supplementary */ }
      }
      let merged = [...logs.map(l => ({ ...l, origin: def.container })), ...gatewayEvidence].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
      if (since) merged = merged.filter(l => !l.timestamp || Date.parse(l.timestamp) >= since);
      res.json({ source, service: svc.id, container: def.container, logs: merged.slice(-tail) });
    } catch (e) { res.status(e.status && e.status >= 400 ? e.status : 502).json({ error: `Could not read ${source} logs: ${e.message}` }); }
  });
  async function lokiLogs(container, limit) {
    const end = Date.now() * 1e6; const start = end - 3600e9;
    const url = `${cfg.lokiUrl}/loki/api/v1/query_range?${new URLSearchParams({ query: `{container="${container}"}`, limit: String(limit), start: String(start), end: String(end), direction: 'backward' })}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`Loki returned HTTP ${r.status}`);
    const data = await r.json();
    const lines = [];
    for (const stream of data.data?.result || []) for (const [ns, line] of stream.values) {
      let parsed = null; if (line.startsWith('{')) { try { parsed = JSON.parse(line); } catch { /* plain */ } }
      lines.push({ timestamp: parsed?.timestamp || new Date(Number(BigInt(ns) / 1000000n)).toISOString(), stream: stream.stream.stream || 'stdout', level: parsed?.level || 'info', event: parsed?.event || null, requestId: parsed?.requestId || null, incidentId: parsed?.incidentId || null, message: parsed ? (parsed.error || parsed.message || parsed.event || line) : line, raw: line });
    }
    return lines.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }

  async function startRecovery(inc, user) {
    const entry = defs.get(inc.serviceId); const svc = svcState(inc.serviceId);
    const rec = inc.recovery; const now = iso();
    const attempt = { n: rec.attempts + 1, requestedBy: { id: user.id, name: user.name, email: user.email }, requestedAt: now, state: 'restarting' };
    rec.attempts += 1; rec.history.push(attempt); rec.state = 'restarting'; rec.lastRequestedAt = now; rec.lastError = null; rec.verifiedAt = null;
    inc.phase = 'recovery_requested';
    stamp(inc, 'recovery_requested', `Restart of ${entry.def.container} approved by ${user.email} (attempt ${attempt.n}).`);
    svc.pendingCause = { cause: 'sentinel_recovery', at: now, by: user.email, incidentId: inc.id };
    saveDb();
    slog('info', 'recovery_requested', { incidentId: inc.id, serviceName: inc.serviceName, container: entry.def.container, requestedBy: user.email, attempt: attempt.n });
    try {
      const out = await controller('POST', `/v1/services/${entry.def.key}/restart`, { requestedBy: user.email, incidentId: inc.id });
      attempt.restartedAt = iso(); attempt.containerStartedAt = out.startedAt; attempt.state = 'verifying';
      rec.state = 'verifying'; inc.phase = 'verifying'; svc.consecutiveSuccesses = 0;
      stamp(inc, 'restart_issued', `Recovery Controller restarted ${entry.def.container}. Waiting for ${cfg.recoveryThreshold} consecutive healthy checks.`);
      state.recoveryActions.success += 1;
      addEvent(svc, 'action', `Restart of ${entry.def.container} executed for incident ${inc.id.slice(0, 8)} (approved by ${user.email}).`, { by: user.email, action: 'restart', incidentId: inc.id });
      saveDb(); verifyBurst(svc.id).catch(() => null);
      return out;
    } catch (e) {
      attempt.state = 'failed'; attempt.error = e.message; attempt.finishedAt = iso();
      rec.state = 'failed'; rec.lastError = e.message; inc.phase = 'recovery_failed'; svc.pendingCause = null;
      stamp(inc, 'recovery_failed', `Restart could not be executed: ${e.message}`);
      state.recoveryActions.failed += 1;
      addEvent(svc, 'recovery_failed', `Restart for incident ${inc.id.slice(0, 8)} failed: ${e.message}`, { by: user.email, incidentId: inc.id });
      slog('error', 'recovery_failed', { incidentId: inc.id, serviceName: inc.serviceName, error: e.message });
      saveDb(); throw e;
    }
  }
  function findDockerIncident(req, res) {
    const inc = db.incidents.find(i => i.id === req.params.id && i.workspaceId === req.user.workspaceId);
    if (!inc) { res.status(404).json({ error: 'Incident not found.' }); return null; }
    return inc;
  }
  async function recoverHandler(req, res, retry) {
    const inc = findDockerIncident(req, res); if (!inc) return;
    if (inc.source !== 'docker') return res.status(409).json({ error: 'Recovery is only available for Docker microservice incidents.' });
    if (inc.status !== 'open') return res.status(409).json({ error: 'This incident is already resolved.' });
    const st = inc.recovery.state;
    if (st === 'requested' || st === 'restarting' || st === 'verifying') return res.status(409).json({ error: 'A recovery attempt is already in progress for this incident.' });
    if (retry && st !== 'failed') return res.status(409).json({ error: 'Retry is only available after a failed recovery attempt.' });
    try { const out = await startRecovery(inc, req.user); res.json({ ok: true, container: out, incident: publicIncident(inc) }); }
    catch (e) { res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 502).json({ error: e.message, incident: publicIncident(inc) }); }
  }
  app.post('/api/incidents/:id/recover', auth, (req, res) => recoverHandler(req, res, false));
  app.post('/api/incidents/:id/retry-recovery', auth, (req, res) => recoverHandler(req, res, true));
  app.get('/api/incidents/:id', auth, (req, res) => {
    const inc = findDockerIncident(req, res); if (!inc) return;
    let relatedChecks = [];
    if (inc.source === 'docker') {
      const from = Date.parse(inc.firstDetectedAt) - 30000; const to = inc.resolvedAt ? Date.parse(inc.resolvedAt) + 30000 : Date.now();
      relatedChecks = (state.checks[inc.serviceId] || []).filter(c => { const t = Date.parse(c.at); return t >= from && t <= to; }).slice(-80).reverse();
    }
    res.json({ incident: publicIncident(inc), relatedChecks, service: inc.source === 'docker' && defs.has(inc.serviceId) ? serviceView(db.projects.find(p => p.id === inc.projectId) || { id: inc.projectId, name: inc.projectName, workspaceId: inc.workspaceId }, svcState(inc.serviceId)) : null });
  });
  app.get('/api/projects/:id/overview', auth, (req, res) => {
    const project = db.projects.find(p => p.id === req.params.id && p.workspaceId === req.user.workspaceId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (project.connectionType !== 'docker') return res.status(409).json({ error: 'Overview is only available for Docker microservice projects.' });
    const stack = stacks.get(project.stackId);
    const services = stack.services.map(d => serviceView(project, svcState(`${stack.id}:${d.key}`)));
    res.json({
      project, stack: { id: stack.id, storefrontUrl: stack.storefrontUrl, gatewayUrl: stack.gatewayUrl }, services, monitor: monitorInfo(),
      incidents: db.incidents.filter(i => i.projectId === project.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map(publicIncident)
    });
  });
  app.post('/api/stacks/:stackId/register', auth, (req, res) => {
    const stack = stacks.get(req.params.stackId);
    if (!stack) return res.status(404).json({ error: 'Unknown stack.' });
    db.provisionedStacks = (db.provisionedStacks || []).filter(k => k !== `${req.user.workspaceId}:${stack.id}`);
    provisionWorkspace(req.user.workspaceId); updateProjects(); saveDb();
    res.status(201).json(db.projects.find(p => p.workspaceId === req.user.workspaceId && p.stackId === stack.id));
  });

  // ---- hooks used by the existing routes in server.js ---------------------------------------------------------------
  function onManualResolve(incident, user) {
    incident.resolvedBy = { id: user.id, name: user.name, email: user.email }; incident.resolutionType = 'manual';
    if (incident.source !== 'docker') return;
    const svc = defs.has(incident.serviceId) ? svcState(incident.serviceId) : null;
    incident.phase = 'resolved'; incident.downtimeMs = Date.parse(incident.resolvedAt) - Date.parse(incident.firstDetectedAt || incident.createdAt);
    if (incident.recovery && ['requested', 'restarting', 'verifying'].includes(incident.recovery.state)) incident.recovery.state = 'cancelled';
    stamp(incident, 'resolved_manual', `Resolved manually by ${user.name} (${user.email}). Health verification was not used for this resolution.`);
    if (svc && svc.status !== 'HEALTHY') svc.ack[incident.projectId] = iso();
    slog('warn', 'incident_resolved_manually', { incidentId: incident.id, serviceName: incident.serviceName, by: user.email, serviceStatus: svc?.status });
  }
  function projectChecks(project) { return (state.projectChecks[project.stackId] || []).slice(-50).reverse().map(c => ({ ...c, projectId: project.id, workspaceId: project.workspaceId })); }
  async function checkProjectNow(project) {
    await Promise.allSettled(stacks.get(project.stackId).services.map(d => checkService(`${project.stackId}:${d.key}`)));
    updateProjects(); return project.lastCheck;
  }

  // ---- Prometheus metrics ---------------------------------------------------------------------------------------------
  function metricsText() {
    const L = [];
    const lab = (stack, def) => `stack="${stack.id}",service="${def.key}",container="${def.container}"`;
    const rows = [...defs.values()].map(({ stack, def }) => ({ stack, def, svc: svcState(`${stack.id}:${def.key}`) }));
    L.push('# HELP sentinel_service_up 1 when the Docker service last passed its health check.', '# TYPE sentinel_service_up gauge');
    for (const { stack, def, svc } of rows) L.push(`sentinel_service_up{${lab(stack, def)}} ${svc.status === 'HEALTHY' || svc.status === 'DEGRADED' ? 1 : 0}`);
    L.push('# HELP sentinel_service_status Current Sentinel status (one-hot).', '# TYPE sentinel_service_status gauge');
    for (const { stack, def, svc } of rows) for (const s of ['HEALTHY', 'DEGRADED', 'DOWN', 'RECOVERING', 'UNKNOWN']) L.push(`sentinel_service_status{${lab(stack, def)},status="${s}"} ${svc.status === s ? 1 : 0}`);
    L.push('# HELP sentinel_service_response_time_seconds Last health-check response time.', '# TYPE sentinel_service_response_time_seconds gauge');
    for (const { stack, def, svc } of rows) if (svc.lastLatencyMs != null) L.push(`sentinel_service_response_time_seconds{${lab(stack, def)}} ${(svc.lastLatencyMs / 1000).toFixed(4)}`);
    L.push('# HELP sentinel_service_health_checks_total Health checks by result.', '# TYPE sentinel_service_health_checks_total counter');
    for (const { stack, def, svc } of rows) for (const r of ['ok', 'degraded', 'failed']) L.push(`sentinel_service_health_checks_total{${lab(stack, def)},result="${r}"} ${svc.counts[r]}`);
    L.push('# HELP sentinel_service_failures_total Failed health checks.', '# TYPE sentinel_service_failures_total counter');
    for (const { stack, def, svc } of rows) L.push(`sentinel_service_failures_total{${lab(stack, def)}} ${svc.failureCount}`);
    L.push('# HELP sentinel_service_outages_total Times the service was declared DOWN.', '# TYPE sentinel_service_outages_total counter');
    for (const { stack, def, svc } of rows) L.push(`sentinel_service_outages_total{${lab(stack, def)}} ${svc.outages}`);
    L.push('# HELP sentinel_service_restarts_total Process restarts observed for the service.', '# TYPE sentinel_service_restarts_total counter');
    for (const { stack, def, svc } of rows) L.push(`sentinel_service_restarts_total{${lab(stack, def)}} ${svc.restartCount}`);
    L.push('# HELP sentinel_service_open_incidents Open Docker incidents per service.', '# TYPE sentinel_service_open_incidents gauge');
    for (const { stack, def, svc } of rows) L.push(`sentinel_service_open_incidents{${lab(stack, def)}} ${db.incidents.filter(i => i.source === 'docker' && i.serviceId === svc.id && i.status === 'open').length}`);
    L.push('# HELP sentinel_recovery_actions_total Recovery restarts approved through Sentinel.', '# TYPE sentinel_recovery_actions_total counter');
    L.push(`sentinel_recovery_actions_total{result="success"} ${state.recoveryActions.success}`, `sentinel_recovery_actions_total{result="failed"} ${state.recoveryActions.failed}`);
    L.push('# HELP sentinel_recovery_controller_up 1 when the Recovery Controller answered its last request.', '# TYPE sentinel_recovery_controller_up gauge');
    L.push(`sentinel_recovery_controller_up ${controllerStatus.reachable ? 1 : 0}`);
    return `${L.join('\n')}\n`;
  }

  return { start, provisionWorkspace, onManualResolve, projectChecks, checkProjectNow, metricsText, config: cfg, _internals: { state, checkService, cycle, defs } };
}

module.exports = { createDockerMonitor };
