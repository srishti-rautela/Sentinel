import React, { useEffect, useState } from 'react';
import { api } from './api.js';

// Status badge styles
const STATUS_STYLES = {
  detected: { bg: 'bg-slate-700/80 text-slate-200 border-slate-600', dot: 'bg-slate-400', label: 'Detected' },
  awaiting_approval: { bg: 'bg-amber-950/80 text-amber-300 border-amber-600/80 animate-pulse', dot: 'bg-amber-400', label: 'Awaiting Approval' },
  recovering: { bg: 'bg-blue-950/80 text-blue-300 border-blue-600/80', dot: 'bg-blue-400 animate-ping', label: 'Recovering' },
  verifying: { bg: 'bg-cyan-950/80 text-cyan-300 border-cyan-600/80', dot: 'bg-cyan-400 animate-pulse', label: 'Verifying (3 Checks)' },
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
  detected: 'Anomaly Detected',
  diagnosed: 'AI Causal Diagnosis',
  policy_decision: 'Policy Guardrail Evaluated',
  approval_requested: 'Operator Approval Requested',
  approved: 'Operator Authorization Granted',
  rejected: 'Operator Rejected Action',
  action_started: 'Remediation Action Started',
  action_executed: 'Container Restart Executed',
  verifying: 'Health Verification In Progress',
  resolved: 'Incident Resolved & Closed',
  blocked: 'Action Blocked by Guardrail',
  action_failed: 'Remediation Execution Failed',
  verification_failed: 'Verification Failed (Escalated)',
};

