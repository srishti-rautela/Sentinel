import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Clock3, ExternalLink, FileText, Layers, Play, RefreshCw, RotateCcw, ShieldCheck, Square, X } from 'lucide-react';

const API = '/api';
async function req(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status})`), { data });
  return data;
}
const fmt = v => (v ? new Date(v).toLocaleString() : '—');
const fmtTime = v => (v ? new Date(v).toLocaleTimeString() : '—');
const ms = v => (v == null ? '—' : `${v} ms`);
const dur = v => { if (v == null) return '—'; const s = Math.round(v / 1000); if (s < 60) return `${s}s`; const m = Math.floor(s / 60); return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const KIND = { HEALTHY: 'healthy', DEGRADED: 'degraded', DOWN: 'unhealthy', RECOVERING: 'pending', UNKNOWN: 'pending' };

export function SvcStatus({ status }) {
  return <span className={`status status-${KIND[status] || 'pending'} svc-${String(status || 'UNKNOWN').toLowerCase()}`}><span className="status-dot" />{status || 'UNKNOWN'}</span>;
}
export function SourceBadge({ source }) {
  return <span className={`source-badge ${source === 'docker' ? 'docker' : 'url'}`}>{source === 'docker' ? 'Docker service' : 'Public URL'}</span>;
}

function usePolling(load, intervalMs, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true, at: null });
  const loadRef = useRef(load); loadRef.current = load;
  const run = useCallback(async () => {
    try { const data = await loadRef.current(); setState({ data, error: '', loading: false, at: new Date() }); }
    catch (e) { setState(s => ({ ...s, error: e.message, loading: false })); }
  }, []);
  useEffect(() => { setState(s => ({ ...s, loading: true })); run(); const t = setInterval(run, intervalMs); return () => clearInterval(t); }, [run, intervalMs, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: run };
}

function Sparkline({ points }) {
  if (!points?.length) return <div className="history-empty short">No successful checks recorded yet.</div>;
  const max = Math.max(1, ...points.map(p => p.ms));
  const xs = points.map((p, i) => (points.length < 2 ? 50 : 4 + (i / (points.length - 1)) * 92));
  const ys = points.map(p => 92 - (p.ms / max) * 76);
  return <div className="svc-spark"><div className="chart-y-labels"><span>{max} ms</span><span>0 ms</span></div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Response time history"><line x1="3" y1="16" x2="97" y2="16" /><line x1="3" y1="92" x2="97" y2="92" />{points.length > 1 && <polyline className="chart-line" points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')} />}{points.map((p, i) => <circle key={i} cx={xs[i]} cy={ys[i]} r="1.2" className="chart-point healthy" />)}</svg>
    <div className="chart-x-labels"><span>{fmtTime(points[0].at)}</span><span>{fmtTime(points[points.length - 1].at)}</span></div></div>;
}

// ───────────────────────── Services page ─────────────────────────
function ServiceRow({ s, busy, onDetails, onLogs, onAction, onCheck }) {
  const down = s.status === 'DOWN';
  return <div className={`svc-row ${down ? 'is-down' : ''}`}>
    <div className="svc-name"><b>{s.name}</b><span>{s.containerName} · {s.type}</span></div>
    <div><SvcStatus status={s.status} />{s.statusSince && <small className="svc-sub">since {fmtTime(s.statusSince)}</small>}</div>
    <div className="svc-endpoint" title={s.healthEndpoint}><code>{s.healthEndpoint.replace(/^https?:\/\//, '')}</code>{s.lastCheckResult && s.status !== 'HEALTHY' && <small className="svc-sub err">{s.lastCheckResult.message}</small>}</div>
    <div className="svc-num">{ms(s.responseTimeMs)}<small className="svc-sub">{fmtTime(s.lastCheckAt)}</small></div>
    <div className="svc-num">{s.uptimePercent == null ? '—' : `${s.uptimePercent}%`}<small className="svc-sub">{s.totalChecks} checks</small></div>
    <div className="svc-num">{s.failureCount}</div>
    <div className="svc-num">{s.openIncidents > 0 ? <span className="svc-pill-open">{s.openIncidents} open</span> : 0}</div>
    <div className="svc-num">{s.restartCount}</div>
    <div className="svc-actions">
      <button className="secondary-btn compact-btn" onClick={onDetails} title="View details"><Activity size={13} /> Details</button>
      <button className="secondary-btn compact-btn" onClick={onLogs} title="View logs"><FileText size={13} /> Logs</button>
      <button className="secondary-btn compact-btn" onClick={onCheck} disabled={busy} title="Run health check now"><RefreshCw size={13} /> Check</button>
      <button className="secondary-btn compact-btn danger" onClick={() => onAction('stop')} disabled={busy || (s.container && s.container.running === false)} title="Stop the container"><Square size={13} /> Stop</button>
      <button className="secondary-btn compact-btn" onClick={() => onAction(s.container && s.container.running === false ? 'start' : 'restart')} disabled={busy} title="Restart the container">{s.container && s.container.running === false ? <><Play size={13} /> Start</> : <><RotateCcw size={13} /> Restart</>}</button>
    </div>
  </div>;
}
function ServiceHead() {
  return <div className="svc-row svc-head"><span>SERVICE</span><span>STATUS</span><span>HEALTH ENDPOINT</span><span>RESPONSE</span><span>UPTIME</span><span>FAILURES</span><span>INCIDENTS</span><span>RESTARTS</span><span>CONTROLS</span></div>;
}

export function useServiceActions(token, onToast, reload) {
  const [busyId, setBusyId] = useState('');
  async function action(s, name) {
    if (name === 'stop' && !window.confirm(`Stop the ${s.containerName} container?\n\nThis really stops the Docker container. Sentinel should detect the failure and open an incident within ~10–15 seconds.`)) return;
    setBusyId(s.id);
    try {
      if (name === 'check') { await req(`/services/${encodeURIComponent(s.id)}/check`, token, { method: 'POST', body: '{}' }); onToast(`Health check completed for ${s.name}.`); }
      else { await req(`/services/${encodeURIComponent(s.id)}/${name}`, token, { method: 'POST', body: '{}' }); onToast(`${name[0].toUpperCase()}${name.slice(1)} issued for ${s.containerName}.`); }
      await reload();
    } catch (e) { onToast(e.message); } finally { setBusyId(''); }
  }
  return { busyId, action };
}

export function ServicesPage({ token, onToast, onOpenIncident, onOpenProject }) {
  const { data, error, loading, at, reload } = usePolling(() => req('/services', token), 5000, [token]);
  const [detail, setDetail] = useState(null); // { id, tab }
  const { busyId, action } = useServiceActions(token, onToast, reload);
  if (detail) return <ServiceDetail id={detail.id} initialTab={detail.tab} token={token} onBack={() => { setDetail(null); reload(); }} onOpenIncident={onOpenIncident} onToast={onToast} />;
  const services = data?.services || [];
  const count = k => services.filter(s => s.status === k).length;
  const ctl = data?.monitor?.controller;
  return <>
    <div className="page-heading"><div><div className="eyebrow">DOCKER MICROSERVICES</div><h1>Services</h1><p>Real health checks against every registered container over the internal Docker network. Stop one from here or with <code>docker compose stop products</code> — Sentinel detects both.</p></div>
      <div className="monitoring-heading-actions"><span className="svc-live"><span className="live-dot" /> Live · every 5s{at ? ` · ${fmtTime(at)}` : ''}</span><button className="secondary-btn" onClick={reload}><RefreshCw size={15} /> Refresh</button></div></div>
    {error && <div className="error-box"><AlertTriangle size={15} />{error}</div>}
    {loading && !data ? <section className="panel monitoring-empty"><h3>Loading services…</h3></section> : !services.length ? <section className="panel monitoring-empty"><div className="empty-icon"><Layers size={23} /></div><h3>No Docker services registered in this workspace</h3><p>The e-commerce stack is defined in <code>backend/service-registry.js</code>. Register it as a project in this workspace:</p><button className="primary-btn" onClick={async () => { try { await req('/stacks/tilda-goods/register', token, { method: 'POST', body: '{}' }); onToast('Tilda Goods E-commerce project registered.'); reload(); } catch (e) { onToast(e.message); } }}>Register Tilda Goods E-commerce</button></section> : <>
      <div className="svc-summary">
        <div className="svc-chip healthy"><b>{count('HEALTHY')}</b><span>Healthy</span></div>
        <div className="svc-chip degraded"><b>{count('DEGRADED') + count('RECOVERING')}</b><span>Degraded / recovering</span></div>
        <div className="svc-chip down"><b>{count('DOWN')}</b><span>Down</span></div>
        <div className="svc-chip"><b>{services.reduce((n, s) => n + s.openIncidents, 0)}</b><span>Open incidents</span></div>
        <div className="svc-chip wide"><span>Check every <b className="inline">{(data.monitor.intervalMs / 1000)}s</b> · DOWN after <b className="inline">{data.monitor.failureThreshold}</b> failures · healthy after <b className="inline">{data.monitor.recoveryThreshold}</b> passes</span><span className={`svc-ctl ${ctl?.reachable === false ? 'bad' : ctl?.reachable ? 'ok' : ''}`}>Recovery Controller: {ctl?.reachable == null ? 'not contacted yet' : ctl.reachable ? 'reachable' : `unreachable (${ctl.error})`}</span></div>
      </div>
      {(data.projects || []).map(p => <section className="panel svc-panel" key={p.id}>
        <div className="panel-head"><div><h2>{p.name}</h2><p>{services.filter(s => s.projectId === p.id).length} services · project status <b>{p.status}</b></p></div><button className="text-btn" onClick={() => onOpenProject(p.id)}>Open project <ExternalLink size={13} /></button></div>
        <div className="svc-scroll"><div className="svc-table"><ServiceHead />
          {services.filter(s => s.projectId === p.id).map(s => <ServiceRow key={s.id} s={s} busy={busyId === s.id} onDetails={() => setDetail({ id: s.id, tab: 'health' })} onLogs={() => setDetail({ id: s.id, tab: 'logs' })} onAction={n => action(s, n)} onCheck={() => action(s, 'check')} />)}
        </div></div>
      </section>)}
    </>}
  </>;
}

// ───────────────────────── Service details ─────────────────────────
const TABS = [['health', 'Health history'], ['logs', 'Logs'], ['events', 'Failures & restarts'], ['incidents', 'Related incidents']];
export function ServiceDetail({ id, initialTab = 'health', token, onBack, onOpenIncident, onToast }) {
  const [tab, setTab] = useState(initialTab);
  const { data, error, reload } = usePolling(() => req(`/services/${encodeURIComponent(id)}`, token), 5000, [id]);
  const { busyId, action } = useServiceActions(token, onToast, reload);
  const s = data?.service;
  return <>
    <div className="page-heading"><div><button className="text-btn back-link" onClick={onBack}><ArrowLeft size={14} /> All services</button><div className="eyebrow">SERVICE DETAILS</div><h1>{s?.name || 'Service'} {s && <SvcStatus status={s.status} />}</h1><p>{s ? `${s.containerName} · ${s.healthEndpoint}` : 'Loading…'}</p></div>
      {s && <div className="svc-actions"><button className="secondary-btn compact-btn" disabled={busyId === id} onClick={() => action(s, 'check')}><RefreshCw size={13} /> Run health check</button><button className="secondary-btn compact-btn danger" disabled={busyId === id || s.container?.running === false} onClick={() => action(s, 'stop')}><Square size={13} /> Stop</button><button className="secondary-btn compact-btn" disabled={busyId === id} onClick={() => action(s, s.container?.running === false ? 'start' : 'restart')}>{s.container?.running === false ? <><Play size={13} /> Start</> : <><RotateCcw size={13} /> Restart</>}</button></div>}</div>
    {error && <div className="error-box"><AlertTriangle size={15} />{error}</div>}
    {s && <>
      <div className="svc-facts">
        {[['Response time', ms(s.responseTimeMs)], ['Uptime', s.uptimePercent == null ? '—' : `${s.uptimePercent}%`], ['Health checks failed', s.failureCount], ['Outages', s.outages], ['Restarts observed', s.restartCount], ['Open incidents', s.openIncidents], ['Process uptime', s.processUptimeSeconds == null ? '—' : dur(s.processUptimeSeconds * 1000)], ['Container', s.container ? (s.container.running ? 'running' : (s.container.status || 'stopped')) : 'unknown']].map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>
      {s.status === 'DOWN' && <div className="error-box"><AlertTriangle size={15} /><span><b>{data.description}</b> Last error: {s.lastError}</span></div>}
      <div className="svc-tabs">{TABS.map(([k, label]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>)}</div>
      {tab === 'health' && <>
        <section className="panel svc-panel"><div className="panel-head"><div><h2>Response-time history</h2><p>Successful checks only.</p></div></div><div className="svc-body"><Sparkline points={data.responseTimes} /></div></section>
        <section className="panel svc-panel"><div className="panel-head"><div><h2>Health-check history</h2><p>Most recent first. Every row is a real HTTP probe.</p></div></div>
          <div className="svc-log-table"><div className="svc-hc head"><span>TIME</span><span>RESULT</span><span>HTTP</span><span>RESPONSE</span><span>STATUS AFTER</span><span>DETAIL</span></div>
            {data.checks.slice(0, 40).map((c, i) => <div className="svc-hc" key={i}><span>{fmt(c.at)}</span><span className={`res res-${c.result}`}>{c.result}</span><span>{c.httpStatus ?? '—'}</span><span>{ms(c.latencyMs)}</span><span><SvcStatus status={c.status} /></span><span className="history-message">{c.message}</span></div>)}</div></section></>}
      {tab === 'logs' && <ServiceLogs id={id} token={token} />}
      {tab === 'events' && <div className="svc-two">
        <section className="panel svc-panel"><div className="panel-head"><div><h2>Failure events</h2><p>{data.failures.length} recorded</p></div></div><EventList items={data.failures} empty="No failures recorded." /></section>
        <section className="panel svc-panel"><div className="panel-head"><div><h2>Restart history</h2><p>Process restarts detected from the health endpoint.</p></div></div><EventList items={data.restarts} empty="No restarts observed since monitoring began." /></section>
        <section className="panel svc-panel wide"><div className="panel-head"><div><h2>All events</h2><p>Status changes, operator actions and recovery.</p></div></div><EventList items={data.events} empty="No events yet." /></section></div>}
      {tab === 'incidents' && <section className="panel svc-panel"><div className="panel-head"><div><h2>Related incidents</h2><p>{data.incidents.length} for this service</p></div></div>
        {!data.incidents.length ? <div className="history-empty short">No incidents for this service.</div> : <div className="incident-list large">{data.incidents.map(i => <button key={i.id} className="svc-incident" onClick={() => onOpenIncident(i.id)}><b>{i.title}</b><span>{fmt(i.createdAt)} · {i.resolutionType ? i.resolutionType.replace(/_/g, ' ') : i.phase}</span><SvcIncStatus i={i} /></button>)}</div>}</section>}
    </>}
  </>;
}
function SvcIncStatus({ i }) { return <span className={`status ${i.status === 'open' ? 'status-unhealthy' : 'status-healthy'}`}><span className="status-dot" />{i.status === 'open' ? 'Open' : 'Resolved'}</span>; }
function EventList({ items, empty }) {
  if (!items?.length) return <div className="history-empty short">{empty}</div>;
  return <div className="svc-events">{items.map(e => <div key={e.id} className={`svc-event t-${e.type}`}><time>{fmt(e.at)}</time><span>{e.message}</span></div>)}</div>;
}
function ServiceLogs({ id, token }) {
  const [source, setSource] = useState('docker'); const [withGw, setWithGw] = useState(true);
  const { data, error, loading, reload } = usePolling(() => req(`/services/${encodeURIComponent(id)}/logs?tail=200&source=${source}${withGw ? '&include=gateway' : ''}`, token), 5000, [id, source, withGw]);
  const logs = (data?.logs || []).slice().reverse();
  return <section className="panel svc-panel"><div className="panel-head"><div><h2>Recent logs</h2><p>Structured JSON logs — timestamp, level, event, request ID, incident ID.</p></div>
    <div className="svc-log-tools"><select className="range-select" value={source} onChange={e => setSource(e.target.value)}><option value="docker">Live from container (via Recovery Controller)</option><option value="loki">From Loki (last hour)</option></select><label className="svc-check"><input type="checkbox" checked={withGw} onChange={e => setWithGw(e.target.checked)} /> Include gateway evidence</label><button className="secondary-btn compact-btn" onClick={reload}><RefreshCw size={13} /> Refresh</button></div></div>
    {error && <div className="error-box"><AlertTriangle size={15} />{error}</div>}
    {loading && !data ? <div className="history-empty short">Loading logs…</div> : !logs.length ? <div className="history-empty short">No log lines returned.</div> : <div className="svc-logs">{logs.map((l, i) => <div key={i} className={`svc-logline lv-${l.level}`}><time>{l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : ''}</time><b>{l.level}</b><i>{l.origin === 'api-gateway' ? 'gateway' : ''}</i><span>{l.event ? `${l.event}${l.message && l.message !== l.event ? ' — ' : ''}` : ''}{l.message && l.message !== l.event ? l.message : ''}{l.requestId ? <em> req:{String(l.requestId).slice(0, 12)}</em> : null}{l.incidentId ? <em> incident:{String(l.incidentId).slice(0, 8)}</em> : null}</span></div>)}</div>}</section>;
}

// ───────────────────────── Incident detail (with recovery workflow) ─────────────────────────
function Steps({ inc }) {
  const rec = inc.recovery || {}; const last = (rec.history || [])[(rec.history || []).length - 1];
  const resolved = inc.status === 'resolved'; const verified = resolved && inc.resolutionType !== 'manual';
  const steps = [
    { k: 'Failure detected', d: fmtTime(inc.firstDetectedAt), s: 'done' },
    { k: 'Incident opened', d: fmtTime(inc.createdAt), s: 'done' },
    { k: 'Restart approved', d: last ? fmtTime(last.requestedAt) : 'waiting for approval', s: last ? 'done' : (resolved ? 'skip' : 'active') },
    { k: 'Container restarted', d: last?.restartedAt ? fmtTime(last.restartedAt) : (rec.state === 'failed' ? 'failed' : '—'), s: last?.restartedAt ? 'done' : (rec.state === 'failed' ? 'fail' : (resolved ? 'skip' : (last ? 'active' : 'todo'))) },
    { k: 'Health verified', d: verified ? 'passed' : rec.state === 'verifying' ? 'checking…' : rec.state === 'failed' && last?.restartedAt ? 'not verified' : '—', s: verified ? 'done' : rec.state === 'verifying' ? 'active' : (rec.state === 'failed' && last?.restartedAt ? 'fail' : (resolved ? 'skip' : 'todo')) },
    { k: resolved ? (inc.resolutionType === 'manual' ? 'Resolved manually' : 'Resolved') : 'Resolved', d: resolved ? fmtTime(inc.resolvedAt) : '—', s: resolved ? 'done' : 'todo' }
  ];
  return <ol className="proc-steps">{steps.map((st, i) => <li key={i} className={`step-${st.s}`}><span className="step-dot">{st.s === 'done' ? <CheckCircle2 size={14} /> : st.s === 'fail' ? <X size={13} /> : i + 1}</span><b>{st.k}</b><small>{st.d}</small></li>)}</ol>;
}

export function IncidentModal({ id, token, onClose, onChanged, onToast }) {
  const { data, error, reload } = usePolling(() => req(`/incidents/${id}`, token), 3000, [id]);
  const [busy, setBusy] = useState('');
  const inc = data?.incident;
  async function run(kind) {
    if (kind === 'resolve' && !window.confirm('Resolve this incident manually?\n\nThis bypasses health verification and is recorded in the audit trail with your name.')) return;
    setBusy(kind);
    try {
      await req(`/incidents/${id}/${kind === 'approve' ? 'recover' : kind === 'retry' ? 'retry-recovery' : 'resolve'}`, token, { method: 'POST', body: '{}' });
      onToast(kind === 'resolve' ? 'Incident resolved manually (audited).' : 'Restart approved. Sentinel is verifying recovery…');
      await reload(); onChanged?.();
    } catch (e) { onToast(e.message); await reload(); } finally { setBusy(''); }
  }
  const rec = inc?.recovery; const inFlight = rec && ['requested', 'restarting', 'verifying'].includes(rec.state);
  const docker = inc?.source === 'docker';
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal inc-modal">
    <div className="modal-head"><div><div className="auth-kicker">INCIDENT {inc ? `· ${inc.id.slice(0, 8)}` : ''}</div><h2>{inc?.title || 'Incident'}</h2>{inc && <p className="muted"><SourceBadge source={inc.source} /> <SvcIncStatus i={inc} /> · severity <b>{inc.severity}</b>{inc.phase && docker ? ` · ${inc.phase.replace(/_/g, ' ')}` : ''}</p>}</div><button className="icon-btn" onClick={onClose}><X size={19} /></button></div>
    {error && <div className="error-box"><AlertTriangle size={15} />{error}</div>}
    {!inc ? <div className="history-empty short">Loading…</div> : <>
      <p className="inc-desc">{inc.description}</p>
      {docker && <Steps inc={inc} />}
      {docker && inc.status === 'open' && <div className="inc-actions">
        {(!rec || ['none', 'cancelled'].includes(rec.state)) && <button className="primary-btn" disabled={!!busy} onClick={() => run('approve')}><ShieldCheck size={16} /> {busy === 'approve' ? 'Approving…' : 'Approve Restart'}</button>}
        {rec?.state === 'failed' && <button className="primary-btn" disabled={!!busy} onClick={() => run('retry')}><RotateCcw size={16} /> Retry Recovery</button>}
        {inFlight && <span className="svc-ctl ok"><RefreshCw size={13} className="spin" /> {rec.state === 'verifying' ? `Verifying health — ${data.service?.consecutiveSuccesses ?? 0} consecutive passes so far` : 'Restarting container…'}</span>}
        <button className="secondary-btn" disabled={!!busy} onClick={() => run('resolve')}>Resolve manually (audited)</button>
        <small className="muted">The incident resolves automatically only after the service passes consecutive health checks. If the restart fails it stays open.</small>
      </div>}
      {!docker && inc.status === 'open' && <div className="inc-actions"><button className="secondary-btn" disabled={!!busy} onClick={() => run('resolve')}>Mark resolved</button></div>}
      {rec?.lastError && <div className="error-box"><AlertTriangle size={15} />{rec.lastError}</div>}
      <div className="inc-grid">
        {[['Incident ID', inc.id], ['Project', inc.projectName], ...(docker ? [['Service', inc.serviceName], ['Container', inc.containerName], ['Health endpoint', inc.healthEndpoint], ['Failed checks', inc.failedChecks]] : []), ['First detected', fmt(inc.firstDetectedAt || inc.createdAt)], ['Latest detected', fmt(inc.latestDetectedAt || inc.createdAt)], ['Resolved at', fmt(inc.resolvedAt)], ...(inc.status === 'resolved' ? [['Resolution', inc.resolutionType ? inc.resolutionType.replace(/_/g, ' ') : 'automatic'], ['Resolved by', inc.resolvedBy ? (inc.resolvedBy.email || inc.resolvedBy.name) : 'Sentinel'], ['Downtime', dur(inc.downtimeMs)]] : []), ...(docker && rec ? [['Recovery attempts', rec.attempts], ['Recovery duration', dur(rec.durationMs)], ['Restarts during incident', inc.restartsDuringIncident ?? '—']] : [])].map(([k, v]) => <div key={k}><span>{k}</span><b>{String(v)}</b></div>)}
      </div>
      {docker && <><h3 className="inc-h">Failure reason</h3><p className="inc-text">{inc.failureReason}</p><h3 className="inc-h">Customer impact</h3><p className="inc-text">{inc.impact}</p>
        {inc.recommendations?.length > 0 && <><h3 className="inc-h">Recovery recommendations</h3><ul className="inc-list">{inc.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
        {rec?.history?.length > 0 && <><h3 className="inc-h">Recovery attempts</h3><div className="svc-events">{rec.history.map(a => <div key={a.n} className={`svc-event t-${a.state === 'failed' ? 'failure' : 'status_change'}`}><time>{fmt(a.requestedAt)}</time><span>Attempt {a.n} by {a.requestedBy?.email} — <b>{a.state}</b>{a.error ? ` (${a.error})` : ''}{a.verifiedAt ? ` · verified ${fmtTime(a.verifiedAt)}` : ''}</span></div>)}</div></>}
        <h3 className="inc-h">Related health-check history</h3>
        {!data.relatedChecks?.length ? <div className="history-empty short">No checks in range.</div> : <div className="svc-log-table small"><div className="svc-hc head"><span>TIME</span><span>RESULT</span><span>HTTP</span><span>RESPONSE</span><span>STATUS AFTER</span><span>DETAIL</span></div>{data.relatedChecks.slice(0, 25).map((c, i) => <div className="svc-hc" key={i}><span>{fmtTime(c.at)}</span><span className={`res res-${c.result}`}>{c.result}</span><span>{c.httpStatus ?? '—'}</span><span>{ms(c.latencyMs)}</span><span><SvcStatus status={c.status} /></span><span className="history-message">{c.message}</span></div>)}</div>}
        <h3 className="inc-h">Incident timeline</h3>
        <div className="svc-events">{(inc.timeline || []).slice().reverse().map((t, i) => <div key={i} className={`svc-event t-${t.type}`}><time>{fmt(t.at)}</time><span>{t.message}{t.detail ? ` — ${t.detail}` : ''}</span></div>)}</div></>}
    </>}
  </div></div>;
}

// ───────────────────────── Project overview (Docker projects) ─────────────────────────
export function ProjectOverview({ projectId, token, onBack, onOpenIncident, onOpenService, onToast }) {
  const { data, error, reload } = usePolling(() => req(`/projects/${projectId}/overview`, token), 5000, [projectId]);
  const checks = usePolling(() => req(`/projects/${projectId}/checks`, token), 10000, [projectId]);
  const { busyId, action } = useServiceActions(token, onToast, reload);
  if (error && !data) return <><button className="text-btn back-link" onClick={onBack}><ArrowLeft size={14} /> My projects</button><div className="error-box"><AlertTriangle size={15} />{error}</div></>;
  if (!data) return <div className="history-empty">Loading project…</div>;
  const { project, stack, services, incidents, monitor } = data;
  const healthy = services.filter(s => s.status === 'HEALTHY').length; const lat = services.map(s => s.responseTimeMs).filter(v => v != null);
  const open = incidents.filter(i => i.status === 'open').length;
  return <>
    <div className="page-heading"><div><button className="text-btn back-link" onClick={onBack}><ArrowLeft size={14} /> My projects</button><div className="eyebrow">APPLICATION OVERVIEW</div><h1>{project.name}</h1><p>{project.description}</p></div>
      <div className="monitoring-heading-actions">{stack.storefrontUrl && <a className="secondary-btn" href={stack.storefrontUrl} target="_blank" rel="noreferrer">Open storefront <ExternalLink size={14} /></a>}<button className="secondary-btn" onClick={() => { reload(); checks.reload(); }}><RefreshCw size={15} /> Refresh</button></div></div>
    <div className="monitoring-summary">
      <div className="metric-card"><div className="metric-top"><span>Application status</span></div><div className="metric-value">{project.lastCheck?.status || 'pending'}</div><div className="metric-note">{project.lastCheck?.message || 'Waiting for first checks'}</div></div>
      <div className="metric-card"><div className="metric-top"><span>Services healthy</span></div><div className="metric-value">{healthy}/{services.length}</div><div className="metric-note">Real health-check results</div></div>
      <div className="metric-card"><div className="metric-top"><span>Avg. response</span></div><div className="metric-value">{lat.length ? `${Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)} ms` : '—'}</div><div className="metric-note">Across responding services</div></div>
      <div className="metric-card"><div className="metric-top"><span>Open incidents</span></div><div className="metric-value">{open}</div><div className="metric-note">Check every {monitor.intervalMs / 1000}s</div></div>
    </div>
    <section className="panel svc-panel"><div className="panel-head"><div><h2>Microservices</h2><p>Independent containers behind the API Gateway.</p></div></div>
      <div className="svc-scroll"><div className="svc-table"><ServiceHead />{services.map(s => <ServiceRow key={s.id} s={s} busy={busyId === s.id} onDetails={() => onOpenService(s.id, 'health')} onLogs={() => onOpenService(s.id, 'logs')} onAction={n => action(s, n)} onCheck={() => action(s, 'check')} />)}</div></div></section>
    <section className="panel svc-panel"><div className="panel-head"><div><h2>Related incidents</h2><p>{incidents.length} recorded for this project</p></div></div>
      {!incidents.length ? <div className="history-empty short">No incidents. Try <code>docker compose stop products</code>.</div> : <div className="incident-list large">{incidents.slice(0, 10).map(i => <button key={i.id} className="svc-incident" onClick={() => onOpenIncident(i.id)}><b>{i.title}</b><span>{fmt(i.createdAt)} · {i.resolutionType ? i.resolutionType.replace(/_/g, ' ') : (i.phase || '').replace(/_/g, ' ')}</span><SvcIncStatus i={i} /></button>)}</div>}</section>
    <section className="panel svc-panel"><div className="panel-head"><div><h2>Monitoring history</h2><p>Aggregate application health over time.</p></div></div>
      {!checks.data?.length ? <div className="history-empty short">History is collected from now on.</div> : <div className="history-table"><div className="history-table-head"><span>CHECKED AT</span><span>STATUS</span><span>HTTP</span><span>AVG RESPONSE</span><span>DETAILS</span></div>{checks.data.slice(0, 15).map(c => <div className="history-table-row" key={c.id}><span>{fmt(c.checkedAt)}</span><span><span className={`status status-${c.status}`}><span className="status-dot" />{c.status}</span></span><span>—</span><span>{ms(c.latencyMs)}</span><span className="history-message">{c.message}</span></div>)}</div>}</section>
  </>;
}
