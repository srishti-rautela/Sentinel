// Policy Engine: validates AI-recommended recovery actions BEFORE they are executed.
// Rules are data (policies.json), re-read on every request, so they can be edited live.
const fs = require('fs');
const path = require('path');
const { createService, listen } = require('../../common/base');

const app = createService('policy-engine');
const audit = [];
const load = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'policies.json'), 'utf8'));

function evaluate({ service, action, severity = 'medium', environment = 'production', replicas, incidentId }) {
  const P = load();
  const criticality = P.services[service] || 'unknown';
  let decision, rule, reason;
  const now = Date.now();
  const recent = audit.filter((a) => a.service === service && a.action === action && ['allow', 'manual_review'].includes(a.decision) && now - a.ts < P.cooldown.windowSec * 1000);

  if (!P.allowedActions.includes(action)) { decision = 'deny'; rule = 'R1 allowed-actions'; reason = `action "${action}" is not in the allowed list (${P.allowedActions.join(', ')})`; }
  else if (criticality === 'unknown') { decision = 'manual_review'; rule = 'R2 unknown-service'; reason = 'service is not registered in the policy registry (fail-safe)'; }
  else if (recent.length >= P.cooldown.maxActions) { decision = 'deny'; rule = 'R3 cooldown'; reason = `${recent.length} "${action}" actions on ${service} in the last ${P.cooldown.windowSec / 60} min (limit ${P.cooldown.maxActions}); repeated recovery is not fixing it, escalate to a human`; }
  else if (action === 'scale' && replicas > P.scale.maxReplicas) { decision = 'deny'; rule = 'R4 scale-cap'; reason = `requested ${replicas} replicas exceeds the maximum of ${P.scale.maxReplicas}`; }
  else if (criticality === 'critical' && P.environments[environment]?.criticalRequiresApproval) { decision = 'manual_review'; rule = 'R5 critical-approval'; reason = `${service} is critical in ${environment}; a human must approve ${action}`; }
  else { decision = 'allow'; rule = 'R6 default-allow'; reason = `${action} on ${criticality} service ${service} is permitted`; }

  const entry = { id: audit.length + 1, ts: now, at: new Date(now).toISOString(), service, action, severity, environment, criticality, decision, rule, reason, incidentId: incidentId ?? null };
  audit.push(entry); if (audit.length > 200) audit.shift();
  return entry;
}

app.post('/validate', (req, res) => {
  const { service, action } = req.body || {};
  if (!service || !action) return res.status(400).json({ error: 'service and action required' });
  res.json(evaluate(req.body));
});
// operators' decisions (approve/reject) are recorded in the same audit trail
app.post('/log', (req, res) => {
  const { incidentId, service, action, decision, reason } = req.body || {};
  const e = { id: audit.length + 1, ts: Date.now(), at: new Date().toISOString(), service, action, severity: '-', environment: '-', criticality: load().services[service] || 'unknown', decision, rule: 'operator', reason: reason || '', incidentId: incidentId ?? null };
  audit.push(e); res.status(201).json(e);
});
app.get('/audit', (req, res) => res.json([...audit].reverse().slice(0, 50)));
app.get('/policies', (req, res) => res.json(load()));
app.post('/audit/reset', (req, res) => { audit.length = 0; res.json({ reset: true }); });
listen(app, 'policy-engine', 4003);
