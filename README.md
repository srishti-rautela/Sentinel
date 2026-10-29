# Sentinel: Implementation-1

A 7-service sample e-commerce app **plus a working first version of the Sentinel loop**: detect -> AI diagnosis -> policy check -> recover -> verify, with a dashboard.
Sentinel never reads business logic. It only needs `/health`, `/metrics` and a container, so the same loop works for any containerized app — the shop below is just today's **demo target**, not part of Sentinel itself.
Who explains what: see `docs/TEAM_GUIDE.md`.

## Two separate frontends, on purpose
| App | Folder | Port | What it is |
|---|---|---|---|
| **Shop** | `frontend/` | 8080 (Docker) / 5173 (dev) | A plain e-commerce storefront. No ops tooling, no incident/policy UI — just Store + Orders. |
| **Sentinel Console** | `sentinel-console/` | 8090 (Docker) / 5174 (dev) | A standalone operations console: live health of every monitored target, fault injection, the incident command center and the policy guardrail ledger. Built to point at **any** Sentinel-monitored app, not only this shop. |

Both talk to the same `api-gateway` (`/system/*` for health + chaos, `/api/sentinel/*` + `/api/policy/*` for incidents + policy) — they're two independent single-page apps, each with its own `package.json`, `Dockerfile` and `nginx.conf`, so either can be built, deployed, scaled or swapped out without touching the other. The shop's header has a small "Open monitored app" / status link out to the console instead of embedding it as a tab.

## Architecture
```
React shop (8080 / 3000) -> api-gateway (3000) -> auth (3001)  product (3002)  cart (3004)
                                                   order (3003) -> cart, product, payment (3005), notification (3006)

Sentinel Console (8090) ----^ (same api-gateway: /system/*, /api/sentinel/*, /api/policy/*)
```
| Service | Role | Criticality |
|---|---|---|
| api-gateway | single entry point `/api/*`, aggregated `/system/health` | critical |
| auth-service | register, login (JWT), verify | critical |
| order-service | checkout orchestration (cart, stock, payment, notify) | critical |
| payment-service | simulated payments (amount over 50,000 declined) | critical |
| product-service | catalogue + stock reserve/release | non-critical |
| cart-service | per-user cart | non-critical |
| notification-service | simulated email/SMS | non-critical |

Every service exposes `GET /health` (probes), `GET /metrics` (Prometheus: request count, latency, CPU, memory) and `POST /chaos/{crash,slow,errors,leak,unhealthy,reset}` (failure injection for demos).
Checkout flow: reserve stock -> charge payment -> save order -> notify -> clear cart. If payment fails, stock is rolled back. If notification fails, the order still succeeds.


### Sentinel core components
| Component | Role | Port |
|---|---|---|
| incident-manager | polls health + metrics, detects failures, correlates by dependency, runs the pipeline, restarts + verifies | 4001 |
| ai-engine (Python) | root-cause analysis and recommended action (rule-based now; LLM/RAG in Implementation-3) | 4002 |
| policy-engine | allow / deny / manual_review from `policies.json`, cooldown, audit log | 4003 |
| Sentinel Console (React, standalone app) | monitored-target health, fault injection, incidents, timeline, approvals, policy audit table | own app, `sentinel-console/`, port 8090 |

## Run option A: Docker (recommended)
```
docker compose up --build
```
Open **http://localhost:8080** for the shop and **http://localhost:8090** for the Sentinel Console. Optional monitoring: `docker compose --profile monitoring up --build` -> Grafana at http://localhost:3030 (dashboard "Sentinel: Service Health"), Prometheus at http://localhost:9090.
Business services have `restart: "no"` on purpose: a crashed service stays down until **Sentinel** detects it, asks the Policy Engine, and restarts it (through the Docker socket mounted into incident-manager).
If a service stays down and Sentinel does not heal it, run `docker compose restart <service>` and tell me the logs of `incident-manager`.
Stop with Ctrl+C, then `docker compose down`.

## Run option B: without Docker (Node 18+; Python 3 optional for the AI engine)
```
npm run install:all
npm run build:frontend
npm run build:sentinel-console   # optional: builds the console to sentinel-console/dist,
                                  # served by api-gateway at /console
npm run start:all
```
Open **http://localhost:3000** for the shop, and **http://localhost:3000/console** for the Sentinel Console (or run `npm run dev:sentinel-console` for a live-reloading dev server on http://localhost:5174). Here Sentinel restarts crashed services as local processes. Without Python, Sentinel uses its built-in fallback rules.

## Verify (services running)
- `node scripts/smoke.js` (or `npm test`): 12 checks on the shop and failure behaviour
- `npm run test:policy`: 8 Policy Engine cases
- `npm run test:heal`: end-to-end self-healing (crashes 3 services, approves one; about 1 minute)
- `npm run traffic`: background shop traffic (needed to detect error-rate / latency failures)

## Demo script for 30 Oct (about 8 minutes)
1. Problem + architecture slide (use `docs/TEAM_GUIDE.md` for who presents what).
2. Shop (http://localhost:8080): sign in, checkout, see the notification. (Vikas)
3. Sentinel Console (http://localhost:8090), "Monitored Targets" section: 7 green cards; Grafana dashboard if monitoring is on. (Vishwajeet)
4. Select **notification-service** -> Crash. Watch the pipeline strip and **Incident Command** section: incident detected, diagnosed, policy ALLOW, restarted, verified in about 10 s. (Srishti)
5. Select **payment-service** -> Crash. Policy says MANUAL_REVIEW (critical). Checkout fails cleanly meanwhile. Click **Approve**; it recovers and checkout works again. (Bhawana)
6. Show the policy audit table and `policies.json`; run `npm run test:policy`. (Bhawana)
7. Run `npm run traffic`, then inject **100% errors** on cart-service: Sentinel detects it from metrics. Only cart-service gets an incident, not order-service or the gateway (dependency correlation). (Srishti)
8. Close: done vs next (MongoDB, LLM/RAG, Kubernetes recovery).

## Kubernetes preview (Implementation-2)
`k8s/sentinel-services.yaml`: Deployments, Services, probes, limits, `sentinel/criticality` label, Prometheus annotations for the 7 business services. Not yet tested on a cluster; the Sentinel components still need manifests and RBAC for pod restarts.

## Honest status
Done: microservices, shop UI, Docker, detection, rule-based diagnosis, Policy Engine, recovery + verification, dashboard.
Not yet: MongoDB (everything is in memory), LLM/RAG diagnosis, Kubernetes-based recovery/scaling, Jaeger tracing.
