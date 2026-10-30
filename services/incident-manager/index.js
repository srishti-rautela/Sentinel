// Incident Manager: detects failures, creates incidents and drives the pipeline
// detect -> diagnose (AI Engine) -> validate (Policy Engine) -> recover -> verify.
const { createService, listen } = require('../../common/base');
const cfg = require('../../common/config');
const { call } = require('../../common/http');
const detector = require('./detector');
const recovery = require('./recovery');

const app = createService('incident-manager');
const incidents = [];
let latest = [];
const OPEN = ['detected', 'awaiting_approval', 'recovering', 'verifying'];
const log = (i, event, summary) => i.timeline.push({ t: new Date().toISOString(), event, summary });

async function diagnose(i) {
  try {
    const r = await call(cfg.AI, '/diagnose', { method: 'POST', body: { service: i.service, anomaly: { type: i.type, detail: i.detail }, metrics: i.metrics, dependencies: i.dependencies } });
    if (r.ok) return r.data;
  } catch { /* fall through */ }
  return { rootCause: 'Unknown (AI engine unavailable)', explanation: 'Fallback rule used.', confidence: 0.5, recommendedAction: 'restart', source: 'fallback rule' };
}
async function validate(i) {
  try {
    const r = await call(cfg.POLICY, '/validate', { method: 'POST', body: { service: i.service, action: i.diagnosis.recommendedAction, severity: i.severity, environment: 'production', incidentId: i.id } });
    if (r.ok) return r.data;
  } catch { /* fall through */ }
  return { decision: 'manual_review', rule: 'fail-safe', reason: 'policy engine unreachable; defaulting to human review' };
}
async function execute(i) {
  i.status = 'recovering'; log(i, 'action_started', `Executing "${i.diagnosis.recommendedAction}" on ${i.service}`);
  try { log(i, 'action_executed', await recovery.run(i.service, i.diagnosis.recommendedAction)); detector.resetBaselines(); }
  catch (e) { i.status = 'failed'; log(i, 'action_failed', e.message); return detector.resetBaselines(); }
  i.status = 'verifying'; log(i, 'verifying', 'Checking health until 3 consecutive healthy checks');
  const v = await recovery.verify(i.service);
  if (v.ok) { i.status = 'resolved'; i.resolvedAt = new Date().toISOString(); i.mttrSec = Math.round((Date.now() - Date.parse(i.createdAt)) / 1000); log(i, 'resolved', `${i.service} is healthy again (verified in ${v.seconds}s). Incident closed, MTTR ${i.mttrSec}s`); }
  else { i.status = 'failed'; log(i, 'verification_failed', 'Service did not become healthy; escalate to a human'); }
  detector.resetBaselines();
}
async function handle(i) {
  log(i, 'detected', `${i.type}: ${i.detail}`);
  i.diagnosis = await diagnose(i);
  log(i, 'diagnosed', `${i.diagnosis.rootCause} (confidence ${Math.round(i.diagnosis.confidence * 100)}%). Recommended: ${i.diagnosis.recommendedAction}`);
  i.policy = await validate(i);
  log(i, 'policy_decision', `${i.policy.decision.toUpperCase()} [${i.policy.rule}]: ${i.policy.reason}`);
  if (i.policy.decision === 'allow') return execute(i);
  if (i.policy.decision === 'manual_review') { i.status = 'awaiting_approval'; return log(i, 'approval_requested', 'Waiting for an operator to approve or reject'); }
  i.status = 'blocked'; log(i, 'blocked', 'Policy denied the action; human intervention required');
}
async function tick() {
  try {
    const { samples, roots } = await detector.scan();
    latest = samples;
    for (const r of roots) {
      const isOpen = (svc) => incidents.some((x) => x.service === svc && OPEN.includes(x.status));
      if (isOpen(r.service) || r.dependencies.some(isOpen)) continue; // already handled, or a symptom of an open incident upstream
      const i = { id: incidents.length + 1, service: r.service, type: r.type, severity: r.severity, detail: r.detail, metrics: r.metrics, dependencies: r.dependencies, status: 'detected', createdAt: new Date().toISOString(), timeline: [] };
      incidents.push(i); handle(i).catch((e) => { i.status = 'failed'; log(i, 'error', e.message); });
    }
  } catch (e) { console.error('scan failed', e.message); }
}
setInterval(tick, 2000);

app.get('/incidents', (req, res) => res.json([...incidents].reverse()));
app.get('/incidents/:id', (req, res) => { const i = incidents.find((x) => x.id === Number(req.params.id)); i ? res.json(i) : res.status(404).json({ error: 'not found' }); });
app.get('/status', (req, res) => res.json({ mode: recovery.mode(), services: latest, open: incidents.filter((x) => OPEN.includes(x.status)).length }));
app.post('/incidents/:id/approve', (req, res) => {
  const i = incidents.find((x) => x.id === Number(req.params.id));
  if (!i || i.status !== 'awaiting_approval') return res.status(409).json({ error: 'incident is not awaiting approval' });
  log(i, 'approved', 'Operator approved the action');
  call(cfg.POLICY, '/log', { method: 'POST', body: { incidentId: i.id, service: i.service, action: i.diagnosis.recommendedAction, decision: 'approved_by_operator', reason: 'manual approval' } }).catch(() => {});
  execute(i); res.status(202).json({ ok: true });
});
app.post('/incidents/:id/reject', (req, res) => {
  const i = incidents.find((x) => x.id === Number(req.params.id));
  if (!i || i.status !== 'awaiting_approval') return res.status(409).json({ error: 'incident is not awaiting approval' });
  i.status = 'rejected'; log(i, 'rejected', 'Operator rejected the action');
  call(cfg.POLICY, '/log', { method: 'POST', body: { incidentId: i.id, service: i.service, action: i.diagnosis.recommendedAction, decision: 'rejected_by_operator', reason: 'manual rejection' } }).catch(() => {});
  res.json({ ok: true });
});
listen(app, 'incident-manager', 4001);