export default function Sentinel() {
  const [inc, setInc] = useState([]);
  const [audit, setAudit] = useState([]);
  const [mode, setMode] = useState('');
  const [sel, setSel] = useState(null);
  const [auditFilter, setAuditFilter] = useState('all');
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [isActing, setIsActing] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [i, p, s] = await Promise.all([
        api('GET', '/api/sentinel/incidents'),
        api('GET', '/api/policy/audit'),
        api('GET', '/api/sentinel/status'),
      ]);
      if (!alive) return;
      if (i.ok) setInc(i.data || []);
      if (p.ok) setAudit(p.data || []);
      if (s.ok) setMode(s.data?.mode || 'Docker / Process');
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const cur = inc.find((i) => i.id === sel) || inc[0];

  const handleAction = async (action) => {
    if (!cur || isActing) return;
    setIsActing(true);
    await api('POST', `/api/sentinel/incidents/${cur.id}/${action}`);
    setIsActing(false);
  };

  const resolvedList = inc.filter((i) => i.status === 'resolved');
  const openIncidents = inc.filter((i) => ['detected', 'awaiting_approval', 'recovering', 'verifying'].includes(i.status));
  const avgMttr = resolvedList.length
    ? Math.round(resolvedList.reduce((acc, curr) => acc + (curr.mttrSec || 0), 0) / resolvedList.length)
    : 0;
  const autoResolutionRate = inc.length
    ? Math.round((resolvedList.length / inc.length) * 100)
    : 100;

  const filteredAudit = audit.filter((a) => {
    if (auditFilter === 'all') return true;
    if (auditFilter === 'manual') return a.decision === 'manual_review';
    if (auditFilter === 'allow') return a.decision === 'allow' || a.decision === 'approved_by_operator';
    if (auditFilter === 'deny') return a.decision === 'deny' || a.decision === 'rejected_by_operator';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Platform Header & System Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-ink">Incident control plane</h2>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            </div>
            <p className="text-xs text-slate-400">Automated diagnosis, policy guardrails and self-healing recovery.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700">
            Mode: <b className="text-indigo-400">{mode || 'Container Recovery'}</b>
          </span>
          <button
            onClick={() => setShowPolicyModal(!showPolicyModal)}
            className="px-2.5 py-1 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800 hover:bg-indigo-900 transition flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Active Guardrails (policies.json)
          </button>
        </div>
      </div>

      {/* Observability Telemetry Cards (Datadog Watchdog / Dynatrace Davis style) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Incidents</div>
          <div className="text-2xl font-bold text-ink mt-1">{inc.length}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span className="text-slate-400">All sessions tracked</span>
          </div>
          <div className="absolute right-3 top-3 text-slate-700">
            <svg className="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Remediations</div>
          <div className="text-2xl font-bold text-amber-400 mt-1 flex items-center gap-2">
            {openIncidents.length}
            {openIncidents.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {openIncidents.some(i => i.status === 'awaiting_approval') ? 'Approval required' : 'In automatic loop'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Auto-Resolution Rate</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{autoResolutionRate}%</div>
          <div className="text-[11px] text-slate-500 mt-1">{resolvedList.length} successfully closed</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Mean Time to Recover</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{avgMttr > 0 ? `${avgMttr}s` : '< 12s'}</div>
          <div className="text-[11px] text-slate-500 mt-1">From detection to verified health</div>
        </div>

        <div className="col-span-2 lg:col-span-1 p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Correlation Noise Reduction</div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">66.7%</div>
          <div className="text-[11px] text-slate-500 mt-1">Downstream alerts suppressed</div>
        </div>
      </div>

      {/* Main Incident Command Section */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left Column: Real-time Incident Feed */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              Incident Stream ({inc.length})
            </h3>
            <span className="text-[11px] text-slate-500">Auto-refresh 1.5s</span>
          </div>

          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
            {!inc.length ? (
              <div className="p-8 text-center rounded-xl bg-slate-900/50 border border-dashed border-slate-800">
                <svg className="w-10 h-10 mx-auto text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm font-medium text-slate-400">Zero active failures</div>
                <div className="text-xs text-slate-500 mt-1">System healthy. Go to the System tab to inject chaos.</div>
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
                      isSelected
                        ? 'bg-slate-900 border-indigo-500 shadow-md ring-1 ring-indigo-500/30'
                        : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
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
                      <span className="text-xs font-normal px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase font-mono">
                        {i.severity}
                      </span>
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

        {/* Right Column: AI Root-Cause Diagnostic & Remediation Console (Dynatrace Davis / Datadog Watchdog style) */}
        <div className="lg:col-span-8">
          {!cur ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800 h-full flex flex-col items-center justify-center">
              <svg className="w-12 h-12 text-slate-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h4 className="text-slate-300 font-medium">No Incident Selected</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Select an incident from the stream or inject a fault from the System tab to trigger diagnosis.
              </p>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
              {/* Incident Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 text-xs font-mono rounded bg-indigo-950 text-indigo-300 border border-indigo-800/70">
                      INCIDENT #{cur.id}
                    </span>
                    <h3 className="text-lg font-bold text-ink">{cur.service}</h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    {cur.detail} · Detected at {new Date(cur.createdAt).toLocaleTimeString()} · Severity:{' '}
                    <span className="uppercase text-slate-300 font-mono font-medium">{cur.severity}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 text-xs font-medium rounded-full border flex items-center gap-1.5 ${STATUS_STYLES[cur.status]?.bg}`}>
                    <span className={`w-2 h-2 rounded-full ${STATUS_STYLES[cur.status]?.dot}`} />
                    {STATUS_STYLES[cur.status]?.label}
                  </span>
                </div>
              </div>

              {/* HUMAN-IN-THE-LOOP GUARDRAIL APPROVAL CARD */}
              {cur.status === 'awaiting_approval' && (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/40 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-amber-200">Critical Service Policy Guardrail Triggered</h4>
                      <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                        Rule <b>R5 (criticalRequiresApproval: true)</b> is active. Because <b>{cur.service}</b> directly handles financial
                        transactions, automated restarts require manual sign-off to ensure transactional safety.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-amber-800/40">
                    <button
                      onClick={() => handleAction('reject')}
                      disabled={isActing}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    >
                      Decline Action (Escalate)
                    </button>
                    <button
                      onClick={() => handleAction('approve')}
                      disabled={isActing}
                      className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950 transition flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      Authorize & Execute Remediation ({cur.diagnosis?.recommendedAction || 'restart'})
                    </button>
                  </div>
                </div>
              )}

              {/* Davis AI Causal Root-Cause Analysis Panel */}
              {cur.diagnosis && (
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Davis AI Causal Diagnosis
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      Contract: {cur.diagnosis.source || 'ai-engine:4002'}
                    </span>
                  </div>

                  <div className="bg-slate-900/90 rounded-lg p-3.5 border border-slate-800/80">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-400">Identified Root Cause:</div>
                        <div className="text-sm font-bold text-ink mt-0.5">{cur.diagnosis.rootCause}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-slate-400">Confidence</div>
                        <div className="text-sm font-mono font-bold text-indigo-400">
                          {Math.round(cur.diagnosis.confidence * 100)}%
                        </div>
                      </div>
                    </div>

                    {/* Visual Confidence Bar */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(cur.diagnosis.confidence * 100)}%` }}
                      />
                    </div>

                    <p className="text-xs text-slate-300 mt-3 leading-relaxed bg-slate-950/60 p-2.5 rounded border border-slate-800/60 font-sans">
                      {cur.diagnosis.explanation}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs">
                      <span className="text-slate-400">Prescribed Remediation:</span>
                      <div className="font-mono font-semibold text-emerald-400 mt-0.5 uppercase">
                        {cur.diagnosis.recommendedAction}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs">
                      <span className="text-slate-400">Dependencies Evaluated:</span>
                      <div className="font-mono text-slate-300 mt-0.5">
                        {cur.diagnosis.dependenciesChecked?.length
                          ? cur.diagnosis.dependenciesChecked.join(', ')
                          : 'Zero upstream failures (Isolated Root)'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 6-Stage Sentinel Loop Lifecycle Stepper */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Closed-Loop Autonomous Progression
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
                  {[
                    { key: 'detect', label: '1. Detect', active: true },
                    { key: 'correlate', label: '2. Correlate', active: true },
                    { key: 'diagnose', label: '3. AI Diagnose', active: Boolean(cur.diagnosis) },
                    { key: 'policy', label: '4. Policy Gate', active: cur.status !== 'detected' },
                    { key: 'recover', label: '5. Remediate', active: ['recovering', 'verifying', 'resolved'].includes(cur.status) },
                    { key: 'verify', label: '6. Verify', active: ['verifying', 'resolved'].includes(cur.status) },
                  ].map((step, idx) => (
                    <div
                      key={step.key}
                      className={`p-2.5 rounded-lg border font-medium transition ${
                        step.active
                          ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
                          : 'bg-slate-950/40 border-slate-800 text-slate-600'
                      }`}
                    >
                      {step.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Chronological Incident Timeline */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Audit Timeline ({cur.timeline?.length || 0} events)
                </h4>

                <div className="relative pl-6 border-l-2 border-slate-800 space-y-4 ml-2 max-h-56 overflow-y-auto">
                  {cur.timeline?.map((ev, idx) => (
                    <div key={idx} className="relative group">
                      <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-indigo-500 group-hover:scale-125 transition" />
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink">
                          {EVENT_LABELS[ev.event] || ev.event}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {new Date(ev.t).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{ev.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Policy-as-Code Audit Ledger (Sedai / OPA Style) */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Policy Guardrail Decision Ledger ({audit.length} records)
            </h3>
            <p className="text-xs text-slate-500">Immutable ledger tracking every AI recommendation evaluated against policies.json</p>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {['all', 'allow', 'manual', 'deny'].map((filt) => (
              <button
                key={filt}
                onClick={() => setAuditFilter(filt)}
                className={`px-3 py-1 rounded-lg capitalize transition ${
                  auditFilter === filt
                    ? 'bg-indigo-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-ink'
                }`}
              >
                {filt}
              </button>
            ))}
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
              {!filteredAudit.length ? (
                <tr>
                  <td colSpan="7" className="py-6 text-center text-slate-500 italic">
                    No matching policy audit decisions recorded yet.
                  </td>
                </tr>
              ) : (
                filteredAudit.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {new Date(a.at).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {a.incidentId ? `#${a.incidentId}` : 'manual'}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-ink whitespace-nowrap">
                      {a.service}
                    </td>
                    <td className="py-2.5 px-3 font-mono uppercase text-indigo-400">
                      {a.action}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase border ${DECISION_STYLES[a.decision] || 'text-slate-400'}`}>
                        {a.decision.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {a.rule}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {a.reason}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Policy-as-Code Modal Inspector */}
      {showPolicyModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Active Policy Configuration (policies.json)
              </h3>
              <button
                onClick={() => setShowPolicyModal(false)}
                className="text-slate-400 hover:text-ink p-1 rounded-lg"
              >
                ✕
              </button>
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
            <button
              onClick={() => setShowPolicyModal(false)}
              className="w-full py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}
    </div>
  );
}