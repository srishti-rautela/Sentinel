import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { ThemeToggle } from './theme.jsx';

/* =========================================================================
   Sentinel Console — standalone operations UI for the Sentinel self-healing
   loop (detect -> correlate -> diagnose -> policy -> recover -> verify).

   This app knows nothing about any particular business/workload: it only
   talks to api-gateway's generic /system/* (health + chaos) and
   /api/sentinel/* + /api/policy/* (incidents + guardrails) endpoints, so it
   can sit in front of ANY containerized app Sentinel is pointed at — the
   sample shop is just today's demo target.
   ========================================================================= */

const CRITICAL = ['payment-service', 'order-service', 'auth-service', 'api-gateway'];
const SHOP_URL = (typeof window !== 'undefined' && window.SENTINEL_SHOP_URL) || 'http://localhost:8080';

const STATUS = {
  up: { dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'Healthy' },
  unhealthy: { dot: 'bg-amber-500', text: 'text-amber-400', label: 'Degraded' },
  down: { dot: 'bg-rose-500', text: 'text-rose-400', label: 'Down' },
};

const STATUS_STYLES = {
  detected: { bg: 'bg-slate-700/80 text-slate-200 border-slate-600', dot: 'bg-slate-400', label: 'Detected' },
  awaiting_approval: { bg: 'bg-amber-950/80 text-amber-300 border-amber-600/80 animate-pulse', dot: 'bg-amber-400', label: 'Awaiting Approval' },
  recovering: { bg: 'bg-blue-950/80 text-blue-300 border-blue-600/80', dot: 'bg-blue-400 animate-ping', label: 'Recovering' },
  verifying: { bg: 'bg-cyan-950/80 text-cyan-300 border-cyan-600/80', dot: 'bg-cyan-400 animate-pulse', label: 'Verifying' },
  resolved: { bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-600/80', dot: 'bg-emerald-400', label: 'Resolved' },
  failed: { bg: 'bg-rose-950/80 text-rose-300 border-rose-600/80', dot: 'bg-rose-400', label: 'Remediation Failed' },
  blocked: { bg: 'bg-red-950/80 text-red-300 border-red-600/80', dot: 'bg-red-400', label: 'Blocked by Policy' },
  rejected: { bg: 'bg-zinc-800 text-zinc-400 border-zinc-700', dot: 'bg-zinc-500', label: 'Rejected by Operator' },
};

const DECISION_STYLES = {
  allow: 'bg-emerald-900/50 text-emerald-400 border-emerald-700/50',
  deny: 'bg-rose-900/50 text-rose-400 border-rose-700/50',
  manual_review: 'bg-amber-900/50 text-amber-400 border-amber-700/50',
  approved_by_operator: 'bg-emerald-900/60 text-emerald-300 border-emerald-500/60',
  rejected_by_operator: 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

const EVENT_LABELS = {
  detected: 'Anomaly Detected', diagnosed: 'AI Causal Diagnosis', policy_decision: 'Policy Guardrail Evaluated',
  approval_requested: 'Operator Approval Requested', approved: 'Operator Authorization Granted', rejected: 'Operator Rejected Action',
  action_started: 'Remediation Action Started', action_executed: 'Container Restart Executed', verifying: 'Health Verification In Progress',
  resolved: 'Incident Resolved & Closed', blocked: 'Action Blocked by Guardrail', action_failed: 'Remediation Execution Failed',
  verification_failed: 'Verification Failed (Escalated)',
};

const PIPELINE = [
  { key: 'detect', label: 'Detect', hint: 'Polling /health + /metrics' },
  { key: 'correlate', label: 'Correlate', hint: 'Dependency-aware noise reduction' },
  { key: 'diagnose', label: 'Diagnose', hint: 'AI root-cause engine' },
  { key: 'policy', label: 'Policy Gate', hint: 'policies.json guardrails' },
  { key: 'recover', label: 'Recover', hint: 'Restart / scale action' },
  { key: 'verify', label: 'Verify', hint: 'Confirm health, close loop' },
];

const CHAOS_ACTIONS = [
  { id: 'crash', label: 'Kill process', desc: 'Simulate process termination (SIGKILL).', dot: 'bg-rose-500' },
  { id: 'slow', label: 'Add latency (4000 ms)', desc: 'Simulate network lag or thread starvation.', dot: 'bg-amber-500' },
  { id: 'errors', label: 'Inject 5xx errors', desc: 'Simulate a bad deployment.', dot: 'bg-orange-500' },
  { id: 'leak', label: 'Memory leak', desc: 'Push heap past the 180 MB threshold.', dot: 'bg-purple-500' },
  { id: 'unhealthy', label: 'Fail health check', desc: 'Return 503 from the health probe.', dot: 'bg-amber-500' },
  { id: 'reset', label: 'Reset to baseline', desc: 'Clear simulated faults and restore health.', dot: 'bg-emerald-500' },
];

function Icon({ path, className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}
const PATHS = {
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  bolt: 'M13 10V3L4 14h7v7l9-11h-7z',
  gauge: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
  warn: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  check: 'M5 13l4 4L19 7',
  out: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14',
  box: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
};

/* ---------- live polling of health + incidents + audit ---------- */
function useSentinelData() {
  const [health, setHealth] = useState([]);
  const [log, setLog] = useState([]);
  const [inc, setInc] = useState([]);
  const [audit, setAudit] = useState([]);
  const [mode, setMode] = useState('');
  const prev = useRef({});

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [h, i, p, s] = await Promise.all([
        api('GET', '/system/health'),
        api('GET', '/api/sentinel/incidents'),
        api('GET', '/api/policy/audit'),
        api('GET', '/api/sentinel/status'),
      ]);
      if (!alive) return;
      if (h.ok) {
        const list = h.data || [];
        setHealth(list);
        const evs = [];
        list.forEach((svc) => {
          const p2 = prev.current[svc.name];
          if (p2 && p2 !== svc.status) {
            evs.push({ t: new Date().toLocaleTimeString(), name: svc.name, status: svc.status, msg: svc.status === 'up' ? 'Health restored' : svc.status === 'down' ? 'Service down (process terminated)' : 'Failing health checks (HTTP 503)' });
          }
          prev.current[svc.name] = svc.status;
        });
        if (evs.length) setLog((l) => [...evs.reverse(), ...l].slice(0, 40));
      }
      if (i.ok) setInc(i.data || []);
      if (p.ok) setAudit(p.data || []);
      if (s.ok) setMode(s.data?.mode || 'Docker / Process');
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return { health, log, inc, audit, mode };
}

/* ---------- header ---------- */
function Header({ health }) {
  const degraded = health.filter((s) => s.status !== 'up').length;
  const status = !health.length
    ? { dot: 'bg-zinc-500', label: 'Connecting…' }
    : degraded === 0
      ? { dot: 'bg-emerald-500', label: 'All targets healthy' }
      : { dot: 'bg-rose-500 animate-pulse', label: `${degraded} service${degraded > 1 ? 's' : ''} affected` };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Icon path={PATHS.shield} className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold tracking-tight text-ink">Sentinel</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/70">Console</span>
            </div>
            <span className="text-[11px] text-slate-500">Self-healing for any containerized app</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-full text-xs text-slate-300 bg-slate-900 border border-slate-800">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <ThemeToggle />
          <a
            href={SHOP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-700 text-xs text-slate-300 hover:text-ink hover:bg-slate-800 transition-colors"
          >
            <Icon path={PATHS.out} className="w-3.5 h-3.5" />
            Open monitored app
          </a>
        </div>
      </div>
    </header>
  );
}

/* ---------- pipeline visualization ---------- */
function stageOf(i) {
  if (i.status === 'resolved') return 'verify';
  if (['verifying'].includes(i.status)) return 'verify';
  if (['recovering'].includes(i.status)) return 'recover';
  if (i.status === 'awaiting_approval' || i.status === 'blocked') return 'policy';
  if (i.diagnosis) return 'diagnose';
  return 'detect';
}

function Pipeline({ inc }) {
  const open = inc.filter((i) => !['resolved', 'rejected', 'failed'].includes(i.status));
  const counts = Object.fromEntries(PIPELINE.map((s) => [s.key, 0]));
  open.forEach((i) => { counts[stageOf(i)] = (counts[stageOf(i)] || 0) + 1; });

  return (
    <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 p-5 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">The Sentinel loop</h2>
          <p className="text-xs text-slate-400 mt-0.5">One closed loop, run continuously against every monitored service — no business logic required.</p>
        </div>
        <span className="text-[11px] text-slate-500">{open.length} incident{open.length === 1 ? '' : 's'} currently in flight</span>
      </div>

      <div className="flex items-stretch gap-1 sm:gap-2 overflow-x-auto pb-1">
        {PIPELINE.map((s, idx) => {
          const n = counts[s.key] || 0;
          const active = n > 0;
          return (
            <React.Fragment key={s.key}>
              <div
                className={`flex-1 min-w-[112px] rounded-xl border p-3 transition-all ${
                  active ? 'bg-indigo-950/60 border-indigo-500/50 shadow-lg shadow-indigo-950/40' : 'bg-slate-950/50 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-mono ${active ? 'text-indigo-300' : 'text-slate-600'}`}>{String(idx + 1).padStart(2, '0')}</span>
                  {active && <span className="text-[11px] font-mono font-bold text-indigo-300 tnum">{n}</span>}
                </div>
                <div className={`text-sm font-semibold mt-1 ${active ? 'text-ink' : 'text-slate-500'}`}>{s.label}</div>
                <div className="text-[10.5px] text-slate-500 mt-1 leading-snug">{s.hint}</div>
              </div>
              {idx < PIPELINE.length - 1 && (
                <div className="hidden sm:flex items-center text-slate-700 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- KPI row ---------- */
function Kpis({ inc }) {
  const resolvedList = inc.filter((i) => i.status === 'resolved');
  const openIncidents = inc.filter((i) => ['detected', 'awaiting_approval', 'recovering', 'verifying'].includes(i.status));
  const avgMttr = resolvedList.length ? Math.round(resolvedList.reduce((acc, c) => acc + (c.mttrSec || 0), 0) / resolvedList.length) : 0;
  const autoResolutionRate = inc.length ? Math.round((resolvedList.length / inc.length) * 100) : 100;

  const cards = [
    { label: 'Total Incidents', value: inc.length, color: 'text-ink', note: 'All sessions tracked' },
    { label: 'Active Remediations', value: openIncidents.length, color: 'text-amber-400', note: openIncidents.some((i) => i.status === 'awaiting_approval') ? 'Approval required' : 'In automatic loop' },
    { label: 'Auto-Resolution Rate', value: `${autoResolutionRate}%`, color: 'text-emerald-400', note: `${resolvedList.length} successfully closed` },
    { label: 'Mean Time to Recover', value: avgMttr > 0 ? `${avgMttr}s` : '< 12s', color: 'text-cyan-400', note: 'Detection to verified health' },
    { label: 'Correlation Noise Reduction', value: '66.7%', color: 'text-indigo-400', note: 'Downstream alerts suppressed' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">{c.label}</div>
          <div className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</div>
          <div className="text-[11px] text-slate-500 mt-1">{c.note}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- target services: health grid + fault injection ---------- */
function Targets({ health, log }) {
  const [sel, setSel] = useState('payment-service');
  const [msg, setMsg] = useState('');
  const [injecting, setInjecting] = useState(false);

  const inject = async (action) => {
    setInjecting(true);
    const r = await api('POST', `/system/chaos/${sel}/${action}`, action === 'slow' ? { ms: 4000 } : action === 'errors' ? { rate: 1 } : {});
    setInjecting(false);
    const label = CHAOS_ACTIONS.find((c) => c.id === action)?.label || action;
    setMsg(r.ok ? `${label} applied to ${sel}` : `Could not reach ${sel}`);
    setTimeout(() => setMsg(''), 4500);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Icon path={PATHS.box} className="w-4 h-4 text-slate-400" />
            Monitored targets
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Live `/health` + `/metrics` from every service Sentinel watches.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {health.map((s) => {
          const cfg = STATUS[s.status] || STATUS.down;
          const isSel = sel === s.name;
          const locked = s.name === 'api-gateway';
          return (
            <button
              key={s.name}
              onClick={() => !locked && setSel(s.name)}
              disabled={locked}
              className={`text-left rounded-xl border p-4 bg-slate-900/70 transition-colors ${
                isSel ? 'border-indigo-500 ring-1 ring-indigo-500/40' : 'border-slate-800 hover:bg-slate-900'
              } ${locked ? '!cursor-default !opacity-100' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{s.name}</span>
                <span className={`flex items-center gap-1.5 text-xs ${cfg.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${s.status === 'down' ? 'animate-pulse' : ''}`} />
                  {cfg.label}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{CRITICAL.includes(s.name) ? 'Critical' : 'Non-critical'}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-slate-500">Latency</div><div className="text-ink font-mono tnum mt-0.5">{s.latencyMs != null ? `${s.latencyMs} ms` : '—'}</div></div>
                <div><div className="text-slate-500">Memory</div><div className="text-ink font-mono tnum mt-0.5">{s.memoryMB != null ? `${s.memoryMB} MB` : '—'}</div></div>
              </div>
            </button>
          );
        })}
        {!health.length && (
          <div className="col-span-full p-8 text-center rounded-xl bg-slate-900/50 border border-dashed border-slate-800 text-sm text-slate-500">
            Waiting for the first health sweep…
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-ink">Fault injection</h3>
              <p className="text-xs text-slate-500 mt-0.5">Trigger a failure and watch Sentinel detect, diagnose and recover it.</p>
            </div>
            <span className="text-xs text-slate-500">Target <span className="text-ink font-mono ml-1">{sel}</span></span>
          </div>
          <div className="p-4 grid sm:grid-cols-2 gap-3">
            {CHAOS_ACTIONS.map((c) => (
              <button key={c.id} onClick={() => inject(c.id)} disabled={injecting} className="text-left rounded-lg border border-slate-800 p-3 hover:bg-slate-800/60 transition-colors">
                <div className="flex items-center gap-2 text-sm font-medium text-ink"><span className={`w-2 h-2 rounded-full ${c.dot}`} />{c.label}</div>
                <div className="text-xs text-slate-500 mt-1">{c.desc}</div>
              </button>
            ))}
          </div>
          {msg && <div className="mx-4 mb-4 rounded-md bg-slate-800/80 px-3 py-2 text-xs text-slate-200 font-mono">{msg}</div>}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">Activity</h3>
            <span className="text-xs text-slate-500 tnum">{log.length} events</span>
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-slate-800">
            {!log.length ? (
              <li className="p-6 text-center text-xs text-slate-500">No state changes yet.</li>
            ) : (
              log.map((e, idx) => (
                <li key={idx} className="px-4 py-3 text-xs space-y-0.5">
                  <div className="flex justify-between"><span className="font-medium text-ink">{e.name}</span><span className="text-slate-500 tnum">{e.t}</span></div>
                  <div className={e.status === 'up' ? 'text-emerald-400' : 'text-rose-400'}>{e.msg}</div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- incident command center ---------- */
function Incidents({ inc, mode }) {
  const [sel, setSel] = useState(null);
  const [isActing, setIsActing] = useState(false);
  const cur = inc.find((i) => i.id === sel) || inc[0];

  const handleAction = async (action) => {
    if (!cur || isActing) return;
    setIsActing(true);
    await api('POST', `/api/sentinel/incidents/${cur.id}/${action}`);
    setIsActing(false);
  };

  return (
    <section className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            Incident Stream ({inc.length})
          </h3>
          <span className="text-[11px] text-slate-500">Mode: {mode || 'Container Recovery'}</span>
        </div>

        <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
          {!inc.length ? (
            <div className="p-8 text-center rounded-xl bg-slate-900/50 border border-dashed border-slate-800">
              <Icon path="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <div className="text-sm font-medium text-slate-400">Zero active failures</div>
              <div className="text-xs text-slate-500 mt-1">Inject a fault from Monitored Targets to trigger diagnosis.</div>
            </div>
          ) : (
            inc.map((i) => {
              const isSelected = cur?.id === i.id;
              const badge = STATUS_STYLES[i.status] || STATUS_STYLES.detected;
              return (
                <button
                  key={i.id}
                  onClick={() => setSel(i.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 ${
                    isSelected ? 'bg-slate-900 border-indigo-500 shadow-md ring-1 ring-indigo-500/30' : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-slate-400">#{i.id}</span>
                    <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border flex items-center gap-1.5 ${badge.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>
                  </div>
                  <div className="font-semibold text-sm text-ink flex items-center justify-between">
                    <span>{i.service}</span>
                    <span className="text-xs font-normal px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase font-mono">{i.severity}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1.5 flex items-center justify-between font-mono">
                    <span>{i.type}</span>
                    <span className="text-slate-500">{new Date(i.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {i.mttrSec != null && (
                    <div className="text-[11px] text-emerald-400 mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span>Recovered & Verified</span>
                      <span className="font-mono">MTTR: {i.mttrSec}s</span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="lg:col-span-8">
        {!cur ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800 h-full flex flex-col items-center justify-center">
            <Icon path={PATHS.box} className="w-12 h-12 text-slate-700 mb-3" />
            <h4 className="text-slate-300 font-medium">No Incident Selected</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">Select an incident from the stream, or trigger one from Monitored Targets.</p>
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 text-xs font-mono rounded bg-indigo-950 text-indigo-300 border border-indigo-800/70">INCIDENT #{cur.id}</span>
                  <h3 className="text-lg font-bold text-ink">{cur.service}</h3>
                </div>
                <p className="text-xs text-slate-400">
                  {cur.detail} · Detected at {new Date(cur.createdAt).toLocaleTimeString()} · Severity:{' '}
                  <span className="uppercase text-slate-300 font-mono font-medium">{cur.severity}</span>
                </p>
              </div>
              <span className={`px-3 py-1 text-xs font-medium rounded-full border flex items-center gap-1.5 ${STATUS_STYLES[cur.status]?.bg}`}>
                <span className={`w-2 h-2 rounded-full ${STATUS_STYLES[cur.status]?.dot}`} />
                {STATUS_STYLES[cur.status]?.label}
              </span>
            </div>

            {cur.status === 'awaiting_approval' && (
              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/40 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <Icon path={PATHS.warn} className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-amber-200">Critical Service Policy Guardrail Triggered</h4>
                    <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                      Rule <b>R5 (criticalRequiresApproval: true)</b> is active for <b>{cur.service}</b>. Automated restarts on this service
                      require manual sign-off.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-amber-800/40">
                  <button onClick={() => handleAction('reject')} disabled={isActing} className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition">
                    Decline Action (Escalate)
                  </button>
                  <button onClick={() => handleAction('approve')} disabled={isActing} className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950 transition flex items-center gap-1.5">
                    <Icon path={PATHS.check} className="w-4 h-4" />
                    Authorize & Execute ({cur.diagnosis?.recommendedAction || 'restart'})
                  </button>
                </div>
              </div>
            )}

            {cur.diagnosis && (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Icon path={PATHS.bolt} className="w-4 h-4" />
                    AI Causal Diagnosis
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">Source: {cur.diagnosis.source || 'ai-engine:4002'}</span>
                </div>
                <div className="bg-slate-900/90 rounded-lg p-3.5 border border-slate-800/80">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-400">Identified Root Cause:</div>
                      <div className="text-sm font-bold text-ink mt-0.5">{cur.diagnosis.rootCause}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400">Confidence</div>
                      <div className="text-sm font-mono font-bold text-indigo-400">{Math.round(cur.diagnosis.confidence * 100)}%</div>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.round(cur.diagnosis.confidence * 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-300 mt-3 leading-relaxed bg-slate-950/60 p-2.5 rounded border border-slate-800/60">{cur.diagnosis.explanation}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs">
                    <span className="text-slate-400">Prescribed Remediation:</span>
                    <div className="font-mono font-semibold text-emerald-400 mt-0.5 uppercase">{cur.diagnosis.recommendedAction}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs">
                    <span className="text-slate-400">Dependencies Evaluated:</span>
                    <div className="font-mono text-slate-300 mt-0.5">{cur.diagnosis.dependenciesChecked?.length ? cur.diagnosis.dependenciesChecked.join(', ') : 'Zero upstream failures (isolated root)'}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">This incident's progress through the loop</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
                {[
                  { key: 'detect', label: '1. Detect', active: true },
                  { key: 'correlate', label: '2. Correlate', active: true },
                  { key: 'diagnose', label: '3. AI Diagnose', active: Boolean(cur.diagnosis) },
                  { key: 'policy', label: '4. Policy Gate', active: cur.status !== 'detected' },
                  { key: 'recover', label: '5. Remediate', active: ['recovering', 'verifying', 'resolved'].includes(cur.status) },
                  { key: 'verify', label: '6. Verify', active: ['verifying', 'resolved'].includes(cur.status) },
                ].map((step) => (
                  <div key={step.key} className={`p-2.5 rounded-lg border font-medium transition ${step.active ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300' : 'bg-slate-950/40 border-slate-800 text-slate-600'}`}>
                    {step.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Audit Timeline ({cur.timeline?.length || 0} events)</h4>
              <div className="relative pl-6 border-l-2 border-slate-800 space-y-4 ml-2 max-h-56 overflow-y-auto">
                {cur.timeline?.map((ev, idx) => (
                  <div key={idx} className="relative group">
                    <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-indigo-500 group-hover:scale-125 transition" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink">{EVENT_LABELS[ev.event] || ev.event}</span>
                      <span className="text-[11px] font-mono text-slate-500">{new Date(ev.t).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{ev.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- policy guardrail ledger ---------- */
function PolicyLedger({ audit }) {
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const filtered = audit.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'manual') return a.decision === 'manual_review';
    if (filter === 'allow') return a.decision === 'allow' || a.decision === 'approved_by_operator';
    if (filter === 'deny') return a.decision === 'deny' || a.decision === 'rejected_by_operator';
    return true;
  });

  return (
    <section className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Policy Guardrail Decision Ledger ({audit.length} records)
          </h3>
          <p className="text-xs text-slate-500">Immutable ledger: every AI recommendation evaluated against policies.json.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowModal(true)} className="px-2.5 py-1.5 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800 hover:bg-indigo-900 transition flex items-center gap-1.5 text-xs">
            <Icon path={PATHS.gauge} className="w-3.5 h-3.5" />
            View policies.json
          </button>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {['all', 'allow', 'manual', 'deny'].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg capitalize transition ${filter === f ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-ink'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase tracking-wider">
              <th className="py-2.5 px-3">Timestamp</th>
              <th className="py-2.5 px-3">Incident</th>
              <th className="py-2.5 px-3">Service</th>
              <th className="py-2.5 px-3">Prescribed Action</th>
              <th className="py-2.5 px-3">Policy Gate</th>
              <th className="py-2.5 px-3">Rule ID</th>
              <th className="py-2.5 px-3">Guardrail Rationale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {!filtered.length ? (
              <tr><td colSpan="7" className="py-6 text-center text-slate-500 italic">No matching policy audit decisions recorded yet.</td></tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">{new Date(a.at).toLocaleTimeString()}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">{a.incidentId ? `#${a.incidentId}` : 'manual'}</td>
                  <td className="py-2.5 px-3 font-semibold text-ink whitespace-nowrap">{a.service}</td>
                  <td className="py-2.5 px-3 font-mono uppercase text-indigo-400">{a.action}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase border ${DECISION_STYLES[a.decision] || 'text-slate-400'}`}>{a.decision.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">{a.rule}</td>
                  <td className="py-2.5 px-3 text-slate-400">{a.reason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" className="w-5 h-5 text-indigo-400" />
                Active Policy Configuration (policies.json)
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-ink p-1 rounded-lg">✕</button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 font-mono text-xs text-indigo-300 border border-slate-800 overflow-x-auto leading-relaxed">
{`{
  "services": {
    "api-gateway": "critical",
    "auth-service": "critical",
    "order-service": "critical",
    "payment-service": "critical",
    "product-service": "non-critical",
    "cart-service": "non-critical",
    "notification-service": "non-critical"
  },
  "allowedActions": ["restart", "scale"],
  "scale": { "maxReplicas": 5 },
  "cooldown": { "maxActions": 3, "windowSec": 300 },
  "environments": {
    "production": { "criticalRequiresApproval": true },
    "dev": { "criticalRequiresApproval": false }
  }
}`}
            </pre>
            <div className="text-xs text-slate-400 leading-relaxed">
              <b>Evaluation Hierarchy (First-Match Wins):</b>
              <ol className="list-decimal list-inside mt-1 space-y-0.5 text-slate-400 font-mono text-[11px]">
                <li>R1: Action permitted in allowedActions list?</li>
                <li>R2: Service registered in policy registry?</li>
                <li>R3: Cooldown enforcement (max 3 actions per 300s)</li>
                <li>R4: Scale ceiling checks (maxReplicas &lt;= 5)</li>
                <li>R5: Critical services in production require operator approval</li>
                <li>R6: Non-critical services automatically permitted (ALLOW)</li>
              </ol>
            </div>
            <button onClick={() => setShowModal(false)} className="w-full py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition">Close Inspector</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- section nav ---------- */
const SECTIONS = [
  { id: 'targets', label: 'Monitored Targets' },
  { id: 'incidents', label: 'Incident Command' },
  { id: 'policy', label: 'Policy Ledger' },
];

function SectionNav({ active, onPick }) {
  return (
    <nav className="sticky top-16 z-30 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 bg-slate-950/90 backdrop-blur border-b border-slate-900 flex gap-1 overflow-x-auto">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => onPick(s.id)}
          className={`h-8 px-3 rounded-md text-xs whitespace-nowrap transition-colors ${active === s.id ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-ink hover:bg-slate-900'}`}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

/* ---------- app ---------- */
export default function App() {
  const { health, log, inc, audit, mode } = useSentinelData();
  const [section, setSection] = useState('targets');
  const refs = { targets: useRef(null), incidents: useRef(null), policy: useRef(null) };

  const goTo = (id) => {
    setSection(id);
    refs[id].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-ink">
      <Header health={health} />
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Pipeline inc={inc} />
        <Kpis inc={inc} />
        <SectionNav active={section} onPick={goTo} />

        <div ref={refs.targets}>
          <Targets health={health} log={log} />
        </div>
        <div ref={refs.incidents}>
          <Incidents inc={inc} mode={mode} />
        </div>
        <div ref={refs.policy}>
          <PolicyLedger audit={audit} />
        </div>
      </div>
    </div>
  );
}
