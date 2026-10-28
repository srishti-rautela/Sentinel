# Team guide: who explains what (30 Oct meeting)

The system is one loop. Each member owns one stage and can run it, show its code, and answer questions on it.

```
 shop traffic -> [1 Microservices] -> metrics/health -> [3 Monitoring] -> [4 Incident Mgr + AI] -> [2 Policy Engine] -> recover -> verify -> [Dashboard]
     Vikas              Vikas             Vishwajeet          Srishti                Bhawana         Srishti          Bhawana
```

## Vikas: Microservices (the monitored application)
**Files:** `services/api-gateway|auth|product|cart|order|payment|notification`, `common/base.js`, `common/chaos.js`, `Dockerfile`
**Say in 1 minute:** "We built a 7-service e-commerce app as the workload. Order calls auth, cart, product, payment and notification. Every service exposes `/health` and `/metrics`, and has failure-injection endpoints so we can break it on demand."
**Demo:** shop -> checkout; show that payment failure rolls back stock, but notification failure does not break the order.
**Likely questions:** Why in-memory data? (Kept simple for Implementation-1; MongoDB joins when incidents/audit need storage.) How do services talk? (REST via `common/http.js` with a 3 s timeout.) Why a gateway? (Single entry point, routing, and the aggregated health view.)

## Vishwajeet: Containers, Kubernetes and Monitoring
**Files:** `docker-compose.yml`, `Dockerfile`, `k8s/sentinel-services.yaml`, `prometheus/prometheus.yml`, `grafana/provisioning/`
**Say in 1 minute:** "One Dockerfile builds every service. Compose runs the whole system. The Kubernetes manifests add readiness/liveness probes, resource limits and a criticality label. Prometheus scrapes `/metrics` every 5 s and Grafana shows request rate, error rate, p95 latency and memory."
**Demo:** `docker compose --profile monitoring up`, open Grafana (localhost:3030, dashboard "Sentinel: Service Health"), crash a service and show the graph change.
**Likely questions:** Why `restart: "no"` in compose? (So Sentinel, not Docker, does the healing.) What do probes do? (Readiness gates traffic, liveness restarts a stuck pod.) Why are Prometheus/Grafana optional? (Laptop RAM; they run under a compose profile.)

## Srishti: Failure Detection, Incident Management, AI Diagnosis, Recovery
**Files:** `services/incident-manager/{detector,recovery,index}.js`, `services/ai-engine/app.py`
**Say in 1 minute:** "The Incident Manager polls health and metrics every 2 s. A failure must appear twice in a row before we raise an incident. We correlate through the dependency graph, so when payment fails and order shows errors, only payment gets the incident. The AI Engine returns a root cause and a recommended action. After approval the Recovery step restarts the service and verifies three healthy checks in a row."
**Demo:** crash `notification-service`, then watch the incident go detected -> diagnosed -> allowed -> recovered -> resolved in about 10 s.
**Likely questions:** Is the AI real? (Today it is a rule-based engine behind the same API the LLM/RAG version will use in Implementation-3; say so honestly.) How do you avoid false alarms? (Two consecutive checks, a minimum request count, and dependency correlation.) How does recovery work? (Docker socket restart in Docker; process restart locally; Kubernetes in Implementation-2.)

## Bhawana: Policy Engine and Dashboard
**Files:** `services/policy-engine/{index.js,policies.json}`, `frontend/src/Sentinel.jsx`, `scripts/policy-test.js`
**Say in 1 minute:** "AI must not act unchecked. Every recommended action goes through the Policy Engine, which returns allow, deny or manual_review. Rules live in `policies.json`: allowed actions, critical services need human approval in production, a cooldown of 3 actions per 5 minutes, a scale cap. Every decision is audited. The dashboard shows incidents, the timeline, the audit log and the Approve/Reject buttons."
**Demo:** crash `payment-service` (critical) -> it waits for approval -> click Approve. Then edit `policies.json` live (for example the cooldown) and repeat. Run `npm run test:policy` (8 tests).
**Likely questions:** Why not let AI act directly? (A wrong restart of a critical service is costly; New Relic's postmortem in our survey shows automation making an incident worse.) What if the Policy Engine is down? (Fail-safe: manual review.) What is the cooldown for? (Stops restart loops.)

## Everyone
Before the meeting each member should run the system, read their files once, and change one small thing (for example a threshold or a policy rule) and see the effect. That makes the explanation your own.
Be upfront if asked: the team used AI tools to scaffold the code; each member understands and can modify their module.
**Not done yet (say it before they ask):** MongoDB storage, LLM/RAG diagnosis, Kubernetes-based recovery and scaling (Implementation-2/3).
